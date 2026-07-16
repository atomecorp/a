# Atome Structure To Respect

## Purpose

This document defines the mandatory architecture for any Atome description, its persistence model, its history model, and the strict separation between description and rendering.

This file is normative for every module that creates, validates, mutates, persists, synchronizes, replays, or renders Atomes.

Reference sources:

- [eVe/documentations/atome_persistence_contract.md](../../eVe/documentations/atome_persistence_contract.md)
- [eVe/documentations/eVe_canvas.md](../../eVe/documentations/eVe_canvas.md)
- [atome/documentations/ADOLE.md](./ADOLE.md)
- [database/schema.sql](../../database/schema.sql)

## 1. Non-Negotiable Architecture

An Atome is first a description, not a DOM node, not a WebGPU resource, not a native widget, and not a transient visual cache.

The canonical architecture is:

1. Atome description.
2. Type definition and validation.
3. Command and event mutation pipeline.
4. Persistent storage and history.
5. Derived current-state projection.
6. Rendering projection.

The rendering engine must only consume a valid Atome description and create a visual projection from it.

The rendering engine must never become the canonical owner of:

- geometry;
- spatial coordinates;
- visual properties;
- metadata;
- hierarchy;
- type or kind;
- history;
- synchronization state.

The view is disposable. The description is canonical.

## 2. Canonical Atome Description Format

Every Atome must be representable with this envelope:

```js
{
  id: 'string',
  type: 'string',
  kind: 'string?',
  renderer: 'string?',
  meta: {
    name: 'string?',
    tags: ['string']?,
    created_at: 'iso?',
    updated_at: 'iso?'
  },
  traits: ['string'],
  properties: {}
}
```

### 2.1 Field semantics

`id`

- Global immutable identifier.
- Must never be repurposed for visual naming.

`type`

- Canonical type identifier.
- Chooses the type definition, schema, defaults, and derived traits.

`kind`

- Broad logical family.
- Must be validated against the type definition.
- Must not be used as a renderer switch when `type` already defines the object contract.

`renderer`

- Optional non-authoritative projection metadata.
- The visible product renderer is always the shared Bevy/WebGPU route.
- This field may select a projection profile, material family, or capability inside the shared Bevy pipeline, but it must never select DOM, WebGL, a compatibility renderer, or another visible backend.
- It must never change logical identity, permissions, or canonical state semantics.

`meta`

- Non-rendering descriptive metadata.
- Includes naming, tags, timestamps, and audit-friendly description fields.

`traits`

- Capability-oriented descriptors derived from the type definition.
- Tools must target traits and capabilities, not special-case object-type lists.

`properties`

- Type-specific data only.
- Must be validated by the type schema.
- Unknown properties are forbidden unless explicitly authorized by schema.

## 3. Canonical Separation Between Description And Display

The Atome description and the visual projection must stay detached.

### 3.1 Mandatory rule

Rendering code must follow this direction only:

```text
Atome description -> renderer -> visual projection
```

The reverse direction is forbidden as a state source:

```text
DOM or canvas state -> canonical Atome state
```

### 3.2 What the renderer is allowed to do

- Read a validated Atome description.
- Resolve an internal Bevy projection profile from the optional `renderer` hint.
- Allocate visual resources.
- Project geometry, media, text, and styling from `properties`.
- Release and rebuild visual resources at any time.

### 3.3 What the renderer is not allowed to do

- Invent canonical properties locally.
- Store the authoritative position only in `style.left` or `style.top`.
- Store the authoritative size only in the DOM or GPU resource.
- Infer canonical state from view-only drift.
- Keep a parallel visual-only source of truth for canonical Atome data.
- Persist state without the canonical commit pipeline.

### 3.4 Interaction rule

Pointer, keyboard, gesture, and media interactions may read live input from the runtime surface, but the mutation baseline must come from the Atome description, not from previously drifted DOM values.

Correct interaction flow:

```text
described state + live input delta -> command -> event log -> projection refresh -> renderer update
```

Forbidden interaction flow:

```text
DOM position + live input delta -> direct DOM mutation becomes canonical state
```

### 3.5 Visual caches

DOM nodes, WebGPU buffers, textures, canvases, native handles, and layout caches are view artifacts only.

They may be rebuilt from the Atome description at any time.

If deleting a visual node destroys information that cannot be reconstructed from the Atome description and its persisted history, the architecture is wrong.

## 4. Type Definitions And Validation

Every `type` must be backed by a type definition that owns:

- kind derivation;
- traits derivation;
- property schema;
- defaults;
- migrations;
- validation rules.

Minimal example:

```js
{
  name: 'shape.rect',
  version: '1.0.0',
  kind: 'visual',
  traits: ['spatial2d', 'visual', 'selectable'],
  schema: {
    left: { type: 'string' },
    top: { type: 'string' },
    width: { type: 'string' },
    height: { type: 'string' },
    color: { type: 'color' }
  },
  allow_unknown_properties: false,
  migrations: []
}
```

