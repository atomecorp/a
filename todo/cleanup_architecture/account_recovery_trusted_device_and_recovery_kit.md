# Account recovery with trusted device and Recovery Kit

Status: Actif

## Product decision

An SMS sent to the single verified phone number remains part of account recovery, but
SMS possession alone must not immediately authorize password replacement or complete
account takeover.

The normal recovery proof is:

- SMS OTP sent to the currently registered verified phone; and
- cryptographic approval from the already authorized application installation on that
  phone or another authorized device.

If the authorized device is lost, the fallback proof is:

- SMS OTP sent to the registered verified phone after the number has been recovered on a
  replacement device; and
- the user's Recovery Kit.

The existing SMS-only reset remains temporarily available until the complete replacement
has been implemented, validated and activated atomically. There must be no interval
without a functional recovery mechanism.

## Recovery Kit contract

- Generate the recovery secret locally with cryptographically secure high entropy during
  account enrollment.
- Present it in a printable human-readable form and QR representation.
- Require an explicit verification step proving that the user saved it.
- Store only a salted memory-hard verifier or cryptographically appropriate wrapped
  recovery material on the server; never store or log the plaintext recovery secret.
- Permit controlled rotation. Rotation invalidates the previous kit, requires strong
  reauthentication, revokes affected recovery attempts, and produces an append-only
  security event.
- Explain clearly that loss of every authorized device and the Recovery Kit can make
  future user-only encrypted data unrecoverable.

## Authorized-device contract

- Each authorized installation owns an opaque device identifier and a non-exportable
  cryptographic key where the platform provides Keychain, Secure Enclave, TPM, Android
  Keystore, or an equivalent protected facility.
- The server stores the public verification material, status, enrollment time, last use,
  revocation state, and minimum required audit metadata.
- Adding a device requires approval by an authorized device or completion of the Recovery
  Kit path.
- Lost or compromised devices can be inspected and revoked.
- A phone number is a contact/credential alias, not an authorized-device identifier.
- Transferring a SIM or phone number does not transfer the authorized-device key.
- The temporary SMS challenge is consumed in PostgreSQL before device authorization.
  Neither its plaintext code nor its protected verifier becomes device state, an Atome,
  a history event, synchronized data or a snapshot.

## Recovery paths

### Authorized device still available

1. Start a typed recovery transaction through `/ws/api`.
2. Send an OTP only to the currently registered verified phone.
3. Bind the OTP and device signature to the same short-lived recovery transaction,
   principal, server, purpose, request digest and expiry.
4. After both proofs succeed, allow the user to set and confirm the new passphrase.
5. Store the new Argon2id verifier atomically.
6. Revoke all prior access sessions, refresh sessions, recovery transactions and remote
   credentials, then require ordinary login.
7. Notify the user and append an immutable security event.

### All authorized devices lost, Recovery Kit available

1. Start the same recovery transaction and verify the registered phone by SMS OTP.
2. Verify the Recovery Kit without transmitting or persisting it in plaintext.
3. Apply risk controls for recent SIM/eSIM replacement, number porting, phone change,
   unusual device/network context and repeated recovery attempts.
4. Apply a security delay when risk policy requires it, notify existing sessions/devices,
   and allow cancellation from an existing trusted context if one returns.
5. Set the new passphrase, enroll the replacement device, rotate the Recovery Kit, revoke
   old devices and sessions, and require ordinary login.

### Registered phone lost, authorized device available

1. Strongly reauthenticate and approve from the authorized device.
2. Request the new phone and verify it by OTP.
3. Apply a security delay, with an initial product target of 48 hours, when changing the
   sole recovery phone.
4. Notify the old phone channel and every active authorized device immediately.
5. Allow cancellation during the delay.
6. Replace the phone alias without changing the stable principal and revoke sessions
   according to the credential-change policy.

### All devices and Recovery Kit lost

- SMS may initiate but cannot immediately complete recovery.
- A separate exceptional manual recovery may restore the account identity only after
  strengthened proof, anti-fraud review, a visible security delay and notifications.
- Support must never obtain or recreate user-held encryption keys.
- If future data is encrypted exclusively by user-held keys, identity recovery does not
  imply recovery of that data. This limitation must be disclosed before enrollment.
