/**
 * Moving files to the macOS Trash, and putting them back.
 *
 * Two things about this are non-obvious and were established by experiment:
 *
 *  1. `tell application "Finder" to delete` needs TCC Automation permission and fails with
 *     `Not authorised to send Apple events to Finder (-1743)` from a terminal-launched
 *     process. `NSFileManager.trashItemAtURL` via JXA needs no permission at all.
 *
 *  2. Binding a `Ref()` to that method's `resultingItemURL` out-parameter *segfaults*
 *     osascript (exit 139). The file is trashed, but the script dies before returning.
 *     So both out-parameters are passed as `$()` and the resulting path is recovered by
 *     diffing the Trash directory instead.
 */
import { readdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TRASH_DIR = join(homedir(), ".Trash");

/** Where a trashed file ended up, and how much can be promised about it. */
export interface TrashResult {
  readonly path: string;
  /**
   * False when the Trash diff was ambiguous and the original name had to be guessed.
   * Undo may fail for such a file, and the UI should say so rather than pretend.
   */
  readonly certain: boolean;
  /**
   * False when the file was moved by hand rather than trashed properly, so Finder's
   * Put Back will not work for it.
   */
  readonly putBack: boolean;
}

const TRASH_SCRIPT = `
ObjC.import('Foundation');
function run(argv) {
  const fm = $.NSFileManager.defaultManager;
  const url = $.NSURL.fileURLWithPath(argv[0]);
  if (!fm.trashItemAtURLResultingItemURLError(url, $(), $())) {
    throw new Error("trashItemAtURL returned false");
  }
}
`;

/**
 * Identify the Trash entry created by a trash operation.
 *
 * macOS renames on collision — a second `report.pdf` lands as
 * `report.pdf 14-41-57-146.pdf` — so the path cannot be predicted. When more than one
 * entry appears, something else trashed a file at the same moment; a collision rename
 * keeps the original name as a prefix, so the original name still identifies ours.
 */
export function pickTrashedPath(
  trashDir: string,
  before: readonly string[],
  after: readonly string[],
  originalName: string,
): TrashResult {
  const known = new Set(before);
  const appeared = after.filter((entry) => !known.has(entry));
  if (appeared.length === 1) {
    return { path: join(trashDir, appeared[0]!), certain: true, putBack: true };
  }

  const ours = appeared.find((entry) => entry === originalName)
    ?? appeared.find((entry) => entry.startsWith(`${originalName} `));
  if (ours !== undefined) return { path: join(trashDir, ours), certain: true, putBack: true };

  return { path: join(trashDir, originalName), certain: false, putBack: true };
}

/**
 * A free name in a directory, following Finder's convention of inserting a counter
 * before the extension: `report.pdf`, `report 2.pdf`, `report 3.pdf`.
 */
export function nextAvailableName(taken: ReadonlySet<string>, name: string): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const [stem, extension] = dot <= 0 ? [name, ""] : [name.slice(0, dot), name.slice(dot)];
  for (let counter = 2; ; counter++) {
    const candidate = `${stem} ${counter}${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Last resort when the JXA call is unavailable: move the file into the Trash directory
 * by hand. The file is out of the way, but Finder's Put Back will not work for it.
 */
export async function moveToTrashDirectly(absolutePath: string): Promise<TrashResult> {
  const name = absolutePath.slice(absolutePath.lastIndexOf("/") + 1);
  const taken = new Set(await readdir(TRASH_DIR));
  const destination = join(TRASH_DIR, nextAvailableName(taken, name));
  await rename(absolutePath, destination);
  return { path: destination, certain: true, putBack: false };
}

/**
 * Move a file to the Trash, falling back to a manual move if the system call fails.
 * Throws only when the file cannot be moved at all.
 */
export async function trashFile(absolutePath: string): Promise<TrashResult> {
  const name = absolutePath.slice(absolutePath.lastIndexOf("/") + 1);
  const before = await readdir(TRASH_DIR);

  const proc = Bun.spawn(["osascript", "-l", "JavaScript", "-e", TRASH_SCRIPT, absolutePath], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  if (exitCode === 0) {
    return pickTrashedPath(TRASH_DIR, before, await readdir(TRASH_DIR), name);
  }

  try {
    return await moveToTrashDirectly(absolutePath);
  } catch {
    throw new Error(`could not move ${name} to the Trash: ${stderr.trim() || `exit ${exitCode}`}`);
  }
}

/** Put a trashed file back where it came from. Throws if it is no longer in the Trash. */
export async function restoreFile(trashedPath: string, originalPath: string): Promise<void> {
  await rename(trashedPath, originalPath);
}
