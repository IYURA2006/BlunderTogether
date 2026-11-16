import { useState } from "react";
import type { CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { PieceDropHandlerArgs, PieceHandlerArgs, SquareHandlerArgs } from "react-chessboard";
import { chessRules, isPromotion, sideToMove } from "../chess/rules";
import { PromotionChooser } from "./PromotionChooser";

interface Props {
  fen: string;
  lastMove: string; // UCI of the move that led here, "" at the start
  orientation: "white" | "black";
  onMove(uci: string): void;
}

// The board is drawn like a diagram in a chess book: white squares, and
// dark squares shaded with diagonal lines instead of a colour.
const LIGHT_SQUARE: CSSProperties = { backgroundColor: "var(--page)" };
const DARK_SQUARE: CSSProperties = {
  backgroundColor: "var(--page)",
  backgroundImage: "repeating-linear-gradient(135deg, var(--hatch) 0 1.5px, transparent 1.5px 5px)",
};
const NOTATION: CSSProperties = { color: "var(--graphite)" };
// See-through, so the shading of a dark square still shows under the mark.
const LAST_MOVE: CSSProperties = { backgroundColor: "var(--highlighter-wash)" };
const PICKED: CSSProperties = { boxShadow: "inset 0 0 0 3px var(--ballpoint)" };

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Board({ fen, lastMove, orientation, onMove }: Props) {
  // A piece chosen by click or tap, waiting for its target square, and a
  // pawn move waiting for its promotion piece. Both remember the position
  // they belong to, so they lapse by themselves when the position changes.
  const [pick, setPick] = useState<{ fen: string; square: string } | null>(null);
  const [promotionAt, setPromotionAt] = useState<{ fen: string; from: string; to: string } | null>(
    null,
  );
  const picked = pick?.fen === fen ? pick.square : null;
  const promotion = promotionAt?.fen === fen ? promotionAt : null;
  const turn = sideToMove(fen) === "white" ? "w" : "b";

  function tryMove(from: string, to: string): boolean {
    if (isPromotion(fen, from, to)) {
      setPromotionAt({ fen, from, to });
      return false;
    }
    const uci = `${from}${to}`;
    if (chessRules.play(fen, uci) === null) return false;
    onMove(uci);
    return true;
  }

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    setPick(null);
    return targetSquare !== null && tryMove(sourceSquare, targetSquare);
  }

  function onSquareClick({ square, piece }: SquareHandlerArgs): void {
    if (picked !== null && tryMove(picked, square)) {
      setPick(null);
      return;
    }
    const ownPiece = piece?.pieceType.startsWith(turn) === true;
    setPick(ownPiece && square !== picked ? { fen, square } : null);
  }

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.slice(0, 2)] = LAST_MOVE;
    squareStyles[lastMove.slice(2, 4)] = LAST_MOVE;
  }
  if (picked) squareStyles[picked] = { ...squareStyles[picked], ...PICKED };

  return (
    <div>
      <div className="board">
        <Chessboard
          options={{
            id: "study",
            position: fen,
            boardOrientation: orientation,
            lightSquareStyle: LIGHT_SQUARE,
            darkSquareStyle: DARK_SQUARE,
            lightSquareNotationStyle: NOTATION,
            darkSquareNotationStyle: NOTATION,
            squareStyles,
            showAnimations: !REDUCED_MOTION,
            animationDurationInMs: 150,
            allowDrawingArrows: false,
            canDragPiece: ({ piece }: PieceHandlerArgs) => piece.pieceType.startsWith(turn),
            onPieceDrop,
            onSquareClick,
          }}
        />
      </div>
      {promotion && (
        <PromotionChooser
          onChoose={(piece) => {
            onMove(`${promotion.from}${promotion.to}${piece}`);
            setPromotionAt(null);
          }}
          onCancel={() => setPromotionAt(null)}
        />
      )}
    </div>
  );
}
