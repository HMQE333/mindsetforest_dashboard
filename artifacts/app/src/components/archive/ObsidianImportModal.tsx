import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  parseMarkdown,
  parseVaultZip,
  heuristicKeep,
  type ParsedObsidianNote,
} from "@/lib/obsidian-import";
import type { ArchiveBlock } from "@/lib/archive-data";

interface Props {
  open: boolean;
  onClose: () => void;
  existingBlocks: ArchiveBlock[];
  addBlocks: (blocks: Partial<ArchiveBlock>[]) => Promise<void>;
}

interface ReviewNote extends ParsedObsidianNote {
  key: string;
  keep: boolean;
  suggested: boolean;
  reason: string;
  isDuplicate: boolean;
}

type Stage = "select" | "processing" | "review" | "importing";

const CLASSIFY_PROMPT = `You are reviewing markdown notes imported from an Obsidian vault to decide which are worth keeping in a personal knowledge archive. The input contains notes separated by lines like "=====NOTE n=====". For each note, decide whether to keep it.
SKIP: empty or stub notes, daily-note templates/scaffolding (just headings, empty bullets, or checklists), and trivial fragments with no real information.
KEEP: notes containing substantive ideas, information, references, or insights.
Respond with ONLY a JSON array (no prose, no markdown code fences). Each element must be {"index": <number matching the NOTE n>, "keep": <true or false>, "reason": "<short reason, max 8 words>"}.`;

const CLASSIFY_BATCH = 12;
const TAG_BATCH = 8;
const SAVE_BATCH = 40;

