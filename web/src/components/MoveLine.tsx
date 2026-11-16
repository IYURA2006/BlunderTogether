import { Fragment } from "react";
import type { LineItem } from "../tree/notation";
import { MoveButton } from "./MoveButton";

interface Props {
  items: LineItem[];
  selectedId: string;
  onSelect(id: string): void;
}

// One line of moves. A variation is the same component again, one level in.
export function MoveLine({ items, selectedId, onSelect }: Props) {
  return (
    <>
      {items.map((item, index) =>
        item.kind === "variation" ? (
          <div key={firstMoveId(item.items)} className="variation">
            <MoveLine items={item.items} selectedId={selectedId} onSelect={onSelect} />
          </div>
        ) : (
          <Fragment key={item.id}>
            {index > 0 && " "}
            <MoveButton move={item} selected={item.id === selectedId} onSelect={onSelect} />
            {item.comment && <span className="move-comment"> {item.comment}</span>}
          </Fragment>
        ),
      )}
    </>
  );
}

// A variation always starts with a move, and its id is unique in the tree.
function firstMoveId(items: LineItem[]): string {
  const first = items[0];
  return first?.kind === "move" ? first.id : "";
}
