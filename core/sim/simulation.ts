import { apply as realApply, canonicalize } from "../src/index";
import type { Op } from "../src/index";
import { createNetwork } from "./network";
import { randomOp } from "./randomOp";
import { Replica } from "./replica";
import type { ApplyFn, RestoreCounter } from "./replica";
import { createRng } from "./rng";

const REPLICA_COUNT = 5;

export interface SimulationOptions {
  seed: number;
  operations?: number;
  apply?: ApplyFn;
  restoreCounter?: RestoreCounter;
}

export interface SimulationResult {
  converged: boolean;
  canonical: string[]; // one per replica
  ops: Op[]; // every operation, in the order it was created
}

// One run: replicas create operations while the network delays, reorders and
// duplicates them, replicas drop off and come back, and replicas restart.
// At the end everything is delivered and the replicas are compared.
export function runSimulation(options: SimulationOptions): SimulationResult {
  const { seed, operations = 200, apply = realApply, restoreCounter } = options;
  const rng = createRng(seed);
  const replicas: Replica[] = [];
  for (let i = 0; i < REPLICA_COUNT; i++) {
    replicas.push(new Replica(`r${i}`, apply, restoreCounter));
  }
  const network = createNetwork<Op>(rng, REPLICA_COUNT, (to, op) => {
    (replicas[to] as Replica).receive(op);
  });
  const ops: Op[] = [];

  while (ops.length < operations) {
    const index = rng.int(REPLICA_COUNT);
    const replica = replicas[index] as Replica;
    const roll = rng.int(100);
    if (roll < 30) {
      const op = replica.createLocal((clock, state) => randomOp(rng, state, clock));
      ops.push(op);
      network.broadcast(index, op);
    } else if (roll < 90) {
      network.deliverOne();
    } else if (roll < 95) {
      network.setCut(index, rng.chance(0.5));
    } else {
      replica.restart();
    }
  }

  network.healAll();
  network.deliverAll();

  const canonical = replicas.map((replica) => canonicalize(replica.state));
  const converged = canonical.every((text) => text === canonical[0]);
  return { converged, canonical, ops };
}

// The first seed below `limit` for which the replicas end up different.
export function firstDivergingSeed(
  limit: number,
  options: Omit<SimulationOptions, "seed">,
): number | null {
  for (let seed = 0; seed < limit; seed++) {
    if (!runSimulation({ ...options, seed }).converged) return seed;
  }
  return null;
}

// True if two different operations carry the same timestamp.
export function hasReusedTs(ops: Op[]): boolean {
  const seen = new Set<string>();
  for (const op of ops) {
    const key = `${op.ts.counter}@${op.ts.replicaId}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
