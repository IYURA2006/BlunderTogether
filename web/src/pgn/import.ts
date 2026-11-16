// Plays a PGN game into a room. Every move goes through the same room
// actions as a click on the board, so an import merges like any other edit.
import { ROOT_ID } from "@blunder/core";
import type { MoveId } from "@blunder/core";
import { chessRules, uciOfSan } from "../chess/rules";
import type { Room } from "../room";
import { countMoves, parsePgn } from "./parse";
import type { PgnGame, PgnMove } from "./parse";

// One paste must not be able to flood the room's log.
export const MAX_PGN_CHARS = 200_000;
export const MAX_PGN_MOVES = 2_000;

export type ImportResult =
  { ok: false; problem: string } | { ok: true; added: number; unreadable: number; lastId: MoveId };

function read(text: string): { game: PgnGame } | { problem: string } {
  if (text.length > MAX_PGN_CHARS) return { problem: "This text is too long to import." };
  const game = parsePgn(text);
  const total = countMoves(game);
  // The parser takes any word for a move. If no first move is legal, the
  // text is not a game and nothing in it could be placed on the board.
  const readable = game.children.some((move) => uciOfSan(chessRules.start, move.san) !== null);
  if (!readable) return { problem: "No moves were found in this text." };
  if (total > MAX_PGN_MOVES) {
    return { problem: `A study can take ${MAX_PGN_MOVES} moves in one import.` };
  }
  return { game };
}

// Why the text cannot be imported, or null if it can.
export function pgnProblem(text: string): string | null {
  const result = read(text);
  return "problem" in result ? result.problem : null;
}

export async function importPgn(room: Room, text: string): Promise<ImportResult> {
  const result = read(text);
  if ("problem" in result) return { ok: false, problem: result.problem };
  const { game } = result;

  const shownBefore = room.view().visible.size;
  let unreadable = 0;
  let lastId = ROOT_ID;

  // A note is added only where there is none: an import never replaces
  // what someone in the room wrote.
  async function addNote(id: MoveId, note: string): Promise<void> {
    if (note && room.view().visible.get(id)?.comment === "") await room.setComment(id, note);
  }

  async function addMoves(
    parentId: MoveId,
    fen: string,
    moves: PgnMove[],
    main: boolean,
  ): Promise<void> {
    for (const [index, move] of moves.entries()) {
      const uci = uciOfSan(fen, move.san);
      const after = uci === null ? null : chessRules.play(fen, uci);
      if (uci === null || after === null) {
        // Nothing after an unreadable move can be placed on the board.
        unreadable += 1 + countMoves(move);
        continue;
      }
      const id = await room.playMove(parentId, uci);
      await addNote(id, move.comment);
      const onMainLine = main && index === 0;
      if (onMainLine) lastId = id;
      await addMoves(id, after, move.children, onMainLine);
    }
  }

  await addNote(ROOT_ID, game.comment);
  await addMoves(ROOT_ID, chessRules.start, game.children, true);
  return { ok: true, added: room.view().visible.size - shownBefore, unreadable, lastId };
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function importMessage(result: ImportResult): string {
  if (!result.ok) return result.problem;
  const added =
    result.added === 0
      ? "Every move was already in the study."
      : `Added ${count(result.added, "move")}.`;
  if (result.unreadable === 0) return added;
  return `${added} ${count(result.unreadable, "move")} could not be read.`;
}
