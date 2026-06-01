# Atome Sanitization Task

## Problem Statement

The current Atome/eVe codebase is not yet fully compliant with the normative Atome model defined in [atome/documentations/atome_structur_to_respect.md](../atome/documentations/atome_structur_to_respect.md) and enforced by `.codex/AGENTS.md`.

The required architecture is:

```text
Atome description -> validation/type contract -> commit/event pipeline -> durable storage/history -> current-state projection -> renderer/view projection
```

The forbidden architecture is:

```text
DOM/view/runtime state -> inferred Atome state -> persistence
```

The core risk is that several runtime paths still mix:

- persisted Atome description;
- loose property/particle/data bags;
- DOM datasets;
- DOM geometry and style;
- rendering caches;
- media preview/poster state;
- tool/session/editor state;
- direct persistence helper calls.

This violates the Atome norm:

- canonical structure is `id`, `type`, optional `kind`, optional `renderer`, `meta`, `traits`, `properties`;
- `id` is immutable;
- `type` is canonical;
- `renderer` is only a UI hint;
- unknown properties are forbidden unless schema-authorized;
- DOM, canvas, WebGPU, native views, and other rendering resources are disposable projections only;
- gestures and tools must start from described Atome state and emit canonical mutations through the commit pipeline.

## Task To Accomplish

Bring Atome and eVe into compliance with the Atome concept by auditing and sanitizing every file that creates, normalizes, mutates, persists, loads, renders, or derives state from Atomes.

The target is not a local fix. The target is to ensure all Atome-related code follows one model:

```js
{
  id,
  type,
  kind,
  renderer,
  meta,
  traits,
  properties
}
```

Rendering must become a projection of that structure. Runtime/editor/session state must not be persisted as canonical Atome state. DOM state must never become canonical state.

## Mandatory Actions

1. Enforce the canonical envelope at every Atome API and persistence boundary.
2. Remove permanent reliance on aliases such as `atome_id`, `atome_type`, `particles`, `data`, `media_type`, and `visualType` as source-of-truth contracts. Transitional reads may exist only at boundary adapters and must normalize immediately.
3. Make `properties` schema-owned and reject or quarantine unknown properties according to type definitions.
4. Ensure all durable writes pass through `window.Atome.commit` / `commitBatch` and the server/database event pipeline.
5. Ensure `state_current` remains a projection cache, never a source of truth.
6. Ensure project rendering reads Atome descriptions and does not infer canonical data from DOM.
7. Ensure drag, resize, selection, placement, text edit, media edit, and Molecule/MTraX interactions compute mutations from described state, not from drifted DOM state.
8. Ensure media, poster, timeline, and group fields are normalized as Atome properties or dedicated typed child/session records, not duplicated through many aliases.
9. Add targeted tests before each sanitization step.
10. Do not add feature logic to any non-compliant Atome file before sanitizing the relevant ownership boundary.

## Completed In Current Sanitization Pass

- Closed the cited server persistence bypasses in `server/auth.js`, `server/server.js`, and `server/sharing.js` by routing durable creates and property updates through the event pipeline instead of direct `state_current`, `createAtome`, `updateAtome`, or `setParticle` calls.
- Removed the eVe-local `eVe/core/atome_property_sanitizer.js` authority and switched `eVe/core/atome_commit.js`, `eVe/intuition/runtime/tool_genesis.js`, and `atome/src/squirrel/apis/unified/adole_api/atomes.js` to the shared `atome/shared/atome_contract.js` sanitizer.
- Extended the shared contract reserved-property list to cover `media_type`, `visualType`, `selected`, and `selection`, keeping media aliases and UI selection state out of canonical Atome properties unless explicitly modeled elsewhere.
- Consolidated `properties` / `particles` / `data` normalization in `server/atomeRoutes.orm.js` behind a single boundary adapter helper, so those aliases do not remain ordinary route-level working contracts.
- Added `tests/server/atome_persistence_boundary.test.mjs` as a guard against reintroducing the removed direct server persistence calls or local sanitizer duplication.
- Removed obsolete local reserved-property sanitizer duplicates from active Atome mutation surfaces and routed them to the shared `atome/src/shared/atome_contract.js` owner:
  - `eVe/domains/media/api/media_persistence_service.js`
  - `eVe/domains/media/asset_box.js`
  - `atome/src/application/audio_runtime/av_contracts.js`
  - `atome/src/squirrel/apis/unified/adole.js`
  - `eVe/intuition/matrix/core/project_data.js`
  - `eVe/intuition/tools/clipboard/paste_events.js`
  - `eVe/intuition/tools/selection_style_apply.js`
