/**
 * How this page load started, read once when the bundle loads (before the
 * assistant's deep-link handler strips the parameter from the address).
 * When it was opened by an `?assistant=` link (a phone shortcut), popups such
 * as the morning review wait until the assistant is closed, so nothing covers
 * it on the way in. Nothing is stored: the next normal visit is unaffected.
 */
export const LAUNCH_SETTLED_EVENT = "lov:launch-settled";

let holding = typeof window !== "undefined" && /[?&]assistant=/.test(window.location.search + window.location.hash);

/** True while popups should wait for the assistant opened by a link. */
export function launchHoldsPopups(): boolean {
  return holding;
}

/** The assistant opened by the link was closed: popups may show again. */
export function settleLaunch(): void {
  if (!holding) return;
  holding = false;
  window.dispatchEvent(new CustomEvent(LAUNCH_SETTLED_EVENT));
}
