import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Upload, File, Clock, X, Download, Copy, Check, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";
import {
  DELETE_GRACE_MS,
  MAX_SHARE_BYTES,
  SHARE_BUCKET,
  SHARE_TTL_MS,
  formatRemaining,
  formatSize,
  legacyShareFolder,
  linkedFrom,
  planShare,
  sameListing,
  shareFolder,
  shareObjectName,
  toSharedFile,
  type SharedFile,
  type StorageEntry,
} from "./file-share";

interface Props {
  /** The user's notes: a file whose link was pasted into one is never deleted for being old. */
  blocks?: ArchiveBlock[];
}

/** How often an open File Share tab reads the folder again (only while the page is visible). */
const POLL_MS = 5_000;
const EMPTY_BLOCKS: ArchiveBlock[] = [];

/** Paths this page already tried to delete, so a refused delete (an old upload before the policy is applied) is not repeated every poll. */
const attempted = new Set<string>();

const bucket = () => supabase.storage.from(SHARE_BUCKET);
const publicUrl = (path: string) => bucket().getPublicUrl(path).data.publicUrl;

async function listFolder(folder: string, legacy: boolean): Promise<{ files: SharedFile[]; error: string | null }> {
  const { data, error } = await bucket().list(folder, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) return { files: [], error: error.message };
  const files = ((data ?? []) as StorageEntry[]).map((e) => toSharedFile(folder, e, legacy)).filter((f): f is SharedFile => f !== null);
  return { files, error: null };
}

/** Tells this browser's other tabs that the folder changed (other devices see it at their next read). */
function announce(uid: string) {
  try {
    const bc = new BroadcastChannel(`file-share:${uid}`);
    bc.postMessage("changed");
    bc.close();
  } catch { /* the poll still catches it */ }
}

/**
 * Files dropped here are on every device signed in to the account: the list
 * is the storage folder itself, read again every few seconds while this tab
 * is open, so a second PC shows the file without anyone copying a link by
 * hand. Each file lives 7 minutes; whichever device sees it past its time
 * deletes it, including uploads from before this version (file-share/<uid>/).
 */
