import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday } from "date-fns";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import CalendarEventModal from "./CalendarEventModal";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarView() {
  const { events, loading, currentMonth, nextMonth, prevMonth, addEvent, updateEvent, deleteEvent } = useCalendarEvents();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const allTags = useMemo(() => {
    const tags = new Set(events.map(e => e.tag).filter(Boolean));
    return Array.from(tags);
  }, [events]);

  const filteredEvents = useMemo(() => {
    let filtered = events;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e => e.title.toLowerCase().includes(q) || e.notes.toLowerCase().includes(q));
    }
    if (filterTag) {
      filtered = filtered.filter(e => e.tag === filterTag);
    }
    return filtered;
  }, [events, searchQuery, filterTag]);

  const eventsForDate = (dateStr: string) => filteredEvents.filter(e => e.date === dateStr);

  const handleDayClick = (date: Date) => {
    setSelectedDate(format(date, "yyyy-MM-dd"));
  };

  const handleAddNew = () => {
    setEditEvent(null);
    setModalOpen(true);
  };

  const handleEventClick = (evt: CalendarEvent) => {
    setEditEvent(evt);
    setSelectedDate(evt.date);
    setModalOpen(true);
  };

  // Drag & Drop
  const handleDragStart = useCallback((e: React.DragEvent, evt: CalendarEvent) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: evt.id, date: evt.date }));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.id && data.date !== targetDateStr) {
        updateEvent(data.id, { date: targetDateStr });
      }
    } catch {}
  }, [updateEvent]);

  const selectedDateEvents = selectedDate ? eventsForDate(selectedDate) : [];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">📅 Calendar</h2>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
        >
          <Plus className="w-4 h-4" /> Event
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {allTags.length > 0 && (
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="px-3 py-2 rounded-xl bg-muted/30 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All tags</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-all">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold text-foreground min-w-[160px] text-center">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-all">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl glass-card border border-border overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayEvents = eventsForDate(dateStr);
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const isSelected = selectedDate === dateStr;
            const isDragOver = dragOverDate === dateStr;

            return (
              <div
                key={i}
                onClick={() => handleDayClick(day)}
                onDragOver={(e) => handleDragOver(e, dateStr)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, dateStr)}
                className={`relative min-h-[72px] sm:min-h-[80px] p-1.5 border-b border-r border-border text-left transition-all hover:bg-muted/20 cursor-pointer ${
                  !inMonth ? "opacity-30" : ""
                } ${isSelected ? "bg-primary/10 ring-1 ring-primary/30" : ""} ${
                  isDragOver ? "bg-primary/20 ring-2 ring-primary/50" : ""
                }`}
              >
                <span className={`text-xs font-medium block mb-1 ${
                  today ? "bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center" : "text-foreground"
                }`}>
                  {format(day, "d")}
                </span>
                <div className="flex flex-wrap gap-0.5">
                  {dayEvents.slice(0, 3).map(evt => (
                    <span
                      key={evt.id}
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: evt.color }}
                      title={evt.title}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3}</span>
                  )}
                </div>
                {/* Draggable event titles (desktop) */}
                <div className="hidden sm:block space-y-0.5 mt-0.5">
                  {dayEvents.slice(0, 2).map(evt => (
                    <div
                      key={evt.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, evt)}
                      onClick={(e) => { e.stopPropagation(); handleEventClick(evt); }}
                      className="text-[10px] leading-tight truncate px-1 py-0.5 rounded cursor-grab active:cursor-grabbing hover:opacity-80 select-none"
                      style={{ backgroundColor: evt.color + "22", color: evt.color }}
                    >
                      {evt.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail panel */}
      {selectedDate && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl glass-card border border-border p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-foreground">
              {format(new Date(selectedDate + "T00:00"), "EEEE, MMMM d")}
            </h4>
            <button
              onClick={() => { setEditEvent(null); setModalOpen(true); }}
              className="text-xs px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground font-bold hover:opacity-90 transition-all"
            >
              + Add
            </button>
          </div>

          {selectedDateEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events on this day</p>
          ) : (
            <div className="space-y-2">
              {selectedDateEvents.map(evt => (
                <div
                  key={evt.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, evt)}
                  onClick={() => handleEventClick(evt)}
                  className="w-full text-left p-3 rounded-xl border border-border hover:bg-muted/20 transition-all flex items-start gap-3 cursor-grab active:cursor-grabbing"
                >
                  <span className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: evt.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{evt.title}</div>
                    {evt.tag && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">{evt.tag}</span>}
                    {evt.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{evt.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <CalendarEventModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditEvent(null); }}
        onSave={(data) => {
          if (editEvent) {
            updateEvent(editEvent.id, data);
          } else {
            addEvent(data);
          }
        }}
        onDelete={editEvent ? () => deleteEvent(editEvent.id) : undefined}
        initialDate={selectedDate || format(new Date(), "yyyy-MM-dd")}
        editEvent={editEvent}
      />
    </motion.div>
  );
}
