import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ROOT_ID, addMove, newClock } from "@blunder/core";
import type { Op } from "@blunder/core";
import { createSyncClient } from "./client";
import { createMemoryStore } from "./memoryStore";
import { MAX_OPS_PER_PUSH } from "./messages";
import type { ClientMessage, ServerMessage } from "./messages";
import type { SocketLike, Store, SyncStatus } from "./types";

class FakeSocket implements SocketLike {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: ClientMessage[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.closed = true;
  }

  // What the server side of the connection would do.
  accept(): void {
    this.onopen?.({});
  }

  deliver(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  drop(): void {
    this.closed = true;
    this.onclose?.({});
  }
}

const remote = newClock("remote");
const local = newClock("local");

function remoteOp(): Op {
  return addMove(remote, ROOT_ID, "e2e4");
}

async function savedLocalOps(store: Store, count: number): Promise<Op[]> {
  const ops = Array.from({ length: count }, () => addMove(local, ROOT_ID, "d2d4"));
  for (const op of ops) await store.saveLocalOp(op);
  return ops;
}

function setup(store: Store = createMemoryStore("local")) {
  const sockets: FakeSocket[] = [];
  const received: Op[][] = [];
  const statuses: SyncStatus[] = [];
  const client = createSyncClient({
    url: "ws://test/ws",
    roomId: "room-for-sync-tests",
    store,
    onRemoteOps: (ops) => received.push(ops),
    onStatus: (status) => statuses.push(status),
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    backoffMs: { min: 100, max: 1000 },
    random: () => 1,
  });
  return { client, store, sockets, received, statuses };
}

// Lets pending promises and zero-length timers run.
const settle = () => vi.advanceTimersByTimeAsync(0);

async function connected(store?: Store) {
  const context = setup(store);
  context.client.start();
  context.sockets[0]!.accept();
  await settle();
  return { ...context, socket: context.sockets[0]! };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("hello is the first message and carries the stored cursor", async () => {
  const store = createMemoryStore("local");
  await store.saveReceivedOps([], 41);
  const { socket, client } = await connected(store);

  expect(socket.sent).toEqual([{ type: "hello", roomId: "room-for-sync-tests", since: 41 }]);
  expect(client.status()).toEqual({ connected: true, unsent: 0 });
});

test("nothing is sent before the socket is open", async () => {
  const { client, sockets } = setup();
  client.start();
  await settle();
  expect(sockets).toHaveLength(1);
  expect(sockets[0]!.sent).toEqual([]);
  expect(client.status().connected).toBe(false);
});

test("the whole outbox is pushed after hello, in order, in chunks", async () => {
  const store = createMemoryStore("local");
  const ops = await savedLocalOps(store, 2 * MAX_OPS_PER_PUSH + 50);
  const { socket } = await connected(store);

  expect(socket.sent.map((message) => message.type)).toEqual(["hello", "push", "push", "push"]);
  const pushed = socket.sent.flatMap((message) => (message.type === "push" ? [message.ops] : []));
  expect(pushed.map((chunk) => chunk.length)).toEqual([MAX_OPS_PER_PUSH, MAX_OPS_PER_PUSH, 50]);
  expect(pushed.flat()).toEqual(ops);
});

test("an ack removes the operations from the outbox", async () => {
  const store = createMemoryStore("local");
  const [first, second] = await savedLocalOps(store, 2);
  const { socket, client, statuses } = await connected(store);
  expect(client.status().unsent).toBe(2);

  socket.deliver({ type: "ack", opIds: [first!.opId] });
  await settle();

  expect(await store.loadOutbox()).toEqual([second]);
  expect(client.status().unsent).toBe(1);
  expect(statuses.at(-1)).toEqual({ connected: true, unsent: 1 });
});

test("the unsent count is known before the first connection", async () => {
  const store = createMemoryStore("local");
  await savedLocalOps(store, 3);
  const { client } = setup(store);
  client.setOffline(true);
  client.start();
  await settle();
  expect(client.status()).toEqual({ connected: false, unsent: 3 });
});

test("a local operation is pushed at once when connected", async () => {
  const { socket, client, store } = await connected();
  const [op] = await savedLocalOps(store, 1);
  client.notifyLocalOp(op!);
  await settle();

  expect(socket.sent.at(-1)).toEqual({ type: "push", ops: [op] });
  expect(client.status().unsent).toBe(1);
});

test("a local operation made while disconnected goes out with the next connection", async () => {
  const { client, store, sockets } = setup();
  client.start();
  const [op] = await savedLocalOps(store, 1);
  client.notifyLocalOp(op!);
  expect(client.status()).toEqual({ connected: false, unsent: 1 });

  sockets[0]!.accept();
  await settle();
  expect(sockets[0]!.sent.at(-1)).toEqual({ type: "push", ops: [op] });
});

test("received operations and the cursor are saved before onRemoteOps runs", async () => {
  const store = createMemoryStore("local");
  const seen: { cursor: Promise<number>; log: Promise<Op[]> }[] = [];
  const sockets: FakeSocket[] = [];
  const client = createSyncClient({
    url: "ws://test/ws",
    roomId: "room-for-sync-tests",
    store,
    onRemoteOps: () => seen.push({ cursor: store.loadCursor(), log: store.loadLog() }),
    createSocket: () => {
      sockets.push(new FakeSocket());
      return sockets.at(-1)!;
    },
  });
  client.start();
  sockets[0]!.accept();
  await settle();

  const ops = [remoteOp(), remoteOp()];
  sockets[0]!.deliver({
    type: "ops",
    ops: [
      { seq: 7, op: ops[0]! },
      { seq: 8, op: ops[1]! },
    ],
  });
  await settle();

  expect(seen).toHaveLength(1);
  expect(await seen[0]!.cursor).toBe(8);
  // The log comes back in opId order, not in the order of arrival.
  expect(await seen[0]!.log).toHaveLength(2);
  expect(await seen[0]!.log).toEqual(expect.arrayContaining(ops));
});

test("an operation with a bad shape is skipped but the cursor still moves past it", async () => {
  const { socket, store, received } = await connected();
  const good = remoteOp();
  const bad = { ...remoteOp(), uci: "castle" };
  socket.deliver({
    type: "ops",
    ops: [
      { seq: 1, op: good },
      { seq: 2, op: bad },
    ],
  });
  await settle();

  expect(received).toEqual([[good]]);
  expect(await store.loadLog()).toEqual([good]);
  expect(await store.loadCursor()).toBe(2);
});

test("messages that are not valid protocol messages are ignored", async () => {
  const { socket, store, received, client } = await connected();
  for (const data of ["not json", "null", '{"type":"ops"}', '{"type":"ack","opIds":7}', 42]) {
    socket.onmessage?.({ data });
  }
  socket.deliver({ type: "error", code: "bad_message", message: "test" });
  await settle();

  expect(received).toEqual([]);
  expect(await store.loadCursor()).toBe(0);
  expect(client.status().connected).toBe(true);
});

test("messages are handled one at a time, in the order they arrived", async () => {
  const store = createMemoryStore("local");
  const events: string[] = [];
  const save = store.saveReceivedOps;
  store.saveReceivedOps = async (ops, cursor) => {
    events.push(`save ${cursor} starts`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await save(ops, cursor);
    events.push(`save ${cursor} ends`);
  };
  const { socket } = await connected(store);

  socket.deliver({ type: "ops", ops: [{ seq: 1, op: remoteOp() }] });
  socket.deliver({ type: "ops", ops: [{ seq: 2, op: remoteOp() }] });
  await vi.advanceTimersByTimeAsync(200);

  expect(events).toEqual(["save 1 starts", "save 1 ends", "save 2 starts", "save 2 ends"]);
});

test("when saving fails the connection is dropped and the cursor stays", async () => {
  const store = createMemoryStore("local");
  const save = store.saveReceivedOps;
  store.saveReceivedOps = async (ops, cursor) => {
    if (cursor === 1) throw new Error("disk full");
    await save(ops, cursor);
  };
  const { socket, sockets, received } = await connected(store);

  socket.deliver({ type: "ops", ops: [{ seq: 1, op: remoteOp() }] });
  socket.deliver({ type: "ops", ops: [{ seq: 2, op: remoteOp() }] });
  await settle();

  expect(socket.closed).toBe(true);
  expect(received).toEqual([]);
  expect(await store.loadCursor()).toBe(0);

  await vi.advanceTimersByTimeAsync(100);
  sockets[1]!.accept();
  await settle();
  expect(sockets[1]!.sent[0]).toMatchObject({ type: "hello", since: 0 });
});

test("after a close the client reconnects, waiting longer each time up to the maximum", async () => {
  const { client, sockets } = setup();
  client.start();

  // random() is 1 here, so each wait is the full step: 100, 200, 400, 800, 1000.
  for (const wait of [100, 200, 400, 800, 1000, 1000]) {
    const before = sockets.length;
    sockets.at(-1)!.drop();
    await vi.advanceTimersByTimeAsync(wait - 1);
    expect(sockets).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(before + 1);
  }
});

test("jitter makes the wait anything from half the step to the whole step", async () => {
  const sockets: FakeSocket[] = [];
  const client = createSyncClient({
    url: "ws://test/ws",
    roomId: "room-for-sync-tests",
    store: createMemoryStore("local"),
    onRemoteOps: () => {},
    createSocket: () => {
      sockets.push(new FakeSocket());
      return sockets.at(-1)!;
    },
    backoffMs: { min: 100, max: 1000 },
    random: () => 0,
  });
  client.start();
  sockets[0]!.drop();
  await vi.advanceTimersByTimeAsync(49);
  expect(sockets).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(sockets).toHaveLength(2);
});

test("a successful connection resets the backoff and resends hello and the outbox", async () => {
  const store = createMemoryStore("local");
  const [op] = await savedLocalOps(store, 1);
  const { client, sockets } = setup(store);
  client.start();
  sockets[0]!.drop();
  await vi.advanceTimersByTimeAsync(100);
  sockets[1]!.drop();
  await vi.advanceTimersByTimeAsync(200);

  sockets[2]!.accept();
  await settle();
  sockets[2]!.deliver({ type: "ops", ops: [{ seq: 5, op: remoteOp() }] });
  await settle();
  sockets[2]!.drop();
  expect(client.status().connected).toBe(false);

  await vi.advanceTimersByTimeAsync(100);
  expect(sockets).toHaveLength(4);
  sockets[3]!.accept();
  await settle();
  expect(sockets[3]!.sent).toEqual([
    { type: "hello", roomId: "room-for-sync-tests", since: 5 },
    { type: "push", ops: [op] },
  ]);
});

test("offline closes the socket and blocks reconnects until switched back", async () => {
  const { socket, sockets, client, statuses } = await connected();

  client.setOffline(true);
  expect(socket.closed).toBe(true);
  expect(statuses.at(-1)).toEqual({ connected: false, unsent: 0 });

  socket.onclose?.({});
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets).toHaveLength(1);

  client.setOffline(false);
  expect(sockets).toHaveLength(2);
  sockets[1]!.accept();
  await settle();
  expect(client.status().connected).toBe(true);
});

test("going offline cancels a reconnect that was already scheduled", async () => {
  const { client, sockets } = setup();
  client.start();
  sockets[0]!.drop();
  client.setOffline(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets).toHaveLength(1);
});

test("stop closes the socket and does not reconnect", async () => {
  const { socket, sockets, client } = await connected();
  client.stop();
  expect(socket.closed).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets).toHaveLength(1);
});

test("delay holds outgoing messages and keeps their order when the delay changes", async () => {
  const { socket, client, store } = await connected();
  const [first, second] = await savedLocalOps(store, 2);
  const sentBefore = socket.sent.length;

  client.setDelayMs(1000);
  client.notifyLocalOp(first!);
  await vi.advanceTimersByTimeAsync(10);
  client.setDelayMs(0);
  client.notifyLocalOp(second!);

  await vi.advanceTimersByTimeAsync(989);
  expect(socket.sent).toHaveLength(sentBefore);

  await vi.advanceTimersByTimeAsync(1);
  expect(socket.sent.slice(sentBefore)).toEqual([
    { type: "push", ops: [first] },
    { type: "push", ops: [second] },
  ]);
});

test("delay holds incoming messages and keeps their order when the delay changes", async () => {
  const { socket, client, received } = await connected();
  const [first, second] = [remoteOp(), remoteOp()];

  client.setDelayMs(1000);
  socket.deliver({ type: "ops", ops: [{ seq: 1, op: first }] });
  await vi.advanceTimersByTimeAsync(10);
  client.setDelayMs(0);
  socket.deliver({ type: "ops", ops: [{ seq: 2, op: second }] });

  await vi.advanceTimersByTimeAsync(989);
  expect(received).toEqual([]);

  await vi.advanceTimersByTimeAsync(1);
  expect(received).toEqual([[first], [second]]);
});

test("hello is delayed too, and still goes out before the outbox", async () => {
  const store = createMemoryStore("local");
  await savedLocalOps(store, 1);
  const { client, sockets } = setup(store);
  client.setDelayMs(500);
  client.start();
  sockets[0]!.accept();

  await vi.advanceTimersByTimeAsync(499);
  expect(sockets[0]!.sent).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(sockets[0]!.sent.map((message) => message.type)).toEqual(["hello", "push"]);
});

test("a message still held when the connection drops is not sent on the old socket", async () => {
  const { socket, client, store, sockets } = await connected();
  const [op] = await savedLocalOps(store, 1);
  const sentBefore = socket.sent.length;

  client.setDelayMs(1000);
  client.notifyLocalOp(op!);
  socket.drop();
  client.setDelayMs(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(socket.sent).toHaveLength(sentBefore);

  sockets[1]!.accept();
  await settle();
  expect(sockets[1]!.sent.at(-1)).toEqual({ type: "push", ops: [op] });
});
