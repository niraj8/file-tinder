/**
 * Renaming a file in place, and the rules about what a name is allowed to be.
 *
 * Renaming is the one mutation here that can destroy data silently: `rename(2)` over an
 * existing file replaces it with no warning and no Trash entry. So every refusal below
 * is deliberate, and the collision check is by inode rather than by existence — see
 * `renameFile`.
 */
import { lstat, rename } from "node:fs/promises";
import { resolveInFolder } from "./paths";

/** macOS caps a single path component at 255 bytes. */
const NAME_LIMIT = 255;

/**
 * Why a name was refused, or null if it is fine. The string is shown to the user, so it
 * says what is wrong rather than naming a rule.
 */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "a name is required";
  if (trimmed.includes("\0")) return "a name cannot contain a null byte";
  if (trimmed.includes("/")) return "a name cannot contain /";
  if (trimmed === "." || trimmed === "..") return `${trimmed} is not a name`;
  // A dotfile drops out of the queue entirely, leaving a card on screen for a file the
  // app no longer considers in scope.
  if (trimmed.startsWith(".")) return "a leading dot would hide the file";
  if (Buffer.byteLength(trimmed) > NAME_LIMIT) return `a name cannot be longer than ${NAME_LIMIT} bytes`;
  return null;
}

export type RenameFailure = "invalid" | "unresolvable" | "vanished" | "collision";

export type RenameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: RenameFailure; readonly message: string };

const failed = (reason: RenameFailure, message: string): RenameResult =>
  ({ ok: false, reason, message });

/** The file's inode, or null if there is nothing there. */
async function inodeOf(path: string): Promise<number | null> {
  return await lstat(path).then((stats) => stats.ino, () => null);
}

/**
 * Rename `oldName` to `newName` inside `folder`. The new name is trimmed first, so the
 * returned name is what actually landed on disk.
 *
 * Renaming a file to the name it already has succeeds without touching the disk: it is
 * what you get for pressing Enter without editing anything, and refusing it would be
 * pure friction.
 */
export async function renameFile(
  folder: string,
  oldName: string,
  newName: string,
): Promise<RenameResult> {
  const invalid = validateName(newName);
  if (invalid !== null) return failed("invalid", invalid);

  const trimmed = newName.trim();
  const from = resolveInFolder(folder, oldName);
  const to = resolveInFolder(folder, trimmed);
  if (from === null || to === null) return failed("unresolvable", "that name is not allowed here");

  const fromInode = await inodeOf(from);
  if (fromInode === null) return failed("vanished", `${oldName} is no longer there`);
  if (from === to) return { ok: true, name: trimmed };

  /*
   * Not `exists(to)`: on a case-insensitive volume — the macOS default — renaming
   * `Report.pdf` to `report.pdf` resolves to a path that already "exists", because it is
   * the same file. Comparing inodes tells a case-only rename apart from a real
   * collision, and stays correct on a case-sensitive volume too.
   */
  const toInode = await inodeOf(to);
  if (toInode !== null && toInode !== fromInode) {
    return failed("collision", `${trimmed} already exists in this folder`);
  }

  try {
    await rename(from, to);
  } catch (error) {
    return failed("vanished", (error as Error).message);
  }
  return { ok: true, name: trimmed };
}
