# Atome Syntax Spec v1 (Tool/AI-Ready)

## Purpose

Define a **rigorous, modular object description syntax** so that:

* any Atome can be **created / modified / deleted / shared** the same way,
* tools (UI) and AI/MCP can manipulate objects **type-agnostically**,
* everything remains **secure, deterministic, auditable**, and compatible with the **Command Bus + Policy Engine**.

This document is a **spec + backlog**: what must exist, what must be enforced, and what must be modified.

---

## Non‑negotiable constraints (must always hold)

1. **No direct mutations**

   * All writes must go through **ADOLE / Command Bus**.
   * CRUD endpoints (if exposed) are a facade and must translate into Command Bus intentions internally.
   * Scripts return **intentions** (commands), never mutate state directly.

2. **Security by design**

   * Every effectful action requires:

     * `capabilities` check
     * policy decision (`ALLOW | REQUIRE_CONFIRM | DENY`)
     * audit log entry
     * idempotence

3. **Determinism**

   * Same input envelope + same state snapshot → same produced commands.
   * External non-determinism must be isolated in connectors.

4. **Fail-safe**

   * Low confidence, ambiguity, missing params, risk anomalies → block or propose.

5. **Type-agnostic tooling**

   * Tools operate on **traits/capabilities**, not hard-coded object type lists.

---

## 1) Core Object Contract (applies to every Atome instance)

Every Atome instance must support these core fields.

### 1.1 Canonical representation

```js
atome({
  id: 'string',                 // globally unique
  type: 'string',               // e.g. 'shape.rect', 'user', 'tool', 'code.module'
  kind: 'string',               // broad category: 'visual'|'media'|'identity'|'tool'|'code'|'service'|'policy'
  renderer: 'string?',          // UI renderer hint (e.g. 'dom', 'webgl', 'native')

  meta: {
    name: 'string?',
    tags: ['string']?,
    created_at: 'iso?',
    updated_at: 'iso?'
  },

  traits: ['string'],           // e.g. ['spatial2d','selectable','visual']

  properties: {                  // type-specific properties only
    // validated by the type schema
  }
})
```

### 1.2 Required semantics

* `id` is immutable.
* `type` chooses a **type definition** (schema + traits + defaults).
* `kind` may be provided by the client but must be validated against the type definition (server may normalize).
* `renderer` is an optional UI hint and must not affect logical state or ACL.
* `traits` are derived from the type definition, optionally augmented by composition.
* `properties` must validate against the type schema; unknown properties are rejected (or stored as `meta.extra` if explicitly allowed).

### 1.3 Why `traits`

Traits make tools generic.

* Scale tool requires `spatial2d`
* Color tool requires `visual`
* Trim tool requires `timeBased`

Tools must target **traits**, not object types.

---

## 2) Type Definition Contract (registry of types)

Types must be declared as first-class definitions. A type definition controls:

* property schema
* defaults
* derived traits
* derived kind
* allowed operations (optional)

### 2.1 Canonical type definition

```js
atomeType({
  name: 'shape.rect',
  version: '1.0.0',
  kind: 'visual',
  traits: ['spatial2d','visual','selectable'],

  schema: {
    position: { type: 'vec2', default: [0,0] },
    size:     { type: 'vec2', default: [100,100] },
    rotation: { type: 'number', default: 0 },
    color:    { type: 'color', default: '#ffffff' }
  },

  allow_unknown_properties: false,
  migrations: []
})
```

### 2.2 Implementation requirements

* Global registry accessible via `ctx.types.get(typeName)`.
* Validation engine for `properties` based on schema.
* Defaulting engine to fill missing `properties`.
* Migration mechanism (type version upgrades).

---

## 3) Uniform Command Bus Actions (generic operations)

All object changes must be expressed with a small set of canonical actions.

### 3.1 Canonical command envelope

```jsonc
{
  "intent_id": "uuid",
  "trace_id": "uuid",
  "source": "ai|human|system",
  "actor": { "user_id": "...", "agent_id": "...", "session_id": "..." },
  "idempotency_key": "hash",
  "dry_run": false,

  "action": "CREATE|PATCH|DELETE|SOFT_DELETE|UPDATE_ACL|BATCH",
  "target": { "id": "..." } ,
  "patch": { "properties": { ... }, "meta": { ... } },
  "preconditions": { "etag": "..." }
}
```

### 3.2 Required guarantees

