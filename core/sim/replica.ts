import { clockFromLog, emptyState, newClock, observe } from "../src/index";
import type { Clock, Op, ReplicaId, State } from "../src/index";

export type ApplyFn = (state: State, op: Op) => void;

// Chooses the Lamport counter a replica starts with after a restart.
export type RestoreCounter = (log: Op[]) => number;

// One simulated device. Only the log survives a restart; state and clock
// are rebuilt from it, as the app does on page load.
export class Replica {
  readonly log: Op[] = [];
  state: State = emptyState();
  clock: Clock;
  private readonly logged = new Set<string>();

  constructor(
    readonly id: ReplicaId,
    private readonly apply: ApplyFn,
    private readonly restoreCounter: RestoreCounter = clockFromLog,
  ) {
    this.clock = newClock(id);
  }

  createLocal(make: (clock: Clock, state: State) => Op): Op {
    const op = make(this.clock, this.state);
    this.append(op);
    this.apply(this.state, op);
    return op;
  }

  // Duplicates are applied again on purpose: apply must be idempotent.
  receive(op: Op): void {
    this.append(op);
    this.apply(this.state, op);
    observe(this.clock, op.ts);
  }

  restart(): void {
    this.state = emptyState();
    for (const op of this.log) this.apply(this.state, op);
    this.clock = newClock(this.id, this.restoreCounter(this.log));
  }

  private append(op: Op): void {
    if (this.logged.has(op.opId)) return;
    this.logged.add(op.opId);
    this.log.push(op);
  }
}
