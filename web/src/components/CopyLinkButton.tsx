import { useEffect, useState } from "react";

const LABELS = { idle: "Copy link", copied: "Link copied", failed: "Could not copy" };
const RESET_MS = 2000;

// The room id in the link is the only key to the study, so sharing the link
// is how people are invited.
export function CopyLinkButton() {
  const [result, setResult] = useState<keyof typeof LABELS>("idle");

  useEffect(() => {
    if (result === "idle") return;
    const timer = setTimeout(() => setResult("idle"), RESET_MS);
    return () => clearTimeout(timer);
  }, [result]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  }

  return (
    <button type="button" className="btn" onClick={copy}>
      <span aria-live="polite">{LABELS[result]}</span>
    </button>
  );
}