* schema validation (type schema)
* permission checks (property-level if supported)
* transactions
* idempotence
* audit log entry
* standardized error format

---

## 4) Tool + Code model (UI tools)

### 4.1 `type: tool` (UI tool)

A tool is an Atome that defines UI identity + gesture mapping.

```js
atome({
  id: 'ui_scale_tool',
  type: 'tool',
  kind: 'tool',

  meta: { name: 'Scale' },
  traits: ['ui.tool'],

  properties: {
    label: 'Scale',
    icon: 'scale',
    group: 'transform',

    mode: 'continuous',            // one_shot | continuous | double_click
    gesture: 'drag_selection',     // click | drag | drag_selection | ...

    handlers: {
      on_drag_move: 'code_scale_drag'
    },

    ai_exposed: true,
    ai_name: 'ui.scale_selection'
  }
})
```

### 4.2 `type: code` (behavior script)

A script runs when triggered by a tool (or AI) and returns **commands**.

```js
atome({
  id: 'code_scale_drag',
  type: 'code',
  kind: 'code',
  traits: ['code.behavior'],

  properties: {
    language: 'javascript',

    // security metadata (policy inputs)
    capabilities: ['atome.write'],
    risk_level: 'LOW',

    // the sandboxed function
    code: async ({ ctx, event, input, state }) => {
      // must return intentions
      return { action: 'BATCH', commands: [] }
    }
  }
})
```

### 4.3 Mandatory code constraints

* sandboxed execution (no raw FS/network/process)
* limited `ctx` surface (only allowed APIs)
* returns only canonical intentions
* deterministic (avoid time/random unless injected)

---

## 5) Standard Tool Input Contract (UI/AI/Voice unified)

All tool invocations must normalize to the same `input` shape.

```jsonc
{
  "tool_id": "ui_scale_tool",
  "event": "on_drag_move",
  "input": {
    "selection": ["id1","id2"],
    "gesture": { "type": "drag", "dx": 42, "dy": -10 },
    "pivot": { "x": 100, "y": 50 },
    "params": { }
  },
  "signals": {
    "speech_confidence": 0.92,
    "entity_confidence": 0.88,
    "overall_confidence": 0.90
  }
}
```

Notes:

* UI uses `gesture`.
* AI may use `params` instead of gesture.
* voice adds `signals` for policy decisions.

---

## 6) Canonical Properties v1 (to avoid CSS-like naming chaos)

### 6.1 Principle

Atome properties must be **canonical** (stable vocabulary) and **context-free**.

* Tools and AI manipulate **canonical properties** only.
* Rendering targets (DOM, native, audio engine, timeline) are handled by **adapters**.
* `properties.dom.css` exists as an **escape hatch**, not the base model.

### 6.2 Canonical namespaces (v1)

These namespaces are recommended as the stable public surface for tools/AI:

* `layout.*` – spatial & layout

  * `layout.position: vec2` (e.g. `[x,y]`)
  * `layout.size: vec2` (e.g. `[w,h]`)
  * `layout.rotation: number`
  * `layout.scale: vec2?`
  * `layout.anchor: vec2?`

* `paint.*` – colors/material in an abstract way

  * `paint.fill: color`
  * `paint.stroke: color?`
  * `paint.strokeWidth: number?`

* `visual.*` – general visual flags

  * `visual.opacity: number` (0..1)
  * `visual.visible: boolean`
  * `visual.blendMode: string?`

* `text.*` – text semantics (when trait `textual`)

  * `text.content: string`
  * `text.size: number` (font size)
  * `text.weight: string|number?`
  * `text.family: string?`
  * `text.align: string?`

* `time.*` – timeline semantics (when trait `timeBased`)

  * `time.start: number`
  * `time.duration: number`
  * `time.end: number?` (derived)

* `audio.*` – audio semantics (when trait `audioNode`/`playableAudio`)

  * `audio.gain: number`
  * `audio.mute: boolean`
  * `audio.bypass: boolean?`

* `dom.*` – DOM-specific overrides (optional)

  * `dom.element: string?`
  * `dom.attrs: object?`
  * `dom.css: object|string?`  ← escape hatch only

### 6.3 Trait-driven mapping rules (example)

Canonical properties are mapped to target-specific properties using **traits**.

Example for `paint.fill`:

* if trait `textual` → DOM adapter maps `paint.fill` to `style.color`
* else if trait `surface`/`visual` → DOM adapter maps to `style.backgroundColor`

This prevents having multiple names like `color` vs `backgroundColor` in the Atome model.

