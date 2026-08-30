/** How a file should be previewed in the browser. */
export type Kind = "image" | "heic" | "video" | "audio" | "pdf" | "text" | "archive" | "opaque";

/**
 * Extensions per preview kind. HEIC is deliberately separate from `image`: Chrome
 * cannot decode it, so it has to be converted before it can be shown.
 */
const BY_KIND: Record<Exclude<Kind, "opaque">, readonly string[]> = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"],
  heic: ["heic", "heif"],
  video: ["mp4", "mov", "m4v", "webm", "mkv", "avi"],
  audio: ["mp3", "m4a", "wav", "aac", "flac", "ogg"],
  pdf: ["pdf"],
  text: ["txt", "md", "csv", "srt", "vtt", "json", "log", "qif", "yaml", "yml", "xml"],
  archive: ["zip", "tar", "gz", "tgz"],
};

/** Extension without the dot, lowercased. Empty when there isn't one. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** Which preview a file's name says it should get. */
export function kindOf(name: string): Kind {
  const ext = extensionOf(name);
  for (const [kind, exts] of Object.entries(BY_KIND)) {
    if (exts.includes(ext)) return kind as Kind;
  }
  return "opaque";
}

/**
 * Types a browser would download rather than display. Serving them as text/plain is
 * what makes .md, .srt and .qif previewable in an iframe.
 */
const AS_PLAIN_TEXT = new Set(["md", "srt", "vtt", "qif", "csv", "log", "txt", "yaml", "yml"]);

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", avif: "image/avif",
  heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v",
  webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
  aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg",
  pdf: "application/pdf", json: "application/json", xml: "application/xml",
  zip: "application/zip", gz: "application/gzip", tar: "application/x-tar",
};

/** The Content-Type to serve a file as, chosen so the browser renders it inline. */
export function contentTypeFor(name: string): string {
  const ext = extensionOf(name);
  if (AS_PLAIN_TEXT.has(ext)) return "text/plain; charset=utf-8";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
