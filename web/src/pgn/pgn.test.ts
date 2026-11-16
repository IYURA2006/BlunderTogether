import { expect, test } from "vitest";
import { ROOT_ID, moveIdOf } from "@blunder/core";
import type { Op } from "@blunder/core";
import { openRoom } from "../room";
import { createMemoryStore } from "../sync/memoryStore";
import { toPgn } from "./export";
import { MAX_PGN_CHARS, MAX_PGN_MOVES, importMessage, importPgn, pgnProblem } from "./import";

const e4 = moveIdOf(ROOT_ID, "e2e4");
const e5 = moveIdOf(e4, "e7e5");

async function newRoom() {
  const sent: Op[] = [];
  const room = await openRoom(createMemoryStore("me"), (op) => sent.push(op));
  return { room, sent };
}

function body(pgn: string): string {
  return pgn.split("\n\n")[1]!.trim();
}

// After a note the next black move carries its number again.
const GAME = "1. e4 {King's pawn} 1... e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 {Main line} 3. Bb5 *";

test("an empty study exports as a game with no moves", async () => {
  const { room } = await newRoom();
  expect(toPgn(room.view().root)).toBe('[Event "BlunderTogether study"]\n[Result "*"]\n\n*\n');
});

test("an imported game comes back out as the same text", async () => {
  const { room } = await newRoom();
  const result = await importPgn(room, GAME);
  expect(result).toMatchObject({ ok: true, added: 8, unreadable: 0 });
  expect(body(toPgn(room.view().root))).toBe(GAME);
});

test("export and import of a study with a note on the start give the same study", async () => {
  const first = await newRoom();
  await importPgn(first.room, `{Read this first} ${GAME}`);
  const exported = toPgn(first.room.view().root);

  const second = await newRoom();
  await importPgn(second.room, exported);
  expect(toPgn(second.room.view().root)).toBe(exported);
  expect(second.room.view().root.comment).toBe("Read this first");
});

test("a closing brace in a note cannot end the note early", async () => {
  const { room } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  await room.setComment(e4, "see {Fischer}\nnext line");
  expect(body(toPgn(room.view().root))).toBe("1. e4 {see {Fischer) next line} *");
});

test("long games are wrapped at 80 columns", async () => {
  const { room } = await newRoom();
  await importPgn(room, "1. Nf3 Nf6 2. Ng1 Ng8 ".repeat(12));
  const lines = body(toPgn(room.view().root)).split("\n");
  expect(lines.length).toBeGreaterThan(1);
  expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(80);
});

test("the import ends on the last move of the game's main line", async () => {
  const { room } = await newRoom();
  const result = await importPgn(room, "1. e4 e5 (1... c5 2. Nf3)");
  expect(result).toMatchObject({ ok: true, lastId: e5 });
});

test("an import never replaces a note that is already there", async () => {
  const { room } = await newRoom();
  await room.playMove(ROOT_ID, "e2e4");
  await room.setComment(e4, "ours");
  await importPgn(room, "1. e4 {theirs} e5 {new}");
  expect(room.view().visible.get(e4)?.comment).toBe("ours");
  expect(room.view().visible.get(e5)?.comment).toBe("new");
});

test("an import does not replace a main line that someone chose", async () => {
  const { room, sent } = await newRoom();
  const d4 = await room.playMove(ROOT_ID, "d2d4");
  await room.promote(d4);
  await importPgn(room, "1. e4 e5");
  expect(room.view().root.children[0]?.uci).toBe("d2d4");
  expect(sent.filter((op) => op.type === "setMainline")).toHaveLength(1);
});

test("a move that cannot be read loses only its own line", async () => {
  const { room } = await newRoom();
  const result = await importPgn(room, "1. e4 e5 (1... Ke3 2. Nf3) 2. Nf3 Qh9 3. d4");
  expect(result).toMatchObject({ ok: true, added: 3, unreadable: 4 });
  expect(body(toPgn(room.view().root))).toBe("1. e4 e5 2. Nf3 *");
});

test("importing the same game twice adds nothing the second time", async () => {
  const { room, sent } = await newRoom();
  await importPgn(room, GAME);
  const operations = sent.length;
  const again = await importPgn(room, GAME);
  expect(again).toMatchObject({ ok: true, added: 0 });
  expect(sent).toHaveLength(operations);
});

test("two people who import the same game offline end up with one tree", async () => {
  const a = await newRoom();
  const b = await newRoom();
  await importPgn(a.room, GAME);
  await importPgn(b.room, GAME);
  a.room.applyRemoteOps(b.sent);
  b.room.applyRemoteOps(a.sent);

  expect(a.room.view().visible.size).toBe(9);
  expect(toPgn(a.room.view().root)).toBe(toPgn(b.room.view().root));
});

test("text without moves, too long or with too many moves is refused", async () => {
  const { room, sent } = await newRoom();
  expect(await importPgn(room, '[Event "nothing"]')).toMatchObject({ ok: false });
  expect(await importPgn(room, "x".repeat(MAX_PGN_CHARS + 1))).toMatchObject({ ok: false });
  const tooMany = "Nf3 Nf6 Ng1 Ng8 ".repeat(MAX_PGN_MOVES / 4 + 1);
  expect(await importPgn(room, tooMany)).toMatchObject({ ok: false });
  expect(sent).toEqual([]);
});

test("the result is put into words", () => {
  expect(importMessage({ ok: true, added: 43, unreadable: 2, lastId: e4 })).toBe(
    "Added 43 moves. 2 moves could not be read.",
  );
  expect(importMessage({ ok: true, added: 1, unreadable: 0, lastId: e4 })).toBe("Added 1 move.");
  expect(importMessage({ ok: true, added: 0, unreadable: 1, lastId: e4 })).toBe(
    "Every move was already in the study. 1 move could not be read.",
  );
  expect(importMessage({ ok: false, problem: "No moves were found in this text." })).toBe(
    "No moves were found in this text.",
  );
});

test("a text can be checked before it is imported", () => {
  expect(pgnProblem("1. e4 e5")).toBeNull();
  expect(pgnProblem("no moves here: {only a note}")).toBe("No moves were found in this text.");
});
