import { expect, test } from "vitest";
import { ROOT_ID, moveIdOf } from "@blunder/core";
import { loadInto } from "./newStudy";
import { openRoom } from "./room";
import { createMemoryStore } from "./sync/memoryStore";

const emptyRoom = () => openRoom(createMemoryStore("me"), () => {});

test("an opening is loaded and the board ends on its last move", async () => {
  const room = await emptyRoom();
  const loaded = await loadInto(room, { kind: "opening", name: "Sicilian Defence" });
  expect(loaded.moveId).toBe(moveIdOf(moveIdOf(ROOT_ID, "e2e4"), "c7c5"));
  expect(room.view().visible.size).toBe(3);
});

test("a game is imported and reported", async () => {
  const room = await emptyRoom();
  const loaded = await loadInto(room, { kind: "pgn", text: "1. d4 d5 2. c4" });
  expect(loaded.message).toBe("Added 3 moves.");
  expect(room.view().visible.get(loaded.moveId)?.uci).toBe("c2c4");
});

test("a load that cannot be used leaves the study empty", async () => {
  const room = await emptyRoom();
  expect(await loadInto(room, { kind: "opening", name: "No such opening" })).toEqual({
    moveId: ROOT_ID,
    message: "",
  });
  const bad = await loadInto(room, { kind: "pgn", text: "nothing to read {here}" });
  expect(bad).toEqual({ moveId: ROOT_ID, message: "No moves were found in this text." });
  expect(room.view().visible.size).toBe(1);
});
