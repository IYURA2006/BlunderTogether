import { expect, test } from "vitest";
import { ROOT_ID, addMove, moveIdOf, newClock, setDeleted } from "@blunder/core";
import { openRoom } from "../room";
import { createMemoryStore } from "../sync/memoryStore";
import { countMoves, deletedLineRows, findHiddenWork, hiddenWorkMessage } from "./deletedLines";

const e4 = moveIdOf(ROOT_ID, "e2e4");
const e5 = moveIdOf(e4, "e7e5");
const d4 = moveIdOf(ROOT_ID, "d2d4");

// "me" adds 1. e4 e5 2. Nf3 and 1. d4; "other" adds 1... c5 under e4.
async function sharedStudy() {
  const room = await openRoom(createMemoryStore("me"), () => {});
  await room.playMove(ROOT_ID, "e2e4");
  await room.playMove(e4, "e7e5");
  await room.playMove(e5, "g1f3");
  await room.playMove(ROOT_ID, "d2d4");
  const other = newClock("other", 20);
  room.applyRemoteOps([addMove(other, e4, "c7c5")]);
  return { room, other };
}

test("nothing is hidden while nothing is deleted", async () => {
  const { room } = await sharedStudy();
  expect(findHiddenWork(room.view().deletedLines, "me")).toEqual({ moves: 0, lineIds: [] });
});

test("counts my moves inside a line someone else deleted", async () => {
  const { room, other } = await sharedStudy();
  room.applyRemoteOps([setDeleted(other, e4, true)]);

  const [line] = room.view().deletedLines;
  expect(countMoves(line!)).toBe(4);
  expect(findHiddenWork(room.view().deletedLines, "me")).toEqual({ moves: 3, lineIds: [e4] });
  expect(findHiddenWork(room.view().deletedLines, "other")).toEqual({ moves: 1, lineIds: [e4] });
});

test("adds up several deleted lines and skips lines without my moves", async () => {
  const { room, other } = await sharedStudy();
  room.applyRemoteOps([
    setDeleted(other, e5, true),
    setDeleted(other, d4, true),
    setDeleted(other, moveIdOf(e4, "c7c5"), true),
  ]);
  expect(findHiddenWork(room.view().deletedLines, "me")).toEqual({
    moves: 3,
    lineIds: [e5, d4].sort(),
  });
});

test("each deleted line is listed with its first move and its size", async () => {
  const { room, other } = await sharedStudy();
  expect(deletedLineRows(room.view())).toEqual([]);

  room.applyRemoteOps([setDeleted(other, e5, true), setDeleted(other, d4, true)]);
  const rows = [
    { id: e5, label: "1... e5", moves: 2 },
    { id: d4, label: "1. d4", moves: 1 },
  ];
  expect(deletedLineRows(room.view())).toEqual(rows.sort((a, b) => (a.id < b.id ? -1 : 1)));
});

test("the notice counts moves and lines in plain words", () => {
  expect(hiddenWorkMessage({ moves: 1, lineIds: ["a"] })).toBe(
    "1 of your moves is in a deleted line.",
  );
  expect(hiddenWorkMessage({ moves: 3, lineIds: ["a"] })).toBe(
    "3 of your moves are in a deleted line.",
  );
  expect(hiddenWorkMessage({ moves: 3, lineIds: ["a", "b"] })).toBe(
    "3 of your moves are in deleted lines.",
  );
});
