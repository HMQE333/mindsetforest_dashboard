import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  date: string;
  color: string;
  tag: string;
  notes: string;
  created_at: string;
}

export type CalendarEventInsert = Omit<CalendarEvent, "id" | "user_id" | "created_at">;

export function useCalendarEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date");

    if (error) {
      console.error(error);
      toast.error("Failed to load events");
    } else {
      setEvents((data as CalendarEvent[]) || []);
    }
    setLoading(false);
  }, [user, currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const addEvent = async (evt: CalendarEventInsert) => {
    if (!user) return;
    const { error } = await supabase.from("calendar_events").insert({ ...evt, user_id: user.id });
    if (error) {
      toast.error("Failed to add event");
      return;
    }
    toast.success("Event added");
    fetchEvents();
  };

  const updateEvent = async (id: string, evt: Partial<CalendarEventInsert>) => {
    if (!user) return;
    const { error } = await supabase.from("calendar_events").update(evt).eq("id", id);
    if (error) {
      toast.error("Failed to update event");
      return;
    }
    toast.success("Event updated");
    fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete event");
      return;
    }
    toast.success("Event deleted");
    fetchEvents();
  };

  const nextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const prevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));

  return { events, loading, currentMonth, nextMonth, prevMonth, addEvent, updateEvent, deleteEvent };
}
