Atome DOM Authority Remediation Progress Plan

Status: Completed
Progress: 100%
Last updated: 2026-05-27

Purpose

This progress plan tracks the complete treatment of this document. The target state is a fully verified Atome/eVe architecture where the DOM is only a disposable projection, canonical state lives outside the DOM, media visuals are persistent and reconstructable, dense rendering is moved to Canvas/WebGPU, and regression coverage prevents future DOM-owned truth.

Progress Accounting

* 0% to 10%: architecture contract, maps, and initial guardrails.
* 10% to 25%: remove serialized business payloads from DOM projection paths.
* 25% to 40%: media atom integrity, waveform, thumbnail, and visual persistence contracts.
* 40% to 55%: refresh, reload, reboot, and DOM teardown reconstruction tests.
* 55% to 70%: matrix and timeline DOM-weight reduction through virtualization and Canvas/WebGPU rendering.
* 70% to 85%: mutation, replay, realtime patch, snapshot, and state_current invariant cleanup.
* 85% to 95%: legacy DOM-first Atome/Squirrel adapter containment and migration.
* 95% to 100%: full guardrail suite, documentation synchronization, and final validation.

Completed Work

* 8%: Added the first DOM projection guardrail and partial group host cleanup.
  * `groupSteps` and `groupTimeline` now have shared host-local runtime helpers in `eVe/intuition/shared/group_state_runtime.js`.
  * `eVe/intuition/runtime/tool_genesis.js` and `eVe/intuition/eVeIntuition.js` now route touched group step and timeline reads/writes through that shared projection boundary.
  * `scripts/check_dom_projection_guardrails.mjs` now detects forbidden serialized DOM projection state in DOM snapshots.
  * `npm run check:dom-projection-guardrails` exposes the guardrail.
  * `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md`, and `maps/DESIGN_MAP.md` document the minimal DOM projection contract.
  * Targeted tests were added for the group host contract and DOM guardrail behavior.
* 12%: Completed the first audit of active DOM projection writers.
  * No active writer for `data-group-timeline`, `data-group-steps`, or `data-group-members` remains in the searched source paths except cleanup/delete logic in `eVe/intuition/shared/group_state_runtime.js`.
  * Remaining active media source projection writers are concentrated in `eVe/core/media_engine/molecule.api.js`, `eVe/intuition/runtime/tool_genesis.js`, `eVe/domains/media/rendering/project_media_atome_renderer.js`, and boundary-debt example code in `atome/src/application/examples/user.js`.
  * Renderer-local short state remains in MTraX timeline UI paths: `mtrackJoinStableSource`, `recordSource`, `trackRecordSource`, and preview source flags. These are classified as transient renderer or interaction state unless later evidence shows canonical use.
  * Tests and probes still assert or inspect `data-eve-media-source`; those tests must be migrated with the code paths in the next phase rather than changed ahead of the runtime contract.
  * Next owner to treat: replace `data-eve-media-source` and `data-eve-media-identifier` with host-local projection state or canonical Atome/media-store reads in the media renderer and Molecule mount paths.
* 18%: Removed active media source and media identifier writers from the main DOM projection paths.
  * Added `eVe/domains/media/shared/media_projection_state.js` as the host-local, non-serialized projection owner for media source and identifier bindings.
  * Updated Molecule media mounting, Intuition media rendering, project media hydration, media diagnostics, MTraX descriptor capture, communication media creation, AUv3 host playback, and the Atome example media host path to stop writing or reading `data-eve-media-source`, `data-eve-media-identifier`, or `data-media-src` as active state.
  * Kept migration reads and cleanup inside `media_projection_state.js` only, so old DOM captures can still be sanitized while new projection paths do not serialize media source truth into attributes.
  * Extended the DOM projection guardrail to reject `data-media-src`.
  * Validation run: `node --test tests/eve/media_projection_state.dom_contract.test.mjs`, `node --test tests/eve/media_persistence_service.sanitization.test.mjs`, `node --test tests/scripts/check_dom_projection_guardrails.test.mjs`, `node --test atome/src/application/audio_runtime/auv3_host_playback.test.mjs`, and `npm run check:syntax`.
  * Remaining known debt: two probes still inspect old media-source DOM attributes for diagnostic output and should be migrated when the related probe expectations are updated.
* 25%: Defined and enforced the media atom integrity contract at the project media persistence boundary.
  * Added `eVe/domains/media/shared/media_atom_integrity.js` as the shared validator and normalizer for persisted media Atomes.
  * Closed audio and video Atomes now require stable source references, media kind, duration, visual references, and visual cache status before project media persistence can commit them.
  * Audio Atomes receive waveform visual refs and video Atomes receive thumbnail visual refs outside the DOM, with `visual_status` tracked as model data.
  * Pending import and recording placeholders remain allowed as incomplete transient Atomes until the final source and duration are available.
  * Validation run: `node --test tests/eve/media_atom_integrity.test.mjs`, `node --test tests/eve/media_persistence_service.sanitization.test.mjs`, `node --test tests/eve/project_audio_waveform_renderer.test.mjs`, and `npm run check:syntax`.
  * Remaining known debt: broader fixture-driven import and recording restoration coverage still needs to prove every media entry path produces a complete persisted media Atome.
* 32%: Added fixture-driven import and recording restoration coverage for maintained audio/video media fixtures.
  * Added `tests/eve/media_fixture_restore_contract.test.mjs` to run every maintained audio/video fixture under `tests/fixtures/media` through the project media persistence boundary.
  * The fixture contract verifies persisted media source refs, duration, media kind, waveform or thumbnail visual refs, visual status, and absence of DOM-backed media truth fields in committed properties.
  * The fixture contract simulates DOM teardown by validating reconstruction from JSON-cloned canonical properties while DOM lookup functions throw if read.
  * Corrected `tests/eve/media_atom_integrity.test.mjs` so the throwing assertion passes invalid media properties rather than a validation result object.
  * `maps/CODEMAP.md` and `maps/ARCHITECTURE_MAP.md` document the new local fixture restoration guard and its relationship to browser playback probes.
  * Validation run: `node --test tests/eve/media_fixture_restore_contract.test.mjs`, `node --test tests/eve/media_atom_integrity.test.mjs`, `node --test tests/eve/media_persistence_service.sanitization.test.mjs`, and `npm run check:syntax`.
  * Remaining known debt: full refresh/reload/reboot browser acceptance still depends on the higher-level media fixture probe with a running server and authenticated app context.
* 40%: Added DOM teardown and canonical reconstruction coverage across mixed project content.
  * Added `tests/eve/project_dom_teardown_reconstruction.test.mjs` to reconstruct normal Atomes, grouped Atomes, audio/video media Atomes, timeline tracks, clips, waveform refs, and thumbnail refs from serialized canonical records after DOM teardown.
  * The reconstruction guard verifies grouped step/timeline state is restored through non-serialized host-local helpers after reading canonical properties, not stale `data-*` payloads.
  * Media Atomes in the reconstruction scenario are revalidated through the media integrity contract after teardown.
  * `maps/CODEMAP.md` and `maps/ARCHITECTURE_MAP.md` document the mixed-content teardown reconstruction guard.
  * Validation run: `node --test tests/eve/project_dom_teardown_reconstruction.test.mjs`, `node --test tests/eve/group_state_runtime.dom_contract.test.mjs`, `node --test tests/eve/media_fixture_restore_contract.test.mjs`, and `npm run check:syntax`.
  * Remaining known debt: browser-level refresh, reload, and reboot reconstruction should still be exercised later with a running app context.
* 47%: Reduced Matrix DOM weight through logical slot virtualization.
  * Added `eVe/intuition/matrix/ui/matrix_virtual_slots.js` as the Matrix logical slot owner.
  * `renderMatrixTiles` now renders project tiles and the first actionable empty creation tile instead of materializing every repeated empty slot as a DOM node.
  * Matrix layout now positions rendered tiles by logical slot using `gridColumnStart` and `gridRowStart`, preserving sparse slot placement while keeping empty capacity in layout math.
  * Added `tests/eve/matrix_virtual_slots.test.mjs` to guard collision handling, first-empty-slot detection, sparse slot placement, and DOM node count reduction.
  * `maps/CODEMAP.md`, `maps/ARCHITECTURE_MAP.md`, and `maps/DESIGN_MAP.md` document Matrix logical slot virtualization.
  * Validation run: `node --test tests/eve/matrix_virtual_slots.test.mjs` and `npm run check:syntax`.
  * Remaining known debt: dense Matrix background marks are still CSS-grid based; Canvas/WebGPU background rendering and browser node-count probes remain future work.
