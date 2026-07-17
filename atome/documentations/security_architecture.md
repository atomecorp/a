# Security Architecture Documentation

Status: Partiel

## Current contract and known migration gap

- Authentication and account operations are canonical application operations and must use the unified `/ws/api` WebSocket endpoint.
- `GET /api/server/identity` and `POST /api/server/verify` are limited pre-authentication bootstrap operations used to verify the remote server before credentials are sent. They do not read or mutate canonical Atome business state.
- Fastify and Tauri currently expose WebSocket authentication handlers, and the unified Squirrel adapter already sends authentication actions through `/ws/api`.
- Historical HTTP authentication route modules are not composed into maintained runtimes and are not an alternative supported contract. The completed transport migration is recorded in `done/websocket_only_atome_transport.md`.
- Authentication parity, authorization boundaries, token lifecycle, and secure real-time notification scoping remain active work. This document must not be read as proof that the full security target is already complete.
- Canonical user identity is an opaque immutable principal independent of phone. The current Fastify and Tauri phone-derived UUID v5 implementation must be migrated according to `todo/cleanup_architecture/stable_user_identity_independent_of_phone.md`; a phone is only a verified, mutable and permission-scoped credential/lookup alias.
- Cross-runtime account creation/linking is explicit. Fastify must not create a shadow account from an ordinary Tauri JWT, session read, message, share, or sync operation. The supported `Try` guest mode remains local/private with an isolated opaque guest principal and optional explicit workspace adoption; migration is tracked by `todo/cleanup_architecture/explicit_cross_runtime_account_provisioning.md`.
- Argon2id is the canonical password-verifier algorithm across Fastify, Tauri, and supported password-storing runtimes. Current bcrypt cost-10 verifiers are legacy migration input and must be upgraded atomically after successful verification according to `todo/cleanup_architecture/argon2id_password_hash_migration.md`.
- While passwords remain a single authentication factor, new and changed passwords require at least 15 Unicode code points. Every runtime must accept at least 64 code points including spaces, impose no arbitrary character-class composition or periodic-rotation rule, verify without truncation, and reject compromised/common passwords through a privacy-preserving check.
- Account recovery continues to send SMS to the single registered verified phone, but the target contract requires SMS plus an authorized-device key, or SMS plus a locally saved Recovery Kit when the device is lost. Every completed recovery revokes prior sessions, notifies the user, appends a security event and requires normal login. The current SMS-only reset remains temporarily available until the replacement in `todo/cleanup_architecture/account_recovery_trusted_device_and_recovery_kit.md` is fully validated and activated atomically.
- WebSocket exclusivity applies to every eVe/Atome client and application operation, including OTP and recovery requests. At the external infrastructure boundary only, one server-owned SMS adapter may use the OVHcloud SMS API. This is not an application transport or fallback: clients never call OVHcloud, exactly one OVHcloud SMS account is configured, and failure remains explicit. No maintained OVHcloud adapter was found yet; production implementation is tracked by `todo/cleanup_architecture/production_sms_provider_boundary.md`.
- OTP verification state is a short-lived PostgreSQL challenge, not durable account state and not an Atome. PostgreSQL stores only a protected verifier and minimum purpose/expiry/attempt/consumption metadata; plaintext OTPs are never persisted. Successful verification atomically consumes the challenge, then persists only the authorized device's public verification contract and audit metadata. OTP challenges never enter events, `state_current`, synchronization or snapshots.
- Failed authentication and OTP attempts do not cause a fixed global account lock. Abuse protection uses progressive, purpose-scoped limits across principal, protected phone identity, challenge, device, network and global SMS-cost dimensions. This prevents a third party who knows a phone number from deliberately locking its owner's account while preserving anti-enumeration responses.
- Authentication security telemetry is stored in a dedicated minimized security journal, never in Atome history. Raw IP addresses are limited to the short active throttling window; durable records use a rotating keyed network fingerprint and normalized application/browser, operating-system and broad device families instead of a complete user-agent string. Secrets and complete phone numbers are forbidden. Access is restricted and audited, and records expire automatically after an initial six-month period unless a documented incident or legal obligation authorizes a narrowly scoped extension.
- Email is not an authentication, verification, login or account-recovery mechanism. It may exist only as optional private contact/profile data for a separately requested feature and never as the stable principal or an implicit recovery channel.

## Quick Start

```bash
# Générer les clés serveur
npm run generate-keys

# Tester la vérification
npm run test:server-verification
```

## Overview

The Squirrel Framework provides local and remote user authentication with offline-first
capabilities, server identity verification, and a WebSocket-only application-operation
contract.

## Architecture

### Dual Server Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Client (Browser/Tauri)                   │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐          ┌──────────────────────────────┐  │
│  │  Auth UI/API     │          │ Server identity verification │  │
│  │  (Squirrel API)  │          │ (serverVerification.js)      │  │
│  └────────┬─────────┘          └─────────────┬────────────────┘  │
│           │                                  │                   │
│           │                    ┌─────────────┴────────────────┐  │
│           │                    │   Server Verification        │  │
│           │                    │   (serverVerification.js)    │  │
│           │                    └─────────────┬────────────────┘  │
└───────────┼──────────────────────────────────┼───────────────────┘
            │ /ws/api auth                     │ HTTP identity bootstrap
            ▼                                  ▼