- The precise manual proofing policy, operator roles, evidence retention, appeal path and
  privacy requirements must be defined and approved before this exceptional route ships.

## Current verified gap

- Fastify's historical password-reset route accepts phone + SMS OTP + new password as the
  complete proof.
- OTP state is currently process-local and does not provide a durable multi-instance
  recovery transaction.
- The current reset does not explicitly revoke every access session, refresh session,
  authorized device and in-flight recovery transaction.
- No maintained production implementation of authorized-device keys or a Recovery Kit
  was found.
- A conceptual zero-knowledge document already anticipated a local Recovery Kit,
  authorized devices, delayed phone change and the rule that SMS alone only initiates
  recovery; this todo turns the validated product choice into executable active work
  without treating that concept document as implemented authority.

## Dependencies

- `todo/cleanup_architecture/stable_user_identity_independent_of_phone.md`
- `todo/cleanup_architecture/explicit_cross_runtime_account_provisioning.md`
- `todo/cleanup_architecture/argon2id_password_hash_migration.md`
- WebSocket-only authentication and secure refresh-session revocation
- `todo/cleanup_architecture/production_sms_provider_boundary.md`
- Transactional PostgreSQL challenge/recovery storage defined by
  `todo/cleanup_architecture/production_sms_provider_boundary.md`

## Executable scope

1. Define versioned authorized-device, recovery-kit and recovery-transaction schemas.
2. Implement protected device-key enrollment, signing, inspection and revocation across
   Fastify, Tauri and supported iOS paths.
3. Implement Recovery Kit generation, display, save verification, verifier storage,
   use, rotation and destruction.
4. Replace independent OTP calls with one typed, expiring, single-use recovery
   transaction that binds every proof and state transition.
5. Implement the four recovery paths and their UI, accessibility, localization,
   notifications, delays, cancellation and typed failure states.
6. Atomically update the Argon2id verifier, revoke all sessions/devices required by the
   chosen path, append the security event, and require normal login.
7. Define anti-enumeration, rate-limit, replay, SIM/number-change risk and support-access
   policies without exposing private recovery metadata. Use progressive
   multidimensional throttling and never a fixed failure threshold that globally locks
   the account.
8. Keep SMS-only recovery active during implementation, then remove it in the same
   release/transactional activation that enables the validated replacement.
9. Add a guardrail forbidding password reset from SMS proof alone after activation.
10. Update active authentication, security, offline, support and operational documents.

## Exit criteria

- Recovery on the existing phone succeeds with SMS plus the authorized app key.
- Recovery on a replacement phone succeeds with SMS plus a valid Recovery Kit.
- Phone replacement succeeds from an authorized device without changing the principal.
- SMS possession alone cannot replace the password after the new contract is activated.
- There is never a deployed state with neither the legacy nor the replacement recovery
  mechanism available.
- Every successful recovery revokes required sessions and devices, requires normal login,
  notifies the user, and appends an immutable audit event.
- Recovery secrets, OTPs, device private keys and sensitive proof material never enter
  logs, public state, sync events, exports or client-visible directory data.
- Support cannot retrieve user-held recovery or encryption secrets.
- Recovery security records use opaque references, a rotating keyed network fingerprint
  and normalized client families; they never retain raw IP addresses or full user-agent
  strings and follow the approved security-journal retention policy.

## Required validation

- End-to-end tests for every recovery path on Fastify, Tauri and supported iOS runtimes.
- SIM swap/number port, OTP interception, replay, expiry, wrong device, revoked device,
  wrong Recovery Kit, brute force, concurrency and interrupted-transition tests.
- Denial-of-service tests proving that failures submitted by a third party cannot
  globally lock the victim's account.
- Session, token, device and recovery-transaction revocation tests.
- Recovery Kit print/QR/save-verification/rotation tests without plaintext leakage.
- Security-delay notification and cancellation tests.
- Upgrade tests proving continuous recovery availability during the transition and
  absence of SMS-only reset after activation.
- Repository scans for OTP, recovery-key, token and device-secret leakage.
- Security-journal minimization, access-control and automatic-retention tests.
- `npm run check:execution-order` and the narrowest authentication, security, persistence,
  WebSocket, notification, Rust and supported iOS suites.
