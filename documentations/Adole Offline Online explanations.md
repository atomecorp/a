# Atome – Clear Offline / Online Architecture (Ambiguity-Free)

## Purpose of this document

This document formally defines the Atome offline/online architecture and **removes all possible ambiguities** regarding:

* network roles
* connection directions
* runtime responsibilities
* localhost usage
* production vs development behavior

Its goal is to **fix the current conceptual leak** and provide a solid base to safely repair and evolve the system.

---

## Core Principle (Non‑negotiable invariant)

> **Fastify never connects to Tauri.**
> **All connections are always initiated by clients (Tauri or Browser) toward Fastify.**

Tauri is **never** a network dependency for Fastify.

---

## High‑Level Architecture Overview

Atome relies on a **hybrid offline‑first / online‑sync architecture** composed of:

1. **Tauri** — a full offline‑capable client runtime
2. **Fastify** — a central cloud server and synchronization hub
3. **Browser** — an online‑only client runtime

Each component has a **strict and exclusive role**.

---

## 1. Tauri (Offline‑First Client Runtime)

### Role

Tauri is a **self‑contained Atome runtime** designed to work with or without network connectivity.

It is the **only runtime capable of full offline operation**.

### Characteristics

* Embeds:

  * the Atome engine
  * a local SQLite database
  * an optional local HTTP/WebSocket server (`localhost`)

* Can operate in:

  * full offline mode
  * online mode
  * delayed / resumable sync mode

* A single user may:

  * run multiple Tauri instances
  * on multiple machines

* A single Tauri instance may:

  * host multiple users locally

### Local Server (Important)

* The local server (e.g. `localhost:3000`) is:

  * **private to the Tauri process**
  * **used only by the local UI**

* It is:

  * never referenced by Fastify
  * never referenced by browser clients
  * never assumed to exist

Localhost **is not part of the global architecture**.

---

## 2. Fastify (Central Server & Sync Hub)

### Role

Fastify is the **central authority** for:

* cloud storage
* synchronization
* user coordination
* cross‑device consistency

### Responsibilities

Fastify:

* stores all synchronized Atome data
* manages users, permissions and sharing
* coordinates synchronization between clients
* resolves offline / online state convergence

### What Fastify Does NOT Do

Fastify:

* does **not** connect to Tauri
* does **not** know if a Tauri instance exists
* does **not** reference `localhost`
* does **not** assume any local server

Fastify only exposes **public network endpoints**.

---

## 3. Browser (Online‑Only Client Runtime)

### Role

The browser is a **pure online client**.

It provides access to Atome features without local persistence guarantees.

### Characteristics

* No local server
* No full offline mode
* Direct connection to Fastify only

The browser **never attempts** to contact any local service.

---

## Connection Direction Rules (Critical)

All valid connections respect the following rules:

* Tauri → Fastify  ✅
* Browser → Fastify ✅

The following are **forbidden**:

* Fastify → Tauri ❌
* Browser → Tauri ❌
* Fastify → localhost ❌

Any occurrence of these is a **design error**.

---

## User Accounts vs User Directory (Important)

Atome distinguishes between:

1. **An account** (credentials + ability to authenticate)
2. **A user directory entry** (public identity data used for discovery and sharing)

This is required to keep the offline/online contract consistent and to avoid unsafe propagation of secrets.

### Directory rules

* The **authoritative public directory** is the Fastify server.
* Browser clients can only see the directory online.
* Tauri clients can cache the directory locally for offline visibility.
* The directory cache stores **safe fields only** (e.g. `user_id`, `username`, `phone`, `visibility`).
* The directory cache must **never** store password hashes.

### Real-time directory updates

Fastify broadcasts account creation/deletion events on the sync channel (`/ws/sync`).

* Event: `sync:account-created`
* Event: `sync:account-deleted`

Clients may update their local directory cache from these events.

### Account rules

* An account created on one backend may not exist on the other backend immediately.
* A Tauri client may **bootstrap** the local account on first login if the account exists on Fastify.
* If a user is created while a backend is offline, the client queues a **pending register operation** and retries automatically when sync becomes ready.

This ensures bidirectional convergence without violating the invariant that Fastify never connects to Tauri.

---

## Runtime Environment Detection

Every Atome runtime must explicitly declare its execution context.

Example conceptual model:

* runtimeType: `tauri | browser`
* hasLocalServer: `true | false`
* localEndpoint: `null | ws://localhost:XXXX`
* remoteEndpoint: `wss://api.atome.xxx`

### Important Rule

* Local endpoints are **never defaulted**
* Remote endpoints are **always explicit**
* No hard‑coded localhost addresses

---

## Offline / Online Synchronization Model

* All writes are recorded locally first
* Synchronization is client‑driven
* Fastify never pulls data from clients
* Clients push and pull based on availability

Offline is a **client concern**, not a server concern.

---

## Source of the Previous Ambiguity

The ambiguity came from:

* mixing the concepts of `local` and `tauri`
* assuming that `local = localhost`
* attempting a local WebSocket connection even in browser mode

This resulted in invalid connection attempts such as:

`ws://127.0.0.1:3000/ws/api`

when no Tauri instance existed.

---

## Architectural Contract (Summary)

1. Tauri is optional
2. Fastify is central
3. Clients always initiate connections
4. Localhost is private and ephemeral
5. No environment may assume another exists

This contract must be enforced at:

* configuration level
* runtime detection
* connection bootstrap

---

## Final Statement

This architecture guarantees:

* true offline‑first behavior
* safe cloud synchronization
* production‑ready networking
* zero localhost leakage

Any deviation from this document should be considered a **bug or a design violation**.
