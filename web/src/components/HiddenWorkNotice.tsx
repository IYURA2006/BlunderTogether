import { hiddenWorkMessage } from "../tree/deletedLines";
import type { HiddenWork } from "../tree/deletedLines";

interface Props {
  work: HiddenWork;
  onRestore(): void;
}

// Deleting a line also hides moves someone else added to it. This tells the
// person whose work disappeared, and lets them bring it back.
export function HiddenWorkNotice({ work, onRestore }: Props) {
  if (work.moves === 0) return null;

  return (
    <p className="hidden-work" role="status">
      {hiddenWorkMessage(work)}{" "}
      <button type="button" className="btn" onClick={onRestore}>
        {work.lineIds.length === 1 ? "Restore line" : "Restore lines"}
      </button>
    </p>
  );
}
