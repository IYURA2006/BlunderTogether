import { useEffect } from "react";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Left and right arrows step through the line, except while the user is
// typing a note or moving the delay slider.
export function useArrowKeys(onLeft: () => void, onRight: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && TYPING_TAGS.has(event.target.tagName)) return;
      if (event.key === "ArrowLeft") onLeft();
      else if (event.key === "ArrowRight") onRight();
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onLeft, onRight]);
}
