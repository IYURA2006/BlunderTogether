import { useEffect, useRef } from "react";
import type { MoveItem } from "../tree/notation";

interface Props {
  move: MoveItem;
  selected: boolean;
  onSelect(id: string): void;
}

export function MoveButton({ move, selected, onSelect }: Props) {
  const button = useRef<HTMLButtonElement>(null);

  // Keeps the current move in sight when the arrow keys walk a long line.
  useEffect(() => {
    if (selected) button.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <button
      ref={button}
      type="button"
      className="move"
      aria-current={selected ? "step" : undefined}
      onClick={() => onSelect(move.id)}
    >
      {move.number && <span className="move-number">{move.number} </span>}
      {move.san}
    </button>
  );
}
