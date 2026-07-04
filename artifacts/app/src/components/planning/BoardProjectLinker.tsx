import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Link2 } from "lucide-react";
import { UserProject } from "@/hooks/useUserProjects";

interface Props {
  projects: UserProject[];
  linkedIds: string[];
  onLink: (projectId: string) => void;
  onUnlink: (projectId: string) => void;
}

/** Multi-select dropdown to link/unlink existing user projects to a board. */
export default function BoardProjectLinker({ projects, linkedIds, onLink, onUnlink }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as HTMLElement)) return;
      if (menuRef.current?.contains(e.target as HTMLElement)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(o => !o);
  };

  const count = linkedIds.length;
  const label = count === 0 ? "Link projects" : `${count} linked`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={toggle}
        className="flex items-center gap-2 h-8 px-3 text-xs bg-muted/30 border border-white/10 rounded-lg text-foreground hover:bg-muted/50 transition-all"
      >
        <Link2 className="h-3.5 w-3.5 text-primary" />
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="w-64 rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl p-1.5 shadow-lg max-h-[280px] overflow-y-auto"
          onWheel={e => e.stopPropagation()}
        >
          <p className="text-[9px] text-muted-foreground px-2 py-1 font-medium uppercase tracking-wider">Link existing projects</p>
          {projects.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2.5 py-3">No projects yet. Create projects in Settings.</p>
          ) : (
            projects.map(p => {
              const isLinked = linkedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={(e) => { e.stopPropagation(); if (isLinked) onUnlink(p.id); else onLink(p.id); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all ${
                    isLinked ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                    isLinked ? "border-primary bg-primary" : "border-white/20 bg-transparent"
                  }`}>
                    {isLinked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <span className="truncate">{p.emoji} {p.name}</span>
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
