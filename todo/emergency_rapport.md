# Emergency Report - Atome Structure And Storage Audit

Date: 2026-05-24

Scope:

- Read-only audit only.
- No code was implemented.
- Git remained read-only, in compliance with .codex/AGENTS.md:185.
- No Jones.md file was found.
- Only one AGENTS file was found: .codex/AGENTS.md.

## 1. Executive Summary

Judgment: the current Atome architecture is structurally mixed, not clean.

What is clean:

- The repository does define a strong target architecture in documentation: canonical Atome shape, append-only mutation flow, state projection semantics, and SQL ownership boundaries are explicitly documented in eVe/documentations/atome_object.md:17-19, 58-89, eVe/documentations/atome_persistence_contract.md:48, 65-68, eVe/documentations/Atome Time Machine.md:54, maps/ARCHITECTURE_MAP.md:39-41, 350.
- The SQL schema itself is coherent at the storage-layer level: identity in atomes, flexible properties in particles, history in particles_versions, event log in events, projection in state_current, snapshots in snapshots, ACL in permissions, and sync in sync_queue and sync_state. Evidence: database/schema.sql:30, 60, 83, 151.

What is not clean:

- The documented canonical Atome object shape is not enforced at write time. The code persists a minimal identity row plus arbitrary particles, not the documented top-level envelope of id, type, optional kind, optional renderer, meta, traits, properties. Evidence: eVe/documentations/atome_object.md:63-89 versus database/adole.js:489, 556, 561, 996, 1003.
- Durable writes are not fully funneled through the documented single path. The repository still contains direct creation and direct projection writes outside the documented commit boundary. Evidence: eVe/documentations/atome_persistence_contract.md:48, 65-68, maps/ARCHITECTURE_MAP.md:39, 350 versus server/atomeRoutes.orm.js:415, 438, server/server.js:2884, 3986, 4656, server/auth.js:213, 237, 242.
- The API and product layers maintain many aliases for the same concepts, which means the effective model is not a single coherent structure. Evidence: server/atomeRoutes.orm.js:251-265, 302-314, atome/src/squirrel/apis/unified/adole_api/atomes.js:376-383, eVe/default_data/default_project.js:10, 27.
- The DOM still acts as a temporary source of truth in gesture and placement flows before persistence catches up, which violates the documented separation between model and view. Evidence: eVe/documentations/Good practices.md:81, 118-119 versus eVe/intuition/tools/communication.js:1124, 1146-1147, 1766, 1796, eVe/core/atome_events/placement_runtime.js:124.

Bottom line:

- A canonical Atome model exists as documentation.
- It is only partially reflected in the SQL schema.
- It is not fully enforced in runtime code.
- Database and storage are coherent as an ADOLE table family, but not coherent as one enforced canonical Atome object envelope across client, server, product stores, and rendering code.

## 2. Documentation Inventory

### Governance and mandatory rules

- .codex/AGENTS.md
  - Status: canonical for process, not for Atome structure.
  - Says large files are non-compliant above 500 lines and critical above 800 lines. Evidence: .codex/AGENTS.md:87, 89, 91, 97.
  - Imposes Git read-only. Evidence: .codex/AGENTS.md:185.
  - Does not define a canonical Atome structure by itself.

### Maps

- maps/ARCHITECTURE_MAP.md
  - Status: canonical boundary document.
  - Declares that durable mutation must flow through window.Atome.commit or window.Atome.commitBatch, that server writes flow through event commit helpers and database persistence boundary, and that state_current is a projection, not the source of truth. Evidence: maps/ARCHITECTURE_MAP.md:39-41.
  - Declares raw SQL outside the database layer forbidden for Atome persistence. Evidence: maps/ARCHITECTURE_MAP.md:350.
  - Matches the target architecture, but current code violates parts of it.

- maps/API_MAP.md
  - Status: partial but strong inventory.
  - Identifies Atome event and state routes and database persistence API ownership. Evidence from search: maps/API_MAP.md:108, 118, 134, 340-341, 371, 381, 391.
  - Useful for ownership and route surface, but not itself a canonical object model spec.

- maps/CODEMAP.md
  - Status: partial architecture inventory.
  - Repeats persistence boundaries, product and open split, and warns against hidden bypasses. Evidence from search: maps/CODEMAP.md:84, 91, 97, 967.
  - Useful as ownership map, not the primary object-model spec.

