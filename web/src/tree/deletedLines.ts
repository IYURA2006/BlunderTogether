import type { MoveId } from "@blunder/core";
import type { MoveNode, RoomView } from "../room";
import { moveLabel } from "./notation";

export function countMoves(line: MoveNode): number {
  return line.children.reduce((total, child) => total + countMoves(child), 1);
}

function countAddedBy(line: MoveNode, replicaId: string): number {
  const own = line.addedBy === replicaId ? 1 : 0;
  return line.children.reduce((total, child) => total + countAddedBy(child, replicaId), own);
}

export interface DeletedLineRow {
  id: MoveId;
  label: string; // the first move of the line, for example "2. Nf3"
  moves: number;
}

export function deletedLineRows(view: RoomView): DeletedLineRow[] {
  return view.deletedLines.map((line) => {
    // The parent of a deleted line is always a visible move.
    const before = view.visible.get(line.parentId ?? "")?.position ?? "";
    return { id: line.id, label: moveLabel(before, line.uci), moves: countMoves(line) };
  });
}

export interface HiddenWork {
  moves: number; // moves this replica added that sit inside deleted lines
  lineIds: MoveId[]; // the deleted lines that hold them
}

export function hiddenWorkMessage(work: HiddenWork): string {
  const moves = work.moves === 1 ? "1 of your moves is" : `${work.moves} of your moves are`;
  const lines = work.lineIds.length === 1 ? "a deleted line" : "deleted lines";
  return `${moves} in ${lines}.`;
}

// For display only. Deleted lines are already derived as they would look
// after a restore, so this counts exactly the moves a restore brings back.
export function findHiddenWork(deletedLines: MoveNode[], replicaId: string): HiddenWork {
  const work: HiddenWork = { moves: 0, lineIds: [] };
  for (const line of deletedLines) {
    const mine = countAddedBy(line, replicaId);
    if (mine > 0) {
      work.moves += mine;
      work.lineIds.push(line.id);
    }
  }
  return work;
}
