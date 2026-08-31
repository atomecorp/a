# Browser login terminates Fastify during synchronization

## Symptom

An account created in Tauri authenticates successfully through Fastify, but the
browser session closes and Fastify exits while initial synchronization begins.
The server failure reports `ECONNREFUSED` for the account's private Unix vault
socket.

## Confirmed root cause

After `registered`, `SyncEngine` subscribes to every authorized stream. The
WebSocket message listener previously started every asynchronous
`wsSyncRuntime.receive()` call without awaiting the preceding call. A mature
account could therefore open more than 150 concurrent replay requests against
one private vault socket. That exhausted the socket admission backlog, and the
resulting rejected promise had no owner, terminating Fastify.

This is not an authentication, password, account-provisioning, SQLite-schema,
or vault-child crash. Those paths completed before the subscription burst, and
the vault remained able to serve the same streams when admission was bounded.

## Durable correction

`server/wsSyncRuntime.js` owns a promise queue on each connection record and
processes incoming control frames in arrival order. One connection can have at
most one replay request in flight. A rejected processing operation is caught at
that same owner and closes only the affected WebSocket with
`sync_processing_failed`.

Do not add retry loops, increase the Unix socket backlog, suppress process
rejections globally, or move subscription state outside the canonical sync
runtime. Those approaches hide the unbounded fan-out without restoring ordered
control-message ownership.

## Regression and acceptance

- Run `node --test tests/server/ws_sync_runtime.test.mjs`. The burst contract
  must prove one maximum active replay and ordered completion; the failure
  contract must prove connection-local containment.
- Run the focused vault, replay, sharing, architecture, and SyncEngine tests.
- Start Fastify, log into the browser through the normal UI with an account
  already created in Tauri, and confirm all announced streams complete replay.
- Keep the Tauri session connected and repeat with multiple browser sessions;
  Fastify must remain alive and its terminal must contain no vault socket
  refusal or unhandled rejection.
