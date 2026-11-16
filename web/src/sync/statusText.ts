import type { SyncStatus } from "./types";

// The words shown next to the connection indicator.
export function describeStatus({ connected, unsent }: SyncStatus): string {
  if (unsent === 0) {
    return connected ? "Connected, all changes sent" : "Offline, no changes waiting";
  }
  const changes = unsent === 1 ? "1 change" : `${unsent} changes`;
  return connected ? `Connected, sending ${changes}` : `Offline, ${changes} waiting`;
}
