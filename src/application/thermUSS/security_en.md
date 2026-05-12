# ThermUSS — Initial Security Model: Application → Router → User Jail

## 1. Scope of this document

This document describes only the first part of the ThermUSS architecture:

```text
User Application
        ↓
Server Router
        ↓
Isolated User Jail
        ↓
User Storage
```

This document does not yet cover:

* anonymization;
* statistical export;
* data sharing;
* exploitation of results by ThermUSS or thermal stations.

The purpose of this document is solely to define how personal user data can be collected, transmitted, and stored inside a cloud jail without ThermUSS being able to read the raw content.

---

## 2. General principle

Each user owns an isolated server environment implemented as a jail.

The jail represents the user’s personal cloud space. It receives data from the user application, stores it, and allows the user to read it again from their authorized devices.

ThermUSS must not be able to read the raw data stored inside this jail.

The ThermUSS server role is therefore limited to:

* identifying the destination jail;
* routing traffic to the correct jail;
* maintaining infrastructure;
* guaranteeing technical isolation;
* ensuring service availability.

The server must not have access to readable data content.

---

## 3. Initial flow architecture

```text
┌──────────────────────────────────────┐
│          User Application             │
│     iOS / Android / Web / Desktop     │
│                                      │
│  - ThermUSS forms                    │
│  - Proprietary business logic         │
│  - Client-side encryption             │
│  - User-owned encryption key          │
└──────────────────┬───────────────────┘
                   │
                   │ Data already encrypted
                   │ Strict TLS + certificate pinning
                   ▼
┌──────────────────────────────────────┐
│            ThermUSS Router            │
│                                      │
│  - Authenticates session             │
│  - Identifies destination jail       │
│  - Routes encrypted payload          │
│  - Never decrypts content            │
│  - Never stores raw readable data    │
└──────────────────┬───────────────────┘
                   │
                   │ Opaque payload
                   ▼
┌──────────────────────────────────────┐
│         Personal User Jail            │
│                                      │
│  - Isolated environment              │
│  - Dedicated storage                 │
│  - No inter-user access              │
│  - No ThermUSS application access    │
│  - Data stored encrypted             │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│       Encrypted User Storage          │
│                                      │
│  - Jail-local database               │
│  - Encryption at rest                │
│  - No server-side key                │
│  - Readable only from authorized     │
│    user devices                      │
└──────────────────────────────────────┘
```

---

## 4. Core security rule

Data must be encrypted before leaving the user application.

The router and the jail must receive only opaque content that cannot be read without the user key.

Simple formula:

```text
ThermUSS transports and hosts.
The user owns and reads.
```

---

## 5. Zero-knowledge encryption

The target model is a server-side zero-knowledge architecture.

This means ThermUSS can technically store and synchronize data but does not possess the elements required to read it.

### 5.1. Required conditions

For the model to be credible:

* the primary encryption key is generated client-side;
* the key never leaves authorized devices;
* the server never receives the key in plaintext;
* data is encrypted before transmission;
* data remains encrypted inside the jail;
* reading is only possible on an authorized device capable of local decryption.

### 5.2. What ThermUSS must never be able to do

ThermUSS must never be able to:

* read form content;
* read user responses;
* read notes, feelings, or comments;
* reconstruct user keys;
* decrypt a jail database;
* access data through an administration interface;
* inject server-side code to read plaintext data.

---

## 6. Secure router

The router is a critical component.

Its role must remain strictly limited to transport.

### 6.1. Authorized responsibilities

The router may:

* verify user identity;
* verify that the user is allowed to write to the target jail;
* identify the destination jail;
* transmit encrypted payloads;
* log minimal technical metadata.

### 6.2. Forbidden responsibilities

The router must not:

* decrypt data;
* inspect business content;
* store readable copies;
* retain payloads;
* modify application content;
* execute ThermUSS business logic on raw data.

### 6.3. Router logs

Logs must be limited to non-sensitive technical information:

* technical session identifier;
* opaque jail identifier;
* date and time;
* payload size;
* delivery status;
* technical error code if applicable.

Logs must never contain:

* form text;
* user responses;
* health data;
* direct civil identifiers;
* full encrypted payloads unless strictly necessary.

---

## 7. User jail

Each user owns a dedicated jail.

The jail acts as an isolated personal cloud space.

### 7.1. What the jail guarantees

The jail guarantees:

* strong separation between users;
* process isolation;
* dedicated storage;
* restricted inter-user access;
* reduced risk of massive leaks;
* a clear boundary between ThermUSS infrastructure and user space.

### 7.2. What the jail alone does not guarantee

