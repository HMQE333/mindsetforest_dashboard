import { useEffect, useId, useRef, useState } from "react";
import BlockError from "./BlockError";

type Mermaid = typeof import("mermaid").default;

let mermaidLoad: Promise<Mermaid> | null = null;

/** Mermaid, fetched the first time a diagram is shown (it is large), set up for the dark theme. */
function loadMermaid(): Promise<Mermaid> {
  mermaidLoad ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      // Strict: no HTML or scripts from the diagram text, no click handlers.
      securityLevel: "strict",
      theme: "dark",
      fontFamily: "inherit",
      themeVariables: {
        background: "transparent",
        primaryColor: "#2a2650",
        primaryBorderColor: "#7c6bd6",
        primaryTextColor: "#ece9fb",
        lineColor: "#9a93c9",
        fontSize: "14px",
      },
    });
    return mermaid;
  });
  return mermaidLoad;
}

// One diagram at a time: mermaid keeps global state while it renders.
let queue: Promise<unknown> = Promise.resolve();

export default function MermaidBlock({ code, lang }: { code: string; lang: "pl" | "en" }) {
  const box = useRef<HTMLDivElement>(null);
  const id = `kos-mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [state, setState] = useState<"loading" | "done" | { error: string }>("loading");

  useEffect(() => {
    let live = true;
    const job = queue.then(async () => {
      try {
        const mermaid = await loadMermaid();
        await mermaid.parse(code);
        const { svg } = await mermaid.render(id, code);
        if (!live || !box.current) return;
        // The SVG comes from mermaid with securityLevel "strict", which sanitises labels.
        box.current.innerHTML = svg;
        // Mermaid sizes the SVG to its natural width (max-width) and lets it shrink on a narrow screen.
        box.current.querySelector("svg")?.setAttribute("role", "img");
        setState("done");
      } catch (e) {
        document.getElementById(`d${id}`)?.remove();
        document.getElementById(id)?.remove();
        if (live) setState({ error: e instanceof Error ? e.message.split("\n").slice(0, 4).join("\n") : String(e) });
      }
    });
    queue = job.catch(() => undefined);
    return () => {
      live = false;
    };
  }, [code, id]);

  if (typeof state === "object") {
    return <BlockError title={lang === "pl" ? "Nie udało się narysować diagramu" : "Could not draw the diagram"} message={state.error} source={code} />;
  }
  return (
    <figure className="my-2">
      {state === "loading" && <p className="text-xs text-muted-foreground py-6 text-center">{lang === "pl" ? "Rysuję diagram…" : "Drawing the diagram…"}</p>}
      <div ref={box} className="flex justify-center overflow-x-auto [&_svg]:max-w-full" />
    </figure>
  );
}
