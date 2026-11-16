// Wires one room together in the browser: storage, state and sync.
import { openRoom } from "./room";
import type { Room } from "./room";
import { openIdbStore } from "./storage/idbStore";
import { createSyncClient } from "./sync/client";
import type { SyncClient, SyncStatus } from "./sync/types";
import { syncUrl } from "./sync/url";
import { createValueStore } from "./valueStore";
import type { ValueStore } from "./valueStore";

export interface Session {
  room: Room;
  sync: SyncClient;
  status: ValueStore<SyncStatus>;
}

export async function startSession(roomId: string): Promise<Session> {
  const store = await openIdbStore(roomId);
  const status = createValueStore<SyncStatus>({ connected: false, unsent: 0 });
  const room = await openRoom(store, (op) => sync.notifyLocalOp(op));
  const sync = createSyncClient({
    url: syncUrl(window.location, import.meta.env.VITE_SYNC_URL),
    roomId,
    store,
    onRemoteOps: room.applyRemoteOps,
    onStatus: status.set,
  });
  sync.start();
  return { room, sync, status };
}
