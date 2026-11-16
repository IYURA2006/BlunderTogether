import type { Rng } from "./rng";

interface Packet<T> {
  from: number;
  to: number;
  message: T;
}

export interface Network<T> {
  send(from: number, to: number, message: T): void;
  broadcast(from: number, message: T): void;

  // Delivers one waiting message, chosen at random among those whose sender
  // and receiver are both reachable. Returns false if nothing could move.
  deliverOne(): boolean;

  // A cut replica neither sends nor receives. Its messages wait.
  setCut(replica: number, cut: boolean): void;
  healAll(): void;

  // Delivers until nothing is waiting. Call after healAll.
  deliverAll(): void;
  waiting(): number;
}

const DUPLICATE_CHANCE = 0.1;

export function createNetwork<T>(
  rng: Rng,
  replicaCount: number,
  deliver: (to: number, message: T) => void,
): Network<T> {
  const packets: Packet<T>[] = [];
  const cut = new Array<boolean>(replicaCount).fill(false);

  function send(from: number, to: number, message: T): void {
    packets.push({ from, to, message });
  }

  function broadcast(from: number, message: T): void {
    for (let to = 0; to < replicaCount; to++) {
      if (to !== from) send(from, to, message);
    }
  }

  // Delivery picks at random, so queue order carries no meaning and the
  // last packet can fill the hole.
  function remove(index: number): void {
    const last = packets.pop();
    if (last !== undefined && index < packets.length) packets[index] = last;
  }

  function deliverOne(): boolean {
    if (packets.length === 0) return false;
    const start = rng.int(packets.length);
    for (let i = 0; i < packets.length; i++) {
      const index = (start + i) % packets.length;
      const packet = packets[index] as Packet<T>;
      if (cut[packet.from] || cut[packet.to]) continue;
      // A duplicated packet stays in the queue and arrives again later.
      if (!rng.chance(DUPLICATE_CHANCE)) remove(index);
      deliver(packet.to, packet.message);
      return true;
    }
    return false;
  }

  function setCut(replica: number, value: boolean): void {
    cut[replica] = value;
  }

  function healAll(): void {
    cut.fill(false);
  }

  function deliverAll(): void {
    while (deliverOne());
  }

  return {
    send,
    broadcast,
    deliverOne,
    setCut,
    healAll,
    deliverAll,
    waiting: () => packets.length,
  };
}
