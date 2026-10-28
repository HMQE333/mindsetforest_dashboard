/**
 * "Share → MindsetForest" on a phone (manifest.webmanifest share_target):
 * the app opens at /?share_url=…&share_text=…. What was shared goes into the
 * Archive Inbox draft (added to anything already there), the Archive opens on
 * the Inbox, and the address is cleaned. A reel's link then shows the Inbox's
 * Transcribe button.
 */
const DRAFT_KEY = "archive-inbox-draft";
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
    const draft = localStorage.getItem(DRAFT_KEY) ?? "";
    localStorage.setItem(DRAFT_KEY, draft.trim() ? `${draft.trim()}\n\n${shared}` : shared);
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
