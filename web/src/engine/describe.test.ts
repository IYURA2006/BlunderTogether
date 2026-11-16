import { expect, test } from "vitest";
import { chessRules } from "../chess/rules";
import { evaluationText, lineText, scoreText } from "./describe";

const start = chessRules.start;
const afterE4 = chessRules.play(start, "e2e4")!;

test("a score is shown from White's side whoever is to move", () => {
  expect(scoreText({ kind: "cp", value: 31 }, start)).toBe("+0.31");
  expect(scoreText({ kind: "cp", value: 31 }, afterE4)).toBe("-0.31");
  expect(scoreText({ kind: "cp", value: 0 }, start)).toBe("0.00");
});

test("a mate score names the side that mates", () => {
  expect(scoreText({ kind: "mate", value: 3 }, start)).toBe("Mate in 3");
  expect(scoreText({ kind: "mate", value: 3 }, afterE4)).toBe("Mate in 3 for Black");
  expect(scoreText({ kind: "mate", value: -2 }, start)).toBe("Mate in 2 for Black");
});

test("the best line is written in standard notation with move numbers", () => {
  expect(lineText(start, ["e2e4", "e7e5", "g1f3"])).toBe("1. e4 e5 2. Nf3");
  expect(lineText(afterE4, ["e7e5", "g1f3"])).toBe("1... e5 2. Nf3");
});

test("a line stops at the first move that is not legal", () => {
  expect(lineText(start, ["e2e4", "e2e4", "g1f3"])).toBe("1. e4");
});

test("the full description joins score, depth and line", () => {
  const evaluation = { depth: 12, score: { kind: "cp" as const, value: 25 }, line: ["e2e4"] };
  expect(evaluationText(evaluation, start)).toBe("+0.25 at depth 12: 1. e4");
});
