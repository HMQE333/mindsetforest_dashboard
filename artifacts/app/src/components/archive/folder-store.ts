import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { inFolder, isTypeTag, normaliseTag, renameTag } from "@/lib/archive-tags";
import type { ArchiveBlock } from "@/lib/archive-data";
import { sameList, undoOnto, type TagChange } from "./folder-ops";

/**
 * Folders that hold no note yet. A folder is a tag, so an empty one exists
 * only as a saved tag: user_saved_tags with module "archive" (the Archive's
 * tag library, which the edit dialog already writes, and which ai-suggest-tags
 * reads as "(empty folder)"). Rows with module "all" count too. One copy per
 * page, read once per user.
 */

interface SavedRow {
  tag: string;
  module: string;
}

/** The saved-folder rows a rename or delete took away and the ones it put in: what its Undo reverses, exactly. */
export interface SavedMove {
  removed: SavedRow[];
  added: SavedRow[];
}

const rowKey = (r: SavedRow) => `${r.module}\u0000${normaliseTag(r.tag)}`;

/** Delete these rows (by module and tag as stored). Resolves the error, if any. */
async function deleteRows(userId: string, rows: readonly SavedRow[]) {
  for (const module of new Set(rows.map((r) => r.module))) {
    const { error } = await supabase
      .from("user_saved_tags")
      .delete()
      .eq("user_id", userId)
      .eq("module", module)
      .in("tag", rows.filter((r) => r.module === module).map((r) => r.tag));
    if (error) return error;
  }
  return null;
}

const store = {
  userId: null as string | null,
  rows: [] as SavedRow[],
  /** Normalised folder paths, sorted. */
  folders: [] as string[],
  loaded: false,
  loading: null as Promise<void> | null,
  listeners: new Set<() => void>(),
};

function publish(rows: SavedRow[]) {
  store.rows = rows;
  const set = new Set<string>();
  for (const r of rows) {
    const t = normaliseTag(r.tag);
    if (t && !isTypeTag(t)) set.add(t);
  }
  store.folders = [...set].sort((a, b) => a.localeCompare(b, "pl"));
  store.listeners.forEach((l) => l());
}

async function load(userId: string) {
  const { data, error } = await supabase
    .from("user_saved_tags")
    .select("tag, module")
    .eq("user_id", userId)
    .in("module", ["archive", "all"]);
  if (store.userId !== userId) return;
  store.loaded = true;
  if (!error) publish((data ?? []) as SavedRow[]);
}

function ensure(userId: string | null) {
  if (store.userId !== userId) {
    store.userId = userId;
    store.loaded = false;
    store.loading = null;
    publish([]);
  }
  if (userId && !store.loaded && !store.loading) {
    store.loading = load(userId).finally(() => {
      store.loading = null;
    });
  }
}

const subscribe = (l: () => void) => {
  store.listeners.add(l);
  return () => void store.listeners.delete(l);
};
const snapshot = () => store.folders;

/** The saved (possibly empty) folders, and the writes that keep them in step with renames and deletes. */
export function useSavedFolders() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => ensure(userId), [userId]);
  const folders = useSyncExternalStore(subscribe, snapshot, snapshot);

  /** A new empty folder. Resolves whether it was saved. */
  const create = useCallback(
    async (path: string): Promise<boolean> => {
      const tag = normaliseTag(path);
      if (!userId || !tag || isTypeTag(tag)) return false;
      if (store.rows.some((r) => r.module === "archive" && normaliseTag(r.tag) === tag)) return true;
      const { error } = await supabase.from("user_saved_tags").insert({ user_id: userId, tag, module: "archive" });
      // 23505: saved already (another tab); it is there either way.
      if (error && error.code !== "23505") {
        toast.error("Couldn't create the folder", { description: error.message });
        return false;
      }
      publish([...store.rows, { tag, module: "archive" }]);
      return true;
    },
    [userId],
  );

  /**
   * Saved folders at or below `from` move to `to` (the table has no update:
   * insert, then delete). Resolves what moved, for an exact Undo: a folder
   * already saved at `to` is not one of the rows put in, so Undo leaves it.
   * Null when nothing could be saved.
   */
  const rename = useCallback(
    async (from: string, to: string): Promise<SavedMove | null> => {
      if (!userId) return null;
      const hit = store.rows.filter((r) => {
        const t = normaliseTag(r.tag);
        return !!t && inFolder(t, from);
      });
      if (!hit.length) return { removed: [], added: [] };
      const there = new Set(store.rows.map(rowKey));
      const moved = hit.map((r) => ({ tag: renameTag(normaliseTag(r.tag), from, to), module: r.module }));
      const added = moved.filter((r, i) => !there.has(rowKey(r)) && moved.findIndex((m) => rowKey(m) === rowKey(r)) === i);
      if (added.length) {
        const { error: insErr } = await supabase
          .from("user_saved_tags")
          .upsert(added.map((r) => ({ user_id: userId, ...r })), { onConflict: "user_id,tag,module", ignoreDuplicates: true });
        if (insErr) {
          toast.error("The saved folder kept its old name", { description: insErr.message });
          return null;
        }
      }
      const delErr = await deleteRows(userId, hit);
      if (delErr) {
        // The new name is saved; the old one stays as well (an empty folder he can delete).
        publish([...store.rows, ...added]);
        toast.error("The old saved folder is still listed", { description: delErr.message });
        return { removed: [], added };
      }
      publish([...store.rows.filter((r) => !hit.includes(r)), ...added]);
      return { removed: hit, added };
    },
    [userId],
  );

  /** Saved folders at or below `folder` are forgotten. Resolves what was removed (for Undo), or null on failure. */
  const remove = useCallback(
    async (folder: string): Promise<SavedMove | null> => {
      if (!userId) return null;
      const hit = store.rows.filter((r) => {
        const t = normaliseTag(r.tag);
        return !!t && inFolder(t, folder);
      });
      if (!hit.length) return { removed: [], added: [] };
      const error = await deleteRows(userId, hit);
      if (error) {
        toast.error("Couldn't forget the saved folder", { description: error.message });
        return null;
      }
      publish(store.rows.filter((r) => !hit.includes(r)));
      return { removed: hit, added: [] };
    },
    [userId],
  );

  /** Undo a rename or delete of saved folders: exactly the rows it took away come back, the ones it put in go. */
  const restore = useCallback(
    async (move: SavedMove | null): Promise<void> => {
      if (!userId || !move || (!move.removed.length && !move.added.length)) return;
      if (move.added.length) {
        const error = await deleteRows(userId, move.added);
        if (error) {
          toast.error("Couldn't put the saved folders back", { description: error.message });
          return;
        }
      }
      if (move.removed.length) {
        const { error } = await supabase
          .from("user_saved_tags")
          .upsert(move.removed.map((r) => ({ user_id: userId, tag: r.tag, module: r.module })), { onConflict: "user_id,tag,module", ignoreDuplicates: true });
        if (error) {
          toast.error("Couldn't put the saved folders back", { description: error.message });
          return;
        }
      }
      const gone = new Set(move.added.map(rowKey));
      const kept = store.rows.filter((r) => !gone.has(rowKey(r)));
      const have = new Set(kept.map(rowKey));
      publish([...kept, ...move.removed.filter((r) => !have.has(rowKey(r)))]);
    },
    [userId],
  );

  return { folders, create, rename, remove, restore };
}

