import { expect, test } from "vitest";
import { canonicalize, emptyState } from "../src/index";
import { applyCommentsInArrivalOrder } from "./brokenApply";
import { firstDivergingSeed, hasReusedTs, runSimulation } from "./simulation";

// SIM_SEED=<n> replays one seed, to reproduce a reported failure.
function seedsToRun(): number[] {
  const single = process.env.SIM_SEED;
  if (single !== undefined) return [Number(single)];
  return Array.from({ length: 1000 }, (_, seed) => seed);
}

const restartAtZero = () => 0;

test("five replicas converge for every seed", () => {
  for (const seed of seedsToRun()) {
    const result = runSimulation({ seed });
    expect(result.converged, `seed ${seed} diverged; replay with SIM_SEED=${seed}`).toBe(true);
  }
});

test("a run creates 200 operations and leaves a state that is not empty", () => {
  const result = runSimulation({ seed: 1 });
  expect(result.ops).toHaveLength(200);
  expect(result.canonical[0]).not.toBe(canonicalize(emptyState()));
});

test("the same seed gives the same final state", () => {
  expect(runSimulation({ seed: 7 }).canonical).toEqual(runSimulation({ seed: 7 }).canonical);
});

test("a comment rule that depends on arrival order is caught within 50 seeds", () => {
  const seed = firstDivergingSeed(50, { apply: applyCommentsInArrivalOrder });
  console.log(`arrival-order comments: first diverging seed is ${seed}`);
  expect(seed).not.toBeNull();
});

test("a clock restored from the log never reuses a timestamp", () => {
  for (let seed = 0; seed < 50; seed++) {
    const result = runSimulation({ seed });
    expect(hasReusedTs(result.ops), `seed ${seed}`).toBe(false);
  }
});

test("a clock restarted at 0 reuses timestamps", () => {
  const result = runSimulation({ seed: 0, restoreCounter: restartAtZero });
  expect(hasReusedTs(result.ops)).toBe(true);
});

// Fewer seeds diverge here than for a broken merge rule, because two
// operations with one timestamp must also hit the same move and reach two
// replicas in different orders. See docs/design/tests.md.
test("a clock restarted at 0 makes replicas diverge within 200 seeds", () => {
  const seed = firstDivergingSeed(200, { restoreCounter: restartAtZero });
  console.log(`clock restarted at 0: first diverging seed is ${seed}`);
  expect(seed).not.toBeNull();
});
