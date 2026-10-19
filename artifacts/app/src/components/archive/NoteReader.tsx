import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import ChunkErrorBoundary, { reloadIfOnline } from "@/components/ChunkErrorBoundary";
import type { ArchiveBlock } from "@/lib/archive-data";
import { lazyModule, useOpenCount } from "@/lib/lazy-module";

// The reader and the Markdown renderer it brings (the one Wykłady uses) load
// on the first open, or before it: on idle, or when the pointer reaches a list.
const ArchiveReader = lazyModule(() => import("./ArchiveReader"));

export const preloadNoteReader = () => void ArchiveReader.preload();

/** A note to read, the list it was opened from in the order shown, and which open this is. */
export interface ReaderRequest {
  id: string;
  list: ArchiveBlock[];
  n: number;
}

let opens = 0;

/** What a list hands the reader when a note is opened from it. */
export function readerRequest(block: ArchiveBlock, list: readonly ArchiveBlock[]): ReaderRequest {
  return { id: block.id, list: list.some((b) => b.id === block.id) ? [...list] : [block], n: ++opens };
}

interface Props {
  request: ReaderRequest | null;
  /** Every note as it is now. */
  blocks: ArchiveBlock[];
  /** The list's name, for the way back ("Library"). */
  from: string;
  onClose: () => void;
  onEdit: (block: ArchiveBlock) => void;
  onUpdate: (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

/** While the reader's code arrives (only without the prefetch): the page dims after a beat. */
function ReaderLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 animate-in fade-in-0 duration-200 delay-150 fill-mode-both" aria-busy="true">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Opening the note" />
    </div>
  );
}

/**
 * The full-page note reader, code-split. Mounted from the first open on, so a
 * reader whose code could not be fetched (offline) closes, says so, and tries
 * again on the next open.
 */
export default function NoteReader({ request, onClose, ...rest }: Props) {
  const opened = useOpenCount(request !== null);
  if (opened === 0) return null;
  return (
    <ChunkErrorBoundary
      fallback={null}
      resetKey={opened}
      onChunkError={() => {
        onClose();
        toast.error("Couldn't open the note. Check your connection, then reload.", {
          action: { label: "Reload", onClick: () => void reloadIfOnline() },
        });
      }}
    >
      <Suspense fallback={request ? <ReaderLoading /> : null}>
        {request && <ArchiveReader key={request.n} snapshot={request.list} initialId={request.id} onClose={onClose} {...rest} />}
      </Suspense>
    </ChunkErrorBoundary>
  );
}
