/** The local HTTP server: the app, the file bytes, and the mutations. */
import { basename, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { contentTypeFor, kindOf } from "./kinds";
import { scanFolders, siblingsFor } from "./scan";
import { trashFile, restoreFile } from "./trash";
import { renameFile, type RenameFailure } from "./rename";
import { resolveInFolders } from "./paths";
import type { Options } from "./options";

/** A running file-tinder server. */
export interface RunningServer {
  readonly port: number;
  /** Stop serving and remove any temporary files the session created. */
  stop(): Promise<void>;
}

/** Lifecycle callbacks the process uses to decide when it should stop. */
export interface ServerHooks {
  /** The browser tab reported that it is going away. */
  readonly onQuit?: () => void;
  /**
   * A request arrived. A reload looks exactly like a closed tab from the browser's
   * side, so this is what tells the difference: the reloaded page asks for something.
   */
  readonly onActivity?: () => void;
}

const APP_HTML = join(import.meta.dir, "..", "public", "index.html");
const ARCHIVE_LIMIT = 40;

/** How each rename refusal is reported, mirroring the other mutations' statuses. */
const RENAME_STATUS: Record<RenameFailure, number> = {
  invalid: 422,
  unresolvable: 404,
  vanished: 410,
  collision: 409,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}

const notFound = () => new Response("Not found", { status: 404 });

/** Parse an HTTP Range header. Only the single-range form browsers actually send. */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  const start = rawStart === "" ? size - Number(rawEnd) : Number(rawStart);
  const end = rawStart === "" || rawEnd === "" ? size - 1 : Number(rawEnd);
  if (!Number.isFinite(start) || start < 0 || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function readJsonBody(request: Request): Promise<Record<string, string>> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Start serving the app and the target folders. The returned server owns a temporary
 * directory of converted previews, which `stop` removes.
 */
export function createServer(options: Options, hooks: ServerHooks = {}): RunningServer {
  const { folders, order } = options;
  let heicCache: string | null = null;

  const heicJpeg = async (path: string): Promise<Response | null> => {
    heicCache ??= await mkdtemp(join(tmpdir(), "file-tinder-heic-"));
    const out = join(heicCache, `${Buffer.from(path).toString("hex")}.jpg`);
    if (!(await Bun.file(out).exists())) {
      const proc = Bun.spawn(["sips", "-s", "format", "jpeg", path, "--out", out],
        { stdout: "ignore", stderr: "ignore" });
      if ((await proc.exited) !== 0) return null;
    }
    return new Response(Bun.file(out), {
      headers: { "content-type": "image/jpeg", "content-disposition": "inline" },
    });
  };

  const serveFile = async (candidate: string, rangeHeader: string | null): Promise<Response> => {
    const path = resolveInFolders(folders, candidate);
    if (path === null) return notFound();

    const file = Bun.file(path);
    if (!(await file.exists())) return notFound();

    const name = basename(path);
    if (kindOf(name) === "heic") {
      const converted = await heicJpeg(path);
      if (converted) return converted;
    }

    const contentType = contentTypeFor(name);
    const range = rangeHeader ? parseRange(rangeHeader, file.size) : null;
    if (range) {
      return new Response(file.slice(range.start, range.end + 1), {
        status: 206,
        headers: {
          "content-type": contentType,
          "content-disposition": "inline",
          "accept-ranges": "bytes",
          "content-range": `bytes ${range.start}-${range.end}/${file.size}`,
        },
      });
    }
    return new Response(file, {
      headers: {
        "content-type": contentType,
        "content-disposition": "inline",
        "accept-ranges": "bytes",
      },
    });
  };

  const listArchive = async (candidate: string): Promise<Response> => {
    const path = resolveInFolders(folders, candidate);
    if (path === null || kindOf(basename(path)) !== "archive") return notFound();
    if (!(await Bun.file(path).exists())) return notFound();

    const isZip = path.toLowerCase().endsWith(".zip");
    const proc = Bun.spawn(isZip ? ["unzip", "-Z1", path] : ["tar", "-tf", path],
      { stdout: "pipe", stderr: "ignore" });
    const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    if (exitCode !== 0) return json({ entries: [], total: 0, unreadable: true });

    const all = stdout.split("\n").filter((line) => line !== "");
    return json({ entries: all.slice(0, ARCHIVE_LIMIT), total: all.length });
  };

  /** Resolve the `path` in a mutation request, or answer 404 on the caller's behalf. */
  const targetOf = async (request: Request) => {
    const body = await readJsonBody(request);
    const path = body.path ? resolveInFolders(folders, body.path) : null;
    return { body, path };
  };

  const server = Bun.serve({
    port: options.port,
    idleTimeout: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname !== "/api/quit") hooks.onActivity?.();
      const isGet = request.method === "GET";
      const isPost = request.method === "POST";

      if (isGet && (pathname === "/" || pathname === "/index.html")) {
        return new Response(Bun.file(APP_HTML), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (isGet && pathname === "/api/files") {
        return new Response(JSON.stringify(await scanFolders(folders, order)), {
          headers: {
            "content-type": "application/json",
            // JSON, not a delimiter: a header cannot hold a newline and a path can hold
            // anything else.
            "x-file-tinder-folders": JSON.stringify(folders),
          },
        });
      }

      if (isGet && pathname.startsWith("/f/")) {
        return serveFile(decodeURIComponent(pathname.slice("/f/".length)),
          request.headers.get("range"));
      }

      if (isGet && pathname.startsWith("/api/archive/")) {
        return listArchive(decodeURIComponent(pathname.slice("/api/archive/".length)));
      }

      if (isPost && pathname === "/api/trash") {
        const { path } = await targetOf(request);
        if (path === null) return notFound();
        if (!(await Bun.file(path).exists())) return json({ error: "vanished" }, 410);
        try {
          return json(await trashFile(path));
        } catch (error) {
          return json({ error: (error as Error).message }, 500);
        }
      }

      if (isPost && pathname === "/api/restore") {
        const { body, path } = await targetOf(request);
        if (path === null || !body.trashedPath) return notFound();
        try {
          await restoreFile(body.trashedPath, path);
          return json({ ok: true });
        } catch (error) {
          return json({ error: (error as Error).message }, 409);
        }
      }

      if (isPost && pathname === "/api/rename") {
        const body = await readJsonBody(request);
        if (!body.path || typeof body.newName !== "string") return notFound();
        const result = await renameFile(folders, body.path, body.newName);
        if (!result.ok) return json({ error: result.message }, RENAME_STATUS[result.reason]);
        return json({
          ok: true,
          name: result.name,
          path: result.path,
          siblings: await siblingsFor(folders, result.path),
        });
      }

      if (isPost && pathname === "/api/open") {
        const { path } = await targetOf(request);
        if (path === null) return notFound();
        Bun.spawn(["open", path], { stdout: "ignore", stderr: "ignore" });
        return json({ ok: true });
      }

      if (isPost && pathname === "/api/quit") {
        hooks.onQuit?.();
        return json({ ok: true });
      }

      return notFound();
    },
  });

  const port = server.port;
  if (port === undefined) throw new Error("the server started without a TCP port");

  return {
    port,
    async stop() {
      server.stop(true);
      if (heicCache) await rm(heicCache, { recursive: true, force: true });
    },
  };
}

/** The number of ports tried before giving up when the preferred one is taken. */
const PORT_ATTEMPTS = 20;

/**
 * Start the server on the preferred port, stepping to the next free one if it is
 * already in use.
 */
export function startServer(options: Options, hooks: ServerHooks = {}): RunningServer {
  let lastError: unknown;
  for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt++) {
    try {
      return createServer({ ...options, port: options.port + attempt }, hooks);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("no free port");
}