### 6.4 Adapters (required)

Adapters translate canonical Atome properties into target-specific updates.

Minimum adapters (v1):

* `adapter.dom` (Squirrel $/element.$)
* `adapter.audit` (diff + log)

Future adapters (planned):

* `adapter.audio`
* `adapter.timeline`
* `adapter.native`

---

## 7) Examples

### 7.1 Create a rectangle (canonical properties)

```js
atome({
  id: 'logo',
  type: 'shape.rect',
  properties: {
    layout: { position: [100,50], size: [200,80] },
    paint: { fill: '#ff0000' },
    visual: { opacity: 1, visible: true }
  }
})
```

### 7.2 Patch size (works for any object with trait `spatial2d`)

Command Bus intent:

```jsonc
{
  "action": "PATCH",
  "target": { "id": "logo" },
  "patch": { "properties": { "layout": { "size": [300,120] } } }
}
```

### 7.3 Share fill color only (property-level ACL)

```jsonc
{
  "action": "UPDATE_ACL",
  "target": { "id": "logo" },
  "patch": {
    "target_user_id": "user_2",
    "permissions": {
      "properties.paint.fill": "write",
      "properties.layout.size": "read"
    }
  }
}
```

### 7.4 Scale tool (drag selection)

The scale tool should require trait `spatial2d` and only patch:

* `properties.layout.size`
* optionally `properties.layout.position` when scaling around a pivot.

---

## 8) Performance rules (must keep vanilla-like performance)

### 8.1 Key principle

Canonization must NOT imply heavy runtime overhead.
We stay **dynamic end-to-end** while using:

* precompiled mapping tables
* caching
* batching
* minimal DOM writes

### 8.2 Requirements

* **No compile step required** (no TypeScript-like build requirement). Everything remains dynamic.
* Adapters must use a **precompiled mapping** per `type + traits`.
* Tool/code execution during gestures must:

  * compute patches once
  * emit commands
  * flush writes in batches (Command Bus / adapter) at most once per animation frame.
* DOM adapter must:

  * avoid writing identical values
  * group style writes (either per property or `cssText`, measured)

### 8.3 Fast paths

Provide optimized paths for frequent properties:

* `layout.position`, `layout.size`, `layout.rotation`, `visual.opacity`, `visual.visible`

Validation strategy:

* strict validation at tool entry + Command Bus boundary
* optional reduced validation for high-frequency gesture loops (configurable)

---

## 9) What must be implemented / modified (Backlog)

### 7.1 Syntax / data model

* [ ] Enforce **Core Object Contract** (id/type/kind/renderer/meta/traits/properties)
* [ ] Add `traits` as first-class concept
* [ ] Add `atomeType()` registry + schema validation + defaults
* [ ] Decide prop addressing convention (suggested: `properties.<name>`)

### 7.2 Command Bus

* [ ] Canonical actions: CREATE/PATCH/DELETE/UPDATE_ACL/BATCH
* [ ] Schema validation on every write
* [ ] Idempotency mandatory for effectful commands
* [ ] Standardized errors

### 7.3 Tool runtime

* [ ] Tool activator: maps UI events to code atoms
* [ ] Unified tool input—from UI/voice/AI into standard `input`
* [ ] Tool state continuity (`state` between start/move/end)

### 7.4 Code runtime

* [ ] Sandbox implementation + capability-gated `ctx`
* [ ] Deterministic execution rules
* [ ] Output validator (only canonical intentions allowed)

### 7.5 AI/MCP integration

* [ ] MCP tool(s) exposing:

  * [ ] `atome.create`, `atome.patch`, `atome.delete`, `atome.share`, `atome.get`, `atome.search`
  * [ ] `ui.tool_event` for AI/voice to trigger UI tools
* [ ] Policy Engine hooks for tool invocations and code execution
* [ ] Proposal lifecycle for gated actions

### 7.6 Audit & observability

* [ ] Append-only audit log
* [ ] Redaction/encryption for sensitive data classes
* [ ] Traces (`trace_id`) across local/remote

---

## 8) Decisions to lock (needed)

* Naming: `kind` values list
* Canonical trait vocabulary (v1)
* Schema format (Zod-like vs JSON Schema-like)
* `properties` flattening vs nested (recommended: nested `properties`)
* Strictness: reject unknown properties vs allow in `meta.extra`

---

## Status

Draft v1 — ready to be refined and integrated into the main `AI.md`.
