# Sync protocol

One WebSocket per client at `/ws`. Every frame is one JSON text message.
The TypeScript types are in `web/src/sync/messages.ts`, the Go types in
`server/protocol.go`. This file is the source of truth when they disagree.

## Messages

| Direction        | Message | Fields             | Meaning                                                |
| ---------------- | ------- | ------------------ | ------------------------------------------------------ |
| Client to server | `hello` | `roomId`, `since`  | Join the room; send every operation with `seq > since` |
| Client to server | `push`  | `ops`              | Operations created locally, possibly sent before       |
| Server to client | `ops`   | `ops: [{seq, op}]` | Catch-up batches and live broadcasts, in `seq` order   |
| Server to client | `ack`   | `opIds`            | These are stored; remove them from the outbox          |
| Server to client | `error` | `code`, `message`  | The client broke a rule below                          |

Examples:

```json
{ "type": "hello", "roomId": "k3J9xQ2mVb7LpR4t", "since": 41 }
{ "type": "push", "ops": [{ "type": "addMove", "opId": "...", "...": "..." }] }
{ "type": "ops", "ops": [{ "seq": 42, "op": { "type": "addMove", "...": "..." } }] }
{ "type": "ack", "opIds": ["..."] }
{ "type": "error", "code": "bad_room", "message": "room id must match ..." }
```

## Rules

1. `hello` is the first message on a connection and is sent once.
   `roomId` matches `^[A-Za-z0-9_-]{16,64}$`. `since` is an integer, 0 or more.
2. `seq` starts at 1 in each room and has no gaps. A cursor of 0 means
   "nothing received yet".
3. After `hello` the server sends the log after `since` in `ops` messages of
   at most 500 operations, then live broadcasts. A client never sees a `seq`
   lower than or equal to one it already received on that connection, and
   never sees a gap.
4. A `push` carries 1 to 200 operations. Each operation is a JSON object with
   a string `opId` of 1 to 64 characters. The server reads nothing else in it.
5. The server commits a `push` to the database first. Then it sends `ack`
   with every `opId` in the push, including ones it already had, and
   broadcasts the newly stored operations to every client in the room,
   the sender included. A client must not rely on `ack` arriving before
   the broadcast.
6. Delivery is at-least-once. Clients may receive an operation they already
   have and must ignore it.
7. A frame larger than 4 MiB closes the connection with status 1009.
8. After any `error` the server closes the connection.
9. If a client reads too slowly and its outbound buffer fills, the server
   closes the connection. The client reconnects and catches up from its cursor.

## Details the rules above leave open

- After an `error` the server closes with status 1008 and the error code as
  the close reason.
- A `push` with no operations, a binary frame and a text frame that is not
  valid UTF-8 are all `bad_message`.
- A missing `since` counts as 0. A negative or fractional `since` is
  `bad_message`.
- If the database fails during a push or a catch-up, the server closes the
  connection without an `error`. Nothing was acknowledged, so the client
  sends its outbox again after it reconnects.
- The server accepts connections from any origin. There are no cookies or
  logins, so a page on another site gains nothing a direct connection lacks.
- If a client's cursor is ahead of the log (the database was replaced by an
  older one), the server sends nothing until the log passes the cursor.
- A client that receives an operation it cannot read skips it and still moves
  its cursor past that `seq`, so it does not fetch it again on every connect.

## Error codes

| Code             | Cause                                                     |
| ---------------- | --------------------------------------------------------- |
| `bad_message`    | Not JSON, unknown `type`, or a field with the wrong shape |
| `bad_room`       | `roomId` does not match the pattern                       |
| `hello_required` | `push` before `hello`, or a second `hello`                |
| `too_many_ops`   | `push` with more than 200 operations                      |