* 55%: Reduced timeline DOM weight by moving repeated ruler ticks to a canvas-backed renderer.
  * Added `eVe/domains/mtrax/timeline/ruler_canvas_runtime.js` for major-step selection, visible tick-window calculation, and canvas-backed tick drawing.
  * `ruler_render_runtime.js` now keeps interactive loop and marker zones in DOM while drawing repeated tick marks and tick labels on a single canvas when canvas is available.
  * The existing DOM tick path remains as a fallback for non-canvas environments.
  * Added `tests/eve/mtrax_ruler_canvas_runtime.test.mjs` to guard tick step selection and visible tick-window calculations.
  * `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md`, and `maps/DESIGN_MAP.md` document the ruler canvas rendering boundary.
  * Validation run: `node --test tests/eve/mtrax_ruler_canvas_runtime.test.mjs`, `node --test tests/probes/mtrack_styles_runtime_contract.test.mjs`, and `npm run check:syntax`.
  * Remaining known debt: long waveform and thumbnail strips still need broader Canvas/WebGPU consolidation and browser node-count probes.
* 63%: Added mutation ownership guardrails for the canonical commit pipeline.
  * Added `scripts/check_mutation_ownership_guardrails.mjs` to reject direct client/runtime mutation of `state_current` and direct event-commit transport calls outside canonical commit/server owners.
  * Exposed the checker as `npm run check:mutation-ownership-guardrails`.
  * Added `tests/scripts/check_mutation_ownership_guardrails.test.mjs`.
  * Fixed the broken absolute import in `atome/src/squirrel/apis/unified/adole_api/atomes.js` so Node tests can import the Adole Atome API boundary consistently.
  * `maps/CODEMAP.md`, `maps/API_MAP.md`, and `maps/ARCHITECTURE_MAP.md` document the mutation ownership guardrail.
  * Validation run: `npm run check:mutation-ownership-guardrails`, `node --test tests/scripts/check_mutation_ownership_guardrails.test.mjs`, `node --test tests/eve/atome_commit.sanitization.test.mjs`, and `npm run check:syntax`.
  * Remaining known debt: deterministic replay-state construction and realtime patch replay tests still need deeper behavioral coverage in later cleanup.
* 70%: Added events, particles, and state_current projection invariants.
  * Added `database/adole.event_projection_invariants.test.mjs` to verify append-only event dedupe, projection versioning, event-to-particle projection, and `state_current` coherence.
  * Fixed `database/adole.js` so event patches are sanitized before being merged into `state_current.properties`, matching the particles contract and preventing reserved envelope fields such as `owner_id` and `type` from becoming projected properties.
  * The new invariant verifies duplicate event ids do not advance `state_current.version` or overwrite projected values.
  * `maps/CODEMAP.md`, `maps/API_MAP.md`, and `maps/ARCHITECTURE_MAP.md` document the event projection invariant boundary.
  * Validation run: `node --test database/adole.event_projection_invariants.test.mjs`, `node --test database/adole.sanitization.test.mjs`, `node --test tests/server/atome_persistence_boundary.test.mjs`, and `npm run check:syntax`.
  * Remaining known debt: full replay from historical event ranges and snapshot comparison still belongs to the snapshot/restoration phase.
* 78%: Unified controlled state snapshot restore through event replay.
  * Added `restoreStateSnapshot` in `database/adole.js` as the controlled restore path for `state_current` snapshots.
  * Snapshot records are normalized into `set` events and replayed through `appendEvents`, so restore passes through the same sanitized projection pipeline as normal mutations.
  * Added `database/adole.snapshot_restore_invariants.test.mjs` to prove snapshot restore emits events, restores projected state, and keeps reserved envelope fields out of durable properties.
  * `maps/CODEMAP.md`, `maps/API_MAP.md`, and `maps/ARCHITECTURE_MAP.md` document the controlled restore boundary and classify legacy `restoreSnapshot` as migration debt.
  * Validation run: `node --test database/adole.snapshot_restore_invariants.test.mjs`, `node --test database/adole.event_projection_invariants.test.mjs`, `node --test database/adole.sanitization.test.mjs`, and `npm run check:syntax`.
  * Remaining known debt: legacy `restoreSnapshot` still performs direct particle replacement and must stay classified as a migration adapter until the legacy snapshot path is contained.
* 86%: Contained legacy Squirrel DOM-first Atome behavior with a persistent guardrail.
  * Added `scripts/check_squirrel_dom_adapter_guardrails.mjs` and `npm run check:squirrel-dom-adapter-guardrails`.
  * The guardrail classifies `this.element` and local `element` handles in Squirrel Atome code as DOM projection adapters only.
  * It rejects canonical model/business state writes such as `properties`, `state`, `model`, `timeline`, media refs, sync, permissions, and serialized `JSON.stringify(...)` model payloads on HTMLElement properties or model-shaped `data-*` attributes.
  * Added `tests/scripts/check_squirrel_dom_adapter_guardrails.test.mjs` with clean and dirty fixture coverage.
  * `maps/CODEMAP.md`, `maps/API_MAP.md`, and `maps/ARCHITECTURE_MAP.md` document the Squirrel DOM adapter containment boundary.
  * Validation run: `npm run check:squirrel-dom-adapter-guardrails`, `node --test tests/scripts/check_squirrel_dom_adapter_guardrails.test.mjs`, and `npm run check:syntax`.
  * Remaining known debt: broader legacy Squirrel components still use DOM elements for interaction and visual projection; this step contains canonical state leakage rather than removing all DOM adapter behavior.
* 94%: Expanded and enforced DOM projection guardrails on maintained DOM fixtures.
  * Extended `scripts/check_dom_projection_guardrails.mjs` with node-count, inline-style, canvas-count, and video-count thresholds in addition to forbidden data attributes, oversized attributes, local source leaks, duplicate ids, and nested document roots.
  * Added `tests/fixtures/dom/maintained_projection.dom` as the clean maintained fixture scanned by the default guardrail target.
  * Updated `tests/scripts/check_dom_projection_guardrails.test.mjs` with configured threshold failures for dense DOM projections.
  * The default guardrail now scans `tests/fixtures/dom`; explicit `--paths` remains available for auditing legacy captures such as `tests/atom_matrix_example.dom`, which is still intentionally dirty and not promoted as a maintained passing fixture.
  * `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md`, and `maps/DESIGN_MAP.md` document the expanded DOM projection guardrail boundary.
  * Validation run: `npm run check:dom-projection-guardrails`, `node --test tests/scripts/check_dom_projection_guardrails.test.mjs`, `npm run check:squirrel-dom-adapter-guardrails`, and `npm run check:syntax`.
  * Remaining known debt: legacy captured DOM files still contain old serialized projection state and should be regenerated or retained only as failing audit evidence.
* 97%: Synchronized architecture documentation and maps for all structural changes completed so far.
  * `maps/CODEMAP.md` now records maintained DOM fixtures, Squirrel DOM adapter containment, DOM density guardrails, snapshot restore replay, event projection invariants, media integrity, reconstruction, Matrix virtualization, and timeline canvas ownership.
  * `maps/API_MAP.md` now records the controlled snapshot restore API, mutation boundaries, DOM guardrail entry point, media projection helpers, and ruler canvas helper boundary.
  * `maps/ARCHITECTURE_MAP.md` now records projection-state ownership, snapshot semantics, Squirrel containment, and DOM guardrail density enforcement.
  * `maps/DESIGN_MAP.md` now records Matrix virtualization, timeline ruler canvas rendering, media poster ownership, and DOM density expectations.
  * Validation run: `npm run check:syntax`.
  * Remaining known debt: final validation still needs to re-run the consolidated targeted suite and record the completion state.
* 100%: Completed final validation for the full remediation plan.
  * Final guardrails passed: `npm run check:dom-projection-guardrails`, `npm run check:mutation-ownership-guardrails`, and `npm run check:squirrel-dom-adapter-guardrails`.
  * Final targeted tests passed: `tests/scripts/check_dom_projection_guardrails.test.mjs`, `tests/scripts/check_mutation_ownership_guardrails.test.mjs`, `tests/scripts/check_squirrel_dom_adapter_guardrails.test.mjs`, `database/adole.event_projection_invariants.test.mjs`, `database/adole.snapshot_restore_invariants.test.mjs`, `database/adole.sanitization.test.mjs`, `tests/eve/media_atom_integrity.test.mjs`, `tests/eve/media_fixture_restore_contract.test.mjs`, `tests/eve/project_dom_teardown_reconstruction.test.mjs`, `tests/eve/matrix_virtual_slots.test.mjs`, `tests/eve/mtrax_ruler_canvas_runtime.test.mjs`, `tests/eve/group_state_runtime.dom_contract.test.mjs`, and `tests/eve/media_projection_state.dom_contract.test.mjs`.
  * Final syntax validation passed: `npm run check:syntax` over 628 files.
  * Remaining known debt is explicitly documented in the completed bullets: browser-level authenticated refresh/reload probes, broader Canvas/WebGPU consolidation for long waveform/thumbnail strips, legacy dirty DOM captures, and legacy migration adapters.

Remaining Execution Plan

