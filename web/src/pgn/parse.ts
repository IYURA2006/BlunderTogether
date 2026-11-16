// Reads the moves of the first game in a PGN text into a tree. It knows
// nothing about chess: whether a move is legal is decided on import.

export interface PgnMove {
  san: string;
  comment: string;
  children: PgnMove[]; // the game's next move first, then alternatives to it
}

// The position before the first move. It can carry a note too.
export interface PgnGame {
  comment: string;
  children: PgnMove[];
}

type Node = PgnGame | PgnMove;

const HEADER_LINE = /^\s*\[.*$/gm;
// A note, a bracket, a rest-of-line comment, or a word.
const TOKEN = /\{[^}]*\}|[()]|;[^\n]*|[^\s(){};]+/g;
const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

// "12.Nf3!?" becomes "Nf3". A bare move number or an annotation code such
// as "$14" becomes "".
function sanOf(word: string): string {
  if (word.startsWith("$")) return "";
  return word
    .replace(/^\d+\.+/, "")
    .replace(/[!?]+$/, "")
    .replace(/^0-0-0/, "O-O-O")
    .replace(/^0-0/, "O-O");
}

function addNote(node: Node, text: string): void {
  const note = text.replace(/\s+/g, " ").trim();
  if (note) node.comment = node.comment ? `${node.comment} ${note}` : note;
}

export function parsePgn(text: string): PgnGame {
  const game: PgnGame = { comment: "", children: [] };
  // last is the move just read, before is the move it was played after.
  // A variation is an alternative to last, so it continues from before.
  let before: Node = game;
  let last: Node = game;
  const open: { before: Node; last: Node }[] = [];

  for (const [token] of text.replace(HEADER_LINE, "").matchAll(TOKEN)) {
    if (RESULTS.has(token)) break;
    if (token.startsWith(";")) continue;

    if (token.startsWith("{")) {
      addNote(last, token.slice(1, -1));
    } else if (token === "(") {
      open.push({ before, last });
      last = before;
    } else if (token === ")") {
      const outer = open.pop();
      if (outer) ({ before, last } = outer);
    } else {
      const san = sanOf(token);
      if (!san) continue;
      const move: PgnMove = { san, comment: "", children: [] };
      last.children.push(move);
      before = last;
      last = move;
    }
  }
  return game;
}

export function countMoves(node: PgnGame | PgnMove): number {
  return node.children.reduce((sum, child) => sum + 1 + countMoves(child), 0);
}
