# Contracts

These files are the interfaces between the parts of the system. Change one
only when every side that depends on it changes in the same commit.

| Contract                  | Files                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| CRDT types and signatures | `core/src/types.ts`, exported signatures in `core/src/index.ts`                                        |
| Wire protocol             | `docs/PROTOCOL.md`, `web/src/sync/messages.ts`, `server/protocol.go`                                   |
| Database schema           | `server/schema.sql`                                                                                    |
| Storage and sync client   | `web/src/sync/types.ts`, `createSyncClient` in `web/src/sync/client.ts`, `web/src/sync/memoryStore.ts` |
| Test vectors              | `testdata/*.json`                                                                                      |
| Dependencies              | every `package.json`, `package-lock.json`                                                              |

## Layout

| Folder      | Holds                                                         |
| ----------- | ------------------------------------------------------------- |
| `core/src/` | CRDT and its unit tests. No React, network or storage imports |
| `core/sim/` | Seeded convergence simulation                                 |
| `web/`      | React app, IndexedDB store, sync client, engine worker        |
| `server/`   | Go sync server and its tests                                  |
| `e2e/`      | Tests that run the real server with headless clients          |
| `testdata/` | JSON test vectors shared by TypeScript and Go                 |
| `docs/`     | Protocol, contracts, design notes                             |

## Canonical state

`canonicalize(state)` returns JSON with no whitespace and every object's keys
sorted. The top level has `comments`, `deleted`, `mainline` and `moves`, each
an object keyed by move id. Timestamps are `{"counter", "replicaId"}`.

A test vector is `{ "name", "ops", "expected" }`. Applying `ops` in any order
must give a state where `JSON.parse(canonicalize(state))` equals `expected`.

## Server command line

| Input                  | Meaning                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `-addr`                | Listen address, default `:8080`                                                                                                  |
| `-db`                  | SQLite file, default `blunder.db`                                                                                                |
| `-static`              | Folder with the built web app; empty means do not serve one                                                                      |
| `GET /healthz`         | Returns 200 when the server can take connections                                                                                 |
| `GET /ws`              | WebSocket endpoint                                                                                                               |
| `CRASH_AFTER_COMMIT=1` | Test only. The process exits with code 3 right after the first commit that stores a new operation, before any `ack` or broadcast |

## Commands

| Command               | Runs                                       |
| --------------------- | ------------------------------------------ |
| `npm run check`       | Lint, format check, type check, unit tests |
| `npm run test:sim`    | Convergence simulation in `core/sim/`      |
| `npm run test:e2e`    | End-to-end tests in `e2e/` (needs Go)      |
| `go test -race ./...` | Server tests, from `server/`               |
