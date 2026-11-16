// One test per row of the "Conflict cases" table in README.md.
import { expect, test } from "vitest";
import {
  ROOT_ID,
  addMove,
  apply,
  canonicalize,
  deriveTree,
  newClock,
  observe,
  setComment,
  setDeleted,
  setMainline,
} from "./index";
import type { State, TreeNode } from "./index";
import { c4, d4, e4, fakeRules, stateFrom } from "./testing";

function ucis(nodes: TreeNode<string>[]): string[] {
  return nodes.map((node) => node.uci);
}

test("A and B both play e2e4: one move with one id", () => {
  const fromA = addMove(newClock("a"), ROOT_ID, "e2e4");
  const fromB = addMove(newClock("b"), ROOT_ID, "e2e4");
  const onA = stateFrom([fromA, fromB]);
  const onB = stateFrom([fromB, fromA]);

  expect(canonicalize(onA)).toBe(canonicalize(onB));
  expect([...onA.moves.keys()]).toEqual([e4]);
  expect(ucis(deriveTree(onA, fakeRules).root.children)).toEqual(["e2e4"]);
});

test("A deletes a line while B extends it: hidden, and restore shows B's moves", () => {
  const a = newClock("a");
  const b = newClock("b");
  const shared = addMove(a, ROOT_ID, "e2e4");
  observe(b, shared.ts);
  const deletion = setDeleted(a, e4, true);
  const extension = addMove(b, e4, "e7e5");

  const onA = stateFrom([shared, deletion, extension]);
  const onB = stateFrom([shared, extension, deletion]);
  expect(canonicalize(onA)).toBe(canonicalize(onB));

  const hidden = deriveTree(onA, fakeRules);
  expect(hidden.root.children).toEqual([]);
  expect(ucis(hidden.deletedLines)).toEqual(["e2e4"]);
  expect(ucis(hidden.deletedLines[0]!.children)).toEqual(["e7e5"]);

  observe(a, extension.ts);
  apply(onA, setDeleted(a, e4, false));
  const restored = deriveTree(onA, fakeRules);
  expect(ucis(restored.root.children)).toEqual(["e2e4"]);
  expect(restored.root.children[0]!.children[0]!.addedBy).toBe("b");
  expect(restored.deletedLines).toEqual([]);
});

test("A and B promote different variations: the larger timestamp wins", () => {
  const clock = newClock("a");
  const moves = [addMove(clock, ROOT_ID, "e2e4"), addMove(clock, ROOT_ID, "d2d4")];
  const fromA = setMainline(newClock("a", 5), ROOT_ID, e4);
  const fromB = setMainline(newClock("b", 6), ROOT_ID, d4);

  const onA = stateFrom([...moves, fromA, fromB]);
  const onB = stateFrom([...moves, fromB, fromA]);
  expect(canonicalize(onA)).toBe(canonicalize(onB));
  expect(deriveTree(onA, fakeRules).root.children[0]!.uci).toBe("d2d4");
});

test("A and B edit the same comment: the larger timestamp wins, the other is lost", () => {
  const move = addMove(newClock("a"), ROOT_ID, "e2e4");
  const fromA = setComment(newClock("a", 5), e4, "solid");
  const fromB = setComment(newClock("b", 5), e4, "sharp");

  const onA = stateFrom([move, fromA, fromB]);
  const onB = stateFrom([move, fromB, fromA]);
  expect(canonicalize(onA)).toBe(canonicalize(onB));
  expect(deriveTree(onA, fakeRules).root.children[0]!.comment).toBe("sharp");
});

test("main line pointing at a deleted or missing move is ignored", () => {
  const a = newClock("a");
  const moves = [addMove(a, ROOT_ID, "d2d4"), addMove(a, ROOT_ID, "e2e4")];
  const asAdded = [d4, e4];
  const childIds = (state: State) => deriveTree(state, fakeRules).root.children.map((n) => n.id);

  const toDeleted = stateFrom([
    ...moves,
    addMove(a, ROOT_ID, "c2c4"),
    setMainline(a, ROOT_ID, c4),
    setDeleted(a, c4, true),
  ]);
  expect(childIds(toDeleted)).toEqual(asAdded);

  const toMissing = stateFrom([...moves, setMainline(a, ROOT_ID, c4)]);
  expect(childIds(toMissing)).toEqual(asAdded);
});

test("the same operation arriving three times is applied once in effect", () => {
  const a = newClock("a");
  const ops = [addMove(a, ROOT_ID, "e2e4"), setComment(a, e4, "main try"), setDeleted(a, e4, true)];
  const once = stateFrom(ops);
  const thrice = stateFrom([...ops, ...ops, ...ops]);
  expect(canonicalize(thrice)).toBe(canonicalize(once));
});
