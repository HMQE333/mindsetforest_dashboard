import { useCallback, useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";
import { ROBOT_SEGMENTS, ROBOT_STILL, type RobotMood, type RobotReaction, type RobotReactionKind } from "@/lib/assistant-robot";

/**
 * The assistant's face: the AI_robo lottie, an orb that blinks, thinks,
 * nods, shakes its head, raises an alert and jumps. Its demo buttons were
 * cut from the file (assets/assistant-robot.json); the states are driven
 * from the chat instead of by clicking them.
 *
 * Idle is a blink every few seconds rather than a constant loop, so an icon
 * that is always on screen costs almost nothing. With reduced motion it
 * shows a still pose per state.
 */

interface AssistantRobotProps {
  /** Box size in px; the orb fills it. */
  size: number;
  mood?: RobotMood;
  /** One-off animation; plays when `key` changes (not for the one present on mount). */
  reaction?: RobotReaction | null;
  /** Let the jump rise above the box (where there is room for it). */
  allowJump?: boolean;
  jumpOnHover?: boolean;
  jumpOnClick?: boolean;
  /** Jump once when it first appears (a greeting). */
  greet?: boolean;
  className?: string;
}

// The orb sits in the 200..500 square of the 700 px canvas; a little margin for its highlight.
const VIEWBOX = "190 190 320 320";

type Lottie = typeof import("lottie-web/build/player/lottie_light").default;
let assets: Promise<[Lottie, unknown]> | null = null;
function loadAssets() {
  if (!assets) {
    assets = Promise.all([
      import("lottie-web/build/player/lottie_light").then((m) => m.default),
      import("@/assets/assistant-robot.json").then((m) => m.default as unknown),
    ]);
    assets.catch(() => { assets = null; });
  }
  return assets;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function AssistantRobot({
  size, mood = "idle", reaction = null, allowJump = false, jumpOnHover = false, jumpOnClick = false, greet = false, className = "",
}: AssistantRobotProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const anim = useRef<AnimationItem | null>(null);
  const [ready, setReady] = useState(false);
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const reacting = useRef(false);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const still = useRef(false);

  /** The animation playing, on the element (for tests and devtools). */
  const mark = (state: string) => boxRef.current?.parentElement?.setAttribute("data-state", state);

  const clearBlink = () => {
    if (blinkTimer.current) clearTimeout(blinkTimer.current);
    blinkTimer.current = null;
  };

  /** Back to the mood: a thinking loop, or a still face that blinks now and then. */
  const resume = useCallback(() => {
    const a = anim.current;
    if (!a) return;
    clearBlink();
    const m = moodRef.current;
    mark(m);
    if (still.current) { a.goToAndStop(ROBOT_STILL[m], true); return; }
    if (m === "thinking") {
      a.loop = true;
      a.playSegments(ROBOT_SEGMENTS.thinking, true);
      return;
    }
    a.loop = false;
    a.goToAndStop(ROBOT_SEGMENTS.idle[0], true);
    blinkTimer.current = setTimeout(() => {
      if (!anim.current || reacting.current || moodRef.current !== "idle") return;
      anim.current.playSegments(ROBOT_SEGMENTS.idle, true);
    }, 2500 + Math.random() * 3500);
  }, []);

  const react = useCallback((kind: RobotReactionKind) => {
    const a = anim.current;
    if (!a) return;
    // Jumping in a box that clips it would look broken; nod instead.
    const k: RobotReactionKind = kind === "jump" && !allowJump ? "yes" : kind;
    mark(k);
    if (still.current) {
      a.goToAndStop(ROBOT_STILL[k], true);
      clearBlink();
      blinkTimer.current = setTimeout(resume, 1500);
      return;
    }
    clearBlink();
    reacting.current = true;
    a.loop = false;
    a.playSegments(ROBOT_SEGMENTS[k], true);
  }, [allowJump, resume]);

  // Load once, build the player for this box.
  useEffect(() => {
    let cancelled = false;
    void loadAssets().then(([lottie, data]) => {
      if (cancelled || !boxRef.current) return;
      still.current = !!reducedMotion();
      const a = lottie.loadAnimation({
        container: boxRef.current,
        renderer: "svg",
        loop: false,
        autoplay: false,
        // lottie changes the data it is given, and several robots can be on screen.
        animationData: structuredClone(data),
        rendererSettings: { viewBoxSize: VIEWBOX, preserveAspectRatio: "xMidYMid meet", progressiveLoad: false },
      });
      anim.current = a;
      a.addEventListener("complete", () => {
        if (reacting.current) { reacting.current = false; resume(); return; }
        if (moodRef.current === "idle") resume();
      });
      a.addEventListener("DOMLoaded", () => {
        const svg = boxRef.current?.querySelector("svg");
        if (svg && allowJump) svg.style.overflow = "visible";
        setReady(true);
        if (greet) react("jump"); else resume();
      });
    }).catch(() => { /* the static orb stays */ });
    return () => {
      cancelled = true;
      clearBlink();
      anim.current?.destroy();
      anim.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A change of mood takes over at once, unless a reaction is still playing (it resumes after).
  useEffect(() => {
    if (ready && !reacting.current) resume();
  }, [mood, ready, resume]);

  // Reactions play when their key changes; the one there on mount is history.
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const key = reaction?.key ?? null;
    if (seen.current === undefined) { seen.current = key; return; }
    if (key === seen.current) return;
    seen.current = key;
    if (reaction) react(reaction.kind);
  }, [reaction, ready, react]);

  const lastJump = useRef(0);
  const jump = () => {
    if (!ready || reacting.current || moodRef.current !== "idle") return;
    if (Date.now() - lastJump.current < 1200) return;
    lastJump.current = Date.now();
    react("jump");
  };

  return (
    <div
      className={`relative shrink-0 ${jumpOnClick ? "cursor-pointer" : ""} ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={jumpOnHover ? jump : undefined}
      onClick={jumpOnClick ? jump : undefined}
      role="img"
      aria-label="Assistant"
    >
      <div ref={boxRef} className="absolute inset-0" />
      {/* Until the animation is in: the same orb, still, so nothing jumps in. */}
      {!ready && (
        <div className="absolute inset-[3%] rounded-full" style={{ background: "linear-gradient(170deg, #0a3cff 0%, #7a16ff 60%, #c400ff 100%)" }}>
          <span className="absolute rounded-full bg-white" style={{ left: "31%", top: "37%", width: "6%", height: "19%" }} />
          <span className="absolute rounded-full bg-white" style={{ left: "57%", top: "37%", width: "6%", height: "19%" }} />
        </div>
      )}
    </div>
  );
}
