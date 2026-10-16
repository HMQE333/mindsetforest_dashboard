/**
 * The board Planning is on. Boards stay as the folder above the tree (his own
 * example starts with "📁 Grow RybiaPaka"), switched in the header. The last
 * board he opened is remembered per user in this browser, and the assistant
 * writes to the same board, so new rows land where he is looking rather than
 * on the oldest board.
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * Fired when ensureBoard creates a board, so a mounted board list can refetch
 * (the assistant may create "Inbox" while Planning is open).
 */
export const PLANNING_BOARDS_CHANGED_EVENT = "planning-boards-changed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rememberedBoardKey(userId: string): string {
  return `mf-planning-board:${userId}`;
}

/** The board this user last opened in this browser, or null (also when storage is blocked). */
export function getRememberedBoard(userId: string): string | null {
  try {
    const id = localStorage.getItem(rememberedBoardKey(userId));
    return id && UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Remembers the open board; null forgets it (e.g. after that board is deleted). */
export function rememberBoard(userId: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(rememberedBoardKey(userId), id);
    else localStorage.removeItem(rememberedBoardKey(userId));
  } catch { /* storage blocked: nothing to remember */ }
}

/**
 * A board to write to: the remembered board if it still exists, else the
 * newest board, else a new "📥 Inbox". The choice is remembered. Errors are
 * Polish because the assistant shows them.
 */
export async function ensureBoard(userId: string): Promise<{ id: string } | { error: string }> {
  const remembered = getRememberedBoard(userId);
  if (remembered) {
    const { data, error } = await supabase
      .from("planning_boards")
      .select("id")
      .eq("user_id", userId)
      .eq("id", remembered)
      .maybeSingle();
    if (!error && data) return { id: data.id };
  }

  const { data: newest, error: readError } = await supabase
    .from("planning_boards")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (readError) return { error: `Nie udało się odczytać tablic planowania: ${readError.message}` };
  if (newest && newest[0]) {
    rememberBoard(userId, newest[0].id);
    return { id: newest[0].id };
  }

  const { data: created, error: createError } = await supabase
    .from("planning_boards")
    .insert([{ user_id: userId, name: "Inbox", emoji: "📥" }])
    .select("id")
    .single();
  if (createError || !created) {
    return { error: `Nie udało się utworzyć tablicy „Inbox”${createError ? `: ${createError.message}` : ""}` };
  }
  rememberBoard(userId, created.id);
  try {
    window.dispatchEvent(new CustomEvent(PLANNING_BOARDS_CHANGED_EVENT));
  } catch { /* no window (tests) */ }
  return { id: created.id };
}
