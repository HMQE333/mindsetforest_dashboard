/**
 * "Share → MindsetForest" on a phone (manifest.webmanifest share_target):
 * the app opens at /?share_url=…&share_text=…. What was shared is kept for
 * the Archive Inbox, which saves it at once (a reel's link with its
 * transcript), the Archive opens on the Inbox, and the address is cleaned.
 * The Inbox draft he was typing is left alone.
 */
const SHARED_KEY = "mf.sharedToInbox";
const OPEN_KEY = "mf.openArchiveInbox";

export function takeSharedIntoInbox(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const url = q.get("share_url") ?? "";
    const text = q.get("share_text") ?? "";
    const title = q.get("share_title") ?? "";
    if (!url && !text && !title) return;
    // Apps put the link in text, url or both: each piece once.
    const pieces = [title, text, url].map((s) => s.trim()).filter(Boolean);
    const shared = pieces.filter((p, i) => !pieces.some((o, j) => j !== i && o.length > p.length && o.includes(p))).join("\n");
    localStorage.setItem(SHARED_KEY, shared);
    sessionStorage.setItem(OPEN_KEY, "1");
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  } catch {
    /* storage blocked: nothing to carry over */
  }
}

/** Once, after a share: open the Archive on its Inbox. */
export function sharedOpenArchive(): boolean {
  try {
    if (sessionStorage.getItem(OPEN_KEY) !== "1") return false;
    sessionStorage.removeItem(OPEN_KEY);
    return true;
  } catch {
    return false;
  }
}

/** What was shared and not saved yet (taken once). */
export function takeSharedText(): string | null {
  try {
    const t = localStorage.getItem(SHARED_KEY);
    if (t) localStorage.removeItem(SHARED_KEY);
    return t?.trim() || null;
  } catch {
    return null;
  }
}
