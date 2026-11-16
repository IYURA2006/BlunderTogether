import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  confirmLabel: string;
  children: ReactNode;
  onConfirm(): void;
  onCancel(): void;
}

// Shown for as long as it is rendered. Escape and the backdrop of a native
// dialog close it, which arrives here as onCancel.
export function ConfirmDialog({ title, confirmLabel, children, onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="dialog" onClose={onCancel}>
      <h2>{title}</h2>
      {children}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
