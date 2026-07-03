import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { CalendarEvent, CalendarEventInsert } from "@/hooks/useCalendarEvents";

const PRESET_COLORS = [
  "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#3B82F6", "#EC4899", "#6366F1", "#14B8A6",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (evt: CalendarEventInsert) => void;
  onDelete?: () => void;
  initialDate: string;
  editEvent?: CalendarEvent | null;
}

export default function CalendarEventModal({ open, onClose, onSave, onDelete, initialDate, editEvent }: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [tag, setTag] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editEvent) {
      setTitle(editEvent.title);
      setDate(editEvent.date);
      setColor(editEvent.color);
      setTag(editEvent.tag);
      setNotes(editEvent.notes);
    } else {
      setTitle("");
      setDate(initialDate);
      setColor(PRESET_COLORS[0]);
      setTag("");
      setNotes("");
    }
  }, [editEvent, initialDate, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), date, color, tag: tag.trim(), notes: notes.trim() });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl glass-card border border-border p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{editEvent ? "Edit Event" : "New Event"}</h3>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/30 text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Event title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />

              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110" : "hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <input
                type="text"
                placeholder="Tag (optional)"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />

              <textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
                >
                  {editEvent ? "Save" : "Add Event"}
                </button>
                {editEvent && onDelete && (
                  <button
                    type="button"
                    onClick={() => { onDelete(); onClose(); }}
                    className="px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive font-bold text-sm hover:bg-destructive/20 transition-all"
                  >
                    Delete
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
