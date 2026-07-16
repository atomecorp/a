# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# User Authentication - Production TODO

Status: Partiel

Current transport and security notice:

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
