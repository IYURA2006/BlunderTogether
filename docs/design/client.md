# Client notes: CRDT core, offline app, sync client

Design plan for the interface first, then the decisions behind each of the
three parts, what was rejected, and questions the author should be able to
answer without notes.

## Design plan

**Subject.** A chess study that members of a university chess club build
together. The audience reads chess books and score sheets. The job of the page
is to show one position clearly and let people add moves and notes to it.

**Idea.** A chess book that a study group is marking up. Printed things look
printed: the board is a book diagram and the moves are set like book
notation. Things people add look added: notes are in ballpoint blue, and one
highlighter yellow marks where you are.

**Palette**

| Name        | Hex       | Used for                                                    |
| ----------- | --------- | ----------------------------------------------------------- |
| Page        | `#F3F5F2` | Background, light squares                                   |
| Ink         | `#1B2421` | Text, board frame, buttons                                  |
| Graphite    | `#5C6763` | Secondary text, coordinates                                 |
| Hatch       | `#87928D` | The diagonal lines that shade dark squares                  |
| Rule        | `#C8CFCA` | The few dividing lines                                      |
| Highlighter | `#FFE45C` | Current move in the notation, last move on the board        |
| Ballpoint   | `#2244A8` | Notes written by people, focus ring, the hidden-work notice |

There is no red or green. Connected and offline differ by a filled or hollow
dot and by words. A deleted line is struck through.

**Type.** Two families, both from the system so the app works offline.

- Gill Sans (`"Gill Sans Nova", "Gill Sans", Candara, "Segoe UI", "Noto Sans"`)
  for moves and interface. It is the face of the mid-century British chess
  paperback. Main line in semibold at 21px, variations in regular at 17px.
- Charter (`Charter, "Sitka Text", Cambria, "Noto Serif"`) in italic for
  notes, in ballpoint blue. A different family so a note never reads as part
  of the printed line.
- Sizes: 14, 17, 21, 28px. Weight carries meaning: bold is the main line.

**Layout.** Left aligned everywhere. Two columns on a laptop, one on a phone
with the board first.

```
+--------------------------------------------------------------------+
| BlunderTogether                  o Offline, 3 waiting  [Copy link] |
|                                                                    |
| +---------------------------+   1. e4 e5                           |
| |                           |     (1... c5 2. Nf3 d6 note in blue) |
| |   board, hatched squares  |   2. Nf3 Nc6                         |
| |   (sticky, never taller   |   ---------------------------------- |
| |    than the window)       |   2... Nc6   [Make main line][Delete]|
| |                           |   Note on 2... Nc6                   |
| +---------------------------+   [ textarea                       ] |
| engine line (reserved)                                             |
| [Back] [Forward] Flip board     Deleted lines                      |
|                                 1... e6   2 moves   [Restore line] |
| ------------------------------------------------------------------ |
| Try a bad connection   [ ] Work offline   Delay ---o--- 1.50 s     |
+--------------------------------------------------------------------+
```

**Principles**

1. The board is the centre and stays calm: no colour on it except the
   highlighter on the last move.
2. Boldness is spent once, on the hatched diagram board. Everything else is
   text on a plain page: no cards, no shadows, no gradients.
3. Colour means something. Yellow is "you are here". Blue is "a person wrote
   this". Nothing else is coloured.
4. Words say what happens: "Delete line", "Deleted lines", "Restore line".

**Review against the generic defaults**

- The first plan used the green and buff of a club's roll-up tournament
  board. On a screen that reads as a copy of the best-known chess site, so it
  was replaced with the hatched diagram from chess books. That is the one
  change made after the review, and it became the bold element.
- Not a cream page with a serif headline and a clay accent: the page is a
  cool white, there is no display serif, the accent is highlighter yellow.
- Not near-black with an acid accent, and no dark mode for now (see "Not
  done").
- Not a newspaper grid: a few thin rules, each separating a different kind
  of content.
- Not a card kit: nothing is boxed except buttons and the text field.
- No capital-letter labels, no dots joining labels, no monospace, no arrows
  on buttons.

**Quality floor.** One column under 832px. Focus ring on every control. Left
and right arrows step through the line. Board animation is off when the
system asks for reduced motion; nothing else moves.

**Not done.** Dark mode. An app icon. The board coordinates are the library's
own and the file letters sit under the first-rank pieces.

## CRDT core (`core/src/`)

**Decisions**

- `apply` is one `switch`. `addMove` keeps the smaller timestamp, the other
  three replace only on a strictly larger one. No rule looks at arrival order.
- State stores a reference to the operation's `ts`, not a copy. Operations
  are never changed after they are created.
- `canonicalize` writes JSON by hand and sorts keys by plain string order.
  Copying a map into an object would break on a key named `__proto__`, and
  `localeCompare` would depend on the device.
- `deriveTree` is one recursive walk. Children are grouped by parent and
  sorted by who was added first, then the main line child is moved to the front if it is
  among the visible children. That one lookup covers "deleted", "illegal",
  "not received yet" and "belongs to another parent".
- A deleted move under a visible parent starts a deleted line. Inside it,
  further deleted moves are dropped, so the line is shown as a restore would
  show it.
- `isOp` checks every field the merge code reads. Extra fields are allowed.
- `crypto.randomUUID` is declared in `globals.d.ts`, because core is compiled
  without DOM or Node types.
- Test vectors are read with `import.meta.glob`, which Vitest provides. Core
  has no Node types, so `fs` was not an option.

**Rejected**

- A generic "last writer wins register" class. Three calls to one
  `isNewer` function say the same thing with less to explain.
- Rejecting, in `apply`, a main line that points to a move that is not a
  child. The child may simply not have arrived yet, so the check belongs in
  `deriveTree`.
- Sorting siblings by timestamp. It reads nicely ("oldest first") but
  `firstTs` can change when an older duplicate arrives, and ids never do.
- Checking in `isOp` that `op.replicaId` equals `op.ts.replicaId`. The
  documents do not ask for it, and the Go side would have to agree.

**Questions**

1. Why does `addMove` keep the smaller timestamp while the other three keep
   the larger?
2. Two operations have the same counter. What decides, and why is that safe?
3. A `setMainline` arrives before the move it names. What does the user see
   before and after the move arrives?
4. Why is the parent id part of the move id hash?
5. What would go wrong if `canonicalize` used `JSON.stringify` on
   `Object.fromEntries(map)`?

## Offline app (`web/src/`)

**Decisions**

- `room.ts` owns state, clock and actions and has no React in it. React reads
  it with `useSyncExternalStore`. After every change the room builds a new
  view object (tree, deleted lines, and a map of visible moves by id).
- A local action is: create the operation, `saveLocalOp`, `apply`, notify
  sync. The user sees an edit only after it is on disk.
- Playing a move that is visible just selects it. Playing a move that exists
  but is deleted restores it, because adding it again would change nothing
  and the user would see no result.
- The selected move lives in React state. If it disappears, the board falls
  back to its nearest visible ancestor (`nearestVisible`).
- Chess rules are a `Rules<string>` over FEN. A move is accepted only if
  chess.js reports the same UCI back, because chess.js ignores a promotion
  letter on a move that does not promote.
- Notation is built by `lineAfter`: follow the first child, and print every
  other child as a bracketed variation after it.
- The comment box keeps a draft only while the user has typed something new.
  It commits after an 800 ms pause or on blur.
- IndexedDB: stores `log` (key `opId`), `outbox` (auto-increment key, unique
  index on `opId`) and `meta`. Each write function is one transaction and is
  aborted by hand if any step throws.
- The lock and the room are opened in `main.tsx` before React renders.
  Inside an effect they would run twice in development, and the second run
  would find the room locked by the first.
- A changed URL hash reloads the page. A new room means a new database and a
  new lock, and a reload gives both.
- The hidden-work notice counts every move this replica added inside any
  deleted line, whoever deleted it.

**Rejected**

- Keeping the tree in React state and updating it per operation. The tree is
  derived data; rebuilding it from the four maps is simple and always right.
- Applying before saving. It feels faster, but a crash in between loses an
  edit the user already saw.
- Sorting the outbox by timestamp instead of an auto-increment key. It works
  only because local counters grow, which is an indirect reason.
- Committing a comment on every keystroke: one operation per character.
- A fallback for browsers without Web Locks. The app needs a secure context
  anyway (for `crypto.randomUUID`), and every browser that has one has locks.
- Auto-queen on promotion. A study needs under-promotion sometimes.

**Known gaps**

- A draft comment is lost if its move disappears (deleted by someone else)
  during the 800 ms pause.
- The selection is not kept across a reload.

**Questions**

1. Why is the Lamport counter restored from the log and not stored as its
   own value?
2. What exactly is in the one transaction of `saveReceivedOps`, and what
   could go wrong if the cursor were saved separately?
3. Why can two tabs not share a room, and what does the lock do when the
   first tab closes?
4. `apply` mutates the state. How does React find out that something
   changed?
5. Why does the board accept `e7e8q` but reject `e2e4q`?

## Sync client (`web/src/sync/client.ts`)

**Decisions**

- Two promise chains, `incoming` and `outgoing`. Each message waits for its
  own delay and for the message before it. This gives strict order for the
  async store calls, and it keeps order when the delay slider changes.
- The client keeps a copy of the outbox in memory (`unsent`). It is read from
  the store at start and again before every hello. `status()` can then answer
  at once, and an operation created while hello is being prepared is still in
  the first push.
- Every queued step checks that its socket is still the current one. Anything
  that belongs to a dead connection is dropped. That is safe in both
  directions: unsent operations stay in the outbox, and incoming ones that
  were not processed were never saved, so the cursor has not passed them and
  the server sends them again.
- If saving a received message fails, the connection is closed. Handling the
  next message would move the cursor past operations that were never stored.
- An operation that fails `isOp` is skipped but its `seq` still moves the
  cursor, otherwise the client would fetch it on every connection.
- Backoff is `min * 2^failures`, capped at `max`. The wait is half fixed and
  half random. The counter resets when a connection opens.
- "Connected" means the socket is open and hello is queued.
- `onerror` is an empty function. A close always follows, and the Node `ws`
  socket throws on an error with no handler.

**Rejected**

- Reading the outbox from the store on every `notifyLocalOp`. It makes a
  synchronous call async and opens a window where an operation is saved but
  missed by the first push.
- A `setTimeout` per message for the delay. Lowering the delay would let a
  later message overtake an earlier one.
- Fully random wait. It can be close to zero right after a failure.
- Processing messages from an old socket after a reconnect. Dropping them is
  one rule instead of a case analysis.

**Questions**

1. Why must received operations be saved before `onRemoteOps` runs, and why
   together with the cursor?
2. The server crashed after storing a push and before the ack. What does the
   client do after it reconnects, and why is that correct?
3. What does jitter protect against?
4. With a delay of 5 s set and then lowered to 0, why can a later message not
   overtake an earlier one?
5. Why is it safe to throw away a queued outgoing push when the socket dies?
