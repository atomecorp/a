# Stable user identity independent of phone

Status: Actif

## Product decision

A user's canonical identifier must be an opaque, immutable identifier independent of
the phone number and every other mutable authentication or directory attribute.

The phone number is a verified credential and an optional authorized lookup attribute.
Changing, removing, hiding, or reassigning a phone number must never change the canonical
user identifier, transfer ownership, rewrite history, or redirect permissions.

## Current verified gap

- Fastify generates user identifiers as UUID v5 values derived from normalized phone
  numbers in `server/auth_crypto.js`.
- Tauri implements the same phone-derived UUID v5 rule in
  `platforms/desktop-tauri/src/server/local_auth.rs`.
- Registration, bootstrap, sharing fallback resolution, and account deletion still
  rely on this derivation.
- The historical Fastify phone-change route updates the phone particle while retaining
  the old identifier. The resulting account no longer satisfies the documented
  phone-derived identity rule, and reuse of the previous phone can cause identity
  collision or incorrect routing.
- Active documentation still described the phone-derived rule before the product
  decision recorded here.

## Dependencies

- Authentication and account operations must use the canonical `/ws/api` contract.
- Phone and contact data must remain private by default and exposed only with explicit,
  revocable authorization.
- Existing append-only events, ownership, permissions, shares, snapshots, filesystem
  ownership, and synchronization cursors must remain attributable to the same principal.

## Executable scope

1. Define one cross-runtime generator for opaque immutable user identifiers that does
   not accept phone, username, email, device identity, or another mutable credential as
   entropy with semantic meaning.
2. Store verified phones in a uniqueness-controlled credential/identity-alias model
   separate from the canonical principal identifier.
3. Replace every runtime path that derives or guesses a user identifier from a phone.
   Phone lookup must resolve an existing authorized alias and must never synthesize a
   principal that has not been created.
4. Define and implement an idempotent migration for existing phone-derived identifiers.
   The migration must preserve or atomically remap every reference, including Atome
   ownership, event actors, permissions, share policies and requests, user homes,
   uploads, messages, sync state, snapshots, tokens, and external identity links.
5. Preserve a protected migration alias from each legacy identifier to the new canonical
   principal where historical lookup requires it. Aliases must not permit account
   takeover or recreate the phone-derived identity rule.
6. Make phone change, removal, verification, consent revocation, and later reassignment
   operate on the credential/alias record without changing the principal identifier.
7. Revoke or rotate sessions affected by credential changes and record the operation in
   the append-only security/audit history.
8. Apply identical semantics on Fastify, Tauri, iOS, offline queues, account linking,
   sharing, and synchronization.
9. Remove the UUID v5 phone namespace and all maintained documentation or tests that
   present phone-derived identity as the supported contract.

## Exit criteria

- A newly created user receives the same stable principal throughout the account life,
  including after verified phone change or removal.
- Reusing a released phone cannot recover, impersonate, overwrite, or route data to its
  previous owner.
- No maintained code derives, predicts, or fabricates a principal identifier from a
  phone number.
- Existing accounts migrate without losing ownership, event attribution, history,
  shares, permissions, messages, files, snapshots, or sync cursors.
- Migration is transactional, restart-safe, idempotent, auditable, and rejects
  ambiguous or colliding legacy data for explicit repair.
- Fastify, Tauri, iOS, offline, reconnect, account linking, sharing, and deletion tests
  prove the same identity contract.

## Required validation

- Migration fixtures covering normal accounts, phone-changed accounts, released/reused
  phones, duplicate legacy aliases, deleted accounts, and interrupted migration.
- Cross-runtime registration/login/phone-change/removal/reassignment parity tests.
- Ownership, actor-history, ACL, sharing, messaging, file, snapshot, and sync integrity
  tests before and after migration.
- Security tests proving that knowledge or control of a previous phone cannot resolve to
  or authenticate as the previous principal.
- A repository guardrail rejecting new phone-to-principal derivation helpers.
- `npm run check:execution-order` and the narrowest relevant authentication, sharing,
  persistence, and synchronization suites.
