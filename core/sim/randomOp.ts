import { addMove, ROOT_ID, setComment, setDeleted, setMainline } from "../src/index";
import type { Clock, MoveId, Op, State } from "../src/index";
import type { Rng } from "./rng";

// A short list, so two replicas often add the same move under one parent.
const UCIS = ["e2e4", "d2d4", "g1f3", "c2c4", "e7e5", "g8f6"];

// A random operation that a replica with this state could create.
export function randomOp(rng: Rng, state: State, clock: Clock): Op {
  const known = [...state.moves.keys()];
  const roll = rng.int(10);
  if (known.length === 0 || roll < 4) {
    return addMove(clock, rng.pick([ROOT_ID, ...known]), rng.pick(UCIS));
  }
  if (roll < 6) return randomMainline(rng, state, clock, known);
  if (roll < 8) return setDeleted(clock, rng.pick(known), rng.chance(0.6));
  return setComment(clock, rng.pick(known), `note ${rng.int(20)}`);
}

function randomMainline(rng: Rng, state: State, clock: Clock, known: MoveId[]): Op {
  const childId = rng.pick(known);
  const child = state.moves.get(childId);
  // One time in five the child is paired with an unrelated parent. The tree
  // ignores such a choice, but replicas must still store the same value.
  const parentId =
    child !== undefined && !rng.chance(0.2) ? child.parentId : rng.pick([ROOT_ID, ...known]);
  return setMainline(clock, parentId, childId);
}
