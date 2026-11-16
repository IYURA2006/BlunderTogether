// Mirrors docs/PROTOCOL.md and server/protocol.go.
import type { Op } from "@blunder/core";

export type ClientMessage =
  { type: "hello"; roomId: string; since: number } | { type: "push"; ops: Op[] };

export interface SeqOp {
  seq: number;
  op: Op;
}

export type ErrorCode = "bad_message" | "bad_room" | "hello_required" | "too_many_ops";

export type ServerMessage =
  | { type: "ops"; ops: SeqOp[] }
  | { type: "ack"; opIds: string[] }
  | { type: "error"; code: ErrorCode; message: string };

export const MAX_OPS_PER_PUSH = 200;
export const MAX_OPS_PER_MESSAGE = 500;
export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
