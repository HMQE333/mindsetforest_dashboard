import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Video summaries (link_summaries), made by the ai-video-summary function on
 * request and attached to the link, not to a note.
 */
export interface LinkSummary {
  id: string;
  video_id: string;
  url: string;
  title: string;
  channel: string;
  status: "none" | "transcribing" | "summarizing" | "ready" | "error";
  error: string | null;
  transcript: string;
  summary: string;
  workshop: string;
  workshop_status: "none" | "running" | "ready" | "error";
  workshop_error: string | null;
  qa: { q: string; a: string; at: string }[];
  cost_usd: number | string;
  updated_at: string;
}

export type LinkSummaryMeta = Pick<LinkSummary, "video_id" | "title" | "status" | "workshop_status">;

export const summaryBusy = (s?: Pick<LinkSummary, "status" | "workshop_status"> | null) =>
  !!s && (s.status === "transcribing" || s.status === "summarizing" || s.workshop_status === "running");

/** Calls the function; a failure comes back as an Error with the function's own message. */
export async function invokeVideo(body: { action: "summarize" | "workshop" | "ask"; url: string; question?: string }) {
  const { data, error } = await supabase.functions.invoke("ai-video-summary", { body });
  if (error) {
    let message = error.message;
    try {
      const json = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
      if (json?.error) message = json.error;
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as { row?: LinkSummary; answer?: { q: string; a: string; at: string } };
}

export async function loadSummary(videoId: string): Promise<LinkSummary | null> {
  const { data } = await supabase.from("link_summaries" as never).select("*").eq("video_id", videoId).maybeSingle();
  return (data as LinkSummary | null) ?? null;
}

export type WorkshopNote = Pick<LinkSummary, "video_id" | "url" | "title" | "channel" | "workshop" | "updated_at">;

/** Every finished workshop, newest first: the layer of craft notes built up over time. */
export async function loadWorkshops(): Promise<WorkshopNote[]> {
  const { data } = await supabase
    .from("link_summaries" as never)
    .select("video_id,url,title,channel,workshop,updated_at")
    .eq("workshop_status", "ready")
    .order("updated_at", { ascending: false });
  return (data as WorkshopNote[] | null) || [];
}

/** All workshop notes as one Markdown file, to read elsewhere or hand to an editing tool. */
export function workshopsMarkdown(notes: WorkshopNote[]): string {
  const head = `# Workshop notes\n\nHow the saved videos are made: hook, structure, visuals, captions, b-roll, pacing, title and thumbnail. ${notes.length} ${notes.length === 1 ? "video" : "videos"}, exported ${new Date().toISOString().slice(0, 10)}.\n`;
  return [head, ...notes.map((n) => `---\n\n# ${n.title}\n${n.channel} · ${n.url}\n\n${n.workshop.trim()}\n`)].join("\n");
}

/** Which videos have a summary or workshop, for the markers on link rows. */
export function useLinkSummaryIndex() {
  const { user } = useAuth();
  const [index, setIndex] = useState<Map<string, LinkSummaryMeta>>(new Map());
  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("link_summaries" as never)
      .select("video_id,title,status,workshop_status")
      .eq("user_id", user.id);
    setIndex(new Map(((data as LinkSummaryMeta[] | null) || []).map((r) => [r.video_id, r])));
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { index, refresh };
}
