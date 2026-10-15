/**
 * Handing text to another app from the browser: the clipboard (with the old
 * textarea fallback for browsers or frames without the Clipboard API), a file
 * download, and a new tab.
 */

/** Copies `text`; false when neither the Clipboard API nor the fallback worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied, or not allowed in this frame: try the old way.
  }
  return copyWithTextarea(text);
}

/** document.execCommand("copy") on a hidden textarea, restoring the selection and focus after. */
export function copyWithTextarea(text: string): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  const sel = document.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  Object.assign(ta.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    ta.remove();
    if (range && sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    active?.focus?.();
  }
  return ok;
}

/** Saves `text` as a file through a temporary download link. */
export function downloadText(fileName: string, text: string, type = "text/markdown;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Long enough for the browser to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Opens `url` in a new tab without giving it this page; false when a popup blocker stopped it. */
export function openInNewTab(url: string): boolean {
  const w = window.open(url, "_blank");
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    // Cross-origin already: nothing to cut.
  }
  return true;
}
