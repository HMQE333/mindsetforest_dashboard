import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight, Folder, FolderOpen, FolderPlus, Inbox, Layers, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ArchiveBlock } from "@/lib/archive-data";
import { inFolder, normaliseTag, tagPaths, type TagNode } from "@/lib/archive-tags";
import { UNTAGGED } from "./archive-index";
import { NOTE_DRAG_TYPE, deleteFolder, folderLabel, folderNameProblem, folderReach, renameFolder } from "./folder-ops";
import { applyWithUndo, useSavedFolders } from "./folder-store";
import { useRemembered } from "./remembered";

/** How long a dragged card waits over a closed folder before it opens. */
const SPRING_OPEN_MS = 600;

const isNoteDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(NOTE_DRAG_TYPE);

function readNoteDrag(e: DragEvent): string[] {
  try {
    const ids = JSON.parse(e.dataTransfer.getData(NOTE_DRAG_TYPE));
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

type UpdateBlock = (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;

interface Props {
  tree: TagNode[];
  total: number;
  untagged: number;
  /** The folder shown: a path, UNTAGGED, or null (all notes). */
  value: string | null;
  onChange: (folder: string | null) => void;
  /** Notes dropped on a folder (or on Untagged); `move` with Shift held. */
  onDropNotes: (ids: string[], target: string, move: boolean) => void;
  blocks: readonly ArchiveBlock[];
  updateBlock: UpdateBlock;
  /** A card is being dragged: the folders show they take it. */
  dragging: boolean;
}

/**
 * The Library's tags as folders: "a/b" is folder a with sub-folder b, a plain
 * tag is a top-level folder, type tags are not folders (they are the type
 * row). Counts take in the sub-folders. A press shows the folder (and what is
 * below it); a card dropped on one adds that tag, with Shift it moves there.
 */
function FolderTree({ tree, total, untagged, value, onChange, onDropNotes, blocks, updateBlock, dragging }: Props) {
  const saved = useSavedFolders();
  const [open, setOpen] = useRemembered<string[]>("library.foldersOpen", []);
  const openSet = useMemo(() => new Set(open), [open]);
  const [creating, setCreating] = useState<{ parent: string | null } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // The folder shown is never hidden inside a closed one.
  useEffect(() => {
    if (!value || value === UNTAGGED) return;
    const up = tagPaths(value).slice(0, -1).filter((p) => !openSet.has(p));
    if (up.length) setOpen((prev) => [...prev, ...up]);
  }, [value, openSet, setOpen]);

  const toggleOpen = (path: string) => setOpen((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  const existing = useMemo(() => {
    const set = new Set<string>();
    const walk = (nodes: TagNode[]) => nodes.forEach((n) => (set.add(n.path), walk(n.children)));
    walk(tree);
    return set;
  }, [tree]);

  // One tab stop for the whole tree (the folder shown, else "All notes"); ↑ / ↓ move between rows,
  // → / ← open and close, F2 renames, Delete deletes (on the row's own keys below).
  const shownInTree = value === null || value === UNTAGGED || existing.has(value);
  const onTreeKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-folder-row]")];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const j = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    rows[j]?.focus();
  };

  return (
    <nav aria-label="Folders" className="glass-card space-y-0.5 p-2 text-sm" lang="en" onKeyDown={onTreeKey}>
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Folders</span>
        <button
          type="button"
          onClick={() => setCreating({ parent: null })}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          title="New folder"
          aria-label="New folder"
        >
          <FolderPlus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <Row icon={Layers} label="All notes" count={total} active={value === null} tabbable={value === null || !shownInTree} onClick={() => onChange(null)} depth={0} />
      <Row
        icon={Inbox}
        label="Untagged"
        title="Notes in no folder. Drop a note here to take it out of the folder you are viewing."
        count={untagged}
        active={value === UNTAGGED}
        onClick={() => onChange(UNTAGGED)}
        depth={0}
        drop={(ids, move) => onDropNotes(ids, UNTAGGED, move)}
        dragging={dragging}
      />
      {creating?.parent === null && <NewFolder parent={null} existing={existing} onCancel={() => setCreating(null)} onCreate={async (p) => (await saved.create(p)) && (setCreating(null), onChange(p))} />}
      <div className="mt-1 border-t border-white/5 pt-1">
        {tree.length === 0 && !creating && <p className="px-2 py-2 text-xs text-muted-foreground">No folders yet. Tags become folders; "a/b" is a sub-folder.</p>}
        {tree.map((n) => (
          <Branch
            key={n.path}
            node={n}
            depth={0}
            openSet={openSet}
            onToggleOpen={toggleOpen}
            value={value}
            onChange={onChange}
            onDropNotes={onDropNotes}
            dragging={dragging}
            creating={creating}
            setCreating={setCreating}
            existing={existing}
            onCreate={async (p) => {
              if (await saved.create(p)) {
                setCreating(null);
                onChange(p);
              }
            }}
            onRename={setRenaming}
            onDelete={setDeleting}
          />
        ))}
      </div>

      {renaming && (
        <RenameDialog
          folder={renaming}
          blocks={blocks}
          existing={existing}
          onClose={() => setRenaming(null)}
          onRename={async (to) => {
            const from = renaming;
            setRenaming(null);
            const target = normaliseTag(to);
            const list = renameFolder(blocks, from, to);
            // The notes first; the saved folders and the view follow only once a note is renamed.
            const follow = async () => {
              const move = await saved.rename(from, target);
              if (value && value !== UNTAGGED && inFolder(value, from)) onChange(`${target}${value.slice(from.length)}`);
              return () => saved.restore(move);
            };
            if (list.length) {
              await applyWithUndo(list, updateBlock, (n) => `Renamed ${folderLabel(from, 30)} to ${folderLabel(target, 30)} on ${n} note${n === 1 ? "" : "s"}`, follow);
            } else if (await saved.rename(from, target)) {
              if (value && value !== UNTAGGED && inFolder(value, from)) onChange(`${target}${value.slice(from.length)}`);
              toast.success(`Renamed to ${folderLabel(target)}`);
            }
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          folder={deleting}
          blocks={blocks}
          onClose={() => setDeleting(null)}
          onDelete={async () => {
            const folder = deleting;
            setDeleting(null);
            const list = deleteFolder(blocks, folder);
            // The notes first; the saved (empty) sub-folders go only once a note is out.
            const follow = async () => {
              const removed = await saved.remove(folder);
              if (value && value !== UNTAGGED && inFolder(value, folder)) onChange(null);
              return () => saved.restore(removed);
            };
            if (list.length) {
              await applyWithUndo(list, updateBlock, (n) => `Took ${folderLabel(folder, 30)} off ${n} note${n === 1 ? "" : "s"}`, follow);
            } else if (await saved.remove(folder)) {
              if (value && value !== UNTAGGED && inFolder(value, folder)) onChange(null);
              toast.success(`Deleted ${folderLabel(folder)}`);
            }
          }}
        />
      )}
    </nav>
  );
}

export default memo(FolderTree);

function Branch({
  node,
  depth,
  openSet,
  onToggleOpen,
  value,
  onChange,
  onDropNotes,
  dragging,
  creating,
  setCreating,
  existing,
  onCreate,
  onRename,
  onDelete,
}: {
  node: TagNode;
  depth: number;
  openSet: ReadonlySet<string>;
  onToggleOpen: (path: string) => void;
  value: string | null;
  onChange: (folder: string | null) => void;
  onDropNotes: (ids: string[], target: string, move: boolean) => void;
  dragging: boolean;
  creating: { parent: string | null } | null;
  setCreating: (c: { parent: string | null } | null) => void;
  existing: ReadonlySet<string>;
  onCreate: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const isOpen = openSet.has(node.path) || creating?.parent === node.path;
  const kids = node.children.length > 0;
  return (
    <>
      <Row
        icon={value === node.path ? FolderOpen : Folder}
        label={node.name}
        title={`#${node.path}`}
        count={node.count}
        active={value === node.path}
        onClick={() => onChange(node.path)}
        depth={depth}
        expandable={kids}
        expanded={isOpen}
        onToggle={() => onToggleOpen(node.path)}
        drop={(ids, move) => onDropNotes(ids, node.path, move)}
        dragging={dragging}
        onRenameKey={() => onRename(node.path)}
        onDeleteKey={() => onDelete(node.path)}
        actions={
          <>
            <IconAction label={`New folder inside #${node.path}`} icon={FolderPlus} onClick={() => setCreating({ parent: node.path })} />
            <IconAction label={`Rename #${node.path}`} icon={Pencil} onClick={() => onRename(node.path)} />
            <IconAction label={`Delete #${node.path}`} icon={Trash2} onClick={() => onDelete(node.path)} danger />
          </>
        }
      />
      {isOpen && (
        <>
          {creating?.parent === node.path && (
            <NewFolder parent={node.path} existing={existing} depth={depth + 1} onCancel={() => setCreating(null)} onCreate={onCreate} />
          )}
          {node.children.map((c) => (
            <Branch
              key={c.path}
              node={c}
              depth={depth + 1}
              openSet={openSet}
              onToggleOpen={onToggleOpen}
              value={value}
              onChange={onChange}
              onDropNotes={onDropNotes}
              dragging={dragging}
              creating={creating}
              setCreating={setCreating}
              existing={existing}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </>
      )}
    </>
  );
}

function Row({
  icon: Icon,
  label,
  title,
  count,
  active,
  onClick,
  depth,
  expandable,
  expanded,
  onToggle,
  drop,
  dragging,
  actions,
  tabbable,
  onRenameKey,
  onDeleteKey,
}: {
  icon: typeof Folder;
  label: string;
  title?: string;
  count: number;
  active: boolean;
  onClick: () => void;
  depth: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  drop?: (ids: string[], move: boolean) => void;
  dragging?: boolean;
  actions?: ReactNode;
  /** The tree's one tab stop (default: the row shown). */
  tabbable?: boolean;
  onRenameKey?: () => void;
  onDeleteKey?: () => void;
}) {
  const [over, setOver] = useState<false | "copy" | "move">(false);
  // A closed folder held under a dragged card opens after a moment, as in a file manager.
  const springTimer = useRef<number>();
  const stopSpring = () => {
    window.clearTimeout(springTimer.current);
    springTimer.current = undefined;
  };
  useEffect(() => stopSpring, []);
  const dropProps = drop
    ? {
        onDragOver: (e: DragEvent) => {
          if (!isNoteDrag(e)) return;
          e.preventDefault();
          const move = e.shiftKey;
          e.dataTransfer.dropEffect = move ? "move" : "copy";
          if (over !== (move ? "move" : "copy")) setOver(move ? "move" : "copy");
          if (expandable && !expanded && onToggle && springTimer.current === undefined) {
            springTimer.current = window.setTimeout(() => {
              springTimer.current = undefined;
              onToggle();
            }, SPRING_OPEN_MS);
          }
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setOver(false);
            stopSpring();
          }
        },
        onDrop: (e: DragEvent) => {
          stopSpring();
          if (!isNoteDrag(e)) return;
          e.preventDefault();
          setOver(false);
          const ids = readNoteDrag(e);
          if (ids.length) drop(ids, e.shiftKey);
        },
      }
    : {};
  const onRowKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" && expandable && !expanded) {
      e.preventDefault();
      onToggle?.();
    } else if (e.key === "ArrowLeft" && expandable && expanded) {
      e.preventDefault();
      onToggle?.();
    } else if (e.key === "F2" && onRenameKey) {
      e.preventDefault();
      onRenameKey();
    } else if (e.key === "Delete" && onDeleteKey) {
      e.preventDefault();
      e.stopPropagation();
      onDeleteKey();
    }
  };
  return (
    <div
      {...dropProps}
      className={`group/row relative flex items-center rounded-lg transition-colors ${
        over ? "bg-primary/25 ring-1 ring-primary/60" : active ? "bg-primary/15" : dragging && drop ? "bg-white/[0.03]" : "hover:bg-white/5"
      }`}
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      {expandable ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggle}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={expanded ? `Close ${label}` : `Open ${label}`}
          aria-expanded={expanded}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
        </button>
      ) : (
        <span className="w-[1.125rem] shrink-0" aria-hidden />
      )}
      <button
        type="button"
        data-folder-row=""
        tabIndex={(tabbable ?? active) ? 0 : -1}
        onClick={onClick}
        onKeyDown={onRowKey}
        aria-current={active ? "true" : undefined}
        aria-expanded={expandable ? !!expanded : undefined}
        aria-keyshortcuts={onRenameKey ? "ArrowUp ArrowDown ArrowLeft ArrowRight F2 Delete" : "ArrowUp ArrowDown"}
        title={title}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1.5 text-left ${actions ? "[@media(hover:none)]:pr-[4.75rem]" : ""} ${active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={`shrink-0 text-[10px] tabular-nums opacity-70 ${actions ? "group-hover/row:opacity-0 [@media(hover:none)]:group-hover/row:opacity-70" : ""}`}>{count}</span>
      </button>
      {over && (
        <span className="pointer-events-none absolute -top-5 right-1 z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
          {drop && label === "Untagged" ? "Take out of the folder" : over === "move" ? "Move here" : "Add here · Shift: move"}
        </span>
      )}
      {actions && (
        <span className="absolute right-0.5 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-70">{actions}</span>
      )}
    </div>
  );
}

/** A row's mouse action; from the keyboard the row's own keys do it (F2, Delete), so it is no tab stop. */
function IconAction({ label, icon: Icon, onClick, danger }: { label: string; icon: typeof Folder; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded p-1 text-muted-foreground transition-colors ${danger ? "hover:bg-destructive/15 hover:text-destructive" : "hover:bg-white/10 hover:text-foreground"}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

function NewFolder({
  parent,
  existing,
  depth = 0,
  onCancel,
  onCreate,
}: {
  parent: string | null;
  existing: ReadonlySet<string>;
  depth?: number;
  onCancel: () => void;
  onCreate: (path: string) => void;
}) {
  const [name, setName] = useState("");
  const path = parent ? `${parent}/${name}` : name;
  const problem = name.trim() ? folderNameProblem(path, existing) : null;
  return (
    <form
      className="py-1"
      style={{ paddingLeft: 8 + depth * 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || problem) return;
        onCreate(normaliseTag(path));
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onCancel())}
        onBlur={() => !name.trim() && onCancel()}
        placeholder={parent ? `Inside #${parent}…` : "Folder name…"}
        aria-label="New folder name"
        className="h-8 w-full rounded-md border border-white/10 bg-background/60 px-2 text-sm outline-none focus:border-primary/50"
      />
      {problem ? (
        <p className="mt-1 text-[10px] text-destructive [overflow-wrap:anywhere]">{problem}</p>
      ) : (
        name.trim() && <p className="mt-1 text-[10px] text-muted-foreground [overflow-wrap:anywhere]">Enter creates #{normaliseTag(path)}</p>
      )}
    </form>
  );
}

function RenameDialog({
  folder,
  blocks,
  existing,
  onClose,
  onRename,
}: {
  folder: string;
  blocks: readonly ArchiveBlock[];
  existing: ReadonlySet<string>;
  onClose: () => void;
  onRename: (to: string) => void;
}) {
  const [name, setName] = useState(folder);
  const reach = useMemo(() => folderReach(blocks, folder), [blocks, folder]);
  const problem = folderNameProblem(name, existing, folder);
  const to = normaliseTag(name);
  const merges = !problem && existing.has(to);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card max-w-[calc(100vw-2rem)] border-white/10 sm:max-w-md">
        <DialogHeader className="min-w-0">
          <DialogTitle className="[overflow-wrap:anywhere]">Rename {folderLabel(folder)}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {reach.notes === 0
              ? "No note is in this folder yet."
              : `Renames the tag on ${reach.notes} note${reach.notes === 1 ? "" : "s"}${reach.subfolders ? `, its ${reach.subfolders} sub-folder${reach.subfolders === 1 ? "" : "s"} included` : ""}.`}{" "}
            Use "/" for a sub-folder.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) onRename(to);
          }}
          className="min-w-0 space-y-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="New name"
            className="h-10 w-full rounded-lg border border-white/10 bg-background/60 px-3 text-sm outline-none focus:border-primary/50"
          />
          <p className={`text-xs [overflow-wrap:anywhere] ${problem ? "text-destructive" : "text-muted-foreground"}`}>
            {problem && name.trim() !== folder ? problem : merges ? `#${to} exists: the notes join it.` : !problem ? `Becomes #${to}` : " "}
          </p>
          <DialogFooter className="flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!!problem} className="gradient-purple text-primary-foreground">
              Rename{reach.notes ? ` on ${reach.notes} note${reach.notes === 1 ? "" : "s"}` : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ folder, blocks, onClose, onDelete }: { folder: string; blocks: readonly ArchiveBlock[]; onClose: () => void; onDelete: () => void }) {
  const reach = useMemo(() => folderReach(blocks, folder), [blocks, folder]);
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="glass-card max-w-[calc(100vw-2rem)] border-white/10 sm:max-w-md">
        <AlertDialogHeader className="min-w-0">
          <AlertDialogTitle className="[overflow-wrap:anywhere]">Delete the folder {folderLabel(folder)}?</AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            {reach.notes === 0
              ? "No note is in it. Only the empty folder goes."
              : `The tag comes off ${reach.notes} note${reach.notes === 1 ? "" : "s"}${reach.subfolders ? `, with its ${reach.subfolders} sub-folder${reach.subfolders === 1 ? "" : "s"}` : ""}. The notes stay in the Archive.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-wrap gap-2">
          <AlertDialogCancel className="border-white/10">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete folder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
