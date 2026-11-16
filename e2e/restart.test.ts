import { addMove, ROOT_ID } from "@blunder/core";
import { afterEach, beforeEach, expect, inject, test } from "vitest";
import { createRng } from "../core/sim/rng";
import { newRoomId } from "../web/src/roomId";
import { allSynced, createTestClient, editRandomly, expectSameState, hint, seed } from "./client";
import type { TestClient } from "./client";
import { readLog } from "./rawSocket";
import { createTestServer } from "./server";
import type { TestServer } from "./server";
import { waitFor } from "./wait";

let server: TestServer;
let clients: TestClient[] = [];

beforeEach(async () => {
  server = await createTestServer(inject("serverBinary"));
});

afterEach(async () => {
  for (const client of clients) client.stop();
  clients = [];
  await server.dispose();
});

function join(roomId: string, replicaId: string): TestClient {
  const client = createTestClient(server.wsUrl, roomId, replicaId);
  clients.push(client);
  return client;
}

function unsent(group: TestClient[]): number {
  return group.reduce((sum, client) => sum + client.sync.status().unsent, 0);
}

test("clients converge after a server restart and no acknowledged operation is lost", async () => {
  await server.start();
  const rng = createRng(seed);
  const roomId = newRoomId();
  const trio = [join(roomId, "a"), join(roomId, "b"), join(roomId, "c")];
  await editRandomly(rng, trio, 30);
  await waitFor("the first edits to sync", () => allSynced(trio));
  const acknowledged = [...(trio[0] as TestClient).seen];

  await server.stop();
  await editRandomly(rng, trio, 30);
  await waitFor("edits made during the outage to queue up", () => unsent(trio) === 30);

  await server.start();
  await waitFor("all clients to sync after the restart", () => allSynced(trio));
  expectSameState(trio, hint);

  const fresh = join(roomId, "d");
  await waitFor("a fresh client to catch up", () => allSynced([...trio, fresh]));
  expectSameState([...trio, fresh], hint);
  expect(fresh.seen.size).toBe(60);
  expect(acknowledged.filter((opId) => !fresh.seen.has(opId))).toEqual([]);
});

test("an operation stored just before a crash is resent and kept exactly once", async () => {
  await server.start({ CRASH_AFTER_COMMIT: "1" });
  const roomId = newRoomId();
  const client = join(roomId, "a");

  const op = await client.edit((clock) => addMove(clock, ROOT_ID, "e2e4"));

  expect(await server.exited()).toBe(3);
  // The server stored the operation but died before the ack.
  expect(client.sync.status().unsent).toBe(1);

  await server.start();
  await waitFor("the client to resend and get its ack", () => client.sync.status().unsent === 0);

  const log = await readLog(server.wsUrl, roomId);
  expect(log.filter((entry) => entry.op.opId === op.opId)).toHaveLength(1);
});
