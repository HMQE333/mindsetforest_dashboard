import { Sparkles } from "lucide-react";
import { useAssistant } from "@/hooks/useAssistant";
import { cn } from "@/lib/utils";

interface Props {
  /** What to say to the assistant. Mention "path" so the Paths section rides along. */
  message: string;
  /** "send" asks straight away; "prefill" types it in and lets the user finish it. */
  mode?: "send" | "prefill";
  title?: string;
  className?: string;
}

/**
 * The one way into AI from Paths. Everything goes through the assistant panel,
 * so a drafted or reworked plan arrives as a `revise_path` proposal the user
 * confirms there, and that write snapshots the old plan into the path's history.
 *
 * No scope pinning here: a message that names a path already brings the Paths
 * section along (`keywordScopes`), and the user's pins stay theirs.
 */
export default function AskAIButton({ message, mode = "send", title, className }: Props) {
  const { openPanel, sendMessage, prefill, isStreaming } = useAssistant();

  const ask = () => {
    openPanel();
    // A reply still streaming would silently drop the send; leave the text in
    // the input instead so it goes out when the user is ready.
    if (mode === "prefill" || isStreaming) prefill(message);
    else void sendMessage(message);
  };

  return (
    <button
      type="button"
      onClick={ask}
      title={title}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-primary/30 bg-primary/10 text-foreground hover:bg-primary/20 transition-all flex-shrink-0",
        className,
      )}
    >
      <Sparkles className="h-3 w-3" /> Ask AI
    </button>
  );
}
