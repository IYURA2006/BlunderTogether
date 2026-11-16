import { useCallback, useEffect, useId, useState } from "react";
import { MAX_COMMENT_CHARS } from "@blunder/core";

interface Props {
  label: string;
  saved: string; // the note as it is in the shared study
  onCommit(text: string): Promise<void>;
}

const PAUSE_MS = 800;
const COUNT_FROM = MAX_COMMENT_CHARS - 200;

export function CommentBox({ label, saved, onCommit }: Props) {
  const id = useId();
  // null while the user has typed nothing new. The box then shows the saved
  // note, so an edit from someone else appears instead of being overwritten.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? saved;

  // Every commit is one operation in the log, so the note is committed after
  // a pause or when the box loses focus, not on each keystroke.
  const commit = useCallback(async () => {
    if (draft === null) return;
    await onCommit(draft);
    // Keep the draft if the user typed more while this one was being saved.
    setDraft((current) => (current === draft ? null : current));
  }, [draft, onCommit]);

  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(commit, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [draft, commit]);

  return (
    <div className="comment-box">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={3}
        maxLength={MAX_COMMENT_CHARS}
        value={text}
        placeholder="What should the club know about this move?"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      {text.length >= COUNT_FROM && (
        <p className="comment-count">
          {text.length} of {MAX_COMMENT_CHARS} characters
        </p>
      )}
    </div>
  );
}
