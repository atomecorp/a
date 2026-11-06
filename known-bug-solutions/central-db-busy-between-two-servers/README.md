# Central database busy between Fastify and atome-server

## Symptom

On the Web stack (atome-server in front, Fastify behind), a burst of mutations
on one account loses some of them: Fastify answers `SQLITE_BUSY` (« database is
locked », snapshot variant) at once, without waiting. `temp/comm/l8_stack_race.probe.mjs`
kept 11 to 13 of its 20 messages.

## Confirmed root cause

Since the vault router moved into atome-server (2026-11-05), two processes write
Fastify's central SQLite database (`database/schema.sql`, WAL): Fastify and the
router (`vault_object_registry`, `vault_stream_registry`). Fastify began its
transactions with a deferred `BEGIN TRANSACTION`: a deferred transaction takes a
read snapshot at its first read and asks for the write lock only at its first
write. When the other process committed in between, SQLite cannot upgrade a
stale snapshot and fails with `SQLITE_BUSY` immediately — the busy timeout does
not apply to that case. One process alone never met it.

## Durable correction

`database/driver.js` `beginTransaction()` runs `BEGIN IMMEDIATE`: the write lock
is taken first, so the transaction waits its turn under better-sqlite3's busy
timeout (5 s) instead of failing on a stale snapshot. The router's own writes use
`IMMEDIATE` transactions too.

## Regression and acceptance

- `node temp/comm/l8_stack_race.probe.mjs` (or its successor under `tests/`):
  20/20 messages, three runs in a row.
- Do not add retries on `SQLITE_BUSY`, raise the busy timeout or serialize the
  two processes behind a lock of their own: the deferred upgrade is the cause.
