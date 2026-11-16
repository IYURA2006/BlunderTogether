# Tests: simulation and end-to-end

Two test suites sit above the unit tests. The simulation (`core/sim/`) checks
the merge rules against thousands of random histories in memory. The
end-to-end tests (`e2e/`) run the real server binary and real sync clients
and check the parts the simulation does not have: the wire, the outbox, the
cursor, the database and process death.

## How the simulation works

`runSimulation({ seed })` in `core/sim/simulation.ts` does one run:

1. Five replicas start empty. A replica (`replica.ts`) is a log of
   operations, a `State` and a `Clock`. Only the log is durable.
2. A loop draws random steps until 200 operations exist. Each step is one of:
   - a replica creates a random operation, applies it and broadcasts it (30%);
   - the network delivers one waiting message (60%);
   - a replica is cut off from the network or reconnected (5%);
   - a replica restarts (5%).
3. All cuts are healed and every waiting message is delivered.
4. The five canonical states are compared as strings.

Every random choice comes from one seeded generator (`rng.ts`), so a seed
names one exact history. The test runs seeds 0 to 999. When a seed fails,
the message says `replay with SIM_SEED=<n>`, and that runs only this seed.
One thing is not replayed: `opId` is a random UUID. It is used only to
remove duplicates from the log and never influences a choice or the state.

The random operations (`randomOp.ts`) are chosen to cause conflicts:

- `addMove` uses six UCI strings, so replicas often add the same move under
  the same parent and must agree on `firstTs`.
- `setMainline` usually names a real parent and child. One time in five the
  child belongs to another parent. The tree would ignore that value, but all
  replicas must still store the same one.
- `setDeleted` and `setComment` hit a small set of moves, so concurrent
  writes to one register are common.

No chess rules are involved. Convergence is checked on `canonicalize(state)`.
If the four maps are equal, every tree derived from them is equal too.

## What each injected failure stands for

| In the simulation                          | In real life                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| A random waiting message is delivered next | Delay and reordering: slow connections, a device that was away for hours                             |
| A delivered message sometimes stays queued | At-least-once delivery: an outbox resent after a reconnect, a push repeated because the ack was lost |
| A replica is cut; its messages wait        | The offline toggle, a train tunnel. Both sides keep editing and the backlog arrives in one burst     |
| A replica restarts and rebuilds from a log | A page reload or a browser crash. State and Lamport counter come back from IndexedDB                 |
| A duplicate is applied again, not filtered | `onRemoteOps` may hand the app operations it already has, so `apply` itself must be idempotent       |
| The same move added by two replicas        | Two people play the same move while offline                                                          |
| A main line that names a foreign child     | A stale or buggy client. The server does not check operation contents                                |

What the simulation leaves out on purpose: messages are never lost for good,
because the outbox and the cursor make the real system resend until
acknowledged. Replicas send to each other directly instead of through a
server. Merge rules that are commutative and idempotent cannot depend on the
route, and the server path is covered end to end.

## Teeth check 1: a merge rule that depends on arrival order

A test that never fails proves nothing, so two tests break the system on
purpose and require the simulation to notice.

`brokenApply.ts` wraps the real `apply` and changes one rule: `setComment`
always overwrites, ignoring the timestamp. Two replicas that receive two
comments for one move in different orders now keep different texts. The test
requires a diverging seed among the first 50 and prints the first one.

The runner takes `apply` as a parameter for this reason. The check is a
permanent test, so it cannot be forgotten after a refactoring.

## Teeth check 2: a clock that restarts at 0

A `ts` must never be reused. The second check restarts
replicas with counter 0 instead of `clockFromLog(log)` and looks at what
really goes wrong. There are two separate effects.

**Effect 1: reused timestamps, which can make replicas diverge.**
Replica `r2` writes comment "A" on move M with ts `(5, r2)`. It restarts at
0, counts up again and later writes comment "B" on M, again with ts
`(5, r2)`. These are two different operations with the same timestamp. The
rule "keep the value with the larger ts" has no answer: neither is larger,
so each replica keeps the one it saw first. `r2` saw "A" first. A replica
that the network handed "B" first keeps "B". No later message repairs this,
because both replicas already have both operations.

