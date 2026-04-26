# Urgent - eVe Cleanup Status And Remaining Work

> Authoritative cleanup list for `src/application/eVe/`.
> Original audit generated 2026-04-25. Updated 2026-04-26 after closing the strict fallback/silent-catch cleanup.
> Canonical reference: `src/application/eVe/eVe_essentials.md`, especially §1.3 and §11.

---

## 0. Rules For The Next Passes

1. **No fallback, no patch, no workaround.** Only `eveT(key, fallback)` and `ui.label_fallback` are allowed.
2. **No replacement shim.** Do not create a `v2`, `_new`, `_clean`, bridge, proxy, or compatibility peer to replace deleted code.
3. **No silent catch.** Empty `catch`, ignored errors, and default values that mask canonical state defects must be audited and removed or converted to explicit typed errors.
4. **One file at a time.** Audit, edit, run verification, then move on.
5. **Ask Jean-Eric whenever intent is ambiguous.** If a value might be canonical UX/default configuration instead of a forbidden fallback, stop and ask before changing behavior.
6. **Respect existing WIP.** `src/application/eVe` is dirty. Do not revert unrelated work, especially the Molecule/WebGPU media runtime changes already present in the worktree.

---

## 1. Done - Remove From The Pending Queue

These items were completed in the current worktree and must not remain in the active todo list.

### 1.1 Completed Before This Pass

- Removed `src/application/eVe/git_utils/`.
- Removed `src/application/eVe/problems_solving/`.
- Removed empty `src/application/eVe/scripts/`.
- Fixed the stale `intuition__2/tools/core/tool_reveal_behavior.js` reference in `src/application/eVe/eVe_essentials.md`.
- Trace: eVe submodule commit `08b515d`.

### 1.2 Completed In The Current Cleanup Pass

- Deleted `src/application/eVe/intuition/runtime/eve_intuition/legacy_engine_runtime.js`.
- Removed `disableLegacyIntuitionEngine` import and both call sites from `src/application/eVe/intuition/eVeIntuition.js`.
- Deleted `clearLegacyToolStickyVisualState(toolEl)` and its call site from `src/application/eVe/intuition/eVeIntuition.js`.
- Deleted `removeLegacyAtomeEditFooterArtifacts()` and all call sites from `src/application/eVe/intuition/eVeIntuition.js`.
- Removed the `RuntimeV2 with legacy fallthrough` branch from `src/application/eVe/intuition/eVeIntuition.js`.
- Removed the `legacyDef` / `fallbackExtraInput` main-ribbon fallback path from `src/application/eVe/intuition/eVeIntuition.js`.
- Removed the orphan `intuition_menu_layer_v2` adoption block from `src/application/eVe/intuition/menu/ui/toolbox_dom.js`.
- Removed legacy layer flattening from `src/application/eVe/intuition/runtime/layer_contract.js`.
- Removed `LEGACY_RECORD_ACTION_STATE_EVENT`, `RECORD_ACTION_LEGACY_KEY`, and legacy read/write/dispatch from `src/application/eVe/intuition/tools/core/record_action_state.js`.
- Removed both `auth_token` migration reads that copied legacy auth into `cloud_auth_token` in `src/application/eVe/core/atome_commit.js`.
- Renamed canonical MTraX media policy symbols:
  - `shouldDisconnectLegacyPlaybackEngine` -> `shouldDisconnectVideoElementPlayback`
  - `shouldUseLegacyVideoElementAudio` -> `shouldUseVideoElementAudio`
  - local `legacyPlaybackSrc` -> `mediaPlaybackSrc`
- Reconnected projection palette behavior in `src/application/eVe/intuition/tools/project_drop.js` to `intuition/tools/core/palette_behavior.js`.
- Removed the obsolete touch fallback path from `src/application/eVe/core/atome_events/project_layer_runtime.js`.
- Removed the test-only `headless_panel_runtime` branch from `src/application/eVe/intuition/tools/core/tool_runtime.js`.
- Removed legacy auth key support for exact `auth_token` and `authToken` in eVe runtime/auth/media/diagnostic paths.
- Corrected stale `intuition__` / `intuition__2` paths in `src/application/eVe/documentations/` and `src/application/eVe/todo/`.
- Removed fake headless runtime behavior from `src/application/eVe/intuition/tools/core/tool_runtime.js`:
  - no synthetic panel success when `document` is unavailable;
  - no fake Finder runtime API;
  - no fake Timeline API;
  - no `headless` result flag in runtime bootstrap responses.
