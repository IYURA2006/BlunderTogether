interface Props {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack(): void;
  onForward(): void;
  onFlip(): void;
}

export function BoardControls({ canGoBack, canGoForward, onBack, onForward, onFlip }: Props) {
  return (
    <div className="board-controls">
      <button
        type="button"
        className="btn"
        onClick={onBack}
        disabled={!canGoBack}
        aria-keyshortcuts="ArrowLeft"
      >
        Back
      </button>
      <button
        type="button"
        className="btn"
        onClick={onForward}
        disabled={!canGoForward}
        aria-keyshortcuts="ArrowRight"
      >
        Forward
      </button>
      <button type="button" className="btn btn-quiet" onClick={onFlip}>
        Flip board
      </button>
    </div>
  );
}
