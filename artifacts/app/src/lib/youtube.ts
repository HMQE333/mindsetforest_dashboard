/**
 * YouTube links and the [mm:ss] marks in video summaries. The same id rules
 * as the ai-video-summary function, so a row is found by the link it was
 * made from, whatever form that link takes.
 */

/** The 11-character video id from any YouTube link form; null for anything else. */
export function youtubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "music.youtube.com") {
      id = u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
      if (!id && m) id = m[1];
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** "1:02:03" or "02:03" as seconds. */
export function toSeconds(stamp: string): number {
  return stamp.split(":").reduce((total, part) => total * 60 + (Number(part) || 0), 0);
}

export type StampPart = { text: string } | { stamp: string; seconds: number };

const TIME = /\d{1,2}:\d{2}(?::\d{2})?/g;

/**
 * Text split around the times inside square brackets ("[02:55]",
 * "[03:57, 04:19]", "[00:06-00:14]"), so each time can link to that moment.
 * Brackets without a time, and times outside brackets, stay plain text.
 */
export function splitStamps(text: string): StampPart[] {
  const out: StampPart[] = [];
  const push = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && "text" in last) last.text += t;
    else out.push({ text: t });
  };
  let at = 0;
  for (const m of text.matchAll(/\[([\d:,\s\-–]+)\]/g)) {
    const inner = m[1];
    if (!/\d{1,2}:\d{2}/.test(inner)) continue;
    push(text.slice(at, m.index));
    push("[");
    let pos = 0;
    for (const t of inner.matchAll(TIME)) {
      push(inner.slice(pos, t.index));
      out.push({ stamp: t[0], seconds: toSeconds(t[0]) });
      pos = (t.index ?? 0) + t[0].length;
    }
    push(inner.slice(pos) + "]");
    at = (m.index ?? 0) + m[0].length;
  }
  push(text.slice(at));
  return out;
}

export const videoAt = (videoId: string, seconds: number) => `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
