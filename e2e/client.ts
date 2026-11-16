import { apply, canonicalize, emptyState, newClock, observe } from "@blunder/core";
import type { Clock, Op, State } from "@blunder/core";
import { expect } from "vitest";
import WebSocket from "ws";
import { randomOp } from "../core/sim/randomOp";
import type { Rng } from "../core/sim/rng";
import { createSyncClient } from "../web/src/sync/client";
import { createMemoryStore } from "../web/src/sync/memoryStore";
import type { SocketLike, SyncClient } from "../web/src/sync/types";

// A client without a browser. It mirrors the save, apply, notify order of
// web/src/room.ts around the real sync client and the in-memory store.
export interface TestClient {
  readonly state: State;
  readonly sync: SyncClient;
  readonly seen: Set<string>; // opId of every operation applied here

  // Creates and sends a local operation, in the same order as the app:
  // save, apply, notify.
  edit(make: (clock: Clock) => Op): Promise<Op>;
  canonical(): string;
  stop(): void;
}

export function createTestClient(wsUrl: string, roomId: string, replicaId: string): TestClient {
  const store = createMemoryStore(replicaId);
  const state = emptyState();
  const clock = newClock(replicaId);
  const seen = new Set<string>();

  const sync = createSyncClient({
    url: wsUrl,
    roomId,
    store,
    // The handler properties of "ws" deliver text frames as strings.
    createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    // Short waits so a test does not sit idle after the server comes back.
    backoffMs: { min: 20, max: 200 },
    onRemoteOps(ops) {
      for (const op of ops) {
        apply(state, op);
        observe(clock, op.ts);
        seen.add(op.opId);
      }
    },
  });
  sync.start();

  async function edit(make: (clock: Clock) => Op): Promise<Op> {
    const op = make(clock);
    await store.saveLocalOp(op);
    apply(state, op);
    seen.add(op.opId);
    sync.notifyLocalOp(op);
    return op;
  }

  return { state, sync, seen, edit, canonical: () => canonicalize(state), stop: () => sync.stop() };
}

// E2E_SEED=<n> replays the edits of a failed run.
export const seed = Number(process.env.E2E_SEED ?? 1);
export const hint = `seed ${seed}; replay with E2E_SEED=${seed}`;

export async function editRandomly(rng: Rng, group: TestClient[], count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const client = rng.pick(group);
    await client.edit((clock) => randomOp(rng, client.state, clock));
  }
}

// True when no client has anything left to send and every client has every
// operation that any of them has.
export function allSynced(clients: TestClient[]): boolean {
  const all = new Set<string>();
  for (const client of clients) {
    for (const opId of client.seen) all.add(opId);
  }
  return clients.every(
    (client) => client.sync.status().unsent === 0 && client.seen.size === all.size,
  );
}

export function expectSameState(clients: TestClient[], hint: string): void {
  const [first, ...others] = clients;
  if (first === undefined) throw new Error("no clients to compare");
  for (const other of others) {
    expect(other.canonical(), hint).toBe(first.canonical());
  }
}
