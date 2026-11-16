import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { compareStrings, compareTs } from "./compare";
import type {
  AddMoveOp,
  Clock,
  MoveId,
  Op,
  ReplicaId,
  SetCommentOp,
  SetDeletedOp,
  SetMainlineOp,
  State,
  Ts,
} from "./types";

export * from "./types";
export { compareTs } from "./compare";
export { deriveTree } from "./derive";
export { isOp } from "./isOp";

export function emptyState(): State {
  return { moves: new Map(), mainline: new Map(), deleted: new Map(), comments: new Map() };
}

// Merges one operation into state, in place. The result depends only on the
// set of operations applied, never on their order or how often each arrived.
export function apply(state: State, op: Op): void {
  switch (op.type) {
    case "addMove": {
      // The id is a hash of the content, so the same move played by two
      // people lands on one key. Keeping the smaller timestamp, not the one
      // that arrived first, makes "first added by" the same on every replica.
      const id = moveIdOf(op.parentId, op.uci);
      const existing = state.moves.get(id);
      if (!existing || compareTs(op.ts, existing.firstTs) < 0) {
        state.moves.set(id, { parentId: op.parentId, uci: op.uci, firstTs: op.ts });
      }
      break;
    }
    case "setMainline":
      if (isNewer(op.ts, state.mainline.get(op.parentId))) {
        state.mainline.set(op.parentId, { childId: op.childId, ts: op.ts });
      }
      break;
    case "setDeleted":
      if (isNewer(op.ts, state.deleted.get(op.moveId))) {
        state.deleted.set(op.moveId, { deleted: op.deleted, ts: op.ts });
      }
      break;
    case "setComment":
      if (isNewer(op.ts, state.comments.get(op.moveId))) {
        state.comments.set(op.moveId, { text: op.text, ts: op.ts });
      }
      break;
  }
}

// Last writer wins. Strictly newer, so a repeated operation changes nothing.
// Timestamps are unique per operation, so two different values never tie.
function isNewer(ts: Ts, current: { ts: Ts } | undefined): boolean {
  return current === undefined || compareTs(ts, current.ts) > 0;
}

// JSON with sorted keys and no whitespace. Equal states give equal strings.
export function canonicalize(state: State): string {
  return toSortedJson(state);
}

// Written by hand instead of copying the maps into plain objects first:
// assigning a network-supplied key such as "__proto__" to an object would
// set its prototype and lose the entry.
function toSortedJson(value: unknown): string {
  if (value instanceof Map) return sortedObjectJson([...value]);
  if (typeof value === "object" && value !== null) return sortedObjectJson(Object.entries(value));
  return JSON.stringify(value);
}

function sortedObjectJson(entries: [string, unknown][]): string {
  const sorted = entries.sort(([a], [b]) => compareStrings(a, b));
  const fields = sorted.map(([key, value]) => `${JSON.stringify(key)}:${toSortedJson(value)}`);
  return `{${fields.join(",")}}`;
}

// The simulation and every replay of a log hash the same pairs again and again.
const moveIds = new Map<string, MoveId>();

// First 16 bytes, hex, of SHA-256 over parentId + "|" + uci.
// The parent is part of the hash so that one position reached by two move
// orders stays two separate branches.
export function moveIdOf(parentId: MoveId, uci: string): MoveId {
  const key = `${parentId}|${uci}`;
  let id = moveIds.get(key);
  if (id === undefined) {
    id = bytesToHex(sha256(utf8ToBytes(key)).subarray(0, 16));
    moveIds.set(key, id);
  }
  return id;
}

export function newClock(replicaId: ReplicaId, counter = 0): Clock {
  return { replicaId, counter };
}

// Highest counter in the log, or 0 for an empty log. A reloaded replica must
// continue from here: starting again at 0 would reuse old timestamps.
export function clockFromLog(ops: Op[]): number {
  let highest = 0;
  for (const op of ops) {
    if (op.ts.counter > highest) highest = op.ts.counter;
  }
  return highest;
}

// Advances the clock and returns the timestamp for a new local operation.
export function tick(clock: Clock): Ts {
  clock.counter += 1;
  return { counter: clock.counter, replicaId: clock.replicaId };
}

// Moves the clock up to a received timestamp, so the next local operation is
// newer than everything this replica has seen.
export function observe(clock: Clock, ts: Ts): void {
  if (ts.counter > clock.counter) clock.counter = ts.counter;
}

// opId is random and only used for deduplication and acknowledgement.
function stamp(clock: Clock): { opId: string; replicaId: ReplicaId; ts: Ts } {
  return { opId: crypto.randomUUID(), replicaId: clock.replicaId, ts: tick(clock) };
}

export function addMove(clock: Clock, parentId: MoveId, uci: string): AddMoveOp {
  return { type: "addMove", ...stamp(clock), parentId, uci };
}

export function setMainline(clock: Clock, parentId: MoveId, childId: MoveId): SetMainlineOp {
  return { type: "setMainline", ...stamp(clock), parentId, childId };
}

export function setDeleted(clock: Clock, moveId: MoveId, deleted: boolean): SetDeletedOp {
  return { type: "setDeleted", ...stamp(clock), moveId, deleted };
}

export function setComment(clock: Clock, moveId: MoveId, text: string): SetCommentOp {
  return { type: "setComment", ...stamp(clock), moveId, text };
}
