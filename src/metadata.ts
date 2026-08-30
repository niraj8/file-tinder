/**
 * Provenance metadata for a downloaded file, read from extended attributes.
 *
 * Note `mdls -name kMDItemWhereFroms` reports `(null)` even when the data is present —
 * the attribute has to be read and decoded as a binary plist instead.
 */

/** The order cards are presented in. */
export type Order = "size" | "mtime" | "name";

/**
 * The app that downloaded a file, from the `com.apple.quarantine` attribute: field 2
 * of a semicolon-delimited string such as `0281;6a7ce6e5;Chrome;5EDB01E5-…`.
 */
export function parseQuarantineAgent(raw: string): string | null {
  const agent = raw.split(";")[2]?.trim();
  return agent ? agent : null;
}

async function readTextAttribute(path: string, attribute: string): Promise<string | null> {
  return readAttribute(path, attribute, false);
}

async function readHexAttribute(path: string, attribute: string): Promise<string | null> {
  return readAttribute(path, attribute, true);
}

async function readAttribute(path: string, attribute: string, asHex: boolean): Promise<string | null> {
  const proc = Bun.spawn(["xattr", asHex ? "-px" : "-p", attribute, path], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  if (exitCode !== 0) return null;
  const value = stdout.trim();
  return value === "" ? null : value;
}

/**
 * URLs a file was downloaded from, typically `[downloadUrl, referrerUrl]`. Empty when
 * the attribute is absent or unreadable — provenance is best-effort, and a card
 * without it is still a usable card.
 */
export async function readWhereFrom(path: string): Promise<string[]> {
  const hex = await readHexAttribute(path, "com.apple.metadata:kMDItemWhereFroms");
  if (hex === null) return [];
  try {
    const bytes = Buffer.from(hex.replace(/\s+/g, ""), "hex");
    const proc = Bun.spawn(["plutil", "-convert", "json", "-o", "-", "-"], {
      stdin: bytes, stdout: "pipe", stderr: "ignore",
    });
    const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    if (exitCode !== 0) return [];
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry !== "");
  } catch {
    return [];
  }
}

/** The app that downloaded a file, or null if it carries no quarantine attribute. */
export async function readQuarantineAgent(path: string): Promise<string | null> {
  const raw = await readTextAttribute(path, "com.apple.quarantine");
  return raw === null ? null : parseQuarantineAgent(raw);
}

/** The minimum a file needs to be ordered. */
interface Orderable {
  readonly name: string;
  readonly size: number;
  readonly mtime: number;
}

/** Largest first, oldest first, or alphabetical. Returns a new array. */
export function orderFiles<T extends Orderable>(files: readonly T[], order: Order): T[] {
  const sorted = [...files];
  switch (order) {
    case "size":  return sorted.sort((a, b) => b.size - a.size);
    case "mtime": return sorted.sort((a, b) => a.mtime - b.mtime);
    case "name":  return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
}