┌───────────────────────┐          ┌───────────────────────────────┐
│   Axum Server (3000)  │          │   Fastify Server (3001)       │
│   (Tauri local)       │          │   (Cloud/Remote)              │
├───────────────────────┤          ├───────────────────────────────┤
│ • SQLite storage      │          │ • PostgreSQL (ADOLE schema)   │
│ • Argon2id target     │──sync──▶│ • Argon2id target              │
│ • JWT sessions        │          │ • JWT sessions                │
│ • Offline-first       │          │ • RSA server identity         │
│ • No external deps    │          │ • OTP SMS verification        │
└───────────────────────┘          └───────────────────────────────┘
```

## Components

### 1. Server Identity Verification (`server/serverIdentity.js`)

The server identity module enables clients to cryptographically verify that a server
is an official Squirrel server before sending credentials.

**How it works:**

1. Server has RSA key pair (private key kept secret, public key distributed)
2. Client sends a random 32-byte challenge
3. Server signs: `serverId:challenge:timestamp:nonce` with RSA-PSS
4. Client verifies signature using server's public key
5. Client checks fingerprint against trusted keys registry

**Files:**

- `server/serverIdentity.js` - Server-side signing module
- `server/certificates/server.key` - Private key (NEVER commit!)
- `server/certificates/server.pub` - Public key

### 2. Trusted Keys Registry (`atome/security/trusted_keys.js`)

Contains fingerprints of official server public keys. This file IS safe to commit
as it only contains public information.

```javascript
export const TRUSTED_SERVERS = {
    'squirrel-server-prod': {
        name: 'Squirrel Production Server',
        fingerprint: 'sha256:abcdef...',
        urls: ['https://api.atome.cloud'],
        environment: 'production'
    }
};
```

### 3. Client Verification (`atome/security/serverVerification.js`)

Client-side module that:

- Generates random challenges
- Sends to server and receives signed response
- Verifies RSA-PSS signature using Web Crypto API
- Computes and checks public key fingerprint
- Reports verification status (official/unofficial/failed)

### 4. Local Authentication (`platforms/desktop-tauri/src/server/local_auth.rs`)

Rust module for offline authentication:

- SQLite database for user storage
- Argon2id password hashing target (current bcrypt implementation is migration debt)
- JWT session tokens
- Sync capability via `cloud_id` field

**Canonical transport:**

The client sends typed frames to `/ws/api`:

- `{ type: "auth", action: "register", ... }` - Create an account
- `{ type: "auth", action: "bootstrap", ... }` - Resolve or create the local account bootstrap
- `{ type: "auth", action: "login", ... }` - Authenticate
- `{ type: "auth", action: "logout", ... }` - End the current session
- `{ type: "auth", action: "me", ... }` - Read the authenticated principal
- `{ type: "auth", action: "change-password", ... }` - Change the credential
- `{ type: "auth", action: "request-phone-verification", ... }` - Request phone verification
- `{ type: "auth", action: "verify-phone-verification", ... }` - Verify the submitted code
- `{ type: "auth", action: "delete", ... }` - Delete the account through the controlled account operation
- `{ type: "auth", action: "lookup-phone", ... }` - Resolve an authorized phone lookup

Fastify and Tauri must expose equivalent typed semantics. Historical HTTP auth handlers
must not be used as a fallback.

### 5. Cross-runtime account provisioning

The former `atome/security/cloudSync.js` module was removed because it implemented local/cloud account coordination through retired HTTP authentication routes and had no maintained caller.

Cross-runtime provisioning is intentionally unavailable until the explicit authenticated `/ws/api` protocol in `todo/cleanup_architecture/explicit_cross_runtime_account_provisioning.md` is implemented and validated. No implicit account creation, credential copying, or HTTP compatibility path replaces it.

## Security Best Practices

### Key Management

**NEVER commit to Git:**

- `server/certificates/server.key` (private key)
- `.env` (contains key paths and secrets)
- Any file matching `*.pem`, `*.key` patterns

**Safe to commit:**

- `server/certificates/server.pub` (public key)
- `atome/security/trusted_keys.js` (fingerprints only)
- `.env.example` (template without secrets)

### Environment Variables

```bash
# .env (DO NOT COMMIT)
SERVER_ID=squirrel-server-prod
SERVER_NAME=Squirrel Production Server
SERVER_PRIVATE_KEY_PATH=./server/certificates/server.key
SERVER_PUBLIC_KEY_PATH=./server/certificates/server.pub
LOCAL_JWT_SECRET=your-random-secret-here
```

### Generating Server Keys

```bash
# Generate new RSA key pair
npm run generate-keys

# Output includes:
# - Private key: ./server/certificates/server.key
# - Public key: ./server/certificates/server.pub
# - Fingerprint to add to trusted_keys.js
```

### Testing Server Verification

```bash
# Start the Fastify server
npm run start:server

