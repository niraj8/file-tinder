/**
 * "Sibling" detection: files whose names suggest they are the same thing — a duplicate,
 * a revision, or the same content in another format.
 *
 * Deliberately a name heuristic, not a content hash. It informs the user; it never acts.
 */

/** The minimum a file needs to take part in sibling matching. */
export interface NamedFile {
  readonly name: string;
  readonly size: number;
}

/** Names longer than this are compared on their prefix only. */
const STEM_LENGTH = 28;

/**
 * Normalise a filename down to the part that identifies *what it is*, discarding
 * format, revision markers, case and punctuation.
 */
export function stemOf(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[\s_-]*\(\d+\)$/, "")
    .replace(/_filled$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, STEM_LENGTH);
}

/** Other files in the same queue that share this file's stem. */
export function siblingsOf<T extends NamedFile>(file: NamedFile, all: readonly T[]): T[] {
  const stem = stemOf(file.name);
  if (stem === "") return [];
  return all.filter((other) => other.name !== file.name && stemOf(other.name) === stem);
}
