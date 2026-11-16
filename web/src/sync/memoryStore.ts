// Store kept in memory, for tests and headless clients. It copies, orders
// and refuses like the IndexedDB store, so tests see what the app sees.
import type { Op } from "@blunder/core";
import type { Store } from "./types";

function copies(ops: Iterable<Op>): Op[] {
  return Array.from(ops, (op) => structuredClone(op));
}

function byOpId(a: Op, b: Op): number {
  if (a.opId < b.opId) return -1;
  return a.opId > b.opId ? 1 : 0;
}

export function createMemoryStore(replicaId: string): Store {
  const log = new Map<string, Op>();
  const outbox = new Map<string, Op>(); // a Map keeps the order of insertion
  let cursor = 0;

  return {
    loadReplicaId: async () => replicaId,
    loadLog: async () => copies(log.values()).sort(byOpId),
    loadOutbox: async () => copies(outbox.values()),
    loadCursor: async () => cursor,

    async saveLocalOp(op) {
      if (outbox.has(op.opId)) throw new Error(`operation ${op.opId} is already in the outbox`);
      const copy = structuredClone(op);
      log.set(op.opId, copy);
      outbox.set(op.opId, copy);
    },

    async saveReceivedOps(ops, newCursor) {
      for (const op of ops) {
        if (!log.has(op.opId)) log.set(op.opId, structuredClone(op));
      }
      cursor = newCursor;
    },

    async removeFromOutbox(opIds) {
      for (const id of opIds) outbox.delete(id);
    },
  };
}
