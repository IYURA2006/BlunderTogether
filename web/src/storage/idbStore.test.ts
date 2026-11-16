import "fake-indexeddb/auto";
import { expect, test } from "vitest";
import { ROOT_ID, addMove, moveIdOf, newClock, setComment } from "@blunder/core";
import type { Op } from "@blunder/core";
import { createMemoryStore } from "../sync/memoryStore";
import type { Store } from "../sync/types";
import { openIdbStore } from "./idbStore";

let roomCount = 0;
function freshRoomId(): string {
  roomCount += 1;
  return `test-room-${roomCount}`;
}

const e4 = moveIdOf(ROOT_ID, "e2e4");

function sampleOps(): Op[] {
  const clock = newClock("a");
  return [
    addMove(clock, ROOT_ID, "e2e4"),
    addMove(clock, e4, "e7e5"),
    setComment(clock, e4, "king's pawn"),
  ];
}

function opIds(ops: Op[]): string[] {
  return ops.map((op) => op.opId);
}

test("a new room starts empty", async () => {
  const store = await openIdbStore(freshRoomId());
  expect(await store.loadLog()).toEqual([]);
  expect(await store.loadOutbox()).toEqual([]);
  expect(await store.loadCursor()).toBe(0);
});

test("the replica id is created once and then kept", async () => {
  const roomId = freshRoomId();
  const store = await openIdbStore(roomId);
  const [first, second] = await Promise.all([store.loadReplicaId(), store.loadReplicaId()]);
  expect(first).toBe(second);
  expect(first.length).toBeGreaterThan(0);

  const reopened = await openIdbStore(roomId);
  expect(await reopened.loadReplicaId()).toBe(first);
});

test("each room has its own replica id and log", async () => {
  const one = await openIdbStore(freshRoomId());
  const other = await openIdbStore(freshRoomId());
  await one.saveLocalOp(sampleOps()[0]!);
  expect(await other.loadLog()).toEqual([]);
  expect(await one.loadReplicaId()).not.toBe(await other.loadReplicaId());
});

test("saveLocalOp writes the operation to the log and to the outbox", async () => {
  const store = await openIdbStore(freshRoomId());
  const [op] = sampleOps();
  await store.saveLocalOp(op!);
  expect(await store.loadLog()).toEqual([op]);
  expect(await store.loadOutbox()).toEqual([op]);
});

test("the outbox keeps the order operations were saved in", async () => {
  const store = await openIdbStore(freshRoomId());
  // Ids chosen so that sorting by opId would give a different order.
  const ops = sampleOps().map((op, i) => ({ ...op, opId: ["m", "z", "a"][i]! }));
  for (const op of ops) await store.saveLocalOp(op);
  expect(opIds(await store.loadOutbox())).toEqual(["m", "z", "a"]);

  await store.removeFromOutbox(["z", "not-there"]);
  expect(opIds(await store.loadOutbox())).toEqual(["m", "a"]);
  expect((await store.loadLog()).length).toBe(3);
});

test("saveReceivedOps writes new operations and the cursor, and skips known ones", async () => {
  const store = await openIdbStore(freshRoomId());
  const [mine, theirs] = sampleOps();
  await store.saveLocalOp(mine!);

  const echoed = { ...mine!, replicaId: "changed-on-the-way" };
  await store.saveReceivedOps([echoed, theirs!], 2);

  const log = await store.loadLog();
  expect(log).toHaveLength(2);
  expect(log).toContainEqual(mine);
  expect(log).toContainEqual(theirs);
  expect(await store.loadCursor()).toBe(2);
  expect(await store.loadOutbox()).toEqual([mine]);
});

test("everything is still there after the database is opened again", async () => {
  const roomId = freshRoomId();
  const store = await openIdbStore(roomId);
  const [mine, theirs] = sampleOps();
  await store.saveLocalOp(mine!);
  await store.saveReceivedOps([theirs!], 9);

  const reopened = await openIdbStore(roomId);
  expect(opIds(await reopened.loadLog()).sort()).toEqual(opIds([mine!, theirs!]).sort());
  expect(await reopened.loadOutbox()).toEqual([mine]);
  expect(await reopened.loadCursor()).toBe(9);
});

test("saveReceivedOps that fails midway leaves the log and the cursor unchanged", async () => {
  const store = await openIdbStore(freshRoomId());
  const [first, second, third] = sampleOps();
  await store.saveReceivedOps([first!], 5);

  // The second operation is stored before the broken one makes the write fail.
  const broken = { ...third!, opId: undefined } as unknown as Op;
  await expect(store.saveReceivedOps([second!, broken], 7)).rejects.toThrow();

  expect(await store.loadLog()).toEqual([first]);
  expect(await store.loadCursor()).toBe(5);

  await store.saveReceivedOps([second!, third!], 7);
  expect(await store.loadCursor()).toBe(7);
  expect((await store.loadLog()).length).toBe(3);
});

test("saveLocalOp that fails on the outbox does not touch the log either", async () => {
  const store = await openIdbStore(freshRoomId());
  const [op] = sampleOps();
  await store.saveLocalOp(op!);

  // Same opId again: the log would accept the overwrite, the outbox refuses
  // the duplicate, and the whole transaction must roll back.
  const sameIdOtherContent = { ...op!, replicaId: "someone-else" };
  await expect(store.saveLocalOp(sameIdOtherContent)).rejects.toThrow();

  expect(await store.loadLog()).toEqual([op]);
  expect(await store.loadOutbox()).toEqual([op]);
});

// Runs one sequence of calls and records what the store reports after each
// step, so two implementations can be compared.
async function sharedSequence(store: Store, ops: Op[]): Promise<unknown[]> {
  const [first, second, third] = ops;
  const steps: unknown[] = [];
  const record = async () => {
    steps.push({
      log: opIds(await store.loadLog()),
      outbox: opIds(await store.loadOutbox()),
      cursor: await store.loadCursor(),
    });
  };

  await record();
  await store.saveLocalOp(first!);
  await store.saveLocalOp(second!);
  await record();
  await store.saveLocalOp(first!).then(
    () => steps.push("saved twice"),
    () => steps.push("refused"),
  );
  await record();
  await store.saveReceivedOps([first!, third!], 2);
  await record();
  await store.removeFromOutbox([first!.opId]);
  await record();
  await store.saveReceivedOps([], 3);
  await store.removeFromOutbox([second!.opId, "unknown"]);
  await record();
  return steps;
}

test("the IndexedDB store and the memory store behave the same", async () => {
  const ops = sampleOps();
  const fromIdb = await sharedSequence(await openIdbStore(freshRoomId()), ops);
  const fromMemory = await sharedSequence(createMemoryStore("a"), ops);
  expect(fromIdb).toEqual(fromMemory);
  expect(fromIdb).toContain("refused");
  expect(fromIdb.at(-1)).toEqual({ log: opIds(ops).sort(), outbox: [], cursor: 3 });
});
