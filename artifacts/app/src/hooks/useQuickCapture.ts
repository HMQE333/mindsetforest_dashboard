import { useState, useEffect, useCallback } from "react";
import { matchesHotkey } from "@/lib/hotkeys";
import { useHotkeys } from "./useHotkeys";

export function useQuickCapture() {
  const [open, setOpen] = useState(false);
  const combo = useHotkeys().quickCapture;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchesHotkey(e, combo)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [combo]);

  const close = useCallback(() => setOpen(false), []);

  return { open, setOpen, close };
}