- Added sanitizer ownership guards so active media, AV, ADOLE, Matrix, clipboard, and selection-style mutation surfaces cannot reintroduce local `RESERVED_ATOME_PROPERTY_KEYS` lists or local sanitizer contracts.
- Verified obsolete renderer routes were not touched or reintroduced; Bevy remains the active project renderer path and the cleanup stayed limited to canonical Atome property-boundary ownership.
- Sanitized the active Atome event placement/text-fit boundary so system-root, tool-host, and text-host decisions use Atome runtime state instead of DOM `dataset` authority:
  - `eVe/core/atome_events/placement_runtime.js`
  - `eVe/core/atome_events/text_fit_runtime.js`
  - `eVe/core/atome_events/drag_runtime.js`
  - `eVe/core/atome_events.js`
  - `eVe/intuition/runtime/tool_genesis.js`
- Added focused event-runtime tests proving snap geometry still comes from described Atome state and host classification ignores stale `dataset` values.

Validation completed:

- `node --test atome/shared/atome_contract.test.mjs tests/server/atome_persistence_boundary.test.mjs tests/eve/atome_commit.sanitization.test.mjs tests/eve/adole_commit_boundary.test.mjs`
- `npx vitest run tests/server/share_notifications.test.js tests/server/notification_stack.test.js tests/server/state_current_shared.test.js`
- `node --check` on the modified server, runtime, and client modules.
- `node --test atome/shared/atome_contract.test.mjs database/adole.sanitization.test.mjs database/adole.event_projection_invariants.test.mjs tests/server/atome_persistence_boundary.test.mjs tests/eve/adole_commit_boundary.test.mjs tests/eve/atome_commit.sanitization.test.mjs atome/src/application/audio_runtime/av_api_boundaries.test.mjs`
- `npm run test:run -- tests/eve/media_persistence_service.sanitization.test.mjs tests/eve/media_asset_box.sanitization.test.mjs tests/eve/atome_property_sanitizer_ownership.test.mjs`
- `node --check` on the modified media, AV, ADOLE, Matrix, clipboard, and selection-style modules.
- `node --test eVe/core/atome_events/placement_runtime.test.mjs eVe/core/atome_events/text_fit_runtime.test.mjs`
- `npm run test:run -- tests/eve/project_layer_canvas_lasso_selection.test.mjs`
- `node --check` on the modified Atome event and `tool_genesis.js` modules.

Still open:

- Remaining DOM and `dataset` decoupling in `tool_genesis.js`, `tool_runtime.js`, and import/tool surfaces outside the placement/text-fit boundary.
- Remaining drag, resize, placement, and geometry cleanup beyond the described-geometry snap and runtime-host-classification guards.
- Remaining P1 media/import/poster and MTraX/Molecule sanitization beyond shared sanitizer ownership.

## Priority Audit Files

### P0 - Canonical Contract And Persistence Boundary

These files define whether Atome data is clean before it reaches the rest of the system.

- [atome/shared/atome_contract.js](../atome/shared/atome_contract.js)
  - Action: expand from reserved-key filtering into a real canonical envelope validator/normalizer.
  - Action: decide where transitional aliases are accepted and ensure aliases never escape normalized boundaries.
  - Action: add type/schema hooks for `properties`.

- [atome/shared/atome_contract.test.mjs](../atome/shared/atome_contract.test.mjs)
  - Action: cover canonical envelope formatting, alias rejection, property sanitization, unknown-property handling, immutable `id`, and renderer-as-hint behavior.

- [database/adole.js](../database/adole.js)
  - Action: enforce canonical envelope before durable writes.
  - Action: stop treating properties as an unconstrained open particle bag.
  - Action: verify `events`, `particles`, `particles_versions`, and `state_current` preserve canonical meaning.
  - Action: reject reserved envelope keys inside property writes.
  - Risk: 2348 lines; no feature growth until boundary is sanitized.