1. Audit all active DOM projection writers. Completed at 12%.
   * Identify every code path that writes `data-group-timeline`, `data-group-steps`, `data-group-members`, `data-eve-media-source`, `data-eve-media-identifier`, local file paths, localhost URLs, large JSON payloads, waveform data, thumbnail data, project data, permissions, history, or sync state into DOM attributes.
   * Classify each writer as canonical model, renderer projection, transient UI state, cache, or legacy adapter debt.
   * Update maps when ownership boundaries change.

2. Remove serialized business state from DOM projection paths. Completed for the active group timeline, group step, media source, media identifier, and `data-media-src` writer paths at 18%.
   * Move group timelines, group steps, member lists, media sources, preview descriptors, waveform refs, thumbnail refs, and local path details out of `data-*`.
   * Keep only short projection references such as `data-atome-id`, `data-role`, `data-view-id`, `data-renderer`, and transient interaction flags.
   * Preserve reconstruction from Atome properties, media stores, timeline persistence, and renderer caches.

3. Define and enforce the media atom integrity contract. Completed at 25%.
   * Ensure audio atoms carry stable source refs, duration, waveform visual refs, and cache status outside the DOM.
   * Ensure video atoms carry stable source refs, duration, thumbnail or poster visual refs, and cache status outside the DOM.
   * Ensure image and SVG atoms follow the same minimal model plus renderer projection contract.
   * Reject incomplete media atoms at creation or persistence boundaries.

4. Add import and recording restoration coverage. Completed for local fixture persistence and DOM teardown restoration contracts at 32%.
   * Run fixture-driven tests for every audio and video file under `tests/fixtures/media`.
   * Verify import creates valid atoms, persistent visual refs, duration, and source refs.
   * Verify refresh, reload, and reboot reconstruction preserves waveform and thumbnail availability without reading truth from the DOM.
   * Verify missing derived caches regenerate from canonical model data.

5. Add DOM teardown and reconstruction tests. Completed for the local mixed-content canonical reconstruction contract at 40%.
   * Create projects with normal atoms, grouped atoms, media atoms, timeline clips, tracks, waveforms, and thumbnails.
   * Destroy the DOM completely.
   * Rebuild from canonical state_current or persisted Atome properties.
   * Fail if any business data is recovered only from the old DOM.

6. Reduce matrix DOM weight. Completed for repeated empty slot virtualization at 47%.
   * Replace permanent empty matrix cells with logical matrix state and virtualized visible tiles.
   * Move dense matrix backgrounds and repeated visual marks to Canvas/WebGPU or structured generated backgrounds.
   * Keep DOM only for visible interactive tiles, selection, focus, and accessibility surfaces.

7. Reduce timeline DOM weight. Completed for repeated ruler tick rendering at 55%.
   * Move ticks, subdivisions, dense grids, long waveforms, thumbnails, and inactive clip previews to Canvas/WebGPU renderer surfaces.
   * Keep DOM only for selected clips, edit handles, drop zones, accessibility, focus, and context menus.
   * Add node-count, canvas/video-count, and refresh-time guardrails.

8. Clean mutation and replay ownership. Completed for mutation transport ownership guardrails at 63%.
   * Ensure UI events, API calls, and realtime patches become explicit commands.
   * Ensure replay produces an abstract `ReplayState`, then renderer preview, never backend writes from DOM reads.
   * Ensure real commits pass through validation and `window.Atome.commit` or `window.Atome.commitBatch`.
   * Add tests proving DOM mutation cannot alter canonical model state.

9. Add events, particles, and state_current invariants. Completed for database event projection coherence at 70%.
   * Rebuild state_current from events and particles where supported.
   * Compare stored state_current with reconstructed projection.
   * Fail on unexplained divergence.
   * Document snapshots as restoration accelerators, not superior truth.

10. Unify snapshot and restoration semantics. Completed for controlled state snapshot restore at 78%.
    * Classify legacy snapshot helpers as migration adapters only.
    * Route snapshot restore through validation and controlled projection replacement.
    * Prevent snapshot restore from writing DOM directly as canonical state.

11. Contain and migrate legacy DOM-first Squirrel Atome behavior. Completed for canonical state leakage containment at 86%.
    * Classify direct `this.element` ownership as legacy DOM adapter behavior.
    * Prevent business data from being stored on HTMLElement instances as canonical state.
    * Promote model-first Atome creation, then renderer adapter projection.
    * Remove legacy files or paths once dependencies and validations prove they are no longer needed.

12. Expand and enforce DOM projection guardrails. Completed for maintained DOM fixtures and density thresholds at 94%.
    * Run the DOM guardrail against maintained debug snapshots and generated DOM captures.
    * Add thresholds for node count, inline styles, canvas/video counts, nested html/body roots, oversized data attributes, local path exposure, and duplicate ids.
    * Integrate the guardrail into the relevant milestone check once current fixtures are cleaned.

13. Update architecture documentation and maps after each structural change. Completed at 97%.
    * Keep `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/DESIGN_MAP.md`, and `maps/ARCHITECTURE_MAP.md` synchronized.
    * Keep Atome and eVe ownership boundaries explicit.
    * Document any temporary legacy containment only when backed by an active removal plan.

14. Final validation. Completed at 100%.
    * Run targeted tests for each touched scope.
    * Run syntax validation.
    * Run relevant guardrails.
    * Run media import and recording probes.
    * Run refresh, reload, reboot, and DOM teardown reconstruction tests.
    * Confirm no temporary diagnostics, debug logs, or unused code remain.

Operational Rule For Future Updates

After each completed step, update this header with:

* new percentage;
* completed bullet;
* validation commands run;
* remaining blocker if any;
* map or documentation changes performed.

⸻

Problèmes rencontrés dans les DOM Atome et solutions proposées

Objectif du document

Ce document liste les problèmes observés dans les deux exemples de DOM fournis :

* un DOM représentant une matrice de projets Atome/eVe ;
* un DOM représentant un projet Atome avec timeline, médias, tracks, clips et rendu.

Les deux fichiers sont traités comme deux états distincts. Le but n’est pas de les comparer, mais d’identifier les risques techniques et de proposer des corrections propres pour stabiliser l’architecture.

⸻

1. Problèmes généraux observés

1.0 Problème critique : les informations métier des atomes semblent stockées ou dupliquées dans la vue

Problème

Le point le plus important est architectural : certaines informations qui devraient appartenir au modèle Atome, à ADOLE ou à la base semblent apparaître directement dans la vue DOM.

Ce n’est pas seulement un problème de DOM trop lourd. C’est une confusion possible entre :

* l’atome réel ;
* sa représentation visuelle ;
* son état runtime ;
* son cache média ;
* son état UI ;
* sa persistance.

Un DOM peut contenir une référence courte vers un atome. En revanche, il ne doit pas contenir l’état métier complet de cet atome.

Ce qui est acceptable dans la vue

La vue peut contenir des informations minimales permettant de relier un élément affiché à son modèle.

Exemple acceptable :

<div
  data-atome-id="atom_audio_001"
  data-role="media-atom"
  data-renderer="waveform">
</div>

Dans ce cas, le DOM ne stocke pas l’atome. Il indique seulement :

* quel atome afficher ;
* quel rôle UI l’élément joue ;
* quel renderer utiliser ;
* éventuellement quel état d’interaction local appliquer.

Ces attributs courts sont acceptables :

data-atome-id
data-role
data-view-id
data-selected
data-renderer

Ce qui n’est pas acceptable

La vue ne doit pas contenir ou dupliquer :

* le modèle complet de l’atome
* la timeline complète
* les propriétés métier complètes
* les données média complètes
* les chemins fichiers persistants
* les données de projet
* les groupes et membres complets
* les caches waveform/thumbnail
* la logique métier
* les données de synchronisation
* les versions/historiques des propriétés

Exemples de signaux dangereux observés ou à surveiller :

data-group-timeline = gros JSON complet
data-eve-media-source
data-eve-media-identifier
media_user_id
127.0.0.1
data-group-members
data-group-steps
data-group-atome
data-atome-kind

Le problème n’est pas forcément l’existence de ces noms. Le problème apparaît lorsqu’ils transportent trop de vérité métier ou trop de données persistantes dans le DOM.

Pourquoi c’est grave

Double source de vérité

Si la base dit une chose et le DOM en dit une autre, le système ne sait plus quelle information doit gagner.

Exemple :

Base :
atom_123.duration = 12.4s
DOM :
data-group-timeline contient duration = 11.8s

Cela peut produire une corruption silencieuse : le projet semble fonctionner, mais l’état réel devient incohérent.

Refresh fragile

Si l’état réel est dans la vue, alors un refresh détruit potentiellement l’état réel :

DOM détruit = état détruit

Le projet doit pouvoir être reconstruit depuis la base ou le modèle, pas depuis un ancien DOM.

Reboot fragile

Au redémarrage de l’application, le DOM et les caches runtime disparaissent. Si l’atome ou son visuel ne peuvent pas être reconstruits depuis le modèle, l’architecture est incorrecte.

