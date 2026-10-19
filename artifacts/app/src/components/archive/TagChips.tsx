import { memo } from "react";
import {
  CheckSquare,
  HelpCircle,
  Image as ImageIcon,
  Lightbulb,
  Link2,
  ListChecks,
  Loader2,
  Plus,
  Puzzle,
  Quote,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import PillarIcon from "@/components/shared/PillarIcon";
import type { Pillar } from "@/hooks/usePillars";
import { TYPE_INFO, isTypeTag, type TagSuggestion, type TypeTag } from "@/lib/archive-tags";

/**
 * The chips the Library, the peek, the reader and the tag queue show: a
 * note's type and tags (a press filters the Library by it), his pillars as a
 * one-press row, and suggested chips to accept.
 */

export const TYPE_ICONS: Record<TypeTag, LucideIcon> = {
  insight: Lightbulb,
  framework: ListChecks,
  quote: Quote,
  source: Link2,
  question: HelpCircle,
  task: CheckSquare,
  capture: ImageIcon,
  fragment: Puzzle,
};

/** A type chip's look: outlined and in capitals, so it never reads as one more #tag. */
export const TYPE_CHIP = "border border-sky-400/40 bg-sky-400/10 text-sky-300 uppercase tracking-wide";

const typeLabel = (t: TypeTag) => TYPE_INFO[t].label;

/** "#projekty/rybiapaka", shortened in the middle of a long path. */
export function tagText(tag: string, max = 28): string {
  if (tag.length <= max) return `#${tag}`;
  const parts = tag.split("/");
  const last = parts[parts.length - 1];
  return parts.length > 1 && last.length < max - 4 ? `#${parts[0].slice(0, Math.max(3, max - last.length - 5))}…/${last}` : `#${tag.slice(0, max - 1)}…`;
}

interface TagChipsProps {
  /** The note's tags as noteTags() reads them: the type first. */
  tags: readonly string[];
  /** A press on a tag: the Library filters by it (its folder and everything below). */
  onTag?: (tag: string) => void;
  /** A press on the type chip. */
  onType?: (type: TypeTag) => void;
  /** Chips shown before "+N". */
  max?: number;
  size?: "sm" | "md";
  /** The tag (folder) being viewed is drawn as such. */
  active?: string | null;
}

/** A note's type and tags. Buttons only when a press does something. */
export const NoteTagChips = memo(function NoteTagChips({ tags, onTag, onType, max = Infinity, size = "sm", active }: TagChipsProps) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const more = tags.length - shown.length;
  const text = size === "sm" ? "text-[10px]" : "text-[11px]";
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((t) => {
        if (isTypeTag(t)) {
          const Icon = TYPE_ICONS[t];
          const cls = `inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold ${text} ${TYPE_CHIP}`;
          const body = (
            <>
              <Icon className="h-3 w-3" aria-hidden /> {typeLabel(t)}
            </>
          );
          return onType ? (
            <button
              key={t}
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onType(t);
              }}
              className={`${cls} transition-colors hover:bg-sky-400/20`}
              title={`${TYPE_INFO[t].hint}. Show every ${typeLabel(t).toLowerCase()}`}
            >
              {body}
            </button>
          ) : (
            <span key={t} className={cls} title={TYPE_INFO[t].hint}>
              {body}
            </span>
          );
        }
        const on = active === t;
        const cls = `max-w-full truncate rounded-full px-2 py-0.5 ${text} ${on ? "bg-primary/25 text-primary" : "bg-muted/50 text-muted-foreground"}`;
        return onTag ? (
          <button
            key={t}
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onTag(t);
            }}
            className={`${cls} transition-colors hover:bg-primary/20 hover:text-foreground`}
            title={`Show the notes in #${t}`}
          >
            {tagText(t)}
          </button>
        ) : (
          <span key={t} className={cls} title={`#${t}`}>
            {tagText(t)}
          </span>
        );
      })}
      {more > 0 && <span className={`${text} text-muted-foreground`}>+{more}</span>}
    </div>
  );
});

// -- pillars -------------------------------------------------------------------------------

/** Pillars the digit keys reach (1-8). */
export const PILLAR_KEYS = 8;