- Deleted the eVe `runtime_*_headless.test.mjs` test files from `src/application/eVe/tests/strangler_v2/`.
- Removed eVe headless test references from `src/application/eVe/tests/run_ai_mcp_corpus_tests.mjs`, `tools/phase9_ui_regression_suite.mjs`, and `tools/phase9_mcp_runtime_suite.mjs`.
- Removed direct registered-handler fallback from `src/application/eVe/intuition/tools/core/tool_interaction.js`.
- Removed direct `perform` registered-handler fallback and `active` -> `touch` fallback from `src/application/eVe/intuition/eVeIntuition.js`.
- Removed old MTraX loop/loop-ghost/ruler-marker reconstruction from `src/application/eVe/domains/mtrax/timeline/group_timeline_load_runtime.js`.
- Removed or renamed non-i18n fallback paths across eVe runtime/tool/MTraX/media modules.
- Removed Finder `state.on` -> `touch` fallback in `src/application/eVe/intuition/tools/core/tool_runtime.js`.
- Removed Finder legacy DOM id `_intuition_find` lookup from `src/application/eVe/intuition/eVeIntuition.js`.
- Removed MTraX persisted-host/group/footer fallback routing from `src/application/eVe/intuition/eVeIntuition.js`.
- Removed selected-media-empty -> MTraX transport fallback from `src/application/eVe/intuition/eVeIntuition.js`.
- Removed synthetic media/capture/audio fallback branches:
  - no hidden input retry after picker failure;
  - no Fastify media fallback after strict local/Tauri failures;
  - no MediaRecorder decode fallback path;
  - no AudioWorklet -> ScriptProcessor fallback;
  - no synthetic waveform or loop-cell text preview fallback.
- Removed fallback project bootstrap from `state_current` when canonical project list is empty.
- Removed drag-end delete fallback in the ribbon; deletion now happens only on the canonical drop path.
- Removed legacy deleted-project filtering fallback for records without source-project metadata.
- Renamed non-i18n fallback symbols to default/strict names where behavior is a canonical default, not a fallback path.
- Silent-catch audit pass 1 completed on priority persistence/runtime/media files:
  - `src/application/eVe/domains/media/api/audio_api.js`
  - `src/application/eVe/domains/media/api/video_api.js`
  - `src/application/eVe/domains/media/api/media_api_shared.js`
  - `src/application/eVe/intuition/tools/core/tool_registry.js`
  - `src/application/eVe/intuition/runtime/tool.js`
  - `src/application/eVe/intuition/runtime/eve_intuition/tool_invocation_runtime.js`
  - `src/application/eVe/intuition/tools/core/tool_runtime.js`
- Converted priority silent `catch` paths to explicit typed failures or visible warnings:
  - media upload/download JSON contract failures now throw typed errors instead of returning `null`;
  - audio upload queue read/write and IndexedDB sync no longer degrade to empty/null state;
  - Tauri binary read failures no longer switch silently to alternate storage;
  - media sync no longer downloads from Fastify after a failed local Tauri probe;
  - project list/set-current/create failures are now explicit;
  - tool registry deferred persistence/auth failures are logged and requeued instead of hidden;
  - persisted tool listing no longer accepts partial `tool`/`panel`/`tool_macro` results;
  - vector/draw/matrix/text runtime API failures no longer fall back to local shadow state;
  - video capture/upload JSON and project reload failures are now explicit or visible.
- Silent-catch audit pass 2 completed on additional persistence/media/runtime files:
  - `src/application/eVe/domains/media/asset_box.js`
  - `src/application/eVe/intuition/tools/communication.js`
  - `src/application/eVe/intuition/runtime/tool_genesis.js`
  - `src/application/eVe/core/atome_commit.js`
  - `src/application/eVe/intuition/tools/activities.js`
  - `src/application/eVe/intuition/tools/finder.js`