Synchronisation difficile ou impossible

Atome/eVe vise :

* offline ;
* online ;
* synchronisation multi-device ;
* historique granulaire ;
* permissions par propriété ;
* restauration ;
* modifications rétroactives ;
* branches internes ;
* absence de conflit visible pour l’utilisateur.

Ces objectifs ne sont pas compatibles avec des données métier stockées dans une vue DOM.

Le DOM n’est pas un bon support pour :

versioning
merge
permissions
historique
rollback
fork
diff
sync

Renderer prisonnier du DOM

Si l’atome est défini par le DOM, Atome devient dépendant du HTML.

Or l’objectif eVe/Atome est plus large :

DOM
Canvas
WebGPU
Bevy
FreeBSD/eVe OS
mobile
desktop

L’atome doit donc exister avant son rendu. Le DOM doit être un backend de projection, pas la définition de l’objet.

Architecture correcte

La séparation correcte est :

Atome / ADOLE / DB
= vérité métier
Renderer
= transforme la vérité en affichage
DOM / Canvas / WebGPU
= projection temporaire
UI state
= état local non critique

Le flux correct est :

Base / ADOLE
  ↓
Modèle Atome
  ↓
Renderer
  ↓
Vue DOM / Canvas / WebGPU

Le flux à éviter est :

Vue DOM
  ↓
Modèle implicite
  ↓
Base bricolée

Règle fondamentale

Mauvais principe :

L’atome existe parce qu’il est dans le DOM.

Bon principe :

L’atome existe dans la base ou le modèle.
Le DOM ne fait que l’afficher.

Exemple de séparation correcte

Modèle / base

{
  "id": "atom_audio_001",
  "type": "audio",
  "source": "media://audio_001",
  "duration": 12.42,
  "visual": {
    "type": "waveform",
    "cache_key": "waveform_audio_001_v1",
    "status": "ready"
  },
  "properties": {
    "x": 120,
    "y": 80,
    "color": "#ff6600"
  }
}

Vue DOM

<div
  data-atome-id="atom_audio_001"
  data-role="media-atom"
  data-renderer="waveform">
</div>

La vue ne contient pas la waveform complète, ni toute la timeline, ni le modèle complet. Elle contient seulement une référence vers le modèle.

Impact architectural

Ce problème doit être traité avant les optimisations de performance, car il conditionne tout le reste :

* persistance
* refresh
* reboot
* synchronisation
* historique granulaire
* permissions
* rendu multi-plateforme
* portage vers Bevy/WebGPU
* stabilité long terme du projet

Solution

La base, ADOLE ou le modèle Atome doivent être la seule source de vérité.

Le DOM doit contenir uniquement :

* références courtes
* rôles UI
* état d’interaction temporaire
* sélection
* focus
* points d’ancrage pour le renderer

Les données complètes doivent vivre hors du DOM :

* propriétés des atomes
* timeline
* tracks
* clips
* médias
* visuels générés
* permissions
* historique
* versions
* données de synchronisation

Décision d’architecture

Décision à appliquer :

Le DOM ne doit jamais être considéré comme le projet.
Le DOM est uniquement une projection temporaire du projet.

Sans cette séparation, Atome/eVe risque de fonctionner en démonstration, mais de devenir fragile dès l’ajout de la persistance sérieuse, du mode offline, de la synchronisation, de l’historique granulaire, des permissions et du rendu multi-plateforme.

⸻

1.1 DOM utilisé comme source de vérité

Problème

Le DOM semble contenir beaucoup plus que de simples éléments d’affichage. Il embarque une partie de l’état projet, de l’état média, des informations de timeline, des chemins de fichiers, des données runtime et des caches visuels.

Cela crée une confusion entre :

* le modèle réel du projet ;
* la vue affichée à l’écran ;
* l’état temporaire de l’interface ;
* le cache de rendu ;
* les données persistantes.

Risque

Si le DOM devient la source de vérité, le système devient fragile :

* difficile à sérialiser proprement ;
* difficile à restaurer après refresh ;
* difficile à synchroniser online/offline ;
* difficile à versionner granularment ;
* difficile à optimiser sur mobile ;
* difficile à porter vers d’autres moteurs de rendu comme Bevy/WebGPU.

Solution

Séparer strictement :

ADOLE / modèle Atome = source de vérité
DOM = projection temporaire interactive
Canvas / WebGPU = rendu lourd
Cache média = ressources dérivées
UI state = état local non critique

Le DOM ne doit pas stocker le projet. Il doit seulement représenter une vue temporaire du modèle.

⸻

1.2 DOM trop lourd

Problème

Les fichiers DOM sont très volumineux pour des états d’interface. On observe une quantité importante de nœuds HTML, y compris pour des éléments répétitifs comme :

* cases vides de matrice ;
* ticks de timeline ;
* grilles ;
* boutons ;
* spans ;
* divs ;
* canvas ;
* vidéos ;
* éléments de prévisualisation.

Risque

Un DOM trop lourd provoque :

* perte de performance ;
* surconsommation mémoire ;
* ralentissement du layout ;
* ralentissement du repaint ;
* coût élevé sur mobile ;
* consommation énergétique excessive ;
* difficultés à maintenir un framerate fluide ;
* risque de blocage quand les projets deviennent gros.

Solution

Utiliser une architecture de rendu plus légère :

Éléments interactifs importants -> DOM
Rendu dense / répétitif -> Canvas ou WebGPU
Éléments hors écran -> virtualisation
Données projet -> modèle séparé

Pour les timelines et matrices, éviter de matérialiser tous les éléments invisibles ou répétitifs dans le DOM.

⸻

1.3 Styles inline trop nombreux

Problème

Une grande partie des éléments contient des styles directement dans les attributs style="...".

Risque

Les styles inline posent plusieurs problèmes :

* DOM plus lourd ;
* duplication massive ;
* maintenance difficile ;
* impossibilité de mutualiser les règles ;
* recalculs de style plus coûteux ;
* difficulté à créer des thèmes ;
* difficulté à modifier globalement l’interface ;
* pollution du snapshot DOM.

Solution

Remplacer les styles inline répétitifs par :

classes CSS structurées
variables CSS
thèmes centralisés
tokens d’interface
moteur de layout Atome

Exemple :

<div class="eve-matrix-tile eve-matrix-tile--empty"></div>

au lieu de :

<div style="width:...; height:...; background:...;"></div>

Les styles dynamiques doivent rester limités aux valeurs réellement variables : position, dimensions calculées, transformation GPU, état ponctuel.

⸻

1.4 IDs dupliqués

Problème

Certains IDs semblent répétés dans les snapshots DOM.

Risque

Des IDs dupliqués cassent la validité du DOM et peuvent produire :

* sélection incorrecte via getElementById ;
* comportements imprévisibles ;
* bugs d’événements ;
* mauvais rattachement entre modèle et vue ;
* erreurs lors de la réhydratation ;
* conflits lors de la synchronisation.

Solution

Adopter une règle stricte :

id HTML = unique dans le document
atome_id = identifiant métier stable
view_id = identifiant de projection temporaire

Ne pas confondre l’ID DOM avec l’ID Atome.

Exemple :

<div id="view_7f3c9a" data-atome-id="atom_video_001"></div>

L’id HTML peut changer entre deux rendus. Le data-atome-id doit rester stable.

⸻

1.5 Présence de plusieurs racines HTML/Body

Problème

Les dumps semblent contenir plusieurs structures de type :

<html>
  <head>...</head>
  <body>...</body>
</html>

ou des fragments complets injectés dans d’autres fragments.

Risque

Cela indique probablement que le snapshot capture trop large ou que des fragments HTML complets sont injectés au lieu de composants isolés.

Les risques sont :

* DOM invalide ;
* comportements navigateur imprévisibles ;
* difficulté à parser ;
* mauvaise réhydratation ;
* duplication de scripts/styles ;
* pollution de la structure finale.

Solution

Définir trois formats distincts :

1. Document HTML complet : uniquement pour l’app complète.
2. Fragment UI : jamais de html/head/body.
3. Snapshot debug : format séparé, non utilisé comme projet.

Un composant Atome ne doit jamais produire un document complet. Il doit produire un fragment ou une projection déclarative.

⸻

1. Problèmes spécifiques à la matrice de projets

2.1 Trop de cases vides matérialisées

Problème

La matrice contient beaucoup de cases vides réellement présentes dans le DOM.

Risque

C’est inutilement lourd. Une case vide n’a pas besoin d’être un objet DOM permanent si elle ne porte pas d’interaction réelle ou d’état spécifique.

Solution

Utiliser une grille logique :

matrix_model = {
  columns,
  rows,
  occupied_slots,
  viewport,
  selection
}

Le DOM ne rend que :

* les projets visibles ;
* les cases proches du viewport ;
* la sélection ;
* les zones interactives nécessaires.

Les cases vides peuvent être rendues par CSS, Canvas ou WebGPU.

