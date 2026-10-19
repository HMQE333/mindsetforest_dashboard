import { useMemo, useRef, useState, type ReactNode } from "react";
import { Check, FolderInput, FolderPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ArchiveBlock } from "@/lib/archive-data";
import { isTypeTag, normaliseTag } from "@/lib/archive-tags";
import { UNTAGGED, noteTags, tagStats } from "./archive-index";
import { addToFolder, folderLabel, moveToFolder } from "./folder-ops";
import { applyWithUndo, useSavedFolders } from "./folder-store";

type UpdateBlock = (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;

/**
 * "Folder…": put notes in a folder without dragging (the phone's way, and the
 * peek's and the reader's). Add keeps the note's other folders; Move takes it
 * out of the folder being viewed, or, with none viewed, out of every folder it
 * is in, then into the one picked. Typing a name that is not a folder yet
 * offers to create it. Every change has an Undo.
 */
export default function FolderPicker({
  notes,
  blocks,
  viewed,
  updateBlock,
  children,
  align = "end",
  onDone,
}: {
  /** The notes to file (one, or a selection). */
  notes: readonly ArchiveBlock[];
  /** Every note: the folders to offer. */
  blocks: readonly ArchiveBlock[];
  /** The folder the Library is showing (Move takes the notes out of it). */
  viewed: string | null;
  updateBlock: UpdateBlock;
  /** The trigger button. */
  children: ReactNode;
  align?: "start" | "center" | "end";
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-[min(20rem,calc(100vw-2rem))] border-white/10 p-0" onClick={(e) => e.stopPropagation()}>
        {open && (
          <PickerBody
            notes={notes}
            blocks={blocks}
            viewed={viewed && viewed !== UNTAGGED ? viewed : null}
            updateBlock={updateBlock}
            onPicked={() => {
              setOpen(false);
              onDone?.();
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function PickerBody({
  notes,
  blocks,
  viewed,
  updateBlock,
  onPicked,
}: {
  notes: readonly ArchiveBlock[];
  blocks: readonly ArchiveBlock[];
  viewed: string | null;
  updateBlock: UpdateBlock;
  onPicked: () => void;
}) {
  const { folders: saved } = useSavedFolders();
  const [mode, setMode] = useState<"add" | "move">("add");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Read once per open: every folder, with how many notes it holds.
  const all = useMemo(() => {
    const stats = tagStats(blocks);
    const paths = new Set<string>([...stats.folderCounts.keys(), ...saved]);
    return [...paths].sort((a, b) => a.localeCompare(b, "pl")).map((path) => ({ path, count: stats.folderCounts.get(path) ?? 0 }));
  }, [blocks, saved]);
  const has = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of noteTags(n).folders) set.add(t);
    return set;
  }, [notes]);

  const typed = normaliseTag(query);
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const shown = q ? all.filter((f) => f.path.includes(q) || f.path.includes(typed)) : all;
  const canCreate = !!typed && !isTypeTag(typed) && !all.some((f) => f.path === typed);
  const rows = [...shown.map((f) => ({ ...f, create: false })), ...(canCreate ? [{ path: typed, count: 0, create: true }] : [])];
  const at = Math.min(cursor, Math.max(0, rows.length - 1));

  const pick = async (path: string) => {
    const list = mode === "move" ? moveToFolder(notes, path, viewed) : addToFolder(notes, path);
    onPicked();
    const one = notes.length === 1;
    if (list.length === 0) return;
    await applyWithUndo(list, updateBlock, (n) =>
      mode === "move"
        ? `Moved ${one ? "the note" : `${n} notes`} to ${folderLabel(path)}`
        : `Added ${one ? "the note" : `${n} notes`} to ${folderLabel(path)}`,
    );
  };

  const outOf = viewed ? folderLabel(viewed, 30) : has.size ? "its folders" : null;

  return (
    <div className="flex max-h-[min(26rem,70vh)] flex-col" lang="en">
      <div className="flex gap-1 border-b border-white/10 p-2" role="radiogroup" aria-label="Add or move">
        {(["add", "move"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${mode === m ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}
          >
            {m === "add" ? "Add to folder" : "Move to folder"}
          </button>
        ))}
      </div>
      <p className="px-3 pt-2 text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
        {mode === "add" ? "Keeps the folders it is in." : outOf ? `Takes it out of ${outOf} first.` : "It is in no folder yet: same as Add."}
      </p>
      <div className="p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter" && rows[at]) {
              e.preventDefault();
              void pick(rows[at].path);
            }
          }}
          placeholder="Find or create a folder…"
          aria-label="Folder name"
          className="h-9 w-full rounded-lg border border-white/10 bg-background/60 px-2.5 text-sm outline-none focus:border-primary/50"
        />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-1 pb-2" role="listbox" aria-label="Folders">
        {rows.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No folders yet. Type a name to create one.</p>}
        {rows.map((r, i) => {
          const depth = r.create ? 0 : r.path.split("/").length - 1;
          const name = r.create ? r.path : (r.path.split("/").pop() ?? r.path);
          return (
            <button
              key={`${r.create ? "+" : ""}${r.path}`}
              type="button"
              role="option"
              aria-selected={i === at}
              onMouseEnter={() => setCursor(i)}
              onClick={() => void pick(r.path)}
              className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${i === at ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-white/5"}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              title={`#${r.path}`}
            >
              {r.create ? <FolderPlus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> : <FolderInput className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{r.create ? `Create #${name}` : name}</span>
              {has.has(r.path) && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Already in it" />}
              {!r.create && <span className="shrink-0 text-[10px] tabular-nums opacity-60">{r.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
