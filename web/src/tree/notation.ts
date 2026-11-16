// Turns the derived tree into the way chess books print analysis: the main
// line runs on, and each alternative is a bracketed variation after the move
// it replaces.
import { fullmoveNumber, sanOf, sideToMove } from "../chess/rules";
import type { MoveNode } from "../room";

export interface MoveItem {
  kind: "move";
  id: string;
  number: string; // "3." or "3..." or "" when the number can be left out
  san: string;
  comment: string;
}

export interface VariationItem {
  kind: "variation";
  items: LineItem[];
}

export type LineItem = MoveItem | VariationItem;

// White moves always carry their number. A black move needs one only where
// the reader has lost the thread: at the start of a line, or after a
// variation or comment.
export function moveNumber(fenBefore: string, always: boolean): string {
  const number = fullmoveNumber(fenBefore);
  if (sideToMove(fenBefore) === "white") return `${number}.`;
  return always ? `${number}...` : "";
}

// A move named on its own, outside a line: "3. Bb5" or "2... d6".
export function moveLabel(fenBefore: string, uci: string): string {
  return `${moveNumber(fenBefore, true)} ${sanOf(fenBefore, uci)}`;
}

function moveItem(parent: MoveNode, node: MoveNode, numberAlways: boolean): MoveItem {
  return {
    kind: "move",
    id: node.id,
    number: moveNumber(parent.position, numberAlways),
    san: sanOf(parent.position, node.uci),
    comment: node.comment,
  };
}

// The line that continues from a position: first child, then its first
// child, and so on, with the other children as variations along the way.
export function lineAfter(parent: MoveNode): LineItem[] {
  const items: LineItem[] = [];
  let node = parent;
  let numberAlways = true;

  while (node.children.length > 0) {
    const [main, ...alternatives] = node.children as [MoveNode, ...MoveNode[]];
    items.push(moveItem(node, main, numberAlways));
    for (const alternative of alternatives) {
      const first = moveItem(node, alternative, true);
      items.push({ kind: "variation", items: [first, ...lineAfter(alternative)] });
    }
    numberAlways = alternatives.length > 0 || main.comment !== "";
    node = main;
  }
  return items;
}
