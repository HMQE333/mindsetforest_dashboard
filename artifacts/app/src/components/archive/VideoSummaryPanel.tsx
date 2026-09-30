import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ExternalLink, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { invokeVideo, loadSummary, summaryBusy, type LinkSummary } from "@/hooks/useLinkSummaries";
import { splitStamps, videoAt } from "@/lib/youtube";

export type VideoTab = "summary" | "workshop" | "transcript";

export interface VideoPanelTarget {
  url: string;
  videoId: string;
  tab?: VideoTab;
  /** Start this pass on open (the menu items do; the row marker only opens). */
  start?: "summarize" | "workshop";
}

interface Props {
  target: VideoPanelTarget | null;
  onClose: () => void;
  /** Called whenever the row changes, so markers elsewhere can refresh. */
  onChange?: () => void;
}

// ── Inline rendering: **bold** and [mm:ss] links to that moment ─────────

function Inline({ text, videoId }: { text: string; videoId: string }) {
  const out: ReactNode[] = [];
  splitStamps(text).forEach((part, i) => {
    if ("stamp" in part) {
      out.push(
        <a key={i} href={videoAt(videoId, part.seconds)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline tabular-nums">
          {part.stamp}
        </a>,
      );
      return;
    }
    part.text.replace(/ ?-> ?/g, " → ").split(/(\*\*[^*]+\*\*)/g).forEach((chunk, j) => {
      if (!chunk) return;
      out.push(chunk.startsWith("**") && chunk.endsWith("**")
        ? <strong key={`${i}-${j}`} className="font-semibold text-foreground">{chunk.slice(2, -2)}</strong>
        : <span key={`${i}-${j}`}>{chunk}</span>);
    });
  });
  return <>{out}</>;
}

/** The markdown the passes write: headings, bullets, numbered lines, paragraphs. */
function Note({ text, videoId }: { text: string; videoId: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}><Inline text={it} videoId={videoId} /></li>);
    blocks.push(list.ordered
      ? <ol key={blocks.length} className="list-decimal pl-5 space-y-1">{items}</ol>
      : <ul key={blocks.length} className="list-disc pl-5 space-y-1">{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[*-]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet || numbered)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(heading[1].length === 1
        ? <h3 key={blocks.length} className="text-base font-bold text-foreground"><Inline text={heading[2]} videoId={videoId} /></h3>
        : <h4 key={blocks.length} className="text-sm font-semibold text-foreground pt-2"><Inline text={heading[2]} videoId={videoId} /></h4>);
    } else {
      blocks.push(<p key={blocks.length}><Inline text={line} videoId={videoId} /></p>);
    }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-foreground/85">{blocks}</div>;
}

function Waiting({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  );
}

