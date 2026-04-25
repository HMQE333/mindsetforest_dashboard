import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Sprout, Droplet, BookmarkPlus, CheckCheck, Trash2 } from "lucide-react";
import { useForestInbox } from "@/hooks/useForestInbox";
import { motion, AnimatePresence } from "framer-motion";

const KIND_META = {
  friend_planted: { Icon: Sprout, color: "text-emerald-400", verb: "planted" },
  seed_watered:   { Icon: Droplet, color: "text-cyan-400", verb: "watered your seed" },
  seed_saved:     { Icon: BookmarkPlus, color: "text-primary", verb: "saved your seed" },
} as const;

const ForestInboxBell = () => {
  const inbox = useForestInbox();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && inbox.unreadCount > 0) inbox.markAllRead(); }}>
      <PopoverTrigger asChild>
        <button
          className="relative px-3 py-2 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-colors"
          title="Forest activity"
        >
          <Bell className="w-4 h-4" />
          <AnimatePresence>
            {inbox.unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full gradient-purple text-primary-foreground text-[10px] font-bold flex items-center justify-center glow-sm"
              >
                {inbox.unreadCount > 9 ? "9+" : inbox.unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </PopoverTrigger>
      <PopoverContent className="glass-card border-white/10 w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b border-white/5">
          <p className="text-xs font-bold text-foreground">🌳 Forest activity</p>
          <div className="flex items-center gap-1">
            {inbox.unreadCount > 0 && (
              <button onClick={inbox.markAllRead} title="Mark all read"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40">
                <CheckCheck className="w-3.5 h-3.5" />
              </button>
            )}
            {inbox.events.some((e) => e.read_at) && (
              <button onClick={inbox.clearRead} title="Clear read"
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {inbox.loading ? (
            <p className="p-4 text-center text-[11px] text-muted-foreground animate-pulse">Loading…</p>
          ) : inbox.events.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              <span className="block text-2xl mb-1">🌱</span>
              Quiet for now. Add friends or plant a seed to start the Forest buzzing.
            </p>
          ) : (
            inbox.events.map((e) => {
              const meta = KIND_META[e.kind];
              const isUnread = !e.read_at;
              return (
                <div key={e.id}
                  className={`flex items-start gap-2 px-3 py-2 border-b border-white/5 last:border-b-0 transition-colors ${
                    isUnread ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="text-base mt-0.5">{e.actor?.avatar_emoji || "🦊"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-foreground leading-snug">
                      <span className="font-bold">{e.actor?.display_name || `@${e.actor?.username || "Someone"}`}</span>
                      <meta.Icon className={`w-3 h-3 inline mx-1 ${meta.color}`} />
                      <span className="text-muted-foreground">{meta.verb}</span>
                      {e.seed?.title && (
                        <span className="text-foreground font-semibold"> "{e.seed.title.slice(0, 40)}"</span>
                      )}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                  </div>
                  {isUnread && <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary" />}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ForestInboxBell;