Divergence needs three things at once:

1. one replica uses the same counter twice (this happens in almost every
   run that has a restart);
2. both operations write the same register with different values: the same
   `moveId` for a comment or a deleted flag, the same `parentId` for a main
   line. Two `addMove` operations with one ts are harmless, because
   different moves have different ids and equal moves give equal entries;
3. two replicas receive the two operations in different orders.

So only some seeds diverge, far fewer than in teeth check 1. The tests
reflect that:

- `a clock restarted at 0 reuses timestamps` asserts the cause directly;
- `a clock restored from the log never reuses a timestamp` is the control;
- `a clock restarted at 0 makes replicas diverge within 200 seeds` asserts
  the consequence and prints the first diverging seed. It searches 200
  seeds, not 50, because of the three conditions above.

The third test assumes that `apply` leaves the stored value alone when the
timestamps are equal (or always replaces it; both depend on arrival order).
If the core ever breaks ties by some other fixed rule, replicas would agree
again and this test would fail. That would be a change to the merge rules
and should be discussed, not patched in the test.

**Effect 2: a new edit loses to an older one.** After a restart at 0 the
next comment gets a small ts and loses against a comment the user was
looking at when typing. Every replica agrees on the wrong winner, so this is
not divergence and the simulation cannot see it. A unit test in
`core/src` covers this case.

## What the end-to-end tests prove that the simulation cannot

The simulation calls `apply` directly. It has no JSON, no socket, no
database and no process. The e2e tests use the server binary built from
`server/`, `createSyncClient`, the memory store and `core`, wired in the same
order as the app (`e2e/client.ts`).

| Test                    | What it adds                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Convergence             | Operations survive the trip through JSON, the server log and broadcast. Offline and online switches exercise outbox and cursor |
| Late join               | Catch-up from cursor 0 gives the full state                                                                                    |
| Restart (SIGTERM)       | The log is durable, `seq` continues, clients reconnect by themselves, edits made during the outage arrive                      |
| Crash after commit      | The window between commit and ack: the client keeps the operation, resends it, and the unique index stores it once             |
| Protocol errors, raw ws | The server enforces `hello` first, the room id pattern and the push limit, and acks a repeated push without storing it twice   |

Two details of the harness:

- "Synced" means every client has `unsent === 0` and every client has seen
  every operation that any client has seen. Only then are the canonical
  states compared. Waiting for equal states instead would turn a real
  divergence into a timeout with no useful message.
- The protocol has no "end of catch-up" message. To read a whole log over a
  raw socket, `readLog` sends `hello` and then pushes a marker operation. The
  marker gets the highest `seq`, so everything received before it is the
  complete log.

The e2e seed (`E2E_SEED`) fixes which edits are made, not the timing of the
network, so an e2e failure may not replay exactly. The simulation is the
tool for exact replay; the e2e tests are the proof that the real parts are
connected correctly.

## Test vectors

`core/sim/generateVectors.test.ts` writes three simulation runs to
`testdata/` in the vector format from `docs/CONTRACTS.md`. It is skipped
unless `GENERATE_VECTORS=1` is set, because its expected values come from the
code under test. `core/sim/` is type-checked with Node types
(`core/tsconfig.sim.json`), so it can write files; `core/src/` is not.

## Five questions

1. Why does the simulation compare canonical strings and not derived trees?
2. A seed fails in CI. What do you run, and what in the rerun is not
   identical to the failed run?
3. Why does a comment rule that ignores timestamps diverge in the first
   seeds, while a clock restarted at 0 needs many more seeds?
4. Messages are never lost in the simulation. Why is that a fair model of
   the real system, and which e2e tests cover the cases where a message
   really disappears?
5. In the crash test the client still shows one unsent operation although
   the server stored it. Why is that correct, and what makes the resend
   harmless?
