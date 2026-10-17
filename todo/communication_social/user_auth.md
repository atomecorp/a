# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ../../AGENTS.md

If any instruction in this file conflicts with ../../AGENTS.md, ../../AGENTS.md has absolute precedence.

# User Authentication - Production TODO

## 2026-10-16 — Reconciliation of the user-confirmed SMS baseline

The user explicitly confirmed in this conversation that SMS is received and sign-in works. That existing functional baseline is complete for backlog purposes and must not be recreated or kept as a prerequisite delivery task. This is user-reported evidence, not a new Codex carrier/device run. Later 2026-10-14/15 password, pairing, deadline and security changes retain their own deployment/platform verification limits; they do not invalidate or silently broaden the earlier confirmation. ATM-2001 tracks only that remaining evolution/activation. Historical statements below about missing SMS receipt proof are dated provenance, not the current baseline status.

## 2026-10-14 — ATM-2001 implementation update (partial acceptance)

The optional-password work is implemented through the existing phone-link and device-session owners on /ws/api. First enrollment remains compulsory SMS with its existing payment/device proof; guests stay independent. FirstLaunch offers password or SMS for every submitted number, avoiding account flags. Home Security sets a password only after trusted-session proof; replacement also checks the current password and revokes other sessions. No SMS-only password reset or legacy authentication endpoint was added.

Protected authentication tables store Argon2id verifiers and progressive failure counters. New passwords require 15 Unicode code points and support at least 64, including spaces, without normalization/truncation. Successful legacy bcrypt verification immediately writes Argon2id; inputs beyond bcrypt's 72-byte proof boundary are refused for legacy migration. Server Node 25.2.1 provides native Argon2id (19 MiB/t2/p1, two simultaneous operations maximum); local sequential calibration measured 321–635ms and 61 MiB process RSS, not a production capacity claim. A maintained server-only SHA-256 blocklist at AUTH_PASSWORD_BLOCKLIST_PATH is required; absent/invalid list refuses saving, and none is configured locally. No new dependency or secret/configuration was installed.