export default function FileShareView({ blocks = EMPTY_BLOCKS }: Props) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [listed, setListed] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  /** Asked to read again while a read was out: that read started before the change, so it is dropped and the folder read again. */
  const rerun = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;

  const refresh = useCallback(async () => {
    if (!uid) return;
    if (busy.current) {
      rerun.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        rerun.current = false;
        const [current, legacy] = await Promise.all([listFolder(shareFolder(uid), false), listFolder(legacyShareFolder(uid), true)]);
        // An upload that finished meanwhile is not in this listing: read again rather than drop its row.
        if (rerun.current) continue;
        if (current.error && legacy.error) {
          setListError(current.error);
          continue;
        }
        const next = [...current.files, ...legacy.files];
        if (!sameListing(filesRef.current, next)) {
          setFiles(next);
          // A stopped countdown restarts from the real time, not the last tick.
          setNow(Date.now());
        }
        setListError(null);
        setListed(true);
      } while (rerun.current);
    } finally {
      busy.current = false;
    }
  }, [uid]);

  // Read the folder now, then every few seconds while the page is visible, at
  // once when it comes back into view, and when another tab of this browser changes it.
  useEffect(() => {
    if (!uid) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      if (document.hidden) return;
      void refresh();
      timer = setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(`file-share:${uid}`);
      bc.onmessage = () => void refresh();
    } catch { /* polling alone */ }
    start();
    document.addEventListener("visibilitychange", start);
    window.addEventListener("focus", start);
    return () => {
      clearInterval(timer);
      bc?.close();
      document.removeEventListener("visibilitychange", start);
      window.removeEventListener("focus", start);
    };
  }, [uid, refresh]);

  // Which files a note links to, worked out when the list or the notes change (not every second).
  const linked = useMemo(() => {
    const texts = blocks.map((b) => (b.source_url ? `${b.content}\n${b.source_url}` : b.content));
    return new Set(files.filter((f) => linkedFrom(texts, f)).map((f) => f.path));
  }, [files, blocks]);

  const plan = useMemo(() => planShare(files, now, (f) => linked.has(f.path)), [files, now, linked]);

  // The countdown ticks only while something is counting down or waiting out its grace before the delete.
  const ticking = files.some((f) => f.expiresAt + DELETE_GRACE_MS + 1000 > now);
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  // Past its time (and a short grace) and linked from no note: delete it, once per page.
  useEffect(() => {
    if (!uid) return;
    const todo = plan.expired.filter((f) => !attempted.has(f.path));
    if (todo.length === 0) return;
    todo.forEach((f) => attempted.add(f.path));
    void bucket()
      .remove(todo.map((f) => f.path))
      .then(({ data, error }) => {
        if (error) return;
        const gone = new Set(((data ?? []) as { name: string }[]).map((o) => o.name));
        if (gone.size === 0) return;
        setFiles((prev) => prev.filter((f) => !gone.has(f.path)));
        announce(uid);
      });
  }, [plan.expired, uid]);

  const uploadFile = useCallback(
    async (file: globalThis.File) => {
      if (!uid) {
        toast.error("Sign in to share files");
        return;
      }
      if (file.size > MAX_SHARE_BYTES) {
        toast.error("File must be under 500MB");
        return;
      }
      setUploading(file.name);
      try {
        const sentAt = Date.now();
        const path = `${shareFolder(uid)}/${shareObjectName(file.name, sentAt, Math.random().toString(36).slice(2, 8))}`;
        const { error } = await bucket().upload(path, file, { contentType: file.type || undefined });
        if (error) throw error;
        // Shown at once; the next read replaces it with the server's own entry. Its time starts when the
        // upload finished (as the server's does), not when it began: a slow upload is not "old", let alone deleted.
        const doneAt = Date.now();
        setFiles((prev) => [
          ...prev.filter((f) => f.path !== path),
          { path, name: file.name, size: file.size, mimetype: file.type, uploadedAt: doneAt, expiresAt: doneAt + SHARE_TTL_MS, legacy: false },
        ]);
        setNow(Date.now());
        // At once, so a read already out (started before the file existed) is dropped and the folder read again.
        void refresh();
        announce(uid);
        let copiedNow = false;
        try {
          await navigator.clipboard.writeText(publicUrl(path));
          copiedNow = true;
          setCopied(path);
        } catch { /* no clipboard permission without a click: the Copy button is there */ }
        toast.success(`"${file.name}" shared for 7 min${copiedNow ? ". Link copied" : ""}`);
      } catch (e: any) {
        console.error("Upload error:", e);
        toast.error(e?.message || "Upload failed");
      } finally {
        setUploading(null);
      }
    },
    [uid, refresh],
  );

  const uploadAll = useCallback(async (list: FileList | globalThis.File[] | null) => {
    for (const file of Array.from(list ?? [])) await uploadFile(file);
  }, [uploadFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void uploadAll(e.dataTransfer.files);
    },
    [uploadAll],
  );

  const copyLink = async (f: SharedFile) => {
    try {
      await navigator.clipboard.writeText(publicUrl(f.path));
      setCopied(f.path);
      toast.success(`Link for "${f.name}" copied`);
    } catch {
      toast.error("Failed to copy link");
    }
  };
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const download = (f: SharedFile) => {
    window.open(bucket().getPublicUrl(f.path, { download: f.name }).data.publicUrl, "_blank", "noopener");
  };

  const remove = async (f: SharedFile) => {
    const { data, error } = await bucket().remove([f.path]);
    if (error || !(data ?? []).length) {
      toast.error(`Could not remove "${f.name}"`);
      return;
    }
    setFiles((prev) => prev.filter((x) => x.path !== f.path));
    if (uid) announce(uid);
    toast.success(`"${f.name}" removed`);
  };

  const row = (f: SharedFile, kept: boolean) => {
    const remaining = Math.max(0, f.expiresAt - now);
    const progress = Math.min(1, remaining / SHARE_TTL_MS);
    const urgent = !kept && remaining < 60_000;
    const isCopied = copied === f.path;
    return (
      <div key={f.path} className="glass-card p-4 space-y-2 animate-in fade-in duration-200">
        <div className="flex items-center gap-3">
          <File className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" title={f.name}>{f.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatSize(f.size)}
              {kept && " · kept: a note links to it"}
            </p>
          </div>

          {!kept && (
            <div className="flex items-center gap-2 shrink-0" title="Time left before it is deleted">
              <Clock className={`hidden sm:block w-4 h-4 ${urgent ? "text-red-400" : "text-muted-foreground"}`} />
              <span className={`text-base sm:text-lg font-mono font-bold tracking-wider tabular-nums ${urgent ? "text-red-400" : "text-foreground/80"}`}>
                {formatRemaining(remaining)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {/* On a phone only the icon, so the file's name keeps the room to tell two files apart. */}
            <button
              onClick={() => void copyLink(f)}
              className={`inline-flex items-center gap-1.5 p-1.5 sm:px-2.5 rounded-lg text-xs font-semibold transition-colors active:scale-[0.97] ${
                isCopied ? "bg-emerald-500/20 text-emerald-300" : "bg-primary/15 text-primary hover:bg-primary/25"
              }`}
              title="Copy link"
              aria-label={isCopied ? `Link for ${f.name} copied` : `Copy the link to ${f.name}`}
            >
              {isCopied ? <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> : <Copy className="w-4 h-4 sm:w-3.5 sm:h-3.5" />}
              <span className="hidden sm:inline">{isCopied ? "Copied" : "Copy link"}</span>
            </button>
            <button
              onClick={() => download(f)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              title="Download"
              aria-label={`Download ${f.name}`}
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => void remove(f)}
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
              title="Delete now"
              aria-label={`Delete ${f.name}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!kept && (
          <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${urgent ? "bg-red-500" : ""}`}
              style={{
                width: `${progress * 100}%`,
                ...(urgent ? {} : { background: "linear-gradient(90deg, hsl(280, 70%, 45%), hsl(280, 90%, 60%))" }),
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="glass-card p-4 text-sm text-muted-foreground flex items-center gap-3">
        <Clock className="w-4 h-4 text-primary shrink-0" />
        <span>
          Drop files here to move them between your devices: every device signed in to your account sees the same list. Files are{" "}
          <strong className="text-foreground">auto-deleted after 7 minutes</strong>. Anyone with the link can download a file until then.
        </span>
      </div>

      {/* Drop zone (a click opens the file picker) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-colors p-10 flex flex-col items-center justify-center gap-3 cursor-pointer ${
          dragging ? "border-primary bg-primary/10" : "border-white/10 bg-background/30 hover:border-white/20"
        }`}
      >
        {uploading ? (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground truncate max-w-full">Uploading {uploading}…</p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground font-semibold">Drop files here</p>
            <p className="text-xs text-muted-foreground">or click to choose. The link is copied when the upload finishes.</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { void uploadAll(e.target.files); e.target.value = ""; }}
        />
      </div>

      {listError && (
        <p className="text-xs text-destructive flex items-center gap-2">
          Could not read the shared files: {listError}
          <button onClick={() => void refresh()} className="inline-flex items-center gap-1 text-primary hover:underline">
            <RefreshCw className="w-3 h-3" /> Try again
          </button>
        </p>
      )}

      {/* File list */}
      {plan.active.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Shared Files ({plan.active.length})
          </h4>
          {plan.active.map((f) => row(f, false))}
        </div>
      )}

      {plan.kept.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Kept ({plan.kept.length})</h4>
          {plan.kept.map((f) => row(f, true))}
        </div>
      )}

      {plan.active.length === 0 && plan.kept.length === 0 && !uploading && (
        <div className="text-center py-10 text-muted-foreground">
          <File className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{listed || !uid ? "No files shared right now" : "Reading the shared folder…"}</p>
          <p className="text-xs mt-1">A file dropped on another device shows up here within a few seconds</p>
        </div>
      )}
    </div>
  );
}