- maps/DESIGN_MAP.md
  - Status: relevant only as renderer and design boundary, not Atome storage spec.

### Canonical Atome model and persistence docs

- eVe/documentations/atome_object.md
  - Status: canonical target model.
  - Defines no direct mutations, all writes through Atome Runtime and Command Bus, and the canonical Atome representation with type, kind, renderer, meta, traits, and properties. Evidence: eVe/documentations/atome_object.md:17-19, 58, 63-89.
  - Also says properties must validate against a type schema and unknown properties are rejected. Evidence: eVe/documentations/atome_object.md:89.
  - Code does not enforce this fully.

- atome/documentations/atome_object.md
  - Status: duplicate canonical target document.
  - Semantically aligned with the eVe version.
  - Useful, but duplication creates documentation drift risk.

- eVe/documentations/atome_persistence_contract.md
  - Status: canonical persistence contract.
  - Defines the canonical flow as UI or tool action to window.Atome.commit or commitBatch to server event commit entry point to database/adole.js to events, particles_versions, state_current, and sync_queue. Evidence: eVe/documentations/atome_persistence_contract.md:11-14, 24-25, 48, 65-68.
  - The codebase still contains alternate persistence paths.

- eVe/documentations/Atome Time Machine.md
  - Status: canonical history and projection contract.
  - States that snapshots are not source of truth and state_current is reconstructed from snapshot plus event replay. Evidence: eVe/documentations/Atome Time Machine.md:50, 54.

- eVe/documentations/tools.md
  - Status: canonical for tools as Atomes and append-only tool history.
  - Says tools are Atomes, UI never mutates state directly, and state_current is a projection. Evidence from search: eVe/documentations/tools.md:14, 17, 330, 338, 398, 512, 515, 617-618.

- eVe/documentations/Good practices.md
  - Status: canonical policy document.
  - Forbids standalone UI nodes outside the Atome model. Evidence: eVe/documentations/Good practices.md:81.
  - Requires window.Atome.commit and window.Atome.commitBatch for writes. Evidence: eVe/documentations/Good practices.md:118-119.
  - Restates canonical Atome shape and rejection of unknown properties. Evidence: eVe/documentations/Good practices.md:129, 142.
  - Current runtime code violates this in practice.

- atome/documentations/ADOLE.md
  - Status: canonical SQL and storage document.
  - Defines the current schema as Atome and Particle with event log and projection cache.
  - Says renderer is not a DB column and should be stored as particle if needed.
  - Canonical for table layout, not for the higher-level object envelope.

- atome/documentations/database_architecture.md
  - Status: partial and canonical hybrid.
  - Documents ADOLE table roles and current schema direction.

### Structural audit and backlog docs

- eVe/documentations/eve_structure_audit.md
  - Status: partial structural reorganization plan.
  - Useful for product-domain separation, not a canonical Atome model.

- todo/Emergency prompt.md
  - Status: audit request, not architecture spec.
  - Defines the expected output format for this report.

- todo/execution_order.md
  - Status: partial governance and history document.
  - Records the creation of the four maps as explicit architecture and boundary contracts. Evidence: todo/execution_order.md:265-268.

- todo/sharing_search_monitoring/finder.md
  - Status: partial, but important because it exposes another Atome shape.
  - Defines Atome as stored objects with id, type, and particles, and uses project_id and particles paths in queries. Evidence: todo/sharing_search_monitoring/finder.md:53, 60-61.
  - This is not the same envelope as the documented canonical Atome object shape.

- done/molecule_architecture_and_rebuild_plan.md
  - Status: partial but highly relevant evidence.
  - Explicitly says the current system mixes model, DOM, media, audio, WebGPU, persistence, and gestures. Evidence: done/molecule_architecture_and_rebuild_plan.md:26.
  - Also restates that state_current must be a projection, not source of truth. Evidence: done/molecule_architecture_and_rebuild_plan.md:344.

- done/strict_dry_menu_refactor_plan.md
  - Status: partial but relevant renderer-separation evidence.
  - States the current renderer situation is not one common renderer and not fully separated either, but a mixture of shared primitives, multiple active renderers, and exceptions. Evidence: done/strict_dry_menu_refactor_plan.md:570-572.

