import type { MoveId } from "@blunder/core";
import type { DeletedLineRow } from "../tree/deletedLines";

interface Props {
  lines: DeletedLineRow[];
  onRestore(id: MoveId): void;
}

export function DeletedLines({ lines, onRestore }: Props) {
  if (lines.length === 0) return null;

  return (
    <section className="deleted-lines">
      <h2>Deleted lines</h2>
      <ul>
        {lines.map(({ id, label, moves }) => (
          <li key={id}>
            <span className="deleted-line-name">{label}</span>
            <span className="deleted-line-size">{moves === 1 ? "1 move" : `${moves} moves`}</span>
            <button type="button" className="btn" onClick={() => onRestore(id)}>
              Restore line
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
