/**
 * A link that is safe to put in an href or window.open. React 18 renders
 * `javascript:` URLs as they are, and some of these links come from other
 * people (Forest seeds, shared libraries), so only web and mail links pass.
 * A bare domain ("example.com/x") gets https://; anything else is null.
 */
export function safeUrl(raw: string | null | undefined): string | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  // Any other scheme (javascript:, data:, vbscript:, file:) is refused.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  if (/\s/.test(url) || !/^[^/]+\.[^/]+/.test(url)) return null;
  return `https://${url}`;
}
