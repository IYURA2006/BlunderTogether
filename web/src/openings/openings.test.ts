import { expect, test } from "vitest";
import { chessRules } from "../chess/rules";
import { OPENINGS } from "./list";
import { menuOpenings, openingLine, openingNameFor } from "./openings";

// Positions from the last move back to the start, as the app passes them.
function positionsAfter(ucis: string[]): string[] {
  const positions = [chessRules.start];
  for (const uci of ucis) positions.unshift(chessRules.play(positions[0]!, uci)!);
  return positions;
}

function named(name: string): string[] {
  return openingLine(OPENINGS.find((opening) => opening.name === name)!);
}

test("every opening is a legal line from the starting position", () => {
  for (const opening of OPENINGS) {
    expect(openingLine(opening).length, opening.name).toBe(opening.moves.split(" ").length);
  }
});

test("names are unique and no two openings end in the same position", () => {
  const names = OPENINGS.map((opening) => opening.name);
  const ends = OPENINGS.map((opening) => positionsAfter(openingLine(opening))[0]);
  expect(new Set(names).size).toBe(names.length);
  expect(new Set(ends).size).toBe(ends.length);
});

test("the menu leaves out one-move openings and is in alphabetical order", () => {
  expect(menuOpenings.some((opening) => opening.name === "King's Pawn Game")).toBe(false);
  expect(menuOpenings.some((opening) => opening.name === "Sicilian Defence")).toBe(true);
  const names = menuOpenings.map((opening) => opening.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test("an opening is written as UCI moves", () => {
  expect(named("Sicilian Defence")).toEqual(["e2e4", "c7c5"]);
});

test("the starting position and unknown lines have no name", () => {
  expect(openingNameFor(positionsAfter([]))).toBeNull();
  expect(openingNameFor(positionsAfter(["a2a3"]))).toBeNull();
});

test("the most specific opening on the line gives the name", () => {
  expect(openingNameFor(positionsAfter(["e2e4"]))).toBe("King's Pawn Game");
  expect(openingNameFor(positionsAfter(["e2e4", "c7c5"]))).toBe("Sicilian Defence");
  const najdorf = named("Sicilian Defence, Najdorf Variation");
  expect(openingNameFor(positionsAfter(najdorf))).toBe("Sicilian Defence, Najdorf Variation");
});

test("a line that leaves the known openings keeps its last name", () => {
  const line = [...named("Sicilian Defence"), "b1c3", "b8c6", "g2g3"];
  expect(openingNameFor(positionsAfter(line))).toBe("Sicilian Defence");
});

test("a different move order that reaches the same position gets the same name", () => {
  const transposed = ["c2c4", "e7e6", "b1c3", "g8f6", "d2d4", "f8b4"];
  expect(openingNameFor(positionsAfter(transposed))).toBe("Nimzo-Indian Defence");
});
