import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
  site: string | null;
}

/**
 * The page title and image for a link, from the link-preview edge function.
 * Cards ask one by one; the asks are batched (40 URLs per call) and kept for
 * the page's life. `undefined` while unknown, `null` when the page has none.
 * When the function is missing or fails, previews stay off for this page.
 */
const known = new Map<string, LinkPreview | null>();
const wanted = new Set<string>();
const tries = new Map<string, number>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let disabled = false;
let version = 0;

function schedule(delay = 60) {
  if (timer || disabled) return;
  timer = setTimeout(flush, delay);
}

async function flush() {
  timer = null;
  const batch = [...wanted].slice(0, 40);
  if (batch.length === 0) return;
  batch.forEach((u) => wanted.delete(u));
  const { data, error } = await supabase.functions.invoke("link-preview", { body: { urls: batch } });
  if (error || !data?.previews) {
    disabled = true;
    return;
  }
  const got = data.previews as Record<string, LinkPreview | null>;
  for (const u of batch) {
    if (u in got) known.set(u, got[u]);
    else {
      // Not fetched yet on the server (it fetches a few per call): ask again shortly, a few times.
      const n = (tries.get(u) ?? 0) + 1;
      tries.set(u, n);
      if (n < 5) wanted.add(u);
      else known.set(u, null);
    }
  }
  version++;
  listeners.forEach((l) => l());
  if (wanted.size) schedule(1500);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useLinkPreview(url: string | null | undefined): LinkPreview | null | undefined {
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    if (!url || disabled || known.has(url) || wanted.has(url)) return;
    wanted.add(url);
    schedule();
  }, [url]);
  return url ? known.get(url) : null;
}
