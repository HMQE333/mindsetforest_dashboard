import { Play, Link2 } from "lucide-react";
import type { ArchiveBlock } from "@/lib/archive-data";
import { typeOf } from "@/lib/archive-tags";
import { useLinkPreview } from "@/hooks/useLinkPreview";
import { noteVideoDuration, socialVideoUrl, transcriptPending } from "@/lib/social-video";
import { blockImages, blockUrls, cardView, classifyUrl, noteWithoutLinks } from "./archive-index";

/**
 * A note's face in the mosaic (mymind-style): the picture when it has one,
 * a video's frame, a quote set as a quote, a link as its page's image and
 * title, else the text. The caption under media is the note's title.
 */
export type MosaicKind = "image" | "video" | "quote" | "link" | "text";

const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/;

export function mosaicKind(b: ArchiveBlock, sensitive: boolean): { kind: MosaicKind; url?: string; videoId?: string } {
  if (sensitive) return { kind: "text" };
  const images = blockImages(b);
  if (images.length) return { kind: "image", url: images[0] };
  const urls = blockUrls(b);
  const yt = urls.map((u) => u.match(YT)?.[1]).find(Boolean);
  if (yt) return { kind: "video", url: urls.find((u) => YT.test(u)), videoId: yt };
  if (typeOf(b.tags ?? []) === "quote") return { kind: "quote" };
  // A note that is mostly a link: its page stands for it.
  if (urls.length && noteWithoutLinks(b.content, 200).length < 140) return { kind: "link", url: urls[0] };
  return { kind: "text" };
}

export default function MosaicFace({ block, sensitive, onImage }: { block: ArchiveBlock; sensitive: boolean; onImage: (url: string) => void }) {
  const view = cardView(block);
  const face = mosaicKind(block, sensitive);
  const preview = useLinkPreview(face.kind === "link" ? face.url : null);
  // A saved reel: its cover plays the part of the video frame; a phone/tracker save may still be waiting for its transcript.
  const reel = !sensitive && !!socialVideoUrl(block.content);
  const duration = reel ? noteVideoDuration(block.content) : null;
  const pending = reel && transcriptPending(block.content, block.created_at);
  const pendingPill = pending ? (
    <p className="mt-1.5 text-center text-[11px] text-amber-200/90 animate-pulse">⏳ transkrypt w drodze</p>
  ) : null;
  const caption = (text: string | null | undefined) =>
    text ? <p className="px-1 pt-1.5 text-[12px] text-muted-foreground truncate text-center">{text}</p> : null;

  if (face.kind === "image") {
    return (
      <div>
        <button type="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onImage(face.url!); }} className="relative block w-full overflow-hidden rounded-xl bg-muted/40">
          <img src={face.url} alt="" loading="lazy" decoding="async" className="w-full h-auto max-h-[28rem] object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
          {reel && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center"><Play className="h-5 w-5 text-white fill-white ml-0.5" /></span>
            </span>
          )}
          {duration && <span className="pointer-events-none absolute bottom-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/65 text-white">{duration}</span>}
        </button>
        {view.imageCount > 1 && <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/60 text-white">+{view.imageCount - 1}</span>}
        {caption(view.title === "Image block" ? null : view.title)}
        {pendingPill}
      </div>
    );
  }
  if (face.kind === "video") {
    return (
      <div>
        <div className="relative overflow-hidden rounded-xl bg-muted/40 aspect-video">
          <img src={`https://i.ytimg.com/vi/${face.videoId}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center"><Play className="h-5 w-5 text-white fill-white ml-0.5" /></span>
          </span>
        </div>
        {caption(view.title)}
      </div>
    );
  }
  if (face.kind === "quote") {
    return (
      <div>
        <div className="rounded-xl bg-white/[0.04] border border-white/10 px-5 py-6 text-center">
          <p className="font-serif text-[17px] leading-snug text-foreground/90 line-clamp-[10] [overflow-wrap:anywhere]">“{block.content.replace(/#[\p{L}\d_/-]+/gu, "").trim()}”</p>
        </div>
      </div>
    );
  }
  if (face.kind === "link") {
    const host = face.url ? classifyUrl(face.url).host : "";
    return (
      <div>
        <div className="overflow-hidden rounded-xl bg-white/[0.04] border border-white/10">
          {preview?.image && (
            <img src={preview.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-auto max-h-64 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
          )}
          <div className="px-3.5 py-3">
            <p className="text-sm font-semibold text-foreground line-clamp-3 [overflow-wrap:anywhere]">{preview?.title || view.title}</p>
            {preview?.description && !preview.image && <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{preview.description}</p>}
          </div>
        </div>
        <p className="px-1 pt-1.5 text-[12px] text-muted-foreground truncate text-center flex items-center justify-center gap-1"><Link2 className="h-3 w-3 shrink-0" />{preview?.site || host}</p>
        {pendingPill}
      </div>
    );
  }
  return (
    <div className={`rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3.5 ${sensitive ? "pt-9 blur-[3px] group-hover:blur-none transition-[filter]" : ""}`}>
      <p className="text-sm font-semibold text-foreground mb-1 [overflow-wrap:anywhere] line-clamp-2">{view.title}</p>
      <p className="text-[13px] leading-relaxed text-foreground/70 whitespace-pre-line line-clamp-[9] [overflow-wrap:anywhere]">{view.preview}</p>
    </div>
  );
}
