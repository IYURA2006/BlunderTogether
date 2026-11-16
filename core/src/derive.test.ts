import { expect, test } from "vitest";
import {
  ROOT_ID,
  addMove,
  apply,
  deriveTree,
  emptyState,
  moveIdOf,
  newClock,
  setComment,
  setDeleted,
  setMainline,
} from "./index";
import type { TreeNode } from "./index";
import { c4, d4, e4, e5, fakeRules, stateFrom } from "./testing";

function ids(nodes: TreeNode<string>[]): string[] {
  return nodes.map((node) => node.id);
}

test("an empty state gives a bare root", () => {
  const { root, deletedLines } = deriveTree(emptyState(), fakeRules);
  expect(root).toEqual({
    id: ROOT_ID,
    parentId: null,
    uci: "",
    position: "",
    comment: "",
    addedBy: "",
    children: [],
  });
  expect(deletedLines).toEqual([]);
});

test("nodes carry position, comment and who added them first", () => {
  const a = newClock("a");
  const state = stateFrom([
    addMove(a, ROOT_ID, "e2e4"),
    addMove(a, e4, "e7e5"),
    setComment(a, e5, "open game"),
  ]);
  const reply = deriveTree(state, fakeRules).root.children[0]!.children[0]!;
  expect(reply).toMatchObject({
    id: e5,
    parentId: e4,
    uci: "e7e5",
    position: "e2e4 e7e5",
    comment: "open game",
    addedBy: "a",
  });
});

test("siblings are ordered by who was added first, whatever order they arrived in", () => {
  const a = newClock("a");
  const ops = [
    addMove(a, ROOT_ID, "e2e4"),
    addMove(a, ROOT_ID, "d2d4"),
    addMove(a, ROOT_ID, "c2c4"),
  ];
  const added = [e4, d4, c4];
  expect(ids(deriveTree(stateFrom(ops), fakeRules).root.children)).toEqual(added);
  expect(ids(deriveTree(stateFrom([...ops].reverse()), fakeRules).root.children)).toEqual(added);
});

test("a move two people played keeps the place of whoever played it first", () => {
  const early = newClock("a");
  const late = newClock("b", 10);
  const ops = [
    addMove(late, ROOT_ID, "e2e4"),
    addMove(early, ROOT_ID, "d2d4"),
    addMove(early, ROOT_ID, "e2e4"),
  ];
  // e4 was first played at counter 2 by a, after d4 at counter 1.
  expect(ids(deriveTree(stateFrom(ops), fakeRules).root.children)).toEqual([d4, e4]);
  expect(ids(deriveTree(stateFrom([...ops].reverse()), fakeRules).root.children)).toEqual([d4, e4]);
});

test("the main line child comes first, the rest stay in the order they were added", () => {
  const a = newClock("a");
  const state = stateFrom([
    addMove(a, ROOT_ID, "e2e4"),
    addMove(a, ROOT_ID, "d2d4"),
    addMove(a, ROOT_ID, "c2c4"),
    setMainline(a, ROOT_ID, c4),
  ]);
  expect(ids(deriveTree(state, fakeRules).root.children)).toEqual([c4, e4, d4]);
});

test("a main line that names a move under another parent is ignored", () => {
  const a = newClock("a");
  const state = stateFrom([
    addMove(a, ROOT_ID, "e2e4"),
    addMove(a, ROOT_ID, "d2d4"),
    addMove(a, e4, "e7e5"),
    setMainline(a, ROOT_ID, e5),
  ]);
  const { root } = deriveTree(state, fakeRules);
  expect(ids(root.children)).toEqual([e4, d4]);
  expect(root.children.flatMap((node) => ids(node.children))).toEqual([e5]);
});

test("an illegal move is dropped with everything below it", () => {
  const a = newClock("a");
  const illegal = moveIdOf(ROOT_ID, "h2h4");
  const state = stateFrom([
    addMove(a, ROOT_ID, "h2h4"),
    addMove(a, illegal, "e7e5"),
    addMove(a, ROOT_ID, "e2e4"),
    setDeleted(a, illegal, true),
  ]);
  const { root, deletedLines } = deriveTree(state, fakeRules);
  expect(ids(root.children)).toEqual([e4]);
  expect(deletedLines).toEqual([]);
});

test("a move whose parent has not arrived is unreachable until it does", () => {
  const a = newClock("a");
  const parent = addMove(a, ROOT_ID, "e2e4");
  const child = addMove(a, e4, "e7e5");
  const state = stateFrom([child]);
  expect(deriveTree(state, fakeRules).root.children).toEqual([]);

  apply(state, parent);
  expect(ids(deriveTree(state, fakeRules).root.children[0]!.children)).toEqual([e5]);
});

test("deleted lines are listed by id, without the deleted moves nested in them", () => {
  const a = newClock("a");
  const nf3 = moveIdOf(e5, "g1f3");
  const state = stateFrom([
    addMove(a, ROOT_ID, "e2e4"),
    addMove(a, e4, "e7e5"),
    addMove(a, e5, "g1f3"),
    addMove(a, ROOT_ID, "d2d4"),
    setDeleted(a, e4, true),
    setDeleted(a, nf3, true),
    setDeleted(a, d4, true),
  ]);
  const { root, deletedLines } = deriveTree(state, fakeRules);
  expect(root.children).toEqual([]);
  expect(ids(deletedLines)).toEqual([e4, d4].sort());

  const e4Line = deletedLines.find((line) => line.id === e4)!;
  expect(ids(e4Line.children)).toEqual([e5]);
  expect(e4Line.children[0]!.children).toEqual([]);
});

test("a deleted move under a visible parent is a line of its own", () => {
  const a = newClock("a");
  const state = stateFrom([
    addMove(a, ROOT_ID, "e2e4"),
    addMove(a, e4, "e7e5"),
    setDeleted(a, e5, true),
  ]);
  const { root, deletedLines } = deriveTree(state, fakeRules);
  expect(root.children[0]!.children).toEqual([]);
  expect(ids(deletedLines)).toEqual([e5]);
  expect(deletedLines[0]!.parentId).toBe(e4);
});

test("a restored move is visible again", () => {
  const a = newClock("a");
  const state = stateFrom([
    addMove(a, ROOT_ID, "e2e4"),
    setDeleted(a, e4, true),
    setDeleted(a, e4, false),
  ]);
  const { root, deletedLines } = deriveTree(state, fakeRules);
  expect(ids(root.children)).toEqual([e4]);
  expect(deletedLines).toEqual([]);
});
