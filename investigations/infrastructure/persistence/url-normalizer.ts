export function normalizeUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = parsed.pathname.replace(/\/$/, "") || "/";

  const sortedEntries = [...parsed.searchParams.entries()].sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );

  parsed.search = "";

  for (const [key, value] of sortedEntries) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
}
