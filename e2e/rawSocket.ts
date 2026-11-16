import { randomUUID } from "node:crypto";
import { ROOT_ID, addMove, newClock } from "@blunder/core";
import type { Op } from "@blunder/core";
import WebSocket from "ws";
import type { SeqOp, ServerMessage } from "../web/src/sync/messages";
import { waitFor } from "./wait";

// A bare WebSocket connection, for sending messages the sync client never
// would and for reading the server's log directly.
export interface RawConnection {
  readonly messages: ServerMessage[]; // everything received so far
  send(message: unknown): void;
  isClosed(): boolean;
  close(): void;
}

export function openRaw(wsUrl: string): Promise<RawConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const messages: ServerMessage[] = [];
    let closed = false;
    ws.on("message", (data) => messages.push(JSON.parse(data.toString()) as ServerMessage));
    ws.on("close", () => (closed = true));
    ws.on("error", reject);
    ws.on("open", () => {
      resolve({
        messages,
        send: (message) => ws.send(JSON.stringify(message)),
        isClosed: () => closed,
        close: () => ws.close(),
      });
    });
  });
}

// A valid operation that did not come from a real client.
export function rawOp(opId: string, counter = 1): Op {
  return { ...addMove(newClock("raw", counter - 1), ROOT_ID, "e2e4"), opId };
}

// Reads a room's whole log over a fresh connection.
// The protocol has no "end of catch-up" message. A marker pushed after hello
// gets the highest seq and so arrives after everything stored before it.
export async function readLog(wsUrl: string, roomId: string): Promise<SeqOp[]> {
  const raw = await openRaw(wsUrl);
  const marker = rawOp(`marker-${randomUUID()}`);
  raw.send({ type: "hello", roomId, since: 0 });
  raw.send({ type: "push", ops: [marker] });

  const received = () => raw.messages.flatMap((m) => (m.type === "ops" ? m.ops : []));
  await waitFor("the end of the log", () => received().some((e) => e.op.opId === marker.opId));
  raw.close();
  return received().filter((entry) => entry.op.opId !== marker.opId);
}
