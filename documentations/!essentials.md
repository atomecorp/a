# Essentials — Non‑negotiable Rules (Sync, Atome Creation, Coding)

This document consolidates the **must‑follow rules** found in the documentation folders:

- documentations/
- src/application/eVe/documentations/

It focuses on **sync**, **atome creation**, and **general coding rules**.

---

## first rules : Never use fallback

- **Fallbacks are forbidden.** If something is broken or missing, **fix it** instead of using a fallback.

---

## 1) Single Mutation Pipeline (Sync is strict)

- **Frontend must not call** `window.AdoleAPI.atomes.*` directly.
- **Frontend must not write state directly**.
- **All user‑facing changes must go through** `window.Atome.commit` or `window.Atome.commitBatch`.
- **Snapshots are explicit** and user‑driven (`window.Atome.snapshot`), never automatic.
- **Events are append‑only**; there is **one single event log**, no separate “tools history”.
- **Current state is a projection** derived from the last snapshot + replayed events.
- **Replay must be deterministic**; if not, fail loudly.
- **All mutations must be persisted and historized** through this pipeline (tools, UI, AI, batch).

Source: src/application/eVe/documentations/tools.md

---

## 1.1) Real‑time Sync & Connectivity Rules

- **All sync communications use the single WebSocket endpoint** `/ws/sync`.
- **Tauri must work fully offline**, and **sync when Fastify becomes available**.
- **Synchronization is bidirectional** (Fastify ↔ Tauri). If one side is unavailable, **changes are queued and replayed** on reconnection.
- **Fastify never connects to Tauri**; clients always initiate connections.
- **Single realtime entry point**: all realtime sync and direct-message commands are centralized in [src/squirrel/apis/unified/UnifiedSync.js](src/squirrel/apis/unified/UnifiedSync.js) and exposed as `window.Squirrel.Sync` and `window.Squirrel.SyncEngine`.

Sources: documentations/realtime_sync_architecture.md, documentations/Adole Offline Online explanations.md

---

## 2) Atome Creation — Canonical Contract

- **Every Atome must follow the canonical shape**: `id`, `type`, optional `kind`, optional `renderer`, `meta`, `traits`, `properties`.
- **`id` is immutable**.
- **`type` is canonical** and selects the type definition (schema + traits + defaults).
- **`kind` is optional** but must be validated or derived by the server.
- **`renderer` is a UI hint only** and must not affect logical state or ACL.
- **`properties` must validate** against the type schema; unknown properties are rejected (unless explicitly allowed).

Source: documentations/atome_object.md

---

## 3) Atome Creation — Required Completeness

- `atome.create` must include **all physical characteristics** needed to replay and reconstruct the object (geometry, layout, style, media references, etc.).
- Missing essential properties makes creation **invalid for persistence/replay**.
- **Default parent rule**: if `parent_id` is omitted, the system attaches the Atome to the **current project**.
- **Immutable meta**: `meta.created_by` and `meta.created_at` cannot be changed by writes.

Source: documentations/tools_api_and_coding.md

---

## 4) Command Bus & Tool/Code Model (Non‑negotiable)

- **No direct mutations**. All writes must go through **ADOLE / Command Bus**.
- Tools and code **return intentions only** (Command Bus actions), not direct effects.
- **Every effectful action requires**: capabilities check, policy decision, audit log entry, idempotence.
- **Determinism** is mandatory: same inputs + same state => same commands.
- **Sandboxed execution**: no raw FS/network/process access.
- **Tool input is standardized** across UI/AI/Voice.

Sources: documentations/atome_object.md, documentations/code&tools.md

---

## 5) History & Time‑Travel Rules

- **History is immutable**; nothing is overwritten.
- **Property‑level timelines** are first‑class; each property has its own history.
- Two modes:
  - **Copy past state into present** (append a new version).
  - **Edit the past and replay** deterministically to create a new branch.
- **Snapshots are immutable** caches derived from canonical Atome data.
- **Validation points include snapshots** and are the only trusted restore anchors.
- **Undo / restore targets a gesture end or logical event boundary**.

Source: documentations/Adole Time Machine.md

---

## 6) Squirrel.js UI Rules (Coding Standards)

- **Always use Squirrel.js APIs** for DOM manipulation, components, and events.
- **Do not use** direct DOM APIs (`document.createElement`, `innerHTML`, manual listeners) unless explicitly required.
- **Prefer built‑in components** (e.g., `Squirrel.Slider`, `Squirrel.Button`).
- **Batch updates** with `Squirrel.batch` when possible.
- **Wait for `squirrel:ready`** before using Squirrel APIs.
- **Always use arrays for `children`**, even with a single child.
- **Use the system abstraction** (`runShellCommand`) instead of direct Node/Tauri APIs.
- **Keep comments in English**.
- **Avoid console logging** unless necessary for critical debugging.

Sources: documentations/instructions_for_ai.md, documentations/using_squirrel.md

---

## 7) Component Format Rules

- Use the **template‑based `define()` pattern** for components.
- **Import `{ $, define }`** from `../squirrel.js`.
- Component names must be **kebab‑case**.
- Favor templates for simple components; use function factories only for complex logic.

Source: documentations/components.md

---

## 8) i18n Rules (eVe)

- Use `eveT()` for every label/placeholder in new tools and dialogs.
- **No fallbacks**: missing keys must be fixed, not bypassed.
- Keep keys grouped by domain (e.g., `eve.menu.*`, `eve.user.*`).

Source: src/application/eVe/documentations/int8.md

---

## 9) Separation of Logic vs Rendering

- **Type/kind/renderer are separate concepts**:
  - `type`: canonical schema
  - `kind`: optional logical category
  - `renderer`: UI hint (DOM/WebGL/Native/etc.)
- The server **must not depend on rendering**, and ACL applies to logical particles.

Source: documentations/Eden atome Database.md

---

## 10) Sharing & Public Access Rules

- **Sharing is explicit, permission‑driven, and auditable**. No silent propagation.
- **Shared data must not be redundantly stored on the server**; access is enforced via permissions.
- **Share modes**:
  - **Real‑time (linked)**: changes propagate instantly.
  - **Manual (linked)**: local changes are pushed only when explicitly published.
  - **Detached copy (unlinked)**: one‑time copy with no further sync.
- **Property‑level permissions apply** (e.g., share read‑only for `width` so recipients cannot edit it).
- **Public visibility** is supported: some documents can be **public read** or **public write** for all eVe users.

Source: documentations/Adole_Security_and_sharing.md

---

## 11) Tools API & Automation

- Tool APIs **must persist changes and be fully historized** through the mutation pipeline.
- Tools are **programmable via APIs** for batch operations and AI control.
- **Gestures (drag, resize, rotate, etc.) must be historized with high precision** so they can be replayed like a film.

Source: src/application/eVe/documentations/tools.md

---

## 12) Ontology

- **All objects and concepts are Atomes** in eVe.
