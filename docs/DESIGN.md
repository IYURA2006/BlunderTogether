# Design notes

Decisions, rejected alternatives and review questions. The scaffold and the
final integration are described here. Each part of the system has its own
notes, written with the code:

| Part                                | Notes                                |
| ----------------------------------- | ------------------------------------ |
| CRDT core, offline app, sync client | [design/client.md](design/client.md) |
| Go sync server                      | [design/server.md](design/server.md) |
| Simulation and end-to-end tests     | [design/tests.md](design/tests.md)   |

## Phase 0: scaffold and contracts

**Decisions**

- npm workspaces for `core`, `web` and `e2e`; a separate Go module in
  `server`. One `npm run check` and one `go test` cover everything.
- `apply` changes state in place instead of returning a copy. The simulation
  applies millions of operations and copying four maps each time is wasted
  work. It is still deterministic: the result depends only on the set of
  operations.
- State uses `Map`, not plain objects, because keys such as `parentId` come
  from the network and a key like `__proto__` must stay harmless.
- `deriveTree` takes the chess rules as a parameter. `core` stays free of a
  chess library, and the simulation runs without chess rules at all.
- The server exits on `CRASH_AFTER_COMMIT=1` so the crash test can use the
  real binary from outside instead of a hook inside Go tests only.
- A push is limited to 200 operations and a comment to 2,000 characters, so
  a full push always fits in the 4 MiB frame limit.

**Rejected**

- Returning a new state from `apply`: cleaner for React, too slow for the
  simulation. The app keeps a version counter instead.
- `chess.js` inside `core`: one less parameter, but `core` would no longer be
  dependency-free and every simulation step would pay for move generation.
- SHA-256 from `crypto.subtle`: it is async, and `apply` must be synchronous.

**Questions**

1. Why can `apply` change state in place and still be called order-independent?
2. Why is `Rules` generic over the position type?
3. What breaks if two operations share one timestamp?
4. Why does the server never read anything in an operation except `opId`?
5. Why must the cursor and the received operations be saved in one transaction?

## Integration: does the test suite have teeth?

A convergence test that cannot fail proves nothing, so two wrong versions of
the system are kept in `core/sim/` and must be caught on every run.

