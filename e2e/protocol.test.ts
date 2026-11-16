import { afterEach, beforeEach, expect, inject, test } from "vitest";
import type { ServerMessage } from "../web/src/sync/messages";
import { newRoomId } from "../web/src/roomId";
import { openRaw, rawOp, readLog } from "./rawSocket";
import type { RawConnection } from "./rawSocket";
import { createTestServer } from "./server";
import type { TestServer } from "./server";
import { waitFor } from "./wait";

let server: TestServer;
let connections: RawConnection[] = [];

beforeEach(async () => {
  server = await createTestServer(inject("serverBinary"));
  await server.start();
});

afterEach(async () => {
  for (const connection of connections) connection.close();
  connections = [];
  await server.dispose();
});

async function connect(): Promise<RawConnection> {
  const connection = await openRaw(server.wsUrl);
  connections.push(connection);
  return connection;
}

async function firstMessage(connection: RawConnection): Promise<ServerMessage | undefined> {
  await waitFor("a message from the server", () => connection.messages.length > 0);
  return connection.messages[0];
}

test("a push before hello is rejected with hello_required", async () => {
  const raw = await connect();
  raw.send({ type: "push", ops: [rawOp("op-1")] });

  expect(await firstMessage(raw)).toMatchObject({ type: "error", code: "hello_required" });
});

test("a room id that does not match the pattern is rejected with bad_room", async () => {
  const raw = await connect();
  raw.send({ type: "hello", roomId: "too-short", since: 0 });

  expect(await firstMessage(raw)).toMatchObject({ type: "error", code: "bad_room" });
});

test("a push with more than 200 operations is rejected with too_many_ops", async () => {
  const raw = await connect();
  const ops = Array.from({ length: 201 }, (_, i) => rawOp(`op-${i}`, i + 1));
  raw.send({ type: "hello", roomId: newRoomId(), since: 0 });
  raw.send({ type: "push", ops });

  expect(await firstMessage(raw)).toMatchObject({ type: "error", code: "too_many_ops" });
});

test("the server closes the connection after an error", async () => {
  const raw = await connect();
  raw.send({ type: "push", ops: [rawOp("op-1")] });

  await waitFor("the connection to close", () => raw.isClosed());
});

test("an operation pushed twice is acked twice and stored once", async () => {
  const roomId = newRoomId();
  const op = rawOp("op-1");
  const raw = await connect();
  raw.send({ type: "hello", roomId, since: 0 });
  raw.send({ type: "push", ops: [op] });
  raw.send({ type: "push", ops: [op] });

  const acks = () => raw.messages.filter((m) => m.type === "ack");
  await waitFor("two acks", () => acks().length === 2);
  expect(acks()).toEqual([
    { type: "ack", opIds: ["op-1"] },
    { type: "ack", opIds: ["op-1"] },
  ]);

  const log = await readLog(server.wsUrl, roomId);
  expect(log).toEqual([{ seq: 1, op }]);
});
