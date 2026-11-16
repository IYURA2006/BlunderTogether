import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

// A whole-page message for the cases where the study cannot be shown.
export function Notice({ title, children }: Props) {
  return (
    <main className="notice">
      <h1>{title}</h1>
      {children}
    </main>
  );
}