const ObsidianImportModal = ({ open, onClose, existingBlocks, addBlocks }: Props) => {
  const [stage, setStage] = useState<Stage>("select");
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [skipDupes, setSkipDupes] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStage("select");
    setNotes([]);
    setProgress(0);
    setProgressLabel("");
    setDragging(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const isDuplicate = useCallback(
    (n: ParsedObsidianNote) =>
      existingBlocks.some((b) => b.title === n.title && b.content === n.content),
    [existingBlocks],
  );

  const runAIClassification = useCallback(async (review: ReviewNote[]) => {
    for (let i = 0; i < review.length; i += CLASSIFY_BATCH) {
      const batch = review.slice(i, i + CLASSIFY_BATCH);
      const rawText = batch
        .map((n, j) => `=====NOTE ${j + 1}=====\nTitle: ${n.title}\n${n.content.slice(0, 500)}`)
        .join("\n\n");
      try {
        const { data, error } = await supabase.functions.invoke("ai-archive-clean", {
          body: { rawText, customPrompt: CLASSIFY_PROMPT },
        });
        if (error) throw error;
        let txt: string = data?.cleanedText || "";
        txt = txt.replace(/```json/gi, "").replace(/```/g, "").trim();
        const start = txt.indexOf("[");
        const end = txt.lastIndexOf("]");
        if (start !== -1 && end !== -1) txt = txt.slice(start, end + 1);
        const decisions = JSON.parse(txt) as Array<{ index: number; keep: boolean; reason?: string }>;
        for (const d of decisions) {
          const target = batch[d.index - 1];
          if (target) {
            target.keep = !!d.keep;
            target.suggested = !!d.keep;
            target.reason = d.reason || (d.keep ? "Suggested to keep" : "Suggested to skip");
          }
        }
      } catch {
        // AI failed for this batch. Keep heuristic suggestion already set
      }
      setProgress(Math.round(Math.min(i + CLASSIFY_BATCH, review.length) / review.length * 100));
      setProgressLabel(
        `AI reviewing ${Math.min(i + CLASSIFY_BATCH, review.length)} / ${review.length} notes…`,
      );
    }
    return review;
  }, []);

  const processNotes = useCallback(
    async (parsed: ParsedObsidianNote[]) => {
      if (parsed.length === 0) {
        toast.error("No markdown notes found");
        reset();
        return;
      }
      setStage("processing");
      setProgress(0);
      setProgressLabel(`Parsed ${parsed.length} notes. Starting AI review…`);

      const review: ReviewNote[] = parsed.map((n, i) => {
        const h = heuristicKeep(n);
        return {
          ...n,
          key: `${i}-${n.fileName}`,
          keep: h.keep,
          suggested: h.keep,
          reason: h.reason,
          isDuplicate: isDuplicate(n),
        };
      });

      await runAIClassification(review);
      setNotes([...review]);
      setStage("review");
    },
    [isDuplicate, reset, runAIClassification],
  );

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      const zip = files.find((f) => f.name.toLowerCase().endsWith(".zip"));
      const mdFiles = files.filter((f) => f.name.toLowerCase().endsWith(".md"));

      try {
        let parsed: ParsedObsidianNote[] = [];
        if (zip) {
          const buf = new Uint8Array(await zip.arrayBuffer());
          parsed = parseVaultZip(buf);
        } else if (mdFiles.length > 0) {
          for (const f of mdFiles) {
            try {
              parsed.push(parseMarkdown(f.name, await f.text()));
            } catch {
              // skip unreadable file, continue
            }
          }
        } else {
          toast.error("Select .md files or a .zip of your vault");
          return;
        }
        await processNotes(parsed);
      } catch (e) {
        console.error("Obsidian import error:", e);
        toast.error("Failed to read files. Is the .zip a valid vault export?");
        reset();
      }
    },
    [processNotes, reset],
  );

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      await handleFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleFiles],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      await handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const toggle = useCallback((key: string) => {
    setNotes((prev) => prev.map((n) => (n.key === key ? { ...n, keep: !n.keep } : n)));
  }, []);

  const setAll = useCallback((val: boolean) => {
    setNotes((prev) => prev.map((n) => ({ ...n, keep: val })));
  }, []);

  const selectedCount = notes.filter((n) => n.keep).length;
  const suggestedCount = notes.filter((n) => n.suggested).length;

  const handleImport = useCallback(async () => {
    let selected = notes.filter((n) => n.keep);
    if (skipDupes) selected = selected.filter((n) => !n.isDuplicate);
    if (selected.length === 0) {
      toast.info(skipDupes ? "Nothing to import (all selected are duplicates)" : "No notes selected");
      return;
    }

    setStage("importing");
    setProgress(0);
    setProgressLabel(`Auto-tagging ${selected.length} notes…`);

    const finalBlocks: Partial<ArchiveBlock>[] = [];
    for (let i = 0; i < selected.length; i += TAG_BATCH) {
      const batch = selected.slice(i, i + TAG_BATCH);
      try {
        const items = batch.map((n) => `Title: ${n.title}\n${n.content}`);
        const { data, error } = await supabase.functions.invoke("ai-archive-process", {
          body: { items },
        });
        if (error) throw error;
        const aiBlocks: any[] = data?.blocks || [];
        batch.forEach((n, j) => {
          const ai = aiBlocks[j];
          finalBlocks.push({
            title: n.title,
            content: n.content,
            pillars: Array.isArray(ai?.pillars) ? ai.pillars : [],
            directions: Array.isArray(ai?.directions) ? ai.directions : [],
            tags: Array.from(new Set([...n.tags, ...(Array.isArray(ai?.tags) ? ai.tags : [])])),
            source_url: null,
          });
        });
      } catch {
        // AI tagging failed for this batch. Save with parsed tags only
        batch.forEach((n) => {
          finalBlocks.push({
            title: n.title,
            content: n.content,
            pillars: [],
            directions: [],
            tags: n.tags,
            source_url: null,
          });
        });
      }
      setProgress(Math.round(Math.min(i + TAG_BATCH, selected.length) / selected.length * 100));
      setProgressLabel(`Auto-tagged ${Math.min(i + TAG_BATCH, selected.length)} / ${selected.length}…`);
    }

    let saved = 0;
    for (let i = 0; i < finalBlocks.length; i += SAVE_BATCH) {
      const chunk = finalBlocks.slice(i, i + SAVE_BATCH);
      await addBlocks(chunk);
      saved += chunk.length;
      setProgressLabel(`Saving ${saved} / ${finalBlocks.length}…`);
    }

    toast.success(`Imported ${finalBlocks.length} note${finalBlocks.length === 1 ? "" : "s"} into your Archive`);
    handleClose();
  }, [notes, skipDupes, addBlocks, handleClose]);

  const dupeCount = notes.filter((n) => n.keep && n.isDuplicate).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="glass-card border-white/10 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">🪨</span> Import from Obsidian
          </DialogTitle>
          <DialogDescription>
            Bring markdown notes from your vault into the Archive. AI suggests which to keep,
            then auto-tags them with pillars, directions & hashtags.
          </DialogDescription>
        </DialogHeader>

        {stage === "select" && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-all cursor-pointer ${
              dragging ? "border-primary bg-primary/10" : "border-white/15 hover:border-primary/40"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mx-auto mb-3 text-muted-foreground" size={32} />
            <p className="font-semibold">Drop <code>.md</code> files or a vault <code>.zip</code> here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.zip"
              multiple
              className="hidden"
              onChange={onFileSelected}
            />
          </div>
        )}

        {(stage === "processing" || stage === "importing") && (
          <div className="py-8 space-y-4">
            <p className="text-center text-sm text-muted-foreground animate-pulse">{progressLabel}</p>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {stage === "review" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-semibold text-foreground">{notes.length}</span> parsed ·
                <span className="text-emerald-400 font-semibold"> {suggestedCount}</span> suggested ·
                <span className="text-primary font-semibold"> {selectedCount}</span> selected
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAll(true)}>Select all</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAll(false)}>None</Button>
              </div>
            </div>

            <ScrollArea className="h-[320px] rounded-xl border border-white/10 p-2">
              <div className="space-y-2">
                {notes.map((n) => (
                  <label
                    key={n.key}
                    className="flex gap-3 p-3 rounded-lg bg-background/40 hover:bg-background/60 cursor-pointer transition-colors"
                  >
                    <Checkbox checked={n.keep} onCheckedChange={() => toggle(n.key)} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText size={13} className="text-muted-foreground shrink-0" />
                        <span className="font-semibold text-sm truncate">{n.title}</span>
                        {n.suggested ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] px-1.5 py-0">keep</Badge>
                        ) : (
                          <Badge className="bg-muted/50 text-muted-foreground border-0 text-[10px] px-1.5 py-0">skip</Badge>
                        )}
                        {n.isDuplicate && (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-0 text-[10px] px-1.5 py-0">duplicate</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {n.content.slice(0, 180) || "(empty)"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {n.reason && <span className="text-[10px] text-muted-foreground/70 italic">{n.reason}</span>}
                        {n.tags.slice(0, 5).map((t) => (
                          <span key={t} className="text-[10px] text-primary/80">#{t}</span>
                        ))}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>

            {dupeCount > 0 && (
              <label className="flex items-center gap-2 cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={skipDupes}
                  onChange={(e) => setSkipDupes(e.target.checked)}
                  className="rounded border-white/20 bg-background/50 accent-primary"
                />
                <span className="text-sm text-muted-foreground">
                  Skip {dupeCount} duplicate{dupeCount === 1 ? "" : "s"} (same title &amp; content)
                </span>
              </label>
            )}
          </div>
        )}

        {(stage === "select" || stage === "review") && (
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            {stage === "review" && (
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0}
                className="gradient-purple text-primary-foreground"
              >
                Import {skipDupes ? Math.max(0, selectedCount - dupeCount) : selectedCount} note
                {(skipDupes ? Math.max(0, selectedCount - dupeCount) : selectedCount) === 1 ? "" : "s"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ObsidianImportModal;
