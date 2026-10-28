import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getUserClient, jsonResponse } from "../_shared/planner.ts";

/**
 * Title, image and site of web pages, for the Archive mosaic.
 * { urls: string[] } (at most 40) -> { previews: { [url]: { title, description, image, site } | null } }
 * Cached in link_previews (a failed fetch too, retried after a week); at most
 * FETCH_PER_CALL pages are fetched per call, the rest come back on a later call.
 * Only public http(s) hosts; no private addresses, small reads, short timeouts.
 */
const FETCH_PER_CALL = 8;
const MAX_BYTES = 400_000;
const RETRY_FAILED_MS = 7 * 86_400_000;

function publicUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return null; // no literal IPs at all
    return u;
  } catch {
    return null;
  }
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();

function meta(html: string, keys: string[]): string | null {
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return null;
}

async function fetchPreview(u: URL) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(u.href, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MindsetForestPreview/1.0)", Accept: "text/html" },
    });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("html") || !res.body) return null;
    if (!publicUrl(res.url)) return null; // redirected somewhere private
    const reader = res.body.getReader();
    let html = "";
    const dec = new TextDecoder();
    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    const title = meta(html, ["og:title", "twitter:title"]) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "") || null;
    let image = meta(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
    if (image) {
      try {
        const abs = new URL(image, res.url);
        image = abs.protocol === "https:" || abs.protocol === "http:" ? abs.href : null;
      } catch { image = null; }
    }
    return {
      title: title?.slice(0, 300) || null,
      description: meta(html, ["og:description", "description", "twitter:description"])?.slice(0, 500) || null,
      image: image?.slice(0, 1000) || null,
      site: (meta(html, ["og:site_name"]) || new URL(res.url).hostname.replace(/^www\./, "")).slice(0, 100),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const caller = await getUserClient(req);
  if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const urls = [...new Set((Array.isArray(body?.urls) ? body.urls : []).filter((u: unknown): u is string => typeof u === "string" && u.length < 2000))].slice(0, 40);
  if (urls.length === 0) return jsonResponse({ previews: {} });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cached } = await admin.from("link_previews").select("*").in("url", urls);
  const byUrl = new Map((cached ?? []).map((r: Record<string, unknown>) => [r.url as string, r]));
  const previews: Record<string, unknown> = {};
  const toFetch: { url: string; u: URL }[] = [];
  for (const url of urls) {
    const row = byUrl.get(url) as Record<string, unknown> | undefined;
    const stale = row && !row.ok && Date.now() - Date.parse(String(row.fetched_at)) > RETRY_FAILED_MS;
    if (row && !stale) {
      previews[url] = row.ok ? { title: row.title, description: row.description, image: row.image, site: row.site } : null;
      continue;
    }
    const u = publicUrl(url);
    if (!u) { previews[url] = null; continue; }
    if (toFetch.length < FETCH_PER_CALL) toFetch.push({ url, u });
  }
  const fetched = await Promise.all(toFetch.map(async ({ url, u }) => ({ url, p: await fetchPreview(u) })));
  if (fetched.length) {
    await admin.from("link_previews").upsert(
      fetched.map(({ url, p }) => ({ url, ok: !!p, title: p?.title ?? null, description: p?.description ?? null, image: p?.image ?? null, site: p?.site ?? null, fetched_at: new Date().toISOString() })),
    );
    for (const { url, p } of fetched) previews[url] = p;
  }
  return jsonResponse({ previews });
});