/** His pillars as one row of chips; a press toggles one on the note (saved at once by the caller). */
export function PillarRow({
  pillars,
  active,
  onToggle,
  numbered = false,
  busy,
}: {
  pillars: readonly Pillar[];
  active: readonly string[];
  onToggle: (id: string) => void;
  /** Show the digit that toggles each one (the peek). */
  numbered?: boolean;
  /** A pillar whose save is on its way. */
  busy?: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pillars">
      {pillars.map((p, i) => {
        const on = active.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onToggle(p.id)}
            aria-pressed={on}
            title={`${on ? "Remove" : "Add"} ${p.name}${numbered && i < PILLAR_KEYS ? ` (${i + 1})` : ""}`}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-[background-color,color,opacity] active:scale-95 ${busy === p.id ? "opacity-60" : ""}`}
            style={{ backgroundColor: on ? p.color : `${p.color}18`, color: on ? "#fff" : p.color }}
          >
            {numbered && i < PILLAR_KEYS && <span className="text-[9px] font-bold opacity-70 tabular-nums">{i + 1}</span>}
            <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={12} className="inline-block" /> {p.name}
          </button>
        );
      })}
    </div>
  );
}

// -- suggestions ---------------------------------------------------------------------------

/**
 * A suggested pillar (the learn mode may offer one or two): `kind` "pillar"
 * and the tag "pillar:<id>", the form its feedback rows take.
 */
export const isPillarChip = (s: Pick<TagSuggestion, "kind" | "tag">) => (s.kind as string) === "pillar" || s.tag.startsWith("pillar:");
export const pillarIdOf = (s: Pick<TagSuggestion, "tag">) => s.tag.replace(/^pillar:/, "");

/** What the AI's part of an answer means for him, when it is not a full answer. */
export function aiNote(ai: string | undefined, error?: string): string | null {
  if (ai === "capped") return error || "This month's AI limit for tags is used up: these come from your similar notes.";
  if (ai === "off") return "AI is off: these come from your similar notes.";
  if (ai === "failed") return "The AI didn't answer: these come from your similar notes.";
  return null;
}

export function SuggestionChips({
  chips,
  chosen,
  onToggle,
  onAccept,
  onDismiss,
  pillars,
  loading,
  error,
  note,
  numbered = false,
  keys = "Enter",
  saving = false,
}: {
  chips: readonly TagSuggestion[] | undefined;
  /** The chips that "Accept" takes (all, until one is pressed off). */
  chosen: ReadonlySet<string>;
  onToggle: (tag: string) => void;
  onAccept: () => void;
  onDismiss?: () => void;
  pillars: ReadonlyMap<string, Pillar>;
  loading?: boolean;
  error?: string | null;
  /** Why the model's part is missing (aiNote). */
  note?: string | null;
  /** Number the chips (the tag queue's 1-5 keys). */
  numbered?: boolean;
  /** The key that accepts, shown on the button; null for none. */
  keys?: string | null;
  saving?: boolean;
}) {
  if (error) {
    return (
      <p className="text-[11px] text-muted-foreground" lang="en">
        <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
        No suggestions: <span className="[overflow-wrap:anywhere]">{error}</span>
      </p>
    );
  }
  if (loading && !chips) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Looking at your similar notes…
      </p>
    );
  }
  if (!chips || chips.length === 0) return null;
  const picked = chips.filter((c) => chosen.has(c.tag)).length;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Suggested tags">
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
        {chips.map((c, i) => {
          const on = chosen.has(c.tag);
          const pillar = isPillarChip(c) ? pillars.get(pillarIdOf(c)) : undefined;
          const label = pillar ? pillar.name : c.kind === "type" && isTypeTag(c.tag) ? typeLabel(c.tag) : `#${c.tag}`;
          const Icon = c.kind === "type" && isTypeTag(c.tag) ? TYPE_ICONS[c.tag] : null;
          const style = pillar ? { borderColor: `${pillar.color}80`, backgroundColor: on ? pillar.color : `${pillar.color}12`, color: on ? "#fff" : pillar.color } : undefined;
          const tone = pillar
            ? ""
            : c.kind === "type"
              ? on
                ? "border-sky-400/70 bg-sky-400/25 text-sky-200 uppercase tracking-wide"
                : "border-sky-400/40 text-sky-300/70 uppercase tracking-wide"
              : on
                ? "border-primary/60 bg-primary/20 text-foreground"
                : "border-white/15 text-muted-foreground";
          return (
            <button
              key={c.tag}
              type="button"
              onClick={() => onToggle(c.tag)}
              aria-pressed={on}
              title={c.reason}
              style={style}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-semibold transition-colors active:scale-95 ${tone}`}
            >
              {numbered && i < 9 && <span className="text-[9px] font-bold opacity-70 tabular-nums">{i + 1}</span>}
              {pillar ? <PillarIcon icon={pillar.icon} iconUrl={pillar.iconUrl} size={12} className="inline-block" /> : Icon ? <Icon className="h-3 w-3" aria-hidden /> : !on ? <Plus className="h-3 w-3" aria-hidden /> : null}
              <span className="truncate">{label}</span>
              {c.isNew && <span className="text-[9px] font-normal normal-case opacity-70">new</span>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAccept}
          disabled={saving || picked === 0}
          className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/30 disabled:opacity-40"
          title={picked === chips.length ? "Accept every suggestion" : `Accept the ${picked} chosen`}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
          {picked === chips.length ? "Accept all" : `Accept ${picked}`}
          {keys && <kbd className="ml-0.5 text-[9px] font-normal opacity-70 [@media(hover:none)]:hidden">{keys}</kbd>}
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            aria-label="Hide the suggestions"
            title="Hide the suggestions"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      {note && <p className="text-[10px] text-muted-foreground [overflow-wrap:anywhere]">{note}</p>}
    </div>
  );
}
