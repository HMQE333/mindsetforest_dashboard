/**
 * True when a mouse is the main pointer: a PC, not a phone or tablet.
 * Removing links from the archive is offered only there, in the right-click
 * menu, by choice: a phone can open and read links but not remove them.
 */
export function hasMouse(): boolean {
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return false;
  }
}
