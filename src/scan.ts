/** Building the card queue from a folder. */
import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { orderFiles, readQuarantineAgent, readWhereFrom, type Order } from "./metadata";
import { siblingsOf } from "./siblings";
import { kindOf, type Kind } from "./kinds";

/** One card: a file, its timestamps, its provenance, and its look-alikes. */
export interface FileRecord {
  readonly name: string;
  readonly size: number;
  /** Unix seconds. */
  readonly mtime: number;
  readonly atime: number;
  readonly kind: Kind;
  readonly whereFrom: string[];
  readonly quarantine: string | null;
  readonly siblings: { name: string; size: number }[];
}

/**
 * Build the card queue: top-level regular files only — no recursion, no dotfiles, no
 * symlinks, and no filtering of any kind beyond that. Deciding what deserves to live
 * is the user's job, not the tool's.
 */
export async function scanFolder(folder: string, order: Order): Promise<FileRecord[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const candidates = entries.filter(
    (entry) => entry.isFile() && !entry.isSymbolicLink() && !entry.name.startsWith("."),
  );

  const files = await Promise.all(
    candidates.map(async (entry) => {
      const path = join(folder, entry.name);
      const [stats, whereFrom, quarantine] = await Promise.all([
        lstat(path),
        readWhereFrom(path),
        readQuarantineAgent(path),
      ]);
      return {
        name: entry.name,
        size: stats.size,
        mtime: Math.floor(stats.mtimeMs / 1000),
        atime: Math.floor(stats.atimeMs / 1000),
        kind: kindOf(entry.name),
        whereFrom,
        quarantine,
      };
    }),
  );

  const withSiblings = files.map((file) => ({
    ...file,
    siblings: siblingsOf(file, files).map(({ name, size }) => ({ name, size })),
  }));

  return orderFiles(withSiblings, order);
}
