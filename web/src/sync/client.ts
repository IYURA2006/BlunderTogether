// Runs in the browser and in Node: it only touches the injected socket and
// store, never window or the DOM.
import { isOp } from "@blunder/core";
import type { Op } from "@blunder/core";
import { MAX_OPS_PER_PUSH } from "./messages";
import type { ClientMessage } from "./messages";
import type { SocketLike, SyncClient, SyncClientOptions, SyncStatus } from "./types";

const DEFAULT_BACKOFF_MS = { min: 500, max: 15000 };

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJson(data: unknown): unknown {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// The browser types its event handlers more narrowly than SocketLike does,
// so the compiler needs to be told that it fits.
function openBrowserSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}

export function createSyncClient(options: SyncClientOptions): SyncClient {
  const { url, roomId, store, onRemoteOps, onStatus } = options;
  const createSocket = options.createSocket ?? openBrowserSocket;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const random = options.random ?? Math.random;

  // Copy of the stored outbox. This tab is the only writer of the store, so
  // the copy stays exact. It makes status() synchronous and lets an operation
  // created while "hello" is being prepared still go out with the first push.
  const unsent = new Map<string, Op>();

  let started = false;
  let offline = false;
  let delayMs = 0;
  let socket: SocketLike | null = null;
  let helloSent = false;
  let failedAttempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  // Two queues, one per direction. Each message waits for its own delay and
  // for the message before it, so a changed delay can never reorder them.
  // The incoming queue also makes sure one message is fully handled, store
  // writes included, before the next one starts.
  let incoming: Promise<void> = Promise.resolve();
  let outgoing: Promise<void> = Promise.resolve();

  function status(): SyncStatus {
    return { connected: helloSent, unsent: unsent.size };
  }

  function report(): void {
    onStatus?.(status());
  }

  async function loadOutbox(): Promise<void> {
    for (const op of await store.loadOutbox()) unsent.set(op.opId, op);
    report();
  }

  function send(target: SocketLike, message: ClientMessage): void {
    const held = sleep(delayMs);
    outgoing = outgoing
      .then(() => held)
      .then(() => {
        // A message held for a connection that is gone is dropped. Nothing is
        // lost: operations stay in the outbox until the server acknowledges.
        if (socket === target) target.send(JSON.stringify(message));
      })
      .catch(() => lost(target));
  }

  async function sayHello(target: SocketLike): Promise<void> {
    await loadOutbox();
    const since = await store.loadCursor();
    if (socket !== target) return;

    failedAttempts = 0;
    send(target, { type: "hello", roomId, since });
    const ops = [...unsent.values()];
    for (let start = 0; start < ops.length; start += MAX_OPS_PER_PUSH) {
      send(target, { type: "push", ops: ops.slice(start, start + MAX_OPS_PER_PUSH) });
    }
    helloSent = true;
    report();
  }

  async function handleOps(entries: unknown[]): Promise<void> {
    const ops: Op[] = [];
    let cursor = 0;
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const { seq, op } = entry;
      if (typeof seq !== "number" || !Number.isSafeInteger(seq)) continue;
      // The cursor moves past an operation that fails the shape check too.
      // Otherwise the client would ask for it again on every connection.
      cursor = Math.max(cursor, seq);
      if (isOp(op)) ops.push(op);
    }
    if (cursor === 0) return;

    // Saved first: the server never resends anything below the cursor, so
    // the caller must not see operations that a crash could still lose.
    await store.saveReceivedOps(ops, cursor);
    if (ops.length > 0) onRemoteOps(ops);
  }

  async function handleAck(opIds: unknown[]): Promise<void> {
    const ids = opIds.filter((id) => typeof id === "string");
    await store.removeFromOutbox(ids);
    for (const id of ids) unsent.delete(id);
    report();
  }

  async function handleMessage(source: SocketLike, data: unknown): Promise<void> {
    if (socket !== source) return;
    const message = parseJson(data);
    if (!isRecord(message)) return;
    if (message.type === "ops" && Array.isArray(message.ops)) await handleOps(message.ops);
    if (message.type === "ack" && Array.isArray(message.opIds)) await handleAck(message.opIds);
    // After an "error" the server closes the connection, which is handled
    // like any other close.
  }

  function receive(source: SocketLike, data: unknown): void {
    const held = sleep(delayMs);
    incoming = incoming
      .then(() => held)
      .then(() => handleMessage(source, data))
      // If a message could not be stored, later ones must not be either:
      // they would move the cursor past the one that failed. Reconnecting
      // fetches everything again from the last saved cursor.
      .catch(() => lost(source));
  }

  function disconnect(): void {
    const old = socket;
    socket = null;
    helloSent = false;
    old?.close();
    report();
  }

  function lost(source: SocketLike): void {
    if (socket !== source) return;
    disconnect();
    scheduleReconnect();
  }

  function scheduleReconnect(): void {
    if (!started || offline) return;
    const ceiling = Math.min(backoffMs.max, backoffMs.min * 2 ** failedAttempts);
    failedAttempts += 1;
    // Half of the wait is random, so clients cut off by the same outage do
    // not all come back in the same instant.
    const wait = ceiling / 2 + (random() * ceiling) / 2;
    retryTimer = setTimeout(connect, wait);
  }

  function connect(): void {
    const created = createSocket(url);
    socket = created;
    created.onopen = () => {
      sayHello(created).catch(() => lost(created));
    };
    created.onmessage = (event) => receive(created, event.data);
    created.onclose = () => lost(created);
    // A close event always follows an error, and that is where the retry
    // starts. The handler exists because the Node "ws" socket throws on an
    // error nobody listens to.
    created.onerror = () => {};
  }

  return {
    start() {
      if (started) return;
      started = true;
      // Only for the unsent count shown while offline. If this read fails,
      // the outbox is read again before the first push.
      loadOutbox().catch(() => {});
      if (!offline) connect();
    },

    stop() {
      started = false;
      clearTimeout(retryTimer);
      disconnect();
    },

    notifyLocalOp(op) {
      unsent.set(op.opId, op);
      if (socket && helloSent) send(socket, { type: "push", ops: [op] });
      report();
    },

    setOffline(value) {
      if (offline === value) return;
      offline = value;
      clearTimeout(retryTimer);
      if (offline) {
        disconnect();
      } else if (started) {
        failedAttempts = 0;
        connect();
      }
    },

    setDelayMs(ms) {
      delayMs = ms;
    },

    status,
  };
}