A jail alone is not sufficient to guarantee that ThermUSS can never read data.

It must be combined with:

* client-side encryption;
* absence of server-side keys;
* encryption at rest;
* strict admin access restrictions;
* hardened host system;
* audit of routing and storage code.

---

## 8. Non-executable code on raw data

A critical point is preventing ThermUSS from executing server-side code capable of reading plaintext data.

### 8.1. Rule

No proprietary ThermUSS server-side code must ever have access to decrypted data.

Proprietary logic may define:

* forms;
* screens;
* display rules;
* data structures;
* user experience.

But this logic must never execute server-side on plaintext raw data.

### 8.2. Authorized execution

Plaintext execution is authorized only:

* inside the user application;
* on an authorized device;
* after local decryption;
* under user control.

### 8.3. Forbidden execution

Execution is forbidden:

* inside the router;
* inside a ThermUSS admin interface;
* inside global server services;
* inside workers having access to raw data;
* inside a jail if the decryption key is accessible server-side.

---

## 9. Encryption at rest

Data stored inside the jail must remain encrypted.

Even if an operator, backup process, or disk access retrieves files, the data must remain unreadable.

### Requirements

* encrypted database;
* encrypted files;
* encrypted backups;
* no server-side keys;
* key rotation support;
* revocation of compromised devices.

---

## 10. User access

Users can read their data from authorized devices.

Core principle:

```text
The jail stores.
The user device decrypts.
```

The jail must not need to know the content of the data in order to return it.

---

## 11. Authorized device management

Each authorized device must own controlled cryptographic access.

### Possible approaches

* user key derived from a local secret;
* data key encrypted separately for each device;
* adding a new device validated by an already-authorized device;
* revocation of lost or compromised devices;
* secure storage using Secure Enclave, Keychain, Android Keystore, or equivalent.

---

## 12. Network security

Transport must remain secure even if application-level encryption is already applied.

### Minimum requirements

* strict TLS;
* HSTS;
* certificate pinning on mobile applications;
* rejection of invalid certificates;
* MITM protection;
* short-lived session tokens;
* controlled token renewal.

---

## 13. Jail system security

Jails must be hardened.

### Recommended measures

* one jail per user;
* minimal permissions;
* no unnecessary root access inside jails;
* no shared mounted disks between users;
* disk quotas;
* CPU/RAM limits;
* filtered networking;
* firewall per jail;
* regular system updates;
* minimized installed services;
* permission audits;
* abnormal behavior monitoring.

---

## 14. Backups

Backups must not become a security weakness.

### Rules

* encrypted backups;
* no plaintext dumps;
* no readable admin exports;
* restoration only in encrypted form;
* separation between infrastructure backup and user-side decryption.

---

## 15. Server administration

Infrastructure administration must remain separated from data access.

A ThermUSS administrator may maintain:

* servers;
* jails;
* routers;
* updates;
* availability;
* system resources.

But must never be able to read:

* user databases;
* user files;
* completed forms;
* feelings and reports;
* medical or health-related data.

---

## 16. Security level achieved

With this model, ThermUSS may state:

```text
Personal data is stored inside an isolated environment dedicated to each user.
Data is encrypted before transmission.
The server does not own decryption keys.
The router does not read content.
Data remains encrypted inside the jail.
Plaintext reading is restricted to authorized user devices.
```

This model provides a very high level of security.

However, the expression “total security” must never be used, since no computer system can guarantee absolute security.

Correct wording:

```text
Very high security by design, with no server-side access to raw user data.
```

---

## 17. Short summary

The initial ThermUSS model relies on four pillars:

1. **User application**: collects and encrypts data locally.
2. **ThermUSS router**: transports without reading.
3. **User jail**: isolates and stores.
4. **User key**: alone enables plaintext reading.

The jail provides isolation.
Zero-knowledge encryption removes server-side access.
The opaque router guarantees transport without revealing content.
Non-executable server-side code prevents ThermUSS from bypassing the model.

---

## 18. “Concrete” anonymization model (jail output)

This chapter defines the target model for extracting information from the jail without ever exposing individual data.

### 18.1. Component names

* **OpenAnonymizer** (open source, auditable)
* **Stats Intake API** (reception)
* **Statistical Mixer** (black-box aggregation)
* **Stats Store** (global statistics storage)

### 18.2. Flow

```text
User Jail (encrypted raw data)
        ↓
OpenAnonymizer (inside the jail)
        ↓
Minimal statistical contribution (no individual row)
        ↓
Stats Intake API (opaque reception)
        ↓
Statistical Mixer (aggregation + contribution deletion)
        ↓
Stats Store (global statistics only)
```