- Failed/file.md
  - Status: partial but strong failure evidence.
  - Shows poster, render, timeline, and recording work became too broad because project rendering, recording persistence, poster persistence, DOM mounting, upload timing, and timeline media creation were coupled. Evidence: Failed/file.md sections What Failed and Suspected Root Problems.

- README.md
  - Status: partial runtime overview.
  - Useful for runtime, server, and storage overview, not a canonical Atome model. Evidence: README.md:52, 70, 96.

## 3. Canonical Atome Model Assessment

### Documented model

The documented target model is clear:

- id is immutable.
- type is canonical.
- kind is optional and validated.
- renderer is a UI hint only.
- meta and traits exist as first-class top-level fields.
- properties are type-specific and schema-validated.
- unknown properties are rejected unless explicitly allowed.

Evidence:

- eVe/documentations/atome_object.md:63-89.
- eVe/documentations/Good practices.md:129-142.

### Implemented model

The implemented durable SQL model is:

- one row in atomes for identity and hierarchy;
- zero or more rows in particles for arbitrary key and value properties;
- a denormalized JSON projection in state_current;
- event history in events.

Evidence:

- database/schema.sql:30, 60, 83, 151.
- database/adole.js:489, 556, 561, 996, 1003, 1417, 1438.

### Comparison

The documented and implemented models overlap only partially.

What matches:

- id and type identity exists.
- append-only event log exists.
- state_current exists as a projection cache.
- kind can exist, but in practice it is stored as a particle, not enforced as a validated top-level field.

What does not match:

- meta and traits are not enforced as first-class durable top-level fields in SQL writes.
- renderer is documented as explicit optional field, but the SQL model does not reserve a top-level renderer field and instead expects it as a particle if used.
- no type registry enforcement is visible in the actual persistence path.
- unknown properties are not rejected; setParticle accepts arbitrary keys and values.

Evidence:

- eVe/documentations/atome_object.md:65, 76, 89.
- database/adole.js:489, 556, 561, 996, 1003.

### Conclusion

There is a documented canonical Atome object model, but there is no single enforced canonical persisted Atome object envelope in implementation. The actual enforced durable structure is closer to:

- normalized identity row;
- arbitrary particle bag;
- denormalized state_current JSON projection;
- compatibility aliases on the API surface.

## 4. Storage And Database Shape

### Storage mechanism 1: canonical SQL ADOLE database

Shape:

- atomes table stores top-level identity and hierarchy.
- particles stores arbitrary key and value property rows.
- particles_versions stores per-property history.
- state_current stores a JSON object of current properties.
- events stores append-only mutation events.
- snapshots stores acceleration snapshots.

Evidence:

- database/schema.sql:30, 60, 83, 151.
- atome/documentations/ADOLE.md sections 2.1 to 2.9.

Observed characteristics:

- Single canonical identity field in SQL: atome_id.
- Type is stored as atome_type.
- Parent and owner are normalized in atomes.
- kind is not a dedicated normalized column in the current SQL schema; it is typically stored in particles. Evidence: database/adole.js:556.
- renderer is not a dedicated normalized column in the current SQL schema; documentation also accepts it as particle storage.
- fields are effectively arbitrary inside particles and inside state_current.properties.
- no visible schema validation occurs in the durable write path.

Representative shape:

- SQL identity row: atome_id, atome_type, parent_id, owner_id, creator_id, timestamps, sync columns.
- Property rows: particle_key and particle_value.
- Projection row: atome_id, owner_id, project_id, properties JSON, updated_at, version.

### Storage mechanism 2: server REST create route

Shape:

- The route accepts id, type, kind, parent_id or parent, data, owner_id.
- It calls db.createAtome directly, not the event commit helper.

Evidence:

- server/atomeRoutes.orm.js:415, 438.

Impact:

- This is a second durable write path beside commitAtomeEvent and commitAtomeEvents.

### Storage mechanism 3: direct WebSocket and server-side DB writes

Shape:

- server/server.js contains direct db.createAtome calls and direct db.setParticle calls.

Evidence:

- server/server.js:2884, 3986, 4656.

Impact:

- These are additional write paths outside the documented persistence contract.

### Storage mechanism 4: direct projection writes in auth flow

Shape:

- server/auth.js directly selects, updates, and inserts into state_current.

Evidence:

- server/auth.js:213, 237, 242.

Impact:

- This violates the documented rule that database/adole.js remains the SQL boundary and that raw SQL outside the database layer is forbidden for Atome persistence.

### Storage mechanism 5: product project stores and molecule stores

Shape:

- eVe/core/project_store/api.js exposes createAtome through an adapter boundary. Evidence: eVe/core/project_store/api.js:65.
- eVe/core/project_store/memory_adapter.js stores whole payloads keyed by atome_id. Evidence: eVe/core/project_store/memory_adapter.js:57.
- eVe/core/molecule_store_bootstrap.js writes atome-like payloads into browser or platform stores. Evidence: eVe/core/molecule_store_bootstrap.js:39.

Impact:

- These stores are legitimate product stores, but they also prove that the repository has more than one atome-like data shape and more than one persistence-like boundary.
- They are not the canonical Atome SQL persistence, yet they own atome-shaped data.

### Storage mechanism 6: product session and UI local storage

Observed:

- There are many localStorage-backed product and session stores for preview panels, panel bounds, AI traces, voice history, media queue, and similar runtime concerns.

Evidence:

- grep results across eVe and atome product and runtime modules.

Assessment:

- These are not the canonical Atome persistence layer.
- They do, however, show that transient and product-specific state is spread across multiple storage families and not always cleanly isolated from model concepts.

## 5. Creation, Mutation, Loading, Rendering Flow

### Creation

Documented canonical creation path:

- UI or tool action to window.Atome.commit or commitBatch to server event commit helper to database/adole.js. Evidence: eVe/documentations/atome_persistence_contract.md:11-14, 24-25.

Implemented creation paths observed:

- Event commit path exists. Evidence: server/atomeRoutes.orm.js:343, 357, 368.
- Direct REST create path exists. Evidence: server/atomeRoutes.orm.js:415, 438.
- Direct server WebSocket or internal create paths exist. Evidence: server/server.js:2884, 3986.
- Client adapter create path exists and accepts broad aliases from properties, particles, data, or the entire options object. Evidence: atome/src/squirrel/apis/unified/adole_api/atomes.js:376, 378, 507, 525.

Conclusion:

- Atomes are not all created through one canonical creation path.

### Mutation

Documented canonical mutation path:

- No direct mutations; all writes through Atome Runtime and Command Bus. Evidence: eVe/documentations/atome_object.md:17-19.

Implemented mutation paths observed:

- Event commit path exists and updates state_current through appendEvent. Evidence: database/adole.js:1438, 1417.
- setParticle and setParticles accept arbitrary particle keys. Evidence: database/adole.js:996, 1003, 1061.
- Direct db.setParticle exists in server/server.js. Evidence: server/server.js:4656.
- Some gesture flows mutate the DOM first, then commit. Evidence: eVe/intuition/tools/communication.js:1124, 1146-1147, 1766, 1796.

Conclusion:

- Atomes are not all updated through one canonical mutation path.

### Loading

Observed:

- The server and DB load state from state_current and merge or alias fields.
- resolveAtomeForSync rebuilds payloads from state_current.properties or atome.data or atome.properties. Evidence: server/atomeRoutes.orm.js:302-314.
- formatAtome emits both legacy and current aliases. Evidence: server/atomeRoutes.orm.js:251-265.

Conclusion:

- Loading is compatibility-oriented, not strict-envelope-oriented.

### Rendering

Observed:

- View code still reads style.left and style.top and uses DOM geometry for interactions. Evidence: eVe/intuition/tools/communication.js:1124, 1146-1147, 1766, 1796, eVe/core/atome_events/placement_runtime.js:124.
- Renderer structure remains mixed according to existing audit docs. Evidence: done/strict_dry_menu_refactor_plan.md:570-572.
- Failed video poster work shows rendering and persistence are still coupled. Evidence: Failed/file.md sections What Failed and Suspected Root Problems.

Conclusion:

- Rendering is not yet a fully clean projection of data.

## 6. MVC Separation Assessment

### Model layer

Primary owning files:

- database/adole.js
- database/schema.sql
- server/atomeRoutes.orm.js
- eVe/core/atome_commit.js

Public APIs:

- commitAtomeEvent and commitAtomeEvents in server/atomeRoutes.orm.js:343, 368.
- DB createAtome, setParticle, appendEvent in database/adole.js:489, 996, 1438.

Boundary quality:

- Partial.
- The SQL and event model is real, but enforcement of the documented Atome object contract is weak.

### View layer

Primary owning files:

- eVe/intuition/tools/communication.js
- eVe/core/atome_events/placement_runtime.js
- broader renderer families under eVe/intuition and eVe/elements.

Boundary quality:

- Mixed.
- View code still reads and writes positional DOM state directly during gestures.

### Controller and action layer

Primary owning files:

- eVe/core/atome_commit.js
- server/atomeRoutes.orm.js
- eVe tool runtimes and interaction runtimes.

Boundary quality:

- Mixed.
- Some action flows use the documented commit path.
- Others bypass it with direct DB writes or direct create routes.

### Does the DOM become source of truth?

Yes, temporarily and materially in interaction flows.

Evidence:

- communication drag path starts from element.style.left and element.style.top, mutates those styles, then persists them. Evidence: eVe/intuition/tools/communication.js:1124, 1135-1136, 1146-1147.
- another gesture path starts from atomeEl.style.left and atomeEl.style.top, then commits gesture start and end around DOM-driven movement. Evidence: eVe/intuition/tools/communication.js:1766, 1783-1784, 1796.
- placement logic resolves snap candidates from targetEl.style.left or offsetLeft. Evidence: eVe/core/atome_events/placement_runtime.js:124.

That is not a pure projection model. It is model-view feedback through the DOM.

## 7. Structural Risks

### P0 - Multiple durable write paths bypass the documented canonical mutation pipeline

Evidence:

- eVe/documentations/atome_persistence_contract.md:48, 65-68.
- maps/ARCHITECTURE_MAP.md:39, 350.
- server/atomeRoutes.orm.js:415, 438.
- server/server.js:2884, 3986, 4656.
- server/auth.js:213, 237, 242.

Current behavior:

- The repository documents one durable path, but direct create and direct SQL write paths still exist.

Why risky:

- Event history, idempotency, actor normalization, audit, replay, and projection consistency can diverge.
- state_current can be updated without following the documented event path.

Likely symptoms:

- Missing history entries.
- Different behavior between route families.
- Replay inconsistencies.
- Sync inconsistencies.

### P1 - The documented canonical Atome object shape is not enforced

Evidence:

- eVe/documentations/atome_object.md:63-89.
- eVe/documentations/Good practices.md:129-142.
- database/adole.js:489, 556, 561, 996, 1003.

Current behavior:

- createAtome writes identity plus arbitrary properties as particles; setParticle accepts arbitrary keys.

Why risky:

- The codebase cannot rely on one stable envelope.
- Different modules are free to introduce new aliases or new particles with no shared schema gate.

Likely symptoms:

- kind and type confusion.
- renderer and view fields leaking into durable state.
- compatibility alias growth.

### P1 - The server compatibility surface already admits incompatible Atome shapes

Evidence:

- server/atomeRoutes.orm.js:251-265, 302-314.
- atome/src/squirrel/apis/unified/adole_api/atomes.js:376-383.
- todo/sharing_search_monitoring/finder.md:53, 60-61.

Current behavior:

- API formatting and sync resolution accept and emit multiple parallel shapes: atome_id or id, atome_type or type, particles or properties or data, parent_id or parent, owner_id or owner.

Why risky:

- Consumers do not need to converge on one shape because the system absorbs multiple ones.

Likely symptoms:

- ongoing alias debt;
- hidden assumptions per subsystem;
- incompatible records across stores and runtimes.

### P1 - The DOM is used as transient model state during gestures and placement

Evidence:

- eVe/documentations/Good practices.md:81, 118-119.
- eVe/intuition/tools/communication.js:1124, 1146-1147, 1766, 1796.
- eVe/core/atome_events/placement_runtime.js:124.

Current behavior:

- Drag and placement calculations read from DOM styles and offsets before the durable model is updated.

Why risky:

- Rendering and persisted state can diverge.
- Gesture bugs become timing-sensitive and renderer-sensitive.

Likely symptoms:

- non-deterministic drag and resize;
- reload mismatch;
- different behavior across browser, Tauri, and iOS.

### P2 - Product stores keep Atome-like payloads outside the canonical Atome SQL model

Evidence:

- eVe/core/project_store/api.js:65.
- eVe/core/project_store/memory_adapter.js:57.
- eVe/core/molecule_store_bootstrap.js:39.