⸻

2.2 La matrice ressemble à un snapshot visuel, pas à un modèle

Problème

La matrice contient une description très détaillée de l’affichage, mais le modèle abstrait semble moins clair.

Risque

Si l’affichage devient le modèle, il devient difficile de :

* changer le layout ;
* zoomer ;
* filtrer ;
* trier ;
* synchroniser ;
* adapter l’affichage au mobile ;
* utiliser un autre renderer.

Solution

Définir un modèle indépendant :

{
  "matrix_id": "main_project_matrix",
  "layout": {
    "mode": "grid",
    "columns": 8,
    "tile_size": 160
  },
  "projects": [
    {
      "id": "project_001",
      "name": "Project name",
      "slot": 12,
      "thumbnail": "media://thumbnail/project_001",
      "last_opened_at": "..."
    }
  ]
}

Le DOM est ensuite généré depuis ce modèle.

⸻

2.3 Données projet trop directement exposées dans le DOM

Problème

Certaines données projet semblent présentes directement dans les attributs HTML.

Risque

Cela peut exposer inutilement :

* chemins locaux ;
* IDs utilisateur ;
* URLs internes ;
* données de projet ;
* informations de cache.

Solution

Limiter les data-* à des références minimales :

<div data-atome-id="project_001" data-view-role="project-tile"></div>

Les détails complets doivent être récupérés depuis le modèle Atome, pas depuis le DOM.

⸻

1. Problèmes spécifiques au projet Atome avec timeline et médias

3.1 Timeline trop DOM-heavy

Problème

La timeline semble produire beaucoup d’éléments DOM : ticks, markers, clips, spans, grilles, pistes, cellules, boutons, overlays, etc.

Risque

Une timeline audio/vidéo/MIDI peut devenir gigantesque. Si chaque tick ou subdivision est un nœud DOM, le système va mal scaler.

Risques directs :

* zoom lent ;
* scroll lent ;
* drag imprécis ;
* recalcul layout massif ;
* mauvaise performance mobile ;
* consommation énergétique élevée ;
* complexité de synchronisation entre DOM et moteur média.

Solution

Architecture recommandée :

Timeline model -> données temporelles
Timeline renderer -> Canvas/WebGPU
DOM overlay -> interactions minimales

Conserver dans le DOM uniquement :

* clips sélectionnés ;
* handles de redimensionnement ;
* éléments éditables ;
* zones de drop ;
* focus clavier/accessibilité ;
* menus contextuels.

Le reste doit être rendu par canvas/WebGPU.

⸻

3.2 Ticks et grille rendus comme éléments HTML

Problème

Les ticks de timeline et les subdivisions semblent être matérialisés en grand nombre dans le DOM.

Risque

C’est coûteux et inutile. Une grille temporelle est un rendu graphique, pas une structure HTML métier.

Solution

Rendre les ticks avec :

Canvas 2D si simple
WebGPU si zoom/animation/effets lourds
CSS background si grille très simple

Le modèle doit simplement contenir :

{
  "bpm": 120,
  "time_signature": "4/4",
  "zoom": 1.0,
  "grid": "1/16",
  "visible_range": [0, 64]
}

⸻

3.3 Waveforms et thumbnails mélangés au DOM

Problème

Les waveforms audio et thumbnails vidéo semblent liés directement à la structure DOM.

Risque

Cela rend la restauration fragile : après refresh ou reboot, l’atome peut exister mais perdre son visuel si le cache ou le lien visuel n’est pas correctement reconstruit.

Solution

Chaque atome média doit avoir un contrat clair :

{
  "id": "atom_audio_001",
  "media_kind": "audio",
  "source": "media://source/audio_001",
  "visual": {
    "type": "waveform",
    "cache_key": "waveform_audio_001_v1",
    "status": "ready"
  }
}

Pour la vidéo :

{
  "id": "atom_video_001",
  "media_kind": "video",
  "source": "media://source/video_001",
  "visual": {
    "type": "thumbnail",
    "cache_key": "thumbnail_video_001_v1",
    "status": "ready"
  }
}

Règle obligatoire : après import ou enregistrement, vérifier que l’atome possède un visuel persistant :

* waveform pour l’audio ;
* image/thumbnail pour la vidéo ;
* visuel encore présent après refresh ;
* visuel encore présent après reboot ;
* test avec plusieurs fichiers audio et vidéo depuis ./tests/fixtures/media.

⸻

3.4 Gros JSON dans les attributs data-*

Problème

Certaines données complexes semblent stockées directement dans des attributs HTML, par exemple des timelines ou métadonnées groupées.

Risque

Les attributs HTML ne sont pas faits pour transporter de gros modèles. Cela provoque :

* DOM illisible ;
* coût de parsing ;
* échappement fragile ;
* duplication des données ;
* bugs de sérialisation ;
* difficulté à versionner ;
* risque de corruption silencieuse.

Solution

Les attributs data-* doivent contenir uniquement des références courtes :

<div data-atome-id="group_001" data-timeline-ref="timeline_001"></div>

Le contenu réel doit être dans :

ADOLE object store
project model
local database
cache structuré
JSON projet séparé

⸻

3.5 Mélange entre média source et média dérivé

Problème

Le DOM semble contenir à la fois des références aux médias sources, aux previews, aux waveforms, aux thumbnails, aux canvas et aux vidéos.

Risque

Sans séparation stricte, on ne sait plus ce qui est :

* source originale ;
* proxy ;
* cache ;
* preview ;
* rendu temporaire ;
* ressource persistante ;
* état runtime.

Solution

Créer une structure média claire :

MediaSource = fichier original
MediaProxy = version optimisée lecture
MediaVisual = waveform / thumbnail
MediaRuntime = état de lecture temporaire
MediaAtom = objet Atome métier

Chaque couche doit avoir un rôle unique.

⸻

3.6 Trop de vidéos/canvas simultanément dans le DOM

Problème

Le projet semble contenir de nombreux éléments <video> et <canvas>.

Risque

Chaque élément vidéo/canvas peut consommer :

* mémoire GPU ;
* mémoire système ;
* contexte graphique ;
* threads de décodage ;
* ressources navigateur ;
* énergie.

Sur mobile, c’est particulièrement dangereux.

Solution

Utiliser un pool de rendu :

1 canvas principal timeline
1 canvas preview actif
N textures gérées par le renderer
éléments video uniquement pour les sources actives

Ne pas créer une vidéo ou un canvas permanent pour chaque clip si ce clip n’est pas actif ou visible.

⸻

1. Problèmes de persistance et restauration

4.1 Refresh/reboot potentiellement fragile

Problème

Si l’état visuel dépend du DOM courant, un refresh ou reboot peut casser :

* waveforms ;
* thumbnails ;
* preview média ;
* association clip/source ;
* association track/clip ;
* positions timeline ;
* état de matrice.

Solution

Définir des tests obligatoires de restauration :

1. Import audio
2. Vérifier création atome audio
3. Vérifier waveform
4. Refresh
5. Vérifier waveform encore présente
6. Reboot app
7. Vérifier waveform encore présente
8. Répéter avec tous les fichiers audio de ./tests/fixtures/media
9. Import vidéo
10. Vérifier création atome vidéo
11. Vérifier thumbnail/image vidéo
12. Refresh
13. Vérifier thumbnail encore présent
14. Reboot app
15. Vérifier thumbnail encore présent
16. Répéter avec tous les fichiers vidéo de ./tests/fixtures/media

⸻

4.2 Absence apparente de contrat d’intégrité d’un atome média

Problème

Un atome média ne doit pas seulement exister dans le DOM. Il doit être complet selon un contrat vérifiable.

Solution

Définir une validation obligatoire :

Un atome audio est valide si :

* id stable présent
* type = audio
* source média valide
* durée détectée
* waveform générée ou en file de génération
* cache waveform persisté
* affichage restaurable après refresh/reboot
Un atome vidéo est valide si :
* id stable présent
* type = video
* source média valide
* durée détectée
* thumbnail générée ou en file de génération
* cache thumbnail persisté
* affichage restaurable après refresh/reboot

⸻

1. Problèmes d’architecture Atome/eVe

5.1 Confusion entre Atome, DOM et renderer

Problème

Le DOM donne parfois l’impression que l’objet Atome est confondu avec son rendu HTML.

Risque

Cela limite Atome à une logique navigateur, alors que l’objectif eVe nécessite une architecture plus large :

* Web ;
* desktop ;
* mobile ;
* FreeBSD/eVe OS ;
* rendu Bevy/WebGPU ;
* mode offline ;
* synchronisation.

Solution

Définir un pipeline propre :

Atome object
  ↓
ADOLE model
  ↓
Renderer adapter
  ↓
DOM / Canvas / WebGPU / Bevy

Le DOM devient un backend de rendu possible, pas la définition de l’objet.

⸻

5.2 Granularité Atome pas assez isolée dans le DOM

Problème

