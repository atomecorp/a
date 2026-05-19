# ThermUSS — Security, Data & Compliance Architecture (Full Audit-Ready Version)

---

## 1. Purpose of this document

This document describes the complete ThermUSS system architecture, including:

* user data collection
* secure transport
* isolated storage
* encryption
* anonymization
* statistical processing
* GDPR / CNIL / RIPH3 compliance

This document is intended to serve as a usable foundation for:

* CNIL audits
* security audits
* CPP (RIPH3) submissions

---

## 2. Global architecture

```text
User Application
        ↓
ThermUSS Router
        ↓
Isolated User Jail
        ↓
Encrypted User Storage
        ↓
OpenAnonymizer (inside the jail)
        ↓
Statistical Contribution
        ↓
Stats Intake API
        ↓
Statistical Mixer
        ↓
Stats Store
```

---

## 3. Fundamental principle

```text
ThermUSS transports and hosts.
The user owns and reads.
```

No raw data must ever be readable server-side.

---

## 4. Detailed data flow

1. User enters data in the application
2. Data is encrypted locally
3. Data is transmitted securely (TLS)
4. Router identifies the target jail
5. Opaque transmission occurs
6. Data is stored encrypted inside the jail
7. Decryption is performed only on the user side

---

## 5. Encryption model (end-to-end)

### 5.1 Principles

* encryption before leaving the device
* server has no access to encryption keys
* data remains encrypted at rest

### 5.2 Key management

* keys generated user-side
* secure storage (Secure Enclave / Keystore)
* keys never transmitted to the server

### 5.3 Lifecycle

```text
Generation → Storage → Usage → Rotation → Revocation
```

### 5.4 Constraints

* no server-side master key
* secure multi-device support
* device revocation capability

---

## 6. ThermUSS Router

### 6.1 Role

* authentication
* jail identification
* packet routing

### 6.2 Forbidden operations

* decryption
* business-level inspection
* data storage

### 6.3 Authorized logs

* technical identifier
* timestamp
* packet size
* delivery status

---

## 7. User jail

### 7.1 Purpose

* strong per-user isolation
* dedicated storage

### 7.2 Guarantees

* inter-user separation
* process isolation

### 7.3 Security

* CPU/RAM quotas
* filtered networking
* minimal permissions
* no inter-jail access

### 7.4 Limitation

The jail alone does not guarantee confidentiality without encryption.

---

## 8. Storage

* mandatory encryption
* no plaintext data
* encrypted backups
* keys absent from the server

---

## 9. Code execution

### Authorized

* client-side only
* after local decryption

### Forbidden

* router
* global server services
* admin interfaces

---

## 10. Network security

* strict TLS
* HSTS
* certificate pinning
* MITM protection
* short-lived tokens

---

## 11. Device management

* secure onboarding
* revocation capability
* secure key storage

---

## 12. Backups

* encrypted
* unreadable
* restoration without data access

---

## 13. Administration

### Authorized

* maintenance
* supervision

### Forbidden

* reading user data

---

## 14. Separation of data levels

### Level 1 — Personal data

* raw data
* health-related information
* encrypted storage
* user-only access

### Level 2 — Pseudonymized research data

* regulated research usage
* restricted access

### Level 3 — Anonymized statistical data

* aggregates only
* practical irreversibility

---

## 15. OpenAnonymizer

### 15.1 Purpose

Local transformation into non-identifiable statistical data.

### 15.2 Functions

* identifier removal
* generalization
* aggregation
* rare data suppression
* optional statistical noise

### 15.3 Constraints

* k-threshold ≥ 10
* rejection of contributions from groups that are too small

---

## 16. Statistical pipeline

```text
Jail
 ↓
OpenAnonymizer
 ↓
Stats Intake API
 ↓
Statistical Mixer
 ↓
Stats Store
```

### Rules

* no individual-level data
* deletion after aggregation
* no user traceability

---

## 17. Re-identification protection

* k-anonymity
* suppression of low-population categories
* prohibition of fine-grained cross-filtering
* re-identification risk auditing

---

## 18. Free-text handling

* forbidden in raw statistical exports
* mandatory local processing

---

## 19. GDPR — Processing register

### Data controller

Université Clermont Auvergne (to be confirmed)

### Purpose

* public health research
* prevention

### Data categories

* perceived health
* lifestyle habits
* environmental data

### Retention period

To be defined.

### Recipients

* authorized researchers only

---

## 20. RIPH3 consent model

* mandatory prior information
* recorded non-opposition
* withdrawal capability

---

## 21. User rights

* access
* deletion
* export

---

## 22. Threat model

Protected against:

* external attackers
* malicious administrators
* data leaks
* MITM attacks
* statistical re-identification

---

## 23. Security level

"Very high security by design, with no server-side access to raw user data."

---

## 24. Conclusion

ThermUSS implements:

* end-to-end encryption
* strong isolation
* local anonymization
* secure statistical aggregation

Objectives:

* maximum confidentiality
* regulatory compliance
* secure scientific exploitation
