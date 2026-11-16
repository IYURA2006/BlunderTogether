// One tab per room. Two tabs would share one replica id and run the same
// Lamport clock twice, and two operations with one timestamp cannot be
// ordered. A lock that lets one tab in is simpler than coordinating them.
export function acquireRoomLock(roomId: string): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.locks.request(`blunder-room-${roomId}`, { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      // The lock is held for as long as the promise returned here is pending.
      // It never settles, so the browser frees the lock when the tab closes.
      return lock ? new Promise<never>(() => {}) : undefined;
    });
  });
}
