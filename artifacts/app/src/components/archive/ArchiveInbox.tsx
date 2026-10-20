import { Suspense, useState, useRef, useCallback, useMemo, useEffect, type ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Upload, X, Sparkles, MessageSquare, Hash, Save, Loader2, Copy } from "lucide-react";
import {
  ArchiveSaveError,
  agoText,
  autoTitle,
  findRecentDuplicates,
  inboxNotes,
  splitInboxItems,
  type ArchiveBlock,
} from "@/lib/archive-data";
import { normaliseTag, parseInlineTags } from "@/lib/archive-tags";
import { AI_ACTIONS, aiTooLong } from "@/lib/archive-ai";
import { invokeFunction } from "@/lib/function-error";
import { CREDENTIAL_MESSAGE, looksLikeCredential } from "@/lib/credential-check";
import { formatHotkey, matchesHotkey } from "@/lib/hotkeys";
import { useHotkeys } from "@/hooks/useHotkeys";
import { lazyModule } from "@/lib/lazy-module";
import { fetchNoteAI, useArchiveAI } from "./ArchiveAIProvider";
import type { TagSuggestionListHandle } from "./TagSuggestionList";

// The strip after Save: fetched when the box is first used, so it is in before the first Save ends.
const TagSuggestionList = lazyModule(() => import("./TagSuggestionList"));

/**
 * The Inbox: paste, Save, done. One paste is one note; a text with "---"
 * lines asks once whether it is one note or several (the last answer is the
 * default). #tags in the text become the note's tags and stay in the text.
 * Saving what was saved word for word in the last ten minutes asks first.
 * After Save, the suggested type and tags for what was saved show under the
 * box (Enter accepts, Esc dismisses) while the box is free for the next paste.
 * Clean and Prompt open the AI preview; nothing replaces the text unseen.
 */

interface Props {
  addBlock?: (b: Partial<ArchiveBlock>) => Promise<ArchiveBlock | null>;
  addBlocks: (b: Partial<ArchiveBlock>[]) => Promise<ArchiveBlock[] | unknown>;
  existingTags?: string[];
  /** The Archive's notes, newest first: for "already saved". */
  recent?: readonly ArchiveBlock[];
}

const IMAGE_URL_REGEX = /\[image\]\s*(https?:\/\/[^\s]+)/g;

const DRAFT_KEY = "archive-inbox-draft";
/** "one" or "many": the last answer to "1 note or N notes?". */
const SPLIT_KEY = "archive-inbox-split";

type BusyAction = "clean" | "prompt" | "tag" | "save" | null;

/** The decision Save is waiting for, shown under the box. */
type Pending =
  | { kind: "split"; parts: number }
  | { kind: "dup"; contents: string[]; dups: { index: number; savedAt: string }[] }
  | null;

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 font-mono text-[9px] leading-none">{children}</kbd>
);

const readSplit = (): "one" | "many" => {
  try {
    return localStorage.getItem(SPLIT_KEY) === "many" ? "many" : "one";
  } catch {
    return "one";
  }
};

