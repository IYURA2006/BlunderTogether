import { expect, test } from "vitest";
import {
  MAX_COMMENT_CHARS,
  ROOT_ID,
  addMove,
  isOp,
  moveIdOf,
  newClock,
  setComment,
  setDeleted,
  setMainline,
} from "./index";

const e4 = moveIdOf(ROOT_ID, "e2e4");
const clock = newClock("a");
const valid = {
  addMove: addMove(clock, ROOT_ID, "e2e4"),
  setMainline: setMainline(clock, ROOT_ID, e4),
  setDeleted: setDeleted(clock, e4, true),
  setComment: setComment(clock, e4, "note"),
};

test("accepts every operation the helpers create", () => {
  for (const op of Object.values(valid)) expect(isOp(op)).toBe(true);
});

test("accepts an operation after a JSON round trip", () => {
  expect(isOp(JSON.parse(JSON.stringify(valid.addMove)))).toBe(true);
});

test("accepts promotions and rejects malformed UCI", () => {
  expect(isOp({ ...valid.addMove, uci: "e7e8q" })).toBe(true);
  for (const uci of ["e2", "e2e9", "i2e4", "e7e8k", "E2E4", " e2e4", "e2e4\n", 1234]) {
    expect(isOp({ ...valid.addMove, uci })).toBe(false);
  }
});

test("rejects values that are not operation objects", () => {
  for (const value of [null, undefined, 7, "addMove", [], [valid.addMove]]) {
    expect(isOp(value)).toBe(false);
  }
});

test("rejects an unknown type", () => {
  expect(isOp({ ...valid.addMove, type: "removeMove" })).toBe(false);
  expect(isOp({ ...valid.addMove, type: "toString" })).toBe(false);
});

test("rejects a bad opId or replicaId", () => {
  expect(isOp({ ...valid.addMove, opId: "" })).toBe(false);
  expect(isOp({ ...valid.addMove, opId: "x".repeat(65) })).toBe(false);
  expect(isOp({ ...valid.addMove, opId: "x".repeat(64) })).toBe(true);
  expect(isOp({ ...valid.addMove, opId: 5 })).toBe(false);
  expect(isOp({ ...valid.addMove, replicaId: 5 })).toBe(false);
});

test("rejects a bad timestamp", () => {
  const badTimestamps = [
    undefined,
    null,
    7,
    { counter: -1, replicaId: "a" },
    { counter: 1.5, replicaId: "a" },
    { counter: 2 ** 53, replicaId: "a" },
    { counter: "1", replicaId: "a" },
    { counter: 1 },
    { counter: 1, replicaId: 2 },
  ];
  for (const ts of badTimestamps) {
    expect(isOp({ ...valid.setComment, ts })).toBe(false);
  }
  expect(isOp({ ...valid.setComment, ts: { counter: 0, replicaId: "a" } })).toBe(true);
});

test("rejects ids that are not strings", () => {
  expect(isOp({ ...valid.addMove, parentId: 1 })).toBe(false);
  expect(isOp({ ...valid.setMainline, parentId: null })).toBe(false);
  expect(isOp({ ...valid.setMainline, childId: undefined })).toBe(false);
  expect(isOp({ ...valid.setDeleted, moveId: {} })).toBe(false);
  expect(isOp({ ...valid.setComment, moveId: 3 })).toBe(false);
});

test("rejects a deleted flag that is not a boolean", () => {
  expect(isOp({ ...valid.setDeleted, deleted: "true" })).toBe(false);
  expect(isOp({ ...valid.setDeleted, deleted: 1 })).toBe(false);
});

test("limits comment length", () => {
  expect(isOp({ ...valid.setComment, text: "x".repeat(MAX_COMMENT_CHARS) })).toBe(true);
  expect(isOp({ ...valid.setComment, text: "x".repeat(MAX_COMMENT_CHARS + 1) })).toBe(false);
  expect(isOp({ ...valid.setComment, text: 42 })).toBe(false);
});