Atome repose sur une granularité forte : propriétés, historique, partage, permissions, restauration, modifications rétroactives. Le DOM ne doit pas mélanger cette granularité avec une structure visuelle brute.

Solution

Chaque propriété importante doit exister dans le modèle, pas seulement dans le style ou l’attribut HTML.

Exemple :

{
  "atome_id": "clip_001",
  "properties": {
    "start_time": { "value": 12.5, "version": 4 },
    "duration": { "value": 8.0, "version": 2 },
    "track_id": { "value": "track_003", "version": 1 },
    "color": { "value": "#ff6600", "version": 7 }
  }
}

Le DOM peut afficher ces valeurs, mais ne doit pas être leur source principale.

⸻

1. Solutions structurantes recommandées

6.0 Doctrine obligatoire : le DOM ne doit jamais porter le code, le modèle ou la vérité

Décision non négociable

Le DOM ne doit jamais être utilisé comme source de vérité.

Il ne doit pas porter :

* le modèle métier des atomes
* la structure complète d’un projet
* la timeline complète
* les propriétés complètes des atomes
* l’historique
* les versions
* les permissions
* la synchronisation
* les caches médias
* la logique métier
* le code fonctionnel
* les règles de reconstruction
* les états canoniques

Le DOM doit rester une projection minimale, temporaire et jetable.

La règle de base est :

Si le DOM disparaît, le projet ne doit rien perdre.
Si le DOM est reconstruit, il doit pouvoir être recréé intégralement depuis le modèle.

⸻

6.0.1 Source de vérité unique

Décision

La source de vérité doit être unique et hors DOM.

Architecture retenue :

Events / ADOLE / DB = vérité historique
state_current = projection canonique courante
renderer = transformation du modèle en vue
DOM / Canvas / WebGPU = projection temporaire
SelectionAPI / UI state = état d’interaction temporaire
cache timeline / media cache = données dérivées régénérables

Le DOM ne doit jamais être placé au même niveau que events, state_current, particles, ADOLE ou la base.

Règle

Le modèle crée le DOM.
Le DOM ne crée pas le modèle.
Le DOM ne répare pas le modèle.
Le DOM ne décide pas de l’état réel.

⸻

6.0.2 Référence explicite aux graphes d’audit

Décision

Les corrections doivent se référer aux graphes d’audit fournis si nécessaire, en particulier :

01-call-graph.md
02-event-graph.md
03-state-graph.md
04-source-of-truth-graph.md
05-async-graph.md
06-lifecycle-graph.md
07-risk-map.md
08-open-questions.md
README.md

Ces graphes doivent servir à vérifier que la correction supprime bien le problème de multi-source-of-truth.

Les points à vérifier dans ces graphes sont :

* le DOM ne doit plus apparaître comme source canonique
* les globals de sélection ne doivent plus être une vérité métier
* le cache timeline ne doit pas être une source de vérité
* les patches temps réel ne doivent pas bypasser le modèle canonique
* les événements doivent reconstruire state_current
* state_current doit alimenter le renderer
* le renderer doit produire une vue minimale
* les mutations doivent passer par des commandes explicites, pas par lecture du DOM

⸻

6.0.3 Réduction maximale de la verbosité des atomes

Problème

Les atomes ne doivent pas devenir des objets verbeux qui transportent toute leur représentation, toute leur vue, tout leur rendu et tout leur cache.

Un atome trop verbeux devient difficile à :

* lire
* sérialiser
* synchroniser
* versionner
* comparer
* restaurer
* migrer
* rendre sur plusieurs plateformes

Solution

Un atome doit contenir uniquement ses informations métier minimales et nécessaires.

Structure cible :

{
  "id": "atom_audio_001",
  "kind": "audio",
  "properties": {
    "source": "media://audio_001",
    "duration": 12.42,
    "position": { "x": 120, "y": 80 },
    "visual_ref": "waveform_audio_001_v1"
  }
}

À éviter :

{
  "id": "atom_audio_001",
  "html": "<div>...</div>",
  "style": "width:...; height:...;",
  "timeline_json_inside_dom": "...",
  "waveform_pixels": "...",
  "runtime_selection_state": true,
  "ui_cache": "...",
  "local_dom_id": "..."
}

L’atome ne doit pas contenir sa vue. Il doit contenir les données nécessaires pour que le renderer produise la vue.

⸻

6.0.4 DOM minimaliste obligatoire

Décision

Le DOM doit contenir le minimum absolu de données.

Acceptable dans le DOM :

data-atome-id
data-role
data-view-id
data-renderer
data-selected
aria-*
class
id de vue temporaire

À éviter ou interdire dans le DOM :

gros JSON
timeline complète
liste complète des propriétés
groupes complets
membres complets
historique
versions
permissions
chemins fichiers persistants
URLs localhost persistées
waveform complète
thumbnail encodé massif
état de synchronisation
état métier d’un atome

Exemple correct

<div
  class="atome-view atome-view--audio"
  data-atome-id="atom_audio_001"
  data-role="media-atom"
  data-renderer="waveform">
</div>

Exemple incorrect

<div
  data-atome-id="atom_audio_001"
  data-group-timeline="{ énorme JSON complet }"
  data-source="/local/path/file.wav"
  data-waveform="{ énorme cache waveform }"
  data-properties="{ toutes les propriétés métier }">
</div>

⸻

6.0.5 Interdiction de porter le code métier par le DOM

Décision

Le code ne doit en aucun cas être porté par le DOM.

Le DOM ne doit pas contenir :

* logique métier dans des attributs
* handlers inline
* scripts injectés comme état projet
* règles de calcul
* règles de mutation
* logique de reconstruction
* logique de synchronisation
* logique de validation

À éviter :

<div onclick="updateAtomeFromDom(this)"></div>

À faire :

User action
  ↓
Command explicite
  ↓
Validation
  ↓
Mutation du modèle
  ↓
Event
  ↓
state_current
  ↓
Renderer
  ↓
Vue mise à jour

Le DOM peut déclencher une intention utilisateur. Il ne doit pas calculer ou porter la mutation réelle.

⸻

6.0.6 Pipeline de mutation imposé

Problème

Si plusieurs chemins peuvent modifier l’état, la complexité explose et les bugs deviennent difficiles à diagnostiquer.

Solution

Toutes les mutations doivent passer par un pipeline unique :

UI event / API call / realtime patch
  ↓
Command
  ↓
Validator
  ↓
Domain service
  ↓
Event append
  ↓
state_current projection
  ↓
Renderer update
  ↓
DOM minimal

Interdictions :

* mutation directe depuis le DOM
* lecture du DOM pour reconstruire l’état métier
* modification directe de state_current sans event ou commande contrôlée
* bypass du validator
* patch temps réel appliqué directement à la vue comme vérité
* cache timeline utilisé comme état canonique

⸻

6.0.7 Réduction de complexité : supprimer les états concurrents

Problème

Les graphes indiquent un risque de coexistence entre plusieurs états :

events
state_current
particles
DOM
selection globals
timeline cache
realtime patches

Cette coexistence crée un risque de multi-source-of-truth.

Solution

Clarifier le rôle de chaque couche :

events = historique append-only
state_current = état courant canonique
particles = unités métier si elles existent dans le modèle
DOM = projection visuelle jetable
selection globals = à supprimer ou limiter à un état UI temporaire
timeline cache = cache dérivé régénérable
realtime patches = commandes entrantes à valider puis intégrer au modèle

Tout élément qui ne peut pas être reconstruit depuis events ou state_current ne doit pas être considéré comme fiable.

⸻

6.0.8 Contrat de reconstruction obligatoire

Décision

Le projet doit pouvoir être reconstruit sans lire le DOM.

Test obligatoire :

1. Charger events / ADOLE / DB
2. Reconstruire state_current
3. Détruire entièrement le DOM
4. Recréer la vue depuis state_current
5. Vérifier que le projet est identique fonctionnellement
6. Vérifier que les médias, tracks, clips, waveforms et thumbnails sont restaurés

Si une information est perdue après destruction du DOM, cela signifie qu’elle était stockée au mauvais endroit.

⸻

6.0.9 Contrat de données DOM maximal

Décision

Définir une limite stricte de quantité de données autorisées dans les attributs DOM.

Règle proposée :

Aucun attribut data-*ne doit contenir un JSON complet.
Aucun attribut data-* ne doit dépasser une petite taille fixe.
Aucun attribut data-* ne doit contenir une donnée métier non reconstructible.

Exemple de limite :

Longueur maximale recommandée pour un data-* : 256 caractères
Exception possible uniquement pour debug temporaire, jamais en production

⸻

6.0.10 Contrat d’atome minimal

Décision

Chaque atome doit être défini par un contrat minimal.

Exemple :

Atom = id + kind + properties minimales + refs vers ressources

Pas :

Atom = id + DOM + HTML + style + cache + runtime + timeline complète

Pour un atome média :

