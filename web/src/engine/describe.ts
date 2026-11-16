// Wording for an evaluation: the score as White sees it and the best line in
// standard notation.
import { moveOf, sideToMove } from "../chess/rules";
import { moveNumber } from "../tree/notation";
import type { Evaluation, Score } from "./uci";

const SHOWN_MOVES = 8;

// Engines score for the side to move. Readers expect plus to mean White.
export function scoreText(score: Score, fen: string): string {
  const value = sideToMove(fen) === "white" ? score.value : -score.value;
  if (score.kind === "mate") {
    return value > 0 ? `Mate in ${value}` : `Mate in ${-value} for Black`;
  }
  const pawns = (value / 100).toFixed(2);
  return value > 0 ? `+${pawns}` : pawns;
}

export function lineText(fen: string, line: string[]): string {
  const parts: string[] = [];
  let position = fen;
  for (const uci of line.slice(0, SHOWN_MOVES)) {
    const move = moveOf(position, uci);
    if (move === null) break;
    const number = moveNumber(position, parts.length === 0);
    parts.push(number ? `${number} ${move.san}` : move.san);
    position = move.after;
  }
  return parts.join(" ");
}

export function evaluationText(evaluation: Evaluation, fen: string): string {
  const score = scoreText(evaluation.score, fen);
  return `${score} at depth ${evaluation.depth}: ${lineText(fen, evaluation.line)}`;
}
