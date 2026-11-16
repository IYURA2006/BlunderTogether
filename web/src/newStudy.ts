// Starting a new study with an opening or a game already in it. The load is
// kept for the next page, because a new study means a new link, and the page
// starts over when the link changes.
import type { MoveId } from "@blunder/core";
import { ROOT_ID } from "@blunder/core";
import { OPENINGS } from "./openings/list";
import { openingLine } from "./openings/openings";
import { importMessage, importPgn } from "./pgn/import";
import type { Room } from "./room";
import { newRoomId } from "./roomId";

export type StudyLoad = { kind: "opening"; name: string } | { kind: "pgn"; text: string };

const KEY = "blunder-load-into-new-study";

export function startNewStudy(load: StudyLoad): void {
  sessionStorage.setItem(KEY, JSON.stringify(load));
  window.location.hash = newRoomId();
}

// Returns the waiting load once and forgets it, so a reload does not repeat it.
export function takeWaitingLoad(): StudyLoad | null {
  try {
    const saved = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return saved === null ? null : (JSON.parse(saved) as StudyLoad);
  } catch {
    return null;
  }
}

export interface Loaded {
  moveId: MoveId; // where the board should stand afterwards
  message: string;
}

export async function loadInto(room: Room, load: StudyLoad): Promise<Loaded> {
  if (load.kind === "pgn") {
    const result = await importPgn(room, load.text);
    return { moveId: result.ok ? result.lastId : ROOT_ID, message: importMessage(result) };
  }
  const opening = OPENINGS.find((candidate) => candidate.name === load.name);
  if (!opening) return { moveId: ROOT_ID, message: "" };
  return { moveId: await room.playLine(ROOT_ID, openingLine(opening)), message: "" };
}
