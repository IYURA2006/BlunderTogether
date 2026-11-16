// Seeded random numbers (mulberry32). The same seed always gives the same
// sequence, so a failing run can be replayed exactly.
export interface Rng {
  next(): number; // in [0, 1)
  int(n: number): number; // integer in [0, n)
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;

  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(n: number): number {
    return Math.floor(next() * n);
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from an empty list");
    return items[int(items.length)] as T;
  }

  function chance(p: number): boolean {
    return next() < p;
  }

  return { next, int, pick, chance };
}
