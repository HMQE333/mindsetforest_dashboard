import { useMemo } from "react";
import { FolderTree } from "lucide-react";
import { folderNoteCounts, inFolder, isTypeTag, normaliseTag, tagPaths } from "@/lib/archive-tags";

/** The item sits in the folder (a tag path, "projekty/rybiapaka"), or below it. Type tags are not folders. */
export function inTagFolder(tags: readonly string[] | null | undefined, folder: string): boolean {
  const f = normaliseTag(folder);
  return !!f && (tags ?? []).some((t) => inFolder(normaliseTag(t), f));
}

/**
 * Tags as folders, like the Archive's tree but as a row of chips (Forest,
 * Images): the top-level folders with their counts; picking one shows the
 * path back up and its sub-folders.
 */
export default function TagFolderChips({ tagLists, value, onChange }: { tagLists: readonly (readonly string[] | null | undefined)[]; value: string; onChange: (v: string) => void }) {
  const current = normaliseTag(value);
  const counts = useMemo(
    () => folderNoteCounts(tagLists.map((tags) => (tags ?? []).map(normaliseTag).filter((t) => t && !isTypeTag(t)))),
    [tagLists],
  );
  const children = useMemo(() => {
    const depth = current ? current.split("/").length + 1 : 1;
    return [...counts.entries()]
      .filter(([p]) => p.split("/").length === depth && (!current || p.startsWith(`${current}/`)))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl"))
      .slice(0, 24);
  }, [counts, current]);
  if (!current && children.length === 0) return null;
  const chip = "text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all flex items-center gap-1 max-w-[14rem]";
  return (
    <div className="flex flex-wrap gap-1.5 items-center" role="group" aria-label="Folders">
      <FolderTree className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {current && <button onClick={() => onChange("")} className={`${chip} bg-muted/40 text-muted-foreground hover:text-foreground`}>All</button>}
      {(current ? tagPaths(current) : []).map((p) => (
        <button key={p} onClick={() => onChange(p)} className={`${chip} ${p === current ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-foreground/80 hover:text-foreground"}`}>
          <span className="truncate">#{p.split("/").pop()}</span>
          {p !== current && <span className="opacity-50">›</span>}
        </button>
      ))}
      {children.map(([p, n]) => (
        <button key={p} onClick={() => onChange(p)} className={`${chip} bg-muted/40 text-muted-foreground hover:text-foreground`} title={`#${p}`}>
          <span className="truncate">#{p.split("/").pop()}</span>
          <span className="opacity-60 text-[10px]">{n}</span>
        </button>
      ))}
    </div>
  );
}