- Converted additional silent paths:
  - asset upload JSON parse failure no longer fabricates `{ success: true }`;
  - protected media hydration failures are visible and no longer silently switch to unresolved media;
  - Fastify atome fetch JSON failures are explicit;
  - `tool_genesis` no longer hides text commits, media DOM repair failures, waveform render failures, remote atome JSON failures, or project bootstrap load failures;
  - `Atome.commit` now awaits realtime broadcasts instead of fire-and-forget swallowing broadcast errors;
  - activity and Finder API listing calls no longer degrade to `null`, `[]`, or partial records.
- Silent-catch audit pass 3 completed on upload/import JSON contracts:
  - `src/application/eVe/intuition/tools/user.js`
  - `src/application/eVe/intuition/tools/imports_exports/index.js`
- Invalid upload/import/export JSON responses now fail explicitly instead of producing `{ success: true }` or `{}`.
- Requested perimeter silent-catch audit completed:
  - `src/application/eVe/domains/mtrax/**`
  - `src/application/eVe/intuition/eVeIntuition.js`
  - `src/application/eVe/intuition/tools/project_bootstrap.js`
  - `src/application/eVe/intuition/tools/project_drop.js`
  - `src/application/eVe/intuition/matrix/core/matrix_runtime.js`
  - `src/application/eVe/intuition/matrix/core/project_data.js`
- Converted the requested perimeter's dangerous silent paths to explicit failures or visible warnings:
  - project bootstrap now reports auth, load, seed, set-current, migration, persistence, and active-project sync failures;
  - project projection/drop async handlers now report tool click and shortcut-scope migration failures;
  - matrix current-project persistence, active-project sync, project refresh, preview capture, and previous-slot sync failures are visible;
  - MTraX native/core/deletion/frame/runtime playback failures no longer return hidden `null` or swallow command failures;
  - eVeIntuition empty-text cleanup, size-module loading, footer record actions, detail preload, group transport/media play, MTraX cleanup commit, and native debug logging failures are visible or typed.
- The dangerous-pattern scan over the requested perimeter now returns no hits:

```sh
rg -n "json\(\)\.catch|\.catch\(\(\) => null\)|\.catch\(\(\) => \[\]\)|\.catch\(\(\) => \{ \}\)|catch\s*\([^)]*\)\s*\{\s*return\s+(null|\[\]|\{\}|false|true)" \
  src/application/eVe/domains/mtrax \
  src/application/eVe/intuition/eVeIntuition.js \
  src/application/eVe/intuition/tools/project_bootstrap.js \
  src/application/eVe/intuition/tools/project_drop.js \
  src/application/eVe/intuition/matrix/core \
  -g "*.js" -g "*.mjs" -g "*.cjs"
```
- Final strict silent-catch cleanup completed outside the requested perimeter:
  - `src/application/eVe/elements/design.js`
  - `src/application/eVe/core/media_engine/molecule.js`
  - `src/application/eVe/core/atome_events/selection_bootstrap_runtime.js`
  - `src/application/eVe/intuition/runtime/selection.js`
  - `src/application/eVe/intuition/tools/communication.js`
  - `src/application/eVe/intuition/tools/detail.js`
  - `src/application/eVe/intuition/tools/debug.js`
  - `src/application/eVe/intuition/tools/user.js`
  - `src/application/eVe/intuition/tools/infos.js`
  - `src/application/eVe/intuition/tools/mtrack.js`
  - `src/application/eVe/intuition/tools/capture.js`
  - `src/application/eVe/intuition/tools/perform.js`
  - `src/application/eVe/intuition/tools/contact.js`
  - `src/application/eVe/intuition/tools/core/mtrax_renderer_webgpu_adapter.js`
  - `src/application/eVe/intuition/tools/core/svg_vector_edit_runtime.js`
- Converted the final strict hits to explicit warnings, typed failures, or explicit non-success state:
  - notification persistence/load/action errors are visible or fail the action explicitly;
  - selection gateway dispatch failures are visible;
  - media/video prime/render/decode failures no longer return hidden `null`;
  - MTraX clone descriptor creation and playback frame chain failures are visible or return explicit errors;
  - SVG vector edit commit failures are recorded in runtime state and logged;
  - contact/import/info/debug/capture/perform async handlers no longer swallow failures.
