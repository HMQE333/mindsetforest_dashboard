import { useState, useRef, useCallback, useMemo, type ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Upload, X, Sparkles, MessageSquare, Hash, Save, Loader2 } from "lucide-react";
import type { ArchiveBlock } from "@/lib/archive-data";

interface Props {
  addBlock: (b: Partial<ArchiveBlock>) => Promise<ArchiveBlock | null>;
  addBlocks: (b: Partial<ArchiveBlock>[]) => Promise<void>;
  existingTags?: string[];
}

const IMAGE_URL_REGEX = /\[image\]\s*(https?:\/\/[^\s]+)/g;

const DRAFT_KEY = "archive-inbox-draft";

type BusyAction = "clean" | "prompt" | "tag" | "save" | null;

const normalizeTag = (t: string) =>
  t.toLowerCase().trim().replace(/^#/, "").replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 font-mono text-[9px] leading-none">{children}</kbd>
);

const ArchiveInbox = ({ addBlock, addBlocks, existingTags = [] }: Props) => {
  const { user } = useAuth();
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(DRAFT_KEY) || ""; } catch { return ""; }
  });
  const [busy, setBusy] = useState<BusyAction>(null);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const processing = busy !== null;
  const items = text.trim() ? text.split("---").map((s) => s.trim()).filter(Boolean) : [];

  const updateText = (val: string) => {
    setText(val);
    try { localStorage.setItem(DRAFT_KEY, val); } catch {}
  };

  const clearDraft = () => {
    setText("");
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  const getSelection = () => {
    const el = textareaRef.current;
    if (!el) return null;
    const { selectionStart: start, selectionEnd: end } = el;
    if (start === end) return null;
    return { start, end, value: text.slice(start, end) };
  };

  const spliceOrReplace = (sel: { start: number; end: number } | null, replacement: string) => {
    if (sel) updateText(text.slice(0, sel.start) + replacement + text.slice(sel.end));
    else updateText(replacement);
  };

  // Extract image URLs from text for thumbnail preview
  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    let match;
    const regex = new RegExp(IMAGE_URL_REGEX.source, "g");
    while ((match = regex.exec(text)) !== null) urls.push(match[1]);
    return urls;
  }, [text]);

  const uploadImage = useCallback(async (file: File) => {
    if (!user) { toast.error("Sign in to upload images"); return null; }
    if (!file.type.startsWith("image/")) { toast.error("Only image files are supported"); return null; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB"); return null; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("archive-images").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("archive-images").getPublicUrl(path);
      return urlData.publicUrl;
    } catch (e: any) {
      console.error("Upload error:", e);
      toast.error(e?.message || "Image upload failed");
      return null;
    } finally { setUploading(false); }
  }, [user]);

  const insertImageUrl = useCallback((url: string) => {
    const el = textareaRef.current;
    const tag = `[image] ${url}`;
    if (el) {
      const start = el.selectionStart;
      const before = text.slice(0, start);
      const after = text.slice(start);
      const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      const suffix = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
      updateText(before + prefix + tag + suffix + after);
    } else {
      updateText(text ? text + "\n" + tag : tag);
    }
    toast.success("Image added");
  }, [text]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    for (const file of files) { const url = await uploadImage(file); if (url) insertImageUrl(url); }
  }, [uploadImage, insertImageUrl]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const handleDragLeave = useCallback(() => setDragging(false), []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    for (const file of files) { const url = await uploadImage(file); if (url) insertImageUrl(url); }
  }, [uploadImage, insertImageUrl]);

  const extractHashtags = (raw: string): { cleanContent: string; tags: string[] } => {
    const tagRegex = /#([a-zA-Z0-9_-]+)/g;
    const tags: string[] = [];
    let match;
    while ((match = tagRegex.exec(raw)) !== null) {
      const tag = match[1].toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
    }
    const cleanContent = raw.replace(tagRegex, "").replace(/  +/g, " ").trim();
    return { cleanContent, tags };
  };

  // Save
  const handleQuickSave = async () => {
    if (items.length === 0 || processing) return;
    setBusy("save");
    try {
      const blocks: Partial<ArchiveBlock>[] = items.map((content) => {
        const { cleanContent, tags } = extractHashtags(content);
        return {
          title: cleanContent.slice(0, 60).replace(/\n/g, " "),
          content: cleanContent,
          pillars: [],
          directions: [],
          tags,
        };
      });
      await addBlocks(blocks);
      toast.success(`${blocks.length} block(s) saved`);
      clearDraft();
    } catch { toast.error("Save failed"); }
    setBusy(null);
  };

  const handleAIError = (e: any, fallback: string) => {
    console.error(e);
    if (e?.message?.includes("Rate limit")) toast.error("Rate limit exceeded, try again later");
    else if (e?.message?.includes("Payment")) toast.error("Payment required. Add credits");
    else toast.error(e?.message || fallback);
  };

  // AI Clean
  const handleAIClean = async (prompt?: string) => {
    if (!text.trim() || processing) return;
    const sel = getSelection();
    const target = sel ? sel.value : text;
    if (!target.trim()) return;
    setBusy(prompt ? "prompt" : "clean");
    try {
      const body: Record<string, string> = { rawText: target };
      if (prompt) body.customPrompt = prompt;
      const { data, error } = await supabase.functions.invoke("ai-archive-clean", { body });
      if (error) throw error;
      const cleaned = data?.cleanedText;
      if (cleaned) {
        spliceOrReplace(sel, cleaned);
        toast.success(sel ? "Selection cleaned" : "Cleaned & split. Review, then save");
      } else {
        toast.error("AI returned no result");
      }
    } catch (e: any) { handleAIError(e, "AI cleaning failed"); }
    setBusy(null);
  };

  const handleAIByPrompt = async () => {
    if (!customPrompt.trim()) return;
    await handleAIClean(customPrompt);
    setShowPromptInput(false);
    setCustomPrompt("");
  };

  // AI Tag. Appends #tags at the end of each item, inline in the textarea
  const handleAITag = async () => {
    if (!text.trim() || processing) return;
    const sel = getSelection();
    const target = sel ? sel.value : text;
    if (!target.trim()) return;
    setBusy("tag");
    try {
      const targetItems = target.split("---").map((s) => s.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("ai-suggest-tags", {
        body: { items: targetItems, existingTags },
      });
      if (error) throw error;
      const suggested: string[][] = data?.tags || [];
      let added = 0;
      const tagged = targetItems.map((item, i) => {
        const already = new Set((item.match(/#([a-zA-Z0-9_-]+)/g) || []).map((t) => t.slice(1).toLowerCase()));
        const fresh = (suggested[i] || [])
          .map(normalizeTag)
          .filter((t, idx, arr) => t && !already.has(t) && arr.indexOf(t) === idx);
        added += fresh.length;
        return fresh.length ? `${item} ${fresh.map((t) => `#${t}`).join(" ")}` : item;
      });
      if (added === 0) {
        toast.info("No new tags to add");
      } else {
        const result = tagged.length > 1 ? tagged.join("\n\n---\n\n") : tagged[0];
        spliceOrReplace(sel, result);
        toast.success(`${added} tag(s) added`);
      }
    } catch (e: any) { handleAIError(e, "AI tagging failed"); }
    setBusy(null);
  };

  // Keyboard shortcuts. Scoped to textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "enter") {
      e.preventDefault();
      handleQuickSave();
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (key === "t") { e.preventDefault(); handleAITag(); }
      else if (key === "c") { e.preventDefault(); handleAIClean(); }
      else if (key === "p") { e.preventDefault(); setShowPromptInput((v) => !v); }
    }
  };

  const actionBtn =
    "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border transition-all duration-200 disabled:opacity-35 disabled:pointer-events-none";
  const ghostBtn =
    `${actionBtn} text-muted-foreground border-white/10 bg-white/[0.03] hover:text-foreground hover:bg-white/[0.06] hover:border-white/20`;

  return (
    <div className="space-y-4">
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">📥 Paste your knowledge</h3>
          <div className="flex items-center gap-2">
            {uploading && <span className="text-xs text-muted-foreground animate-pulse">⏳ Uploading...</span>}
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                {items.length} item{items.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-xl transition-all ${dragging ? "ring-2 ring-primary ring-dashed" : ""}`}
        >
          {dragging && (
            <div className="absolute inset-0 z-10 bg-primary/10 backdrop-blur-sm rounded-xl flex items-center justify-center border-2 border-dashed border-primary/50">
              <div className="flex flex-col items-center gap-2 text-primary">
                <Upload size={28} />
                <span className="text-sm font-semibold">Drop image here</span>
              </div>
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => updateText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder="Paste notes, Discord logs, ideas, links, or images here...&#10;&#10;Separate items with --- and tag inline with #tags&#10;Paste images with Ctrl+V or drag & drop them here"
            className="min-h-[200px] bg-background/50 border-white/10 text-sm"
          />
        </div>

        {imageUrls.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {imageUrls.map((url, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10 group">
                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                <button
                  onClick={() => {
                    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const lineRegex = new RegExp(`\\n?\\[image\\]\\s*${escaped}\\n?`, 'g');
                    updateText(text.replace(lineRegex, '\n').trim());
                    toast.success("Image removed");
                  }}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => handleAIClean()}
            disabled={!text.trim() || processing}
            title="AI Clean + Split (Alt+C)"
            className={ghostBtn}
          >
            {busy === "clean" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Clean
          </button>
          <button
            onClick={handleAITag}
            disabled={!text.trim() || processing}
            title="AI Tags (Alt+T). Appends #tags inline"
            className={ghostBtn}
          >
            {busy === "tag" ? <Loader2 size={13} className="animate-spin" /> : <Hash size={13} />}
            Tag
          </button>
          <button
            onClick={() => setShowPromptInput((v) => !v)}
            disabled={!text.trim() || processing}
            title="AI by custom prompt (Alt+P)"
            className={`${actionBtn} ${
              showPromptInput
                ? "text-foreground border-primary/40 bg-primary/10"
                : "text-muted-foreground border-white/10 bg-white/[0.03] hover:text-foreground hover:bg-white/[0.06] hover:border-white/20"
            }`}
          >
            {busy === "prompt" ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
            Prompt
          </button>
          <button
            onClick={handleQuickSave}
            disabled={items.length === 0 || processing}
            title="Save (Ctrl+Enter)"
            className={`${actionBtn} ml-auto px-4 font-semibold text-primary-foreground border-transparent bg-primary/85 hover:bg-primary hover:shadow-[0_0_16px_hsl(var(--primary)/0.35)]`}
          >
            {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>
        </div>

        {showPromptInput && (
          <div className="flex gap-2">
            <Input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder='e.g. "Group by topic", "Translate to English", "Extract only links"'
              className="bg-background/50 border-white/10 text-sm flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAIByPrompt();
                else if (e.key === "Escape") setShowPromptInput(false);
              }}
            />
            <button
              onClick={handleAIByPrompt}
              disabled={!customPrompt.trim() || processing}
              className={`${actionBtn} px-4 font-semibold text-primary-foreground border-transparent bg-primary/85 hover:bg-primary`}
            >
              Run
            </button>
          </div>
        )}

        {/* Shortcut hints */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/50">
          <span className="flex items-center gap-1"><Kbd>Ctrl</Kbd><Kbd>↵</Kbd> save</span>
          <span className="flex items-center gap-1"><Kbd>Alt</Kbd><Kbd>T</Kbd> tags</span>
          <span className="flex items-center gap-1"><Kbd>Alt</Kbd><Kbd>C</Kbd> clean</span>
          <span className="flex items-center gap-1"><Kbd>Alt</Kbd><Kbd>P</Kbd> prompt</span>
          <span className="ml-auto hidden sm:inline">highlight text to run AI on that part only</span>
        </div>
      </div>

      {/* Preview */}
      {items.length > 1 && (
        <div className="glass-card p-4 space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Preview ({items.length} items)</h4>
          {items.map((item, i) => (
            <div key={i} className="p-3 rounded-xl bg-background/30 border border-white/5 text-sm text-foreground/80 line-clamp-2">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArchiveInbox;