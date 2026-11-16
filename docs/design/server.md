# Sync server: design notes

The server stores one append-only log per room and relays it. It never reads
an operation beyond its `opId`. The protocol is in `docs/PROTOCOL.md`.

## Files

| File          | Holds                                                          |
| ------------- | -------------------------------------------------------------- |
| `main.go`     | Flags, routes, the crash hook from the environment, shutdown   |
| `store.go`    | SQLite: last seq of a room, append a push, read after a cursor |
| `room.go`     | The room goroutine: join, leave, push, broadcast               |
| `hub.go`      | Registry of running rooms; starts and stops them               |
| `conn.go`     | One WebSocket: read loop, write loop, message checks           |
| `protocol.go` | Frozen message types and limits                                |

## Decisions

- **One goroutine per room.** It owns the client list and `lastSeq` and is
  the only code that appends to that room's log. Connections send it `join`,
  `leave` and `push` requests over one unbuffered channel. Because it handles
  one request at a time, commit, ack and broadcast for one push are never
  mixed with another push or a join. The room has no mutex.
- **Join is catch-up, then membership.** The room reads the log after `since`,
  queues it for the client, and only then adds the client to its list. No
  push can run in between, so the first live broadcast follows directly on
  the last catch-up operation: no gap, no repeat.
- **The hub counts connections per room.** `join` adds one and starts the
  room if needed; `leave` takes one away and, at zero, removes the room from
  the map and closes its inbox. Both happen under the hub mutex. A connection
  only sends to a room between its own join and leave, so at zero nobody can
  still send, and closing the channel is safe. A hello arriving at that
  moment finds no entry and starts a new room. `leave` first hands the room
  its leave request, and the room handles requests in order, so the old room
  has finished every push before the new one reads `MAX(seq)`.
- **Commit, then ack, then broadcast.** `appendOps` runs one transaction.
  `INSERT ... ON CONFLICT (room_id, op_id) DO NOTHING` skips duplicates and
  `RowsAffected` tells which operations were new; only those get a seq. The
  ack lists every opId in the push, new or not.
- **The room never waits for a client.** `send` is a non-blocking channel
  send. A full buffer cancels that connection's context, which ends its
  reader and writer; the client reconnects from its cursor. The buffer is 64
  messages.
- **A message is encoded once** and the same bytes go to every client.
- **The crash hook is a func field** (`hub.afterCommit`), called after a
  commit that stored something and before the ack. `main` sets it to
  `os.Exit(3)` when `CRASH_AFTER_COMMIT=1`. The Go test sets it to a function
  that blocks, then starts a second server on the same file.
- **SQLite settings.** WAL with `synchronous=FULL`, so an ack means the
  operation is on disk. One database connection: SQLite has one writer
  anyway, and a single connection makes rooms queue in Go instead of getting
  `SQLITE_BUSY`.
- **Store errors drop the client.** If a commit or a log read fails, the
  room logs it and closes that client. Nothing was acked, so the client
  resends after reconnecting. A room that cannot read its last seq at start
  turns every client away.
- **Protocol errors** are sent as an `error` message, then the socket is
  closed with status 1008. The connection leaves its room first. A frame over
  4 MiB is closed with 1009 by the WebSocket library's read limit.
- **Text frames must be valid UTF-8.** Browsers fail a connection that
  receives a bad text frame, so one such stored operation would lock a whole
  room out.
- **Any origin may connect.** There are no cookies or logins, so a page on
  another site gains nothing over connecting directly.
- **Shutdown.** Stop accepting, cancel the server context (this ends every
  WebSocket), wait for all handlers, then close the database. When the last
  handler returns, every room has stopped.

## Rejected

- **A mutex around each room.** Works, but the no-gap rule would then depend
  on holding the lock across a database read and a queue write in the right
  places. With one goroutine the order of events is the order of the inbox.
- **Rooms that stop themselves when their client list is empty.** A join
  could then hold a pointer to a room that has just exited, and every send
  would need a "room is gone, try again" path. Counting in the hub removes
  that case.
- **A map of rooms that never shrinks.** No race at all, but one idle
  goroutine per room ever opened.
- **Computing the next seq with `MAX(seq)+1` inside every insert.** It would
  hide a second writer instead of failing on the primary key. The room keeps
  `lastSeq` in memory and reads it from the database only when it starts.
- **Blocking sends to clients, or an unbounded queue.** The first lets one
  slow reader stall a room; the second lets it use all the memory.
- **Catch-up outside the room goroutine.** It would not pause the room on a
  long log, but it is listed as out of scope and needs a careful handover
  from catch-up to live messages.
- **cgo SQLite (`mattn/go-sqlite3`).** Needs a C compiler in CI and Docker.
- **A write timeout and ping/pong.** Not in the protocol. See limits.

## Known limits

- A catch-up of more than 64 x 500 operations overflows the client's buffer
  and the client is dropped. Logs are a few hundred operations.
- Reading a long log pauses that room, and the single database connection
  pauses other rooms too while it runs.
- No heartbeat. A connection whose peer vanished without closing stays in
  its room until a write to it fails or its buffer fills.
- If the database is replaced by an older or empty one, a client whose
  cursor is ahead of the log gets nothing until the log passes its cursor.

## Questions the author should be able to answer

1. Why one goroutine per room instead of a mutex? What exactly would break
   if two goroutines appended to the same room?
2. The server commits a push and dies before the ack. Walk through what the
   client and the next server process do, and why the operation is stored
   once.
3. The last client leaves a room at the same moment a new client says hello
   to it. Which lines decide what happens, and why can the new room not read
   a stale `MAX(seq)`?
4. A client says hello while another client's push is being committed. Why
   can it not miss that operation or get it twice?
5. What happens to a client that stops reading, step by step, and why does
   the room never block on it? What does the buffer size of 64 limit?
