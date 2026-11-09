/** What kind of preview a file gets, from its MIME type or name. Pure, tested. */
export type FileKind = "image" | "audio" | "video" | "pdf" | "html" | "markdown" | "text" | "zip" | "other";

const TEXT_EXT = /\.(txt|log|csv|tsv|json|xml|ya?ml|toml|ini|js|jsx|ts|tsx|py|rb|go|rs|java|kt|c|h|cpp|cs|css|scss|sql|sh|ps1|bat|srt|vtt)$/i;

export function fileKind(name: string, mime = ""): FileKind {
  const m = mime.toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/.test(n)) return "image";
  if (m.startsWith("audio/") || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/.test(n)) return "audio";
  if (m.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/.test(n)) return "video";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m === "text/html" || /\.html?$/.test(n)) return "html";
  if (m === "text/markdown" || /\.(md|markdown)$/.test(n)) return "markdown";
  if (m === "application/zip" || m === "application/x-zip-compressed" || n.endsWith(".zip")) return "zip";
  if (m.startsWith("text/") || m === "application/json" || TEXT_EXT.test(n)) return "text";
  return "other";
}

/** The note a kept file becomes: a picture shows as one, anything else as a named link. */
export function fileNoteContent(name: string, url: string, mime = ""): string {
  return fileKind(name, mime) === "image" ? `[image] ${url}` : `📎 ${name}\n${url}`;
}

/** The file a kept-file note points to ("📎 name" then its link), or null. */
export function noteFile(content: string): { name: string; url: string } | null {
  const m = /^📎 (.+)\n(https:\/\/\S+)/m.exec(content);
  return m ? { name: m[1].trim(), url: m[2] } : null;
}
