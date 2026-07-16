# Post-Quantum Cryptography Integration Plan for Atome / Squirrel

Status: Specification

This document is a deferred research and architecture specification. It is not an active implementation plan and its checkboxes do not authorize executable work.

Activation requires a separate product decision and registration in `todo/execution_order.md` with:

* a current threat model and protected-data classification;
* selected standardized algorithms and migration formats;
* verified Web, Tauri, native iOS/macOS, server, reverse-proxy, and deployment compatibility;
* key lifecycle, recovery, rotation, revocation, backup, and multi-device ownership rules;
* performance budgets and interoperability tests;
* a no-downgrade policy that does not introduce a silent insecure fallback.

Current runtime status:

* Server identity verification uses RSA-PSS.
* Network transport uses the deployment's current TLS stack.
* No PQC engine, liboqs binding, hybrid key exchange, ADOLE PQC encryption hook, or PQC messaging protocol is implemented.
* Cryptographic agility remains a mandatory design requirement so persisted identities and encrypted envelopes can be migrated explicitly later.

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
* [ ] Document explicit unsupported-client failure and a controlled migration/cutover
  policy; do not introduce cryptographic fallback paths.

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

* `atome/src/squirrel/crypto/crypto_engine.js`
* `platforms/desktop-tauri/src/crypto_engine.rs`
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

These steps remain non-executable until the activation requirements above are satisfied:

* Select standardized algorithms and an implementation stack from current platform evidence.
* Prototype a versioned crypto abstraction and migration envelope.
* Prepare an isolated compatibility and performance test environment.
