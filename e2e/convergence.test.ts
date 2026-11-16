import { afterEach, beforeEach, expect, inject, test } from "vitest";
import { randomOp } from "../core/sim/randomOp";
import { createRng } from "../core/sim/rng";
import { newRoomId } from "../web/src/roomId";
import { allSynced, createTestClient, editRandomly, expectSameState, hint, seed } from "./client";
import type { TestClient } from "./client";
import { createTestServer } from "./server";
import type { TestServer } from "./server";
import { letNetworkRun, waitFor } from "./wait";

let server: TestServer;
let clients: TestClient[] = [];

beforeEach(async () => {
  server = await createTestServer(inject("serverBinary"));
  await server.start();
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

test("three clients that edit while going offline and online converge", async () => {
  const rng = createRng(seed);
  const roomId = newRoomId();
  const trio = [join(roomId, "a"), join(roomId, "b"), join(roomId, "c")];

  for (let step = 0; step < 150; step++) {
    const client = rng.pick(trio);
    if (rng.chance(0.15)) {
      client.sync.setOffline(rng.chance(0.5));
    } else {
      await client.edit((clock) => randomOp(rng, client.state, clock));
    }
    await letNetworkRun();
  }

  for (const client of trio) client.sync.setOffline(false);
  await waitFor("all clients to sync", () => allSynced(trio));
  expectSameState(trio, hint);
});

test("a client that joins late with an empty store catches up", async () => {
  const rng = createRng(seed);
  const roomId = newRoomId();
  const early = [join(roomId, "a"), join(roomId, "b")];
  await editRandomly(rng, early, 40);
  await waitFor("the first two clients to sync", () => allSynced(early));

  const late = join(roomId, "c");
  await waitFor("the late client to catch up", () => allSynced([...early, late]));

  expect(late.seen.size).toBe(40);
  expectSameState([...early, late], hint);
});
