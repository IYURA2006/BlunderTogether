import { describe, expect, test } from "vitest";
import {
  ROOT_ID,
  addMove,
  apply,
  canonicalize,
  compareTs,
  emptyState,
  moveIdOf,
  newClock,
  setComment,
  setDeleted,
  setMainline,
} from "./index";
import type { Op } from "./index";
import { d4, e4, stateFrom } from "./testing";

function stateOf(ops: Op[]): string {
  return canonicalize(stateFrom(ops));
}

test("moveIdOf is the first 16 bytes of SHA-256 over parent|uci, in hex", () => {
  expect(e4).toBe("8b6d7c05d029189e5127b0de1a1442dd");
  expect(moveIdOf(e4, "e7e5")).not.toBe(moveIdOf(d4, "e7e5"));
});

test("compareTs orders by counter, then by replica id", () => {
  const older = { counter: 1, replicaId: "b" };
  const newerFromA = { counter: 2, replicaId: "a" };
  const newerFromB = { counter: 2, replicaId: "b" };
  expect(compareTs(older, newerFromA)).toBeLessThan(0);
  expect(compareTs(newerFromB, newerFromA)).toBeGreaterThan(0);
  expect(compareTs(newerFromA, { ...newerFromA })).toBe(0);
});

describe("merge rules", () => {
  test("addMove keeps the smaller timestamp as first added", () => {
    const early = addMove(newClock("b", 0), ROOT_ID, "e2e4");
    const late = addMove(newClock("a", 5), ROOT_ID, "e2e4");
    const state = emptyState();
    apply(state, late);
    apply(state, early);
    expect(state.moves.size).toBe(1);
    expect(state.moves.get(e4)).toEqual({ parentId: ROOT_ID, uci: "e2e4", firstTs: early.ts });
  });

  test("setComment keeps the larger timestamp", () => {
    const older = setComment(newClock("a", 1), e4, "older");
    const newer = setComment(newClock("a", 2), e4, "newer");
    const state = emptyState();
    apply(state, newer);
    apply(state, older);
    expect(state.comments.get(e4)).toEqual({ text: "newer", ts: newer.ts });
  });

  test("setDeleted keeps the larger timestamp, so a restore can win", () => {
    const remove = setDeleted(newClock("a", 1), e4, true);
    const restore = setDeleted(newClock("b", 2), e4, false);
    const state = emptyState();
    apply(state, restore);
    apply(state, remove);
    expect(state.deleted.get(e4)).toEqual({ deleted: false, ts: restore.ts });
  });

  test("equal counters are decided by replica id", () => {
    const fromA = setMainline(newClock("a", 3), ROOT_ID, e4);
    const fromB = setMainline(newClock("b", 3), ROOT_ID, d4);
    const state = emptyState();
    apply(state, fromB);
    apply(state, fromA);
    expect(state.mainline.get(ROOT_ID)?.childId).toBe(d4);
  });
});

describe("order and repetition do not matter", () => {
  // Two operations of every type, from different replicas, aimed at the same
  // keys so that every pair really conflicts.
  const a = newClock("a", 10);
  const b = newClock("b", 10);
  const samples: Op[] = [
    addMove(a, ROOT_ID, "e2e4"),
    addMove(b, ROOT_ID, "e2e4"),
    setMainline(a, ROOT_ID, e4),
    setMainline(b, ROOT_ID, d4),
    setDeleted(a, e4, true),
    setDeleted(b, e4, false),
    setComment(a, e4, "best by test"),
    setComment(b, e4, "too committal"),
  ];
  const label = (op: Op) => `${op.type} from ${op.replicaId}`;

  for (const [i, first] of samples.entries()) {
    for (const second of samples.slice(i + 1)) {
      test(`${label(first)} and ${label(second)} commute`, () => {
        expect(stateOf([first, second])).toBe(stateOf([second, first]));
      });
    }
  }

  for (const op of samples) {
    test(`${label(op)} applied twice changes nothing`, () => {
      expect(stateOf([op, op])).toBe(stateOf([op]));
    });
  }

  test("every ordering of three conflicting operations gives one state", () => {
    const [x, y, z] = [samples[4]!, samples[5]!, setDeleted(a, e4, true)];
    const orders = [
      [x, y, z],
      [x, z, y],
      [y, x, z],
      [y, z, x],
      [z, x, y],
      [z, y, x],
    ];
    expect(new Set(orders.map(stateOf)).size).toBe(1);
  });
});

describe("canonicalize", () => {
  test("gives sorted keys and no whitespace", () => {
    const op = addMove(newClock("a"), ROOT_ID, "e2e4");
    expect(stateOf([op])).toBe(
      `{"comments":{},"deleted":{},"mainline":{},"moves":{"${e4}":` +
        `{"firstTs":{"counter":1,"replicaId":"a"},"parentId":"root","uci":"e2e4"}}}`,
    );
  });

  test("sorts the keys of each map", () => {
    const clock = newClock("a");
    const text = stateOf([setComment(clock, "b", "second"), setComment(clock, "a", "first")]);
    expect(text.indexOf('"a":')).toBeLessThan(text.indexOf('"b":'));
  });

  test("keeps a key named __proto__ as ordinary data", () => {
    const op = setComment(newClock("a"), "__proto__", "harmless");
    expect(stateOf([op])).toContain('"comments":{"__proto__":{"text":"harmless"');
  });
});
