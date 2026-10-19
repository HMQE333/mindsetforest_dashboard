/**
 * Folders are tags: "projekty/rybiapaka" puts a note in folder projekty,
 * sub-folder rybiapaka. What each folder action does to a note's tags, kept
 * apart from React so it can be tested. Type tags are never folders: no
 * action here adds, moves or removes one.
 */
import { inFolder, isTypeTag, mergeTags, normaliseTag, renameTag } from "@/lib/archive-tags";

/** What a dragged Library card carries (JSON: the ids of the notes it stands for). */
export const NOTE_DRAG_TYPE = "application/x-mindsetforest-notes";

export interface NoteTagsRef {
  id: string;
  tags: readonly string[] | null | undefined;
}

/** One note's tags before and after an action: the write, and its Undo. */
export interface TagChange {
  id: string;
  before: string[];
  after: string[];
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

function changes(notes: readonly NoteTagsRef[], next: (tags: string[]) => string[]): TagChange[] {
  const out: TagChange[] = [];
  for (const n of notes) {
    const before = [...(n.tags ?? [])];
    const after = next(before);
    if (!same(before, after)) out.push({ id: n.id, before, after });
  }
  return out;
}

/** Tags without the folder and everything below it (types stay). */
export function withoutFolder(tags: readonly string[], folder: string): string[] {
  return tags.filter((t) => isTypeTag(t) || !inFolder(t, folder));
}

/** Tags without any folder (only the type, if any, stays). */
export const withoutFolders = (tags: readonly string[]) => tags.filter((t) => isTypeTag(t) || !/\p{L}/u.test(t));

/** Add the folder's tag; the other tags stay. */
export function addToFolder(notes: readonly NoteTagsRef[], folder: string): TagChange[] {
  const tag = normaliseTag(folder);
  if (!tag || isTypeTag(tag)) return [];
  return changes(notes, (tags) => mergeTags(tags, [tag]));
}

/**
 * Move into a folder: out of `from` (the folder being viewed: its tag and the
 * ones below it) and into `folder`. With no folder viewed (`from` null), out
 * of every folder the note is in.
 */
export function moveToFolder(notes: readonly NoteTagsRef[], folder: string, from: string | null): TagChange[] {
  const tag = normaliseTag(folder);
  if (!tag || isTypeTag(tag)) return [];
  return changes(notes, (tags) => mergeTags(from ? withoutFolder(tags, from) : withoutFolders(tags), [tag]));
}

/** Out of the folder (and the ones below it): dropping a note on "Untagged" while a folder is viewed. */
export function removeFromFolder(notes: readonly NoteTagsRef[], folder: string): TagChange[] {
  return changes(notes, (tags) => withoutFolder(tags, folder));
}

/** Rename the folder on every note: its sub-folders move with it; a tag that ends up twice is kept once. */
export function renameFolder(notes: readonly NoteTagsRef[], from: string, to: string): TagChange[] {
  const target = normaliseTag(to);
  if (!target || isTypeTag(target) || target === from) return [];
  return changes(notes, (tags) => {
    const out: string[] = [];
    for (const t of tags) {
      const r = isTypeTag(t) ? t : renameTag(t, from, target);
      if (!out.includes(r)) out.push(r);
    }
    return out;
  });
}

/** Delete the folder: its tag and every sub-folder's come off the notes; the notes stay. */
export const deleteFolder = (notes: readonly NoteTagsRef[], folder: string) => removeFromFolder(notes, folder);

/** The notes a folder action touches, and the sub-folders it reaches: for the confirmation. */
export function folderReach(notes: readonly NoteTagsRef[], folder: string): { notes: number; subfolders: number } {
  let count = 0;
  const subs = new Set<string>();
  for (const n of notes) {
    let hit = false;
    for (const t of n.tags ?? []) {
      if (isTypeTag(t) || !inFolder(t, folder)) continue;
      hit = true;
      if (t !== folder) {
        // Every level below the folder is a sub-folder: a/b/c makes a/b and a/b/c.
        const rest = t.slice(folder.length + 1).split("/");
        rest.forEach((_, i) => subs.add(rest.slice(0, i + 1).join("/")));
      }
    }
    if (hit) count++;
  }
  return { notes: count, subfolders: subs.size };
}

/**
 * Why a folder name cannot be used, or null when it can. A new folder must
 * not exist yet; a rename (`current`) may land on an existing folder, whose
 * notes the renamed ones then join.
 */
export function folderNameProblem(raw: string, existing: ReadonlySet<string>, current?: string): string | null {
  if (!raw.trim()) return "Type a name";
  const tag = normaliseTag(raw);
  if (!tag) return "A folder name needs a letter";
  if (isTypeTag(tag)) return `"${tag}" is a note type, not a folder`;
  if (current !== undefined) {
    if (tag === current) return "That is its name already";
    if (tag.startsWith(`${current}/`)) return "A folder cannot move inside itself";
    return null;
  }
  return existing.has(tag) ? `#${tag} already exists` : null;
}

/** "#projekty" or "#projekty/rybiapaka", shortened for a toast or a dialog title. */
export function folderLabel(folder: string, max = 48): string {
  const s = `#${folder}`;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
