import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type Connection,
  useNodesState, useEdgesState,
  Handle, Position,
  type NodeProps, MarkerType, BackgroundVariant,
  ReactFlowProvider, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { usePlanningState, PlanningTask, TaskLevel } from "@/hooks/usePlanningState";
import { supabase } from "@/integrations/supabase/client";
import { useUserProjects, UserProject } from "@/hooks/useUserProjects";
import { Target, Flag, ListChecks, Zap, Check, Plus, Trash2, X, Globe, ExternalLink, ArrowLeft, Map, ChevronDown, Unlink, LayoutGrid } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import PlanningNodeDetail from "./PlanningNodeDetail";
import { toast } from "@/hooks/use-toast";

/* ── Level styling ─────────────────────────────────────────── */
const levelMeta: Record<TaskLevel, { label: string; icon: React.ComponentType<{ className?: string }>; gradient: string; glow: string; borderColor: string }> = {
  goal: { label: "Goal", icon: Target, gradient: "from-purple-500 to-pink-500", glow: "shadow-[0_0_25px_hsl(270,85%,65%,0.35)]", borderColor: "border-purple-500/50" },
  phase: { label: "Phase", icon: Flag, gradient: "from-blue-500 to-purple-500", glow: "shadow-[0_0_20px_hsl(220,90%,60%,0.3)]", borderColor: "border-blue-500/40" },
  task: { label: "Task", icon: ListChecks, gradient: "from-cyan-500 to-blue-500", glow: "shadow-[0_0_18px_hsl(190,90%,55%,0.25)]", borderColor: "border-cyan-500/40" },
  action: { label: "Action", icon: Zap, gradient: "from-green-500 to-cyan-500", glow: "shadow-[0_0_15px_hsl(160,75%,45%,0.25)]", borderColor: "border-green-500/40" },
  link: { label: "Link", icon: Globe, gradient: "from-orange-500 to-yellow-500", glow: "shadow-[0_0_18px_hsl(30,90%,55%,0.3)]", borderColor: "border-orange-500/40" },
};

const nextLevel: Record<TaskLevel, TaskLevel> = { goal: "phase", phase: "task", task: "action", action: "action", link: "link" };
const allLevels: TaskLevel[] = ["goal", "phase", "task", "action"];

function extractDomain(url: string): string {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); } catch { return url; }
}
function normalizeUrl(url: string): string { return url.startsWith("http") ? url : `https://${url}`; }

const MAX_SELECTED = 5;