| Deliberate bug                                                                        | First failing seed | Why replicas diverge                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setComment` overwrites whatever is stored, ignoring the timestamp                    | 0                  | Two replicas receive two comments on one move in different orders, and each keeps the one that arrived last                                       |
| A restarted replica begins its counter at 0 instead of the highest counter in its log | 32                 | It creates a second operation with a timestamp it already used. Last-writer-wins cannot order the two, so each replica keeps the one it saw first |

Reproduce either with `SIM_SEED=<seed> npm run test:sim`. The second bug is
rarer: about 13 of the first 200 seeds diverge, because the reused timestamp
must also land on the same move and the same field.

**Decisions**

- The interfaces between the three parts were fixed first
  (`docs/CONTRACTS.md`), so each part could be built and tested on its own.
  The first joint run of the simulation and the end-to-end tests passed
  unchanged.
- Longer test vectors (`testdata/sim-seed-*.json`) are generated from the
  simulation, not written by hand, so a second implementation has realistic
  cases to agree with.

**Questions**

1. Why is a teeth check needed when 1,000 seeds already pass?
2. Why does the clock bug diverge on few seeds and the comment bug on the first?
3. What do the end-to-end tests prove that the simulation cannot?
4. In the browser demo, two people commented on the same move while offline.
   Whose comment survived, and why is it not always the one typed last?
5. Which guarantees depend on the server, and which hold even if it is replaced?

## Engine

**Decisions**

- Prebuilt single-threaded "lite" Stockfish (about 1.9 MB) in a Web Worker.
  It needs no `SharedArrayBuffer` and so no cross-origin isolation headers.
- The engine files are copied from the npm package into `web/public/engine/`
  at build time and served from the app's own origin, so analysis works
  offline once the page has loaded.
- One search at a time. A new position sends `stop` and waits for the
  engine's `bestmove` before starting, because everything the engine prints
  until then still describes the old position.
- Results are cached per FEN in memory and never enter the operation log.
  Two devices can show different numbers for one position; that is expected.

**Rejected**

- Syncing evaluations: they are derived data and differ by depth and device.
- Terminating and restarting the worker on every move: simpler state, but it
  reloads the network each time and throws the hash table away.

**Questions**

1. Why must the next search wait for `bestmove` after `stop`?
2. Why is the score flipped when Black is to move?
3. Why is the cache keyed by FEN and not by move id?
4. What would break if evaluations were stored as operations?
5. Why does the single-threaded build avoid special HTTP headers?

## Shipping

**Decisions**

- One Docker image of about 34 MB: the Go binary serves the built web app and
  the WebSocket endpoint, so there is one origin and no CORS setup.
- `CGO_ENABLED=0` works because the SQLite driver is pure Go, which allows a
  distroless base image with no shell and no C library.
- The database lives in `/data`, meant for a mounted volume.
- Numbers in the README come from `npm run bench` and nothing else.

**Questions**

1. Why can the final image contain no C library?
2. What is lost if the container runs without a volume?
3. Why does serving the app and `/ws` from one origin simplify things?
4. What does the catch-up benchmark measure, and what does it leave out?
5. What is the first thing that breaks with two server instances?

## Openings and PGN

Added after the first version. The original plan left "importing
PGN files, opening books" out as product features with no engineering story.
That changed for one reason: they turned out to be a clear demonstration of
the merge rule, and they needed no change to the server, the protocol or the
CRDT.

**Decisions**

- An opening is a list of moves, and loading one calls the same `playMove`
  as a click on the board. A move id is a hash of its parent id and the move,
  so two people who load the same opening or paste the same game offline
  create the same ids and the copies merge into one line.
- Loading into a study that already has moves does not add to it. The app
  asks, and on yes opens a new study under a new link and loads there. A
  study is shared, so mixing a second game into it, or clearing it, would
  change what everyone in the room sees. The load waits in `sessionStorage`
  while the page starts over for the new link, and is taken out once so a
  reload does not repeat it.
- In an empty study the load happens in place. This is the case where two
  people can load the same opening offline and merge.
- Loading never sets the main line, and an imported note is written only
  where the move has no note. Both only matter when two loads meet in one
  study, and in both the rule is "do not replace a choice a person made".
- The opening name is looked up by position, not by move order, so a
  transposition gets the right name. The move counters at the end of the FEN
  are left out of the key because they differ between move orders.
- The PGN reader is written by hand (about 70 lines) and knows nothing about
  chess. It builds a tree of text moves; legality is checked on import, where
  an unreadable move loses only its own line.
- PGN export prints the same items the move list on screen is drawn from, so
  the two cannot disagree.
- One import is limited to 200 KB of text and 2,000 moves.

**Rejected**

- "Replace this study": marking every existing line as deleted before the
  load. One click would hide the work of everyone in the room.
- A new "import" operation holding a whole game: one operation is cheaper to
  store, but two imports of the same game would no longer merge move by move.
- The PGN loader of chess.js: its handling of variations is not documented.
- Telling the interface once per import instead of once per move: tried and
  measured. A 160-move import took 2.26 s with it and 2.30 s without, so
  redrawing is not the cost and the code was removed. The same import took
  1.65 s offline, which points at the IndexedDB transaction per move, plus the
  acknowledgement and echo transactions when online.

**Known cost**

Saving a batch of operations in one transaction would make a large import
fast. It needs a new function in the `Store` interface and a decision about
what the user sees if that one transaction fails, so it is not done.

**Questions**

1. Why do two offline imports of the same game not create duplicate moves?
2. Why does an import not overwrite an existing note, when a person typing
   into the note box does?
3. Why does loading into a study with moves open a new study instead of
   clearing the old one?
4. Why is the opening name found by position and not by the list of moves?
5. Where does the time go in a 160-move import, and how do you know?

## Sibling order: first added, not id

The original rule ordered siblings by move id when no main line was chosen.
An id is a hash, so the order looked random: a move played later could jump
in front of the move everyone had been looking at.

**Decision**

Siblings are ordered by `firstTs`, the smallest timestamp any replica saw for
that move, with the id as a tie-break. The first move played stays the main
line until someone promotes another.

**Why it still converges**

`firstTs` is kept as a minimum, and a minimum does not depend on the order in
which operations arrive. Every replica that has the same operations has the
same `firstTs` for every move, so every replica sorts the same way. The
1,000-seed simulation is unaffected because it compares stored state, and the
order is derived from that state.

**What it costs**

The order can change when an older operation arrives late: a move someone
played offline yesterday goes in front of one played online today. With id
order, positions never moved. An explicit main line choice always wins over
both.

**Questions**

1. Why is "first added" the same on every device, when devices receive
   operations in different orders?
2. When can the order of two moves change after both are already on screen?
3. Why is the id still needed as a tie-break?
4. Does this rule change the stored state or only the derived tree?
5. Why does a chosen main line beat the first-added order?
