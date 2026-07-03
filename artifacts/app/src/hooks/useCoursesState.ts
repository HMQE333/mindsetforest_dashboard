import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Course } from "@/lib/course-data";
import { toast } from "sonner";

export function useCoursesState() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCourses = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("user_courses" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error("Failed to load courses"); return; }
    setCourses((data || []) as unknown as Course[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const addCourse = useCallback(async (course: Partial<Course>) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_courses" as any)
      .insert([{ ...course, user_id: user.id }] as any);
    if (error) { toast.error("Failed to add course"); return; }
    toast.success("Course added!");
    fetchCourses();
  }, [user, fetchCourses]);

  const updateCourse = useCallback(async (id: string, updates: Partial<Course>) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_courses" as any)
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to update course"); return; }
    fetchCourses();
  }, [user, fetchCourses]);

  const deleteCourse = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_courses" as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to delete course"); return; }
    toast.success("Course removed");
    fetchCourses();
  }, [user, fetchCourses]);

  return { courses, loading, addCourse, updateCourse, deleteCourse, refetch: fetchCourses };
}
