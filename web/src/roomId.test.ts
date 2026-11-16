import { expect, test } from "vitest";
import { newRoomId, roomIdFromHash } from "./roomId";
import { ROOM_ID_PATTERN } from "./sync/messages";

test("a new room id has 22 URL-safe characters and fits the protocol", () => {
  const id = newRoomId();
  expect(id).toHaveLength(22);
  expect(id).toMatch(ROOM_ID_PATTERN);
  expect(encodeURIComponent(id)).toBe(id);
});

test("new room ids differ", () => {
  const ids = new Set(Array.from({ length: 100 }, newRoomId));
  expect(ids.size).toBe(100);
});

test("the room id is read from the hash", () => {
  expect(roomIdFromHash("#k3J9xQ2mVb7LpR4t")).toBe("k3J9xQ2mVb7LpR4t");
  expect(roomIdFromHash("k3J9xQ2mVb7LpR4t")).toBe("k3J9xQ2mVb7LpR4t");
});

test("an empty or malformed hash gives null", () => {
  for (const hash of ["", "#", "#short", "#has spaces in it!!", `#${"x".repeat(65)}`]) {
    expect(roomIdFromHash(hash)).toBeNull();
  }
});
