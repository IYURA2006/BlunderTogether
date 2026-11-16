import type { Op } from "@blunder/core";

// Durable storage for one room on one device.
export interface Store {
  // Returns this device's id for the room, creating it on first use.
  loadReplicaId(): Promise<string>;
  loadLog(): Promise<Op[]>;
  loadOutbox(): Promise<Op[]>; // oldest first
  loadCursor(): Promise<number>; // 0 when nothing was received yet

  // Log and outbox in one transaction.
  saveLocalOp(op: Op): Promise<void>;

  // Log and cursor in one transaction. Operations already in the log are
  // skipped, so the cursor is never saved ahead of the operations it covers.
  saveReceivedOps(ops: Op[], cursor: number): Promise<void>;

  removeFromOutbox(opIds: string[]): Promise<void>;
}

// The part of WebSocket the client uses. Browser WebSocket and the Node "ws"
// package both fit.
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface SyncStatus {
  connected: boolean;
  unsent: number;
}

export interface SyncClientOptions {
  url: string; // ws:// or wss:// address of the /ws endpoint
  roomId: string;
  store: Store;

  // Called after received operations are saved. The caller applies them to
  // state and observes their timestamps. May include operations seen before.
  onRemoteOps(ops: Op[]): void;
  onStatus?(status: SyncStatus): void;

  createSocket?(url: string): SocketLike; // default: browser WebSocket
  backoffMs?: { min: number; max: number }; // default: 500 to 15000
  random?(): number; // default: Math.random, used for jitter
}

export interface SyncClient {
  start(): void;
  stop(): void;

  // Call after store.saveLocalOp so the operation is sent when connected.
  notifyLocalOp(op: Op): void;

  // Offline closes the socket and blocks reconnects until switched back.
  setOffline(offline: boolean): void;

  // Holds every incoming and outgoing message this long before delivery.
  setDelayMs(ms: number): void;

  status(): SyncStatus;
}
