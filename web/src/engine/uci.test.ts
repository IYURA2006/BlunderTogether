import { expect, test } from "vitest";
import { isBestMove, parseInfo } from "./uci";

test("reads depth, score and line from an info line", () => {
  const line =
    "info depth 14 seldepth 20 multipv 1 score cp 31 nodes 90210 nps 5 pv e2e4 e7e5 g1f3";
  expect(parseInfo(line)).toEqual({
    depth: 14,
    score: { kind: "cp", value: 31 },
    line: ["e2e4", "e7e5", "g1f3"],
  });
});

test("reads a mate score", () => {
  const evaluation = parseInfo("info depth 9 score mate -3 pv h7h8 g8h8");
  expect(evaluation?.score).toEqual({ kind: "mate", value: -3 });
});

test("ignores lines that carry no evaluation", () => {
  expect(parseInfo("info depth 12 currmove e2e4 currmovenumber 1")).toBeNull();
  expect(parseInfo("info string NNUE evaluation enabled")).toBeNull();
  expect(parseInfo("info depth 10 score cp 25 lowerbound pv e2e4")).toBeNull();
  expect(parseInfo("bestmove e2e4 ponder e7e5")).toBeNull();
  expect(parseInfo("uciok")).toBeNull();
});

test("recognises the end of a search", () => {
  expect(isBestMove("bestmove e2e4 ponder e7e5")).toBe(true);
  expect(isBestMove("info depth 1 score cp 0 pv e2e4")).toBe(false);
});
