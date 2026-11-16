import { expect, test } from "vitest";
import { chessRules, fullmoveNumber, isPromotion, sanOf, sideToMove } from "./rules";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const PAWN_ON_A7 = "8/P7/8/8/8/8/8/k6K w - - 0 1";

test("a legal move gives the next position", () => {
  expect(chessRules.play(chessRules.start, "e2e4")).toBe(AFTER_E4);
});

test("illegal and malformed moves give null", () => {
  for (const uci of ["e2e5", "e7e5", "e1g1", "", "zzzz"]) {
    expect(chessRules.play(chessRules.start, uci)).toBeNull();
  }
});

test("a position that is not a FEN gives null instead of throwing", () => {
  expect(chessRules.play("not a position", "e2e4")).toBeNull();
});

test("a promotion letter is required exactly when the move promotes", () => {
  expect(chessRules.play(chessRules.start, "e2e4q")).toBeNull();
  expect(chessRules.play(PAWN_ON_A7, "a7a8")).toBeNull();
  expect(chessRules.play(PAWN_ON_A7, "a7a8n")).toBe("N7/8/8/8/8/8/8/k6K b - - 0 1");
});

test("moves are shown in standard notation", () => {
  expect(sanOf(chessRules.start, "g1f3")).toBe("Nf3");
  expect(sanOf(PAWN_ON_A7, "a7a8q")).toBe("a8=Q+");
});

test("isPromotion is true only for a pawn reaching the last rank", () => {
  expect(isPromotion(PAWN_ON_A7, "a7", "a8")).toBe(true);
  expect(isPromotion(PAWN_ON_A7, "h1", "h2")).toBe(false);
  expect(isPromotion(chessRules.start, "e2", "e4")).toBe(false);
});

test("side to move and move number are read from the position", () => {
  expect(sideToMove(chessRules.start)).toBe("white");
  expect(sideToMove(AFTER_E4)).toBe("black");
  expect(fullmoveNumber(AFTER_E4)).toBe(1);
  expect(fullmoveNumber(chessRules.play(AFTER_E4, "e7e5")!)).toBe(2);
});
