import { MAX_COMMENT_CHARS } from "./types";
import type { Op } from "./types";

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MAX_OP_ID_CHARS = 64;

// Shape check for operations that came from the network or from storage.
// The server stores whatever it is sent, so every replica must reject the
// same malformed values or they would end up with different states.
export function isOp(value: unknown): value is Op {
  if (!isRecord(value)) return false;
  if (typeof value.opId !== "string") return false;
  if (value.opId.length < 1 || value.opId.length > MAX_OP_ID_CHARS) return false;
  if (typeof value.replicaId !== "string") return false;
  if (!isTs(value.ts)) return false;

  switch (value.type) {
    case "addMove":
      return typeof value.parentId === "string" && isUci(value.uci);
    case "setMainline":
      return typeof value.parentId === "string" && typeof value.childId === "string";
    case "setDeleted":
      return typeof value.moveId === "string" && typeof value.deleted === "boolean";
    case "setComment":
      return typeof value.moveId === "string" && isCommentText(value.text);
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A counter outside the safe integer range would compare wrongly after a
// JSON round trip.
function isTs(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { counter, replicaId } = value;
  if (typeof counter !== "number" || !Number.isSafeInteger(counter) || counter < 0) return false;
  return typeof replicaId === "string";
}

function isUci(value: unknown): boolean {
  return typeof value === "string" && UCI_PATTERN.test(value);
}

function isCommentText(value: unknown): boolean {
  return typeof value === "string" && value.length <= MAX_COMMENT_CHARS;
}