- Final strict dangerous-pattern scan over `src/application/eVe` now returns no hits:

```sh
rg -n "json\(\)\.catch|\.catch\(\(\) => null\)|\.catch\(\(\) => \[\]\)|\.catch\(\(\) => \{ \}\)|catch\s*\([^)]*\)\s*\{\s*return\s+(null|\[\]|\{\}|false|true)" src/application/eVe -g "*.js" -g "*.mjs" -g "*.cjs"
```

### 1.3 Verification Already Run

- `node check-syntax.mjs` -> OK.
- `npm run check:palette-ssot` -> OK.
- `npm run check:no-fallbacks` -> OK.
- `node src/application/eVe/tests/strangler_v2/gateway.test.mjs` -> OK.
- `node src/application/eVe/tests/strangler_v2/runtime.test.mjs` -> OK.
- `node tools/phase9_ui_regression_suite.mjs` -> OK, 5/5 non-headless tests.
- `node tools/phase9_mcp_runtime_suite.mjs` -> 3/4 OK after removing the eVe headless test from this suite. Remaining failure is outside eVe: `src/squirrel/ai/default_tools.runtime_bridge.test.mjs`, assertion `bank.transactions should expose normalized transactions`.
- Latest pass verification:
  - `node check-syntax.mjs` -> OK.
  - `npm run check:palette-ssot` -> OK.
  - `npm run check:no-fallbacks` -> OK.
  - `node src/application/eVe/tests/strangler_v2/gateway.test.mjs` -> OK.
  - `node src/application/eVe/tests/strangler_v2/runtime.test.mjs` -> OK.
  - `node src/application/eVe/intuition/tools/core/tool_runtime.finder_inline_open_guard.test.mjs` -> OK.
  - `node tools/phase9_ui_regression_suite.mjs` -> OK, 5/5.
  - `git diff --check` -> OK.
  - `git -C src/application/eVe diff --check` -> OK.
  - `node tools/phase9_mcp_runtime_suite.mjs` -> 3/4 OK; same non-eVe `bank.transactions` failure remains.
- Silent-catch pass 1 verification:
  - `node --check` on modified priority files -> OK.
  - `node src/application/eVe/intuition/tools/core/tool_registry.strict_persistence.test.mjs` -> OK.
  - `node src/application/eVe/intuition/tools/core/tool_registry.deferred_persistence.test.mjs` -> OK.
  - `node src/application/eVe/intuition/tools/core/tool_runtime.finder_inline_open_guard.test.mjs` -> OK.
  - `node check-syntax.mjs` -> OK, 1033 files.
  - `npm run check:no-fallbacks` -> OK.
  - `npm run check:palette-ssot` -> OK.
  - `node src/application/eVe/tests/strangler_v2/gateway.test.mjs` -> OK.
  - `node src/application/eVe/tests/strangler_v2/runtime.test.mjs` -> OK.
  - `node tools/phase9_ui_regression_suite.mjs` -> OK, 5/5.
  - `node tools/phase9_mcp_runtime_suite.mjs` -> 3/4 OK; same non-eVe `bank.transactions` failure remains.
- Silent-catch pass 2 verification:
  - `node --check` on modified files -> OK.
  - `node check-syntax.mjs` -> OK, 1033 files.
  - `npm run check:no-fallbacks` -> OK.
  - `npm run check:palette-ssot` -> OK.
  - `node src/application/eVe/tests/strangler_v2/gateway.test.mjs` -> OK.
  - `node src/application/eVe/tests/strangler_v2/runtime.test.mjs` -> OK.
  - `node tools/phase9_ui_regression_suite.mjs` -> OK, 5/5.
  - `git diff --check` -> OK.
  - `git -C src/application/eVe diff --check` -> OK.
