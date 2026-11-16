// Shared by the tests in this folder. Not part of the public interface.
import { ROOT_ID, apply, emptyState, moveIdOf } from "./index";
import type { Op, Rules, State } from "./index";

export function stateFrom(ops: Op[]): State {
  const state = emptyState();
  for (const op of ops) apply(state, op);
  return state;
}

// Positions are the moves played so far. Any move from the h-file is illegal.
export const fakeRules: Rules<string> = {
  start: "",
  play: (position, uci) => (uci.startsWith("h") ? null : `${position} ${uci}`.trim()),
};

export const e4 = moveIdOf(ROOT_ID, "e2e4");
export const d4 = moveIdOf(ROOT_ID, "d2d4");
export const c4 = moveIdOf(ROOT_ID, "c2c4");
export const e5 = moveIdOf(e4, "e7e5");
