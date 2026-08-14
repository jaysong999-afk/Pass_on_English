/** Ignore transient blob previews and empty values. */
export function isDisplayableAvatarUrl(url?: string | null): url is string {
  if (!url?.trim()) return false;
  return !url.startsWith("blob:");
}

export function displayInitials(name: string, max = 2): string {
  return name
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, max)
    .toUpperCase();
}
