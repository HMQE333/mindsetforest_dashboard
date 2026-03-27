export interface BreathingPattern {
  id: string;
  name: string;
  description: string;
  icon: string;
  inhale: number;
  hold1: number;
  exhale: number;
  hold2: number;
}

export const BREATHING_PATTERNS: BreathingPattern[] = [
  { id: "equal", name: "Equal Breath", description: "Balanced inhale and exhale for calm focus", icon: "⚖️", inhale: 4, hold1: 0, exhale: 4, hold2: 0 },
  { id: "box", name: "Box Breathing", description: "Military technique for stress control", icon: "🔲", inhale: 4, hold1: 4, exhale: 4, hold2: 4 },
  { id: "478", name: "4-7-8 Technique", description: "Deep relaxation and sleep preparation", icon: "🌙", inhale: 4, hold1: 7, exhale: 8, hold2: 0 },
  { id: "relaxing", name: "Relaxing Flow", description: "Extended exhale for parasympathetic activation", icon: "🍃", inhale: 4, hold1: 2, exhale: 6, hold2: 0 },
];

export const RUNES = ["ᚱ", "ᚢ", "ᚾ", "ᛖ", "ᛊ", "ᚨ"];

export type VesselShape = "urn" | "orb" | "hourglass" | "ampoule" | "eye";

export interface VesselShapeOption {
  id: VesselShape;
  name: string;
  icon: string;
}

export const VESSEL_SHAPES: VesselShapeOption[] = [
  { id: "urn", name: "Ancient Urn", icon: "🏺" },
  { id: "orb", name: "Crystal Orb", icon: "🔮" },
  { id: "hourglass", name: "Hourglass", icon: "⏳" },
  { id: "ampoule", name: "Ampoule", icon: "⚗️" },
  { id: "eye", name: "All-Seeing Eye", icon: "👁️" },
];

export const DURATION_OPTIONS = [
  { label: "1 min", seconds: 60 },
  { label: "2 min", seconds: 120 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
];

export type BreathPhase = "inhale" | "hold1" | "exhale" | "hold2";

export function getPhaseLabel(phase: BreathPhase): string {
  switch (phase) {
    case "inhale": return "Breathe In";
    case "hold1": return "Hold";
    case "exhale": return "Breathe Out";
    case "hold2": return "Hold";
  }
}

export function getCycleDuration(pattern: BreathingPattern): number {
  return pattern.inhale + pattern.hold1 + pattern.exhale + pattern.hold2;
}
