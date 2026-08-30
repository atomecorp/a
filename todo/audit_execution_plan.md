# Atome/eVe total audit — canonical execution plan

Created: 2026-08-12  
Status: **Phase 1 consolidated; Gate G1 pending explicit user approval; separately authorized Granularity remediation blocked at cross-runtime gate 12 on 2026-08-14**
Canonical owner: this file. It contains the method, evidence snapshot, execution order, gates, finding schema, and completion locks.  
The superseded Phase 1 draft was absorbed into this plan and removed after parity validation.

Source provenance:

- PROMPT_ATOME_EVE_AUDIT_TOTAL_UI_UX.md and audit_atome.md are byte-for-byte identical.
- Canonical source digest: SHA-256 91556fb55e647976c6bfa7ec53fc4cfb940180073986295ad1e17b8462837e27.
- The actual repository rules in .codex/AGENTS.md v3.1 and modules 01–07 override the older v3.0 copy supplied with the request.
- This plan is in English because .codex/modules/02-coding-standards-and-prohibitions.md requires repository documentation and developer-facing text to be English.

## Authority, gates, and allowed writes

Apply the following authority order on every audit run and implementation lot:

1. .codex/AGENTS.md and all mandatory modules 01–07.
2. Any applicable nested AGENTS.md discovered in the touched scope.
3. .codex/visual-test-protocol.md for Web, Tauri, and physical-iOS visual acceptance.
4. atome/documentations/how_debug_UI.md for eVe UI readiness, canvas interaction, hit testing, and import validation.
5. known-bug-solutions/README.md and the matching issue folder for recurring symptoms.
6. The repository code, manifests, maps, tests, and verified runtime behavior.
7. This plan and its identical source specification.

| Gate | Condition | State |
|---|---|---|
| **G1** | The user explicitly approves this consolidated Phase 1 deliverable and authorizes the Phase 2 report/temp outputs listed below | **PENDING** |
| **G2** | The user explicitly approves the Phase 2 report and its evidence-based implementation order | **PENDING** |

- No A0–A13 Phase 2 step may start before G1.
- No B lot or product/configuration/dependency change may start before G2.
- Completing this document review does not imply either approval.
- There is no hidden third gate. A12 may run the approved audit checks after G1, subject to the isolation gate and the test strategy below.

Allowed writes by phase:

