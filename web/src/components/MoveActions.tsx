interface Props {
  label: string; // the selected move, for example "2... d6"
  canPromote: boolean;
  onPromote(): void;
  onDelete(): void;
}

export function MoveActions({ label, canPromote, onPromote, onDelete }: Props) {
  return (
    <div className="move-actions" role="group" aria-label={`Actions for ${label}`}>
      <span className="move-actions-label">{label}</span>
      <button type="button" className="btn" onClick={onPromote} disabled={!canPromote}>
        Make main line
      </button>
      <button type="button" className="btn" onClick={onDelete}>
        Delete line
      </button>
    </div>
  );
}