- [database/schema.sql](../database/schema.sql)
  - Action: verify tables match the canonical model and do not force alias-based semantics.
  - Action: document how `atomes`, `particles`, `particles_versions`, `events`, `state_current`, `snapshots`, `permissions`, and sync tables map to the canonical envelope.

- [server/atomeRoutes.orm.js](../server/atomeRoutes.orm.js)
  - Action: normalize all incoming/outgoing Atome records through one canonical contract.
  - Action: remove route-specific shape variants.
  - Action: ensure API responses do not promote `particles`/`data` aliases as canonical.
  - Risk: 1218 lines; split or isolate Atome serialization before extending.

- [atome/src/squirrel/apis/unified/adole_api/atomes.js](../atome/src/squirrel/apis/unified/adole_api/atomes.js)
  - Action: make client create/list/upsert paths consume and emit canonical envelopes.
  - Action: constrain compatibility aliases to adapter boundaries.
  - Action: make `buildUpsertPayload`, `normalizeAtomeRecord`, and state-current mapping explicit transitional adapters.
  - Risk: 677 lines; no additional shape variants.

- [eVe/core/atome_commit.js](../eVe/core/atome_commit.js)
  - Action: verify all visible eVe writes enter the canonical commit path.
  - Action: prevent direct state mutation before commit normalization.

### P0 - Project Atome Rendering And DOM Coupling

These files decide whether the DOM is only a projection or becomes a source of truth.

- [eVe/intuition/runtime/tool_genesis.js](../eVe/intuition/runtime/tool_genesis.js)
  - Action: split Atome rendering from Atome creation/persistence responsibilities.
  - Action: replace `dataset`-owned group/timeline/preview state with reads from canonical Atome descriptions.
  - Action: ensure `renderAtomeRecord`, `createAtomeElement`, `buildPropertiesFromSpec`, `loadProjectAtomes`, and `updateAtomeProperties` are adapters around canonical Atome records, not independent contracts.
  - Action: remove long-term reliance on `properties`/`particles`/`data` equivalence.
  - Risk: 5505 lines; critical coupling hotspot.

- [eVe/intuition/eVeIntuition.js](../eVe/intuition/eVeIntuition.js)
  - Action: audit every Atome-related path for DOM-derived state and direct update calls.
  - Action: move Atome model decisions out of product UI orchestration.
  - Action: prevent Molecule/MTraX/project UI from using project Atome DOM nodes as canonical state containers.
  - Risk: 18529 lines; no feature growth, only extraction/sanitization.

- [eVe/intuition/shared/group_state_runtime.js](../eVe/intuition/shared/group_state_runtime.js)
  - Action: define whether group state is canonical Atome properties or render-only projection.
  - Action: remove host/dataset read paths as canonical fallbacks.

- [eVe/core/atome_timeline.js](../eVe/core/atome_timeline.js)
  - Action: ensure timeline rendering uses canonical Atome state and not rendered element state.

### P0 - Atome Interaction And Geometry

These files can accidentally make DOM geometry canonical.

- [eVe/core/atome_events/drag_runtime.js](../eVe/core/atome_events/drag_runtime.js)
  - Action: verify drag baseline comes from described Atome state, not `style.left/top`.
  - Action: ensure drag emits canonical mutations only.
  - Risk: 920 lines.

- [eVe/core/atome_events/resize_runtime.js](../eVe/core/atome_events/resize_runtime.js)
  - Action: verify resize baseline comes from described Atome state, not offset/DOM geometry.
  - Action: ensure resize emits canonical layout properties only.

- [eVe/core/atome_events/placement_runtime.js](../eVe/core/atome_events/placement_runtime.js)
  - Action: replace snap candidate DOM geometry reads with canonical layout projection data where possible.
  - Existing seed finding: snap candidate resolution still reads target geometry from DOM style or offsets.

- [eVe/core/atome_events/project_layer_runtime.js](../eVe/core/atome_events/project_layer_runtime.js)
  - Action: ensure lasso, group creation, text creation, and snapshot creation emit canonical create/mutate commands.
  - Action: prevent project-layer UI state from being persisted as Atome model.