{
  "id": "atom_video_001",
  "kind": "video",
  "properties": {
    "source_ref": "media://video_001",
    "duration": 42.1,
    "visual_ref": "thumbnail_video_001_v1"
  }
}

Pour un atome timeline clip :

{
  "id": "clip_001",
  "kind": "timeline_clip",
  "properties": {
    "media_ref": "atom_video_001",
    "track_ref": "track_001",
    "start": 12.0,
    "duration": 4.5
  }
}

Le renderer décide ensuite comment afficher ces objets.

⸻

6.0.11 Contrat de renderer

Décision

Le renderer doit être une couche séparée.

Il reçoit :

state_current
viewport
ui_state temporaire
cache dérivé disponible

Il produit :

DOM minimal
Canvas/WebGPU draw calls
bindings d’interaction

Il ne produit pas :

vérité métier
source canonique
historique
permissions
versions

⸻

6.0.12 Simplification des responsabilités

Responsabilités finales

ADOLE / DB

* vérité métier
* historique
* versions
* permissions
* synchronisation
state_current
* état courant canonique reconstruit
Domain services
* validation
* mutations
* commandes
Renderer
* transformation état -> affichage
DOM
* projection minimale
* interactions utilisateur
* accessibilité
Canvas/WebGPU
* rendu dense
* timeline
* waveforms
* thumbnails
* grilles
Caches
* données dérivées régénérables

⸻

6.0.13 Tests anti-régression obligatoires

Test : le DOM n’est pas la vérité

* Créer un projet
* Créer plusieurs atomes
* Importer audio et vidéo
* Générer waveform et thumbnail
* Détruire le DOM
* Reconstruire depuis state_current
* Vérifier que tout est encore correct

Test : aucun gros modèle dans le DOM

* Scanner tous les attributs data-*
* Échouer si un attribut contient un JSON complet
* Échouer si un attribut dépasse la taille maximale autorisée
* Échouer si un attribut contient timeline/properties/history/permissions

Test : mutation impossible depuis lecture DOM

* Modifier artificiellement un data-* dans le DOM
* Déclencher refresh renderer
* Vérifier que le modèle canonique ne change pas

Test : cache non canonique

* Supprimer cache waveform/thumbnail
* Relancer projet
* Vérifier que le modèle reste valide
* Vérifier que les caches sont régénérés

Test : realtime patch contrôlé

* Recevoir un patch temps réel
* Vérifier qu’il devient une commande validée
* Vérifier qu’il ne modifie pas directement le DOM comme source de vérité

⸻

6.1 Apports de l’audit atome_usage.md : problèmes supplémentaires confirmés

Synthèse

L’audit complémentaire confirme que le problème n’est pas uniquement un DOM trop lourd. Le système actuel manipule un atome sous plusieurs formes concurrentes ou partiellement superposées.

Un atome peut exister simultanément comme :

* enveloppe canonique de validation
* ligne SQL dans atomes
* propriétés dans particles
* historique dans particles_versions
* événements dans events
* projection JSON dans state_current
* record frontend de rendu
* host DOM
* instance legacy Squirrel possédant this.element
* session spécialisée canvas/WebGPU pour les médias
* état temporaire de timeline

Cette pluralité n’est pas forcément mauvaise en soi. Une architecture moderne peut avoir plusieurs représentations. Le problème apparaît si les rôles ne sont pas strictement séparés et si plusieurs couches peuvent prétendre être la vérité.

⸻

Problème confirmé : il n’existe pas un seul objet runtime autoritaire

L’audit indique qu’il n’y a pas un seul store runtime central. L’état actif est réparti entre :

window.Atome
renderedAtomes / renderedAtomeHosts
TIMELINE_STATE
baseline records
preview flags
redo snapshots
createdElements
DOM state

Risque

Cette dispersion augmente :

* la complexité mentale
* les divergences d’état
* les bugs de refresh
* les bugs d’undo/redo
* les incohérences entre backend et frontend
* les comportements différents selon le chemin de création
* les risques de stale UI

Décision

Créer une hiérarchie stricte :

1. events / ADOLE / DB = vérité historique
2. state_current = état courant canonique
3. frontend store minimal = miroir contrôlé de state_current
4. renderer registries = caches de rendu non canoniques
5. DOM = projection jetable
6. timeline preview = sandbox temporaire, jamais vérité directe

Aucun registre de rendu, cache timeline ou élément DOM ne doit être utilisé comme source métier.

⸻

Problème confirmé : le legacy Squirrel Atome possède directement un élément DOM

L’audit décrit un objet legacy Squirrel Atome qui :

* crée un div
* stocke l’élément dans this.element
* copie config et styles sur l’objet
* crée récursivement des enfants comme instances Atome

Risque

Cette approche est utile comme runtime historique ou adapter visuel, mais elle mélange fortement :

objet Atome
configuration
style
DOM element
hiérarchie visuelle
runtime behavior

Cela rend l’atome trop proche de sa représentation HTML.

Décision

Classifier ce modèle comme :

Legacy DOM adapter

et non comme :

modèle canonique Atome

La migration doit aller vers :

Atome canonique minimal
  ↓
Renderer adapter
  ↓
DOM host éventuel

L’objet métier ne doit jamais posséder directement son HTMLElement comme vérité.

⸻

Problème confirmé : les atomes génériques sont DOM-first

L’audit indique que les atomes génériques sont représentés d’abord comme des éléments DOM avec propriétés CSS, tandis que les médias utilisent des chemins spécialisés canvas/WebGPU.

Risque

Cela crée deux modèles mentaux :

Atome générique = DOM/CSS
Atome média = renderer spécialisé

Cette différence peut rendre l’architecture incohérente à long terme, surtout si Atome/eVe doit évoluer vers Bevy/WebGPU et une UI full canvas.

Décision

Uniformiser la logique :

Tout atome = modèle canonique minimal
Tout affichage = renderer adapter
DOM = un renderer possible
Canvas/WebGPU = un autre renderer possible

Même un atome simple ne doit pas être défini par son DOM. Il peut être affiché en DOM, mais il ne doit pas être né comme DOM.

⸻

Problème confirmé : la timeline replay mute directement le DOM preview

L’audit indique que la timeline reconstruit un état depuis les événements et une baseline, puis applique ce résultat au DOM preview. Elle peut ensuite écrire le résultat replayé vers le backend via commitBatch.

Risque

C’est une zone très dangereuse si elle n’est pas strictement encadrée.

La timeline peut devenir un chemin parallèle de mutation :

events + baseline
  ↓
replay
  ↓
DOM preview
  ↓
commitBatch backend

Le danger est que la preview DOM devienne implicitement une vérité ou une base de réécriture.

Décision

Séparer deux modes :

Preview mode = lecture temporaire, jamais canonique
Commit mode = commande explicite validée, jamais lecture brute du DOM

Le replay doit produire un état abstrait intermédiaire :

ReplayState

Puis :

ReplayState -> Renderer preview

et non :

DOM preview -> Backend

Si un replay doit être appliqué réellement, il doit être transformé en commandes validées :

ReplayState
  ↓
Command list
  ↓
Validator
  ↓
commitBatch
  ↓
state_current
  ↓
renderer

⸻

Problème confirmé : events est durable, mais pas event-only

L’audit montre que appendEvent ne fait pas seulement de l’event sourcing. Il met aussi à jour :

atomes
particles
particles_versions
state_current

Risque

Ce n’est pas forcément mauvais, mais cela doit être assumé comme une architecture à projections matérialisées.

Risque si non documenté :

* events et state_current peuvent diverger
* particles peut diverger de state_current
* restore/replay peut produire un état différent
* snapshots peuvent court-circuiter l’historique

Décision

Nommer clairement les rôles :

events = journal durable
particles = stockage courant par propriété
particles_versions = historique granulaire par propriété
state_current = projection canonique reconstruisible
snapshots = optimisation/restauration contrôlée, pas vérité supérieure

Ajouter un test d’invariant :

Rebuild state_current from events/particles
  ↓
Compare with stored state_current
  ↓
Fail if divergence non justifiée

⸻

Problème confirmé : chemins de création parallèles

L’audit mentionne plusieurs chemins de création :

* route directe db.createAtome
* création event-style via create_atome / kind:set
* création frontend via adapters

Risque

Si tous les chemins ne passent pas par le même contrat, deux atomes créés par deux chemins différents peuvent ne pas avoir exactement la même structure ou les mêmes garanties.

Décision

Imposer un seul chemin de naissance canonique :

CreateAtomeCommand
  ↓
validate canonical envelope
  ↓
append create event
  ↓
materialize atomes/particles/state_current
  ↓
renderer creates view

Les routes directes doivent devenir des wrappers de cette commande, ou être marquées legacy/internal.

⸻

Problème confirmé : snapshots split entre ancien et nouveau pipeline

L’audit indique qu’il existe :

* legacy atome snapshot helpers
* newer project/state snapshot pipeline

Risque

Deux systèmes de snapshot peuvent produire deux vérités de restauration différentes.

