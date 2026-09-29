/**
 * Window events that tell page-scoped data hooks to refetch after something
 * outside them (the assistant, another tab of the UI) wrote to their tables.
 * Same pattern as PLANNING_TASKS_CHANGED_EVENT and PATHS_CHANGED_EVENT.
 */
export const TRACKER_ENTRIES_CHANGED_EVENT = "tracker-entries-changed";
export const CALENDAR_EVENTS_CHANGED_EVENT = "calendar-events-changed";
export const FINANCE_CHANGED_EVENT = "finance-changed";
export const USER_SETTINGS_CHANGED_EVENT = "user-settings-changed";
export const WATCH_ENTRIES_CHANGED_EVENT = "watch-entries-changed";
export const LIBRARY_CHANGED_EVENT = "library-changed";

export function emitAppEvent(name: string): void {
  window.dispatchEvent(new CustomEvent(name));
}

/** Subscribe to an app event; returns the unsubscribe function for useEffect. */
export function onAppEvent(name: string, handler: () => void): () => void {
  const fn = () => handler();
  window.addEventListener(name, fn);
  return () => window.removeEventListener(name, fn);
}
