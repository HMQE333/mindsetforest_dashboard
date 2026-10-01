import { useEffect, useMemo, useState } from "react";
import { Bell, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useReviewDue } from "@/hooks/useReviewDue";
import { requestReview } from "@/hooks/useReview";
import { monthName, useMonthlyFocus } from "@/hooks/useMonthlyFocus";
import { useReminders } from "@/hooks/useReminders";
import { QUICK_PICKS, formatWhen, timeUntil, toLocalInput } from "@/lib/reminders";
import { buildInbox, unseen, type InboxItem, type InboxSettings } from "@/lib/inbox";
import { playNotifySound } from "@/lib/ui-sounds";
import { todayKey } from "@/lib/today";
import MonthlyFocusEditor from "./MonthlyFocusEditor";

const SEEN_KEY = "mf-inbox-seen";
const NOTIFIED_KEY = "mf-inbox-notified";
/** At most one chime a minute, however many things arrive together. */
const CHIME_GAP_MS = 60_000;
let lastChime = 0;

function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeList(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(-200))); } catch { /* ignore */ }
}

const ICONS: Record<InboxItem["kind"], string> = { reminder: "💌", review: "📋", focus: "🎯", friends: "👥" };

const SETTING_ROWS: { key: keyof InboxSettings; label: string; hint: string }[] = [
  { key: "reviews", label: "Reviews", hint: "Yesterday's review and the month in review" },
  { key: "focus", label: "Monthly focus", hint: "Your goals for the month, once a week" },
  { key: "friends", label: "Friends", hint: "Friend requests" },
  { key: "sound", label: "Sound", hint: "A short chime when something new arrives" },
];

/** Write a message to yourself and pick when it arrives: an hour from now or years away. */
function ReminderComposer({ onAdd, onClose }: { onAdd: (message: string, at: Date) => Promise<boolean>; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(QUICK_PICKS.find((p) => p.id === "tomorrow")!.at(new Date())));
  const [picked, setPicked] = useState("tomorrow");
  const [saving, setSaving] = useState(false);
  const at = new Date(when);
  const valid = message.trim() !== "" && !Number.isNaN(at.getTime()) && at.getTime() > Date.now();
  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const ok = await onAdd(message, at);
    setSaving(false);
    if (ok) { toast.success(`Reminder set for ${formatWhen(at.toISOString())}`); onClose(); }
    else toast.error("Couldn't save the reminder");
  };
  return (
    <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/[0.05] p-3 space-y-2.5">
      <textarea
        autoFocus
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="A message to your future self..."
        aria-label="Reminder message"
        rows={3}
        className="w-full resize-none rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
      />
      <div className="flex flex-wrap gap-1.5">
        {QUICK_PICKS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => { setWhen(toLocalInput(p.at(new Date()))); setPicked(p.id); }}
            className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${picked === p.id ? "border-primary/50 bg-primary/15 text-foreground" : "border-white/10 text-muted-foreground hover:text-foreground"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => { setWhen(e.target.value); setPicked(""); }}
          aria-label="When"
          className="flex-1 min-w-0 rounded-lg border border-white/10 bg-background/50 px-2 py-1.5 text-xs text-foreground [color-scheme:dark]"
        />
        <span className="text-[11px] text-muted-foreground shrink-0">{Number.isNaN(at.getTime()) ? "" : timeUntil(at)}</span>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground">Cancel</button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!valid || saving}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground disabled:opacity-40"
        >
          Set reminder
        </button>
      </div>
    </div>
  );
}

interface Props {
  settings: InboxSettings;
  onSaveSettings: (next: InboxSettings) => void;
  /** The Monthly Focus module is on. */
  focusEnabled: boolean;
  friendRequests: number;
  onOpenFriends: () => void;
}

/**
 * The bell next to Friends: what is waiting (a review, this month's focus,
 * friend requests) and the switches for what may notify and ring.
 */
