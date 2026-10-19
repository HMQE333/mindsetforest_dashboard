/**
 * File Share: files dropped on one device, picked up on another within a few
 * minutes. The list is the storage folder itself, so every device signed in
 * to the account sees the same files, and whichever device sees a file past
 * its time deletes it.
 *
 * New uploads go to <uid>/file-share/, which the bucket's delete policy
 * (first folder = the user's id) already covers. Uploads before October 2026
 * went to file-share/<uid>/, which it does not: those are listed and deleted
 * too, and the delete only succeeds once the policy in
 * supabase/migrations/20261019120000_file_share_delete.sql is applied.
 */

export const SHARE_BUCKET = "archive-images";
export const SHARE_TTL_MS = 7 * 60 * 1000;
/** A file is deleted this long after its time is up, so a device whose clock runs fast does not take it early. */
export const DELETE_GRACE_MS = 15_000;
export const MAX_SHARE_BYTES = 500 * 1024 * 1024;

export const shareFolder = (uid: string) => `${uid}/file-share`;
export const legacyShareFolder = (uid: string) => `file-share/${uid}`;

/** One entry of a storage folder listing (what supabase.storage.list returns). */
export interface StorageEntry {
  name: string;
  /** null for a sub-folder. */
  id: string | null;
  created_at: string | null;
  metadata?: { size?: number; mimetype?: string } | null;
}

export interface SharedFile {
  /** The object's path in the bucket. */
  path: string;
  /** The name to show and download as. */
  name: string;
  size: number;
  mimetype: string;
  uploadedAt: number;
  expiresAt: number;
  legacy: boolean;
}

/**
 * A file name storage accepts as part of a key: letters without accents,
 * digits, and . _ - ( ) and space; anything else becomes "_". Keeps the
 * extension, at most 80 characters.
 */
export function safeFileName(name: string): string {
  const plain = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^A-Za-z0-9._ ()-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[\s._]+|\s+$/g, "");
  if (!plain) return "file";
  if (plain.length <= 80) return plain;
  const dot = plain.lastIndexOf(".");
  const ext = dot > 0 && plain.length - dot <= 10 ? plain.slice(dot) : "";
  return plain.slice(0, 80 - ext.length) + ext;
}

/** The object name for an upload: when it was sent, a random part, and the file's own name. */
export function shareObjectName(fileName: string, now: number, rand: string): string {
  return `${now}-${rand}--${safeFileName(fileName)}`;
}

const NAMED = /^(\d{10,})-([A-Za-z0-9]+)--(.+)$/;
const LEGACY = /^(\d{10,})-([A-Za-z0-9]+)\.([A-Za-z0-9]+)$/;

/** The name to show for an object name; older uploads kept only the extension. */
export function displayName(objectName: string): string {
  const named = NAMED.exec(objectName);
  if (named) return named[3];
  const legacy = LEGACY.exec(objectName);
  if (legacy) return `${legacy[3].toLowerCase()} file`;
  return objectName;
}

/** The upload time written into the object name, or null. */
export function nameTimestamp(objectName: string): number | null {
  const m = NAMED.exec(objectName) ?? LEGACY.exec(objectName);
  if (!m) return null;
  const t = Number(m[1]);
  return Number.isFinite(t) ? t : null;
}

/**
 * A listing entry as a shared file. The server's created_at decides the
 * time, the same on every device; the time in the name is the fallback.
 * Sub-folders and storage's placeholder files are skipped.
 */
export function toSharedFile(folder: string, e: StorageEntry, legacy = false, ttl = SHARE_TTL_MS): SharedFile | null {
  if (!e.id || !e.name || e.name === ".emptyFolderPlaceholder") return null;
  const created = e.created_at ? Date.parse(e.created_at) : NaN;
  const uploadedAt = Number.isFinite(created) ? created : nameTimestamp(e.name);
  if (uploadedAt === null) return null;
  return {
    path: `${folder}/${e.name}`,
    name: displayName(e.name),
    size: e.metadata?.size ?? 0,
    mimetype: e.metadata?.mimetype ?? "",
    uploadedAt,
    expiresAt: uploadedAt + ttl,
    legacy,
  };
}

export interface SharePlan {
  /** Still within their time, soonest to expire first. */
  active: SharedFile[];
  /** Past their time but linked from a note: kept, so the note's link keeps working. */
  kept: SharedFile[];
  /** Past their time (and the grace) and linked from nothing: to delete. */
  expired: SharedFile[];
}

/**
 * What to show and what to delete. A file in the grace window is neither
 * shown nor deleted yet. A file a note links to is never deleted here.
 */
export function planShare(files: SharedFile[], now: number, isLinked: (f: SharedFile) => boolean, grace = DELETE_GRACE_MS): SharePlan {
  const plan: SharePlan = { active: [], kept: [], expired: [] };
  for (const f of files) {
    if (f.expiresAt > now) plan.active.push(f);
    else if (isLinked(f)) plan.kept.push(f);
    else if (f.expiresAt + grace <= now) plan.expired.push(f);
  }
  plan.active.sort((a, b) => a.expiresAt - b.expiresAt);
  plan.kept.sort((a, b) => b.uploadedAt - a.uploadedAt);
  return plan;
}

/**
 * Whether any of the texts holds the file's path (a pasted public URL does).
 * The texts are notes; this only runs for files already past their time.
 */
export function linkedFrom(texts: readonly string[], f: SharedFile): boolean {
  return texts.some((t) => t.includes(f.path));
}

/** "6:59", never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
