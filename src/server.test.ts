import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir, readdir, stat } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createServer, startServer } from "./server";

let dir: string;
let server: ReturnType<typeof createServer>;
const url = (path: string) => `http://localhost:${server.port}${path}`;
/** The URL that serves a file in the triaged folder, addressed the way the app does. */
const fileUrl = (name: string) => url(`/f/${encodeURIComponent(join(dir, name))}`);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "file-tinder-srv-"));
  await writeFile(join(dir, "big.bin"), "0123456789");
  await writeFile(join(dir, "notes.md"), "# hello");
  await writeFile(join(dir, "doc.pdf"), "%PDF-1.4 fake");
  await mkdir(join(dir, "Images"));
  server = createServer({ folders: [dir], order: "name", port: 0 });
});

afterEach(async () => {
  await server.stop();
  await rm(dir, { recursive: true, force: true });
});

describe("GET /", () => {
  test("serves the app", async () => {
    const res = await fetch(url("/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<title>");
  });
});

describe("GET /api/files", () => {
  test("returns the top-level files in order", async () => {
    const files = await (await fetch(url("/api/files"))).json();
    expect(files.map((f: { name: string }) => f.name)).toEqual(["big.bin", "doc.pdf", "notes.md"]);
  });

  test("reports the folder being triaged", async () => {
    const res = await fetch(url("/api/files"));
    expect(JSON.parse(res.headers.get("x-file-tinder-folders")!)).toEqual([dir]);
  });
});

describe("GET /f/:name", () => {
  test("serves bytes inline with a usable content type", async () => {
    const res = await fetch(fileUrl("notes.md"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(await res.text()).toBe("# hello");
  });

  test("URL-encoded names round-trip", async () => {
    await writeFile(join(dir, "Amelie [Amélie Poulain].srt"), "sub");
    const res = await fetch(fileUrl("Amelie [Amélie Poulain].srt"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("sub");
  });

  test("supports range requests so video streams", async () => {
    const res = await fetch(fileUrl("big.bin"), { headers: { Range: "bytes=2-5" } });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("2345");
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  test("an open-ended range runs to the end", async () => {
    const res = await fetch(fileUrl("big.bin"), { headers: { Range: "bytes=7-" } });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("789");
  });

  test("rejects a traversal attempt", async () => {
    const res = await fetch(fileUrl("../../etc/passwd"));
    expect(res.status).toBe(404);
  });

  test("rejects a nested path", async () => {
    const res = await fetch(fileUrl("Images/nested.png"));
    expect(res.status).toBe(404);
  });

  test("404s an absent file", async () => {
    expect((await fetch(fileUrl("nope.txt"))).status).toBe(404);
  });

  test("converts HEIC to JPEG because Chrome cannot decode it", async () => {
    const png = join(dir, "seed.png");
    await Bun.write(png, Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc" +
      "0000001b4944415428cf63fccfc0f01f8a41d4c0a80100c9fe0dfa2a2a2a000000" +
      "0049454e44ae426082", "hex"));
    await Bun.$`sips -s format heic ${png} --out ${join(dir, "photo.heic")}`.quiet();
    const res = await fetch(fileUrl("photo.heic"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  });
});

describe("GET /api/archive/:name", () => {
  test("lists the entries inside a zip", async () => {
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "one.txt"), "1");
    await writeFile(join(dir, "src", "two.txt"), "2");
    await Bun.$`zip -qr ${join(dir, "bundle.zip")} src`.cwd(dir).quiet();
    const body = await (await fetch(url(`/api/archive/${encodeURIComponent(join(dir, "bundle.zip"))}`))).json();
    expect(body.entries).toContain("src/one.txt");
    expect(body.entries).toContain("src/two.txt");
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  test("404s a file that is not an archive", async () => {
    expect((await fetch(url(`/api/archive/${encodeURIComponent(join(dir, "notes.md"))}`))).status).toBe(404);
  });
});

describe("POST /api/trash and /api/restore (touches the real Trash)", () => {
  test("trashes a file and puts it back", async () => {
    const name = `__file_tinder_srv_${Date.now()}__.txt`;
    await writeFile(join(dir, name), "probe");

    const trashed = await (await fetch(url("/api/trash"), {
      method: "POST", body: JSON.stringify({ path: join(dir, name) }),
    })).json();

    expect(trashed.certain).toBe(true);
    expect(await stat(join(dir, name)).catch(() => null)).toBeNull();
    expect(await readdir(join(homedir(), ".Trash"))).toContain(name);

    const restored = await fetch(url("/api/restore"), {
      method: "POST", body: JSON.stringify({ trashedPath: trashed.path, path: join(dir, name) }),
    });
    expect(restored.status).toBe(200);
    expect((await stat(join(dir, name))).size).toBe(5);
  });

  test("refuses to trash a name outside the folder", async () => {
    const res = await fetch(url("/api/trash"), {
      method: "POST", body: JSON.stringify({ path: join(dir, "../../etc/hosts") }),
    });
    expect(res.status).toBe(404);
  });

  test("refuses to restore to a name outside the folder", async () => {
    const res = await fetch(url("/api/restore"), {
      method: "POST",
      body: JSON.stringify({ trashedPath: "/tmp/x", path: join(dir, "../../etc/hosts") }),
    });
    expect(res.status).toBe(404);
  });

  test("reports a file that vanished mid-session as gone, not as a crash", async () => {
    const res = await fetch(url("/api/trash"), {
      method: "POST", body: JSON.stringify({ path: join(dir, "vanished.txt") }),
    });
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("vanished");
  });
});

describe("startServer", () => {
  test("steps to the next free port when the preferred one is taken", async () => {
    const first = startServer({ folders: [dir], order: "name", port: 8811 });
    const second = startServer({ folders: [dir], order: "name", port: 8811 });
    expect(first.port).toBe(8811);
    expect(second.port).toBe(8812);
    await first.stop();
    await second.stop();
  });
});

describe("POST /api/quit", () => {
  test("calls the quit handler", async () => {
    let quit = false;
    const own = createServer({ folders: [dir], order: "name", port: 0 },
      { onQuit: () => { quit = true; } });
    await fetch(`http://localhost:${own.port}/api/quit`, { method: "POST" });
    expect(quit).toBe(true);
    await own.stop();
  });

  test("does not count itself as activity", async () => {
    let activity = 0;
    const own = createServer({ folders: [dir], order: "name", port: 0 },
      { onActivity: () => { activity++; } });
    await fetch(`http://localhost:${own.port}/api/quit`, { method: "POST" });
    expect(activity).toBe(0);
    await own.stop();
  });

  test("a reload reports activity, which is what cancels a pending shutdown", async () => {
    let activity = 0;
    const own = createServer({ folders: [dir], order: "name", port: 0 },
      { onActivity: () => { activity++; } });
    await fetch(`http://localhost:${own.port}/api/quit`, { method: "POST" });
    await fetch(`http://localhost:${own.port}/`);
    await fetch(`http://localhost:${own.port}/api/files`);
    expect(activity).toBe(2);
    await own.stop();
  });
});

describe("POST /api/rename", () => {
  const rename = (name: string, newName: string) =>
    fetch(url("/api/rename"),
      { method: "POST", body: JSON.stringify({ path: join(dir, name), newName }) });

  test("renames the file and returns its refreshed siblings", async () => {
    await writeFile(join(dir, "notes (1).md"), "# copy");
    const res = await rename("big.bin", "notes.bin");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("notes.bin");
    expect(body.siblings.map((s: { name: string }) => s.name).sort())
      .toEqual(["notes (1).md", "notes.md"]);
    expect((await readdir(dir)).includes("notes.bin")).toBe(true);
  });

  test("409 on a collision, leaving both files alone", async () => {
    const res = await rename("big.bin", "notes.md");
    expect(res.status).toBe(409);
    expect(await Bun.file(join(dir, "notes.md")).text()).toBe("# hello");
    expect((await readdir(dir)).includes("big.bin")).toBe(true);
  });

  test("422 on an invalid name", async () => {
    expect((await rename("big.bin", ".hidden")).status).toBe(422);
    expect((await rename("big.bin", "  ")).status).toBe(422);
  });

  test("410 when the file is already gone", async () => {
    expect((await rename("ghost.bin", "new.bin")).status).toBe(410);
  });

  test("404 without a new name", async () => {
    const res = await fetch(url("/api/rename"), {
      method: "POST", body: JSON.stringify({ path: join(dir, "big.bin") }),
    });
    expect(res.status).toBe(404);
  });

  test("refuses to reach out of the folder", async () => {
    expect((await rename("big.bin", "../escaped.bin")).status).toBe(422);
    // An unresolvable source is 404 rather than 410: it never named a file here at all.
    expect((await rename("../outside.bin", "new.bin")).status).toBe(404);
  });
});
