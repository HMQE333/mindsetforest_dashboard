/** A link to a reel / short / post video the social-transcript function reads. */
const SOCIAL_VIDEO = /https?:\/\/(?:www\.|m\.)?(?:instagram\.com\/(?:reel|reels|p|tv)\/[\w-]+|(?:vm\.)?tiktok\.com\/\S+|(?:x|twitter)\.com\/\w+\/status\/\d+|(?:facebook\.com\/\S*(?:reel|videos|watch)\S*|fb\.watch\/\S+)|youtube\.com\/shorts\/[\w-]+)\S*/i;

export function socialVideoUrl(text: string): string | null {
  return text.match(SOCIAL_VIDEO)?.[0].replace(/[)\].,;!?'"]+$/, "") ?? null;
}

export interface SocialNote {
  url: string;
  platform: string | null;
  author: string | null;
  title: string;
  points: string[];
  transcript: string;
  caption: string;
  cover: string | null;
  /** Seconds, when the service knows. */
  duration?: number | null;
  /** Which service read the video: apify (+ our transcript) or supadata. */
  via?: string;
}

/** The note's text: his comment, the link, the cover, the points, the transcript, the caption. */
export function socialNoteContent(n: SocialNote, comment: string): string {
  const parts: string[] = [];
  if (comment.trim()) parts.push(comment.trim());
  parts.push(n.url + (n.author ? ` (${n.author})` : "") + (n.duration ? ` · ${videoClock(n.duration)}` : ""));
  if (n.cover) parts.push(`[image] ${n.cover}`);
  if (n.points.length) parts.push(`**Key points**\n${n.points.map((p) => `- ${p}`).join("\n")}`);
  if (n.transcript) parts.push(`**Transcript**\n${n.transcript}`);
  if (n.caption && n.caption !== n.title) parts.push(`**Caption**\n${n.caption}`);
  return parts.join("\n\n");
}

/** 42 -> "0:42", 125 -> "2:05". */
export const videoClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** The duration a saved reel note wrote after its link ("… · 0:42"), or null. */
export function noteVideoDuration(content: string): string | null {
  return content.match(/^https?:\/\/\S+(?: \([^)\n]*\))? · (\d+:\d{2})$/m)?.[1] ?? null;
}

/**
 * A reel link saved from the phone or the tracker whose transcript the server
 * is still writing: no key points or transcript yet, and saved in the last
 * ten minutes (after that it is not coming).
 */
export function transcriptPending(content: string, createdAt: string, now = Date.now()): boolean {
  if (!socialVideoUrl(content) || /\*\*(?:Transcript|Key points)\*\*/.test(content)) return false;
  const age = now - Date.parse(createdAt);
  return age >= 0 && age < 10 * 60_000;
}
