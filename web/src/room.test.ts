import { expect, test, vi } from "vitest";
import {
  MAX_COMMENT_CHARS,
  ROOT_ID,
  addMove,
  compareTs,
  moveIdOf,
  newClock,
  setComment,
  setDeleted,
} from "@blunder/core";
import type { Op } from "@blunder/core";
import { openRoom } from "./room";
import type { MoveNode } from "./room";
import { createMemoryStore } from "./sync/memoryStore";

const e4 = moveIdOf(ROOT_ID, "e2e4");
const d4 = moveIdOf(ROOT_ID, "d2d4");
const e5 = moveIdOf(e4, "e7e5");

function childUcis(node: MoveNode): string[] {
  return node.children.map((child) => child.uci);
}

async function newRoom() {
  const store = createMemoryStore("me");
  const sent: Op[] = [];
  const room = await openRoom(store, (op) => sent.push(op));
  return { store, sent, room };
}

test("a new room shows the starting position", async () => {
  const { room } = await newRoom();
  expect(room.replicaId).toBe("me");
  expect(room.view().root.children).toEqual([]);
  expect(room.view().visible.get(ROOT_ID)?.position).toContain("w KQkq");
});

test("playing a move saves it, shows it and hands it to sync, in that order", async () => {
  const store = createMemoryStore("me");
  const steps: string[] = [];
  const shown = () => room.view().visible.has(e4);
  const save = store.saveLocalOp;
  store.saveLocalOp = async (op) => {
    steps.push(`save: shown ${shown()}`);
    await save(op);
  };
  const room = await openRoom(store, () => steps.push(`sync: shown ${shown()}`));

  const id = await room.playMove(ROOT_ID, "e2e4");

  expect(id).toBe(e4);
  expect(steps).toEqual(["save: shown false", "sync: shown true"]);
  expect((await store.loadOutbox()).map((op) => op.type)).toEqual(["addMove"]);
});

test("playing a move that is already there only navigates to it", async () => {
  const { room, sent } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  expect(await room.playMove(ROOT_ID, "e2e4")).toBe(e4);
  expect(sent).toHaveLength(1);
});

test("playing a deleted move restores it instead of adding it again", async () => {
  const { room, sent } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  await room.setDeleted(e4, true);
  expect(room.view().root.children).toEqual([]);

  await room.playMove(ROOT_ID, "e2e4");
  expect(childUcis(room.view().root)).toEqual(["e2e4"]);
  expect(sent.map((op) => op.type)).toEqual(["addMove", "setDeleted", "setDeleted"]);
});

test("promote puts a variation first among its siblings", async () => {
  const { room } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  await room.playMove(ROOT_ID, "d2d4");
  const second = room.view().root.children[1]!;

  await room.promote(second.id);
  expect(room.view().root.children[0]!.id).toBe(second.id);
});

test("a deleted line moves to the deleted list and comes back on restore", async () => {
  const { room } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  await room.playMove(e4, "e7e5");

  await room.setDeleted(e4, true);
  expect(room.view().root.children).toEqual([]);
  expect(room.view().deletedLines.map((line) => line.id)).toEqual([e4]);

  await room.setDeleted(e4, false);
  expect(childUcis(room.view().root.children[0]!)).toEqual(["e7e5"]);
  expect(room.view().deletedLines).toEqual([]);
});

test("a comment is saved once, cut at the limit, and not saved again unchanged", async () => {
  const { room, sent } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  await room.setComment(e4, "x".repeat(MAX_COMMENT_CHARS + 10));
  expect(room.view().visible.get(e4)?.comment).toHaveLength(MAX_COMMENT_CHARS);

  await room.setComment(e4, "x".repeat(MAX_COMMENT_CHARS));
  await room.setComment(ROOT_ID, "");
  expect(sent.map((op) => op.type)).toEqual(["addMove", "setComment"]);
});

test("listeners run on every change and get a new view object", async () => {
  const { room } = await newRoom();
  const before = room.view();
  const listener = vi.fn();
  const unsubscribe = room.subscribe(listener);

  await room.playMove(ROOT_ID, "e2e4");
  expect(listener).toHaveBeenCalledTimes(1);
  expect(room.view()).not.toBe(before);

  unsubscribe();
  await room.playMove(ROOT_ID, "d2d4");
  expect(listener).toHaveBeenCalledTimes(1);
});

test("remote operations are applied and move the clock forward", async () => {
  const { room, sent } = await newRoom();
  const other = newClock("other", 50);
  room.applyRemoteOps([addMove(other, ROOT_ID, "e2e4"), setComment(other, e4, "theirs")]);
  expect(room.view().visible.get(e4)?.comment).toBe("theirs");

  await room.setComment(e4, "mine");
  expect(sent[0]!.ts.counter).toBe(53);
  expect(room.view().visible.get(e4)?.comment).toBe("mine");
});