- [eVe/core/atome_events/text_edit_runtime.js](../eVe/core/atome_events/text_edit_runtime.js)
  - Action: ensure text edits mutate canonical text properties, not innerHTML-derived view state.

- [eVe/core/atome_events/text_edit_ui_runtime.js](../eVe/core/atome_events/text_edit_ui_runtime.js)
  - Action: keep editor DOM transient and validate final mutation through canonical text schema.

- [eVe/intuition/runtime/selection.js](../eVe/intuition/runtime/selection.js)
  - Action: determine whether selection is canonical persisted Atome state or transient UI state.
  - Action: stop persisting UI-only selection fields unless schema-authorized.

### P1 - Media, Recording, Import, Poster, And Asset Atomes

These files often duplicate source fields and poster fields across many aliases.

- [eVe/domains/media/api/media_persistence_service.js](../eVe/domains/media/api/media_persistence_service.js)
  - Action: ensure media atome creation uses canonical Atome envelope.
  - Action: normalize poster fields into schema-owned properties.
  - Action: ensure render refresh is a projection step, not the persistence source.

- [eVe/domains/media/api/audio_api.js](../eVe/domains/media/api/audio_api.js)
  - Action: audit recorded audio Atome creation and ensure complete physical characteristics are canonical properties.
  - Risk: 1518 lines.

- [eVe/domains/media/api/video_api.js](../eVe/domains/media/api/video_api.js)
  - Action: audit recorded video Atome creation, poster capture, source fields, and media metadata.
  - Action: ensure recording completion creates exactly one canonical media Atome.
  - Risk: 2009 lines.

- [eVe/domains/media/api/media_api_shared.js](../eVe/domains/media/api/media_api_shared.js)
  - Action: keep media route/source normalization separate from Atome model identity.

- [eVe/domains/media/shared/media_source.js](../eVe/domains/media/shared/media_source.js)
  - Action: verify source canonicalization does not create competing persisted source fields.

- [eVe/domains/media/shared/media_video_poster_runtime.js](../eVe/domains/media/shared/media_video_poster_runtime.js)
  - Action: keep poster capture/render helpers as projection utilities unless explicitly persisted through canonical mutation.

- [eVe/domains/media/asset_box.js](../eVe/domains/media/asset_box.js)
  - Action: audit imported media Atome creation and metadata normalization.
  - Action: remove direct persistence of UI/import transient fields.
  - Risk: 1845 lines.

- [eVe/intuition/tools/capture.js](../eVe/intuition/tools/capture.js)
  - Action: verify capture tool state is transient and only finalized media Atome data is persisted.

- [eVe/intuition/tools/project_drop.js](../eVe/intuition/tools/project_drop.js)
  - Action: audit import/drop-to-project creation paths for canonical envelope use.
  - Action: reduce duplicate poster/source/timeline alias writes.
  - Risk: 8899 lines; critical import coupling hotspot.

### P1 - MTraX And Molecule Atome Coupling

These files must not store session/editor/render state as canonical Atome state.

- [eVe/core/media_engine/molecule.js](../eVe/core/media_engine/molecule.js)
  - Action: ensure Molecule engine commits canonical timeline/session mutations without DOM dependencies.

- [eVe/core/media_engine/molecule.api.js](../eVe/core/media_engine/molecule.api.js)
  - Action: verify public Molecule API consumes canonical Atome/timeline descriptions.

- [eVe/core/molecule_store_bootstrap.js](../eVe/core/molecule_store_bootstrap.js)
  - Action: verify molecule storage does not duplicate Atome persistence semantics.

- [eVe/domains/mtrax/timeline/import_media_timeline.js](../eVe/domains/mtrax/timeline/import_media_timeline.js)
  - Action: decide whether imported media timeline fields are canonical Atome properties, child records, or session data.

- [eVe/domains/mtrax/timeline/persist_runtime.js](../eVe/domains/mtrax/timeline/persist_runtime.js)
  - Action: ensure timeline persistence writes canonical Atome properties through one path.

- [eVe/domains/mtrax/timeline/group_timeline_load_runtime.js](../eVe/domains/mtrax/timeline/group_timeline_load_runtime.js)
  - Action: ensure timeline load derives from Atome description, not rendered group host state.

