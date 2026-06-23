ThermUSS — Architecture Security, Data Protection & Compliance

Complete Audit-Ready Specification

⸻

1. Purpose

This document describes the complete ThermUSS architecture, including:

* user data collection
* transport
* storage
* protection
* anonymization
* statistical processing
* GDPR / CNIL / RIPH3 compliance

This document is intended to support:

* CNIL audits
* security audits
* CPP / RIPH3 submissions

⸻

2. Global Architecture

User Application
        ↓
ThermUSS Router
        ↓
Dedicated User Jail
        ↓
Encrypted User Storage
        ↓
OpenAnonymizer
        ↓
Statistical Contribution
        ↓
Stats Intake API
        ↓
Statistical Mixer
        ↓
Stats Store

⸻

3. Fundamental Principle

ThermUSS transports and hosts.
The user owns and reads.

No raw user data must ever be readable by ThermUSS servers.

⸻

4. Open Source Governance

The following components are fully open source and publicly auditable:

* ThermUSS Router
* Jail Management Layer
* OpenAnonymizer
* Statistical Mixer

The following components may remain proprietary:

* ThermUSS User Interface
* Forms
* Business Logic
* User Experience
* Reporting Dashboards

This separation allows external auditors to verify that user data cannot be accessed or reconstructed by ThermUSS.

⸻

5. Data Flow

1. User enters information in the application
2. Data is encrypted locally
3. Data is transmitted through TLS
4. Router identifies the destination jail
5. Router forwards encrypted payload
6. Data is stored encrypted
7. Decryption occurs only on authorized user devices

⸻

6. End-to-End Encryption Model

6.1 Principles

* encryption before leaving the device
* server has no decryption capability
* data remains encrypted at rest

6.2 Key Management

* keys generated client-side
* Secure Enclave / Android Keystore
* keys never transmitted to servers

6.3 Lifecycle

Generation
    ↓
Secure Storage
    ↓
Usage
    ↓
Rotation
    ↓
Revocation

6.4 Constraints

* no server-side master key
* secure multi-device support
* compromised device revocation

⸻

7. ThermUSS Router

Responsibilities

* authentication
* destination jail identification
* packet routing

Forbidden

* decryption
* content inspection
* business processing
* readable storage

Allowed Logs

* technical session identifier
* aggregated timestamp
* payload size
* delivery status

No personal data may be logged.

⸻

8. Dedicated User Jail

Objective

* one isolated environment per user
* dedicated encrypted storage

Guarantees

* user isolation
* process isolation
* resource isolation

Security Controls

* CPU quotas
* RAM quotas
* network filtering
* firewall rules
* minimal privileges
* no inter-jail communication

Limitation

A jail alone does not provide confidentiality without encryption.

⸻

9. Storage

* mandatory encryption
* no plaintext data
* encrypted backups
* no server-side decryption keys

⸻

10. Code Execution Rules

Allowed

* client-side execution
* local processing after decryption

Forbidden

* router execution on raw data
* server-side processing of raw data
* administrative access to raw data

⸻

11. Network Security

* TLS 1.3
* HSTS
* certificate pinning
* MITM protection
* short-lived tokens

⸻

12. Authorized Devices

* secure onboarding
* device revocation
* hardware-backed key storage

⸻

13. Backups

* encrypted
* unreadable by administrators
* restoration without plaintext access

⸻

14. Administration

Administrators may:

* maintain infrastructure
* monitor availability
* manage resources

Administrators may never:

* read user data
* decrypt user databases
* access health information

No administrator possesses decryption keys.

⸻

15. Data Classification

Level 1 — Personal Data

* raw user information
* health-related data
* encrypted storage
* user-only access

Level 2 — Anonymized Statistical Data

* aggregated metrics
* irreversible anonymization
* no individual traceability

No intermediate pseudonymized storage layer is part of the target architecture.

⸻

16. OpenAnonymizer

Objective

Transform personal data into non-identifiable statistical contributions.

Execution Location

OpenAnonymizer executes inside the user’s trusted environment:

* preferably on the user’s device
* optionally inside the user’s jail

Raw data must never leave the trusted user environment.

Functions

* direct identifier removal
* data generalization
* aggregation
* suppression of rare data
* optional differential privacy noise

Constraints

* k-anonymity threshold ≥ 10
* automatic rejection of small groups

⸻

17. Statistical Pipeline

User Environment
        ↓
OpenAnonymizer
        ↓
Stats Intake API
        ↓
Statistical Mixer
        ↓
Stats Store

Rules:

* no individual records
* no individual identifiers
* contribution deletion after aggregation
* no user traceability

⸻

18. Statistical Mixer

The Statistical Mixer:

* receives statistical contributions
* aggregates data
* applies anonymity thresholds
* deletes source contributions after processing

The Statistical Mixer exposes:

No API capable of reading individual contributions.

Only aggregated results may be queried.

⸻

19. Re-identification Protection

* k-anonymity
* suppression of weak categories
* prevention of fine-grained cross-filtering
* periodic privacy audits

⸻

20. Free Text Handling

Raw free-text fields must never leave the trusted user environment.

Allowed approaches:

* local summarization
* local categorization
* local NLP processing

Forbidden:

* transmission of raw comments

⸻

21. GDPR Registry

Controller:

* Université Clermont Auvergne (to be confirmed)

Purpose:

* public health research
* prevention
* thermal treatment assessment

Recipients:

* authorized researchers only

Retention:

* to be formally defined

⸻

22. RIPH3 Consent

* mandatory participant information
* documented non-opposition process
* withdrawal at any time

⸻

23. User Rights

* access
* deletion
* export

⸻

24. Threat Model

Protected against:

* external attackers
* malicious administrators
* insider threats
* data leaks
* MITM attacks
* re-identification attempts

⸻

25. Security Statement

Very high security by design,
with no server-side access
to raw user data.

⸻

26. Audit Conclusion

ThermUSS implements:

* end-to-end encryption
* strong user isolation
* zero-knowledge architecture
* local anonymization
* secure statistical aggregation

Goals:

* maximum confidentiality
* regulatory compliance
* secure scientific exploitation
* demonstrable protection against server-side access to personal data