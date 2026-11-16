// Loading a named opening and naming the opening a line has reached.
import { chessRules, uciOfSan } from "../chess/rules";
import { OPENINGS } from "./list";
import type { Opening } from "./list";

interface Played {
  line: string[]; // UCI moves
  position: string; // FEN after the last move
}

function play(opening: Opening): Played {
  const line: string[] = [];
  let position = chessRules.start;
  for (const san of opening.moves.split(" ")) {
    const uci = uciOfSan(position, san);
    const after = uci === null ? null : chessRules.play(position, uci);
    if (uci === null || after === null) {
      throw new Error(`${opening.name}: ${san} is not a legal move`);
    }
    line.push(uci);
    position = after;
  }
  return { line, position };
}

// The opening's moves in UCI, ready to be played into a room.
export function openingLine(opening: Opening): string[] {
  return play(opening).line;
}

// A one-move opening is only a name; loading it would save one click.
export const menuOpenings: Opening[] = OPENINGS.filter((o) => o.moves.includes(" ")).sort((a, b) =>
  a.name.localeCompare(b.name),
);

// Two move orders that reach the same position are the same opening, so
// names are looked up by position. The move counters at the end of a FEN
// differ between such orders and are left out.
function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

const nameByPosition = new Map(
  OPENINGS.map((opening) => [positionKey(play(opening).position), opening.name]),
);

// positions run from the current move back to the start. The first one that
// is a known opening is the most specific name the line has earned.
export function openingNameFor(positions: string[]): string | null {
  for (const position of positions) {
    const name = nameByPosition.get(positionKey(position));
    if (name !== undefined) return name;
  }
  return null;
}

// The positions from a move back to the start of the study.
export function positionsBackFrom(
  visible: ReadonlyMap<string, { parentId: string | null; position: string }>,
  moveId: string,
): string[] {
  const positions: string[] = [];
  let node = visible.get(moveId);
  while (node) {
    positions.push(node.position);
    node = node.parentId === null ? undefined : visible.get(node.parentId);
  }
  return positions;
}
