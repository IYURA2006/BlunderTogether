import { apply } from "../src/index";
import type { Op, State } from "../src/index";

// Deliberately wrong: a comment always replaces the stored one, so the
// result depends on which comment arrives last. Every other rule is real.
// Used to show that the simulation notices a broken merge rule.
export function applyCommentsInArrivalOrder(state: State, op: Op): void {
  if (op.type === "setComment") {
    state.comments.set(op.moveId, { text: op.text, ts: op.ts });
    return;
  }
  apply(state, op);
}
