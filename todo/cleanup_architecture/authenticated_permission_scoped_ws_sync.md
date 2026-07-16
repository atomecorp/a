# Authenticated and permission-scoped `/ws/sync`

Status: Actif

## Decision

Fastify and every maintained runtime must keep `/ws/sync` as a distinct WebSocket real-time channel, but the channel must never accept an anonymous application connection or broadcast an event outside the authenticated principal's authorized scope.

WebSocket remains the exclusive transport. This task does not authorize an HTTP fallback.

## Current verified security gap

- Fastify currently accepts `/ws/sync` connections without attaching an authenticated identity.
- A connection is registered before any authentication or authorization check.
- The shared event bus forwards account events, Atome events, and file events to every connected `/ws/sync` client.
- Account creation and deletion payloads can contain user ids, usernames, phone numbers, and optional profile data.
- One internal account synchronization payload can also contain a password hash.
- Atome payloads can contain the complete projected properties plus owner and parent identifiers.
- File watcher payloads can contain absolute and relative filesystem paths, host metadata, and file hashes.
- `atome/documentations/sync_protocol.md` explicitly states that authentication is not required at the sync layer.

The permission-scoped Atome real-time path already used by `/ws/api` does not compensate for this gap because the separate global `/ws/sync` event-bus forwarder remains active.

## Required contract

1. Reject the WebSocket upgrade or close the connection with a deterministic typed error when no valid authenticated identity can be established.
2. Derive the principal from a server-verified session, cookie, token, or runtime credential. Never trust a client-supplied user or owner id.
3. Associate each connection with one authenticated principal and the minimum required capabilities.
4. Filter Atome events through current read permission and real-time sharing mode before delivery.
5. Scope account-directory events to explicitly authorized directory consumers and redact private fields that the recipient is not allowed to read. Phone and contact data are private by default; password hashes are forbidden in every client event.
6. Scope file events to authorized roots and capabilities; do not expose absolute server paths, host details, hashes, or unrelated user files to ordinary clients.
7. Authorize active messages such as `sync_request` independently from passive event subscription.
8. Apply equivalent authentication, expiry, revocation, reconnect, and authorization semantics on Fastify, Tauri, and supported iOS paths.
9. Keep `/ws/api` and `/ws/sync` responsibilities explicit: `/ws/api` owns authenticated request/response business operations, while authenticated `/ws/sync` owns permission-scoped real-time notification delivery.
10. Remove the legacy unauthenticated protocol statement and add a permanent security regression guard.

## Dependencies

- The WebSocket-only Atome transport migration must preserve one shared identity and authorization model across `/ws/api` and `/ws/sync`.
- Permission checks must reuse the canonical sharing and database authorization services.
- Authentication material must follow the token/session storage rules from the framework security audit.
- Event redaction must not create a second user-directory, Atome-state, or filesystem authority.

## Exit criteria

- An unauthenticated `/ws/sync` connection receives no welcome payload, schema details, watcher configuration, account event, Atome event, file event, or sync capability.
- An authenticated user receives only Atome events currently readable by that user and allowed by the selected sharing mode.
- Account events expose only the directory fields authorized for that recipient.
- File events expose only authorized resources and normalized non-sensitive identifiers.
- Expired, revoked, malformed, replayed, or mismatched credentials fail closed.
- Reauthentication and reconnect behavior is deterministic and cannot retain the preceding principal's subscriptions.
- Fastify, Tauri, and supported iOS behavior is contract-compatible.
- Documentation, API maps, architecture maps, and the completed security report addendum describe the same enforced contract.

## Required validation

- Integration tests proving anonymous connections are rejected before `welcome`.
- Two-user and multi-user tests proving no cross-user Atome, account, or file-event leakage.
- Permission grant, revoke, expiry, and sharing-mode transition tests.
- Token/session expiry, revocation, reconnect, and principal-switch tests.
- Payload-redaction tests for account and filesystem metadata.
- Schema and capability tests for every accepted client message.
- Fastify/Tauri parity tests and supported iOS contract validation.
- A repository guardrail rejecting an unauthenticated `/ws/sync` route or an unscoped global event-bus broadcast.
