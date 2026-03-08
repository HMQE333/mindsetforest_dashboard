import { useState, useRef, useCallback, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import type { ArchiveBlock } from "@/lib/archive-data";

interface Props {
  addBlock: (b: Partial<ArchiveBlock>) => Promise<ArchiveBlock | null>;
  addBlocks: (b: Partial<ArchiveBlock>[]) => Promise<void>;
}

const IMAGE_URL_REGEX = /\[image\]\s*(https?:\/\/[^\s]+)/g;

const DRAFT_KEY = "archive-inbox-draft";

const ArchiveInbox = ({ addBlock, addBlocks }: Props) => {
  const { user } = useAuth();
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(DRAFT_KEY) || ""; } catch { return ""; }
  });
  const [processing, setProcessing] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const items = text.trim() ? text.split("---").map((s) => s.trim()).filter(Boolean) : [];
  const hasSplitItems = items.length > 1;

  // Auto-save draft to localStorage
  const updateText = (val: string) => {
    setText(val);
    try { localStorage.setItem(DRAFT_KEY, val); } catch {}
  };

  const clearDraft = () => {
    setText("");
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  // Extract image URLs from text for thumbnail preview
  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    let match;
    const regex = new RegExp(IMAGE_URL_REGEX.source, "g");
    while ((match = regex.exec(text)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }, [text]);

  // Upload image to storage bucket
  const uploadImage = useCallback(async (file: File) => {
    if (!user) {
      toast.error("Sign in to upload images");
      return null;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return null;
    }

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
    } finally {
      setUploading(false);
    }
  }, [user]);

  // Insert image URL at cursor position
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

  // Handle paste event
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    for (const file of files) {
      const url = await uploadImage(file);
      if (url) insertImageUrl(url);
    }
  }, [uploadImage, insertImageUrl]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);
  const handleDragLeave = useCallback(() => setDragging(false), []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    for (const file of files) {
      const url = await uploadImage(file);
      if (url) insertImageUrl(url);
    }
  }, [uploadImage, insertImageUrl]);

  // Quick Save
  const handleQuickSave = async () => {
    if (items.length === 0) return;
    setProcessing(true);
    try {
      const blocks: Partial<ArchiveBlock>[] = items.map((content) => ({
        title: content.slice(0, 60).replace(/\n/g, " "),
        content,
        pillars: [],
        directions: [],
        tags: [],
      }));
      await addBlocks(blocks);
      toast.success(`${blocks.length} block(s) saved`);
      clearDraft();
    } catch {
      toast.error("Save failed");
    }
    setProcessing(false);
  };

  // AI Clean + Split
  const handleAIClean = async (prompt?: string) => {
    if (!text.trim()) return;
    setProcessing(true);
    try {
      const body: Record<string, string> = { rawText: text };
      if (prompt) body.customPrompt = prompt;
      const { data, error } = await supabase.functions.invoke("ai-archive-clean", { body });
      if (error) throw error;
      const cleaned = data?.cleanedText;
      if (cleaned) {
        updateText(cleaned);
        toast.success("Text cleaned & split — review below, then save");
      } else {
        toast.error("AI returned no result");
      }
    } catch (e: any) {
      console.error(e);
      if (e?.message?.includes("Rate limit")) toast.error("Rate limit exceeded, try again later");
      else if (e?.message?.includes("Payment")) toast.error("Payment required — add credits");
      else toast.error(e?.message || "AI cleaning failed");
    }
    setProcessing(false);
  };

  // AI by Prompt
  const handleAIByPrompt = async () => {
    if (!customPrompt.trim()) return;
    await handleAIClean(customPrompt);
    setShowPromptInput(false);
    setCustomPrompt("");
  };

  // AI Organize + Save
  const handleAIOrganize = async () => {
    if (items.length === 0) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-archive-process", { body: { items } });
      if (error) throw error;
      const processed = data?.blocks || [];
      if (processed.length > 0) {
        await addBlocks(processed);
        toast.success(`${processed.length} block(s) organized & saved`);
        clearDraft();
      } else {
        toast.error("AI returned no results");
      }
    } catch (e: any) {
      console.error(e);
      if (e?.message?.includes("Rate limit")) toast.error("Rate limit exceeded, try again later");
      else if (e?.message?.includes("Payment")) toast.error("Payment required — add credits");
      else toast.error(e?.message || "AI processing failed");
    }
    setProcessing(false);
  };

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

        {/* Drop zone wrapper */}
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
            placeholder="Paste notes, Discord logs, ideas, links, or images here...&#10;&#10;Use AI Clean + Split to auto-separate messy text, or manually separate with ---&#10;Paste images with Ctrl+V or drag & drop them here"
            className="min-h-[200px] bg-background/50 border-white/10 text-sm"
          />
        </div>

        {/* Image thumbnail strip */}
        {imageUrls.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {imageUrls.map((url, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10 group">
                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                <button
                  onClick={() => {
                    // Remove the [image] <url> line from text
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

        {/* Button row */}
        <div className="flex flex-wrap gap-2 items-center">
          <Button onClick={() => handleAIClean()} disabled={!text.trim() || processing} className="gradient-purple text-primary-foreground font-bold glow-sm">
            {processing ? "⏳ Processing..." : "🧹 AI Clean + Split"}
          </Button>
          <Button onClick={() => setShowPromptInput(!showPromptInput)} disabled={!text.trim() || processing} variant="outline" className="border-white/10 font-bold">
            🤖 AI by Prompt
          </Button>
          <div className="ml-auto">
            <Button onClick={handleQuickSave} disabled={items.length === 0 || processing} className="font-bold">
              💾 Save
            </Button>
          </div>
        </div>

        {/* Custom prompt input */}
        {showPromptInput && (
          <div className="flex gap-2">
            <Input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder='e.g. "Group by topic", "Translate to English", "Extract only links"'
              className="bg-background/50 border-white/10 text-sm flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAIByPrompt()}
            />
            <Button onClick={handleAIByPrompt} disabled={!customPrompt.trim() || processing} size="sm" className="gradient-purple text-primary-foreground font-bold">
              Run
            </Button>
          </div>
        )}
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