- [eVe/domains/mtrax/project/project_atome_timeline_runtime.js](../eVe/domains/mtrax/project/project_atome_timeline_runtime.js)
  - Action: audit project Atome to timeline conversion and persistence.

- [eVe/domains/mtrax/project/project_atome_drop_runtime.js](../eVe/domains/mtrax/project/project_atome_drop_runtime.js)
  - Action: verify project Atome drop is action/controller logic only and does not invent model fields.

- [eVe/domains/mtrax/project/project_playback_target_runtime.js](../eVe/domains/mtrax/project/project_playback_target_runtime.js)
  - Action: ensure project playback target state remains transient unless schema-owned.

- [eVe/domains/mtrax/project/project_playback_mirror_runtime.js](../eVe/domains/mtrax/project/project_playback_mirror_runtime.js)
  - Action: verify mirror state does not become canonical Atome state.

- [eVe/domains/mtrax/media/atome_runtime.js](../eVe/domains/mtrax/media/atome_runtime.js)
  - Action: ensure MTraX-created media Atomes use the canonical envelope.

- [eVe/domains/mtrax/media/drop_runtime.js](../eVe/domains/mtrax/media/drop_runtime.js)
  - Action: audit dropped media conversion and prevent DOM/drop event data from persisting unchecked.

- [eVe/domains/mtrax/media/element_runtime.js](../eVe/domains/mtrax/media/element_runtime.js)
  - Action: keep media elements as runtime projections only.

- [eVe/domains/mtrax/preview/preview_poster_capture_runtime.js](../eVe/domains/mtrax/preview/preview_poster_capture_runtime.js)
  - Action: verify captured previews are persisted only through canonical Atome mutations.

- [eVe/domains/mtrax/preview/preview_draw_runtime.js](../eVe/domains/mtrax/preview/preview_draw_runtime.js)
  - Action: ensure draw-created Atomes follow canonical creation.

- [eVe/domains/mtrax/preview/preview_text_create_runtime.js](../eVe/domains/mtrax/preview/preview_text_create_runtime.js)
  - Action: ensure text Atome creation uses canonical text schema.

- [eVe/domains/mtrax/clips/add_clip_runtime.js](../eVe/domains/mtrax/clips/add_clip_runtime.js)
  - Action: verify clip-to-Atome interactions do not duplicate media Atome source fields.

- [eVe/domains/mtrax/clips/deletion_runtime.js](../eVe/domains/mtrax/clips/deletion_runtime.js)
  - Action: ensure source cleanup and Atome deletion are canonical mutations, not direct state edits.

- [eVe/domains/mtrax/text/clip_content_runtime.js](../eVe/domains/mtrax/text/clip_content_runtime.js)
  - Action: prevent text clip DOM/editor state from becoming canonical Atome state.

- [eVe/domains/mtrax/svg/clip_edit_runtime.js](../eVe/domains/mtrax/svg/clip_edit_runtime.js)
  - Action: ensure SVG edits persist canonical SVG properties only.

### P1 - Tool-Generated Atomes And Product UI

These files create or mutate Atomes through tools and must not own parallel contracts.

- [eVe/intuition/tools/core/tool_runtime.js](../eVe/intuition/tools/core/tool_runtime.js)
  - Action: audit all tool-created Atome payloads and enforce canonical envelope.
  - Action: prevent tool DOM state from being model state.

- [eVe/intuition/tools/core/tool_registry.js](../eVe/intuition/tools/core/tool_registry.js)
  - Action: verify deferred persistence uses canonical Atome mutations.

- [eVe/intuition/tools/communication.js](../eVe/intuition/tools/communication.js)
  - Status: partially sanitized.
  - Action: verify all remaining Atome updates use described state and canonical properties.

- [eVe/intuition/tools/selection_style_apply.js](../eVe/intuition/tools/selection_style_apply.js)
  - Action: convert style edits into schema-owned visual properties, not arbitrary CSS payloads.

- [eVe/intuition/tools/user.js](../eVe/intuition/tools/user.js)
  - Action: audit user-driven Atome updates for reserved-property leakage.

- [eVe/intuition/tools/layer.js](../eVe/intuition/tools/layer.js)
  - Action: verify layer operations are model mutations, not DOM-only state.