- Silent-catch pass 3 verification:
  - `node --check` on modified files -> OK.
  - `node check-syntax.mjs` -> OK, 1033 files.
  - `npm run check:no-fallbacks` -> OK.
  - `node src/application/eVe/tests/strangler_v2/gateway.test.mjs` -> OK.
  - `node src/application/eVe/tests/strangler_v2/runtime.test.mjs` -> OK.
  - `git diff --check` -> OK.
  - `git -C src/application/eVe diff --check` -> OK.
- Requested perimeter pass verification:
  - dangerous-pattern scan over `domains/mtrax/**`, `eVeIntuition.js`, `project_bootstrap.js`, `project_drop.js`, and `matrix/core/**` -> OK, no hits.
  - broad dangerous-pattern scan over `src/application/eVe` -> 34 hits still requiring audit outside the requested perimeter.
  - `node check-syntax.mjs` -> OK, 1033 files.
  - `npm run check:no-fallbacks` -> OK.
  - `npm run check:palette-ssot` -> OK.
  - `node src/application/eVe/tests/strangler_v2/gateway.test.mjs` -> OK.
  - `node src/application/eVe/tests/strangler_v2/runtime.test.mjs` -> OK.
  - `node tools/phase9_ui_regression_suite.mjs` -> OK, 5/5.
  - `git diff --check` -> OK.
  - `git -C src/application/eVe diff --check` -> OK.
  - `node tools/phase9_mcp_runtime_suite.mjs` -> 3/4 OK; same non-eVe `bank.transactions` failure remains.
- Final strict cleanup verification:
  - strict dangerous-pattern scan over `src/application/eVe` -> OK, no hits.
  - `node check-syntax.mjs` -> OK, 1033 files.
  - `npm run check:no-fallbacks` -> OK.
  - `npm run check:palette-ssot` -> OK.
  - `node src/application/eVe/tests/strangler_v2/gateway.test.mjs` -> OK.
  - `node src/application/eVe/tests/strangler_v2/runtime.test.mjs` -> OK.
  - `node tools/phase9_ui_regression_suite.mjs` -> OK, 5/5.
  - `git diff --check` -> OK.
  - `git -C src/application/eVe diff --check` -> OK.
  - `node tools/phase9_mcp_runtime_suite.mjs` -> 3/4 OK; same non-eVe `bank.transactions` failure remains.

### 1.4 Confirmed Gone

The following searches now return no hits in `src/application/eVe`:

```sh
rg -n "legacy_engine_runtime|disableLegacyIntuitionEngine|clearLegacyToolStickyVisualState|removeLegacyAtomeEditFooterArtifacts|LEGACY_DIRECT_LAYER_IDS|flattenLegacyIntuition|LEGACY_RECORD_ACTION_STATE_EVENT|RECORD_ACTION_LEGACY_KEY|eve:detail-record-state|__eveDetailRecordActionState__|LegacyPlaybackEngine|LegacyVideoElementAudio|legacyPlaybackSrc|legacy fallthrough|fallbackExtraInput|legacyDef" src/application/eVe
rg -n "'auth_token'|\"auth_token\"|authToken|touchFallback|applyBackgroundSelectionFallback|touchend_fallback|headless_panel_runtime|direct_registered_handler|direct_fallback|perform_direct_fallback|intuition__2|intuition__/" src/application/eVe
```

---

## 2. Fallback Purge Status

Current audit snapshot from 2026-04-26 after cleanup:

- JS/MJS/CJS files still containing `fallback`: **23**
- JS/MJS/CJS textual `fallback` occurrences: **167**
- Residual hits are intentionally preserved i18n/display-contract occurrences:
  - `eveT(key, fallback)` and related display text defaults.
  - `eveTList(key, fallback)`.
  - `ui.label_fallback` / `label_fallback` in the tool registry contract and tests.
  - `elements/design/i18n_bindings.js` binding parameters and `data-eve-i18n-*Default` reads.

Do **not** remove these without a separate i18n schema migration.

Run this before each pass:

```sh
cd src/application/eVe
rg -i -c "fallback" . -g "*.js" -g "*.mjs" -g "*.cjs" | sort -t: -k2,2nr
```

### 2.1 Residual Allowed Files

The current residual set is expected:

