interface Props {
  onChoose(piece: "q" | "r" | "b" | "n"): void;
  onCancel(): void;
}

const PIECES = [
  { letter: "q", name: "Queen" },
  { letter: "r", name: "Rook" },
  { letter: "b", name: "Bishop" },
  { letter: "n", name: "Knight" },
] as const;

export function PromotionChooser({ onChoose, onCancel }: Props) {
  return (
    <div className="promotion" role="group" aria-label="Promote the pawn to">
      <span>Promote to</span>
      {PIECES.map(({ letter, name }) => (
        <button key={letter} type="button" className="btn" onClick={() => onChoose(letter)}>
          {name}
        </button>
      ))}
      <button type="button" className="btn btn-quiet" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
