# Argon2id password-hash migration

Status: Actif

## Product decision

Argon2id is the canonical password-hashing algorithm for new and changed credentials on
Fastify, Tauri, and every supported runtime that stores a password verifier.

Existing bcrypt hashes remain accepted only as legacy migration input. After a successful
bcrypt verification, the runtime must immediately replace the stored verifier with an
Argon2id hash before completing the authenticated operation. Failed authentication must
never trigger migration.

Passwords are currently used as a single authentication factor. New passwords and
password changes must therefore contain at least 15 Unicode code points. Every supported
runtime must accept at least 64 Unicode code points, including spaces, and must verify the
entire submitted password without truncation.

Do not impose uppercase, lowercase, digit, symbol, or periodic-rotation composition
rules. Reject passwords found in the maintained compromised/common-password blocklist
through a privacy-preserving check. Force a credential change only after verified
compromise, explicit user action, or controlled account recovery.

## Current verified gap

- Fastify hashes and verifies passwords with bcrypt cost 10 in `server/auth_crypto.js`.
- Tauri uses the Rust `bcrypt` crate with cost 10 in
  `platforms/desktop-tauri/src/server/local_auth.rs`.
- The Tauri dependency graph contains bcrypt but no Argon2 implementation.
- Active documentation inconsistently described Argon2 locally and bcrypt remotely.
- Password validation is inconsistent: registration requires eight characters while one
  Tauri password-change path accepts six.
- The current guest bootstrap performance contract explicitly depends on bcrypt cost 10.
  Guest mode must remain responsive, but it must not weaken the authenticated-account
  password hashing target.

## Security baseline

- Use Argon2id version 1.3 with a unique random salt per credential.
- Parameters must be calibrated independently for server and supported client hardware,
  but no production profile may be weaker than the maintained project security baseline.
- The initial minimum baseline is OWASP's Argon2id profile of 19 MiB memory, 2 iterations,
  and parallelism 1. A stronger calibrated profile is preferred when the runtime budget
  permits it.
- Store algorithm, version, memory, iteration, parallelism, and salt information in the
  encoded verifier.
- Limit concurrent password-hash work and rate-limit authentication so memory-hard
  verification cannot become an unauthenticated resource-exhaustion vector.
- Password length and normalization rules must be identical across registration, login,
  password change, reset, Fastify, Tauri, and supported iOS paths.
- Length is counted in Unicode code points, not UTF-8 bytes or UTF-16 code units. The
  verifier must preserve the user's exact password input other than a single explicitly
  documented cross-runtime encoding contract; silent trimming or case conversion is
  forbidden.
- New and changed passwords require at least 15 code points while password remains the
  sole authentication factor, and every runtime must support at least 64 code points.
- New and changed passwords must be checked against a maintained compromised/common
  password blocklist without disclosing the full password to an external service.

## Dependencies

- `todo/cleanup_architecture/stable_user_identity_independent_of_phone.md`
- `todo/cleanup_architecture/explicit_cross_runtime_account_provisioning.md`
- `todo/cleanup_architecture/account_recovery_trusted_device_and_recovery_kit.md`
- Canonical WebSocket-only authentication operations
- Secure session rotation and append-only security audit events

## Executable scope

1. Define one versioned password-verifier contract and shared compatibility fixtures for
   Fastify, Tauri, and supported iOS implementations.
2. Add Argon2id implementations using maintained platform libraries; do not implement
   cryptographic primitives locally.
3. Generate only Argon2id hashes for registration, password change, password reset,
   explicit provisioning, and credential repair.
4. Detect legacy bcrypt verifiers by their encoded format, verify them with the existing
   bcrypt implementation, and rehash with Argon2id after successful authentication.
5. Persist the upgraded verifier atomically and audit the algorithm upgrade without
   logging the password, hash, salt, or sensitive verifier metadata.
6. Keep bcrypt verification code only while unmigrated hashes exist. Add a measured
   removal gate and prohibit creation of new bcrypt hashes.
7. Calibrate Argon2id parameters on representative Fastify, desktop Tauri, and supported
   mobile hardware; document latency, memory, concurrency, and denial-of-service limits.
8. Unify password length, Unicode handling, byte limits, error semantics, and rate limits
   across every credential operation and runtime.
   Enforce the 15-code-point minimum for new/changed single-factor passwords, accept at
   least 64 code points including spaces, and remove contradictory six/eight-character
   rules.
9. Separate password-authenticated account work from the passwordless `Try` guest path so
   guest workspace opening does not create a reusable password verifier or weaken the
   account security profile.
10. Update architecture maps, authentication documentation, operational guidance, and
    repository guardrails.
11. Add privacy-preserving compromised-password screening with deterministic offline and
    unavailable-service behavior. A screening service outage must return a typed error
    for credential creation/change rather than silently skipping the required check.

## Exit criteria

- Every newly created or changed account credential is stored as Argon2id.
- A successful login with an existing bcrypt verifier upgrades it atomically to Argon2id.
- Wrong passwords, interrupted upgrades, concurrent logins, and storage failures cannot
  corrupt the verifier or authenticate without a completed valid verification.
- Fastify, Tauri, and supported iOS paths accept the same compatibility fixtures and
  enforce the same minimum security baseline and password rules.
- New and changed passwords shorter than 15 Unicode code points are rejected uniformly;
  passwords of at least 64 code points, spaces, and Unicode are accepted and verified
  without truncation.
- No runtime requires arbitrary character-class composition or periodic password changes.
- Known compromised/common passwords are rejected without exposing the full password.
- Guest `Try` remains functional without creating a shared or reusable account password.
- No maintained code can create a bcrypt password hash after migration.
- Operational limits prevent unbounded concurrent Argon2id memory consumption.

## Required validation

- Cross-language Argon2id and legacy bcrypt compatibility fixtures.
- Registration, login, password change, reset, provisioning, and bcrypt-upgrade tests.
- Recovery-driven replacement must follow the trusted-device/Recovery-Kit contract and
  must never treat SMS proof alone as sufficient after that contract is activated.
- Wrong-password, malformed-hash, parameter-downgrade, interruption, concurrency, and
  storage-failure tests.
- Unicode code-point, spaces, 15/64-character boundary, long-password, no-truncation,
  compromised-password, privacy, and screening-unavailable tests.
- Calibration evidence on representative Fastify, Tauri, and supported mobile targets.
- Load and rate-limit tests proving bounded memory and CPU use.
- A repository guardrail rejecting new bcrypt password-hash creation.
- `npm run check:execution-order`, relevant authentication/security suites, JavaScript
  syntax checks, Rust formatting/check/tests, and supported iOS validation.