export default function InboxBell({ settings, onSaveSettings, focusEnabled, friendRequests, onOpenFriends }: Props) {
  const due = useReviewDue();
  const focus = useMonthlyFocus();
  const reminders = useReminders();
  const [composing, setComposing] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const today = todayKey();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingFocus, setEditingFocus] = useState(false);
  const [seen, setSeen] = useState<string[]>(() => readList(SEEN_KEY));

  const items = useMemo(
    () => buildInbox({
      today,
      due,
      focus: focus.items.map((f) => f.title),
      focusEnabled,
      monthName: monthName(),
      friendRequests,
      settings,
      reminders: reminders.due,
    }),
    [today, due, focus.items, focusEnabled, friendRequests, settings, reminders.due],
  );
  const waiting = unseen(items, seen);
  const waitingKey = waiting.join("|");

  // Something new arrived: ring once (if allowed), and only once per item.
  useEffect(() => {
    if (focus.loading || waiting.length === 0) return;
    const notified = new Set(readList(NOTIFIED_KEY));
    const fresh = waiting.filter((id) => !notified.has(id));
    if (fresh.length === 0) return;
    writeList(NOTIFIED_KEY, [...notified, ...fresh]);
    if (settings.sound && Date.now() - lastChime > CHIME_GAP_MS) {
      lastChime = Date.now();
      playNotifySound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingKey, focus.loading, settings.sound]);

  // Opening the inbox marks what is in it as seen.
  useEffect(() => {
    if (!open || waiting.length === 0) return;
    const next = [...new Set([...seen, ...items.map((i) => i.id)])];
    setSeen(next);
    writeList(SEEN_KEY, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, waitingKey]);

  const openReview = (item: InboxItem) => {
    if (!item.review) return;
    setOpen(false);
    window.dispatchEvent(new CustomEvent("lov:navigate-module", { detail: { module: "dashboard" } }));
    requestReview(item.review);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2.5 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-all hover:bg-white/10"
        title="Inbox"
        aria-label={waiting.length ? `Inbox, ${waiting.length} new` : "Inbox"}
      >
        <Bell className="w-5 h-5" />
        {waiting.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-background">
            {waiting.length > 9 ? "9+" : waiting.length}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-2 pr-8">
              <SheetTitle className="flex-1 flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" /> Inbox
              </SheetTitle>
              <button
                onClick={() => setComposing((v) => !v)}
                className={`p-1.5 rounded-lg transition-colors ${composing ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title="New reminder"
                aria-label="New reminder"
                aria-pressed={composing}
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowSettings((v) => !v)}
                className={`p-1.5 rounded-lg transition-colors ${showSettings ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title="Notification settings"
                aria-label="Notification settings"
                aria-pressed={showSettings}
              >
                <Settings2 className="w-4 h-4" />
              </button>
            </div>
            <SheetDescription>What is waiting for you. + writes a reminder for any moment, even years ahead.</SheetDescription>
          </SheetHeader>

          {composing && <ReminderComposer onAdd={reminders.add} onClose={() => setComposing(false)} />}

          {showSettings && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-1">
              {SETTING_ROWS.map((row) => {
                const on = settings[row.key];
                return (
                  <button
                    key={row.key}
                    onClick={() => onSaveSettings({ ...settings, [row.key]: !on })}
                    className="w-full flex items-center gap-3 py-1.5 text-left"
                    aria-pressed={on}
                    aria-label={`${row.label} notifications`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">{row.label}</div>
                      <div className="text-[11px] text-muted-foreground">{row.hint}</div>
                    </div>
                    <div className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-all shrink-0 ${on ? "bg-primary justify-end" : "bg-muted/50 justify-start"}`}>
                      <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                    </div>
                  </button>
                );
              })}
              <button onClick={() => playNotifySound()} className="text-xs text-primary hover:underline pt-1">
                Test the sound
              </button>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {items.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">All caught up.</p>}
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none mt-0.5" aria-hidden="true">{ICONS[item.kind]}</span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    {item.body && <p className="text-xs text-muted-foreground">{item.body}</p>}
                    {item.kind === "focus" && editingFocus ? (
                      <MonthlyFocusEditor />
                    ) : item.lines ? (
                      <ol className="space-y-0.5">
                        {item.lines.map((line, i) => (
                          <li key={i} className="flex gap-2 text-sm text-foreground/90">
                            <span className="text-primary/70 tabular-nums">{i + 1}.</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  {item.kind === "reminder" && item.reminder && (
                    <button onClick={() => void reminders.dismiss(item.reminder!.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground">
                      Dismiss
                    </button>
                  )}
                  {item.kind === "review" && (
                    <button onClick={() => openReview(item)} className="text-xs font-semibold px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground">
                      Open
                    </button>
                  )}
                  {item.kind === "focus" && (
                    <button onClick={() => setEditingFocus((v) => !v)} className="text-xs text-primary hover:underline">
                      {editingFocus ? "Done" : item.lines ? "Edit goals" : "Set goals"}
                    </button>
                  )}
                  {item.kind === "friends" && (
                    <button onClick={() => { setOpen(false); onOpenFriends(); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground">
                      Open
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {reminders.upcoming.length > 0 && (
            <div className="mt-5 border-t border-white/10 pt-3">
              <button onClick={() => setShowScheduled((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                {showScheduled ? "Hide" : "Show"} scheduled reminders ({reminders.upcoming.length})
              </button>
              {showScheduled && (
                <ul className="mt-2 space-y-2">
                  {reminders.upcoming.map((r) => (
                    <li key={r.id} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/90 line-clamp-2">{r.message}</p>
                        <p className="text-[11px] text-muted-foreground">{formatWhen(r.deliverAt)} · {timeUntil(new Date(r.deliverAt))}</p>
                      </div>
                      <button onClick={() => void reminders.remove(r.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Delete" aria-label={`Delete reminder: ${r.message}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