### 18.3. Non-negotiable rules

```text
No persistent individual records
No direct or indirect user identifiers
No precise timestamps (use periods)
No isolated rare data
Publication only if group size >= threshold (k-anonymity)
Contribution deletion after aggregation
No retention of entry-by-entry history
Output = global statistics only
```

### 18.4. OpenAnonymizer requirements

Mandatory functions (open source, auditable):

* direct identifier removal;
* generalization (age → ranges, date → periods, location → zones);
* free-text suppression or transformation;
* local aggregation (counts, averages, distributions);
* minimum k-threshold enforcement;
* randomization / controlled noise when needed;
* minimal payload generation (histograms, counters);
* local auditable logging (without sensitive data);
* payload signing (integrity);
* transmission of statistical contributions only.

### 18.5. Stats Intake API

Must:

* accept aggregated payloads only;
* reject payloads containing individual fields;
* never store identifiers;
* log technical metadata only;
* forward payloads to the mixer without business processing.

### 18.6. Statistical Mixer

Must:

* concatenate homogeneous contributions;
* enforce threshold rules (k, l-diversity if needed);
* produce aggregates (averages, medians, distributions);
* delete contributions after aggregation;
* prevent reconstruction of individual entries.

### 18.7. Stats Store

Contains only:

* global statistics (per period/category);
* aggregated indicators (averages, variances, distributions);
* no identifiers, no input logs, no raw data.

### 18.8. Security property

```text
No exploitable individual data leaves the jail.
No individual data is stored inside the statistical server.
Re-identification is made impractical in practice.
```

### 18.9. Regulatory positioning (GDPR / CNIL)

* target effective anonymization, not pseudonymization;
* document techniques: generalization, aggregation, randomization;
* demonstrate practical irreversibility;
* publicly audit OpenAnonymizer.

---

## 19. Next step

To be detailed later:

* collected metrics;
* k-threshold parameters;
* exact statistical payload formats;
* user consent mechanism.

---

## 20. CNIL / Audit-ready specification

This section transforms the ThermUSS model into a foundation directly usable for CNIL or security audits.

### 20.1. Threat model

The system must resist the following actors:

* external attackers;
* malicious administrators;
* insider employees;
* compromised jails;
* compromised user devices;
* MITM interception;
* statistical re-identification attempts.

Every component must be evaluated against these threats.

---

### 20.2. Key management (Zero-Knowledge)

#### Principles

* client-side key generation;
* plaintext keys never transmitted to servers;
* secure storage (Secure Enclave / Keystore).

#### Lifecycle

```text
Generation → Secure local storage → Usage → Rotation → Revocation
```

#### Constraints

* no server-side master decryption key;
* secure multi-device support;
* compromised device revocation.

---

### 20.3. Authentication and access

* strong authentication;
* strict user → jail association;
* prohibition of inter-jail writing;
* isolated sessions.

---

### 20.4. Data integrity

* client-side payload signing;
* server-side signature verification;
* anti-replay protection;
* secure timestamp validation.

---

### 20.5. Anti-abuse protection

* contribution rate limiting;
* abnormal pattern detection;
* uniqueness proof without direct identity;
* consistency validation.

---

### 20.6. Anonymization parameters

* minimum threshold k ≥ 10 (adjustable);
* automatic suppression of weak categories;
* systematic generalization;
* prohibition of isolated rare data.

---

### 20.7. Secure logging

* technical logs only;
* no personal data;
* tamper protection;
* limited retention.

---

### 20.8. Secure updates

* mandatory signed updates;
* client and server verification;
* rollback support;
* deployment version audits.

---

### 20.9. Availability and resilience

* encrypted backups;
* jail redundancy;
* restoration without data access;
* fault tolerance.

---

### 20.10. User rights (GDPR)

* right of access;
* right to deletion;
* user data export;
* lost access management.

---

### 20.11. Metadata protection

* strict minimization;
* no long-term IP storage;
* temporal aggregation;
* removal of identifying behavioral patterns.

---

### 20.12. Audit proof

* OpenAnonymizer fully open source;
* reproducible builds;
* hashes of deployed versions;
* provable code ↔ execution correspondence.

---

## 21. Audit conclusion

```text
ThermUSS implements a distributed zero-knowledge architecture.
Personal data remains isolated inside user jails.
The server possesses no means to read raw data.
Outgoing data is strictly anonymized and aggregated.
The system is designed to prevent practical re-identification.
```

This document constitutes a strong basis for:

* CNIL audits;
* security audits;
* GDPR compliance certification.