/* ── Add Popover ─────────────────────────────────────────────── */
function AddChildPopover({ parentLevel, onAdd, onAddLink, onClose }: { parentLevel: TaskLevel | null; onAdd: (title: string, level: TaskLevel) => void; onAddLink: (url: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const suggested = parentLevel ? nextLevel[parentLevel] : "goal";
  const [level, setLevel] = useState<TaskLevel>(suggested);
  const [isLinkMode, setIsLinkMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (isLinkMode) onAddLink(title.trim()); else onAdd(title.trim(), level);
    onClose();
  };

  return (
    <div className="absolute z-[100] top-full left-1/2 -translate-x-1/2 mt-2 w-56 rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl p-3 shadow-lg" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onClose(); }} placeholder={isLinkMode ? "https://..." : "Node title..."} className="w-full bg-muted/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50" />
      <div className="flex gap-1 mt-2">
        {allLevels.map(l => {
          const meta = levelMeta[l];
          return (
            <button key={l} onClick={() => { setLevel(l); setIsLinkMode(false); }} className={`flex-1 text-[9px] font-medium py-1 rounded-md transition-all ${!isLinkMode && level === l ? `bg-gradient-to-r ${meta.gradient} text-white` : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>{meta.label}</button>
          );
        })}
        <button onClick={() => setIsLinkMode(true)} className={`flex-1 text-[9px] font-medium py-1 rounded-md transition-all ${isLinkMode ? "bg-gradient-to-r from-orange-500 to-yellow-500 text-white" : "bg-muted/30 text-muted-foreground"}`}>🔗</button>
      </div>
      <div className="flex gap-1.5 mt-2">
        <button onClick={handleSubmit} className="flex-1 text-[10px] font-medium py-1.5 rounded-lg gradient-purple text-primary-foreground">Add</button>
        <button onClick={onClose} className="px-3 text-[10px] font-medium py-1.5 rounded-lg bg-muted/30 text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}

/* ── Inline Title Editor ─────────────────────────────────────── */
function InlineEditor({ value, onSave, onCancel }: { value: string; onSave: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return (
    <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && text.trim()) onSave(text.trim()); if (e.key === "Escape") onCancel(); }} onBlur={() => { if (text.trim()) onSave(text.trim()); else onCancel(); }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} className="w-full bg-transparent border-b border-primary/50 text-xs font-medium text-foreground outline-none py-0.5" />
  );
}

/* ── Task Node ─────────────────────────────────────────────── */
function TaskNode({ data }: NodeProps) {
  const { task, onAddChild, onAddLink, onDelete, onToggle, onRename, onSelect } = data as any;
  const meta = levelMeta[task.level as TaskLevel];
  const Icon = meta.icon;
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isStandalone = !!task.standalone;

  return (
    <div className={`relative px-4 py-3 rounded-xl border ${isStandalone ? "border-dashed border-muted-foreground/40" : meta.borderColor} ${isStandalone ? "" : meta.glow} bg-background/90 backdrop-blur-md min-w-[160px] max-w-[220px] transition-all duration-200 hover:scale-105 ${task.done ? "opacity-50" : ""}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onDoubleClick={e => { e.stopPropagation(); setEditing(true); }} onClick={e => { e.stopPropagation(); if (!editing) onSelect(task.id); }}>
      <Handle type="target" position={Position.Top} className="!bg-primary/60 !border-primary/40 !w-3 !h-3" />
      <div className={`absolute top-0 left-3 right-3 h-[2px] rounded-full bg-gradient-to-r ${meta.gradient}`} />
      {isStandalone && (
        <div className="absolute -top-2.5 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/60 border border-white/10 backdrop-blur-md">
          <Unlink className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-[8px] text-muted-foreground font-medium">Standalone</span>
        </div>
      )}
      {hovered && !editing && (
        <div className="absolute -top-2 -right-2 flex gap-1 z-10">
          <button onClick={e => { e.stopPropagation(); onToggle(task.id); }} className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${task.done ? "bg-green-500 text-white" : "bg-muted border border-white/10 text-muted-foreground hover:text-foreground"}`}><Check className="h-3 w-3" /></button>
          <button onClick={e => { e.stopPropagation(); onDelete(task.id); }} className="w-5 h-5 rounded-full bg-destructive/80 text-white flex items-center justify-center hover:bg-destructive transition-all"><Trash2 className="h-3 w-3" /></button>
        </div>
      )}
      <div className="flex items-start gap-2.5">
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${meta.gradient} flex items-center justify-center shadow-lg`}><Icon className="h-4 w-4 text-white" /></div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">{meta.label}</p>
          {editing ? <InlineEditor value={task.title} onSave={t => { onRename(task.id, t); setEditing(false); }} onCancel={() => setEditing(false)} /> : <p className={`text-xs font-medium leading-snug ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</p>}
        </div>
        {task.done && !hovered && <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-green-500 to-cyan-500 flex items-center justify-center"><Check className="h-3 w-3 text-white" /></div>}
      </div>
      {!isStandalone && (
        <div className="flex justify-center mt-2">
          <button onClick={e => { e.stopPropagation(); setShowAdd(!showAdd); }} className={`w-6 h-6 rounded-full flex items-center justify-center transition-all border ${showAdd ? "gradient-purple border-transparent text-white scale-110" : "bg-muted/30 border-white/10 text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>{showAdd ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</button>
        </div>
      )}
      {!isStandalone && showAdd && <AddChildPopover parentLevel={task.level} onAdd={(t, l) => onAddChild(task.id, l, t)} onAddLink={u => onAddLink(task.id, u)} onClose={() => setShowAdd(false)} />}
      <Handle type="source" position={Position.Bottom} className="!bg-primary/60 !border-primary/40 !w-3 !h-3" />
    </div>
  );
}

/* ── Project Node ────────────────────────────────────────────── */
function ProjectNode({ data }: NodeProps) {
  const { project, onAddChild, onAddLink } = data as any;
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div className="relative px-5 py-4 rounded-2xl border border-primary/40 glow-md bg-background/90 backdrop-blur-xl min-w-[200px] max-w-[260px]">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
      <div className="relative">
        <p className="text-sm font-bold text-gradient-purple">{project.emoji} {project.name}</p>
      </div>
      <div className="flex justify-center mt-3 relative">
        <button onClick={e => { e.stopPropagation(); setShowAdd(!showAdd); }} className={`w-6 h-6 rounded-full flex items-center justify-center transition-all border ${showAdd ? "gradient-purple border-transparent text-white scale-110" : "bg-muted/30 border-white/10 text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>{showAdd ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</button>
      </div>
      {showAdd && <AddChildPopover parentLevel={null} onAdd={(t, l) => onAddChild(null, l, t)} onAddLink={u => onAddLink(null, u)} onClose={() => setShowAdd(false)} />}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-3 !h-3" />
    </div>
  );
}

/* ── Link Node ─────────────────────────────────────────────── */
function LinkNode({ data }: NodeProps) {
  const { task, onDelete, onSelect } = data as any;
  const [hovered, setHovered] = useState(false);
  const url = task.url || "";
  const domain = extractDomain(url);
  return (
    <div className={`relative px-4 py-3 rounded-xl border border-orange-500/40 shadow-[0_0_18px_hsl(30,90%,55%,0.2)] bg-background/90 backdrop-blur-md min-w-[150px] max-w-[200px] transition-all duration-200 hover:scale-105 cursor-pointer`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => onSelect(task.id)}>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-3 !h-3" />
      <div className="absolute top-0 left-3 right-3 h-[2px] rounded-full bg-gradient-to-r from-orange-500 to-yellow-500" />
      {hovered && (
        <div className="absolute -top-2 -right-2 z-10">
          <button onClick={e => { e.stopPropagation(); onDelete(task.id); }} className="w-5 h-5 rounded-full bg-destructive/80 text-white flex items-center justify-center hover:bg-destructive transition-all"><Trash2 className="h-3 w-3" /></button>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted/20 border border-orange-500/30 flex items-center justify-center overflow-hidden">
          <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" className="w-5 h-5" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-orange-400 mb-0.5 flex items-center gap-1">Link <ExternalLink className="h-2.5 w-2.5" /></p>
          <p className="text-xs font-medium text-foreground truncate">{domain}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-3 !h-3" />
    </div>
  );
}

/* ── Node types registry ────────────────────────────────────── */
const nodeTypes = { taskNode: TaskNode, projectNode: ProjectNode, linkNode: LinkNode };

/* ── Layout ────────────────────────────────────────────────── */
function countLeaves(taskId: string, allTasks: PlanningTask[]): number {
  const children = allTasks.filter(t => t.parent_id === taskId);
  if (children.length === 0) return 1;
  return children.reduce((sum, c) => sum + countLeaves(c.id, allTasks), 0);
}

function layoutTree(project: UserProject, tasks: PlanningTask[], callbacks: any, xOffset: number = 0, usePersistedPositions: boolean = true): { nodes: Node[]; edges: Edge[]; treeWidth: number } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const rootId = `project-${project.id}`;
  const projectTasks = tasks.filter(t => t.project_id === project.id);
  const treeTasks = projectTasks.filter(t => !t.standalone);
  const standaloneTasks = projectTasks.filter(t => t.standalone);
  const rootTasks = treeTasks.filter(t => t.parent_id === null);
  const X_SPACING = 260;
  const Y_SPACING = 120;

  const totalLeaves = rootTasks.reduce((sum, child) => sum + Math.max(1, countLeaves(child.id, treeTasks)), 0);
  const treeWidth = Math.max(1, totalLeaves) * X_SPACING;

  const treeCenterX = xOffset + treeWidth / 2;

  nodes.push({ id: rootId, type: "projectNode", position: { x: treeCenterX - 100, y: 0 }, data: { project, onAddChild: callbacks.makeOnAddChild(project.id), onAddLink: callbacks.makeOnAddLink(project.id) } });

  function layoutChildren(parentNodeId: string, children: PlanningTask[], depth: number, parentX: number): number {
    if (children.length === 0) return parentX;
    const totalWidth = children.reduce((sum, child) => sum + Math.max(1, countLeaves(child.id, treeTasks)) * X_SPACING, 0);
    let currentX = parentX - totalWidth / 2 + X_SPACING / 2;
    children.forEach(child => {
      const grandchildren = treeTasks.filter(t => t.parent_id === child.id);
      const leafCount = Math.max(1, countLeaves(child.id, treeTasks));
      const computedX = currentX + (leafCount * X_SPACING) / 2 - X_SPACING / 2;
      const computedY = depth * Y_SPACING;
      // Use persisted position if available, otherwise use computed
      const nodeX = (usePersistedPositions && child.position_x != null) ? child.position_x : computedX;
      const nodeY = (usePersistedPositions && child.position_y != null) ? child.position_y : computedY;
      const nodeId = `task-${child.id}`;
      const isLink = child.level === "link";
      nodes.push({ id: nodeId, type: isLink ? "linkNode" : "taskNode", position: { x: nodeX, y: nodeY }, draggable: true, data: isLink ? { task: child, onDelete: callbacks.onDelete, onSelect: callbacks.onSelect } : { task: child, onAddChild: callbacks.makeOnAddChild(project.id), onAddLink: callbacks.makeOnAddLink(project.id), onDelete: callbacks.onDelete, onToggle: callbacks.onToggle, onRename: callbacks.onRename, onSelect: callbacks.onSelect } });
      const edgeColors: Record<TaskLevel, string> = { goal: "#a855f7", phase: "#3b82f6", task: "#06b6d4", action: "#22c55e", link: "#f59e0b" };
      edges.push({ id: `e-${parentNodeId}-${nodeId}`, source: parentNodeId, target: nodeId, type: "smoothstep", animated: !child.done, style: { stroke: edgeColors[child.level as TaskLevel], strokeWidth: 2, opacity: child.done ? 0.3 : 0.7 }, markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors[child.level as TaskLevel], width: 15, height: 15 } });
      if (grandchildren.length > 0) layoutChildren(nodeId, grandchildren, depth + 1, computedX);
      currentX += leafCount * X_SPACING;
    });
    return currentX;
  }

  layoutChildren(rootId, rootTasks, 1, treeCenterX);

  // Add standalone nodes at their stored positions
  standaloneTasks.forEach(task => {
    const nodeId = `task-${task.id}`;
    const isLink = task.level === "link";
    const posX = task.position_x ?? xOffset + Math.random() * 300;
    const posY = task.position_y ?? 400 + Math.random() * 200;
    nodes.push({
      id: nodeId,
      type: isLink ? "linkNode" : "taskNode",
      position: { x: posX, y: posY },
      draggable: true,
      data: isLink
        ? { task, onDelete: callbacks.onDelete, onSelect: callbacks.onSelect }
        : { task, onAddChild: callbacks.makeOnAddChild(project.id), onAddLink: callbacks.makeOnAddLink(project.id), onDelete: callbacks.onDelete, onToggle: callbacks.onToggle, onRename: callbacks.onRename, onSelect: callbacks.onSelect },
    });
  });

  return { nodes, edges, treeWidth };
}

/* ── Multi-Select Dropdown ──────────────────────────────────── */
function MultiSelectDropdown({ projects, selectedIds, onToggle, max }: { projects: UserProject[]; selectedIds: string[]; onToggle: (id: string) => void; max: number }) {
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

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(o => !o);
  };

  const selectedProjects = projects.filter(p => selectedIds.includes(p.id));
  const label = selectedProjects.length === 0
    ? "Select projects"
    : selectedProjects.length === 1
      ? `${selectedProjects[0].emoji} ${selectedProjects[0].name}`
      : `${selectedProjects.length} projects`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={openDropdown}
        className="flex items-center gap-2 h-8 px-3 text-xs bg-muted/30 border border-white/10 rounded-lg text-foreground hover:bg-muted/50 transition-all min-w-[140px]"
      >
        <span className="truncate flex-1 text-left">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="w-56 rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl p-1.5 shadow-lg max-h-[240px] overflow-y-auto"
          onWheel={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
        >
          <p className="text-[9px] text-muted-foreground px-2 py-1 font-medium">{selectedIds.length}/{max} selected</p>
          {projects.map(p => {
            const isSelected = selectedIds.includes(p.id);
            const disabled = !isSelected && selectedIds.length >= max;
            return (
              <button
                key={p.id}
                onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(p.id); }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all ${
                  isSelected
                    ? "bg-primary/15 text-foreground"
                    : disabled
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                  isSelected ? "border-primary bg-primary" : "border-white/20 bg-transparent"
                }`}>
                  {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </div>
                <span className="truncate">{p.emoji} {p.name}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}


const STORAGE_KEY = "planning-map-selected-projects";

function MapViewInner({ initialProjectId, onBack }: { initialProjectId?: string | null; onBack?: () => void }) {
  const { projects } = useUserProjects();
  const activeProjects = projects;

  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(() => {
    if (initialProjectId) return [initialProjectId];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const { tasks, addTask, updateTask, deleteTask, toggleTask, refetch } = usePlanningState();
  const reactFlowInstance = useReactFlow();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [forceAutoLayout, setForceAutoLayout] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const isMobile = useIsMobile();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPos = useRef<{ x: number; y: number } | null>(null);

  // Persist selection to localStorage
  useEffect(() => {
    if (selectedProjectIds.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedProjectIds));
    }
  }, [selectedProjectIds]);

  // Auto-select first project if none selected (or saved ones no longer exist)
  useEffect(() => {
    if (activeProjects.length === 0) return;
    const valid = selectedProjectIds.filter(id => activeProjects.some(p => p.id === id));
    if (valid.length === 0) {
      setSelectedProjectIds([activeProjects[0].id]);
    } else if (valid.length !== selectedProjectIds.length) {
      setSelectedProjectIds(valid);
    }
  }, [activeProjects]);

  const toggleProjectSelection = useCallback((projectId: string) => {
    setSelectedProjectIds(prev => {
      if (prev.includes(projectId)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter(id => id !== projectId);
      }
      if (prev.length >= MAX_SELECTED) {
        toast({ title: `Maximum ${MAX_SELECTED} projects`, description: "Deselect one first", variant: "destructive" });
        return prev;
      }
      return [...prev, projectId];
    });
  }, []);

  const handleAddChildForProject = useCallback((projectId: string, parentId: string | null, level: TaskLevel, title: string) => {
    addTask({ project_id: projectId, parent_id: parentId, level, title, done: false, deadline: null, leverage: null, energy: null, time_minutes: null, url: null, icon: null, notes: "" });
  }, [addTask]);

  const handleAddLinkForProject = useCallback((projectId: string, parentId: string | null, url: string) => {
    addTask({ project_id: projectId, parent_id: parentId, level: "link" as TaskLevel, title: extractDomain(url), url: normalizeUrl(url), done: false, deadline: null, leverage: null, energy: null, time_minutes: null, icon: null, notes: "" });
  }, [addTask]);

  const handleDelete = useCallback((taskId: string) => deleteTask(taskId), [deleteTask]);
  const handleToggle = useCallback((taskId: string) => toggleTask(taskId), [toggleTask]);
  const handleRename = useCallback((taskId: string, newTitle: string) => updateTask(taskId, { title: newTitle }), [updateTask]);
  const handleSelect = useCallback((taskId: string) => setSelectedTaskId(taskId), []);
  const handleUpdateTask = useCallback((taskId: string, updates: Partial<PlanningTask>) => updateTask(taskId, updates), [updateTask]);

  // Context menu add — creates standalone node at click position
  const handleContextAddChild = useCallback((parentId: string | null, level: TaskLevel, title: string) => {
    const pid = selectedProjectIds[0];
    if (!pid) return;
    if (parentId === null && contextMenuPos) {
      const flowPos = reactFlowInstance.screenToFlowPosition({ x: contextMenuPos.x, y: contextMenuPos.y });
      addTask({ project_id: pid, parent_id: null, level, title, done: false, deadline: null, leverage: null, energy: null, time_minutes: null, url: null, icon: null, notes: "", standalone: true, position_x: flowPos.x, position_y: flowPos.y });
    } else {
      handleAddChildForProject(pid, parentId, level, title);
    }
  }, [selectedProjectIds, handleAddChildForProject, contextMenuPos, reactFlowInstance, addTask]);

  const handleContextAddLink = useCallback((parentId: string | null, url: string) => {
    const pid = selectedProjectIds[0];
    if (!pid) return;
    if (parentId === null && contextMenuPos) {
      const flowPos = reactFlowInstance.screenToFlowPosition({ x: contextMenuPos.x, y: contextMenuPos.y });
      addTask({ project_id: pid, parent_id: null, level: "link" as TaskLevel, title: extractDomain(url), url: normalizeUrl(url), done: false, deadline: null, leverage: null, energy: null, time_minutes: null, icon: null, notes: "", standalone: true, position_x: flowPos.x, position_y: flowPos.y });
    } else {
      handleAddLinkForProject(pid, parentId, url);
    }
  }, [selectedProjectIds, handleAddLinkForProject, contextMenuPos, reactFlowInstance, addTask]);

  // Connect handler — adopt standalone node into tree
  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const sourceTaskId = connection.source.replace("task-", "").replace("project-", "");
    const targetTaskId = connection.target.replace("task-", "");
    const targetTask = tasks.find(t => t.id === targetTaskId);
    if (!targetTask) return;
    // Set parent and remove standalone flag, keep position
    updateTask(targetTaskId, { parent_id: connection.source.startsWith("project-") ? null : sourceTaskId, standalone: false });
    toast({ title: "Node connected", description: `"${targetTask.title}" is now linked to the tree` });
  }, [tasks, updateTask]);

  // Drag stop — persist position for ALL nodes
  const handleNodeDragStop = useCallback((_: any, node: Node) => {
    const taskId = node.id.replace("task-", "");
    if (node.id.startsWith("project-")) return; // skip project root nodes
    updateTask(taskId, { position_x: node.position.x, position_y: node.position.y });
  }, [updateTask]);

  const callbacks = useMemo(() => ({
    makeOnAddChild: (projectId: string) => (parentId: string | null, level: TaskLevel, title: string) => handleAddChildForProject(projectId, parentId, level, title),
    makeOnAddLink: (projectId: string) => (parentId: string | null, url: string) => handleAddLinkForProject(projectId, parentId, url),
    onDelete: handleDelete,
    onToggle: handleToggle,
    onRename: handleRename,
    onSelect: handleSelect,
  }), [handleAddChildForProject, handleAddLinkForProject, handleDelete, handleToggle, handleRename, handleSelect]);

  const filteredTasks = useMemo(() => tasks.filter(t => selectedProjectIds.includes(t.project_id)), [tasks, selectedProjectIds]);

  const { initialNodes, initialEdges } = useMemo(() => {
    const selectedProjects = activeProjects.filter(p => selectedProjectIds.includes(p.id));
    if (selectedProjects.length === 0) return { initialNodes: [], initialEdges: [] };

    const allNodes: Node[] = [];
    const allEdges: Edge[] = [];
    let xOffset = 0;
    const GAP = 300;
    const usePersistedPos = !forceAutoLayout;

    for (const project of selectedProjects) {
      const { nodes, edges, treeWidth } = layoutTree(project, tasks, callbacks, xOffset, usePersistedPos);
      allNodes.push(...nodes);
      allEdges.push(...edges);
      xOffset += treeWidth + GAP;
    }

    return { initialNodes: allNodes, initialEdges: allEdges };
  }, [activeProjects, selectedProjectIds, tasks, callbacks, forceAutoLayout]);

  // Auto-organize: clear all saved positions and re-layout
  const handleAutoOrganize = useCallback(async () => {
    // Clear positions in DB for all visible tasks
    const taskIds = filteredTasks.map(t => t.id);
    if (taskIds.length === 0) return;
    // Batch clear via individual updates
    await Promise.all(taskIds.map(id =>
      (supabase.from("planning_tasks" as any) as any)
        .update({ position_x: null, position_y: null })
        .eq("id", id)
    ));
    // Force clean layout and refetch
    setForceAutoLayout(true);
    await refetch();
    // Apply clean layout from initialNodes after refetch
    setTimeout(() => setForceAutoLayout(false), 200);
    toast({ title: "Auto-organized", description: "Nodes reset to standard layout" });
  }, [filteredTasks, refetch]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Track previous tree structure to detect real layout changes
  const prevStructureRef = useRef<string>("");

  useEffect(() => {
    // Build a structural fingerprint: node IDs + parent relationships
    const structureKey = filteredTasks
      .filter(t => !t.standalone)
      .map(t => `${t.id}:${t.parent_id ?? "root"}`)
      .sort()
      .join("|");
    const standaloneKey = filteredTasks
      .filter(t => t.standalone)
      .map(t => t.id)
      .sort()
      .join("|");
    const projectKey = selectedProjectIds.sort().join(",");
    const fullKey = `${projectKey}||${structureKey}||${standaloneKey}`;

    const structureChanged = fullKey !== prevStructureRef.current;
    prevStructureRef.current = fullKey;

    if (structureChanged) {
      // Tree structure changed — merge: keep existing manually-placed positions, use computed for new nodes
      setNodes(prev => {
        const prevMap: Record<string, Node> = {};
        prev.forEach(n => { prevMap[n.id] = n; });
        return initialNodes.map(newNode => {
          const existing = prevMap[newNode.id];
          if (existing) {
            // Keep the position the user dragged to, update data
            return { ...newNode, position: existing.position, data: newNode.data };
          }
          // New node — use the computed position from layoutTree
          return newNode;
        });
      });
    } else {
      // Only data changed (title, done, etc.) — update data in place, keep positions
      setNodes(prev => {
        const nodeMap: Record<string, Node> = {};
        initialNodes.forEach(n => { nodeMap[n.id] = n; });
        return prev.map(existing => {
          const updated = nodeMap[existing.id];
          if (!updated) return existing;
          return { ...existing, data: updated.data };
        });
      });
    }
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  const totalTasks = filteredTasks.filter(t => t.level !== "link").length;
  const doneTasks = filteredTasks.filter(t => t.level !== "link" && t.done).length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  if (activeProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground gap-3">
        <Map className="h-10 w-10 opacity-30" />
        <p className="text-sm">Create a project first to see its map.</p>
      </div>
    );
  }

  return (
    <div className="h-[600px] flex flex-col rounded-2xl overflow-hidden border border-white/10">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-muted/20 backdrop-blur-md flex-wrap">
        {onBack && <button onClick={onBack} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-primary transition-all"><ArrowLeft className="h-4 w-4" /></button>}
        <h3 className="text-sm font-semibold text-foreground hidden sm:block">Project Map</h3>
        {/* Multi-select dropdown */}
        <MultiSelectDropdown
          projects={activeProjects}
          selectedIds={selectedProjectIds}
          onToggle={toggleProjectSelection}
          max={MAX_SELECTED}
        />
        {totalTasks > 0 && (
          <div className="flex items-center gap-2 ml-1">
            <div className="h-1.5 w-16 rounded-full bg-muted/30 overflow-hidden hidden sm:block">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-green-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground font-medium">{doneTasks}/{totalTasks}</span>
          </div>
        )}
        <button onClick={handleAutoOrganize} className="flex items-center gap-1.5 h-7 px-2.5 text-[10px] font-medium bg-muted/30 border border-white/10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all" title="Auto-organize nodes"><LayoutGrid className="h-3.5 w-3.5" /><span className="hidden sm:inline">Organize</span></button>
        <p className="text-[10px] text-muted-foreground hidden lg:block ml-auto">{isMobile ? "Long-press canvas to add" : "Right-click canvas to add · Double-click to edit · Drag to reposition"}</p>
        <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground ml-auto">
          {(Object.entries(levelMeta) as [TaskLevel, typeof levelMeta[TaskLevel]][]).filter(([level]) => level !== "link").map(([level, meta]) => (
            <span key={level} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-sm bg-gradient-to-br ${meta.gradient}`} />{meta.label}</span>
          ))}
        </div>
      </div>
      <div className="flex-1 relative"
        onTouchStart={(e) => {
          const touch = e.touches[0];
          longPressPos.current = { x: touch.clientX, y: touch.clientY };
          longPressTimer.current = setTimeout(() => {
            if (longPressPos.current) {
              setContextMenuPos(longPressPos.current);
            }
          }, 600);
        }}
        onTouchMove={() => {
          if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
        }}
        onTouchEnd={() => {
          if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
        }}
      >
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={handleConnect} onNodeDragStop={handleNodeDragStop} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.2} maxZoom={2} proOptions={{ hideAttribution: true }} className="bg-transparent" onPaneContextMenu={(e) => { e.preventDefault(); setContextMenuPos({ x: e.clientX, y: e.clientY }); }} onPaneClick={() => { setContextMenuPos(null); }}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
          <Controls className="!bg-background !border-white/10 !rounded-lg [&>button]:!bg-muted/30 [&>button]:!border-white/10 [&>button]:!text-muted-foreground [&>button:hover]:!bg-muted/50 [&>button]:!rounded-md" />
          {!isMobile && (
            <MiniMap
              nodeColor={(node) => {
                if (node.type === "projectNode") return "hsl(var(--primary))";
                const task = (node.data as { task?: PlanningTask })?.task;
                if (!task) return "hsl(var(--muted))";
                const colors: Record<TaskLevel, string> = { goal: "#a855f7", phase: "#3b82f6", task: "#06b6d4", action: "#22c55e", link: "#f59e0b" };
                return colors[task.level as TaskLevel];
              }}
              maskColor="hsl(var(--background) / 0.85)"
              className="!bg-background !border-white/10 !rounded-lg"
              style={{ height: 100, width: 150 }}
            />
          )}
        </ReactFlow>
        {/* Context menu (right-click / long-press) */}
        {contextMenuPos && (
          <div className="fixed z-[200]" style={{ left: contextMenuPos.x, top: contextMenuPos.y }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
            <div className="w-56 rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl p-3 shadow-lg">
              <AddChildPopover parentLevel={null} onAdd={(t, l) => { handleContextAddChild(null, l, t); setContextMenuPos(null); }} onAddLink={u => { handleContextAddLink(null, u); setContextMenuPos(null); }} onClose={() => setContextMenuPos(null)} />
            </div>
          </div>
        )}
        {/* Empty state hint when no tasks across all selected projects */}
        {filteredTasks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="text-center space-y-2 opacity-50">
              <Plus className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{isMobile ? "Long-press to add your first node" : "Right-click to add your first node"}</p>
              <p className="text-[10px] text-muted-foreground">Or use the + button on the project node above</p>
            </div>
          </div>
        )}
        <PlanningNodeDetail task={filteredTasks.find(t => t.id === selectedTaskId) || null} open={!!selectedTaskId} onClose={() => setSelectedTaskId(null)} onUpdate={handleUpdateTask} />
      </div>
    </div>
  );
}

/* ── Exported component ────────────────────────────────────── */
interface Props { initialProjectId?: string | null; onBack?: () => void }
export default function PlanningMap({ initialProjectId, onBack }: Props) {
  return <ReactFlowProvider><MapViewInner initialProjectId={initialProjectId} onBack={onBack} /></ReactFlowProvider>;
}