test("a remote batch with nothing new moves the clock but does not notify", async () => {
  const { room, sent } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  const listener = vi.fn();
  room.subscribe(listener);
  const before = room.view();

  // The echo of a local operation, with a timestamp only the clock can notice.
  const echo = { ...sent[0]!, ts: { counter: 70, replicaId: "me" } };
  room.applyRemoteOps([echo]);
  expect(listener).not.toHaveBeenCalled();
  expect(room.view()).toBe(before);

  await room.setComment(e4, "after the echo");
  expect(sent[1]!.ts.counter).toBe(71);
});

test("reopening a room rebuilds the tree and continues the clock", async () => {
  const { room, store } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  await room.playMove(e4, "e7e5");
  const received = setComment(newClock("other", 30), e5, "from the server");
  await store.saveReceivedOps([received], 1);
  room.applyRemoteOps([received]);

  const sent: Op[] = [];
  const reopened = await openRoom(store, (op) => sent.push(op));
  expect(reopened.view().visible.get(e5)?.comment).toBe("from the server");

  await reopened.playMove(ROOT_ID, "d2d4");
  for (const op of await store.loadLog()) {
    if (op.opId !== sent[0]!.opId) expect(compareTs(sent[0]!.ts, op.ts)).toBeGreaterThan(0);
  }
});

test("a stored entry that is not an operation is skipped on load", async () => {
  const store = createMemoryStore("me");
  await store.saveLocalOp(addMove(newClock("me"), ROOT_ID, "e2e4"));
  await store.saveReceivedOps([{ opId: "junk", type: "unknown" } as unknown as Op], 1);

  const room = await openRoom(store, () => {});
  expect(childUcis(room.view().root)).toEqual(["e2e4"]);
});

test("an illegal move from the network never reaches the tree", async () => {
  const { room } = await newRoom();
  room.applyRemoteOps([addMove(newClock("other"), ROOT_ID, "e2e5")]);
  expect(room.view().root.children).toEqual([]);
});

test("nearestVisible walks up to the closest move that is still shown", async () => {
  const { room } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  await room.playMove(e4, "e7e5");
  await room.playMove(ROOT_ID, "d2d4");
  expect(room.nearestVisible(e5)).toBe(e5);

  room.applyRemoteOps([setDeleted(newClock("other", 90), e5, true)]);
  expect(room.nearestVisible(e5)).toBe(e4);

  room.applyRemoteOps([setDeleted(newClock("other", 91), e4, true)]);
  expect(room.nearestVisible(e5)).toBe(ROOT_ID);
  expect(room.nearestVisible(d4)).toBe(d4);
  expect(room.nearestVisible("never-seen")).toBe(ROOT_ID);
});

test("playing a line adds only the moves that are missing", async () => {
  const { room, sent } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  const last = await room.playLine(ROOT_ID, ["e2e4", "e7e5", "g1f3"]);

  expect(last).toBe(moveIdOf(e5, "g1f3"));
  expect(sent.map((op) => op.type)).toEqual(["addMove", "addMove", "addMove"]);
  expect(room.view().visible.has(last)).toBe(true);
});

test("playing a line leaves the main line as it was", async () => {
  const { room, sent } = await newRoom();
  await room.playMove(ROOT_ID, "d2d4");
  await room.promote(d4);
  await room.playLine(ROOT_ID, ["e2e4", "e7e5"]);

  expect(childUcis(room.view().root)[0]).toBe("d2d4");
  expect(sent.filter((op) => op.type === "setMainline")).toHaveLength(1);
});

test("playing a line through a deleted move restores it", async () => {
  const { room } = await newRoom();
  await room.playLine(ROOT_ID, ["e2e4", "e7e5"]);
  await room.setDeleted(e4, true);
  await room.playLine(ROOT_ID, ["e2e4", "e7e5"]);
  expect(room.view().visible.has(e5)).toBe(true);
});

test("two people who load the same line offline end up with one line", async () => {
  const a = await newRoom();
  const b = await newRoom();
  const line = ["e2e4", "c7c5", "g1f3"];
  await a.room.playLine(ROOT_ID, line);
  await b.room.playLine(ROOT_ID, line);

  a.room.applyRemoteOps(b.sent);
  b.room.applyRemoteOps(a.sent);

  // The root and three moves: the six operations describe the same three ids.
  for (const { room } of [a, b]) {
    expect(room.view().visible.size).toBe(4);
    expect(childUcis(room.view().root)).toEqual(["e2e4"]);
  }
});
