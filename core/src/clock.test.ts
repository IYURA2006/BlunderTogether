import { expect, test } from "vitest";
import {
  ROOT_ID,
  addMove,
  apply,
  clockFromLog,
  compareTs,
  newClock,
  observe,
  setComment,
  setDeleted,
  setMainline,
  tick,
} from "./index";
import type { Op } from "./index";
import { e4, stateFrom } from "./testing";

test("tick counts up and stamps the replica id", () => {
  const clock = newClock("a");
  expect(tick(clock)).toEqual({ counter: 1, replicaId: "a" });
  expect(tick(clock)).toEqual({ counter: 2, replicaId: "a" });
});

test("observe moves the clock up but never back", () => {
  const clock = newClock("a", 5);
  observe(clock, { counter: 9, replicaId: "b" });
  expect(clock.counter).toBe(9);
  observe(clock, { counter: 3, replicaId: "b" });
  expect(clock.counter).toBe(9);
  expect(tick(clock).counter).toBe(10);
});

test("operation helpers tick the clock and give each operation its own id", () => {
  const clock = newClock("a");
  const ops: Op[] = [
    addMove(clock, ROOT_ID, "e2e4"),
    setMainline(clock, ROOT_ID, e4),
    setDeleted(clock, e4, true),
    setComment(clock, e4, "hello"),
  ];
  expect(ops.map((op) => op.ts.counter)).toEqual([1, 2, 3, 4]);
  expect(ops.every((op) => op.replicaId === "a" && op.ts.replicaId === "a")).toBe(true);
  expect(new Set(ops.map((op) => op.opId)).size).toBe(4);
});

test("clockFromLog is 0 for an empty log", () => {
  expect(clockFromLog([])).toBe(0);
});

// A log as one replica would have stored it: its own operations mixed with
// one received from another replica that is further ahead.
function storedLog(): Op[] {
  const mine = newClock("a");
  const theirs = newClock("b", 40);
  const log: Op[] = [addMove(mine, ROOT_ID, "e2e4"), setComment(mine, e4, "first note")];
  const received = setComment(theirs, e4, "their note");
  observe(mine, received.ts);
  log.push(received, setDeleted(mine, e4, true));
  return log;
}

test("a clock restored from the log stamps a newer timestamp than anything in it", () => {
  const log = storedLog();
  const restored = newClock("a", clockFromLog(log));
  const next = setComment(restored, e4, "after reload");
  for (const op of log) {
    expect(compareTs(next.ts, op.ts)).toBeGreaterThan(0);
  }
});

test("a clock restarted at 0 makes a new comment lose to an older one", () => {
  const state = stateFrom(storedLog());

  const restarted = newClock("a", 0);
  apply(state, setComment(restarted, e4, "after reload"));
  expect(state.comments.get(e4)?.text).toBe("their note");
});
