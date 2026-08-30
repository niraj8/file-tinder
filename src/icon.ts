/**
 * The Finder icon for a file, rendered to a PNG.
 *
 * `NSWorkspace.iconForFile` is the icon the Finder itself shows, so a disk image looks
 * like a disk image and an installer like an installer — which is far more use than the
 * extension when the file has no preview a browser can render. Reached through JXA for
 * the same reason as the Trash: it needs no Automation permission.
 */
/**
 * Type 4 is `NSBitmapImageFileTypePNG`. The numeric form survives the AppKit enum
 * renames; the symbolic one does not.
 */
const ICON_SCRIPT = `
ObjC.import('AppKit');
function run(argv) {
  const [source, out] = argv;
  const image = $.NSWorkspace.sharedWorkspace.iconForFile(source);
  if (!image || !image.isValid) return "";
  const rep = $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
  const png = rep.representationUsingTypeProperties(4, $());
  return png.writeToFileAtomically(out, true) ? out : "";
}
`;

/**
 * Draw the icon for `path` to the PNG at `out`, and say whether it worked. A file whose
 * icon cannot be read — one AppKit is not permitted to reach, say — reports false rather
 * than throwing, and the page falls back to showing the bare extension.
 *
 * Where `out` lives, and when it may be reused, is the caller's business.
 */
export async function iconPng(path: string, out: string): Promise<boolean> {
  if (await Bun.file(out).exists()) return true;

  const proc = Bun.spawn(["osascript", "-l", "JavaScript", "-e", ICON_SCRIPT, path, out], {
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await proc.exited) !== 0) return false;
  return Bun.file(out).exists();
}