function Offer({ text, button, onClick, busy }: { text: string; button: string; onClick: () => void; busy?: boolean }) {
  return (
    <div className="py-8 text-center space-y-3">
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">{text}</p>
      <button
        onClick={onClick}
        disabled={busy}
        className="text-sm font-semibold px-4 py-2 rounded-xl gradient-purple text-primary-foreground disabled:opacity-50"
      >
        {button}
      </button>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────

/**
 * One video's summary, workshop and transcript, with questions asked of the
 * transcript. Opened from a link's menu (which may start a pass) or from the
 * marker on a summarised link. Polls while a pass runs in the background.
 */
const VideoSummaryPanel = ({ target, onClose, onChange }: Props) => {
  const [row, setRow] = useState<LinkSummary | null>(null);
  const [tab, setTab] = useState<VideoTab>("summary");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<null | "summarize" | "workshop">(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const apply = useCallback((next: LinkSummary | null) => {
    setRow(next);
    onChangeRef.current?.();
  }, []);

  const start = useCallback(async (action: "summarize" | "workshop", url: string) => {
    setStarting(action);
    try {
      const { row: next } = await invokeVideo({ action, url });
      if (next) apply(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start");
    }
    setStarting(null);
  }, [apply]);

  // Open: load what exists, then start the requested pass.
  useEffect(() => {
    if (!target) { setRow(null); return; }
    let cancelled = false;
    setTab(target.tab ?? (target.start === "workshop" ? "workshop" : "summary"));
    setLoading(true);
    void loadSummary(target.videoId).then((existing) => {
      if (cancelled) return;
      setRow(existing);
      setLoading(false);
      if (target.start) void start(target.start, target.url);
    });
    return () => { cancelled = true; };
  }, [target, start]);

  // While a pass runs, read the row again every few seconds.
  const busy = summaryBusy(row);
  useEffect(() => {
    if (!target || !busy) return;
    const timer = window.setInterval(async () => {
      const next = await loadSummary(target.videoId);
      if (next) apply(next);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [target, busy, apply]);

  const ask = async () => {
    const q = question.trim();
    if (!q || !target || asking) return;
    setAsking(true);
    try {
      const { answer } = await invokeVideo({ action: "ask", url: target.url, question: q });
      if (answer) {
        setRow((r) => (r ? { ...r, qa: [...(r.qa || []), answer] } : r));
        setQuestion("");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not answer");
    }
    setAsking(false);
  };

  const videoId = target?.videoId ?? "";
  const cost = Number(row?.cost_usd ?? 0);
  const summarizing = row?.status === "transcribing" || row?.status === "summarizing";

  return (
    <Sheet open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="text-left pr-6">
          <SheetTitle className="leading-snug">{row?.title || "Video"}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {row?.channel && <span>{row.channel}</span>}
            {target && (
              <a href={videoAt(videoId, 0)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Watch
              </a>
            )}
            {cost > 0 && <span className="text-[11px] tabular-nums">spent ${cost.toFixed(3)}</span>}
          </SheetDescription>
        </SheetHeader>

        {loading ? <Waiting label="Loading…" /> : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as VideoTab)} className="mt-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="workshop">Workshop</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="pt-2">
              {row?.status === "ready" ? <Note text={row.summary} videoId={videoId} />
                : row?.status === "transcribing" ? <Waiting label="Watching the video and writing down what is said…" />
                : row?.status === "summarizing" ? <Waiting label="Writing the summary…" />
                : row?.status === "error" ? (
                  <Offer text={row.error || "The summary failed."} button="Try again" busy={!!starting} onClick={() => target && void start("summarize", target.url)} />
                ) : starting === "summarize" ? <Waiting label="Starting…" /> : (
                  <Offer
                    text="The model watches the video once and keeps the transcript; the summary keeps what each part does, not just what it says. About 0.7¢ per minute of video."
                    button="Summarize video"
                    onClick={() => target && void start("summarize", target.url)}
                  />
                )}
            </TabsContent>

            <TabsContent value="workshop" className="pt-2">
              {row?.workshop_status === "ready" ? <Note text={row.workshop} videoId={videoId} />
                : row?.workshop_status === "running" ? <Waiting label="Watching for how it is made…" />
                : row?.workshop_status === "error" ? (
                  <Offer text={row.workshop_error || "The workshop failed."} button="Try again" busy={!!starting} onClick={() => target && void start("workshop", target.url)} />
                ) : starting === "workshop" ? <Waiting label="Starting…" /> : (
                  <Offer
                    text="A second watch, only for the craft: hook, structure, visuals, captions, b-roll, pacing, title and thumbnail, and three things to steal for your next video. About 0.7¢ per minute."
                    button="Analyze the craft"
                    onClick={() => target && void start("workshop", target.url)}
                  />
                )}
            </TabsContent>

            <TabsContent value="transcript" className="pt-2 space-y-4">
              {row?.transcript ? (
                <>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void ask(); } }}
                        placeholder="Ask the video anything…"
                        disabled={asking}
                        className="bg-background/50 border-white/10"
                      />
                      <button
                        onClick={() => void ask()}
                        disabled={asking || !question.trim()}
                        className="shrink-0 px-3 rounded-lg gradient-purple text-primary-foreground disabled:opacity-40"
                        aria-label="Ask"
                      >
                        {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                    {[...(row.qa || [])].reverse().map((x, i) => (
                      <div key={`${x.at}-${i}`} className="rounded-xl bg-muted/30 border border-white/10 p-3 space-y-1.5">
                        <p className="text-sm font-semibold text-foreground">{x.q}</p>
                        <Note text={x.a} videoId={videoId} />
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-white/10 pt-3 space-y-2 text-sm leading-relaxed text-foreground/80">
                    {row.transcript.split("\n").filter((l) => l.trim()).map((line, i) => (
                      <p key={i}><Inline text={line} videoId={videoId} /></p>
                    ))}
                  </div>
                </>
              ) : summarizing ? <Waiting label="The transcript comes first; it is being written…" /> : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  The transcript is made with the summary. Summarize the video, then ask it anything here.
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default VideoSummaryPanel;
