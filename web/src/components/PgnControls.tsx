import { useEffect, useId, useRef, useState } from "react";
import { MAX_PGN_CHARS } from "../pgn/import";

interface Props {
  // The study as PGN, worked out only when it is asked for.
  exportPgn(): string;
  // Takes the game and returns what to tell the user.
  onImport(text: string): Promise<string>;
  // A study that has moves is not added to: the game opens in a new one.
  startsNewStudy: boolean;
  initialMessage: string;
}

const COPY_LABELS = { idle: "Copy PGN", copied: "PGN copied", failed: "Could not copy" };
const RESET_MS = 2000;

export function PgnControls({ exportPgn, onImport, startsNewStudy, initialMessage }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textId = useId();
  const [copyResult, setCopyResult] = useState<keyof typeof COPY_LABELS>("idle");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);

  useEffect(() => {
    if (copyResult === "idle") return;
    const timer = setTimeout(() => setCopyResult("idle"), RESET_MS);
    return () => clearTimeout(timer);
  }, [copyResult]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(exportPgn());
      setCopyResult("copied");
    } catch {
      setCopyResult("failed");
    }
  }

  async function addToStudy(): Promise<void> {
    setBusy(true);
    try {
      setMessage(await onImport(text));
      setText("");
      dialog.current?.close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => dialog.current?.showModal()}>
        Import PGN
      </button>
      <button type="button" className="btn" onClick={copy}>
        <span aria-live="polite">{COPY_LABELS[copyResult]}</span>
      </button>
      <p className="tool-message" role="status">
        {message}
      </p>

      <dialog ref={dialog} className="dialog" aria-labelledby={textId}>
        <label id={textId} htmlFor={`${textId}-text`}>
          Paste a game in PGN
        </label>
        <p className="hint">
          {startsNewStudy
            ? "This study already has moves, so the game opens in a new study with its own link. This one stays as it is."
            : "Its moves and notes are added to the study."}
        </p>
        <textarea
          id={`${textId}-text`}
          rows={10}
          maxLength={MAX_PGN_CHARS}
          value={text}
          placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"
          onChange={(event) => setText(event.target.value)}
        />
        <div className="dialog-actions">
          <button
            type="button"
            className="btn"
            onClick={addToStudy}
            disabled={busy || text.trim() === ""}
          >
            {startsNewStudy ? "Start a new study" : "Add to study"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </dialog>
    </>
  );
}