- [eVe/intuition/tools/delete.js](../eVe/intuition/tools/delete.js)
  - Action: ensure deletion and restore paths preserve event/history semantics.

- [eVe/intuition/tools/infos.js](../eVe/intuition/tools/infos.js)
  - Action: ensure info-panel edits do not bypass canonical schema.

- [eVe/intuition/tools/project_bootstrap.js](../eVe/intuition/tools/project_bootstrap.js)
  - Action: verify project bootstrap creates only canonical Atome records.

- [eVe/intuition/matrix/core/project_data.js](../eVe/intuition/matrix/core/project_data.js)
  - Action: verify Matrix project data is not a competing Atome projection source.

- [eVe/intuition/matrix/core/preview.js](../eVe/intuition/matrix/core/preview.js)
  - Action: keep preview rendering separate from Atome persistence.

### P2 - Open Atome/Squirrel Rendering And Components

These files must be audited before being treated as canonical Atome-owned UI.

- [atome/src/squirrel/atome/atome.js](../atome/src/squirrel/atome/atome.js)
  - Action: verify open Atome object implementation respects the documented model.

- [atome/src/squirrel/apis/essentials.js](../atome/src/squirrel/apis/essentials.js)
  - Action: audit whether public helper APIs create Atomes or DOM directly.

- [atome/src/squirrel/components/editor_builder.js](../atome/src/squirrel/components/editor_builder.js)
  - Action: ensure editor component state is not a hidden Atome model.

- [atome/src/squirrel/components/slider_builder.js](../atome/src/squirrel/components/slider_builder.js)
  - Action: verify component builders are reusable view projections, not persistence owners.

- [atome/src/squirrel/components/tool_slider_builder.js](../atome/src/squirrel/components/tool_slider_builder.js)
  - Action: verify canonical control state is explicit and does not rely on local DOM as model.

- [atome/src/application/examples/*.js](../atome/src/application/examples)
  - Action: examples must not teach non-canonical Atome shapes or direct DOM-as-model patterns.

## Verification Requirements

Each sanitized area must gain or update tests for:

1. canonical envelope acceptance;
2. alias normalization at boundaries only;
3. reserved envelope keys rejected from `properties`;
4. unknown properties rejected or quarantined according to schema;
5. durable writes flowing through commit/event pipeline;
6. `state_current` used as projection cache only;
7. rendering rebuilding from Atome description without DOM-owned state;
8. drag/resize/placement computing from described state;
9. media/import/recording producing one canonical media Atome shape;
10. project reload preserving canonical Atome data independent of rendered DOM.

Candidate existing tests to extend:

- [atome/shared/atome_contract.test.mjs](../atome/shared/atome_contract.test.mjs)
- [database/adole.sanitization.test.mjs](../database/adole.sanitization.test.mjs)
- [eVe/core/atome_events/placement_runtime.test.mjs](../eVe/core/atome_events/placement_runtime.test.mjs)
- [eVe/domains/media/api/media_persistence_service.test.mjs](../eVe/domains/media/api/media_persistence_service.test.mjs)
- [tests/probes/atome_persistence_probe.test.mjs](../tests/probes/atome_persistence_probe.test.mjs)
- [tests/probes/media_import_probe.test.mjs](../tests/probes/media_import_probe.test.mjs)
- [tests/probes/tauri_recorded_video_mtrack_probe.test.mjs](../tests/probes/tauri_recorded_video_mtrack_probe.test.mjs)

## Execution Rule

Every time a framework file touching Atomes or rendering is modified:

1. Check it against [atome/documentations/atome_structur_to_respect.md](../atome/documentations/atome_structur_to_respect.md).
2. Identify whether it is model, controller/action, persistence, projection, or session/editor runtime.
3. Sanitize the file if the Atome contract is violated.
4. Add or update the narrowest relevant test before changing behavior.
5. Validate immediately after each substantive edit.
6. Do not extend feature scope before the contract violation is resolved at the owning layer.

## Stop Conditions

Stop and request architectural clarification if:

- a file needs a schema/type definition that does not exist;
- a runtime path cannot distinguish persisted Atome state from UI/session state;
- a storage layer requires backward compatibility aliases but no migration rule exists;
- a rendering path depends on DOM data that cannot be reconstructed from Atome description;
- two layers claim ownership of the same Atome field.