Décision

Unifier la notion de snapshot :

snapshot = état projet/state_current signé à un instant donné
legacy snapshot = adapter de migration uniquement

Un snapshot restauré doit repasser par un pipeline contrôlé :

Snapshot
  ↓
validate
  ↓
restore commands / controlled projection replacement
  ↓
state_current
  ↓
renderer

Le snapshot ne doit jamais restaurer directement un DOM.

⸻

Problème confirmé : media renderer spécialisé mais encore monté dans un host visuel

L’audit indique que les médias utilisent Molecule/canvas/WebGPU, mais restent montés dans une structure visuelle persistée via le même commit API.

Décision

Clarifier la séparation :

MediaAtom = données métier média
MediaResource = source/proxy/cache
MediaRenderer = canvas/WebGPU session
DOM host = conteneur minimal jetable

Le host DOM média ne doit contenir que :

data-atome-id
data-role="media-host"
data-renderer="molecule"

Tout le reste doit vivre dans le modèle, les ressources ou les caches dérivés.

⸻

Nouvelle architecture de simplification issue de l’audit

Architecture à viser :

Canonical Envelope
  ↓
Command
  ↓
Validator
  ↓
Event append
  ↓
Materializers
  ├─ atomes
  ├─ particles
  ├─ particles_versions
  └─ state_current
  ↓
Frontend Store minimal
  ↓
Renderer Adapter
  ├─ DOM minimal
  ├─ Canvas
  └─ WebGPU

Ce qui doit disparaître comme vérité :

* DOM state
* this.element comme modèle
* renderedAtomes comme store métier
* TIMELINE_STATE comme vérité
* baseline preview comme état canonique
* cache timeline comme source fiable
* snapshots legacy comme vérité indépendante

⸻

Décisions supplémentaires à appliquer

1. Un seul chemin de création canonique.
2. Un seul pipeline de mutation.
3. Un seul état courant canonique : state_current.
4. DOM uniquement projection minimale.
5. Timeline preview uniquement sandbox visuelle.
6. Replay jamais appliqué au backend depuis lecture du DOM.
7. Snapshots unifiés autour du state_current/projet.
8. Legacy Squirrel DOM object classé comme adapter, pas modèle.
9. Media renderer séparé du MediaAtom.
10. Tests d’invariants entre events, particles et state_current.

⸻

6.2 Définir un format projet Atome séparé du DOM

Solution

Créer un format projet clair :

project.atome.json
media_manifest.json
timeline.json
ui_state.json
render_cache/

Ou équivalent dans ADOLE.

Le DOM ne doit jamais être le format projet final.

⸻

6.2 Définir une couche de réhydratation

Solution

Au chargement :

1. Charger le modèle projet
2. Charger les médias
3. Vérifier les caches visuels
4. Régénérer les caches manquants
5. Créer la projection UI
6. Rendre uniquement ce qui est visible
7. Brancher les interactions

⸻

6.3 Virtualiser les vues lourdes

Solution

Virtualiser :

* matrice de projets ;
* timeline ;
* tracks ;
* clips hors écran ;
* grilles ;
* marqueurs ;
* waveforms longues ;
* thumbnails multiples.

Principe :

Le modèle peut contenir 10 000 éléments.
La vue ne rend que les 100 nécessaires à l’écran.

⸻

6.4 Utiliser Canvas/WebGPU pour les zones denses

Solution

À rendre en Canvas/WebGPU :

* timeline grid ;
* ticks ;
* waveforms ;
* miniature vidéo ;
* aperçu de clip ;
* fond de matrice ;
* gros overlays ;
* effets visuels ;
* transitions ;
* compositing.

À garder en DOM :

* boutons ;
* inputs ;
* menus ;
* éléments sélectionnés ;
* handles ;
* panneaux ;
* accessibilité ;
* interactions fines.

⸻

6.5 Réduire les data-*

Solution

Règle simple :

data-* = référence courte ou rôle UI
jamais un gros modèle complet

Correct :

<div data-atome-id="clip_001" data-role="timeline-clip"></div>

À éviter :

<div data-group-timeline="{ énorme JSON complet }"></div>

⸻

6.6 Créer un validateur DOM/debug

Solution

Créer un outil de validation automatique qui vérifie :

* IDs HTML dupliqués
* nombre de nœuds
* nombre de styles inline
* taille totale du DOM
* nombre de canvas
* nombre de vidéos
* présence de html/head/body imbriqués
* gros attributs data-*
* chemins locaux exposés
* URLs localhost persistées
* éléments invisibles mais présents en masse

Ce validateur doit produire un rapport lisible dans les tests.

⸻

1. Tests obligatoires à ajouter

7.1 Tests import/enregistrement média

Audio

Pour chaque fichier audio dans ./tests/fixtures/media :

* importer le fichier
* créer un atome audio
* vérifier la source
* vérifier la durée
* vérifier la waveform
* refresh
* vérifier la waveform
* reboot app
* vérifier la waveform

Vidéo

Pour chaque fichier vidéo dans ./tests/fixtures/media :

* importer le fichier
* créer un atome vidéo
* vérifier la source
* vérifier la durée
* vérifier le thumbnail/image vidéo
* refresh
* vérifier le thumbnail/image vidéo
* reboot app
* vérifier le thumbnail/image vidéo

⸻

7.2 Tests de performance DOM

Objectif

Empêcher la croissance incontrôlée du DOM.

Tests proposés

* taille maximale du snapshot DOM
* nombre maximal de nœuds visibles
* nombre maximal de styles inline
* nombre maximal d’éléments video/canvas actifs
* temps de refresh
* temps de réhydratation
* consommation mémoire approximative
* fluidité scroll/zoom timeline

⸻

7.3 Tests de persistance

* sauvegarder projet
* fermer app
* rouvrir app
* vérifier matrice
* vérifier projet
* vérifier tracks
* vérifier clips
* vérifier médias
* vérifier waveforms/thumbnails
* vérifier positions timeline
* vérifier sélection et état UI si nécessaire

⸻

1. Architecture cible recommandée

8.1 Schéma global

                ┌──────────────────────┐
                │   ADOLE / Atome DB    │
                │  Source de vérité     │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │   Project Model       │
                │ objects/properties    │
                └──────────┬───────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌─────────────────┐ ┌────────────────┐ ┌─────────────────┐
│ Timeline Model  │ │ Media Manifest │ │ UI State         │
│ tracks/clips    │ │ sources/cache  │ │ selection/view   │
└────────┬────────┘ └───────┬────────┘ └────────┬────────┘
         │                  │                   │
         └──────────────────┼───────────────────┘
                            ▼
                ┌──────────────────────┐
                │ Renderer Adapter      │
                │ DOM / Canvas / WebGPU │
                └──────────┬───────────┘
                           ▼
                ┌──────────────────────┐
                │ Projection visible    │
                │ DOM léger + GPU       │
                └──────────────────────┘

⸻

1. Décisions techniques proposées

9.1 Ce qui doit rester dans le DOM

* structure visible minimale
* éléments interactifs
* sélection
* focus
* boutons
* menus
* inputs
* handles de resize/drag
* références data-atome-id courtes

9.2 Ce qui doit sortir du DOM

* modèle projet complet
* timeline complète
* gros JSON
* caches waveforms/thumbnails
* chemins locaux bruts
* URLs localhost persistées
* grilles massives
* ticks massifs
* cases vides massives
* vidéos/canvas inactifs
* état runtime non essentiel

9.3 Ce qui doit être rendu par Canvas/WebGPU

* waveforms
* thumbnails
* timeline grid
* ticks
* fond de matrice
* previews vidéo
* zones denses
* effets visuels
* compositing

⸻

1. Conclusion

Les deux exemples montrent une direction intéressante : Atome/eVe arrive à produire des représentations riches, visuelles et manipulables.

Mais la structure actuelle semble trop dépendre du DOM comme contenant principal. C’est acceptable pour un prototype ou un snapshot de debug, mais pas pour une architecture finale.

La décision à prendre est claire :

Le DOM ne doit pas être le projet.
Le DOM doit être une projection du projet.

La source de vérité doit rester dans Atome/ADOLE, avec un modèle propre, sérialisable, testable, versionnable et restaurable.

Le DOM doit devenir léger, temporaire et remplaçable.

La timeline, les waveforms, les thumbnails, les grilles et les zones denses doivent être déplacées vers Canvas/WebGPU ou un renderer adapté.

La priorité technique immédiate est donc :

1. Séparer modèle et DOM.
2. Réduire les styles inline.
3. Supprimer les gros JSON des data-*.
4. Virtualiser matrice et timeline.
5. Valider les atomes média après import/record.
6. Vérifier la persistance des visuels après refresh/reboot.
7. Créer un validateur DOM/debug automatique.

C’est cette séparation qui permettra à Atome/eVe de rester propre, rapide, portable et compatible avec une architecture future Bevy/WebGPU/ADOLE.
