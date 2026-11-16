import { expect, test } from "vitest";
import { ROOT_ID, moveIdOf } from "@blunder/core";
import { openRoom } from "../room";
import { createMemoryStore } from "../sync/memoryStore";
import { lineAfter, moveLabel } from "./notation";
import type { LineItem } from "./notation";

// Writes a line the way it would be printed, so tests read like notation.
function printed(items: LineItem[]): string {
  return items
    .map((item) => {
      if (item.kind === "variation") return `(${printed(item.items)})`;
      const comment = item.comment ? ` {${item.comment}}` : "";
      return `${item.number} ${item.san}`.trim() + comment;
    })
    .join(" ");
}

async function roomWithLines(lines: string[][]) {
  const room = await openRoom(createMemoryStore("me"), () => {});
  for (const line of lines) {
    let parentId = ROOT_ID;
    for (const uci of line) parentId = await room.playMove(parentId, uci);
  }
  return room;
}

test("an empty study has an empty line", async () => {
  const room = await roomWithLines([]);
  expect(lineAfter(room.view().root)).toEqual([]);
});

test("a single line numbers white moves only", async () => {
  const room = await roomWithLines([["e2e4", "e7e5", "g1f3", "b8c6"]]);
  expect(printed(lineAfter(room.view().root))).toBe("1. e4 e5 2. Nf3 Nc6");
});

test("a variation follows the move it replaces and restarts the numbering", async () => {
  const room = await roomWithLines([
    ["e2e4", "e7e5", "g1f3"],
    ["e2e4", "c7c5", "g1f3"],
  ]);
  const e4 = moveIdOf(ROOT_ID, "e2e4");
  await room.promote(moveIdOf(e4, "e7e5"));
  expect(printed(lineAfter(room.view().root))).toBe("1. e4 e5 (1... c5 2. Nf3) 2. Nf3");
});

test("variations can nest", async () => {
  const room = await roomWithLines([
    ["e2e4", "e7e5"],
    ["e2e4", "c7c5", "g1f3"],
    ["e2e4", "c7c5", "b1c3"],
  ]);
  const e4 = moveIdOf(ROOT_ID, "e2e4");
  const c5 = moveIdOf(e4, "c7c5");
  await room.promote(moveIdOf(e4, "e7e5"));
  await room.promote(moveIdOf(c5, "g1f3"));
  expect(printed(lineAfter(room.view().root))).toBe("1. e4 e5 (1... c5 2. Nf3 (2. Nc3))");
});

test("a black move after a comment shows its number again", async () => {
  const room = await roomWithLines([["e2e4", "e7e5"]]);
  await room.setComment(moveIdOf(ROOT_ID, "e2e4"), "best by test");
  expect(printed(lineAfter(room.view().root))).toBe("1. e4 {best by test} 1... e5");
});

test("a line can start from any move", async () => {
  const room = await roomWithLines([["e2e4", "e7e5", "g1f3"]]);
  const e4 = room.view().root.children[0]!;
  expect(printed(lineAfter(e4))).toBe("1... e5 2. Nf3");
});

test("a move named on its own always carries its number", async () => {
  const room = await roomWithLines([["e2e4", "e7e5"]]);
  const { root } = room.view();
  const e4 = root.children[0]!;
  expect(moveLabel(root.position, "e2e4")).toBe("1. e4");
  expect(moveLabel(e4.position, "e7e5")).toBe("1... e5");
});
