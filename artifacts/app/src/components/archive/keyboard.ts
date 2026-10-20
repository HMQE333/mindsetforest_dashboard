/**
 * Single-key shortcuts (Space, 1/2/3, arrows) must never fire while the user
 * is typing: the Digest's window listener once ate every Space typed into the
 * Library search and rated a card on "1".
 */

/** Whether a key event belongs to a text field, a contenteditable, or a menu or dialog control. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    return !["button", "checkbox", "radio", "range", "reset", "submit", "color", "file", "image"].includes(type);
  }
  return !!el.closest('[contenteditable="true"], [role="textbox"], [role="combobox"], [role="menu"], [role="listbox"]');
}

/** A plain key press a page shortcut may take: no modifier, not typed into a field, not already handled. */
export function isShortcutKey(e: KeyboardEvent): boolean {
  return !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing && !isTypingTarget(e.target);
}

/** Whether a modal dialog is open over the page (its own keys win). */
export function dialogOpen(): boolean {
  return typeof document !== "undefined" && !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

/**
 * onMouseDown for a chip or a step button whose view takes Enter itself (the
 * tag queue, the reader, the Inbox strip): a click leaves the focus where it
 * was, so the next Enter still means "accept" instead of pressing the clicked
 * button again. Tab still reaches the button, and Enter then presses it.
 */
export function keepFocus(e: { preventDefault: () => void; button?: number }) {
  if (!e.button) e.preventDefault();
}
