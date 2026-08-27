import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, File, Clock, X, Download, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface SharedFile {
  id: string;
  name: string;
  size: number;
  url: string;
  path: string;
  expiresAt: number; // timestamp ms
}

const TTL_MS = 7 * 60 * 1000; // 7 minutes

function formatTime(remaining: number): string {
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileShareView() {
  const { user } = useAuth();
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Tick every second for countdown display
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Clean up expired files from state
  useEffect(() => {
    const expired = files.filter((f) => f.expiresAt <= now);
    if (expired.length > 0) {
      setFiles((prev) => prev.filter((f) => f.expiresAt > now));
    }
  }, [now]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!user) {
        toast.error("Sign in to share files");
        return;
      }
      if (file.size > 500 * 1024 * 1024) {
        toast.error("File must be under 500MB");
        return;
      }

      setUploading(true);
      try {
        const ext = file.name.split(".").pop() || "bin";
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `file-share/${user.id}/${name}`;

        const { error } = await supabase.storage.from("archive-images").upload(path, file);
        if (error) throw error;

        const { data: urlData } = supabase.storage.from("archive-images").getPublicUrl(path);
        const url = urlData.publicUrl;

        const newFile: SharedFile = {
          id: name,
          name: file.name,
          size: file.size,
          url,
          path,
          expiresAt: Date.now() + TTL_MS,
        };

        setFiles((prev) => [...prev, newFile]);
        toast.success(`"${file.name}" uploaded. Expires in 7 min`);

        // Schedule deletion
        setTimeout(async () => {
          await supabase.storage.from("archive-images").remove([path]);
        }, TTL_MS);
      } catch (e: any) {
        console.error("Upload error:", e);
        toast.error(e?.message || "Upload failed");
      }
      setUploading(false);
    },
    [user]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      for (const file of droppedFiles) {
        await uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleCopyLink = async (url: string, name: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Link for "${name}" copied!`);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleDelete = async (f: SharedFile) => {
    await supabase.storage.from("archive-images").remove([f.path]);
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    toast.success(`"${f.name}" removed`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Info banner */}
      <div className="glass-card p-4 text-sm text-muted-foreground flex items-center gap-3">
        <Clock className="w-4 h-4 text-primary shrink-0" />
        <span>
          Drop files here to quickly transfer them between your devices. Files are stored temporarily and{" "}
          <strong className="text-foreground">auto-deleted after 7 minutes</strong>. This folder is private to your account.
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all p-10 flex flex-col items-center justify-center gap-3 ${
          dragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "border-white/10 bg-background/30 hover:border-white/20"
        }`}
      >
        {uploading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent"
            />
            <p className="text-sm text-muted-foreground">Uploading…</p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground font-semibold">Drop files here</p>
            <p className="text-xs text-muted-foreground">or click to browse (coming soon. Use drag & drop)</p>
          </>
        )}
      </div>

      {/* File list */}
      <AnimatePresence>
        {files.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Shared Files ({files.length})
            </h4>
            {files
              .sort((a, b) => a.expiresAt - b.expiresAt)
              .map((f) => {
                const remaining = Math.max(0, f.expiresAt - now);
                const progress = remaining / TTL_MS;
                const urgent = remaining < 60000; // red under 1 min

                return (
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="glass-card p-4 space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <File className="w-5 h-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{f.name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatSize(f.size)}</p>
                      </div>

                      {/* Timer. Breathing-style */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Clock className={`w-4 h-4 ${urgent ? "text-red-400" : "text-muted-foreground"}`} />
                        <span
                          className={`text-lg font-mono font-bold tracking-wider tabular-nums ${
                            urgent ? "text-red-400 animate-pulse" : "text-foreground/80"
                          }`}
                        >
                          {formatTime(remaining)}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyLink(f.url, f.name)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                          title="Copy link"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.open(f.url, "_blank")}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(f)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-all"
                          title="Delete now"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Progress bar. Breathing-style gradient */}
                    <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${urgent ? "bg-red-500" : ""}`}
                        style={
                          urgent
                            ? undefined
                            : { background: "linear-gradient(90deg, hsl(280, 70%, 45%), hsl(280, 90%, 60%))" }
                        }
                        animate={{ width: `${progress * 100}%` }}
                        transition={{ duration: 1, ease: "linear" }}
                      />
                    </div>
                  </motion.div>
                );
              })}
          </div>
        )}
      </AnimatePresence>

      {files.length === 0 && !uploading && (
        <div className="text-center py-10 text-muted-foreground">
          <File className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No files shared yet</p>
          <p className="text-xs mt-1">Drag files here to share between devices</p>
        </div>
      )}
    </motion.div>
  );
}