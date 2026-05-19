# Post-Quantum Cryptography Integration Plan for Atome / Squirrel

## Scope

This document outlines the technical steps to integrate post-quantum cryptography (PQC) into the Atome/Squirrel ecosystem across three layers:

1. Transport security (TLS)
2. Application-level encryption (ADOLE data model)
3. End-to-end messaging (future phase)

---

## Phase 1 — PQC Transport Layer (TLS)

### Objectives

* Enable quantum-resistant or hybrid PQC key exchange for HTTPS connections between clients and Atome servers.

### Tasks

* [ ] Choose TLS stack with PQC support (OpenSSL + liboqs or BoringSSL variants).
* [ ] Build or install OpenSSL with PQC-capable ciphers.
* [ ] Configure Nginx or other reverse proxy to enable hybrid PQC cipher suites.
* [ ] Verify compatibility with: Web (Chrome/Safari), Tauri, native iOS/macOS TLS.
* [ ] Update deployment scripts (install_server.sh, certbot config) to include PQC setup.
* [ ] Document fallback paths for clients not supporting PQC.

### Deliverables

* TLS configuration snippet
* CI/CD build instructions for PQC OpenSSL
* Compatibility test matrix

---

## Phase 2 — Crypto Abstraction Layer (Module: `crypto_engine`)

### Objectives

Create a unified API for cryptographic operations allowing seamless integration of PQC algorithms.

### Requirements

* Modular backend: classical, hybrid (classical + PQC), PQC-only.
* Bindings for Node.js (Fastify) and Rust (Tauri).
* API examples in JavaScript and Rust.

### API Surface (example)

```text
crypto_engine.generateKeyPair(scheme)
crypto_engine.hybridEncrypt(publicKey, data)
crypto_engine.hybridDecrypt(privateKey, data)
crypto_engine.rotateKeys(entityId)
crypto_engine.getSupportedSchemes()
```

### Tasks

* [ ] Evaluate liboqs bindings for Node.js and Rust.
* [ ] Implement wrapper functions with unified error model.
* [ ] Provide configuration file for scheme selection (pqc_classical_hybrid.yml).
* [ ] Add unit tests for cryptographic edge cases.

### Deliverables

* `src/squirrel/crypto/crypto_engine.js`
* `src-tauri/src/crypto_engine.rs`
* Configuration templates
* Testing harness

---

## Phase 3 — ADOLE / Data Model Integration

### Objectives

Allow Atome objects and properties to be encrypted using PQC at rest.

### Schema Extensions

Add metadata to object and property records:

```json
{
  "security": {
    "encrypted": true,
    "scheme": "hybrid_pqc_v1",
    "key_id": "string",
    "owner": "user_id"
  }
}
```

### Tasks

* [ ] Extend ADOLE object schema to support encryption metadata.
* [ ] Add automatic encryption/decryption hooks on read/write.
* [ ] Implement key management policy (key rotation, revocation, backup).
* [ ] Update offline/online sync rules to avoid leaking unencrypted material.

### Deliverables

* Updated ADOLE schema documentation
* Hook implementation in persistence layer
* Encryption policy ruleset file

---

## Phase 4 — Future: End-to-End PQC Messaging (Design Only)

### Objectives

Support PQC-ready E2E communications between users for future social/messaging features.

### Core Components (Design)

* Identity management (multi-device)
* Session management (double-ratchet-like with PQC primitives)
* Backup and recovery workflow
* Handling offline devices and resync conflicts

### Tasks (High-Level)

* [ ] Select reference protocols (Signal Protocol + PQC hybridization).
* [ ] Define message envelope format.
* [ ] Define multi-device trust model.
* [ ] Create sequence diagrams for lifecycle management.

### Deliverables (Design)

* Messaging architecture paper
* Protocol specification draft
* Multi-device identity diagrams

---

## Milestones & Time Estimates

* Phase 1: ~3–4 days
* Phase 2: ~1–2 weeks
* Phase 3: ~1–2 weeks
* Phase 4: 2–4 months (R&D)

---

## Risks & Open Questions

* Performance overhead of PQC algorithms
* Client compatibility across browsers and OS versions
* Key management UX (device loss, rotation, migration)
* Long-term algorithm agility (future NIST updates)

---

## Next Steps

* Choose PQC library (liboqs recommended baseline)
* Prototype crypto_engine with hybrid scheme (Kyber + X25519)
* Prepare staging server with PQC-enabled TLS for testing