type UpdateBlock = (id: string, updates: Partial<ArchiveBlock>, opts?: { quiet?: boolean }) => Promise<unknown>;

/**
 * Write each note's new tags, a few notes at a time (each note's list is its
 * own, so it is one small request per note). Resolves the ones saved and how
 * many failed; the caller says it once (updateBlock is asked to stay quiet).
 */
export async function applyTagChanges(list: readonly TagChange[], updateBlock: UpdateBlock, concurrency = 6): Promise<{ saved: TagChange[]; failed: number }> {
  const saved: TagChange[] = [];
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const c = list[next++];
      const ok = await updateBlock(c.id, { tags: c.after }, { quiet: true });
      if (ok === false) failed++;
      else saved.push(c);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return { saved, failed };
}

/** The notes' `column` as the table holds it now (deleted notes are missing), or null when it cannot be read. */
export async function readNoteLists(ids: readonly string[], column: "tags" | "pillars"): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("archive_blocks")
      .select(`id,${column}`)
      .in("id", ids.slice(i, i + 100));
    if (error) return null;
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const v = row[column];
      out.set(String(row.id), Array.isArray(v) ? v.map(String) : []);
    }
  }
  return out;
}

/**
 * Undo saved tag changes on the notes as they are now (undoOnto): a tag
 * accepted or dropped on since stays. Resolves whether it all went through.
 */
async function undoTagChanges(saved: readonly TagChange[], updateBlock: UpdateBlock): Promise<boolean> {
  const now = await readNoteLists(saved.map((c) => c.id), "tags");
  if (!now) {
    toast.error("Couldn't undo: the notes could not be read");
    return false;
  }
  const back: TagChange[] = [];
  for (const c of saved) {
    const current = now.get(c.id);
    if (!current) continue;
    const next = undoOnto(current, c);
    if (!sameList(next, current)) back.push({ id: c.id, before: current, after: next });
  }
  const { failed } = await applyTagChanges(back, updateBlock);
  if (failed) toast.error(`Couldn't undo on ${failed} note${failed === 1 ? "" : "s"}`);
  return failed === 0;
}

/** "The note could not be saved" / "None of the 40 notes could be saved". */
const nothingSaved = (failed: number) => (failed === 1 ? "The note could not be saved" : `None of the ${failed} notes could be saved`);

/**
 * Apply, then say what happened with an Undo that takes the change back off
 * the saved notes. `whenSaved` runs only once at least one note is saved (a
 * rename's or delete's saved folders and view follow the notes, never lead
 * them) and may resolve its own undo. When no note could be saved, one error
 * says so and nothing else changes. Resolves how many notes were saved.
 */
export async function applyWithUndo(
  list: readonly TagChange[],
  updateBlock: UpdateBlock,
  message: (n: number) => string,
  whenSaved?: () => Promise<(() => Promise<void> | void) | void>,
): Promise<number> {
  if (list.length === 0) return 0;
  const { saved, failed } = await applyTagChanges(list, updateBlock);
  if (saved.length === 0) {
    toast.error(nothingSaved(failed), { description: "Nothing was changed." });
    return 0;
  }
  const alsoUndo = whenSaved ? await whenSaved() : undefined;
  toast.success(message(saved.length), {
    description: failed ? `${failed} could not be saved` : undefined,
    className: "[overflow-wrap:anywhere]",
    action: {
      label: "Undo",
      onClick: () =>
        void (async () => {
          await alsoUndo?.();
          if (await undoTagChanges(saved, updateBlock)) toast("Undone");
        })(),
    },
  });
  return saved.length;
}