Current behavior:

- Product stores can persist atome-shaped payloads independently of the ADOLE SQL layer.

Why risky:

- The term Atome no longer maps to one persistence contract.
- Product stores may drift semantically from the framework model.

Likely symptoms:

- testing and memory behavior diverges from real persistence;
- timeline and product stores use shapes not accepted by the core model.

### P2 - Naming and alias confusion remains active

Evidence:

- server/atomeRoutes.orm.js:251-265, 302-314.
- eVe/default_data/default_project.js:10, 27.

Current behavior:

- The repository still uses type, kind, particles, properties, data, id, atome_id, parent, parent_id, owner, owner_id, and visualType in overlapping ways.

Why risky:

- The architecture cannot be reasoned about from names alone.

Likely symptoms:

- feature-specific normalizers everywhere;
- constant adapter logic.

### P3 - Documentation duplication and maturity mismatch

Evidence:

- eVe/documentations/atome_object.md.
- atome/documentations/atome_object.md.
- eVe/documentations/tools.md.
- eVe/documentations/eve_structure_audit.md.

Current behavior:

- Multiple docs describe the target model and target structure, while code is still mixed.

Why risky:

- The team may assume rules are already enforced when they are not.

Likely symptoms:

- more architecture written than architecture enforced.

## 8. Documentation Gaps

Missing or insufficiently explicit items:

- .codex/AGENTS.md does not define the canonical Atome structure itself. It governs process and file hygiene but delegates the actual model to other documents.
- The maps do not yet enumerate every known direct write bypass as architecture debt, even though they define the correct target boundary.
- The Atome docs do not clearly distinguish the following implemented shapes:
  - documented canonical object envelope;
  - durable SQL row plus particles family;
  - state_current projection JSON;
  - API compatibility aliases;
  - product project-store payloads.
- There is no single document that explicitly says which fields are allowed as top-level in the persisted object returned by APIs, and which are only particles.
- There is no authoritative matrix for concept aliases such as type, atome_type, kind, renderer, data, properties, particles, visualType, project_id, parent_id, and owner_id.

## 9. Verification Gaps

Tests or probes needed to prove a clean model:

1. A schema-enforcement test that creates invalid unknown properties and proves they are rejected at the canonical write boundary.
2. A creation-path inventory test proving that all durable create, update, and delete flows route through the same event pipeline.
3. A negative test proving that direct SQL writes outside database/adole.js fail code review or guardrail checks.
4. A projection test proving state_current can be rebuilt from snapshot plus event replay for representative Atome types.
5. A multi-runtime parity test proving the same Atome persisted in browser, Tauri, and server yields the same durable shape.
6. A gesture test proving drag and placement are driven from model state rather than DOM state.
7. A store-boundary test proving product project stores cannot silently diverge from the canonical Atome contract.

## 10. Oversized And Coupling Hotspots

AGENTS threshold:

- Ideal: under 300 lines. Evidence: .codex/AGENTS.md:87.
- Hard maximum: 500 lines. Evidence: .codex/AGENTS.md:89.
- Above 800 lines: critical legacy state. Evidence: .codex/AGENTS.md:91.

Critical hotspots identified:

- database/adole.js
  - 2342 lines.
  - Responsibilities: schema migration support, Atome CRUD, particle CRUD, history, projection refresh, events, snapshots, permissions, sync queue, query helpers.
  - Why too coupled: it owns most of the persistence system in one file.
  - AGENTS impact: critical legacy state; should not grow further without reduction.

- server/server.js
  - 5013 lines.
  - Responsibilities: server bootstrap, WebSocket API, file and media flows, direct messaging, direct DB writes, auth-adjacent handling, internal command routing, and many cross-domain concerns.
  - Why too coupled: it mixes transport, product workflows, and persistence shortcuts.
  - AGENTS impact: far beyond the normal limit and beyond the critical threshold.

- eVe/core/atome_commit.js
  - 2221 lines.
  - Responsibilities: commit transport selection, backend routing, dedupe, realtime mirroring, persistence diagnostics, auth token handling, gesture batching, and runtime switching.
  - Why too coupled: client-side mutation boundary, transport policy, auth and token logic, and diagnostics are mixed.
  - AGENTS impact: critical legacy state.

