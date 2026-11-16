// The smallest store React's useSyncExternalStore can read: one value and
// the listeners to call when it is replaced.
export interface ValueStore<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(value) {
      current = value;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
