import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** What an empty value renders as, so a bare "." never reaches the UI. */
export const EMPTY = "–";