# In another terminal, run the test
npm run test:server-verification
```

## Security Flow Diagrams

### Registration Flow

```
Client                          Local Axum                    Cloud Fastify
  │                                 │                              │
  ├──WS /ws/api: auth/register──────▶                              │
  │  {username, phone, password}    │                              │
  │                                 │                              │
  │◀──auth-response─────────────────┤                              │
  │                                 │                              │
  │ [User clicks "Sync to Cloud"]   │                              │
  │                                 │                              │
  ├─────────────────GET /api/server/identity────────────────────────▶
  │                                                                │
  │◀────────────────{publicKey, fingerprint, serverId}─────────────┤
  │                                                                │
  │ [Verify fingerprint against TRUSTED_SERVERS]                   │
  │                                                                │
  ├─────────────────POST /api/server/verify─────────────────────────▶
  │  {challenge}                                                   │
  │                                                                │
  │◀────────────────{signature, timestamp, nonce}──────────────────┤
  │                                                                │
  │ [Verify RSA-PSS signature]                                     │
  │                                                                │
  ├─────────────────WS /ws/api: auth/register───────────────────────▶
  │  {username, phone, password, requestId}                         │
  │                                                                │
  │◀────────────────auth-response──────────────────────────────────┤
  │                                                                │
  ├──WS /ws/api: account-link action (migration target)────────────▶
  │  {typed link payload, requestId}                                 │
  │                                 │                              │
  │◀──typed response────────────────┤                              │
```

The two HTTP calls above are bootstrap/security-discovery exceptions only. Registration,
login, account linking, account reads, and account mutations remain WebSocket-only
application operations.

### Server Verification Flow

```
Client                                         Server
  │                                               │
  │  1. GET /api/server/identity                  │
  ├───────────────────────────────────────────────▶
  │                                               │
  │  {serverId, serverName, publicKey,            │
  │   fingerprint, hasSigningCapability}          │
  │◀───────────────────────────────────────────────
  │                                               │
  │  2. Generate 32-byte random challenge         │
  │     challenge = crypto.randomBytes(32)        │
  │                                               │
  │  3. POST /api/server/verify {challenge}       │
  ├───────────────────────────────────────────────▶
  │                                               │
  │  Server signs: serverId:challenge:ts:nonce    │
  │  with RSA-PSS-SHA256                          │
  │                                               │
  │  {verified, signature, timestamp, nonce}      │
  │◀───────────────────────────────────────────────
  │                                               │
  │  4. Verify signature using publicKey          │
  │     crypto.verify(RSA-PSS-SHA256, data, sig)  │
  │                                               │
  │  5. Compute fingerprint of publicKey          │
  │     sha256(spki_der(publicKey))               │
  │                                               │
  │  6. Check fingerprint in TRUSTED_SERVERS      │
  │     isOfficial = fingerprint matches?         │
  │                                               │
  │  Result: {verified, isOfficial, serverName}   │
```

## File Structure

```
├── .env                                    # Secrets (GITIGNORED)
├── .env.example                            # Template for .env
├── .gitignore                              # Includes security exclusions
├── server/
│   ├── auth.js                             # Shared Fastify auth services
│   ├── auth_routes_server.js               # Identity bootstrap HTTP routes
│   ├── serverIdentity.js                   # RSA signing module
│   └── certificates/
│       ├── .gitkeep
│       ├── server.key                      # Private key (GITIGNORED)
│       └── server.pub                      # Public key
├── scripts/
│   ├── generate-server-keys.js             # Key generation script
│   └── test-server-verification.js         # Verification test
├── atome/
│   ├── security/
│   │   ├── serverVerification.js           # Client verification orchestration
│   │   ├── serverVerificationCrypto.js     # Client cryptographic verification
│   │   ├── serverVerificationState.js      # Verification state
│   │   └── trusted_keys.js                 # Trusted fingerprints
│   └── src/squirrel/apis/unified/
│       └── adole_adapter.js                # Canonical /ws/api auth client
└── platforms/desktop-tauri/
    └── src/
        └── server/
            ├── mod.rs                      # Axum server
            └── local_auth.rs               # Local auth module
```

## Threat Model

### Mitigated Threats

1. **Phishing/Impersonation**: RSA signature verification ensures only servers
   with the private key can prove their identity.

2. **Replay Attacks**: Timestamp and nonce in signed data prevent old responses
   from being reused.

3. **Key Substitution**: Fingerprint verification against known-good values
   prevents attackers from substituting their own keys.

4. **Credential Interception**: TLS is mandatory outside trusted local development.
   Identity challenge-response allows the client to verify the expected server before
   sending credentials through the authenticated WebSocket application channel.

5. **Offline Access**: Local SQLite + Argon2id enables users to authenticate
   even without internet.

### Remaining Considerations

1. **Key Rotation**: Plan for periodic key rotation and multiple trusted
   fingerprints per environment.

2. **Key Compromise**: Have a process for revoking compromised keys and
   updating trusted_keys.js in deployed apps.

3. **Client Updates**: Ensure users receive updated trusted_keys.js when
   production keys change.
