// Chess rules over FEN strings, from chess.js.
import { Chess } from "chess.js";
import type { Move } from "chess.js";
import type { Rules } from "@blunder/core";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Deriving the tree and writing the notation replay every move on every
// change. Engine lines add positions that are in no study, so the cache is
// emptied when it gets large instead of growing for ever.
const MAX_CACHED_MOVES = 20_000;
const cachedMoves = new Map<string, Move | null>();

// The move as chess.js describes it, or null if it is not legal.
export function moveOf(fen: string, uci: string): Move | null {
  const key = `${fen}|${uci}`;
  let move = cachedMoves.get(key);
  if (move === undefined) {
    move = tryMove(fen, uci);
    if (cachedMoves.size >= MAX_CACHED_MOVES) cachedMoves.clear();
    cachedMoves.set(key, move);
  }
  return move;
}

function tryMove(fen: string, uci: string): Move | null {
  try {
    const move = new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4) || undefined,
    });
    // chess.js ignores a promotion letter on a move that does not promote.
    // "e2e4q" would then be a second, different id for the move "e2e4".
    return move.lan === uci ? move : null;
  } catch {
    return null;
  }
}

export const chessRules: Rules<string> = {
  start: START_FEN,
  play: (fen, uci) => moveOf(fen, uci)?.after ?? null,
};

// Standard notation for a move that is known to be legal, for example "Nf3".
export function sanOf(fen: string, uci: string): string {
  return moveOf(fen, uci)?.san ?? uci;
}

// The UCI form of a move written in standard notation, or null if the
// position has no such move.
export function uciOfSan(fen: string, san: string): string | null {
  try {
    return new Chess(fen).move(san).lan;
  } catch {
    return null;
  }
}

export function isPromotion(fen: string, from: string, to: string): boolean {
  return moveOf(fen, `${from}${to}q`) !== null;
}

export function sideToMove(fen: string): "white" | "black" {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

export function fullmoveNumber(fen: string): number {
  return Number(fen.split(" ")[5]);
}

export function isGameOver(fen: string): boolean {
  return new Chess(fen).isGameOver();
}