This means:

- rendering code consumes validated properties;
- persistence code stores validated properties;
- tools know which traits and operations are legal;
- replay stays deterministic.

## 5. Canonical Persistence Contract

All durable Atome mutations must follow this pipeline:

```text
UI or tool action
  -> window.Atome.commit or window.Atome.commitBatch
  -> server event commit entry point
  -> database/adole.js
  -> events + particles_versions + state_current + sync_queue
```

Any durable write path outside this pipeline is architectural debt.

### 5.1 Database storage model

The current database model stores Atomes across coordinated tables:

`atomes`

- Identity and hierarchy.
- Stores `atome_id`, `atome_type`, `parent_id`, `owner_id`, `creator_id`, timestamps, deletion state, and sync fields.

`particles`

- Canonical current property values in key-value form.
- Stores one row per logical property for an Atome.

`particles_versions`

- Property-level history.
- Stores old value, new value, version number, actor, and timestamp.

`events`

- Append-only mutation log.
- Source of truth for durable mutation history.

`state_current`

- Materialized projection cache.
- Stores the current property projection, not the source of truth.

`snapshots`

- Acceleration and restoration checkpoints.
- Must never replace append-only history.

`permissions`

- Access-control rules at Atome or property scope.

`sync_queue` and `sync_state`

- Durable synchronization state and retry ownership.

## 6. How An Atome Is Stored In Base

The canonical logical description maps to storage like this:

### 6.1 Identity layer

Stored in `atomes`:

- `id` -> `atome_id`
- `type` -> `atome_type`
- hierarchy -> `parent_id`
- ownership and authorship -> `owner_id`, `creator_id`

### 6.2 Property layer

Stored in `particles`:

- spatial properties such as `left`, `top`, `x`, `y`, `width`, `height`
- visual properties such as `color`, `opacity`, `borderRadius`
- media references and content properties
- any schema-approved type-specific property

### 6.3 History layer

Stored in `particles_versions` and `events`:

- per-property historical changes in `particles_versions`
- append-only semantic mutation history in `events`

### 6.4 Projection layer

Stored in `state_current`:

- current resolved property bag for fast reads
- current project relation and owner relation
- projection version

### 6.5 Snapshot layer

Stored in `snapshots`:

- restorable state blobs
- user-facing snapshot labels
- manual or system snapshot origin

## 7. History Model To Respect

Atome history is mandatory and append-only.

### 7.1 Required rules

- Canonical history is never hard-deleted from the event stream.
- Target architecture reconstructs current state from a trusted snapshot carrying a deterministic event cursor plus replay of subsequent events.
- The current safe rebuild still replays the complete event scope; snapshot acceleration remains active work until equivalence with full replay is proven.
- Property-level history must remain queryable independently of full-object replay.
- Snapshots accelerate reconstruction but do not replace event truth.
- Renderer output must never become a substitute for history.

### 7.2 Consequence for rendering

If a visual renderer needs to know where an Atome is, it must read the described and projected position from Atome state.

It must not treat an existing DOM position as the source of truth.

## 8. Display Rules To Respect

Every visual Atome must be handled through two explicit layers:

1. Description layer.
2. Projection layer.

### 8.1 Description layer owns

- logical identity;
- type and kind;
- validated properties;
- history;
- synchronization;
- permissions;
- deterministic replay.

### 8.2 Projection layer owns

- DOM nodes;
- canvas nodes;
- GPU resources;
- native widgets;
- temporary hover, focus, drag, or highlight visuals;
- layout caches.

### 8.3 Forbidden mixing patterns

- reading canonical position from `element.style.left` when the description already owns it;
- reading canonical size from `offsetWidth` when schema-owned geometry exists;
- persisting view-only data without command-bus history;
- using `renderer` as a logical type replacement;
- storing visual-only backend internals in canonical Atome fields.

## 9. Practical Review Checklist

Any file touching Atomes must be reviewed against this checklist:

1. Does it consume the canonical Atome envelope instead of ad-hoc aliases?
2. Does it validate `properties` against a known type definition?
3. Does it avoid using the renderer as logical state owner?
4. Does it keep DOM, WebGPU, canvas, or native resources as disposable projections only?
5. Does every durable mutation pass through the commit and event pipeline?
6. Does it keep `state_current` as a projection rather than a source of truth?
7. Does it avoid reading canonical geometry from drifted DOM state?
8. Does it keep history and replay deterministic?

If any answer is no, the file must be sanitized before feature growth continues.

## 10. Required Direction For Refactors

Any refactor touching Atomes or rendering must move the code toward this end state:

- one canonical Atome description format;
- one canonical mutation pipeline;
- one canonical history model;
- renderers that only project descriptions;
- no visual source of truth parallel to the Atome description.

That rule applies equally to DOM rendering, WebGPU rendering, native rendering, preview rendering, gesture runtimes, projection helpers, synchronization layers, and storage adapters.
