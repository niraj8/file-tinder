/** Building the card queue from one or more folders. */
import { readdir, lstat } from "node:fs/promises";
import { basename, join } from "node:path";
import { orderFiles, readQuarantineAgent, readWhereFrom, type Order } from "./metadata";
import { siblingsOf } from "./siblings";
import { kindOf, type Kind } from "./kinds";

/** A file named in a sibling list: enough to show it and to say where it lives. */
export interface SiblingRecord {
  readonly path: string;
  readonly name: string;
  readonly size: number;
  /** Absolute path of the folder holding it. */
  readonly folder: string;
}

/** One card: a file, its timestamps, its provenance, and its look-alikes. */
export interface FileRecord {
  /** Absolute path. The file's identity everywhere: two folders can share a filename. */
  readonly path: string;
  readonly name: string;
  /** Absolute path of the folder it came from. */
  readonly folder: string;
  readonly size: number;
  /** Unix seconds. */
  readonly mtime: number;
  readonly atime: number;
  readonly kind: Kind;
  readonly whereFrom: string[];
  readonly quarantine: string | null;
  readonly siblings: SiblingRecord[];
}

/** The entries in `folder` that are eligible to become cards. */
async function candidatesIn(folder: string) {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  return entries.filter(
    (entry) => entry.isFile() && !entry.isSymbolicLink() && !entry.name.startsWith("."),
  );
}

/** Every eligible file across every folder, named but not yet described. */
async function candidatePaths(folders: readonly string[]): Promise<SiblingRecord[]> {
  const perFolder = await Promise.all(
    folders.map(async (folder) =>
      (await candidatesIn(folder)).map((entry) => ({
        path: join(folder, entry.name),
        name: entry.name,
        folder,
        size: 0,
      })),
    ),
  );
  return perFolder.flat();
}

/** Fill in the sizes a sibling list displays. */
async function withSizes(files: readonly SiblingRecord[]): Promise<SiblingRecord[]> {
  return Promise.all(
    files.map(async (file) => ({
      ...file,
      size: await lstat(file.path).then((stats) => stats.size, () => 0),
    })),
  );
}

/**
 * Recompute one file's siblings against what is on disk right now, across every folder
 * being triaged. Used after a rename, where the whole queue's sibling lists go stale but
 * only the visible card is worth putting right.
 */
export async function siblingsFor(
  folders: readonly string[],
  path: string,
): Promise<SiblingRecord[]> {
  const candidates = await candidatePaths(folders);
  const self = { path, name: basename(path), folder: "", size: 0 };
  return withSizes(siblingsOf(self, candidates));
}

/**
 * Build the card queue: top-level regular files only — no recursion, no dotfiles, no
 * symlinks, and no filtering of any kind beyond that. Deciding what deserves to live
 * is the user's job, not the tool's.
 *
 * Several folders make one queue rather than one queue each, and the ordering runs
 * across all of them: a folder is something a card tells you, not somewhere it sits.
 */
export async function scanFolders(
  folders: readonly string[],
  order: Order,
): Promise<FileRecord[]> {
  const candidates = await candidatePaths(folders);

  const files = await Promise.all(
    candidates.map(async (candidate) => {
      const [stats, whereFrom, quarantine] = await Promise.all([
        lstat(candidate.path),
        readWhereFrom(candidate.path),
        readQuarantineAgent(candidate.path),
      ]);
      return {
        path: candidate.path,
        name: candidate.name,
        folder: candidate.folder,
        size: stats.size,
        mtime: Math.floor(stats.mtimeMs / 1000),
        atime: Math.floor(stats.atimeMs / 1000),
        kind: kindOf(candidate.name),
        whereFrom,
        quarantine,
      };
    }),
  );

  const withSiblings = files.map((file) => ({
    ...file,
    siblings: siblingsOf(file, files).map(({ path, name, folder, size }) =>
      ({ path, name, folder, size })),
  }));

  return orderFiles(withSiblings, order);
}
