// Store kept in IndexedDB: one database per room.
import { openDB } from "idb";
import type { DBSchema } from "idb";
import type { Op } from "@blunder/core";
import type { Store } from "../sync/types";

interface RoomDb extends DBSchema {
  log: { key: string; value: Op };
  // Auto-incremented keys keep the outbox in the order it was filled.
  outbox: { key: number; value: Op; indexes: { opId: string } };
  meta: { key: "cursor" | "replicaId"; value: number | string };
}

interface WriteTransaction {
  done: Promise<void>;
  abort(): void;
}

// A write can throw before IndexedDB notices, for example when a value has
// no key. The transaction would then commit whatever was written so far, so
// it is aborted by hand to keep "all or nothing".
async function allOrNothing(tx: WriteTransaction, work: () => Promise<void>): Promise<void> {
  try {
    await work();
    await tx.done;
  } catch (error) {
    // tx.done rejects after an abort; the caller gets the first error instead.
    tx.done.catch(() => {});
    try {
      tx.abort();
    } catch {
      // Already aborted by IndexedDB itself.
    }
    throw error;
  }
}

export async function openIdbStore(roomId: string): Promise<Store> {
  const db = await openDB<RoomDb>(`blunder-room-${roomId}`, 1, {
    upgrade(database) {
      database.createObjectStore("log", { keyPath: "opId" });
      const outbox = database.createObjectStore("outbox", { autoIncrement: true });
      outbox.createIndex("opId", "opId", { unique: true });
      database.createObjectStore("meta");
    },
  });

  return {
    async loadReplicaId() {
      // Read and create in one transaction, so two calls cannot both create.
      const tx = db.transaction("meta", "readwrite");
      const stored = await tx.store.get("replicaId");
      if (typeof stored === "string") return stored;
      const created = crypto.randomUUID();
      await tx.store.put(created, "replicaId");
      await tx.done;
      return created;
    },

    loadLog: () => db.getAll("log"),
    loadOutbox: () => db.getAll("outbox"),

    async loadCursor() {
      const stored = await db.get("meta", "cursor");
      return typeof stored === "number" ? stored : 0;
    },

    async saveLocalOp(op) {
      const tx = db.transaction(["log", "outbox"], "readwrite");
      await allOrNothing(tx, async () => {
        await tx.objectStore("log").put(op);
        await tx.objectStore("outbox").add(op);
      });
    },

    async saveReceivedOps(ops, cursor) {
      const tx = db.transaction(["log", "meta"], "readwrite");
      await allOrNothing(tx, async () => {
        const log = tx.objectStore("log");
        // Not awaited one by one: the transaction runs requests in order.
        await Promise.all(
          ops.map(async (op) => {
            if ((await log.getKey(op.opId)) === undefined) await log.put(op);
          }),
        );
        await tx.objectStore("meta").put(cursor, "cursor");
      });
    },

    async removeFromOutbox(opIds) {
      const tx = db.transaction("outbox", "readwrite");
      await allOrNothing(tx, async () => {
        const byOpId = tx.store.index("opId");
        await Promise.all(
          opIds.map(async (opId) => {
            const key = await byOpId.getKey(opId);
            if (key !== undefined) await tx.store.delete(key);
          }),
        );
      });
    },
  };
}
