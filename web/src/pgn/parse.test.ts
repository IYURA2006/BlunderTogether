import { expect, test } from "vitest";
import { countMoves, parsePgn } from "./parse";
import type { PgnGame, PgnMove } from "./parse";

// A compact picture of the tree: "e4 e5 (c5 Nf3) Nf3".
function printed(node: PgnGame | PgnMove): string {
  const [main, ...alternatives] = node.children;
  if (!main) return "";
  const variations = alternatives.map((move) => `(${`${move.san} ${printed(move)}`.trim()})`);
  return [main.san, ...variations, printed(main)].filter(Boolean).join(" ");
}

test("reads a main line and ignores move numbers", () => {
  expect(printed(parsePgn("1. e4 e5 2. Nf3 Nc6"))).toBe("e4 e5 Nf3 Nc6");
  expect(printed(parsePgn("1.e4 e5 2.Nf3"))).toBe("e4 e5 Nf3");
});

test("a variation is an alternative to the move before the bracket", () => {
  const game = parsePgn("1. e4 e5 (1... c5 2. Nf3) 2. Nf3");
  expect(printed(game)).toBe("e4 e5 (c5 Nf3) Nf3");
  expect(countMoves(game)).toBe(5);
});

test("variations can be nested and can follow each other", () => {
  const game = parsePgn("1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) (1... e6) 2. Nf3");
  expect(printed(game)).toBe("e4 e5 (c5 Nf3 (c3 d5) d6) (e6) Nf3");
});

test("a note belongs to the move it follows", () => {
  const game = parsePgn("{Club night} 1. e4 {best by test} e5 {solid}\n{and common}");
  expect(game.comment).toBe("Club night");
  expect(game.children[0]?.comment).toBe("best by test");
  expect(game.children[0]?.children[0]?.comment).toBe("solid and common");
});

test("headers, annotations and rest-of-line comments are skipped", () => {
  const text = `[Event "Club (rapid)"]
[White "A"]

1. e4! e5?! $1 2. Nf3 ; a developing move
2... Nc6 $14`;
  expect(printed(parsePgn(text))).toBe("e4 e5 Nf3 Nc6");
});

test("castling written with zeros is understood", () => {
  expect(printed(parsePgn("5. 0-0 Be7 6. 0-0-0"))).toBe("O-O Be7 O-O-O");
});

test("reading stops at the result, so only the first game is taken", () => {
  expect(printed(parsePgn('1. e4 e5 1-0\n\n[Event "second"]\n1. d4 d5 0-1'))).toBe("e4 e5");
  expect(printed(parsePgn("1. e4 e5 *"))).toBe("e4 e5");
});

test("brackets that do not match are tolerated", () => {
  expect(printed(parsePgn("1. e4 ) e5 (1... c5"))).toBe("e4 e5 (c5)");
  expect(parsePgn("").children).toEqual([]);
});
