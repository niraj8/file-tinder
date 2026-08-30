/** Resolving user-supplied filenames against the folder being triaged. */
import { resolve, sep } from "node:path";

/**
 * Resolve a user-supplied name against the target folder, refusing anything that
 * escapes it or reaches into a subdirectory. Returns null rather than throwing, so
 * every caller has to handle the refusal.
 */
export function resolveInFolder(folder: string, name: string): string | null {
  if (name === "" || name.includes("\0")) return null;
  const root = resolve(folder);
  const path = resolve(root, name);
  return path.startsWith(root + sep) && !path.slice(root.length + 1).includes(sep) ? path : null;
}
