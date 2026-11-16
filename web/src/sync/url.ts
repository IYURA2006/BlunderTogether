// The server serves the app and the WebSocket endpoint from one origin, so
// the address follows the page unless a build sets VITE_SYNC_URL.
export function syncUrl(page: { protocol: string; host: string }, override?: string): string {
  if (override) return override;
  const scheme = page.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${page.host}/ws`;
}
