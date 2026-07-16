# Explicit cross-runtime account provisioning

Status: Actif

## Product decision

Fastify must never create an authenticated account merely because it receives a JWT for
a principal that does not exist in its account store.

A Tauri account absent from Fastify must use an explicit, authenticated, authorized and
auditable account-link/provision operation. Ordinary session validation, `auth/me`,
sharing, messaging, or synchronization must fail with a typed
`remote_account_not_provisioned` result until that operation succeeds.

This decision does not remove or restrict the first-screen `Try` guest mode.

## Guest-mode contract

- `Try` remains available without phone, password, remote account, or Fastify
  provisioning.
- A guest workspace is local/private and uses an isolated opaque guest principal scoped
  to the installation or local workspace. It must not use one shared global anonymous
  account across unrelated users.
- Guest history and projects remain usable locally through the canonical append-only
  Atome pipeline.
- Remote synchronization, directory publication, messaging, and sharing are unavailable
  until the user explicitly creates or links an account.
- When the guest explicitly creates or links an account, the UI must ask to adopt the
  local guest workspace. Accepted adoption atomically transfers the authorized project,
  Atome, history, ownership, and local resource references to the stable account
  principal. Refusal leaves the guest workspace local and unchanged.
- Knowledge of a guest identifier must never authenticate a remote connection or grant
  access to another installation's guest data.

## Current verified gap

- Fastify `auth/me` creates a public shadow user when a valid JWT names a principal that
  is absent from Fastify.
- Direct-message routing can create another shadow user from a phone-derived predicted
  identifier.
- `todo/sharing_search_monitoring/sharing_to_code.md` previously presented shadow-user
  creation as the completed solution for Tauri/Fastify authentication and notifications.
- `server/auth_users.js` ensures one deterministic anonymous account from a fixed phone
  and password. On a shared Fastify store this is not an isolated guest identity.
- The client already has an explicit `Try` path, anonymous workspace state, project
  seeding, and an ownership-transfer operation when a guest authenticates. These
  behaviors must be preserved and secured rather than removed.

## Dependencies

- `todo/cleanup_architecture/stable_user_identity_independent_of_phone.md`
- `todo/cleanup_architecture/websocket_only_atome_transport.md`
- `todo/cleanup_architecture/authenticated_permission_scoped_ws_sync.md`
- Canonical append-only ownership transfer and permission checks

## Executable scope

1. Remove shadow-account creation from session validation, `auth/me`, messaging,
   sharing, sync, and every ordinary application operation.
2. Define one `/ws/api` account-provision/link action with explicit user intent,
   authenticated local principal, remote server identity verification, replay
   protection, idempotency, expiry, and audit metadata.
3. Require Fastify to validate the provisioning proof and all account/credential
   uniqueness constraints before creating or linking the remote account.
4. Return typed non-provisioned errors without creating state when an ordinary operation
   presents a valid token for an absent account.
5. Replace phone-derived or client-supplied target fabrication with authorized lookup of
   an existing stable principal.
6. Replace the fixed global anonymous account with an isolated opaque guest principal
   that cannot authenticate remotely or collide across installations/workspaces.
7. Preserve the `Try` entry flow, guest project seed, guest history, leave-guest action,
   and explicit adoption of guest work into a newly created or linked account.
8. Make guest adoption transactional, idempotent, permission-checked, restart-safe, and
   auditable across ownership, event attribution, files, snapshots, and offline queues.
9. Apply equivalent semantics on Tauri, Fastify, supported iOS paths, reconnect, offline,
   sharing, messaging, and synchronization.

## Exit criteria

- `Try` opens a functional private local workspace without creating a Fastify account.
- Two unrelated guests never share a principal, project, history, upload namespace, or
  authorization context.
- A valid session token for a missing Fastify principal cannot create an account through
  `me`, messaging, sharing, sync, or another ordinary operation.
- Remote provisioning occurs only after an explicit user action and a verified,
  single-purpose provisioning exchange.
- Guest-to-account adoption preserves all selected local work and append-only history;
  declining adoption preserves the guest workspace.
- No maintained code or active documentation treats a shadow user as a supported
  authentication or sharing solution.

## Required validation

- Guest `Try`, reload, offline use, leave/re-enter, and two-installation isolation tests.
- Negative tests for JWT-only shadow creation through every previous creation path.
- Provisioning replay, expiry, wrong issuer, wrong server, wrong principal, duplicate,
  interruption, and reconnect tests.
- Guest adoption integrity tests for projects, events, ownership, files, snapshots, and
  offline queues.
- Fastify/Tauri parity and supported iOS contract validation.
- A repository guardrail rejecting shadow-user creation from ordinary auth, messaging,
  sharing, or sync handlers.
- `npm run check:execution-order` and the narrowest authentication, persistence,
  sharing, messaging, and sync suites.
