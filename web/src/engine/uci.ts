// Reading the engine's side of the UCI protocol.

// Centipawns or moves until mate, from the point of view of the side to move.
export type Score = { kind: "cp"; value: number } | { kind: "mate"; value: number };

export interface Evaluation {
  depth: number;
  score: Score;
  line: string[]; // best line in UCI moves
}

// Parses a line such as
//   info depth 14 seldepth 20 score cp 31 nodes 90210 pv e2e4 e7e5 g1f3
// Returns null for every other kind of line.
export function parseInfo(text: string): Evaluation | null {
  const words = text.split(" ");
  if (words[0] !== "info") return null;

  const depth = Number(words[words.indexOf("depth") + 1]);
  const scoreAt = words.indexOf("score");
  const lineAt = words.indexOf("pv");
  if (!Number.isInteger(depth) || scoreAt < 0 || lineAt < 0) return null;

  // A bound is a search that failed high or low, not a real evaluation.
  if (words.includes("lowerbound") || words.includes("upperbound")) return null;

  const kind = words[scoreAt + 1];
  const value = Number(words[scoreAt + 2]);
  if ((kind !== "cp" && kind !== "mate") || !Number.isInteger(value)) return null;

  return { depth, score: { kind, value }, line: words.slice(lineAt + 1) };
}

export function isBestMove(text: string): boolean {
  return text.startsWith("bestmove");
}
