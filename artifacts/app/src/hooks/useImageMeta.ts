import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ArchiveBlock } from "@/lib/archive-data";
import { blockImages } from "@/components/archive/archive-index";
import { extractPalette, huesOf } from "@/lib/image-palette";

/** What one picture in a note shows (archive_image_meta, written by ai-image-analyze). */
export interface ImageMeta {
  block_id: string;
  url: string;
  kind: string | null;
  description: string | null;
  text_in_image: string | null;
  objects: string[];
  tags: string[];
  colors: { hex: string; share: number; hue: string | null }[];
  hues: string[];
}

/**
 * One store for the whole Archive: the Library's search and colour filter,
 * the Images view and the peek read the same rows. Pictures without a row are
 * analysed in the background, two at a time, while the Archive is open.
 */
let rows = new Map<string, ImageMeta>(); // by url
let version = 0;
let loadedFor: string | null = null;
let ready = false;
const listeners = new Set<() => void>();
const failed = new Set<string>();
const running = new Set<string>();
let queue: { blockId: string; url: string }[] = [];
const emit = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

async function load(userId: string) {
  if (loadedFor === userId) return;
  loadedFor = userId;
  const { data } = await supabase.from("archive_image_meta" as any).select("block_id, url, kind, description, text_in_image, objects, tags, colors, hues").eq("user_id", userId);
  rows = new Map(((data ?? []) as unknown as ImageMeta[]).map((m) => [m.url, m]));
  ready = true;
  emit();
  // Pictures analysed before they had their own embedding get one (only those without; once per session).
  if (rows.size) void supabase.functions.invoke("ai-embed-block", { body: { action: "embed-images" } }).catch(() => null);
}

export async function analyzeImage(blockId: string, url: string): Promise<ImageMeta | null> {
  running.add(url);
  emit();
  try {
    const colors = (await extractPalette(url)) ?? [];
    const { data, error } = await supabase.functions.invoke("ai-image-analyze", { body: { blockId, url, colors, hues: huesOf(colors) } });
    const meta = (data as { meta?: ImageMeta } | null)?.meta;
    if (error || !meta) { failed.add(url); return null; }
    rows = new Map(rows).set(url, meta);
    return meta;
  } catch {
    failed.add(url);
    return null;
  } finally {
    running.delete(url);
    emit();
  }
}

function pump() {
  while (running.size < 2 && queue.length) {
    const next = queue.shift()!;
    if (rows.has(next.url) || running.has(next.url) || failed.has(next.url)) continue;
    void analyzeImage(next.blockId, next.url).then(pump);
  }
}

/** Joined text of a note's pictures, lower case, for keyword search. */
export function imageSearchText(metas: ImageMeta[] | undefined): string {
  if (!metas?.length) return "";
  return metas
    .map((m) => [m.kind, m.description, m.text_in_image, ...(m.objects ?? []), ...(m.tags ?? []), ...(m.hues ?? [])].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();
}

export function useImageMeta(userId?: string | null) {
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => { if (userId) void load(userId); }, [userId]);

  const byBlock = useCallback((blockId: string) => [...rows.values()].filter((m) => m.block_id === blockId), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Queue every picture in these notes that has not been looked at yet. */
  const analyzeMissing = useCallback((blocks: ArchiveBlock[]) => {
    if (!ready) return;
    const have = new Set(queue.map((q) => q.url));
    for (const b of blocks) for (const url of blockImages(b)) {
      if (/^https:\/\//.test(url) && !rows.has(url) && !failed.has(url) && !running.has(url) && !have.has(url)) { queue.push({ blockId: b.id, url }); have.add(url); }
    }
    pump();
  }, []);

  return {
    version,
    rows,
    byUrl: (url: string) => rows.get(url),
    byBlock,
    isAnalyzing: (url: string) => running.has(url),
    pending: queue.length + running.size,
    analyzeMissing,
    analyze: (blockId: string, url: string) => { failed.delete(url); return analyzeImage(blockId, url); },
  };
}

/** Per note: the joined search text and the colour words of its pictures. */
export function blockImageIndex(all: Map<string, ImageMeta>): { text: Map<string, string>; hues: Map<string, Set<string>> } {
  const grouped = new Map<string, ImageMeta[]>();
  for (const m of all.values()) grouped.set(m.block_id, [...(grouped.get(m.block_id) ?? []), m]);
  const text = new Map<string, string>(), hues = new Map<string, Set<string>>();
  for (const [id, metas] of grouped) {
    text.set(id, imageSearchText(metas));
    hues.set(id, new Set(metas.flatMap((m) => m.hues ?? [])));
  }
  return { text, hues };
}
