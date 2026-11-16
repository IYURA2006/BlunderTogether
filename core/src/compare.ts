import type { Ts } from "./types";

// Plain code-unit order. localeCompare would depend on the device's locale.
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// Negative if a is older than b, positive if newer, zero if equal.
// The replica id breaks ties between counters, which makes the order total.
export function compareTs(a: Ts, b: Ts): number {
  if (a.counter !== b.counter) return a.counter - b.counter;
  return compareStrings(a.replicaId, b.replicaId);
}
