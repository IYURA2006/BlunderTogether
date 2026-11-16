import { useMemo } from "react";
import type { MoveNode } from "../room";
import { lineAfter } from "../tree/notation";
import { MoveLine } from "./MoveLine";

interface Props {
  root: MoveNode;
  selectedId: string;
  onSelect(id: string): void;
}

export function MoveTree({ root, selectedId, onSelect }: Props) {
  // The tree object is replaced only when the study changes, so stepping
  // through moves does not work out the notation again.
  const items = useMemo(() => lineAfter(root), [root]);

  if (items.length === 0) {
    return <p className="empty">No moves yet. Play a move on the board to start the study.</p>;
  }
  return (
    <div className="moves">
      <MoveLine items={items} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
