/** "anthropic/claude-sonnet-5.5" -> "Claude Sonnet 5.5" for the UI. */
export function prettyModelName(slug: string): string {
  const name = slug.split("/").pop() || slug;
  return name
    .replace(/:.*$/, "")
    .split("-")
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}