const ArchiveInbox = ({ addBlocks, existingTags = [], recent = [] }: Props) => {
  const { user } = useAuth();
  const hotkeys = useHotkeys();
  const ai = useArchiveAI();
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(DRAFT_KEY) || ""; } catch { return ""; }
  });
  const textRef = useRef(text);
  textRef.current = text;
  const [busy, setBusy] = useState<BusyAction>(null);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [splitDefault, setSplitDefault] = useState<"one" | "many">(readSplit);
  // What was just saved: the suggestion strip's notes.
  const [justSaved, setJustSaved] = useState<ArchiveBlock[] | null>(null);
  const stripRef = useRef<TagSuggestionListHandle>(null);
  // Saved from here this session, newest first: "already saved" works before the list has caught up.
  const savedHere = useRef<Pick<ArchiveBlock, "content" | "created_at">[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const processing = busy !== null;
  const items = useMemo(() => splitInboxItems(text), [text]);
  const hasText = text.trim().length > 0;

  const updateText = useCallback((val: string) => {
    setText(val);
    textRef.current = val;
    try { localStorage.setItem(DRAFT_KEY, val); } catch { /* private mode */ }
  }, []);

  // A changed text is a new question.
  useEffect(() => setPending(null), [text]);

  const clearDraft = () => updateText("");

  const getSelection = () => {
    const el = textareaRef.current;
    if (!el) return null;
    const { selectionStart: start, selectionEnd: end } = el;
    if (start === end) return null;
    return { start, end, value: text.slice(start, end) };
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
    const current = textRef.current;
    if (el) {
      const start = el.selectionStart;
      const before = current.slice(0, start);
      const after = current.slice(start);
      const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      const suffix = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
      updateText(before + prefix + tag + suffix + after);
    } else {
      updateText(current ? current + "\n" + tag : tag);
    }
    toast.success("Image added");
  }, [updateText]);

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

  // ---- Save ----

  const writeNotes = async (contents: string[]) => {
    if (!contents.length) return;
    setBusy("save");
    setPending(null);
    const blocks: Partial<ArchiveBlock>[] = contents.map((content) => ({
      title: autoTitle(content),
      content,
      pillars: [],
      directions: [],
      // The #tags he wrote, read with the tag rules; the text keeps them.
      tags: parseInlineTags(content),
    }));
    try {
      const saved = ((await addBlocks(blocks)) as ArchiveBlock[] | undefined) ?? [];
      const now = new Date().toISOString();
      savedHere.current = [...contents.map((content) => ({ content, created_at: now })), ...savedHere.current].slice(0, 50);
      toast.success(contents.length === 1 ? "Saved" : `${contents.length} notes saved`);
      clearDraft();
      if (Array.isArray(saved) && saved.length) setJustSaved(saved);
    } catch (e) {
      // A failed save never loses the paste: what did not make it stays in the draft.
      const done = e instanceof ArchiveSaveError ? e.saved : 0;
      const reason = e instanceof Error ? e.message : "Save failed";
      if (done > 0) updateText(contents.slice(done).join("\n\n---\n\n"));
      toast.error(
        done > 0 ? `Saved ${done} of ${contents.length}. The rest is still in the inbox.` : "Nothing was saved. Your text is still in the inbox.",
        { description: reason },
      );
    }
    setBusy(null);
    textareaRef.current?.focus();
  };

  /** Save with the split decided: checks for a just-saved twin first, unless told to save anyway. */
  const saveAs = (split: boolean, force = false) => {
    const contents = inboxNotes(textRef.current, split);
    if (!contents.length) return;
    if (!force) {
      const now = Date.now();
      const seen = new Map<number, string>();
      for (const d of [...findRecentDuplicates(contents, savedHere.current, now), ...findRecentDuplicates(contents, recent, now)]) {
        if (!seen.has(d.index)) seen.set(d.index, d.savedAt);
      }
      if (seen.size) {
        setPending({ kind: "dup", contents, dups: [...seen].map(([index, savedAt]) => ({ index, savedAt })).sort((a, b) => a.index - b.index) });
        return;
      }
    }
    void writeNotes(contents);
  };

  const chooseSplit = (choice: "one" | "many") => {
    setSplitDefault(choice);
    try { localStorage.setItem(SPLIT_KEY, choice); } catch { /* private mode */ }
    saveAs(choice === "many");
  };

  /** Save (the button, Ctrl+Enter). Pressed again while a question is open, it takes the default answer. */
  const handleSave = () => {
    if (!hasText || processing) return;
    if (pending?.kind === "split") return chooseSplit(splitDefault);
    if (pending?.kind === "dup") return void writeNotes(pending.contents);
    if (items.length > 1) {
      setPending({ kind: "split", parts: items.length });
      return;
    }
    saveAs(false);
  };

  // ---- AI on the draft: always through the preview ----

  /** A function's own words for what went wrong. */
  const showError = (e: unknown, fallback: string) => {
    console.error(e);
    toast.error(e instanceof Error && e.message ? e.message : fallback);
  };

  const runOnDraft = (action: "clean" | "prompt", prompt?: string) => {
    if (!hasText || processing) return;
    if (!ai) { toast.error("The AI preview is not available here"); return; }
    const sel = getSelection();
    const snapshot = textRef.current;
    const target = sel ? sel.value : snapshot;
    if (!target.trim()) return;
    const tooLong = aiTooLong(action, target);
    if (tooLong) { toast.error(tooLong); return; }
    if (looksLikeCredential(target.slice(0, 10_000))) { toast.error(CREDENTIAL_MESSAGE); return; }
    ai.preview({
      action,
      subject: sel ? "the selected text" : "Inbox draft",
      original: target,
      fetch: () => fetchNoteAI(action, target, "", prompt),
      replaceLabel: "Use this text",
      replace: async (result) => {
        if (textRef.current !== snapshot) {
          toast.error("The draft changed meanwhile, so nothing was replaced");
          return false;
        }
        const next = sel ? snapshot.slice(0, sel.start) + result + snapshot.slice(sel.end) : result;
        updateText(next);
        toast.success(sel ? "Selection replaced" : "Draft replaced", {
          action: { label: "Undo", onClick: () => { if (textRef.current === next) updateText(snapshot); } },
        });
        window.setTimeout(() => textareaRef.current?.focus(), 0);
        return true;
      },
    });
  };

  const handleAIByPrompt = () => {
    if (!customPrompt.trim()) return;
    runOnDraft("prompt", customPrompt.trim());
    setShowPromptInput(false);
    setCustomPrompt("");
  };

  // AI Tag: appends #tags at the end of each part, in the text (they become the note's tags on Save).
  const handleAITag = async () => {
    if (!hasText || processing) return;
    const sel = getSelection();
    const snapshot = textRef.current;
    const target = sel ? sel.value : snapshot;
    if (!target.trim()) return;
    setBusy("tag");
    try {
      const targetItems = splitInboxItems(target);
      const data = await invokeFunction<{ tags?: string[][] }>("ai-suggest-tags", { items: targetItems, existingTags });
      const suggested: string[][] = data?.tags || [];
      let added = 0;
      const tagged = targetItems.map((item, i) => {
        const already = new Set(parseInlineTags(item));
        const fresh = (suggested[i] || [])
          .map(normaliseTag)
          .filter((t, idx, arr) => t && !already.has(t) && arr.indexOf(t) === idx);
        added += fresh.length;
        return fresh.length ? `${item} ${fresh.map((t) => `#${t}`).join(" ")}` : item;
      });
      if (added === 0) {
        toast.info("No new tags to add");
      } else if (textRef.current !== snapshot) {
        toast.error("The draft changed meanwhile, so no tags were added");
      } else {
        const result = tagged.length > 1 ? tagged.join("\n\n---\n\n") : tagged[0];
        const next = sel ? snapshot.slice(0, sel.start) + result + snapshot.slice(sel.end) : result;
        updateText(next);
        toast.success(`${added} tag${added === 1 ? "" : "s"} added`, {
          action: { label: "Undo", onClick: () => { if (textRef.current === next) updateText(snapshot); } },
        });
      }
    } catch (e) { showError(e, "AI tagging failed"); }
    setBusy(null);
  };

  // Keyboard shortcuts, scoped to the textarea; set in Settings -> Keybinds.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const ev = e.nativeEvent;
    if (matchesHotkey(ev, hotkeys.inboxSave)) { e.preventDefault(); handleSave(); return; }
    if (matchesHotkey(ev, hotkeys.inboxTags)) { e.preventDefault(); void handleAITag(); return; }
    if (matchesHotkey(ev, hotkeys.inboxClean)) { e.preventDefault(); runOnDraft("clean"); return; }
    if (matchesHotkey(ev, hotkeys.inboxPrompt)) { e.preventDefault(); setShowPromptInput((v) => !v); return; }
    if (e.key === "Escape") {
      // One thing at a time: the open question, then the suggestions.
      if (pending) { e.preventDefault(); setPending(null); return; }
      if (justSaved) { e.preventDefault(); stripRef.current?.dismiss(); return; }
    }
    // The box is empty right after a save: Enter takes the suggested tags (once there are some to
    // take; while they load, or when there are none, Enter is a newline as usual).
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && justSaved && !textRef.current.trim() && stripRef.current?.hasChips()) {
      e.preventDefault();
      stripRef.current?.acceptAll();
    }
  };
  const keyHint = (combo: string) => (combo ? ` (${formatHotkey(combo)})` : "");
  const saveKey = hotkeys.inboxSave ? formatHotkey(hotkeys.inboxSave) : "";

  const actionBtn =
    "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border transition-all duration-200 disabled:opacity-35 disabled:pointer-events-none";
  const ghostBtn =
    `${actionBtn} text-muted-foreground border-white/10 bg-white/[0.03] hover:text-foreground hover:bg-white/[0.06] hover:border-white/20`;
  const choiceBtn = (on: boolean) =>
    `${actionBtn} ${on ? "font-semibold text-primary-foreground border-transparent bg-primary/85 hover:bg-primary" : "text-foreground border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"}`;

  const dupCount = pending?.kind === "dup" ? pending.dups.length : 0;
  const dupAll = pending?.kind === "dup" && dupCount === pending.contents.length;

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold">📥 Paste your knowledge</h3>
          <div className="flex items-center gap-2">
            {uploading && <span className="text-xs text-muted-foreground animate-pulse">⏳ Uploading...</span>}
            {items.length > 1 && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg" title="Parts separated by a line of ---">
                {items.length} parts
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
            onFocus={() => void TagSuggestionList.preload()}
            placeholder={"Paste a note, an idea, a link or an image here. One paste is one note.\n\n#tags in the text become the note's tags (they stay in the text).\nSeveral notes at once? Put a line of --- between them.\nImages: Ctrl+V or drag & drop."}
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
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity hover:bg-destructive"
                  aria-label="Remove the image"
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
            onClick={() => runOnDraft("clean")}
            onPointerEnter={ai?.preload}
            disabled={!hasText || processing || ai?.busy}
            title={`Clean${keyHint(hotkeys.inboxClean)}: ${AI_ACTIONS.clean.border} Opens a preview first.`}
            className={ghostBtn}
          >
            {busy === "clean" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Clean
          </button>
          <button
            onClick={() => void handleAITag()}
            disabled={!hasText || processing}
            title={`AI Tags${keyHint(hotkeys.inboxTags)}. Appends #tags to the text (Undo in the toast)`}
            className={ghostBtn}
          >
            {busy === "tag" ? <Loader2 size={13} className="animate-spin" /> : <Hash size={13} />}
            Tag
          </button>
          <button
            onClick={() => setShowPromptInput((v) => !v)}
            onPointerEnter={ai?.preload}
            disabled={!hasText || processing || ai?.busy}
            title={`AI by your prompt${keyHint(hotkeys.inboxPrompt)}. Opens a preview first.`}
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
            onClick={handleSave}
            disabled={!hasText || processing}
            title={`Save${keyHint(hotkeys.inboxSave)}`}
            className={`${actionBtn} ml-auto px-4 font-semibold text-primary-foreground border-transparent bg-primary/85 hover:bg-primary hover:shadow-[0_0_16px_hsl(var(--primary)/0.35)]`}
          >
            {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>
        </div>

        {/* What Save is waiting for: never a dialog, the box stays usable. */}
        {pending?.kind === "split" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs" role="group" aria-label="One note or several">
            <span className="min-w-0 flex-1 basis-56 text-muted-foreground">
              This text has {pending.parts} parts between <code className="text-foreground">---</code> lines. Save it as:
            </span>
            <button type="button" onClick={() => chooseSplit("one")} className={choiceBtn(splitDefault === "one")}>
              1 note
            </button>
            <button type="button" onClick={() => chooseSplit("many")} className={choiceBtn(splitDefault === "many")}>
              {pending.parts} notes
            </button>
            <button type="button" onClick={() => setPending(null)} className="px-1 text-muted-foreground hover:text-foreground" aria-label="Cancel">
              <X size={14} />
            </button>
            {saveKey && <span className="w-full text-[10px] text-muted-foreground/70">{saveKey} again takes the highlighted one (your last choice) · Esc cancels</span>}
          </div>
        )}
        {pending?.kind === "dup" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs" role="alert">
            <Copy size={14} className="shrink-0 text-amber-300" aria-hidden />
            <span className="min-w-0 flex-1 basis-56 text-amber-100">
              {pending.contents.length === 1
                ? `Already saved ${agoText(pending.dups[0].savedAt)}.`
                : `${dupCount} of ${pending.contents.length} notes were already saved in the last 10 minutes.`}
            </span>
            <button type="button" onClick={() => void writeNotes(pending.contents)} className={choiceBtn(false)}>
              Save anyway
            </button>
            {!dupAll && (
              <button
                type="button"
                onClick={() => {
                  const skip = new Set(pending.dups.map((d) => d.index));
                  void writeNotes(pending.contents.filter((_, i) => !skip.has(i)));
                }}
                className={choiceBtn(false)}
              >
                Save only the new {pending.contents.length - dupCount}
              </button>
            )}
            <button type="button" onClick={() => setPending(null)} className="px-1 text-muted-foreground hover:text-foreground" aria-label="Keep editing">
              <X size={14} />
            </button>
            {saveKey && <span className="w-full text-[10px] text-amber-100/60">{saveKey} again saves anyway · Esc keeps editing</span>}
          </div>
        )}

        {showPromptInput && (
          <div className="flex gap-2">
            <Input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder='e.g. "Translate to English", "Group by topic", "Extract only links"'
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
          {([[hotkeys.inboxSave, "save"], [hotkeys.inboxTags, "tags"], [hotkeys.inboxClean, "clean"], [hotkeys.inboxPrompt, "prompt"]] as const)
            .filter(([combo]) => combo)
            .map(([combo, what]) => (
              <span key={what} className="flex items-center gap-1">
                {formatHotkey(combo).split("+").map((k) => <Kbd key={k}>{k === "Enter" ? "↵" : k}</Kbd>)} {what}
              </span>
            ))}
          <span className="ml-auto hidden sm:inline">highlight text to run AI on that part only</span>
        </div>
      </div>

      {/* The suggested tags for what was just saved; the box above is already free for the next paste. */}
      {justSaved && (
        <Suspense
          fallback={
            <p className="glass-card flex items-center gap-1.5 border border-primary/20 p-3 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Looking at your similar notes…
            </p>
          }
        >
          <TagSuggestionList handle={stripRef} notes={justSaved} onClose={() => setJustSaved(null)} />
        </Suspense>
      )}

      {/* Preview of the parts, when the text has --- lines */}
      {items.length > 1 && (
        <div className="glass-card p-4 space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">
            {items.length} parts{splitDefault === "one" ? " (saved as 1 note unless you choose otherwise)" : ""}
          </h4>
          {items.map((item, i) => (
            <div key={i} className="p-3 rounded-xl bg-background/30 border border-white/5 text-sm text-foreground/80 line-clamp-2 [overflow-wrap:anywhere]">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArchiveInbox;
