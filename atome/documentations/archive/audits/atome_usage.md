# Atome Usage Audit

## Scope and method

This audit is code-first. It does not derive conclusions from product documentation. I used the graph set under [atome/documentations/graphs](../graphs/GRAPH_INDEX.md) only as a navigation aid, then traced the concrete execution paths in the implementation.

The core result is that an atome is not represented by one structure only. The framework currently uses several overlapping representations:

1. A canonical envelope shape used for validation and boundary normalization.
2. A SQL storage model split across atomes, particles, events, snapshots, and state_current.
3. Frontend runtime records used by eVe rendering and project loading.
4. A legacy Squirrel Atome runtime object that directly owns a DOM element.
5. Specialized media renderers that bypass plain DOM styling and render into canvas/WebGPU surfaces.

## Executive summary

An atome is concretely handled as a layered object graph, not as a single in-memory class.

- The canonical contract is defined in [atome/shared/atome_contract.js](../../shared/atome_contract.js#L1).
- Durable storage is split between [database/schema.sql](../../../database/schema.sql#L1) and [database/adole.js](../../../database/adole.js#L1).
- User-facing mutations are routed through [eVe/core/atome_commit.js](../../../eVe/core/atome_commit.js#L1749), which sends canonical events to the backend.
- The backend persists those events through [database/adole.js](../../../database/adole.js#L1485) and then updates both structural tables and current-state projections.
- Project rendering is done by eVe runtime helpers such as [eVe/intuition/runtime/tool_genesis.js](../../../eVe/intuition/runtime/tool_genesis.js#L4220), not by the canonical contract directly.
- Timeline replay reconstructs DOM state from the event log in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L559), then optionally writes the replayed result back into the backend.
- Rastering is not the default atome representation. Plain atomes are DOM nodes. Raster/WebGPU rendering is a specialized media path implemented in [eVe/core/media_engine/molecule.js](../../../eVe/core/media_engine/molecule.js#L298) and [eVe/core/media_engine/molecule.api.js](../../../eVe/core/media_engine/molecule.api.js#L393).

The most important architectural fact is that the code confirms a multi-source runtime: events are treated as durable history, but current state is also materialized into particles, atomes metadata, state_current, frontend render registries, and DOM nodes.

## 1. Canonical atome definition

The strictest code-level definition lives in [atome/shared/atome_contract.js](../../shared/atome_contract.js#L1).

The canonical normalized shape is produced by normalizeCanonicalAtome and is:

- id
- type
- optional kind
- optional renderer
- meta
- traits
- properties

This is visible in [atome/shared/atome_contract.js](../../shared/atome_contract.js#L105) through [atome/shared/atome_contract.js](../../shared/atome_contract.js#L165).

Important implementation details:

- Envelope fields such as id, type, owner, parent, project_id, created_at, sync fields, and selection fields are explicitly reserved and cannot be stored as normal properties. See RESERVED_PROPERTY_KEYS in [atome/shared/atome_contract.js](../../shared/atome_contract.js#L1).
- Unknown properties can be rejected, dropped, or quarantined depending on options and type schema. See sanitizeAtomeProperties in [atome/shared/atome_contract.js](../../shared/atome_contract.js#L54).
- Transitional aliases like atome_id, atome_type, particles, and data are still accepted at adapter boundaries only. See normalizeCanonicalAtome in [atome/shared/atome_contract.js](../../shared/atome_contract.js#L105).

Concrete conclusion: the framework already distinguishes between a canonical envelope and historical boundary aliases, but most surrounding code still feeds both styles into the system.

## 2. SQL storage model

The persistent model is defined in [database/schema.sql](../../../database/schema.sql#L1).

The storage split is explicit:

- atomes: identity row, ownership, hierarchy, sync metadata. See [database/schema.sql](../../../database/schema.sql#L37).
- particles: current property values as key-value rows. See [database/schema.sql](../../../database/schema.sql#L67).
- particles_versions: per-property history. See [database/schema.sql](../../../database/schema.sql#L95).
- snapshots: full serialized snapshots. See [database/schema.sql](../../../database/schema.sql#L121).
- events: append-only event log. See [database/schema.sql](../../../database/schema.sql#L145).
- state_current: materialized projection cache. See [database/schema.sql](../../../database/schema.sql#L165).
- permissions, sync_queue, sync_state: operational metadata. See [database/schema.sql](../../../database/schema.sql#L180), [database/schema.sql](../../../database/schema.sql#L208), and [database/schema.sql](../../../database/schema.sql#L233).

The schema comments are directly aligned with the implementation:

- atomes.atome_id is the canonical envelope id.
- atomes.atome_type is the canonical envelope type.
- particles store canonical properties only.
- events are the durable mutation history.
- state_current is a projection cache, not the intended authoritative write source.

However, the implementation does not keep these layers fully isolated. Event application updates several layers at once.

## 3. Creation paths

### 3.1 Direct create path in the data layer

The low-level creator is [database/adole.js](../../../database/adole.js#L494).

createAtome does the following in order:

1. Normalizes the incoming atome via normalizeCanonicalAtome.
2. Inserts or replaces the row in atomes.
3. Stores deferred owner or parent references as special particles when foreign keys are not yet resolvable.
4. Stores kind as a particle when present.
5. Stores canonical properties into particles through setParticles.
6. Updates state_current through upsertStateCurrentFromMutation.

This means createAtome writes metadata, properties, and projection immediately. It is not event-log-first.

### 3.2 HTTP create route

The dedicated API route is [server/atomeRoutes.orm.js](../../../server/atomeRoutes.orm.js#L434).

That route validates the canonical shape, checks create permissions, then calls db.createAtome at [server/atomeRoutes.orm.js](../../../server/atomeRoutes.orm.js#L473).

This is an important concrete finding: the repository still contains a direct create path that bypasses appendEvent.

### 3.3 Frontend creation path used by current adapters

The frontend adapter function create_atome is in [atome/src/squirrel/apis/unified/adole_api/atomes.js](../../src/squirrel/apis/unified/adole_api/atomes.js#L338).

Unlike the legacy HTTP route, create_atome currently builds a kind:set event payload and sends it through adapter.atome.commit. See [atome/src/squirrel/apis/unified/adole_api/atomes.js](../../src/squirrel/apis/unified/adole_api/atomes.js#L374).

So, in current frontend flow, creation is mostly event-based even though the backend still exposes a direct create route.

## 4. Event pipeline and mutation handling

The frontend commit API is attached to window.Atome in [eVe/core/atome_commit.js](../../../eVe/core/atome_commit.js#L2128).

The main mutation entry points are:

- commit in [eVe/core/atome_commit.js](../../../eVe/core/atome_commit.js#L1749)
- commitBatch in [eVe/core/atome_commit.js](../../../eVe/core/atome_commit.js#L1923)
- snapshot in [eVe/core/atome_commit.js](../../../eVe/core/atome_commit.js#L2078)
- getStateCurrent and listEvents in [eVe/core/atome_commit.js](../../../eVe/core/atome_commit.js#L2122)

Concrete frontend behavior:

- Events are normalized and validated before transport.
- The transport prefers WebSocket and falls back to HTTP depending on runtime and backend selection.
- Tauri can mirror selected commits to Fastify asynchronously.
- After a commit, the frontend usually refreshes state_current for the mutated atome.
- The event bus emits atome:changed and snapshot:created notifications.

On the server, event commits are handled by commitAtomeEvent in [server/atomeRoutes.orm.js](../../../server/atomeRoutes.orm.js#L362), which calls db.appendEvent.

In the data layer, appendEvent is implemented in [database/adole.js](../../../database/adole.js#L1485). appendEvents is in [database/adole.js](../../../database/adole.js#L1536).

The important part is what appendEvent actually does:

1. Inserts into events.
2. Immediately applies the event to state_current through applyEventToStateCurrent.
3. Optionally enqueues sync work.

This means the backend is not event-store-only at runtime. It is event-store-plus-projection update in the same write path.

## 5. How events update durable current state

The key function is applyEventToStateCurrent in [database/adole.js](../../../database/adole.js#L1400).

Its behavior is more invasive than the function name suggests.

### 5.1 It updates atomes metadata

applyEventToStateCurrent first calls upsertAtomeFromEvent at [database/adole.js](../../../database/adole.js#L1417).

upsertAtomeFromEvent, defined in [database/adole.js](../../../database/adole.js#L249), will:

- create the atome row if it does not exist
- upgrade atome_type when needed
- assign parent_id and owner_id when possible
- store pending unresolved references in particles
- write event property payloads back into particles through setParticles

This is a major concrete result: event application updates both atomes and particles, not just the projection cache.

### 5.2 It updates state_current

After metadata and particles are updated, applyEventToStateCurrent merges the incoming patch into the JSON properties column of state_current and increments version. See [database/adole.js](../../../database/adole.js#L1443).

The patch can also carry deletion markers like __deleted and deleted_at.

### 5.3 Property history is stored separately

Property writes use setParticle in [database/adole.js](../../../database/adole.js#L1042) and setParticles in [database/adole.js](../../../database/adole.js#L1108).

These functions:

- update or insert the current particle row
- append a particles_versions row
- mark the atome sync_status as pending

So a single logical mutation can fan out into:

- one events row
- zero or one atomes row update
- N particles row updates
- N particles_versions row inserts
- one state_current row update

## 6. What lives in memory at runtime

There is no single authoritative runtime object.

### 6.1 Frontend API memory

window.Atome is used as a frontend mutation and query API in [eVe/core/atome_commit.js](../../../eVe/core/atome_commit.js#L2128).

It exposes commit, commitBatch, snapshot, getStateCurrent, listStateCurrent, listEvents, and eventBus.

This object is an API surface, not an in-memory atome instance store.

### 6.2 Legacy Squirrel Atome object

The legacy class-like runtime object is defined in [atome/src/squirrel/atome/atome.js](../../src/squirrel/atome/atome.js#L1399).

That constructor:

- parses style and configuration aliases
- creates a DOM div through Squirrel syntax
- stores the created element in this.element
- copies config and style sections onto the object itself
- recursively creates children as nested Atome instances

The update path is Atome.prototype.set in [atome/src/squirrel/atome/atome.js](../../src/squirrel/atome/atome.js#L1478).

Concrete conclusion: this object is a DOM-owning convenience runtime, not the canonical persistence model.

### 6.3 eVe render registries and caches

The eVe runtime keeps additional in-memory state:

- renderedAtomes and renderedAtomeHosts in the render layer around [eVe/intuition/runtime/tool_genesis.js](../../../eVe/intuition/runtime/tool_genesis.js#L4220)
- TIMELINE_STATE in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L12)
- baseline records, baseline props, deleted sets, preview flags, redo snapshots, and createdElements in the timeline module

This confirms that runtime memory is distributed across several modules, not centralized in one atome repository.

## 7. How project loading reaches the DOM

The concrete project rendering path is in [eVe/intuition/runtime/tool_genesis.js](../../../eVe/intuition/runtime/tool_genesis.js#L4560).

Observed behavior:

1. Project records are collected and normalized.
2. Records are indexed by id.
3. Rendering walks parents first when possible.
4. For each record, resolveMountParent chooses the correct container.
5. renderAtomeRecord creates or re-syncs the DOM host.

renderAtomeRecord is in [eVe/intuition/runtime/tool_genesis.js](../../../eVe/intuition/runtime/tool_genesis.js#L4220).

It has two modes:

- If the atome is already rendered, it reuses the existing host, optionally reparents it, and reapplies frame styles.
- Otherwise it creates a host via createAtomeElement and registers it as rendered.

This is the normal bridge from persisted project records to DOM presence.

## 8. DOM representation of a plain atome

Plain atomes are DOM elements, not canvas rasters.

Evidence:

- The Squirrel runtime creates a div in [atome/src/squirrel/atome/atome.js](../../src/squirrel/atome/atome.js#L1417).
- Timeline replay reads and writes left, top, width, height, opacity, transform, background, and text directly on element.style or nested text nodes in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L239) and [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L260).
- Deletion preview in the timeline is implemented by setting display:none in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L424).

Concrete DOM-level behavior:

- Parent-child relationships are represented by actual DOM nesting or layer attachment.
- The rendered host is identified through data-atome-id and related host registries.
- Timeline preview updates the DOM in place rather than destroying and reconstructing the tree every frame.

## 9. Timeline and historization

Historization happens on two different levels.

### 9.1 Property history

Per-property history is stored in particles_versions and exposed through getParticleHistory in [database/adole.js](../../../database/adole.js#L1256).

Specific particle versions can be restored through restoreParticleVersion in [database/adole.js](../../../database/adole.js#L1268).

### 9.2 Event history and replay

The event timeline is handled in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L1).

Relevant stages are:

- loadTimeline loads events by project or atome scope in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L1037).
- captureBaseline fetches listStateCurrent and getStateCurrent to seed the replay baseline in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L447).
- buildStateToIndex reconstructs projected state up to any event index in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L559).
- applyStateToDom and applyEvent mutate the current DOM preview in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L644) and [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L655).
- applyStateToBackend can write the replayed result back through commitBatch in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L872).
- undoTimeline and redoTimeline are in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L1110) and [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L1144).

The timeline also exposes deterministic replay diagnostics through testDeterministicReplay in [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L1259).

Concrete conclusion: runtime replay uses the event log plus a captured baseline, not particles_versions alone.

## 10. Snapshots

There are two snapshot concepts in code.

### 10.1 Legacy atome snapshot helpers

createSnapshot and restoreSnapshot are implemented in [database/adole.js](../../../database/adole.js#L1310) and [database/adole.js](../../../database/adole.js#L1343).

Observed behavior:

- createSnapshot serializes getAtome output into snapshot_data.
- restoreSnapshot clears current particles and restores data.data through setParticles.

This path is legacy-shaped and tied to snapshot_data.

### 10.2 State snapshot pipeline

The newer state snapshot path starts at createStateSnapshot in [database/adole.js](../../../database/adole.js#L1733) and is exposed via frontend snapshot in [eVe/core/atome_commit.js](../../../eVe/core/atome_commit.js#L2078).

This writes project_id, state_blob, label, actor, and snapshot_type into snapshots.

Concrete conclusion: the repository currently contains both a legacy atome snapshot mechanism and a newer project/state snapshot mechanism.

## 11. Rastering and specialized media rendering

Rastering is not the default representation for generic atomes. It exists in the specialized Molecule media path.

### 11.1 Engine sessions

MoleculeSession is defined in [eVe/core/media_engine/molecule.js](../../../eVe/core/media_engine/molecule.js#L298).

Each session owns:

- a normalized timeline
- a native audio engine wrapper
- a WebGPU renderer
- a canvas mount
- runtime clip maps and transport state

The session writes its playback state back into atome history via window.Atome.commit in [eVe/core/media_engine/molecule.js](../../../eVe/core/media_engine/molecule.js#L502).

### 11.2 Image raster path

SVG image bytes are rasterized in createRasterBitmapFromSvgBlob at [eVe/core/media_engine/molecule.api.js](../../../eVe/core/media_engine/molecule.api.js#L40).

That function:

- decodes the SVG into an Image
- draws it into OffscreenCanvas or canvas
- converts the result into ImageBitmap

createMountedImageBitmap in [eVe/core/media_engine/molecule.api.js](../../../eVe/core/media_engine/molecule.api.js#L72) chooses between SVG rasterization and direct createImageBitmap.

### 11.3 Video and audio mounts

Canvas mounts for video and image media are created in [eVe/core/media_engine/molecule.api.js](../../../eVe/core/media_engine/molecule.api.js#L242).

Audio mounts create a hidden marker plus canvas in [eVe/core/media_engine/molecule.api.js](../../../eVe/core/media_engine/molecule.api.js#L258).

The asset mount path is mountVisual in [eVe/core/media_engine/molecule.api.js](../../../eVe/core/media_engine/molecule.api.js#L414).

Video raster support also uses a hidden DOM pool for video elements in ensureMoleculeVideoPool at [eVe/core/media_engine/molecule.js](../../../eVe/core/media_engine/molecule.js#L47).

Concrete conclusion: when the framework talks to media atomes, the DOM host becomes a container for a canvas-based renderer, while history is still committed through the regular atome event API.

## 12. Concrete representation matrix

| Layer | Concrete representation | Main code |
| --- | --- | --- |
| Validation boundary | Canonical envelope with id, type, kind, renderer, meta, traits, properties | [atome/shared/atome_contract.js](../../shared/atome_contract.js#L105) |
| Identity storage | atomes row | [database/schema.sql](../../../database/schema.sql#L37) |
| Current property storage | particles rows | [database/schema.sql](../../../database/schema.sql#L67) |
| Property history | particles_versions rows | [database/schema.sql](../../../database/schema.sql#L95) |
| Durable event history | events rows | [database/schema.sql](../../../database/schema.sql#L145) |
| Current state cache | state_current JSON row | [database/schema.sql](../../../database/schema.sql#L165) |
| Frontend mutation API | window.Atome | [eVe/core/atome_commit.js](../../../eVe/core/atome_commit.js#L2128) |
| Legacy runtime object | Squirrel Atome instance with this.element | [atome/src/squirrel/atome/atome.js](../../src/squirrel/atome/atome.js#L1399) |
| Rendered project node | host DOM element managed by tool_genesis | [eVe/intuition/runtime/tool_genesis.js](../../../eVe/intuition/runtime/tool_genesis.js#L4220) |
| Timeline preview state | TIMELINE_STATE maps, sets, snapshots | [eVe/core/atome_timeline.js](../../../eVe/core/atome_timeline.js#L12) |
| Media raster runtime | Molecule session plus canvas/WebGPU renderer | [eVe/core/media_engine/molecule.js](../../../eVe/core/media_engine/molecule.js#L298) |

## 13. Findings confirmed by code

### Finding 1: the system is intentionally multi-representational

An atome exists simultaneously as:

- canonical envelope
- atomes metadata row
- particles property rows
- events history rows
- state_current JSON projection
- frontend render record
- DOM host element
- optional media canvas/WebGPU session

This is not a documentation artifact. It is directly encoded in the write and render paths.

### Finding 2: events are durable history, but not the only write side effect

The write path through appendEvent also updates atomes, particles, particles_versions, and state_current. See [database/adole.js](../../../database/adole.js#L1485), [database/adole.js](../../../database/adole.js#L1400), and [database/adole.js](../../../database/adole.js#L249).

So the runtime is event-sourced in history semantics, but not event-only in materialized storage behavior.

### Finding 3: there are still parallel creation models

The repository contains both:

- a direct create route built on db.createAtome
- an event-style create_atome adapter that sends a kind:set commit

This coexistence matters because it means object birth is not strictly unified yet.

### Finding 4: the frontend does not use one single in-memory atome store

The active state is spread across window.Atome API bindings, tool_genesis render registries, timeline caches, and DOM state.

### Finding 5: generic atomes are DOM-first, media atomes are renderer-assisted

The default visual model is a DOM element with CSS properties. Rastering appears only in specialized media flows.

### Finding 6: snapshot support is split between legacy and newer state pipelines

The snapshots table is used by both legacy atome snapshots and newer project/state snapshots. The repository has not fully collapsed these concepts into one implementation path.

## 14. Final practical model

The most accurate concrete mental model for this repository is the following:

1. A canonical atome is validated at boundaries as an envelope plus properties.
2. User mutations are usually emitted as canonical events through window.Atome.commit.
3. The backend appends the event, then immediately materializes it into atomes, particles, particles_versions, and state_current.
4. Project loading reads state-like records and renders them into DOM hosts through eVe runtime helpers.
5. Timeline replay rebuilds state from events plus baseline and mutates the DOM preview directly.
6. Specialized media atomes mount a Molecule canvas/WebGPU renderer inside the visual host and still persist their state through the same atome commit API.

That is how atomes are concretely defined, stored, projected, rendered, rasterized, and historized in the current codebase.
