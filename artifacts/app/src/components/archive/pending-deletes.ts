import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Deleting with a second safety net: a confirmed delete hides the notes at
 * once and shows an Undo toast; the delete itself is sent when the toast ends
 * (~6 s). Undo shows them again in place, nothing having been sent. Deletes
 * still waiting are sent at once when the page is hidden or closed, so a note
 * deleted just before leaving does not come back.
 *
 * The notes stay in the Archive's cached list until the delete is sent; the
 * lists leave out what `usePendingDeletes()` holds.
 *
 * deleteWithUndo(ids, deleteBlock, { label }) is the one way in, for a single
 * note (the card's trash, the peek, the reader) and for a selection.
 */

/** How long the Undo toast stays before the delete is sent. */
export const UNDO_MS = 6_000;

type DeleteOne = (id: string) => Promise<unknown>;

interface Batch {
  ids: string[];
  del: DeleteOne;
  timer: ReturnType<typeof setTimeout> | undefined;
  toastId: string | number | undefined;
  /** Sent, or undone. */
  settled: boolean;
}

let hidden: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const open = new Set<Batch>();
/** Deletes sent but not answered yet (a page closed meanwhile sends them again, keepalive). */
const unanswered = new Set<string>();
let token: string | null = null;
let n = 0;

function setHidden(next: Set<string>) {
  hidden = next;
  listeners.forEach((l) => l());
}
const hide = (ids: string[]) => setHidden(new Set([...hidden, ...ids]));
const unhide = (ids: string[]) => {
  const next = new Set(hidden);
  for (const id of ids) next.delete(id);
  setHidden(next);
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const snapshot = () => hidden;

/** The notes deleted with the Undo still open: every list leaves them out. */
export function usePendingDeletes(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The same, outside React. */
export const pendingDeletes = (): ReadonlySet<string> => hidden;

async function send(batch: Batch) {
  for (const id of batch.ids) unanswered.add(id);
  const failed: string[] = [];
  // One at a time: a selection of 50 is 50 small requests, not 50 at once.
  for (const id of batch.ids) {
    let ok: unknown = false;
    try {
      ok = await batch.del(id);
    } catch {
      ok = false;
    }
    unanswered.delete(id);
    if (ok === false) failed.push(id);
  }
  // Deleted ones are gone from the cached list by now; a failed one (the delete toasted why) comes back.
  unhide(batch.ids);
  if (failed.length && batch.ids.length > 1) toast.error(`${failed.length} of ${batch.ids.length} notes could not be deleted`);
}

function commit(batch: Batch) {
  if (batch.settled) return;
  batch.settled = true;
  clearTimeout(batch.timer);
  open.delete(batch);
  if (batch.toastId !== undefined) toast.dismiss(batch.toastId);
  void send(batch);
}

function undo(batch: Batch) {
  if (batch.settled) return;
  batch.settled = true;
  clearTimeout(batch.timer);
  open.delete(batch);
  unhide(batch.ids);
}

/**
 * Hide the notes now and delete them when the Undo toast ends. `del` is the
 * Archive's deleteBlock (it drops the note from the cached list and toasts a
 * failure). `label` names a single note in the toast.
 */
export function deleteWithUndo(ids: readonly string[], del: DeleteOne, opts: { label?: string; delayMs?: number } = {}): void {
  const fresh = [...new Set(ids)].filter((id) => !hidden.has(id));
  if (fresh.length === 0) return;
  hookPage();
  void supabase.auth
    .getSession()
    .then(({ data }) => (token = data.session?.access_token ?? token))
    .catch(() => undefined);
  const delay = opts.delayMs ?? UNDO_MS;
  const batch: Batch = { ids: fresh, del, timer: undefined, toastId: undefined, settled: false };
  open.add(batch);
  hide(fresh);
  const label = opts.label?.trim();
  const short = label && label.length > 48 ? `${label.slice(0, 47)}…` : label;
  const title = fresh.length === 1 ? (short ? `Moved to Trash: "${short}"` : "Moved to Trash") : `${fresh.length} notes moved to Trash`;
  batch.toastId = toast(title, {
    id: `archive-delete-${++n}`,
    duration: delay,
    // Long titles (a URL with no spaces) wrap instead of pushing the Undo button out of the toast.
    className: "[overflow-wrap:anywhere]",
    action: { label: "Undo", onClick: () => undo(batch) },
  });
  batch.timer = setTimeout(() => commit(batch), delay);
}

/** Send every delete still waiting for its toast, now (the page is going away). */
export function flushPendingDeletes(): void {
  for (const batch of [...open]) commit(batch);
}

/**
 * A closing page may cancel the requests flush() just started: the deletes
 * not answered yet go once more as keepalive requests, which outlive the page.
 */
function sendKeepalive() {
  const ids = [...unanswered];
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!ids.length || !url || !key || !token) return;
  try {
    void fetch(`${url}/rest/v1/archive_blocks?id=in.(${ids.map(encodeURIComponent).join(",")})`, {
      method: "DELETE",
      keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${token}`, Prefer: "return=minimal" },
    }).catch(() => undefined);
  } catch {
    /* the request could not be made: the one flush() sent may still land */
  }
}

let hooked = false;
function hookPage() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingDeletes();
  });
  window.addEventListener("pagehide", () => {
    flushPendingDeletes();
    sendKeepalive();
  });
}

/** Test hook: forget everything without sending. */
export function resetPendingDeletes() {
  for (const b of open) clearTimeout(b.timer);
  open.clear();
  unanswered.clear();
  hidden = new Set();
  listeners.forEach((l) => l());
}
