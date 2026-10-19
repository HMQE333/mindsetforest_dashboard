import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { whenIdle } from "@/lib/lazy-module";
import { addEmojiStylesheet, emojiFontCached, loadEmojiFont } from "@/lib/emoji-font";

// Fluent emoji (see lib/emoji-font.ts). A browser that has loaded them before
// has the files cached: the stylesheet goes in now. On a first visit they load
// after the first tap, click, key or wheel: the first screen never waits for
// them, Chrome stops updating LCP at the first input (a later swap would make
// faded-in text count as painted again), and a visitor who only looks does
// not download them at all.
if (emojiFontCached()) {
  addEmojiStylesheet();
} else {
  const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  const start = () => {
    for (const e of events) window.removeEventListener(e, start, true);
    whenIdle(() => void loadEmojiFont().catch(() => {}), 1000);
  };
  for (const e of events) window.addEventListener(e, start, { capture: true, passive: true });
}

createRoot(document.getElementById("root")!).render(<App />);
