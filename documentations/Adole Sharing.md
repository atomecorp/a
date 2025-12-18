# Atome Sharing System – Functional Overview

## 1. Overview

The Atome sharing system defines how Atomes (including projects) can be shared between users in a controlled, explicit, and auditable way. It supports both **real-time collaboration** and **manual (non‑real‑time) publishing**, with strict user approval, offline tolerance, and deterministic synchronization.

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

Each share explicitly defines **how updates propagate**.

### 4.1 Real‑time share mode

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

### 4.2 Manual (non‑real‑time) share mode

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

* Users may modify shared Atomes while offline.
* All offline actions are stored locally as ordered deltas.
* When connectivity returns:

  * deltas are replayed,
  * conflicts are resolved deterministically,
  * accepted changes are propagated (depending on share mode).

Resynchronization is automatic and transparent.

---

## 7. Conflict Resolution

Conflicts are resolved deterministically and never silently.

Rules:

1. Explicit permissions take priority.
2. Logical timestamps / version numbers decide ordering.
3. Atome owner is the final arbiter if required.

All resolutions are:

* persisted,
* traceable,
* reproducible.

---

## 8. Authoritative Source and Convergence

* Each shared Atome or project has a single authoritative source.
* All operations are timestamped, versioned, and strictly ordered.
* Clients may render optimistically.
* The authority validates, reorders, or rejects operations if needed.

All clients must eventually converge to the same final state.

---

## 9. Conditional Sharing (Rules-Based Access)

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
* a condition-based rule (treated as a conditional share).

Expiration behavior:

* access is revoked automatically when the duration ends,
* no manual action is required,
* expiration is persisted and auditable.

Duration is conceptually a **specialized condition** and uses the same evaluation and enforcement mechanism as conditional sharing.

---

## 11. Core Guarantees

* No share without explicit consent.
* No lost messages or requests.
* No silent synchronization.
* No hidden conflicts.
* Conditional rules are explicit and enforceable.
* Expired shares cannot leak access.
* Every action is stored, explicit, and auditable.
