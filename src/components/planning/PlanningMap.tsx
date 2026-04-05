import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge,
  useNodesState, useEdgesState,
  Handle, Position,
  type NodeProps, MarkerType, BackgroundVariant,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { usePlanningState, PlanningTask, TaskLevel } from "@/hooks/usePlanningState";
import { useUserProjects, UserProject } from "@/hooks/useUserProjects";
import { Target, Flag, ListChecks, Zap, Check, Plus, Trash2, X, Globe, ExternalLink, ArrowLeft } from "lucide-react";
import PlanningNodeDetail from "./PlanningNodeDetail";

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

  return (
    <div className={`relative px-4 py-3 rounded-xl border ${meta.borderColor} ${meta.glow} bg-background/90 backdrop-blur-md min-w-[160px] max-w-[220px] transition-all duration-200 hover:scale-105 ${task.done ? "opacity-50" : ""}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onDoubleClick={e => { e.stopPropagation(); setEditing(true); }} onClick={e => { e.stopPropagation(); if (!editing) onSelect(task.id); }}>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-3 !h-3" />
      <div className={`absolute top-0 left-3 right-3 h-[2px] rounded-full bg-gradient-to-r ${meta.gradient}`} />
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
      <div className="flex justify-center mt-2">
        <button onClick={e => { e.stopPropagation(); setShowAdd(!showAdd); }} className={`w-6 h-6 rounded-full flex items-center justify-center transition-all border ${showAdd ? "gradient-purple border-transparent text-white scale-110" : "bg-muted/30 border-white/10 text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>{showAdd ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</button>
      </div>
      {showAdd && <AddChildPopover parentLevel={task.level} onAdd={(t, l) => onAddChild(task.id, l, t)} onAddLink={u => onAddLink(task.id, u)} onClose={() => setShowAdd(false)} />}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-3 !h-3" />
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

function layoutTree(project: UserProject, tasks: PlanningTask[], callbacks: any): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const rootId = `project-${project.id}`;
  nodes.push({ id: rootId, type: "projectNode", position: { x: 0, y: 0 }, data: { project, onAddChild: callbacks.onAddChild, onAddLink: callbacks.onAddLink } });
  const rootTasks = tasks.filter(t => t.project_id === project.id && t.parent_id === null);
  const X_SPACING = 260;
  const Y_SPACING = 120;

  function layoutChildren(parentNodeId: string, children: PlanningTask[], depth: number, parentX: number): number {
    if (children.length === 0) return parentX;
    const totalWidth = children.reduce((sum, child) => sum + Math.max(1, countLeaves(child.id, tasks)) * X_SPACING, 0);
    let currentX = parentX - totalWidth / 2 + X_SPACING / 2;
    children.forEach(child => {
      const grandchildren = tasks.filter(t => t.parent_id === child.id);
      const leafCount = Math.max(1, countLeaves(child.id, tasks));
      const nodeX = currentX + (leafCount * X_SPACING) / 2 - X_SPACING / 2;
      const nodeId = `task-${child.id}`;
      const isLink = child.level === "link";
      nodes.push({ id: nodeId, type: isLink ? "linkNode" : "taskNode", position: { x: nodeX, y: depth * Y_SPACING }, data: isLink ? { task: child, onDelete: callbacks.onDelete, onSelect: callbacks.onSelect } : { task: child, onAddChild: callbacks.onAddChild, onAddLink: callbacks.onAddLink, onDelete: callbacks.onDelete, onToggle: callbacks.onToggle, onRename: callbacks.onRename, onSelect: callbacks.onSelect } });
      const edgeColors: Record<TaskLevel, string> = { goal: "#a855f7", phase: "#3b82f6", task: "#06b6d4", action: "#22c55e", link: "#f59e0b" };
      edges.push({ id: `e-${parentNodeId}-${nodeId}`, source: parentNodeId, target: nodeId, type: "smoothstep", animated: !child.done, style: { stroke: edgeColors[child.level as TaskLevel], strokeWidth: 2, opacity: child.done ? 0.3 : 0.7 }, markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors[child.level as TaskLevel], width: 15, height: 15 } });
      if (grandchildren.length > 0) layoutChildren(nodeId, grandchildren, depth + 1, nodeX);
      currentX += leafCount * X_SPACING;
    });
    return currentX;
  }

  layoutChildren(rootId, rootTasks, 1, 0);
  return { nodes, edges };
}

/* ── Inner MapView ─────────────────────────────────────────── */
function MapViewInner({ initialProjectId, onBack }: { initialProjectId?: string | null; onBack?: () => void }) {
  const { projects } = useUserProjects();
  const activeProjects = projects;
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || activeProjects[0]?.id || "");
  const { tasks, addTask, updateTask, deleteTask, toggleTask } = usePlanningState(selectedProjectId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProjectId && activeProjects.length > 0) setSelectedProjectId(activeProjects[0].id);
  }, [activeProjects, selectedProjectId]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleAddChild = useCallback((parentId: string | null, level: TaskLevel, title: string) => {
    if (!selectedProjectId) return;
    addTask({ project_id: selectedProjectId, parent_id: parentId, level, title, done: false, deadline: null, leverage: null, energy: null, time_minutes: null, url: null, icon: null, notes: "" });
  }, [addTask, selectedProjectId]);

  const handleAddLink = useCallback((parentId: string | null, url: string) => {
    if (!selectedProjectId) return;
    addTask({ project_id: selectedProjectId, parent_id: parentId, level: "link" as TaskLevel, title: extractDomain(url), url: normalizeUrl(url), done: false, deadline: null, leverage: null, energy: null, time_minutes: null, icon: null, notes: "" });
  }, [addTask, selectedProjectId]);

  const handleDelete = useCallback((taskId: string) => deleteTask(taskId), [deleteTask]);
  const handleToggle = useCallback((taskId: string) => toggleTask(taskId), [toggleTask]);
  const handleRename = useCallback((taskId: string, newTitle: string) => updateTask(taskId, { title: newTitle }), [updateTask]);
  const handleSelect = useCallback((taskId: string) => setSelectedTaskId(taskId), []);
  const handleUpdateTask = useCallback((taskId: string, updates: Partial<PlanningTask>) => updateTask(taskId, updates), [updateTask]);

  const callbacks = useMemo(() => ({ onAddChild: handleAddChild, onAddLink: handleAddLink, onDelete: handleDelete, onToggle: handleToggle, onRename: handleRename, onSelect: handleSelect }), [handleAddChild, handleAddLink, handleDelete, handleToggle, handleRename, handleSelect]);

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!selectedProject) return { initialNodes: [], initialEdges: [] };
    const { nodes, edges } = layoutTree(selectedProject, tasks, callbacks);
    return { initialNodes: nodes, initialEdges: edges };
  }, [selectedProject, tasks, callbacks]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => { setNodes(initialNodes); setEdges(initialEdges); }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (activeProjects.length === 0) {
    return <div className="flex items-center justify-center h-[400px] text-muted-foreground text-sm">Create a project first to see its map.</div>;
  }

  return (
    <div className="h-[600px] flex flex-col rounded-2xl overflow-hidden border border-white/10">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-muted/20 backdrop-blur-md">
        {onBack && <button onClick={onBack} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-primary transition-all"><ArrowLeft className="h-4 w-4" /></button>}
        <h3 className="text-sm font-semibold text-foreground">Project Map</h3>
        <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className="h-8 text-xs bg-muted/30 border border-white/10 rounded-lg px-2 text-foreground outline-none">
          {activeProjects.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
        </select>
        <p className="text-[10px] text-muted-foreground hidden lg:block ml-auto">Right-click canvas to add · Double-click to edit · Hover for actions</p>
        <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground ml-auto">
          {(Object.entries(levelMeta) as [TaskLevel, typeof levelMeta[TaskLevel]][]).map(([level, meta]) => (
            <span key={level} className="flex items-center gap-1.5"><div className={`w-3 h-3 rounded bg-gradient-to-br ${meta.gradient}`} />{meta.label}</span>
          ))}
        </div>
      </div>
      <div className="flex-1 relative">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.2} maxZoom={2} proOptions={{ hideAttribution: true }} className="bg-transparent">
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
          <Controls className="!bg-background !border-white/10 !rounded-lg [&>button]:!bg-muted/30 [&>button]:!border-white/10 [&>button]:!text-muted-foreground [&>button:hover]:!bg-muted/50 [&>button]:!rounded-md" />
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
        </ReactFlow>
        <PlanningNodeDetail task={tasks.find(t => t.id === selectedTaskId) || null} open={!!selectedTaskId} onClose={() => setSelectedTaskId(null)} onUpdate={handleUpdateTask} />
      </div>
    </div>
  );
}

/* ── Exported component ────────────────────────────────────── */
interface Props { initialProjectId?: string | null; onBack?: () => void }
export default function PlanningMap({ initialProjectId, onBack }: Props) {
  return <ReactFlowProvider><MapViewInner initialProjectId={initialProjectId} onBack={onBack} /></ReactFlowProvider>;
}
