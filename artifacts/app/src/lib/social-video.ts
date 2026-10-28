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
  /** Which service read the video: apify (+ our transcript) or supadata. */
  via?: string;
}

/** The note's text: his comment, the link, the cover, the points, the transcript, the caption. */
export function socialNoteContent(n: SocialNote, comment: string): string {
  const parts: string[] = [];
  if (comment.trim()) parts.push(comment.trim());
  parts.push(n.url + (n.author ? ` (${n.author})` : ""));
  if (n.cover) parts.push(`[image] ${n.cover}`);
  if (n.points.length) parts.push(`**Key points**\n${n.points.map((p) => `- ${p}`).join("\n")}`);
  if (n.transcript) parts.push(`**Transcript**\n${n.transcript}`);
  if (n.caption && n.caption !== n.title) parts.push(`**Caption**\n${n.caption}`);
  return parts.join("\n\n");
}
