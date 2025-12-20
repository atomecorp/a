# Atome Sharing System – Functional Overview

## 1. Overview

The Atome sharing system defines how Atomes (including projects) can be shared between users in a controlled, explicit, and auditable way. It supports **real-time collaboration**, **manual (non‑real‑time) publishing**, and **detached copy sharing**, with strict user approval, offline tolerance, and deterministic behavior.

No sharing is implicit. No update is silent. Every decision is persisted.

---

## 2. Mailbox / Inbox System

A mailbox system is required to handle sharing requests and Atome messages when no project is open.

* Sharing requests are delivered to the recipient’s mailbox.
* Requests persist until explicitly accepted, rejected, or blocked.
* Requests are stored even if the recipient is offline.
* Optional Atome messages can be attached to a sharing request.

This guarantees that no request or message is ever lost.

---

## User Discovery (Directory)

Sharing requires the sender to identify a recipient (typically by phone number).

To make this work consistently across runtimes:

* **Fastify is the authoritative public user directory**.
* Browser clients fetch the directory online only.
* Tauri clients cache the directory locally so that recipients remain discoverable offline.

Real-time behavior:

* When a new account is created, Fastify emits `sync:account-created` over `/ws/sync`.
* Clients update their directory cache from that event so the new user becomes shareable immediately.

Directory listing behavior:

* The user directory is exposed as a **public listing** (visibility = `public`).
* The directory listing is **paginated** (limit/offset) to avoid heavy operations with large user bases.
* For production sharing flows, prefer direct lookup by phone number rather than enumerating the entire directory.

Security constraints:

* The directory cache stores **safe identity fields only** (example: `user_id`, `username`, `phone`, `visibility`).
* The directory cache must **never** store password hashes.

Account bootstrap rule:

* If a user was created in the Browser (Fastify) and later logs in from Tauri, Tauri may bootstrap the local account on first login using the provided credentials.

This keeps user discovery bidirectional and offline-tolerant without requiring any forbidden Fastify → Tauri connection.

---

## 3. User Approval Policies (Persistent)

Every sharing request requires explicit user approval.

The recipient must choose **one policy**, which is stored in the database and automatically enforced for future requests from the same user.

Available policies:

* **One‑shot**: authorization valid for a single share, session, or published state.
* **Always**: persistent authorization for future shares from this user.
* **Never authorize requests**: all future requests from this user are automatically rejected.
* **Block all requests from this user**: no notification, no mailbox entry, hard block.

The system must store:

* initiating user,
* recipient user,
* selected policy,
* accepted permissions,
* timestamp.

---

## 4. Share Modes

Each share explicitly defines **how data propagates and how authority is handled**.

### 4.1 Real‑time share mode (Linked)

In real‑time mode:

* Any authorized modification is propagated instantly.
* Updates are applied at **property / particle level**, not full object replacement.
* All connected users see the same state live.

**What it is (simple sentence):**

> A live collaborative mode where every authorized change appears immediately for all participants.

**Advantages:**

* True live collaboration
* Immediate visual and logical consistency
* Ideal for co‑creation and shared editing

---

### 4.2 Manual (non‑real‑time) share mode (Linked)

In manual push mode:

* All modifications remain local by default.
* No background or live propagation is allowed.
* A new shared state is sent **only after an explicit publish / push action**.
* Recipients refresh only when a push occurs.

**What it is (simple sentence):**

> A controlled sharing mode where users decide exactly when a new version becomes visible to others.

**Advantages:**

* Full creative freedom without interference
* Versioned, intentional publishing
* No accidental or partial sync

---

### 4.3 Detached copy share mode (Unlinked / Forked)

In detached copy mode:

* The shared Atome is **copied at share time**.
* The recipient receives a **new Atome with its own identity, timeline, and authority**.
* There is **no synchronization** with the original Atome after the copy is created.
* Modifications on either side **never propagate** back to the other.
* The copied Atome evolves independently and has its **own lifecycle**.

Creator rule:

* The **original creator identity is preserved** as immutable metadata on the copied Atome.
* Functional ownership and authority belong to the recipient once the copy is created.

**What it is (simple sentence):**

> A sharing mode where an Atome is duplicated into an independent object that evolves freely, without any link to the original.

**Advantages:**

* Safe distribution without collaboration constraints
* No conflicts, no convergence requirements
* Ideal for templates, presets, examples, or educational sharing

---

## 5. Permissions Model

Sharing supports fine‑grained permissions:

Global permissions:

* read
* alter
* delete
* create

Optional property‑level overrides may restrict or extend permissions for specific attributes, even if broader permissions exist at the Atome level.

Permissions are enforced at runtime and during conflict resolution.

---

## 6. Offline Support and Resynchronization

* Users may modify **linked shared Atomes** while offline.
* All offline actions are stored locally as ordered deltas.
* When connectivity returns:

  * deltas are replayed,
  * conflicts are resolved deterministically,
  * accepted changes are propagated (depending on share mode).

Detached copy Atomes never participate in resynchronization, as they are fully autonomous.

---

## 7. Conflict Resolution

Conflicts apply **only to linked share modes**.

Rules:

1. Explicit permissions take priority.
2. Logical timestamps / version numbers decide ordering.
3. Atome owner is the final arbiter if required.

All resolutions are:

* persisted,
* traceable,
* reproducible.

Detached copy shares cannot generate conflicts by design.

---

## 8. Authoritative Source and Convergence

* Each **linked shared Atome or project** has a single authoritative source.
* All operations are timestamped, versioned, and strictly ordered.
* Clients may render optimistically.
* The authority validates, reorders, or rejects operations if needed.

All linked clients must eventually converge to the same final state.

Detached copy Atomes have their **own independent authority** and do not participate in convergence.

---

## 9. Conditional Sharing (Rules‑Based Access)

The sharing system must support **conditional sharing**, where access and permissions are granted **only if one or more conditions are satisfied** at evaluation time.

Conditions may apply:

* at share creation time,
* at access time,
* continuously (re‑evaluated over time).

Examples of supported conditions (non‑exhaustive):

* user attributes (e.g. `user.age > 18`),
* geographic constraints (e.g. country = France),
* temporal constraints (e.g. date > 30/01/2026),
* time windows (e.g. after 18:00 and before 19:00),
* project state, Atome metadata, or custom flags,
* any future condition defined by the system.

Conditions are:

* explicit,
* stored in the database,
* evaluated deterministically,
* extensible via a rule engine or condition DSL.

If conditions are no longer met, access is automatically suspended or revoked according to policy.

---

## 10. Share Duration and Expiration

Every share may define a **duration**, after which the share automatically expires.

Share duration may be expressed as:

* a fixed end date,
* a relative duration (e.g. 7 days),
* a recurring or bounded time window,
* a condition‑based rule (treated as a conditional share).

Expiration behavior:

* access is revoked automatically when the duration ends,
* no manual action is required,
* expiration is persisted and auditable.

Duration is conceptually a **specialized condition** and uses the same evaluation and enforcement mechanism as conditional sharing.

Detached copy Atomes are unaffected by expiration once created.

---

## 11. Core Guarantees

* No share without explicit consent.
* No lost messages or requests.
* No silent synchronization.
* No hidden conflicts.
* Clear separation between linked and detached sharing.
* Conditional rules are explicit and enforceable.
* Expired shares cannot leak access.
* Every action is stored, explicit, and auditable.