- **Before G1:** this canonical plan only, including removal of the superseded Phase 1 file requested by the user.
- **Phase 2 after G1:** temp/audit/**, todo/audit_findings/**, todo/audit_phase2_report.md, this plan's checkboxes/journal, and eVe/documentations/FRAMEWORK_STATE.md only when the audit produces a verified framework-state fact, limitation, regression, uncertainty, or changed validation status. Production sources, configuration, dependencies, manifests, lockfiles, and real data remain read-only.
- **Phase 3 after G2:** only the files required by the approved lot, its persistent tests under tests/**, applicable maps, and the State File when required.
- **Git is always read-only.** No staging, commit, branch, stash, restore, checkout, reset, clean, move, remove, config mutation, fetch that updates refs, pull, or push is permitted. Filesystem edits and deletions are performed directly and reported. Rollback means a verified manual inverse, forward recovery, or data migration—not a Git command or a parallel runtime path.

Non-negotiable execution rules:

1. Record root and eVe-submodule Git status before and after each phase/lot. The acceptance criterion is **no unexplained drift from the captured baseline**, not a clean status; the retained plan itself is currently untracked.
2. Work only in /Users/jean-ericgodard/RubymineProjects/a. Exclude .claude/worktrees/**, node_modules/**, target/**, dist/**, renderers/**, and temp/** from source inventories unless one is explicitly the target.
3. Never touch real data under data/** or database_storage/** during the campaign. A0 must prove every write sink is isolated before any application runtime starts.
4. Use JavaScript for main-code/test helpers, Rust/Swift/Ruby/C/C++ only in their allowed roles. No TypeScript or Python.
5. Temporary diagnostics belong only under temp/**. Persistent regression tests belong only under tests/**.
6. In Phase 2, reuse an existing focused test or probe first. Create the smallest disposable diagnostic under temp/** only when no existing surface can answer the question. Phase 2 records red results; it does not repair them. Red-to-green is mandatory only in Phase 3.
7. A syntax check may supplement validation but never replaces ESM entry import, real runtime execution, or the relevant user path.
8. For UI work, wait for the eVe shell and mounted BevyUI tree, resolve the current foreground-scene overlay record, use a real pointer/touch action, and inspect hit testing. Never use force, dispatchEvent, synthetic pointer sequences, DOM proxies, test-only activation APIs, or test metadata as product proof.
9. Preserve canonical state outside the DOM, the single commit/commitBatch mutation path, Squirrel/Atome component ownership, the shared WebGPU compositor, and one visible canvas per active rendering zone. Effectful operations use the declared API/Command Bus, policy/capability/idempotency/audit contracts; application data uses the canonical WebSocket transport subject only to documented native/media exceptions; user-visible text uses eveT. No visible DOM/canvas/private renderer per Atome, fallback renderer, compatibility shim, or parallel route.
10. Treat all dates, counts, versions, line numbers, and measurements below as a 2026-08-12 starting snapshot to revalidate, not as timeless facts.
11. Effort is not estimated until A0 proves runtime availability and A1 closes the product scope. Full Cartesian test products are forbidden; use the risk-based sampling design defined below.
12. Missing mandatory runtime or hardware evidence is reported as **blocked** and **To verify**, never as completed acceptance.

# PHASE 1 — consolidated audit method

The Phase 1 artifact is the following block of exactly 27 numbered core sections. It designs the audit and records only the reconnaissance needed to make that design evidence-based; it is not a substitute for the Phase 2 deep audit.

## 1. Executive summary

The audit method is built around six repository-specific decisions:

1. **Close the real product boundary before calculating quality metrics.** The live application entry imports eVe, while many demonstrations are commented out; dynamic registries, packaging, native targets, service workers, and scripts must still be checked before anything is classified as unused.
2. **Reuse and revalidate the existing performance evidence.** todo/perf_audit_2026-08-09.md contains 14 measured, unapplied lots. It is an input baseline, not an acceptance result and not a reason to skip current measurements.
3. **Use existing diagnostic surfaces.** window.__DEBUG__, project-scene state, BevyUI overlay diagnostics, hit testing, the opt-in performance collector, browser/native logs, and runtime persistence adapters are preferred over new instrumentation.
4. **Prove every critical operation on four planes.** Visible pixels, in-memory canonical/runtime state, persisted state, and restored state after the applicable reload/restart must agree on full logical identity—not merely counts.
5. **Treat Import and Home as falsifiable incident investigations.** Start with the cheapest discriminating experiment, identify the first divergent layer, measure reproduction rates, and do not convert a static hypothesis into a finding without runtime evidence.
6. **Audit product use, not only code.** Assistant/workspace coexistence, mode roles, information architecture, feedback, cognitive load, accessibility, inputs, viewports, and platform constraints are first-class audit domains with objective and heuristic evidence clearly separated.

The method reduces uncertainty in this order: rules and isolation; real product scope; baseline; cross-cutting functional truth; known incidents; failure/concurrency; UX/accessibility; security; architecture/performance; quality/dependencies/tests; independent validation and synthesis.

## 2. Confirmed repository facts

All facts in this section are a **dated reconnaissance snapshot from 2026-08-12**. A1 must revalidate them against the current source before they support a Phase 2 conclusion.

### 2.1 Repository identity and rules

| Fact | Dated evidence |
|---|---|
| Root revision | main at 87d178d0; the initial Phase 1 snapshot reported a clean tree |
| eVe | Git submodule at 199af13; inspect its status separately |
| Secondary worktree | .claude/worktrees/relaxed-haibt-6af634 at detached b312cc9f; exclude from all scans |
| Active rules | .codex/AGENTS.md v3.1 plus modules 01–07; Git strictly read-only; temp only under temp; persistent tests only under tests |
| Current documentation state | audit_execution_plan.md and the superseded Phase 1 file were untracked at review time; cleanliness is therefore not an acceptance criterion |

### 2.2 Languages, scale, and file-size reference

| Metric | Initial reference |
|---|---:|
| JS/MJS files in atome/src, eVe, server, scripts, database | 1,349 |
| eVe JS LOC excluding R&D | 164,503 |
| atome/src JS LOC excluding wasm/assets | 114,870 |
| Rust / Swift / C-C++-headers / WGSL files | 942 / 154 / 33 / 12 |
| TypeScript files | 10, all declaration files; no implementation TypeScript detected |
| Python / Ruby files | 0 / 0 |
| Files over 500 / 800 / at least 1,000 lines | 51 / 22 / 18 |

The initial largest-file list included server/server.js at 4,671 lines, database/adole.js at 2,138, and large demonstration files under lyrix, jeezs, and examples. Thirteen of the eighteen files at or above 1,000 lines were provisionally outside the product path. A1 must replace this provisional classification with reachability evidence.

### 2.3 Boot and rendering reference

- Boot path: atome/src/index.html → early-init.js and shell assets → squirrel/spark.js → sequential core modules → concurrent components → kickstart.js → atome/src/application/index.js → eVe/eVe.js → concurrent and sequential eVe modules.
- The prior performance audit measured 815 static ES modules / 6,589 KB and 1,148 modules including dynamic reachability, kickstart_ready near 342 ms, and the last eve.boot_module near 1,002 ms on a warm local run.
- Bevy 0.19.0 was present in Web, Tauri, and iOS renderers; the local wgpu fork reported 29.0.4.
- squirrel_bevy_renderer_bg.wasm measured 13,405,519 bytes, with 3,376,767-byte Brotli and 4,995,252-byte gzip variants. squirrel_audio_wasm_bg.wasm measured 849,370 bytes with no precompressed sibling.
- The shared project and matrix rendering surfaces were present. WebGPU is the canonical product route; all visible-pixel claims still require real runtime evidence.

### 2.4 Audio, server, transport, and persistence reference

- Web and Tauri audio used Kira 0.12 and Symphonia 0.5; the native feature set included cpal, wav, mp3, ogg, flac, aac, and isomp4.
- AUv3 sources existed under platforms/ios/atome-auv3.
- Fastify 5.8.5 served the Web runtime; /ws/api and /ws/sync were present.
- Authentication consisted of multiple server modules; the Fastify OTP store was an in-process Map with five-minute expiry and one-time use. The development bypass was conditioned on non-production mode.
- SQLite/libSQL adapters, IndexedDB guest/audio stores, service-worker Cache API use, and mediasoup dependencies were detected.
- scripts/run_fastify.sh sources .env and .env.local and defaults SQLITE_PATH to database_storage/adole.db. server/server.js also has repository-relative log and data/uploads_tmp sinks. This makes A0 isolation a hard gate.

### 2.5 UI, assistant, accessibility, quality, and tooling reference

- Project view modes were natural, list, and table; project_view_mode_state.js was the declared owner and view_mode was persisted through commitBatch.
- panel_definitions.js defined 16 panel surfaces; tool/runtime/rendering directories were large and heavily dynamic.
- The assistant installed an interaction interceptor named voice-assistant-modal across the project zone at priority 1100, while its visual size was bounded to roughly 240–420 px. The obstruction hypothesis is interactional, not simply visual.
- Static accessibility signals were sparse, but they do **not** prove the absence of an accessibility tree: the hidden text root is aria-hidden while idle and removes that state during active editing, and Bevy/assistant semantics require runtime inspection.
- Initial repository-wide scans found 895 console calls and 863 one-line empty catches, heavily concentrated in demonstration code. eVe/core/event_bus.js contained a swallowed listener exception path.
- Eleven architecture guardrails, Vitest 4.1.6, Playwright 1.50, about 539 JS/MJS test files, 138 existing probes, and two UI scenario files were present. .github/workflows contained no workflow file.
- The four mandatory maps and eVe/documentations/FRAMEWORK_STATE.md were present, as were three documented known-bug-solution folders.

## 3. Hypotheses and unconfirmed elements

| ID | Unconfirmed element | Current status | Discriminating action |
|---|---|---|---|
| U-1 | Import and Home incidents reproduce on the current revision | Unverified | A4/A5 repeated runtime campaigns |
| U-2 | examples, lyrix, jeezs, aBox, vie, thermUSS, R&D, dist, and vendored renderers are outside the product | Strong static indication only | A1 import/dynamic registry/packaging/native/service-worker closure |
| U-3 | All four maps dated 2026-08-11 match current ownership | Unverified | Risk-based assertions across all four maps, not CODEMAP alone |
| U-4 | All 14 prior performance lots remain open and measurements remain representative | Strong but dated | Re-run the applicable probes/baselines under A2 |
| U-5 | Stored table is the product's Matrix/Table mode and the current visual is a tile grid | Strong static indication | Capture and task-test all three modes |
| U-6 | Authentication semantics are equivalent across Fastify, Tauri/Axum, and iOS/Swift | Unverified platform-specific implementations | Compare each actual runtime path before judging duplication or parity |
| U-7 | No incompatible/GPL dependency affects intended Apple distribution | Unverified | Complete manifest/lock/license inventory across npm, Cargo, Swift/Xcode, CMake, and vendored code |
| U-8 | The secondary worktree is inert | Unverified and irrelevant | Exclude it; never use its contents as current evidence |
| U-9 | Guest mode exists end-to-end and is isolated | Partially indicated by guest store/probes | Execute guest lifecycle and adoption in A3 |

Initial scope hypotheses to validate, not conclusions:

- Candidate PRODUCT: eVe/**, atome/src/squirrel/**, atome/src/application/audio_runtime/**, server/**, database/**, platforms/**.
- Candidate NON-PRODUCT: demonstrations, R&D, dist, and vendored renderer/build outputs.

## 4. System map

~~~text
atome/src/index.html
  -> atome/src/squirrel (boot, components, APIs, AI, security, voice)
    -> eVe (commit/history, domains, tools, panels, Flower, assistant, i18n)
      -> shared WebGPU/Bevy scene and canvas surfaces
      -> WebSocket /ws/api and /ws/sync
        -> Fastify routes/auth/media/sharing
          -> ADOLE/SQLite or runtime-specific persistence

Native boundaries:
  Web    -> Bevy/audio WASM
  Tauri  -> Axum + native Bevy/Kira/Symphonia
  iOS    -> local Swift server/native bridges + Bevy/native services
  AUv3   -> host callbacks and realtime audio boundary
~~~

Important boundaries and static-analysis traps:

- JS ↔ WASM glue, JS ↔ native iOS bridges, and Tauri/Axum capability adapters.
- Tool ids, surface keys, module keys, treeId:nodeId handlers, dynamically calculated overlay ids, import() registries, shell scripts, Xcode/Cargo targets, service-worker assets, and packaging manifests.
- Authentication, certificates, security modules, credential-related scripts, file imports, sharing, native capabilities, shell APIs, and sync routes handle trust-sensitive data.
- A textual search alone can never prove that a file, export, event, asset, or dependency is unused.

## 5. State model and sources of authority

| Concern | Canonical/declared authority | Observation point | Must not become authority |
|---|---|---|---|
| Events/history | Append-only canonical mutation history | commit result, event records | DOM, renderer, cache |
| Current state | state_current derived from validated history | canonical API/persistence snapshot | local widget state |
| Atome structure | Schema-authorized particles/properties | commit/commitBatch and persisted record | dataset/classes/hidden nodes |
| Account/session | Runtime-specific authenticated backend | auth.current, server/native session state | UI-only flag |
| Project list/order/name | project_data.js; updateProjectName is the named project-name owner | debug persistence state + backend | panel-local copy |
| Active project | canonical project activation/persistence path | current-project runtime + backend | stale scene record |
| View mode | project_view_mode_state.js + persisted project view_mode | readProjectViewSurfaceState + persisted project | DOM marker |
| Scene records | project scene derived projection | getProjectSceneState | visible pixels or persistence |
| Selection/interaction | runtime registry | debug selection/interaction state | DOM metadata |
| Media/assets | media domain + backend storage | media state, file metadata, persisted references | decoder element or texture |
| Guest workspace | guest IndexedDB contract | isolated browser storage inspection | rendered list |

Ownership risk to test: modeByProjectId memory and persisted view_mode may diverge when persistence fails or across runtimes. The structured-view refresh contract is also undocumented and must be established by A3/A4. These are hypotheses, not findings.

## 6. Functional and integrity invariants

Every applicable scenario must evaluate these invariants. V = visible, M = memory, P = persistence, R = restored.

| ID | Invariant | Executable formulation | Planes |
|---|---|---|---|
| INV-1 | Stable logical identity | IDs remain unchanged across rename, move/reorder, mode change, close/reopen, reload/restart | M,P,R |
| INV-2 | No silent duplicate/orphan | Full ID set changes only by the intended operation; no orphaned relation/resource appears | M,P |
| INV-3 | Four-plane convergence | The same logical object, relations, properties, order, ownership, asset references, and metadata agree across V/M/P/R | V,M,P,R |
| INV-4 | Atomicity | Cancellation/crash/failure leaves no persistent partial asset, object, relation, index, or history state | P,R |
| INV-5 | Visible recoverable error | Every failed critical operation exposes actionable state and supports a clean retry | V,M |
| INV-6 | Required idempotence | Repeated/rapid equivalent commands produce one intended effect | M,P,R |
| INV-7 | Ownership and authorization | Account B cannot view or mutate A's projects/objects/assets, including direct-ID access | M,P,R |
| INV-8 | Valid editing context | Selection, parent, focus, edit session, scroll, zoom, and draft remain valid or intentionally reset with feedback | V,M |
| INV-9 | Derived-data coherence | Thumbnails, indexes, timelines, caches, and histories match canonical state | V,M,P,R |
| INV-10 | Durable restoration | Reload, new browser context, app restart, and reconnect restore the same canonical state | P,R |
| INV-11 | Cross-view propagation | An action in one mode appears in the others without an unrelated manual trigger | V,M,P |
| INV-12 | Essential-command non-blocking | Failure/slowness of a secondary dependency cannot indefinitely block or silently discard an essential command | V,M |
| INV-13 | DOM non-authority | Canonical state survives DOM teardown/rerender without reading business truth from DOM | M,P,R |
| INV-14 | Canonical mutation ownership | Every visible business write enters through commit/commitBatch and folds into history/persistence | M,P |

## 7. User journey map

### Account

UI account flow → session/account API → runtime-specific authenticated backend → OTP/session/persistence → restored authenticated state. Cover clean signup, valid/invalid/expired/reused/resend/rate-limited OTP, duplicate account, interruption/resume, login/logout/reconnect, immediate restart, first project, guest/adoption when present, deletion when present, and two-account isolation.

### Project

Dashboard/Matrix → project_data canonical operations → commit/backend → project order/name/active-project state → project scene/view → reload/restart. Cover empty and repeated creation, boundary names, open, populate, rename in all states, discover the real move/reorder semantic before testing it, repopulate, switch views, close/reopen, delete from each allowed view, failure/cancel/race, and isolation.

### Object

Real tool/gesture/API intention → command bus/policy → commit/commitBatch → backend/history → change event/invalidation → scene/render → restore. Cover create/select/edit/rename/move/resize/duplicate if present/delete, parent-child/reference/asset cases, undo/redo, multi-selection, view changes during work, null/boundary/Unicode/large values, and cross-project isolation.

### Import

Actual entry point → project/selection target → native/browser file picker → bytes/validation/metadata → asset → Atome → ownership → transaction → index/cache/change notification → active view → WebGPU pixels → reload/restart.

### Home at startup

Real overlay click → tool runtime → session resolution → panel surface availability → onOpen/tree build/mount → main-menu visibility → first feedback/opened/usable state. Correlate with boot, storage, backend, WASM/Bevy, shaders, and background tasks.

## 8. Interface and feature inventory

The initial inventory to revalidate includes:

- Three project modes: natural, list, table.
- Sixteen panel definitions: home, contact, info, finder, communicate, delete, undo, paste, timeline, calendar, background, couleur, size, font, detail, layer.
- Finder is custom and may follow a parallel open/close path; treat it as an audit risk, not a proven defect.
- Shared BevyUI main menu, View palette, Flower contextual menu, project/dashboard surfaces, overlays, inspectors, dialogs, empty/loading/error/permission states, and panel geometry gestures.
- Named canonical component owners from module 04: panel text editing, editable text, text layout, hidden IME service, selectable list, virtual window, table geometry, sortable header, media card, panel shell, panel state, visual tokens, and project-name update.
- Keyboard discovery appeared sparse in static scanning; real keyboard reachability must be measured.

Every visible control must be mapped to a user task, command/owner, state transition, feedback path, and accessible alternative when required. Duplicate, hidden, incomplete, inconsistent, and low-value functions are classified only after task evidence.

Named component owners that must be consumed rather than copied:

| Responsibility | Canonical owner |
|---|---|
| Inline text editing | eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js |
| Editable text node | eVe/intuition/runtime/bevy_panel/bevy_panel_editable_text.js |
| Text geometry/ranges | eVe/domains/rendering/text_editing_layout.js |
| Hidden text/IME | eVe/domains/rendering/hidden_text_service_runtime.js |
| Selectable list/hierarchy | eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list.js |
| Virtualized window | eVe/intuition/runtime/bevy_panel/bevy_panel_virtual_window.js |
| Table column geometry | atome/src/squirrel/components/table_contract.js |
| Sortable header | eVe/intuition/runtime/bevy_panel/bevy_panel_sortable_header.js |
| Media card/tile | eVe/intuition/runtime/bevy_panel/bevy_panel_media_card.js |
| Panel shell/footer/scroll | eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js |
| Empty/loading/error state | eVe/intuition/runtime/bevy_panel/bevy_panel_state.js |
| Visual tokens | EVE_PANEL_SKIN_TOKENS in eVe/elements/skin/panel_skin.js |
| Project-name write | updateProjectName in eVe/intuition/matrix/core/project_data.js |

## 9. Assistant interaction model

Initial static model to verify:

| Aspect | Initial indication |
|---|---|
| Phases | closed, opening, listening, processing, speaking, error |
| Motion | appearing, settling, disappearing transitions |
| Interaction | project-wide interceptor at priority 1100; main menu may receive yielded interaction |
| Visual | centered organic scene, much smaller than the full canvas |
| Alternate display states | no docked/compact/floating/minimized state detected in Phase 1 |
| Main hypothesis | small visual surface may still block the entire project interaction zone |

Mandatory assistant-open tasks:

1. Read a response while consulting a project object.
2. Select and edit underlying text.
3. Move or resize an object.
4. Scroll, zoom, and navigate the project.
5. Open Home, a menu, an inspector, or another panel.
6. Switch natural → list → table.
7. Import a file and follow progress.
8. Copy information assistant ↔ project.
9. Open/close the software keyboard on touch/iOS.
10. Resize the window or rotate the device.
11. Minimize and restore during an in-progress response.
12. Resume the exact conversation/project context after close/reopen.

Compare seven evidence-backed models without preselecting a redesign: focused full screen; resizable side dock; bottom sheet; movable/resizable floating window; compact state; minimize with exact restoration; explicit conversation/manipulation toggle. Measure usable area, readability, underlying-canvas access, touch precision, hidden commands, focus/scroll/shortcut conflicts, persistence, layout stability, CPU/GPU cost, action count, task success, and context loss.

## 10. Roles of Natural, List, and Matrix/Table

Initial code-declared roles to verify:

| Mode | Initial role | Known question |
|---|---|---|
| natural | Free spatial canvas, no structured tree | Which project operations must remain available through shared/global controls? |
| list | Opaque structured hierarchy/list | Are hierarchy, order, expansion, keyboard navigation, selection, and operations complete? |
| table | Stored key retained while current content appears tile/grid-like | Is Matrix/Table naming, density, sorting/filtering/columns, and purpose coherent? |

For every critical task, build a task × mode × availability × consistency × utility record. Classify each difference as intentional-useful, involuntary, inconsistent, incomplete, or redundant. Preserve project, selection, order, filter, zoom, scroll, focus, and edit/import context when the product contract requires it. Do not assume the three modes should be identical or all retained.

## 11. UX matrix

Task identifiers:

- T1 create account; T2 validate OTP; T3 reconnect/restore session.
- T4 create first project; T5 create multiple projects; T6 open project; T7 rename; T8 move/reorder after semantics are proven; T9 delete.
- T10 create object; T11 select/edit; T12 move/resize; T13 delete object.
- T14 import file; T15 switch view mode; T16 open Home; T17 open/close assistant; T18 undo/redo.

Axes: mode, runtime, input, assistant state, viewport/orientation, zoom, dataset size, storage state, network state, auth/authorization state, cold/warm/crash-resume state, and novice/advanced access path.

Risk-based coverage replaces the impossible full Cartesian product:

1. **Core sentinel:** T1–T18 in all applicable modes on visible Web with pointer, assistant closed, medium viewport, 100% zoom.
2. **Cross-view truth:** every mode-sensitive operation executed in one mode and checked in the other two plus restored state.
3. **Known incidents:** all modes and all discovered import entry points on each available real runtime for one valid sentinel; Home at all mandatory timing points. Boundary and failure dimensions are then varied one factor at a time and in risk-selected pairs.
4. **Assistant:** all 12 tasks in each applicable mode with assistant open.
5. **Input/accessibility:** critical tasks T4, T6, T10, T11, T14, T15, T16 with keyboard and touch where available.
6. **Zoom/viewport:** critical content tasks at 150% and 200%, narrow/wide, portrait/landscape where applicable.
7. **Limits:** empty/small/medium/large plus discovered N-1/N/N+1 boundaries; do not assume 5,000 is a product limit.
8. **Pairwise/high-risk interactions:** network × persistence, view switch × import, project switch × import, assistant × software keyboard, restart × pending operation, authorization × direct ID.
9. **Repetition:** at least 20 only for inexpensive, timing-sensitive, concurrency-sensitive, or flaky selected cells; increase N until the reproduction-rate confidence interval is useful.

Every observation records OK, KO, N/A, or BLOCKED plus task duration, action count, errors, backtracks, context loss, and evidence references. N/A requires a proven absent/non-applicable function; BLOCKED names the missing capability.

## 12. Accessibility audit plan

Do not infer accessibility from sparse DOM attributes or canvas use. Inspect Web DOM/AX state, Bevy/internal semantics, Tauri/macOS accessibility, and physical-iOS accessibility/VoiceOver where applicable.

| ID | Protocol | Acceptance evidence |
|---|---|---|
| AX-1 | Dump actual accessibility trees for shell, project, menus, panel, editor, assistant | Exact exposed/hidden controls and semantics |
| AX-2 | Keyboard-only critical tasks | Complete route or explicit unreachable finding |
| AX-3 | Continuous focus traversal | Logical order, visible focus, no traps/loss |
| AX-4 | 100/150/200% zoom and text sizing | No essential function lost or inaccessible overflow |
| AX-5 | Contrast from actually used token/paint pairs | Ratios and state-specific evidence, not token names alone |
| AX-6 | Non-color state cues | Selection, active, warning, and error have a second signal |
| AX-7 | Touch target geometry | Platform-appropriate target and spacing measurements; use 44×44 pt as the Apple baseline where applicable |
| AX-8 | Alternatives to gesture/hover/long press/drag | Visible and reachable equivalent for each critical action |
| AX-9 | Reduced motion | Nonessential motion reduced without losing state feedback |
| AX-10 | Theme/high-contrast support | Existence and real task usability |
| AX-11 | Long, RTL, emoji, combining, and Unicode labels/data | No silent destructive truncation or unreachable content |
| AX-12 | Low-vision task pass | Critical tasks at 200%, changed contrast, narrow viewport |

The deliverable explicitly lists functions reachable only through visual precision or inaccessible to keyboard/touch/accessibility technology.

## 13. Critical paths

| Domain | Path to follow end-to-end |
|---|---|
| Boot | index shell → spark → kickstart → application entry → eVe modules → usable essential commands |
| Mutation | intent → policy/command bus → commit/commitBatch → history/current state → persistence → projection |
| Import | entry → target → picker → bytes → asset/Atome → commit → notification → scene/view → pixels → restore |
| Structured views | mode owner → surface mount/content load → shared components → render/invalidation |
| Panel open | real click → tool runtime → onOpen → tree mount → visibility → feedback/usable state |
| Rendering | canonical state → render description → shared WebGPU compositor → surface pixels |
| Audio | facade → runtime-specific Kira/Symphonia → realtime callback/resource lifecycle |
| Network/sync | canonical API/WS → runtime backend → validation/auth → persistence/replay/reconnect |
| Security | account/session → authorization → project/object/asset isolation → sharing/import/native boundaries |
| Interaction | foreground overlay → real hit test → command/tool runtime → canonical mutation or UI state |

A12 must calculate executable-test coverage against these paths, distinguishing real routes from mocks.

## 14. Known incidents to reproduce

### 14.1 Import in List and Matrix/Table

Mandatory trace stages:

1. Command activation.
2. Current project/container/selection resolution.
3. File picker open and return.
4. Byte read and file validation.
5. Decode/metadata creation.
6. Asset creation.
7. Business Atome creation.
8. Correct project/parent assignment.
9. Persistence transaction.
10. Index/cache update.
11. Change notification.
12. Active-view update.
13. WebGPU render/thumbnail.
14. Restored state after reload/restart.

Initial hypotheses to revalidate before use:

- H-IMPORT-1: commit effects emit atome:changed on the internal event bus while project_view_surface_runtime listens on window; structured content may fail to refresh until another render trigger.
- H-IMPORT-2: import target resolution may fail before the picker when the expected project view host cannot be resolved.
- H-IMPORT-3: Flower target/selection context may differ in structured views.
- H-IMPORT-4: callers may fail to project an ok:false result, creating a separate silent-feedback defect.

Cheapest order: observe whether the picker opens; compare scene/view/persistence after a valid small import; test whether an unrelated resize reveals an already-created record; compare Flower items/context; inspect feedback; then expand the risk-based matrix. The required UI proof is intention → upload/created Atome id → scene record → one project canvas and no DOM media projection → successful scene-render diagnostics → visible, nontransparent, expected pixels → persisted/restored equality.

### 14.2 Home during startup

Measure these ten distinct milestones:

1. Process/page start.
2. First shell pixels.
3. Input handlers installed.
4. Home command can be received.
5. Actual click/command received.
6. First visible feedback.
7. Panel visible.
8. Panel usable.
9. Critical initialization complete.
10. Secondary/background initialization complete.

Initial hypotheses:

- H-HOME-1: session resolution waits on auth.current before the UI exposes feedback.
- H-HOME-2: onOpen + tree mount + main-menu visibility work precedes the first opened feedback.
- H-HOME-3: a click before the panel canvas exists may return a silent surface-missing result and be lost rather than queued.

Start with a click near 0.2 s and wait 30 s without retry to classify lost versus queued. Then execute t = 0, 0.5, 1, 2, 5, 10, 20 s under cold/warm starts. Vary storage, project scale, network, cache, GPU, session, and repeated/rapid panel changes through one-factor and risk-pair coverage—not a Cartesian product. Profile JS/Rust/WASM/Bevy, event-loop tasks, storage/migrations, assets/network, shaders, UI construction, and locks.

## 15. Measurable audit objectives

| ID | Objective | Phase 2 evidence of success |
|---|---|---|
| O-1 | Reproduce/refute Import and Home | n/N rate with 95% interval, timeline, first divergence, root cause or ranked discriminating hypotheses |
| O-2 | Establish reproducible baselines | Each required metric measured or BLOCKED with exact missing capability |
| O-3 | Evaluate all invariants | Scenario matrix with four-plane evidence and named invariant for every failure |
| O-4 | Quantify assistant obstruction | Intercepted/usable area, task success, actions, time, latency, context loss |
| O-5 | Define useful view-mode roles | Every difference classified and tied to tasks/evidence |
| O-6 | Establish real accessibility scope | Cross-runtime list of reachable/unreachable critical functions |
| O-7 | Build threat model and prove isolation | No unauthorized cross-account access or a redacted confirmed finding |
| O-8 | Prove debt/removal claims | Multi-channel reachability and dependency evidence per item |
| O-9 | Close product/non-product scope | Signed reachability inventory; no unexplained UNKNOWN item |
| O-10 | Measure test coverage of critical paths | Real-route coverage percentage and explicit gaps |

## 16. Technical coverage matrix

Methods: I inventory, S static analysis, L targeted reading, T existing tests, P profiling, C load/concurrency/soak, F fault injection, M real-platform validation, U real-user-path observation.

| Domain | I | S | L | T | P | C | F | M | U | Static-only warning |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Architecture/boundaries | X | X | X | X |  |  |  | X | X | Dynamic registries hide edges |
| Reliability/correctness | X | X | X | X | X | X | X | X | X | Silent errors require four-plane proof |
| JS/UI performance | X | X | X | X | X | X | X | X | X | Real visible tab required |
| Bevy/wgpu/WebGPU | X | X | X | X | X | X | X | X | X | WASM/static reading cannot prove pixels |
| Rust/WASM/Tauri/native | X | X | X | X | X | X | X | X | X | Use actual runtime boundaries |
| Realtime audio/AUv3 | X | X | X | X | X | X | X | X | X | Host/device evidence required |
| Network/sync/persistence | X | X | X | X | X | X | X | X | X | Runtime stores differ |
| Security | X | X | X | X |  | X | X | X | X | Secret scans alone are noisy |
| Quality/debt | X | X | X | X |  |  |  | X | X | Grep never proves dead code |
| Tests/observability | X | X | X | X |  | X | X | X | X | Green mocks do not cover real routes |
| Dependencies/build/licenses | X | X | X | X | X |  |  | X |  | Inventory every target/lockfile |
| UI/UX/IA/accessibility | X | X | X | X | X | X | X | X | X | Canvas/DOM inference is insufficient |

## 17. Functional coverage matrix

| Journey | Mandatory operations | Cross-checks | Runtime targets |
|---|---|---|---|
| Account | Signup, OTP variants, duplicate, interruption/resume, login/logout/reconnect, immediate restart, first project, guest/adoption if present, deletion if present | UI/session/backend/restoration; A/B isolation and direct-ID attempts | Web, Tauri, physical iOS; diagnostics elsewhere as applicable |
| Project | Create, boundary names, open, populate, rename in all states, proven move/reorder, repopulate, view switch, close/reopen, delete, cancellation/failure/race | All modes, full logical snapshot, other account/project unaffected | Web, Tauri, physical iOS where feature exists |
| Object | Create/select/edit/rename/move/resize/duplicate if present/delete, relations/assets/undo/redo/multi-select | All modes and restart; IDs/relations/order/properties/assets | Web, Tauri, physical iOS where supported |
| Import | Every actual entry × every mode; file/failure/boundary cases; mode/project switch | Four planes, visible pixels, cleanup, no duplicate/orphan | Web, Tauri, physical iOS; simulator diagnostic only |
| Home startup | Mandatory timing points and environment factors | Ten milestones, lost/queued/delayed/blocked classification | Web, Tauri, physical iOS where controllable |
| Assistant | Twelve tasks and seven display-model evaluations | Context/focus/selection/scroll/zoom/draft, mode and viewport | Web, Tauri, physical iOS |

Inputs and environments include pointer, keyboard, touch, trackpad, stylus when supported; narrow/medium/wide and portrait/landscape; 100/150/200%; new/existing/guest/unauthorized accounts; clean/old/migrated/filled/failing storage; normal/slow/unstable/offline network; cold/warm/crash resume; valid/invalid/large/hostile files; novice and advanced paths.

## 18. Baseline plan

### 18.1 Statistical rules

- Static counts/sizes: one deterministic run with command, exclusions, source revision, and artifact digest; repeat after source change.
- Cheap continuous timings: at least 20 independent samples; report median, MAD, p95, minimum/maximum, and environment. Separate cold and warm populations.
- Success/failure rates: report n/N and Wilson 95% confidence interval. Increase N for timing/concurrency bugs until the interval supports a useful decision.
- Expensive builds: at least five controlled samples when feasible; otherwise label the result a snapshot, not a distribution.
- Memory/soak: time series with fixed checkpoints and retained-resource counts; never replace a long-run claim with a single heap value.
- Before/after optimization: identical machine, runtime, dataset, visibility, cache state, and procedure. A gain must exceed the predeclared noise/regression threshold.
- A visible tab/window is mandatory for rAF/UI/GPU verdicts. document.hidden measurements are invalid for acceptance.

### 18.2 Required baselines

| Family | Measures and reset conditions |
|---|---|
| Startup | process/page start, first shell pixels, handlers, essential-command readiness/feedback/usability, critical/background completion; cold/warm and runtime-specific restart |
| Functional | account/project/object/import latency and rate; convergence delay; lost/delayed/duplicate actions; orphan/reference/divergence counts |
| JS/UI | long tasks, event-loop delay, interaction latency, GC/allocation pressure, scroll/panel cost, listener/timer counts |
| GPU/WebGPU | idle cadence/work, submissions, draw calls, pipeline changes, transfers/readbacks, frame pacing, resource growth, device-loss behavior |
| Memory/resources | initial/peak/checkpoints at 5/15/30/60 minutes, listeners/timers/sockets/media/GPU resources; longer soak when available |
| Size/build | static/dynamic boot graph, served compression/cache headers, JS/WASM/binary/assets/dependency size, clean/incremental builds |
| UX | task success/time/actions/backtracks, assistant usable/intercepted area, context loss, view-switch errors, missing/duplicate actions, layout stability |
| Accessibility | AX exposure, keyboard completion, focus, zoom/reflow, contrast, touch targets, gesture alternatives, reduced motion |
| Network/persistence | WS latency/throughput/volume/reconnect/backpressure, DB/IndexedDB operations, history/event growth, sync/conflict/recovery |
| Audio/mobile | callback duration and budget margin, XRuns/dropouts, allocations/locks/I/O/logs, sample-rate/buffer/route changes, battery/idle load |
| Reliability | unhandled errors/panics/crashes, nondeterminism, repeated and long-run stability |

Initial thresholds are audit triggers, not product promises: first feedback above 100 ms is a UX defect candidate; long tasks above 50 ms require explanation; prior performance references are remeasured; the roughly 1 FPS idle direction is evaluated per runtime and active animation/interaction constraints rather than treated as a universal pass threshold.

## 19. Instrumentation and correlation strategy

No new production instrumentation is permitted in Phase 2. Each scenario receives an external run_id, timestamps, source/runtime metadata, and before/after/restored logical snapshots under:

~~~text
temp/audit/run_<timestamp>-<lot>-<scenario>/
  00_context.json
  01_before.json
  02_after.json
  03_restored.json
  screenshots/
  console.log
  runtime.log
  network.json
  perf.json
  verdict.md
~~~

Runtime-specific evidence adapters:

| Plane | Web | Tauri | Physical iOS |
|---|---|---|---|
| Visible | Visible Chromium screenshot/pixel sampling | Real Tauri WebView/app capture | Appium/XCUITest screenshot and real touch |
| Memory | window.__DEBUG__, project scene, overlay diagnostics | WebView debug/runtime state plus Axum/Rust logs | Available WebView/native state and device logs |
| Persistence | Isolated SQLite or guest IndexedDB | Isolated Axum/native store | QA account/native SQLite/local server evidence |
| Restored | Reload + fresh context + server/browser restart as applicable | App close/relaunch and reconnect | Device app terminate/relaunch and reconnect |
| Logs | Browser console, network, Fastify | WebView console, Axum/Rust, paired services | Xcode/device console, JS console, native bridges |

For every logical comparison, use IDs, relations, properties, order, project/account ownership, asset references, metadata, index/history state, and operation status. Scene records never prove pixels; pixels never prove persistence.

UI readiness follows how_debug_UI.md: shell → active/mounted BevyUI tree → current foreground overlay record → real pointer center → overlay diagnostics/hit test when needed. The iOS simulator is diagnostic only; physical-iOS visual acceptance follows .codex/visual-test-protocol.md.

## 20. Tools and commands

Inventory tool availability before relying on it. Never install a tool or dependency in Phase 2.

| Need | Preferred existing surface | Cost / limitation / alternative |
|---|---|---|
| Source inventory | rg, rg --files, wc, read-only Git inspection | Low cost; exclude generated/vendor/worktree paths; use manifest/runtime closure for dynamic reachability |
| Syntax/architecture | npm run check:syntax; focused guardrails; npm run check:m0/m1/m2 when applicable | Low/medium cost; guardrails do not prove end-to-end behavior; add focused real-route validation |
| Focused tests | npm run test:run -- <path>; node test/probe entry points | Low/medium cost; run through isolation when side effects are possible; use the narrowest neighboring test first |
| UI | Playwright 1.50 + how_debug_UI.md | Medium cost; visible Chromium may be required; use real Tauri/iOS adapters outside Web |
| Cross-runtime visual | .codex/visual-test-protocol.md | High cost; physical iPhone required for iOS acceptance; simulator is diagnostic only |
| Startup/runtime | Official scripts through the A0-proven harness | Medium cost; raw scripts source real env/default paths and are forbidden before isolation |
| Performance | ?perf=1, existing overlay/scroll probes, browser/native profilers | Medium/high cost; dated probes must be verified; use runtime-native profiler when browser evidence cannot cover the owner |
| GPU/native/audio | Bevy diagnostics, Instruments/Metal, Cargo checks/tests | High cost; hardware availability constrains claims; static review is explicitly weaker |
| Persistence | Isolated SQLite, browser storage inspection, native store adapters | Medium cost; never mutate real data; use the runtime's real canonical store rather than a mock |
| Dependencies | npm manifest/lock, npm ls/audit, every Cargo manifest/lock, Swift/Xcode/CMake/vendored inventories | Medium/high cost; metadata is not a license audit; inspect dev and target-specific graphs separately |
| Duplication/dead code | Import graph + dynamic registries + packaging/tests/runtime proof | High verification cost; grep alone is forbidden; retain when indirect reachability remains unresolved |

Consult existing guardrails and probes before creating any temp helper. An ESM import validates linkage better than node --check alone, but runtime behavior still needs the real route.

## 21. False-positive and apparent-success detection

Repository-specific traps:

1. **Silent event-channel mismatch:** a subscriber on the wrong bus may never fail visibly. Require the intended update without an unrelated resize/mode switch/reload.
2. **Swallowed exceptions:** apparent UI normality can hide a failed handler. Check logs and all four planes.
3. **Canvas opacity to static/DOM tests:** prove the current foreground record, hit result, real input, and final pixels.

General rules:

1. Every P0/P1 finding requires two independent methods, such as static + runtime or runtime + persistence.
2. A green test is evidence only if it executes the canonical real module/path rather than a reimplementation or mock-only route.
3. Every optimization uses the same baseline and exceeds measured noise; otherwise reject the gain claim.
4. Every removal checks static imports, dynamic imports, string registries, event handlers, scripts, native targets, tests, packaging, service workers, APIs, history/replay, and runtime evidence.
5. Re-run all high-impact findings in an independent second pass and resolve contradictory recommendations.
6. Separate confirmed defect, probable risk, debt, measurable optimization, and style preference; record confidence.
7. A visible success with missing persistence/restoration, wrong ownership, stale cache, or inaccessible path is a failure.
8. User-preference claims remain hypotheses until a real user study is actually run.

## 22. Initial audit-risk register

| ID | Risk | Impact | Control |
|---|---|---|---|
| R-1 | Real account/project/file/data mutation | Critical | A0 hard isolation gate and QA identities |
| R-2 | Runtime writes through hard-coded logs/upload temp/env defaults | Critical | Disposable verified runtime mirror or block Phase 2 |
| R-3 | Accidental repository drift | High | Baseline status/digests and before/after comparison; Git read-only |
| R-4 | Parent/submodule/worktree confusion | High | Separate root/eVe inspection; exclude secondary worktree |
| R-5 | Simulator mistaken for iOS acceptance | High | Physical-device protocol; simulator marked diagnostic |
| R-6 | Dead-code false positive | High | Multi-channel dependency proof |
| R-7 | Hidden/background timing distortion | High | Visible runtime, controlled machine, statistical rules |
| R-8 | Wrong platform backend traced | High | Identify Web/Fastify, Tauri/Axum, or iOS/Swift owner first |
| R-9 | Maps or dated audits treated as current truth | Medium | Risk-based map/source revalidation |
| R-10 | Combinatorial campaign never finishes | High | Sentinel + one-factor + pairwise/high-risk sampling |
| R-11 | Secret exposure in report | Critical | Record redacted location/type only |
| R-12 | Missing hardware/server/user study overstated as pass | High | BLOCKED and To verify status |
| R-13 | Audit helper measures itself or changes state | Medium | Positive/negative harness controls, disposable temp scope, cleanup proof |

## 23. Blind spots and compensation

| Blind spot | Best local approximation | Required later validation/status |
|---|---|---|
| Physical iPhone/iPad unavailable | Simulator/build/native-log diagnostics | BLOCKED for physical visual/touch/rotation/keyboard acceptance |
| Real AUv3 host unavailable | Static callback review and unit checks | BLOCKED for host XRuns/route/interruption acceptance |
| FreeBSD/atomeOS unavailable | Static/build review if feasible | To verify on target |
| Production deployment absent | Isolated local backend and config review | No production-health claim |
| Real secrets absent | Synthetic credentials and boundary review | Controlled secret-management review |
| Representative customer data absent | Deterministic synthetic/boundary datasets | Re-run with approved sanitized data |
| GPU device-loss trigger unavailable | Sleep/GPU transition where safe; lifecycle review | Dedicated hardware scenario |
| Soak over eight hours unavailable | Sixty-minute initial trend, clearly labeled | Overnight/long-duration run |
| Real users not recruited | Heuristic inspection and cognitive walkthrough | User-study protocol; no preference-validation claim |
| Stylus/special input unavailable | Pointer/touch approximation only | To verify on hardware |

Each blind spot has a named owner, smallest validation action, and BLOCKED/To verify status in the report. It is never silently converted to N/A.

## 24. Detailed Phase 2 plan

G1 is required before any step below. The 14 numbered A0–A13 lots are the Phase 2 progress denominator. A lot counts as completed only when its acceptance criteria pass; a blocked/failed lot does not increase progress.

| Step | Purpose | Dependencies | Required output |
|---|---|---|---|
| A0 | Hard isolation and reproducibility gate | G1 | Proven isolated runtime/data/storage/log/browser/native environment |
| A1 | Product scope, architecture truth, tools, target availability | A0 | Signed product/non-product/unknown inventory and target matrix |
| A2 | Reproducible baseline | A0, A1 | Baseline dataset with statistical metadata |
| A3 | Cross-cutting functional campaign and invariants | A0–A2 | Four-plane scenario matrix |
| A4 | Import incident | A0–A3 | Timeline, first divergence, rate, root cause/ranked hypotheses |
| A5 | Home startup incident | A0–A3 | Ten-milestone timeline and blocking-dependency analysis |
| A6 | Faults, bursts, concurrency, soak, recovery | A3–A5 | Partial-state/resource/race findings |
| A7 | UI/UX, assistant, modes, information architecture | A2–A6 | Task/friction maps, assistant options, mode matrix |
| A8 | Accessibility and adaptive display/input | A7 | AX-1–AX-12 evidence and unreachable-function list |
| A9 | Threat model and security | A0, A1, A3 | Redacted security findings and isolation evidence |
| A10 | Architecture, reliability, JS/GPU/native/audio/network performance | A2–A6 | Domains A–G findings |
| A11 | Quality, size, debt, dependencies, build, licenses | A1, A10 | Domains I/K evidence inventory |
| A12 | Tests, reproducibility, observability | A1, A3–A11 | Domain J path-coverage and health/flakiness evidence |
| A13 | Independent validation and synthesis | all prior applicable lots | Exact Phase 2 report, provisional Phase 3 DAG, Gate G2 stop |

### A0 — Hard isolation and reproducibility gate

- Capture root/eVe status, revisions, environment/tool versions, and source digests.
- Inventory **every** write sink before startup: SQLite/libSQL, user home, completed uploads, hard-coded upload temp, logs/snapshots, caches, IndexedDB/browser profiles, native stores, sync queues, recordings, OS temp, and external services.
- Account for known risky defaults: scripts/run_fastify.sh sources .env files and defaults to the real SQLite path; server paths include repository-relative logs and data/uploads_tmp.
- Build a byte-verified disposable runtime mirror under temp/audit/runtime/** or another architecture-neutral isolated execution arrangement that redirects every sink to temp/audit/data/**. Never edit production code to achieve isolation during Phase 2.
- Use explicit test-only environment values only in the harness process, including the isolated SQLite path, upload path, user root, browser profile, remote-sync disablement, and QA identity settings when repository contracts support them.
- Create two QA accounts and deterministic datasets: empty, 10, 500, 5,000 records plus discovered N-1/N/N+1 limits and representative text/image/audio/video relationships.
- Provide Web, Tauri, and physical-iOS adapters separately. One Playwright harness is not cross-runtime acceptance.
- Cleanup may delete only a resolved path proven to be inside temp/audit/**. Validate the target before deletion, demonstrate create → run → cleanup → no residue, and preserve evidence.

**Pass:** two sentinel runs produce comparable evidence; all writes remain in approved isolated sinks; source/status digests show no unexplained drift; cleanup leaves no test residue.  
**Block:** if even one mandatory sink cannot be isolated or a real service would be touched, stop Phase 2 and report the smallest missing isolation capability.

### A1 — Product scope, architecture truth, and availability

- Close static and dynamic reachability from real entries, then cross-check string registries, service worker, shell/install/build scripts, package files, Cargo/Xcode/CMake targets, Tauri config, tests, and packaging.
- Classify each relevant file/module/dependency as PRODUCT, NON-PRODUCT, GENERATED/VENDORED, or UNKNOWN with evidence. UNKNOWN is allowed only with an explicit A13 uncertainty.
- Recalculate source counts, size thresholds, consoles, swallowed errors, tests, dependencies, and output sizes on the proven product scope.
- Verify current owners and risk-selected claims across CODEMAP, API_MAP, DESIGN_MAP, and ARCHITECTURE_MAP.
- Inventory installed tools and actual target/hardware availability. Build the applicability matrix before scheduling platform cells.

**Pass:** a signed scope and target matrix with no unexplained UNKNOWN item and no metric mixing product with demos/vendor/build output.

### A2 — Baseline

- Run every applicable family in the Baseline plan through the isolated harness.
- Consume prior measurements only as dated comparison points; re-run current probes after verifying their owners and inputs.
- Separate Web/Fastify, Tauri/Axum, physical iOS/Swift, AUv3, and FreeBSD claims.
- Use metric-specific sample sizes/statistics; do not apply “median of 20” to static sizes, long soaks, or rates.
- Record all warnings/errors and explain, disprove, or promote each one to a finding.

**Pass:** every required metric has reproducible evidence or a precise BLOCKED reason; no unavailable measurement is reported as zero/pass.

### A3 — Cross-cutting functional campaign

- Execute account, full project lifecycle, object coherence, isolation, cross-view parity, import sentinel, Home sentinel, assistant-workspace sentinel, and accessibility-adaptation sentinel before drawing code-quality conclusions.
- For every critical action capture V/M/P/R and evaluate INV-1–INV-14.
- Compare full logical identity, relations, properties, order, ownership, assets, metadata, indexes, caches, history, and status.
- Include clean/reload/restart/reconnect, rapid view changes, project/account boundaries, guest/adoption if present, and failure recovery.
- Determine the real product semantic of “move project” from code/docs/runtime before executing T8.

**Pass:** functional matrix filled; every KO names an invariant and first observed divergence; every BLOCKED cell names the missing capability.

### A4 — Import incident

- Follow all 14 mandatory stages and the cheapest hypothesis order in the Known incidents section.
- Run the valid sentinel for every actual entry point × every mode × every available real runtime.
- Add one-factor boundary coverage for small/large, real supported formats, empty/corrupt/unsupported/misleading extension, long/Unicode/duplicate name/content, cancel/repeat/multiple; add targeted pairs for mode/project switch, storage/network failure, and restart.
- Repeat timing/failing/flaky selected cells at least 20 times and report rate confidence intervals.
- Prove intent, picker result, created ID, ownership, persistence, scene, one-canvas/no-DOM-media budget, render diagnostics, pixels, feedback, cleanup, and restoration.

**Pass:** reproduced or rigorously refuted; exact timeline; first divergence; demonstrated root cause or ranked hypotheses with discriminating experiments; red regression-test specification for Phase 3.

### A5 — Home startup incident

- Classify early activation as lost, queued, delayed, or blocked.
- Measure all ten milestones at t = 0, 0.5, 1, 2, 5, 10, 20 seconds for cold/warm sentinels.
- Vary storage, project scale, network, cache, GPU, session, single/repeated click, and rapid panel switch one factor at a time plus risk-selected pairs.
- Correlate session resolution, command receipt, panel-surface availability, onOpen, tree mount, menu visibility, JS/Rust/WASM/Bevy/storage/network/assets/shader work, event-loop blocks, and first feedback.
- Repeat selected timing cells at least 20 times with rate/timing intervals.

**Pass:** exact timeline, first divergence, artificial dependencies, root cause/ranked hypotheses, rate, and Phase 3 red regression-test specification.

### A6 — Faults, bursts, concurrency, soak, and recovery

- Cancellation, invalid/hostile input, unavailable storage, network loss, close during operation, crash/restart, and retry.
- Bursts on create/rename/delete/import and overlapping mode/project/panel transitions; detect duplicate submissions, races, reentrancy, partial persistence, and stale projections.
- Resource time series for memory, listeners, timers, sockets, media, GPU allocations, sync queues, and history growth. Start with 60 minutes; longer claims require longer evidence.
- Mobile background/resume/memory pressure and route/sample-rate changes where real runtime evidence is available.
- GPU/device-loss and reconstruction where safely reproducible; otherwise BLOCKED/To verify.

**Pass:** every partial state, leak, race, or recovery result has a curve/timeline and canonical owner; no unexplained runtime warnings remain.

### A7 — UI/UX, assistant, modes, navigation, and feature value

- Map screens, panels, menus, inspectors, overlays, dialogs, tools, shortcuts, gestures, and empty/loading/error/success/permission states to tasks and owners.
- Execute the 12 assistant-open tasks and compare all seven display models with objective measurements, technical feasibility, regressions, platform tradeoffs, and validation criteria.
- Complete the task × mode × availability × consistency × utility matrix and classify every difference.
- Audit information architecture, global/local/contextual navigation, terminology/icons, current project/selection/mode visibility, command depth, shortcuts, return/undo/recovery, and context preservation.
- Classify each feature: retain; correct interaction; expose; simplify; merge; complete; move/rename; hide by default; remove; redesign hypothesis; user-study hypothesis.
- Audit immediate feedback, pending/progress/success/cancel/failure states, double-submit prevention, actionability, proportional confirmation, honest persistence success, and long-task usability.
- Separate measured task evidence, heuristic findings, and unvalidated preferences.

**Pass:** interface/state map, task/friction map, assistant-option comparison, mode matrix, feature-value inventory, navigation/IA audit, prioritized options.

### A8 — Accessibility

- Execute AX-1–AX-12 on every applicable real runtime/input.
- Inspect active and idle hidden-text behavior and Bevy/assistant semantics; do not conclude from aria-hidden counts alone.
- Use CDP for Web, platform accessibility inspection for Tauri/macOS, and physical-iOS/VoiceOver evidence where required.
- Verify keyboard/touch/gesture alternatives, focus, announcements, zoom/reflow, contrast, targets, reduced motion, long/RTL/Unicode labels, orientation, and dense modes.

**Pass:** evidence-backed accessibility report and explicit list of critical functions inaccessible without visual precision or unavailable to the required technology.

### A9 — Security

- Build the repository-specific threat model first: actors, assets, exposed APIs/WS/native bridges, trust boundaries, attack paths, and abuse limits.
- Audit authentication/authorization/session/token/OTP semantics separately on Fastify, Tauri/Axum, and iOS/Swift; compare parity without assuming coexistence is duplication.
- Test A/B isolation and direct-ID access for project/object/asset/share operations.
- Audit file import size/quota/MIME/content/archive/decompression/parser/resource limits and active content.
- Cover validation/normalization, path traversal, shell/SQL/command injection, XSS/CSP/origin/CORS/CSRF, deserialization, SSRF, WS/RTC abuse, rate limiting, exhaustion, sharing ACLs, Tauri capabilities, native entitlements/signing/update boundaries, FFI/unsafe, and telemetry/log privacy.
- Scan secrets in current files/history/build artifacts without disclosing values: report redacted location and secret type only.
- Inventory vulnerabilities and licenses separately across npm production/dev, all Cargo targets/locks, Swift/Xcode/CMake, native/vendored libraries, and Apple/AUv3 distribution constraints.

**Pass:** threat model, redacted findings, authorization/isolation evidence, and manifest-complete supply-chain scope.

### A10 — Architecture, reliability, and performance domains A–G

- **A Architecture:** state ownership, dependency direction/cycles, globals, layer violations, redundant abstractions, implicit contracts, resource lifecycles, JS/WASM/Rust/C/Swift boundaries, runtime duplication, API/data compatibility.
- **B Reliability:** swallowed errors, unawaited work, rejection/panic paths, races/deadlocks/reentrancy, cancellation/timeouts, resource release, double init, idempotence, retry storms, cache/transaction/crash recovery, mobile lifecycle, device/audio/network changes, boundary/null/encoding values.
- **C JS/UI performance:** startup flame trace, critical versus secondary work, early-event loss, long tasks, allocations/GC, copies/serialization, data structures, event storms, listeners/timers, eager loads, parsing, invalidation, layout/style work.
- **D Bevy/wgpu/WebGPU:** scheduling/change detection, idle work, frame pacing, batching/draw/overdraw, pipeline/shader work, buffer/texture/bind-group churn, CPU/GPU transfers/readbacks, resource lifetime, matrix previews, device loss.
- **E Rust/WASM/Tauri/native:** boundary copies/serialization, allocations/locks/blocking async work, channels/backpressure, user-reachable panics, FFI/unsafe invariants, pointer/buffer ownership, commands/capabilities, process/window/task lifecycle, binary/WASM features/size.
- **F Realtime audio:** callback allocations, locks, I/O/logs/system calls, graph rebuild, buffer budget, conversions/copies/denormals, sample-rate/buffer/route changes, lock-free queues/backpressure, resource destruction, CPU load, AUv3 interruption/recovery.
- **G Network/sync/persistence:** message order/duplication/loss, idempotence/session resume, heartbeat/timeout/reconnect/backpressure/limits, offline/conflict/history, transactions/migrations/indexes/N+1, IndexedDB/cache invalidation, partial uploads, RTC/socket/track cleanup.

**Pass:** normalized findings linked to measured baselines and real owners; no generic-practice list.

### A11 — Quality, size, debt, dependencies, build, licenses

- Exact/structural/near duplication; competing owners; named component-owner violations; dead exports/files/assets; unused/duplicate dependencies; obsolete compatibility; deprecated APIs; commented code/flags; oversized/mixed-responsibility modules; ambiguous names/constants; stale docs/comments; inconsistent error handling; speculative abstractions.
- Check every touched/suspect legacy surface against the canonical owner and dynamic dependency channels before recommending convergence/removal.
- Recalculate file-size and quality metrics on the A1 product scope.
- Validate risk-selected ownership and entry claims across all four maps.
- Inventory all manifests/lockfiles/targets, version duplication, unnecessary features, reproducibility, obsolete scripts, tracked artifacts, output/debug symbols, maintenance, vulnerabilities, and licenses.

**Pass:** each removal/convergence has multi-channel proof and a validation strategy; no line-count-only or grep-only recommendation.

### A12 — Tests, reproducibility, and observability

- Map executable real-route tests against the Critical paths section; separate unit/integration/E2E/platform tests from mock-only coverage.
- Audit account → project → objects → persistence, modes, Import, Home startup, four-plane integrity, property/fuzz/stress/soak/fault/concurrency tests and representative datasets.
- Measure determinism/flakiness with repeated focused critical tests. A single full-suite run is only a health snapshot; repeated full runs are needed for a flakiness rate when resource-feasible.
- Treat the dated FRAMEWORK_STATE reference of 683/733 with 50 failures as stale evidence to revalidate, never a current result.
- Audit structured logs, levels, correlation IDs, metrics, traces, crash reports, sensitive-data handling, and ability to diagnose real failures.
- Audit CI coverage; the initial snapshot found no workflow file.
- Phase 2 creates no persistent tests. It specifies the smallest red tests for Phase 3.

**Pass:** real-route coverage percentage, repeated-test evidence or explicit limitation, current health snapshot, and prioritized observability/test gaps.

### A13 — Independent validation and synthesis

- Recheck every finding against silent-channel, swallowed-error, canvas, runtime-owner, and stale-map risks.
- Require two independent methods for P0/P1.
- Resolve contradictions, duplicates, common causes, and recommendations that cannot coexist.
- Produce priority × impact × risk × effort and a dependency DAG. The B order remains provisional until this step.
- Define per-lot validation and a non-Git rollback/recovery plan with no fallback/parallel runtime.
- Record healthy decisions to preserve, rejected recommendations, uncertainties, and To verify items.
- Update FRAMEWORK_STATE only with verified factual state/limitations/validation results; never record planned repair as implemented.
- Write the exact 30-section Phase 2 report listed under Phase 2 completion criteria.

**Stop:** present the report at G2. Do not modify product code.

### Mandatory Phase 2 progress report

After each validated A step, report:

~~~text
Progress: <floor(validated completed A steps / 14 * 100)>%
Completed step: <A number and title>
Status: <passed / failed / repaired and passed / blocked>
Evidence: <files, commands, runtime checks, logs, captures, exact proof>
Files inspected: <list>
Files modified: <allowed report/temp files or none>
Tests run: <commands/results or justified none>
Architecture maps checked/updated: <yes/no/not needed + reason>
Remaining steps: <A steps>
Open risks: <none or precise list>
~~~

“Repaired and passed” is normally unavailable in read-only Phase 2 except for the disposable audit harness itself.

## 25. Normalized finding format

Every finding uses this complete schema; non-applicable fields say non applicable.

~~~text
ID: FIND-XXX
Title:
Category: implementation bug / interaction inconsistency / accessibility violation /
  information-architecture defect / incomplete feature / redundant feature /
  redesign hypothesis / reliability / performance / security / debt
User journey:
Exact preconditions:
Expected result:
Observed result:
Exact UI state: panel, mode, selection, focus, viewport, orientation, input:
Observed usability or accessibility problem:
Task measure: duration, actions, errors, backtracks, masked/usable area:
Reproduction frequency: n/N and confidence interval:
Violated invariant:
Logical state before/after/restored:
Priority: P0 / P1 / P2 / P3
Confidence: high / medium / low
Status: confirmed defect / probable risk / debt / measured optimization /
  style preference / redesign hypothesis
Affected components:
Files and lines:
Execution path:
Evidence:
Reproduction or measurement procedure:
Root cause: demonstrated / probable / unknown
Functional impact:
Performance impact:
Security/data impact:
Cross-platform scope:
Canonical correction owner:
Proposed correction:
More conservative alternative:
Design options compared, when relevant:
Expected benefit and validation metric:
Regression risk:
Required red tests:
Dependencies on other findings:
Recommended implementation lot:
Open evidence / To verify:
~~~

Priority is evidence-based:

- P0: corruption/data loss, exploitable vulnerability, systemic crash, or major blocking failure.
- P1: probable instability/leak, strong regression/hot spot, or lost critical user action without feedback.
- P2: significant debt, costly duplication, or measurable inefficiency.
- P3: local/preventive improvement with limited impact.

Severity is never lowered because a fix is difficult. Implementation order may consider probability, breadth, detectability, security/data risk, frequency, resource cost, dependencies, correction risk, and enabling evidence.

Major UX recommendations compare two or three feasible options with benefit, downside, technical/regression risk, relative effort, platform impact, and objective validation. User preference remains unvalidated until a real study.

## 26. Phase 2 completion criteria

Phase 2 is eligible for a **complete** status only when all applicable criteria pass:

1. Import and Home each have reproduction/refutation, timeline, first divergence, demonstrated cause or ranked discriminating hypotheses, rate, and Phase 3 red-test design.
2. The cross-cutting campaign is executed on V/M/P/R; no scenario passes on visible output alone.
3. INV-1–INV-14 are evaluated on all applicable journeys.
4. Required baselines are measured or the overall status is blocked by a named missing capability.
5. The mode matrix and assistant model comparison are complete.
6. AX-1–AX-12 and the unreachable-function list are complete on required runtimes.
7. Threat model, auth/authorization/isolation, hostile import, secret redaction, native boundaries, vulnerabilities, and licenses are covered.
8. Product/non-product/generated/vendor scope is closed and metrics recalculated.
9. Every deletion/convergence claim has multi-channel proof.
10. Every finding uses the full schema and every P0/P1 has two independent evidence methods.
11. The independent false-positive/contradiction pass is complete.
12. Remaining uncertainties and blind spots have smallest validation actions and BLOCKED/To verify status.
13. The Phase 3 DAG, per-lot acceptance, non-Git recovery, and canonical owners are executable.
14. Root/eVe source and real-data state show no unexplained drift; all temp cleanup is proven.
15. Relevant runtime logs contain no unexplained error/warning, or each is a finding/To verify item.

The Phase 2 report contains exactly these 30 core sections:

1. Executive summary.
2. Observed architecture.
3. State model, authorities, and invariants.
4. Baselines and measurement conditions.
5. Executed functional matrix with evidence.
6. Detailed Import and Home timelines.
7. UI/memory/persistence/restoration divergences.
8. Normalized findings.
9. Healthy decisions to preserve.
10. Critical defects.
11. Low-risk quick gains.
12. Measurable optimizations.
13. Demonstrated removals and factorizations.
14. Architectural debt.
15. Security risks.
16. Test and observability gaps.
17. Priority × impact × risk × relative effort matrix.
18. Dependencies between changes.
19. Recommended lot order/DAG.
20. Validation criteria per lot.
21. Non-Git rollback/forward-recovery plan.
22. Rejected items and reasons.
23. Remaining uncertainties and To verify items.
24. Detailed executable Phase 3 plan.
25. UI, information-architecture, and interaction-state map.
26. Assistant audit and display-model comparison.
27. Natural/List/Matrix-Table matrix and simplification/completion recommendations.
28. Feature, discoverability, cognitive-load, and usage-error audit.
29. Accessibility and viewport/input adaptation audit.
30. Prioritized UX recommendations, compared options, and validation criteria.

If a mandatory runtime, physical device, authenticated environment, host, or validation is unavailable, Phase 2 may still deliver a useful report but its final status is **blocked**, not complete, and G2 must state that limitation explicitly.

## 27. Truly blocking questions

No user question is required before G1. Two decisions are resolved by evidence-first defaults:

1. **Project move semantic:** A3 must derive the real contract from current code/docs/runtime. The initial flat-order interpretation is only a hypothesis. If contradictory evidence remains, only T8 is blocked and the exact product decision is requested.
2. **Isolated test environment:** A0 must create and prove a disposable, byte-verified runtime/storage environment under temp/audit/**. If hard-coded or external sinks cannot be contained without production changes, Phase 2 stops at A0 and reports the missing capability; it never touches real data.

**PHASE 1 COMPLETE — AWAITING EXPLICIT VALIDATION BEFORE THE DEEP AUDIT.**

# PHASE 3 — application after G2

The final B-lot DAG is produced by A13. The sequence below is a priority skeleton, not permission to start and not an artificial serial chain.

## Mandatory preflight for every B lot

Before editing, read current rules, applicable maps/docs, known-bug solution, real owners/callers/tests, and issue evidence. Then publish:

~~~text
Task classification: <feature / bug / regression / rendering / media / text /
  matrix / state / interaction / UI / performance / cleanup / API / test / docs>
Applicable rule families: <list>
Canonical owner identified: <yes/no + file/module>
Existing reusable architecture: <files/modules and named component owners>
Files likely to change: <list>
Tests/guardrails to run or create: <list>
Map impact: <none / CODEMAP / API_MAP / DESIGN_MAP / ARCHITECTURE_MAP>
DOM risk: <none / precise risk>
Rendering risk: <none / precise risk>
State mutation risk: <none / precise risk>
Legacy risk: <none / precise risk, including MTrax-to-Molecule check>
Complexity delta: <reduced / unchanged with justification / prohibited increase>
Capacity recovery: <dead/duplicate/dependency/resource/config removal or none with reason>
Decision: <proceed / blocked>
~~~

If the canonical owner is unknown, the decision is blocked. Consuming a named component owner is allowed; writing a second owner is forbidden. If an owner lacks a needed capability, extend that owner with an additive parameter defaulting to existing behavior.

## Mandatory 14-step sequence for every B lot

1. Name approved FIND IDs, scope, owner, dependencies, and acceptance criteria.
2. Capture root/eVe status and preserve unrelated work.
3. Reproduce the issue or baseline on the required real runtime.
4. Capture visible, memory, persistence, restoration, logs, and timeline before change.
5. Add the smallest persistent regression test under tests/** and prove it is red on the old implementation; when automation is genuinely unavailable, define and evidence the narrow manual/physical protocol.
6. Perform the smallest source-level canonical-owner repair. A cohesive refactor required to remove the root cause is part of the repair; unrelated formatting/renaming/optimization is forbidden.
7. Converge/remove touched duplicate, legacy, fallback, obsolete, dead, or retained-resource paths after full dependency proof. Do not leave a TODO or compatibility path.
8. Inspect the filesystem diff for accidental changes, secrets, logs, direct mutation, DOM authority, duplicated owners, oversized touched files, and resource-lifecycle regressions.
9. Run the narrow red test first and make it green.
10. Run the next relevant subsystem tests, syntax/ESM validation, architecture guardrails (at least check:m0 for policy-sensitive work), and required real-interaction scenario/log review.
11. Compare identical before/after metrics; reject an optimization below measured noise.
12. Test boundary/failure/recovery cases and every concerned runtime, including physical-device/host acceptance where required.
13. Update applicable maps in the same lot; update FRAMEWORK_STATE only with verified facts/limitations/results. Remove temp diagnostics and rerun the clean path.
14. Document benefit, remaining risk, non-Git recovery, and present the lot before any major structural next lot.

After each validated numbered step in a B lot, use the exact progress template from module 07 with progress = floor(validated steps / 14 × 100). Failed/unvalidated work does not count.

## Provisional lot skeleton

Every B lot depends on G2 and on the A13 DAG; dependencies below are semantic priorities, not blanket serialization.

| Lot | Scope |
|---|---|
| B0 | Enabling red regression tests for approved P0/P1 findings, with physical/manual exceptions only when proven unavoidable |
| B1 | Corruption, exploitable security, account isolation, systemic crashes |
| B2 | Project/object divergence, data loss, partial operations, broken references |
| B3 | Account → project → import reliability |
| B4 | Home availability and essential-command responsiveness during startup |
| B5 | Assistant workspace blocking, inaccessible actions, major accessibility failures |
| B6 | Natural/List/Matrix-Table coherence, completion, simplification, or evidence-backed convergence |
| B7 | Navigation, feedback, recovery, and critical-journey simplification |
| B8 | Determinism, cancellation, lifecycle, and resource ownership |
| B9 | Approved instrumentation/observability and missing regression coverage needed by later lots |
| B10 | Confirmed leaks and unnecessary idle work |
| B11 | Measured CPU/GPU/audio/network hot paths |
| B12 | Demonstrated dead code, obsolete assets/config, and unnecessary dependencies |
| B13 | Low-risk duplication convergence into named canonical owners |
| B14 | Boundary and responsibility simplification |
| B15 | Deep architectural refactors required by demonstrated root causes |
| B16 | Final cross-map/documentation/CI consistency audit only; it must not defer map or State File updates required in earlier lots |

Compatibility shims, transitional adapters, parallel old/new routes, fallback renderers, and speculative feature flags are forbidden. If a data/API migration is approved, make the canonical migration explicit, deterministic, tested, documented, and recoverable without keeping two authorities alive.

## Global success criteria

- Account creation/session restoration and two-account isolation are reproducible on every applicable required runtime.
- Full project and object lifecycles preserve IDs, relations, properties, order, ownership, assets, history, and restoration.
- Import produces the same business state, pixels, persistence, and restoration from every supported entry/mode/runtime.
- Home commands are never silently lost/blocked by secondary startup work and always provide timely feedback.
- Assistant states retained by evidence allow the intended conversation and project tasks while restoring exact context.
- View-mode roles are clear; differences are intentional; critical operations never disappear arbitrarily.
- Redundant/incomplete/overcomplex features are corrected, converged, completed, hidden, or removed with evidence.
- Navigation, feedback, error recovery, focus/selection/scroll/zoom/draft preservation, inputs, zoom, and accessibility pass approved tasks.
- Import/storage/network/authorization failures are atomic, visible, actionable, and recoverable.
- No known P0 remains untreated; every remaining P1 has an explicit approved decision and plan.
- Applicable focused, subsystem, guardrail, build, and real-runtime tests pass reproducibly with no unexplained error/warning.
- Performance does not regress outside measured noise; every claimed gain is measured on the same baseline.
- Listeners, timers, sockets, media, GPU, caches, queues, and native resources release at explicit lifecycle boundaries.
- Realtime audio constraints hold; idle work is bounded by measured runtime needs.
- Removed code/dependencies are proven unused; factorization reduces ownership/complexity without hiding behavior.
- Public APIs/data remain compatible unless an explicitly approved deterministic migration is complete.
- Canonical state remains outside DOM; commit/commitBatch remains unique; WebGPU/shared canvas remains primary; no fallback/duplicate owner/path exists.
- Applicable maps, FRAMEWORK_STATE, tests, known-bug solution, and maintenance guardrails describe the verified result.
- Missing mandatory device/host/runtime evidence yields final status blocked, never an unqualified completion.

## Mandatory final report for each implementation task

~~~text
Final status: <complete / blocked>
Validated architecture: <summary>
Files modified: <list>
Files created: <list>
Files removed: <list>
Tests run: <commands and results>
Tests created or updated: <list>
Architecture maps updated: <list or none + reason>
DOM budget result: <pass/fail/not in scope + evidence>
WebGPU route result: <pass/fail/not in scope + evidence>
Text service result: <pass/fail/not in scope + evidence>
Matrix preview result: <pass/fail/not in scope + evidence>
Legacy renderer result: <pass/fail/not in scope + evidence>
State mutation result: <pass/fail/not in scope + evidence>
Framework state: <updated / not updated + specific reason>
State File: <path / not updated + reason>
Task outcome: <completed / partially completed / blocked / reverted / no change>
Framework-state summary: <factual summary>
Framework-state uncertainties: <To verify items / none>
Recommended next step: <smallest evidence-based action / none>
Remaining risks: <none or precise list>
Completion claim: <one sentence proving all gates passed>
~~~

## Granularity remediation status at the requested stop — 2026-08-14

This status concerns the separately authorized implementation programme in
`todo/2- Granularity_Validation.md`. It does not approve or bypass G1/G2 for the
total A0-A13 audit described by this file. Execution was stopped at the user's
explicit request after the report below was recorded.

### Current position

```text
active_gate: 11 — real Web to Web acceptance
last_validated_gate: 10
validated_gates: 1, 2, 3, 5, 6, 7, 8, 9, 10
validated_percentage: 45
gate_4: partial — Fastify LAN binding proved, physical iPhone reachability not proved
gate_11: in progress — first real durable property flow passed; full scenario and pixel matrix incomplete
overall_verdict: GRANULARITY VALIDATION: FAIL — corrections required
execution_state: stopped at user request, not completed and not blocked
```

### Work already implemented

1. The controlling granularity specification now contains the 20 gates,
   Web/Tauri/iOS direction matrix, same-account matrix, progressive
   property-scope matrix, latency budgets, acceptance locks, and canonical
   anti-drift checkpoint.
2. QA isolation and repeatable fixture coverage were added for separate owner
   and receiver accounts, projects, shape, text, image, video target, custom
   value, complex value, and exact `left`/`top` shares. The active live QA
   database is `/private/tmp/gv-web-web.db`; it contains disposable QA data
   only and is retained for exact resumption. No production database was used.
3. Canonical property authorization now evaluates every property touched by a
   commit or batch inside the transaction. Mixed allowed/denied writes fail
   atomically, exact property rows do not widen global ACL rows, unsupported
   conditions fail closed, and denial results do not expose protected values.
4. Current-state, event/history, sync, reconnect, export/search-facing, custom,
   and complex-value consumers now use recipient-specific property projection.
   Empty projections are suppressed and revoked permissions are re-evaluated.
5. Property versions, expected-version conflicts, rollback, durable sync queue,
   idempotent event IDs/request IDs, delete/restore, and canonical undo/redo
   were covered and corrected at the existing ADOLE/event/history owners.
6. Obsolete server event/CRUD route ownership was converged into the canonical
   WebSocket event path; application mutation remains on `/ws/api` through
   `commit`/`commitBatch` rather than a new transport or state authority.
7. A newly confirmed realtime defect was corrected: `events:commit` and
   `events:commit-batch` previously persisted successfully but emitted no live
   recipient update. Inserted committed events now emit a durable
   recipient-projected durable event. The current owner is authenticated
   `/ws/sync`; the retired `console-message/share-sync` bridge is forbidden.
   Retries of an already inserted event do not rebroadcast, the source session
   is excluded, and another session of the source account receives the update.
8. The unified WebSocket client now preserves `delete_keys`, property versions,
   event/transaction/gesture identifiers, and the durable marker. A projected
   property deletion forces reconstruction from canonical state instead of
   inventing a local deletion authority.
9. The authenticated workspace handoff was repaired without retaining a
   parallel UI path. Login again closes immediately after the canonical session
   is installed while Dashboard/project preparation continues asynchronously;
   failures remain observable. When a project was prepared behind the neutral
   Dashboard but has no resident surface, the existing canonical
   `loadProjectAtomes` route is forced once to reconstruct it. Explicitly
   retained WebGPU scenes are no longer removed by bulk visual cleanup.

Principal implementation owners touched by this programme include:

- `database/adole.js`, `database/adole_permissions.js`,
  `database/adole_event_contract.js`, `database/adole_event_mutation.js`, and
  `database/adole_sync.js`;
- `server/atomeRoutes.orm.js`, `server/wsAtomeOperations.js`,
  `server/atomePropertySecurity.js`, `server/atomeRealtime.js`,
  `server/atomeHistoryCommands.js`, `server/wsSyncSecurity.js`, and
  `server/sharingPermissionService.js`;
- `atome/src/squirrel/apis/unified/adole_adapter_atome.js` and
  `atome/src/squirrel/apis/unified/adole_websocket_message.js`;
- `eVe/core/atome_commit.js`, `eVe/core/atome_timeline.js`, the extracted
  timeline history owners, `eVe/intuition/runtime/realtime_atome_events_runtime.js`,
  `eVe/intuition/tools/user_workspace_surface_runtime.js`, and
  `eVe/domains/rendering/project_scene_runtime.js`.

The worktree already contained other user changes. The status/diff was inspected
without Git writes; this report does not attribute unrelated modified files to
the granularity programme.

### Executable evidence obtained

- Focused storage/security/history/reconnect/consumer baseline: **24/24 passed**
  across the granularity, property-security, lifecycle, resilience, fixture,
  persistence-boundary, ADOLE invariant, and timeline-history tests recorded in
  the checkpoint of `todo/2- Granularity_Validation.md`.
- Durable realtime/client projection regression set:
  `node --test tests/server/granularity_protocol_defects.probe.mjs tests/eve/adole_commit_boundary.probe.mjs tests/probes/project_render_legacy_sync_runtime.probe.mjs`
  — **19/19 passed**.
- Authenticated workspace handoff set:
  `node --test tests/probes/user_login_workspace_handoff_contract.probe.mjs tests/probes/user_login_boot_order_contract.probe.mjs tests/probes/workspace_dashboard_project_bootstrap_contract.probe.mjs tests/probes/user_workspace_surface_runtime_contract.probe.mjs`
  — **4/4 passed**.
- Unified project-scene rendering contract:
  `npx vitest run tests/eve/project_scene_unified_rendering_contract.test.mjs`
  — **17/17 passed**.
- Real Fastify network proof on three simultaneous `/ws/api` connections:
  one owner sender, one different-user receiver, and one second session of the
  owner. A canonical durable `left` commit produced exactly one projected
  receiver message, exactly one owner-other-session message, zero sender
  echoes, one durable event visible to the receiver, `left=241` after reload,
  and property version `2`. The single observed end-to-end probe was 225 ms;
  it is encouraging but is not the required 20-sample performance result.
- Real UI login was replayed in two browser origins after the handoff repair.
  Both reached the authenticated WebGPU Dashboard through real pointer and
  keyboard actions. Expanding the Projects lane still rendered no project
  cards, so object-level pixel propagation has not yet been accepted.
- Root and eVe `diff --check` passed. The temporary Dashboard diagnostic script
  was removed and the Fastify QA server was stopped cleanly at this checkpoint.

### Exact incomplete scope

- Gate 11 still needs the complete Web-to-Web shape, text, image, video,
  lifecycle, batch, undo/redo, negative-property, concurrency, offline,
  reconnect, reload, network, database, and WebGPU-pixel matrix. The first
  durable `left` case is not sufficient to validate the gate.
- The empty Projects lane after successful login must be isolated at its first
  divergent layer (session identity, project-list projection, Dashboard data
  controller, or WebGPU card projection) before widening UI tests.
- Gate 4 needs a signed physical iPhone reaching the same LAN Fastify instance.
- Gates 12-14 require real Web/Tauri/iOS directional runs; gates 13-14 require
  physical iOS evidence, not a simulator.
- Gate 15 must repeat all seven directions with the same account.
- Gate 16 needs real five-second video capture, poster, audio, persistence,
  remote playback, revocation, and file-integrity evidence.
- Gate 17 needs isolated local-production-local server switching and proof that
  tokens, caches, queues, and databases do not cross server identities.
- Gate 18 needs the final GV-T01-GV-T28 and wider guardrail replay; gate 19 needs
  final maps/contracts/State File convergence; gate 20 needs diagnostic cleanup
  and the complete final matrix replay.
- The required performance distributions (at least 20 samples per class) and
  regression comparisons have not been collected.

### Exact resumption point

Resume the same task at gate 11. Restart Fastify with the retained isolated QA
database, reproduce the empty authenticated Projects lane in one Web session,
and inspect the first divergence between the authenticated session principal,
`api.projects.list`, `loadProjectList`, Dashboard `itemsByCategory`, the mounted
BevyUI tree, and visible pixels. Add the smallest red regression at that owner,
repair it, replay the 24-test baseline, then continue the remaining Web-to-Web
matrix. Do not start Tauri/iOS acceptance or broaden tests until that minimal Web
reproduction is understood.

## Journal

| Date | Item | Status | Evidence/decision |
|---|---|---|---|
| 2026-08-12 | Source identity | Passed | Both supplied source files are byte-identical; one canonical digest retained |
| 2026-08-12 | Plan review and consolidation | Passed | Phase 1 evidence/method absorbed; contradictions corrected; superseded file removed after parity/reference validation |
| 2026-08-12 | G1 | **Pending** | Explicit user approval still required before A0 |
| 2026-08-12 | G2 | **Pending** | Requires the Phase 2 report and approved implementation order |
| 2026-08-14 | Granularity remediation checkpoint | **Stopped by explicit user request at gate 11; 45% validated** | Gates 1,2,3,5-10 green; gate 4 partial; first real Web-to-Web durable property flow green; complete Web pixel matrix and gates 12-20 remain |
| 2026-08-14 | Granularity Gate 12 resumed checkpoint | **Blocked at gate 12; 55% validated** | Blank Tauri UI fixed by default-camera viewport ownership; 781/781 Vitest, 51/51 focused Granularity, 55/55 Tauri, 2/2 topology and cargo check green. Real WKWebView pointer delivery is rejected by macOS and physical iOS hardware remains unavailable, so no gate is overstated. |
