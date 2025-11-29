# Security Architecture Documentation

## Quick Start

```bash
# Générer les clés serveur
npm run generate-keys

# Tester la vérification
npm run test:server-verification
```

## Overview

The Squirrel Framework implements a comprehensive security system for user authentication
with offline-first capabilities and secure cloud synchronization.

## Architecture

### Dual Server Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Client (Browser/Tauri)                   │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐          ┌──────────────────────────────┐  │
│  │  Local Auth UI   │          │   Cloud Sync Module          │  │
│  │  (user_creation) │          │   (cloudSync.js)             │  │
│  └────────┬─────────┘          └─────────────┬────────────────┘  │
│           │                                  │                   │
│           │                    ┌─────────────┴────────────────┐  │
│           │                    │   Server Verification        │  │
│           │                    │   (serverVerification.js)    │  │
│           │                    └─────────────┬────────────────┘  │
└───────────┼──────────────────────────────────┼───────────────────┘
            │                                  │
            ▼                                  ▼
┌───────────────────────┐          ┌───────────────────────────────┐
│   Axum Server (3000)  │          │   Fastify Server (3001)       │
│   (Tauri local)       │          │   (Cloud/Remote)              │
├───────────────────────┤          ├───────────────────────────────┤
│ • SQLite storage      │          │ • PostgreSQL (ADOLE schema)   │
│ • Argon2 hashing      │──sync──▶│ • bcrypt hashing              │
│ • JWT sessions        │          │ • JWT + HttpOnly cookies      │
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

### 2. Trusted Keys Registry (`src/application/security/trusted_keys.js`)

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

### 3. Client Verification (`src/application/security/serverVerification.js`)

Client-side module that:

- Generates random challenges
- Sends to server and receives signed response
- Verifies RSA-PSS signature using Web Crypto API
- Computes and checks public key fingerprint
- Reports verification status (official/unofficial/failed)

### 4. Local Authentication (`src-tauri/src/server/local_auth.rs`)

Rust module for offline authentication:

- SQLite database for user storage
- Argon2 password hashing (memory-hard)
- JWT session tokens
- Sync capability via `cloud_id` field

**Routes:**

- `POST /api/auth/local/register` - Create local account
- `POST /api/auth/local/login` - Login locally
- `POST /api/auth/local/logout` - Logout
- `GET /api/auth/local/me` - Get current user
- `DELETE /api/auth/local/delete` - Delete account
- `POST /api/auth/local/update-cloud-id` - Link to cloud account

### 5. Cloud Synchronization (`src/application/security/cloudSync.js`)

Handles syncing local accounts to the cloud:

- Verifies server identity before sync
- Checks if phone number exists on cloud
- Creates new cloud account or links existing
- Handles credential conflicts
- Updates local account with cloud ID

## Security Best Practices

### Key Management

**NEVER commit to Git:**

- `server/certificates/server.key` (private key)
- `.env` (contains key paths and secrets)
- Any file matching `*.pem`, `*.key` patterns

**Safe to commit:**

- `server/certificates/server.pub` (public key)
- `src/application/security/trusted_keys.js` (fingerprints only)
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
  ├──POST /api/auth/local/register──▶                              │
  │  {username, phone, password}    │                              │
  │                                 │                              │
  │◀──{success, token, user}────────┤                              │
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
  ├─────────────────POST /api/auth/register─────────────────────────▶
  │  {username, phone, password}                                   │
  │                                                                │
  │◀────────────────{success, principalId}─────────────────────────┤
  │                                                                │
  ├──POST /api/auth/local/update-cloud-id──▶                       │
  │  {cloudId}                      │                              │
  │                                 │                              │
  │◀──{success}─────────────────────┤                              │
```

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
│   ├── auth.js                             # Fastify auth routes
│   ├── serverIdentity.js                   # RSA signing module
│   └── certificates/
│       ├── .gitkeep
│       ├── server.key                      # Private key (GITIGNORED)
│       └── server.pub                      # Public key
├── scripts_utils/
│   ├── generate-server-keys.js             # Key generation script
│   └── test-server-verification.js         # Verification test
├── src/
│   └── application/
│       ├── examples/
│       │   └── user_creation.js            # Auth UI + sync
│       └── security/
│           ├── serverVerification.js       # Client verification
│           ├── cloudSync.js                # Sync module
│           └── trusted_keys.js             # Trusted fingerprints
└── src-tauri/
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

4. **Credential Interception**: HTTPS + challenge-response means credentials
   are only sent after server is verified.

5. **Offline Access**: Local SQLite + Argon2 ensures users can authenticate
   even without internet.

### Remaining Considerations

1. **Key Rotation**: Plan for periodic key rotation and multiple trusted
   fingerprints per environment.

2. **Key Compromise**: Have a process for revoking compromised keys and
   updating trusted_keys.js in deployed apps.

3. **Client Updates**: Ensure users receive updated trusted_keys.js when
   production keys change.
