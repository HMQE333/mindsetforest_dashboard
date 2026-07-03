import { useState } from "react";
import { UserPlus, Loader2 } from "lucide-react";

interface AddFriendInputProps {
  onAdd: (handle: string) => Promise<boolean>;
}

export default function AddFriendInput({ onAdd }: AddFriendInputProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    const ok = await onAdd(v);
    setBusy(false);
    if (ok) setValue("");
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="@username or code"
        maxLength={30}
        className="flex-1 px-3 py-2 rounded-lg bg-background/50 border border-white/5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
      />
      <button
        onClick={submit}
        disabled={busy || !value.trim()}
        className="p-2 rounded-lg gradient-purple text-primary-foreground hover:opacity-90 transition-all disabled:opacity-40"
        title="Add friend"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
      </button>
    </div>
  );
}