- atome/src/squirrel/apis/unified/adole.js
  - 1793 lines.
  - Responsibilities: unified adapters, auth and runtime detection, storage helpers, server URL logic, and Atome operations.
  - Why too coupled: adapter concerns, environment detection, and persistence API shaping are combined.
  - AGENTS impact: critical legacy state.

- server/atomeRoutes.orm.js
  - 1218 lines.
  - Responsibilities: route registration, event commit helpers, CRUD routes, sync formatting, snapshot routes, and auth validation.
  - Why too coupled: canonical route layer and compatibility logic are in one large module.
  - AGENTS impact: critical legacy state.

Before any future change in these files, the audit should verify:

- exact ownership boundary;
- whether the change adds another persistence path;
- whether alias normalization is growing;
- whether model, controller, and view concerns are being mixed further.

## 11. Direct Answers To The Core Structure Questions

1. What is an Atome structurally in the current implementation?

  In the core durable implementation, an Atome is one row in atomes plus arbitrary particle rows plus an optional state_current projection row and related event history. Evidence: database/schema.sql:30, 60, 151.

1. What is the canonical persisted Atome shape, if any?

  There is no single enforced canonical persisted object envelope across the repository. The closest enforced durable shape is the SQL family of atomes plus particles plus state_current.

1. Where is this shape defined?

  Target object shape: eVe/documentations/atome_object.md:58-89.
  Durable SQL shape: database/schema.sql:30, 60, 151 and atome/documentations/ADOLE.md.

1. Where is this shape enforced?

  SQL enforces identity and table relations.
  The code does not visibly enforce the full documented object envelope or unknown-property rejection in the durable path.

1. Where is this shape bypassed?

  server/atomeRoutes.orm.js:415, 438.
  server/server.js:2884, 3986, 4656.
  server/auth.js:213, 237, 242.
  atome/src/squirrel/apis/unified/adole_api/atomes.js:376, 378.

1. Difference between Atome record, properties, particles, state, and DOM?

  Atome record: identity row in atomes.
  Particles: normalized key and value property rows.
  Properties: denormalized JSON property bag, especially in state_current and API payloads.
  State: current projection, not source of truth, according to docs.
  DOM: rendered view state, but currently also used during interactions as temporary state.

1. Are kind, type, media_type, visualType, and similar fields consistently defined?

  No. type is the closest stable field. kind exists but is not strongly enforced. visualType exists in product default data. Alias confusion is active.

1. Are atomes normalized or stored as loose property bags?

  Both. Identity is normalized; most semantics remain loose property bags in particles and properties.

1. Are all atomes created through one canonical creation path?

  No.

1. Are all atomes updated through one canonical mutation path?

  No.

1. Are all atomes rendered through one canonical rendering projection?

  No.

1. Does the architecture allow the same persisted atome to have multiple independent views?

  Conceptually yes, because renderer is documented as a hint and the durable model is separate. Practically the view boundary is not clean enough to claim this is consistently implemented.

1. Does the architecture allow a virtual or non-rendered atome?

  Yes, in principle and in storage. Tools and non-visual records can exist without project-surface rendering.

1. Does the architecture distinguish persisted data from transient runtime, editor, or session state?

  Yes in documentation, only partially in implementation.

## 12. Final Judgment

If the question is whether the project already defines a proper Atome architecture, the answer is yes in documentation.

If the question is whether that documented architecture is fully implemented and enforced, the answer is no.

If the question is whether the current implementation already behaves like one coherent model, view, and controller architecture, the answer is also no.

Final judgment:

- The architecture is defined, but only partially implemented.
- The durable SQL family is coherent as a storage substrate.
- The effective Atome model in runtime code is still structurally mixed.
- The main divergences are:
  - multiple durable write paths;
  - no full schema enforcement for the documented canonical object envelope;
  - compatibility aliases across API and product layers;
  - DOM-driven interaction state;
  - product stores holding atome-shaped payloads outside the canonical Atome SQL contract.

Recommended next step:

- Do not start implementation or refactor yet.
- First produce one short canonical architecture note that explicitly separates:
  - canonical documented Atome object envelope;
  - canonical durable SQL storage family;
  - API response contract;
  - transient runtime, editor, and session state;
  - product-specific non-canonical stores.
- Then list every current bypass of the canonical write path and every accepted alias as explicit architecture debt before any rewrite begins.
