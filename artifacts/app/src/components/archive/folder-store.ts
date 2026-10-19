import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { inFolder, isTypeTag, normaliseTag, renameTag } from "@/lib/archive-tags";
import type { ArchiveBlock } from "@/lib/archive-data";
import type { TagChange } from "./folder-ops";

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

  /** Saved folders at or below `from` move to `to` (the table has no update: delete and insert). */
  const rename = useCallback(
    async (from: string, to: string): Promise<void> => {
      if (!userId) return;
      const hit = store.rows.filter((r) => {
        const t = normaliseTag(r.tag);
        return !!t && inFolder(t, from);
      });
      if (!hit.length) return;
      const moved = hit.map((r) => ({ user_id: userId, tag: renameTag(normaliseTag(r.tag), from, to), module: r.module }));
      const { error: insErr } = await supabase.from("user_saved_tags").upsert(moved, { onConflict: "user_id,tag,module", ignoreDuplicates: true });
      if (insErr) {
        toast.error("The notes were renamed, but the saved folder kept its old name", { description: insErr.message });
        return;
      }
      for (const module of new Set(hit.map((r) => r.module))) {
        await supabase.from("user_saved_tags").delete().eq("user_id", userId).eq("module", module).in("tag", hit.filter((r) => r.module === module).map((r) => r.tag));
      }
      publish([...store.rows.filter((r) => !hit.includes(r)), ...moved.map(({ tag, module }) => ({ tag, module }))]);
    },
    [userId],
  );

  /** Saved folders at or below `folder` are forgotten. */
  const remove = useCallback(
    async (folder: string): Promise<void> => {
      if (!userId) return;
      const hit = store.rows.filter((r) => {
        const t = normaliseTag(r.tag);
        return !!t && inFolder(t, folder);
      });
      if (!hit.length) return;
      for (const module of new Set(hit.map((r) => r.module))) {
        const { error } = await supabase
          .from("user_saved_tags")
          .delete()
          .eq("user_id", userId)
          .eq("module", module)
          .in("tag", hit.filter((r) => r.module === module).map((r) => r.tag));
        if (error) {
          toast.error("Couldn't forget the saved folder", { description: error.message });
          return;
        }
      }
      publish(store.rows.filter((r) => !hit.includes(r)));
    },
    [userId],
  );

  return { folders, create, rename, remove };
}

type UpdateBlock = (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;

/**
 * Write each note's new tags, a few notes at a time (each note's list is its
 * own, so it is one small request per note). Resolves how many were saved;
 * updateBlock toasts a failure itself.
 */
export async function applyTagChanges(list: readonly TagChange[], updateBlock: UpdateBlock, concurrency = 6): Promise<{ saved: TagChange[]; failed: number }> {
  const saved: TagChange[] = [];
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const c = list[next++];
      const ok = await updateBlock(c.id, { tags: c.after });
      if (ok === false) failed++;
      else saved.push(c);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return { saved, failed };
}

/** Apply, then say what happened with an Undo that puts the saved notes' tags back. */
export async function applyWithUndo(
  list: readonly TagChange[],
  updateBlock: UpdateBlock,
  message: (n: number) => string,
  /** Also undone (a renamed saved folder gets its old name back). */
  alsoUndo?: () => void,
): Promise<number> {
  if (list.length === 0) return 0;
  const { saved, failed } = await applyTagChanges(list, updateBlock);
  if (saved.length === 0) return 0;
  toast.success(message(saved.length), {
    description: failed ? `${failed} could not be saved` : undefined,
    className: "[overflow-wrap:anywhere]",
    action: {
      label: "Undo",
      onClick: () => {
        alsoUndo?.();
        void applyTagChanges(
          saved.map((c) => ({ id: c.id, before: c.after, after: c.before })),
          updateBlock,
        ).then(({ failed: f }) => {
          if (!f) toast("Undone");
        });
      },
    },
  });
  return saved.length;
}
