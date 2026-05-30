# Atome State Sync And Runtime Modes

This module is part of the active .codex rule set.

## ATOME MODEL POLICY

Mandatory reference for any code touching Atomes, Atome persistence, Atome synchronization, Atome replay, or Atome rendering:

- [atome/documentations/atome_structur_to_respect.md](../../atome/documentations/atome_structur_to_respect.md)

Canonical Atome structure:

- id
- type
- optional kind
- optional renderer
- meta
- traits
- properties

Rules:

- id is immutable;
- type is canonical;
- renderer is a UI hint only;
- the Atome contract MUST stay minimal and MUST NOT grow with view-local, DOM-local, or debug-local verbosity;
- Atome payloads MUST contain only the canonical data required for deterministic creation, replay, sync, and rendering;
- unknown properties are forbidden unless schema-authorized.
- rendering code MUST create visual output from the Atome description and MUST NOT become a parallel source of truth;
- DOM, canvas, WebGPU, native views, and any other rendering resources are disposable projections only and MUST NEVER own canonical Atome state;
- DOM-facing adapters MUST remain minimal and MUST NOT duplicate business fields, serialized particle trees, or large JSON payloads for view convenience;
- gesture, drag, resize, placement, and interaction code MUST start from described Atome state, then emit canonical mutations through the commit pipeline;
- any touched file that mixes Atome description with rendering state MUST be sanitized before feature growth continues.

atome.create MUST always include:

- complete physical characteristics;
- deterministic initialization data.

Incomplete structural definitions are forbidden.

## STATE, HISTORY, AND SYNC POLICY

Direct frontend state mutation is forbidden.

All visible writes MUST pass through:

- window.Atome.commit
- window.Atome.commitBatch

The mutation pipeline is unique and exclusive. No DOM write, local widget state, ad hoc cache, view model, renderer state bucket, or sync helper may become a parallel writable path for business mutations.

Event logs are append-only.

State must always derive from:

- snapshots;
- deterministic replay.

Authoritative role split is mandatory:

- events: immutable intent and mutation history;
- state_current: canonical projected present state derived from validated history;
- particles: canonical structural decomposition of Atome-owned data, never a shadow UI store;
- DOM: disposable rendered projection for display, interaction wiring, accessibility, and editing surfaces only;
- timeline cache: performance optimization derived from canonical history, never an authority;
- realtime patches: transport or synchronization deltas that must fold back into the canonical mutation pipeline and MUST NEVER become standalone truth.

History rules:

- immutable history;
- immutable snapshots;
- deterministic restore;
- deterministic replay;
- property-level timelines as first-class entities.

Required prohibitions:

- the DOM MUST NEVER be used as the source of truth during restore, replay, sync reconciliation, inspection, or test assertions about business state;
- view-local logic MUST NEVER decide canonical business rules or authoritative mutation ordering;
- large serialized JSON blobs in data-* attributes, dataset mirrors, or DOM annotations are forbidden;
- if a debug or repair task discovers DOM-owned truth, duplicated writable state, or view-owned business logic, the correction MUST restore a single canonical owner outside the DOM.

Mandatory regression coverage:

- touched scopes involving rendering, interaction, replay, sync, projection, or Atome serialization MUST include or update regression tests that fail when the DOM becomes authoritative;
- such tests MUST verify canonical state survives DOM teardown, rerender, hydration, replay, or reconciliation without reading truth back from the DOM.

Mandatory correction guidance:

- when diagnosing or correcting ownership or replay defects, consult the relevant audit graphs in maps/ and the authoritative architecture documentation;
- fixes MUST align the code with those audit graphs instead of preserving ambiguous ownership between DOM, state_current, particles, caches, or transport patches.

Non-deterministic replay is forbidden.

## OFFLINE AND SYNCHRONIZATION POLICY

Fastify is the canonical source of truth for all user accounts and synchronized data.

Supported execution modes:

- Web Browser;
- Tauri;
- iOS;
- AUv3;
- FreeBSD Pure OS.

All modes must support:

- offline operation;
- automatic resynchronization;
- deterministic conflict handling;
- append-only synchronization logic.

Conflict resolution MUST NEVER:

- silently overwrite state;
- discard history;
- use temporary reconciliation hacks.

Synchronization must remain:

- robust;
- deterministic;
- lossless;
- history-compatible.

## EXECUTION MODES

Per-mode mandatory stacks and constraints:

- Web Browser mode: Fastify, WebGPU, Kira WASM, Symphonia WASM.
- Tauri mode: Axum, WebGPU, native Kira, native Symphonia. Axum is the single allowed backend/runtime entry point for all Tauri work, including tests, debugging, implementation, APIs, filesystem access, local services, and integration flows. All filesystem access MUST pass through Axum. Forbidden: browser File APIs, direct WebView filesystem access, browser-side filesystem hacks, alternate Tauri server paths, ad hoc test ports, temporary dev bridges, and the test port 1430. Tauri must always target the Axum stack and must never rely on port 1430.
- iOS mode: AIS server, native SQLite iOS, WebGPU, native Kira, native Symphonia. Must be optimized for low latency, battery efficiency, offline-first operation, and mobile stability.
- AUv3 mode: AIS server, native SQLite iOS, WebGPU, native Kira, native Symphonia. Realtime constraints are mandatory: no blocking operations, no disk access in audio thread, no nondeterministic latency, and no runtime allocation in realtime audio thread.
- Pure OS FreeBSD mode: native FreeBSD runtime, Fastify server, auto-launched WebView, native Kira, native Symphonia. The system must behave as a standalone creative operating system.

## SHARING AND ACL POLICY

Sharing must always be:

- explicit;
- auditable;
- permission-driven;
- policy-validated.

Permissions apply at:

- object level;
- property level.

Implicit sharing or hidden privilege escalation is forbidden.
