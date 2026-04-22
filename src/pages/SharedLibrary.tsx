import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, BookOpen, GraduationCap, ExternalLink, LayoutGrid, List as ListIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BookCard from "@/components/library/BookCard";
import CourseCard from "@/components/library/CourseCard";
import type { Book } from "@/lib/library-data";
import type { Course } from "@/lib/course-data";

interface ShareData {
  share: {
    id: string;
    name: string;
    tab: "books" | "courses";
    filters: Record<string, any>;
    view_mode: "block" | "list";
  };
  items: any[];
}

export default function SharedLibrary() {
  const { shareId } = useParams<{ shareId: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!shareId) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data: rpcData, error } = await supabase.rpc("get_shared_library" as any, { share_id: shareId });
      if (error || !rpcData || (rpcData as any).error === "not_found") {
        setNotFound(true);
      } else {
        setData(rpcData as unknown as ShareData);
      }
      setLoading(false);
    })();
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse text-sm">Loading shared library...</div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl glass-card flex items-center justify-center">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Share not available</h1>
          <p className="text-sm text-muted-foreground mb-6">This share is private or no longer exists.</p>
          <Link to="/" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:opacity-90 transition-all">
            Visit Mindset Forest
          </Link>
        </motion.div>
      </div>
    );
  }

  const { share, items } = data;
  const isBooks = share.tab === "books";
  const viewMode = share.view_mode || "block";
  const filterChips = Object.entries(share.filters || {}).filter(([k]) => k !== "viewMode");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl gradient-purple flex items-center justify-center glow-sm">
              {isBooks ? <BookOpen className="w-5 h-5 text-primary-foreground" /> : <GraduationCap className="w-5 h-5 text-primary-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-foreground truncate">{share.name}</h1>
              <p className="text-xs text-muted-foreground">
                {items.length} {isBooks ? "book" : "course"}{items.length !== 1 ? "s" : ""}
                {viewMode === "list" ? <span className="inline-flex items-center gap-0.5 ml-1.5"><ListIcon className="w-3 h-3" /> list</span> : <span className="inline-flex items-center gap-0.5 ml-1.5"><LayoutGrid className="w-3 h-3" /> grid</span>}
              </p>
            </div>
          </div>

          {filterChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {filterChips.map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded-full bg-muted/40 text-[10px] text-muted-foreground font-medium">
                  {k}: <span className="text-foreground">{String(v)}</span>
                </span>
              ))}
            </div>
          )}
        </motion.header>

        {/* Items */}
        {items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">{isBooks ? "📖" : "🎓"}</p>
            <p className="text-muted-foreground text-sm">No {isBooks ? "books" : "courses"} match this share's filters.</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {items.map((item, i) => (
              isBooks
                ? <BookCard key={item.id} book={normalizeBook(item)} index={i} onClick={() => {}} view="list" />
                : <CourseCard key={item.id} course={normalizeCourse(item)} index={i} onClick={() => {}} view="list" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item, i) => (
              isBooks
                ? <BookCard key={item.id} book={normalizeBook(item)} index={i} onClick={() => {}} view="block" />
                : <CourseCard key={item.id} course={normalizeCourse(item)} index={i} onClick={() => {}} view="block" />
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Read-only shared view</span>
          <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            Powered by Mindset Forest <ExternalLink className="w-3 h-3" />
          </Link>
        </footer>
      </div>
    </div>
  );
}

// Normalize raw RPC rows into the shapes BookCard/CourseCard expect
function normalizeBook(b: any): Book {
  return {
    id: b.id,
    user_id: "",
    title: b.title || "",
    author: b.author || "",
    total_pages: b.total_pages || 0,
    pages_read: b.pages_read || 0,
    rating: b.rating ?? null,
    status: b.status || "to-read",
    notes: b.notes || "",
    cover_color: b.cover_color || "#8B5CF6",
    tags: b.tags || [],
    pillars: b.pillars || [],
    directions: b.directions || [],
    format: b.format || "owned",
    created_at: b.created_at || "",
    updated_at: b.updated_at || "",
  };
}

function normalizeCourse(c: any): Course {
  return {
    id: c.id,
    user_id: "",
    title: c.title || "",
    platform: c.platform || "",
    instructor: c.instructor || "",
    url: c.url || "",
    cover_color: c.cover_color || "#3B82F6",
    status: c.status || "to-start",
    progress_pct: c.progress_pct || 0,
    rating: c.rating ?? null,
    notes: c.notes || "",
    tags: c.tags || [],
    pillars: c.pillars || [],
    directions: c.directions || [],
    created_at: c.created_at || "",
    updated_at: c.updated_at || "",
  };
}