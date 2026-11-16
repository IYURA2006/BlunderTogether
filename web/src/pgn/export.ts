// Writes the visible study as PGN: main line, bracketed variations and notes.
import type { MoveNode } from "../room";
import { lineAfter } from "../tree/notation";
import type { LineItem } from "../tree/notation";

const LINE_WIDTH = 80;

// PGN has no way to write "}" inside a note, and a line break there would
// come back as part of the text.
function noteWords(text: string): string[] {
  const words = text.replaceAll("}", ")").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  words[0] = `{${words[0]}`;
  words[words.length - 1] += "}";
  return words;
}

function lineWords(items: LineItem[]): string[] {
  return items.flatMap((item) => {
    if (item.kind === "move") {
      const move = item.number ? [item.number, item.san] : [item.san];
      return [...move, ...noteWords(item.comment)];
    }
    const words = lineWords(item.items);
    words[0] = `(${words[0]}`;
    words[words.length - 1] += ")";
    return words;
  });
}

function wrap(words: string[]): string {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > LINE_WIDTH) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  return [...lines, line].join("\n");
}

export function toPgn(root: MoveNode): string {
  const words = [...noteWords(root.comment), ...lineWords(lineAfter(root)), "*"];
  return `[Event "BlunderTogether study"]\n[Result "*"]\n\n${wrap(words)}\n`;
}
