/** Resolving user-supplied paths against the folders being triaged. */
import { dirname, resolve, sep } from "node:path";

/**
 * Resolve a user-supplied name against one folder, refusing anything that escapes it or
 * reaches into a subdirectory. Returns null rather than throwing, so every caller has to
 * handle the refusal.
 */
export function resolveInFolder(folder: string, name: string): string | null {
  if (name === "" || name.includes("\0")) return null;
  const root = resolve(folder);
  const path = resolve(root, name);
  return path.startsWith(root + sep) && !path.slice(root.length + 1).includes(sep) ? path : null;
}

/**
 * Resolve a path the client sent back, accepting it only if it names a direct child of
 * one of the folders being triaged. Traversal needs no special case: `resolve` collapses
 * `..` before the parent directory is compared.
 */
export function resolveInFolders(folders: readonly string[], candidate: string): string | null {
  if (candidate === "" || candidate.includes("\0")) return null;
  const path = resolve(candidate);
  const parent = dirname(path);
  return folders.some((folder) => resolve(folder) === parent) ? path : null;
}