Fresh password tests pass 5/5, covering optional setup, Unicode, wrong/unknown/SMS-only, proof, new device, renewal/revocation and controlled bcrypt migration; existing SMS/client tests pass. Real Web gestures prove masked entry, choice/back and portrait layout. Signed iOS compilation succeeds. Actual carrier SMS, Tauri UI, physical password setup/second device/expiry/restart and production deployment remain unverified. Recovery Kit/device-loss recovery is not completed by this patch. Current files/evidence and blockers are in [FRAMEWORK_STATE](../../eVe/documentations/FRAMEWORK_STATE.md#5-recent-task-record).

## 2026-10-12 tracking clarification

Canonical task: [ATM-2001](../execution_order.md). User-approved distinction: current first connection is SMS phone-link authentication. Optional password authentication is a future evolution for an already verified account: set the password inside that account, then offer password or SMS after entering its phone number. This is the same authentication workstream, not a duplicate implementation task, and the future password feature does not block sharing.

Historic password/OTP descriptions and previous test/deployment claims below are provenance, not fresh acceptance. Qualify the existing Argon2id migration and recovery contracts against the current owners before password implementation; do not re-enable a removed legacy login route as a shortcut. SMS-provider acceptance is not carrier delivery. No authentication code or provider configuration was changed in this triage.

Status: Partiel

Historical transport/security inventory — qualify against the current phone-link status:

- The HTTP routes below are historical implementation inventory. Canonical maintained
  authentication operations must migrate to `/ws/api`.
- Password hashing is currently bcrypt cost 10 on Fastify and Tauri. The product target
  is Argon2id with successful-login migration of legacy bcrypt verifiers, registered in
  `todo/cleanup_architecture/argon2id_password_hash_migration.md`.
- New and changed passwords are single-factor passphrases of at least 15 Unicode code
  points. At least 64 code points, spaces, and Unicode must be accepted without
  composition rules or truncation, and compromised/common values must be rejected.
- The first-screen `Try` guest mode remains supported and separate from account password
  verification.
- SMS-only password reset is the current transitional behavior. The validated target is
  SMS plus the authorized application device key, or SMS plus a locally saved Recovery
  Kit after device loss. The current route may be retired only when the complete
  replacement in
  `todo/cleanup_architecture/account_recovery_trusted_device_and_recovery_kit.md` is
  implemented and validated.
- All product-side authentication and OTP operations use `/ws/api`. Only the
  server-owned SMS infrastructure adapter may use the external protocol imposed by the
  configured provider. The active implementation and validation work is registered in
  `todo/cleanup_architecture/production_sms_provider_boundary.md`.

## ✅ Completed

- [x] Backend auth module (`server/auth.js`)
- [x] Historical bcrypt cost-10 password hashing baseline (superseded by the active Argon2id migration)
- [x] JWT session management with HttpOnly cookies
- [x] Registration endpoint (`POST /api/auth/register`)
- [x] Login endpoint with password verification (`POST /api/auth/login`)
- [x] Logout endpoint (`POST /api/auth/logout`)
- [x] Session check endpoint (`GET /api/auth/me`)
- [x] Profile update endpoint (`PUT /api/auth/update`)
- [x] Transitional OTP generation and verification for SMS-only password reset
- [x] Frontend UI (login, signup, profile, recovery, OTP verification)
- [x] Local/remote server configuration in frontend
- [x] CORS configuration for credentials

---

## 🔴 TODO for Production

### 1. SMS Provider Integration (Critical)

OVHcloud SMS is the selected production provider. Implement it behind the server-owned,
provider-neutral SMS transport contract defined in
`todo/cleanup_architecture/production_sms_provider_boundary.md`.

Clients and product modules must continue to use `/ws/api` exclusively. They must never
call the provider, contain its credentials, or select/fallback between providers.

Repository audit note: no maintained OVHcloud adapter or `ovh` dependency is currently
present. The existing reusable surface is the provider-neutral `sendSMS()` function,
which still fails closed in production.

---

### 2. Environment Variables (Critical)

Add these to `.env` or server environment:

```bash
# JWT & Cookie secrets (generate random 64+ char strings)
JWT_SECRET="your_very_long_random_secret_here_at_least_64_characters"
COOKIE_SECRET="another_very_long_random_secret_here_at_least_64_characters"

# OVHcloud SMS credentials, account/service name and sender configuration are
# server-only. Exact variable names must be declared with the adapter implementation
# and must never be exposed to browser, Tauri WebView or iOS WebView code.

# Production mode
NODE_ENV="production"
```

---

### 3. Temporary PostgreSQL OTP challenges

The current process-local `Map` storage is not valid for production multi-instance
operation. Use one minimal table in the existing PostgreSQL infrastructure; do not add
Valkey/Redis and do not store OTP challenges as Atomes.

Persist only a protected code verifier and minimum challenge metadata: opaque challenge
id, principal or protected pre-auth reference, purpose, expiry, attempts and consumption
state. Never persist the plaintext OTP. Verification consumes the row atomically;
expired or consumed rows are deleted. Successful enrollment persists the authorized
device and its public verification material, not the OTP.

---

### 4. Rate Limiting (Security)

Prevent brute force attacks on login and OTP endpoints.

**Install:**

```bash
npm install @fastify/rate-limit
```

**Add to server:**

```javascript
await server.register(import('@fastify/rate-limit'), {
    max: 5, // 5 attempts
    timeWindow: '1 minute'
});
```

---

### 5. Phone Number Validation (Recommended)

Add proper phone number validation and formatting.

**Install:**

```bash
npm install libphonenumber-js
```

**Usage:**

```javascript
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

if (!isValidPhoneNumber(phone)) {
    return reply.code(400).send({ error: 'Invalid phone number format' });
}
const formatted = parsePhoneNumber(phone).format('E.164');
```

---

### 6. Email authentication

Status: Obsolète

Email is not an authentication, verification, login or account-recovery mechanism.
Remove the historical optional email-verification proposal. An email address may exist
only as optional private contact/profile data for a separate explicitly requested
feature; it must not become a stable principal, mandatory credential or implicit
recovery channel.

---

### 7. Progressive authentication throttling (Security)

Do not globally lock an account after a fixed number of failed attempts. That would let
an attacker deny access to a victim by repeatedly submitting failures against a known
phone number.

- [ ] Apply progressive throttling by principal, protected phone identity, purpose,
  challenge/recovery transaction, device, network source and global sending-cost budget
- [ ] Increase delays and temporary request suppression as failures accumulate
- [ ] Preserve anti-enumeration responses and avoid revealing which limiting dimension
  was triggered
- [ ] Permit successful strong authentication to clear appropriate active throttles
  without deleting security audit evidence
- [ ] Notify the user only for meaningful security events; do not send an SMS for every
  throttling event and thereby amplify cost or harassment

---

### 8. Audit Logging (Compliance)

Record authentication security events in a dedicated minimized journal, never in Atome
business history.

- [ ] Record successful/failed logins, password changes, OTP/recovery requests, device
  enrollment/revocation and meaningful throttle decisions
- [ ] Use opaque principal/device references and a rotating keyed network fingerprint
  instead of a raw IP address
- [ ] Normalize the client to application/browser, operating-system and broad device
  families instead of persisting the complete user-agent string
- [ ] Exclude OTPs, complete phone numbers, passwords, tokens, provider credentials,
  Recovery Kit material, private keys and unrestricted payloads
- [ ] Restrict and audit journal access
- [ ] Automatically delete records after an initial six-month retention period, except
  for a documented incident or legal hold with its own narrow scope and expiry

---

### 9. HTTPS Certificate (Production)

Ensure HTTPS is enabled in production:

```bash
export USE_HTTPS=true
```

Production certificates should be in `deploy/certs/`; local self-signed certificates should be in `dev/certs/`.

---

## 📋 Testing Checklist

- [ ] Register new user
- [ ] Login with correct credentials
- [ ] Login with wrong password (should fail)
- [ ] Session persistence after page reload
- [ ] Logout clears session
- [ ] OTP request sends SMS
- [ ] Password reset with valid OTP
- [ ] Password reset with invalid OTP (should fail)
- [ ] Duplicate phone registration (should fail)
- [ ] Remote server configuration works

---

## 📁 Related Files

- `server/auth.js` - Authentication module
- `server/server.js` - Server integration
- `src/application/examples/user_creation.js` - Frontend UI
- `database/db.js` - Database configuration
