import { useMemo } from "react";
import { isGameOver } from "../chess/rules";
import { evaluationText } from "../engine/describe";
import type { Evaluation } from "../engine/uci";
import { useEvaluation } from "../engine/useEvaluation";

interface Props {
  fen: string;
  enabled: boolean;
  onToggle(enabled: boolean): void;
}

// The engine runs on this device only, so two people can see different
// numbers for the same position. That is expected and never synced.
export function EngineLine({ fen, enabled, onToggle }: Props) {
  const evaluation = useEvaluation(fen, enabled);
  const text = useMemo(
    () => (enabled ? engineText(fen, evaluation) : ""),
    [fen, evaluation, enabled],
  );

  return (
    <div className="engine-line">
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        Engine
      </label>
      <p aria-live="off">{text}</p>
    </div>
  );
}

function engineText(fen: string, evaluation: Evaluation | null): string {
  if (isGameOver(fen)) return "The game is over in this position.";
  return evaluation ? evaluationText(evaluation, fen) : "Thinking";
}