- `i18n/i18n.js`, `i18n/languages.js`.
- `elements/design.js`, `elements/design/i18n_bindings.js`.
- UI modules with literal display defaults, e.g. `intuition/tools/communication.js`, `user.js`, `background.js`, `undo.js`, `calendar.js`, `map.js`.
- Tool registry contract files containing `label_fallback`.

Rule: i18n fallback is allowed only when it is strictly display text. If a future hit controls runtime behavior, persistence, media routing, auth, project selection, or transport routing, it is forbidden.

---

## 3. Silent Catch Audit Status

The raw `catch` inventory is large: **2022** matching lines in JS/MJS/CJS files.

The stricter dangerous-pattern audit is now down to **0** hits in `src/application/eVe`.

The remaining broad raw catches are cleanup-only or diagnostic candidates such as DOM `remove()`, `disconnect()`, `revokeObjectURL()`, `pause()`, `focus()`, pointer capture release, debug logging, and teardown paths. They are not active fallback/persistence/runtime/sync/media masking paths.

Do not remove them mechanically. Classify each catch as:

1. **Forbidden:** hides a canonical failure, returns success, or switches to another path.
2. **Allowed cleanup-only candidate:** DOM cleanup, `remove()`, `disconnect()`, `revokeObjectURL()`, `pause()`, `preventDefault()` best-effort cleanup. These still need review, but they may be acceptable if failure is irrelevant and cannot corrupt state.
3. **Needs typed error:** storage, auth, command bus, runtime invocation, media loading, persistence, registry mutation, sync, or project state.

No active strict silent-catch task remains in this file.

---

## 4. Decisions Resolved

Jean-Eric confirmed:

1. Correct stale documentation paths.
2. Remove exact legacy auth keys `auth_token` and `authToken`.
3. Treat `touchFallback*` as obsolete and delete it.
4. Do not maintain old MTraX project fallbacks during tests; clean code only.
5. Rename display helper names that contain `Fallback` when they are not the explicit `eveT(key, fallback)` / `ui.label_fallback` exception.
6. Remove test-only headless runtime behavior from production runtime.

## 5. User Decisions Required Before Editing

Ask Jean-Eric before changing these if encountered:

1. Whether low-level best-effort cleanup catches (`remove`, `disconnect`, `revokeObjectURL`, `pause`) must also become typed failures.
2. Whether old `todo/` documents that describe obsolete plans should be deleted rather than corrected.
3. Whether top-level Playwright probe utilities under `tools/headless_*.mjs` are also in deletion scope, or whether the headless deletion scope is limited to eVe runtime/tests.

---

## 6. Execution Order From Here

Fallback purge is complete under Jean-Eric's i18n exception.

No active fallback or strict dangerous silent-catch cleanup remains for `src/application/eVe`.

Keep `phase9_mcp_runtime_suite` caveat tracked as outside eVe until the Squirrel `bank.transactions` test is fixed.

Verification after each edited file:

```sh
node check-syntax.mjs
npm run check:palette-ssot
npm run check:no-fallbacks
node tools/phase9_mcp_runtime_suite.mjs
```

Known verification caveats:

- `tools/phase9_mcp_runtime_suite.mjs` currently has one non-eVe failure in `src/squirrel/ai/default_tools.runtime_bridge.test.mjs` on `bank.transactions`.
- Headless eVe runtime probes/tests are deleted or removed from eVe suite references after Jean-Eric confirmed headless is test-only and should be removed.

---

## 7. Acceptance Criteria

The cleanup is complete only when:

- `rg -i "fallback" src/application/eVe -g "*.js" -g "*.mjs" -g "*.cjs"` returns only i18n-display exceptions.
- Every residual `fallback` hit is documented as either `eveT(key, fallback)`, `ui.label_fallback`, or an agreed display-only i18n helper.
- No legacy auth token read remains unless explicitly approved.
- No Runtime V2 dispatch can fall through to legacy registries.
- No transitional DOM/layer/menu migration helper remains.
- Silent catches in persistence/auth/runtime/sync/media paths are removed or converted to typed failures.
- Strict dangerous silent-catch scan returns no hits.
- Required probes pass, except separately documented failures outside the eVe cleanup scope.
