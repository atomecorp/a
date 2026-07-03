# Spring Cleaning — Raw Performance, Memory, Reactivity & Dead-Code Removal

Status: PLANNED — audit completed 2026-07-02, no code changed yet.
Scope: `./atome`, `./eVe`, `./server`, `./database`, `./platforms`.
Excluded from cleanup: demo/example/test fixtures (`atome/src/application/examples`, `*.test.mjs` content, `eVe/tests`, `tests/`), vendored third-party code (see F3), build artifacts (`platforms/desktop-tauri/target`, `dist`, `build`), and `eVe/R&D/` (**do not touch**), and ALL of `atome/src/application/**` (**user decision 2026-07-02: ignore entirely** — lyrix/jeezs/aBox/av_contracts/vie).

Rule set: `.codex/AGENTS.md` + modules 01/02/04/07 apply to every task below. Git is read-only. Temporary probes go in `./temp` only. Every structural change updates `maps/CODEMAP.md` / `maps/API_MAP.md` / `maps/ARCHITECTURE_MAP.md` in the same task.

Related existing plans (do not duplicate, continue them):
- `done/optimisations.md` — boot/WASM perf plan, 17/20 done. Remaining items are carried into section B here.
- `todo/cleanup_architecture/file_size_and_coding_standards_remediation.md` — file-size remediation; section D here is its updated, measured worklist.

## Audit method (reproducible)

- Line counts: `find … | xargs wc -l` over `.js/.mjs/.rs/.swift`, excluding node_modules/target/examples/wasm/tests.
- Dead-file detection: `temp/dead_file_scan.mjs` (basename-reference scan over all js/html/json/rs/swift/sh haystacks; 1105 source files scanned, 7 orphans found, each manually confirmed — only matches were `target/` build fingerprints).
- Perf baseline: `temp/perf_baseline_probe.mjs` + opt-in collector `?perf=1` → `window.__squirrelPerf` (see `done/optimisations.md`).
- Validation ladder for every task: `node --check` per touched file → ESM link of the real entry (`node --input-type=module -e "await import('…/spark.js')"` style, catches cross-module export breaks) → real browser boot probe on `:3001` (`tests/probes/project_scene_canvas_regression_probe.test.mjs`, expect 0 console errors, stable luma) → targeted feature probe when a domain is touched. Never validate with a probe that passes by construction; reproduce the real mechanism (red first).

---

## A — Dead code & junk removal (P0, quick wins, zero-risk after verification)

Each deletion: re-grep the basename AND the export names across js/html/json/rs/swift/sh, then run the validation ladder. Delete outright — no dormant backups, no commented-out remains.

- [x] **A1** DONE — deleted `tone.min.js` + `tone.min.js.map` + `Tone.js.map` (~4.1 MB), 0 refs + `atome/src/js/tone.min.js.map` + `atome/src/js/Tone.js.map` (~4.1 MB). Zero references outside build fingerprints. Also remove any Tone mention from install/package scripts if present.
- [x] **A2** DONE — deleted `inline_edit_close_overlay.js`.
- [x] **A3** DONE — deleted `background_random_runtime.js`.
- [x] **A4** DONE — deleted `in_flight_lock.js`.
- [x] **A5** DONE — deleted `tool_strip.js`.
- [x] **A6** DONE — deleted `demo.example.js`.
- [~] **A7** SKIPPED — `settings_old.svg` is referenced by `atome/src/application/examples/testSVGSize.js` (an example). Kept to avoid breaking an out-of-scope example.
- [x] **A8** DONE — deleted 3 `Cargo.toml.orig` patch leftovers (junk debris, not vendored source).
- [x] **A9** DONE — moved `Failed/file.md` → `done/failed_video_poster_attempt.md`, `resume_…finder.md` → `done/resume_tool_code_finder.md`, removed empty `Failed/`. Kept `check-syntax.mjs` (used by package.json).
- [x] **A10** ~~Archive `eVe/R&D/`~~ — **CLOSED, user decision 2026-07-02: `eVe/R&D/` must not be touched.** It stays in place as-is (nothing in it is imported by runtime code, so it has no perf impact; it is only excluded from packaged bundles via B4, which does not modify the folder).
- [ ] **A11** DEFERRED to end-of-effort — `temp/` still holds active migration/scan scripts (`_coloc_list.txt`, `dead_file_scan.mjs`, `migrate_colocated_tests.mjs`) needed while work continues.
- [x] **A12** DONE — re-scan found 3 candidates, all FALSE positives: `auv3_host_playback.js` + `flower_menu_layout.js` are referenced by relocated tests under `tests/` (scan haystack excludes `tests/`); `rollup.config.js` is vendored (F3, out of scope). No second-order deletions.

## B — Raw performance (P1)

Carried context from `done/optimisations.md`: WASM already 19.7→10.45 MB (2.72 MB brotli on wire), static precompression done, SW WASM cache done, boot parallelized, THREE removed. Baseline cold Dashboard open ≈ 5 s = boot 0.8 + eVe 0.64 + WASM compile ~1.0 + **GPU texture upload 1.8 s (~82 uploads × ~22 ms)**.

- [ ] **B1** **Texture dedup + atlas in the Bevy renderer** — the single biggest remaining lever (1.8 s, proportional to spawn count, proven not to be pipeline compile). Steps: (1) instrument `render_ops.rs`/texture path to log distinct texture hashes for a Dashboard open; (2) if duplicates exist, add content-hash dedup in the texture cache (cheap, measurable win); (3) only then evaluate a real atlas for record thumbnails (deep renderer work, deterministic-contract review required, dedicated at-rest measurement session before/after). Owner files: `atome/renderers/bevy-core/src/render_ops.rs`, `platforms/web/bevy-renderer/`, JS side `eVe/domains/rendering/bevy_web_renderer_runtime.js`.
- [ ] **B2** Profile the DOM-path panels individually (former T3.1/T3.2/T3.4: panels / Flower / Molecule) using the already-emitted `*.open_panel` perf events (`?perf=1`), machine at rest. Produce a table (panel → ms) and only then decide optimizations. No blind optimization.
- [x] **B3** DONE + validated (2026-07-02). Installed `@fastify/compress@8.3.1` (fastify-5 compatible), registered global after CORS in `server/server.js` with `threshold: 1024`, `encodings: ['br','gzip']`. Booted the real server on a test port (127.0.0.1:3999) — boots clean, DB connected. Validated: small responses (`/health` 166 B, `/__whoami` 706 B) stay UNCOMPRESSED (threshold correct); large JSON compresses brotli (standalone probe same config: 23990 B → **632 B, -97%**, `content-encoding: br`); static JS/CSS now brotli-encoded on the fly. NOTE: I CAN boot the fastify server in node here, so server-side items (C2 pino, D1/D2 splits) are NOT infra-gated — validatable by real boot + curl.
- [~] **B4** PARTIAL DONE (2026-07-02). Added a conservative exclude filter to `copyDirectory` in `scripts/package-app.js` (`SKIP_DIR_NAMES`=node_modules/target/.git; `SKIP_FILE_EXTS`=.map/.rs/.md/.orig/.lock; +`.test.mjs`/.DS_Store). Probe `temp/_pkg_exclude_probe.mjs` verified: strips **5.5 MB** (rs 2.1, map 1.8, md 1.4) from the atome/+eVe copies with **0 runtime asset (.js/.css/.html/.wasm/.json/img/font) dropped**. CORRECTION to the original hypothesis: the flat copies (js/assets/css/squirrel/application) are NOT redundant with the `atome/` copy — the generated `index.html` loads the FLAT paths (`css/…`, `js/…`, `squirrel/spark.js`, `application/index.js`) while `atome/` serves deep relative imports. Removing either breaks resolution. DEFERRED (needs packaged-PWA boot to validate): the real byte duplication (assets copied flat AND under `atome/src/assets`) — requires restructuring index.html paths, cannot validate without booting the PWA.
- [x] **B5** REVERTED (2026-07-02) — DO NOT convert JSON deep-clone to `structuredClone` here. The 20-site conversion caused a real boot regression: `DataCloneError: The object can not be cloned` at `eVe.js:76` (module_load_failed). Root cause: menu/tool model clone sites (`menu/index.js`, `ribbon/menu_model.js`, `toolbox_runtime_model.js`, `group_state_runtime.js`) clone payloads that CARRY FUNCTION references (handlers/factories); `JSON.parse(JSON.stringify)` silently strips them (a load-bearing data-only-snapshot semantic the code relies on), while `structuredClone` throws. All 20 sites reverted to `JSON.parse(JSON.stringify)`; 0 residual, boot restored. LESSON: the JSON round-trip's function-stripping is intentional behavior at these sites, not an inefficiency. Micro-opt not worth a semantic change. Leave B5 closed as WON'T-DO.
## C — Memory & reactivity (P1)

- [x] **C1** DONE — audited (2026-07-02). **No real setInterval leak in the main atome/eVe runtime.** Inflated counts were `typeof setInterval !== 'function'` guards (defensive) and an autocomplete word list (`console_builder.js` — false positive). `user/background.js` clears before re-creating; `perform_preference_runtime.js` guards against duplicates + clears. `audio_api.js` upload-sync is a legit app-lifetime daemon (dies on unload; must NOT be visibility-gated — uploads continue in background). Only uncleaned intervals are in the secondary `lyrix` app (`lowTrafficMode.js`, `storageIntegrity.js`) — deferred with the rest of lyrix (D9). No change needed = interval hygiene already clean.
- [~] **C2** DEFERRED (scoped 2026-07-02) — the 134 server `console.log` are OPERATIONAL logs (auth events, user CRUD, boot, DB) not debug debris, so they convert to the existing pino `logger` (server.js:1017), not delete. But pino is local to server.js; auth.js/sharing.js/etc. have no logger handle → needs a shared logger module threaded through all server files + a server-boot validation (Content path). Real refactor, carved out to its own batch. Lower perf priority than it looks: most are one-time startup logs; only the auth request-path ones (register/list) cost sync-log latency.
- [ ] **C3** Listener-leak pass on panel open/close paths (combine with B2 profiling): open/close each tool panel 20× under the perf collector and assert stable listener counts (`getEventListeners` via CDP probe) and stable heap (three GC-separated snapshots). Fix owners, not symptoms.
- [ ] **C4** Renderer-side memory: verify the Bevy texture cache evicts on project close (dashboard→project→dashboard cycle ×10, watch `performance.memory` + WASM heap). If it only grows, add explicit release on scene teardown in `render_ops.rs`.

## SESSION PROGRESS 2026-07-02 (server-file decomposition, all boot-validated on :3999)

FULLY DONE (all modules <500, SERVER UP + healthz + no runtime errors):
- **userFiles.js** 646→414 (+file_types 65, user_files_sharing 87, user_files_message_api 113)
- **sharing.js** 1335→404 (+sharing_requests 376, sharing_recipients 192, sharing_message_api 448)
- **visio.js** 858→299 (+visio_helpers 64, visio_ws_handler 302, visio_routes 227) — ctx-injection pattern

IN PROGRESS:
- **auth.js** 2470→**1859** so far: extracted `auth_crypto.js` (57, stateless primitives) + `auth_users.js` (586, user CRUD). Boot-validated incl. anonymous-user init. REMAINING to reach <500: split the 1500-line `registerAuthRoutes` into route-group modules (login/otp/session/admin) + extract session/otp helpers + trim auth_users(586) by ~90. ~5-6 more boot-validated extractions.
- **server.js** 5327→**4979** IN PROGRESS: 6 helper modules extracted (server_media 110, server_utils 102, server_version 77, server_logger 51, server_dedup 56), all boot-validated. Found + fixed **2 latent WS-runtime bugs** (WS_FILE_CHUNK_* consts + wsRecentRequestIds WeakMap left behind in server.js — boot passed but the moved functions would throw at WS-runtime; caught by post-extraction reference audit, NOT by boot). This PROVES the 2500-line `/ws/api` atome-sync handler is high-risk to extract: boot can't validate WS runtime, needs a WS-client test. Remaining: upload/download helpers (uploadsDir/projectRoot entangled), route groups, and the WS handler (careful, WS-client-validated pass).
- **adole.js** 2032 — cohesive mutation pipeline (3 modules already extracted); further split = interface design.

Lesson this session: moving functions between modules, shared module-level constants (REFRESH_SESSION_PARTICLE_KEY, ANONYMOUS_*) they reference must move/import too — boot catches each as a runtime ReferenceError, iterate.

## D — File-size compliance (>500 lines, rule module 02) (P2)

Recipes already proven in this repo: RF-02 extraction (`createXRuntime(deps)` factory + module-scope deps-completeness guard + anti-TDZ placement + mandatory boot probe) and the shared-`ctx` controller for cyclic god-modules (`Object.assign(ctx, createX(ctx))`, used to cut background.js 1443→173 and audio_api.js 1611→216). Split along stable responsibilities only — no pass-through micro-modules.

Priority order = hottest/most-touched first:

- [ ] **D1** `server/server.js` — 5317 lines. Extract per route family into fastify plugins (auth wiring, static/caching, WS, atome sync, mail, shell, identity are already partially separate files — finish the job: `server.js` should be bootstrap + plugin registration only, target <300).
- [x] **D2** DONE — `server/auth.js` 2470 → 12 modules all <500 (auth 231 + crypto/users/particles/otp/sessions + 6 route-group modules), boot-validated with real handler execution (check-phone, server/status, /health).
- [~] **D3** PARTIAL DONE + reasoned boundary (2026-07-02). Extracted 3 clean peripheral modules from `adole.js`, each validated (API IDENTICAL on 80 named + 80 default exports, functional probe `temp/_adole_functional_probe.mjs` green on a temp sqlite: create→particles→history→events→state→snapshot→sync):
  - `adole_db_core.js` (96 L) — db state + `query` + json helpers + transactions + init (shared ESM singleton foundation).
  - `adole_sync.js` (129 L) — sync_state + durable sync_queue, `createAdoleSyncApi({getAtome})`.
  - `adole_snapshots.js` (129 L) — legacy snapshots, restore via canonical `appendEvent`, `createAdoleSnapshotsApi({getAtome, appendEvent})`.
  - **adole.js: 2320 → 2032 lines (-288).**
  REASONED STOP: the remaining ~2032 L is the COHESIVE canonical mutation pipeline. Measured coupling: the shared mutation core (`upsertAtomeFromEvent`/`upsertStateCurrentFromMutation`) calls `setParticle`/`setParticles` (5×), and particle/atome/event sections call back into projection — a mutually-coupled cluster, ONE responsibility. Splitting it further needs a dedicated interface-design task (define atome-store / particle-store / event-log / projection contracts), NOT a mechanical extraction — forcing it would require fragile circular dependency injection and fragment a genuinely cohesive unit (rule 02 forbids artificial fragmentation). This is the documented reason + intended reduction plan the >800-line rule requires. Pattern proven & reusable (foundation + factory + facade + functional probe) for D1/D2/D4.
- [x] **D4** DONE for cleanly-decomposable server modules; visio.js needs DI. All boot-validated (SERVER UP, healthz 200, no cycles):
  - **`userFiles.js` 646→414** → +`file_types.js`(65), `user_files_sharing.js`(87), `user_files_message_api.js`(113). All <500.
  - **`sharing.js` 1335→404** → +`sharing_requests.js`(376), `sharing_recipients.js`(192), `sharing_message_api.js`(448). All 4 <500. Clean one-way deps toward sharing.js (base), dispatcher/requests/recipients split by responsibility.
  - **`visio.js` 858 NOT split**: it is a single 790-line `createVisioService` factory closure (WebRTC/mediasoup, shared rooms/peers/transports state). Needs DI decomposition (ctx-controller pattern), not a mechanical extraction — a subtle DI error would break video calls invisibly to boot. Deferred to a dedicated pass like server.js/auth.js.
- [ ] **D5** `platforms/desktop-tauri/src/server/mod.rs` — 5764 lines, `local_atome.rs` 3736, `local_auth.rs` 1717. Split into Rust submodules mirroring the JS server's route families (keeps the JS↔Rust parity reviewable, see E4). `cargo check` + tauri boot after each extraction.
- [ ] **D6** iOS Swift: `LocalHTTPServer.swift` 3364, `WebViewManager.swift` 1461, `AppNativeMediaCaptureController.swift` 1404, `ViewController.swift` 1037, `FileSystemBridge.swift` 905, `iCloudFileManager.swift` 901. Requires Xcode to validate — batch into one dedicated session (ties into former T4.3 iOS boot compliance).
- [ ] **D7** eVe: 40 files ≥480 lines (many parked at 499/500 by earlier RF-02 passes — compliant but at the ceiling). Above 500 today: `domains/rendering/bevy_web_renderer_runtime.js` 587, `domains/media/asset_box_upload_transport.js` 554, `domains/rendering/bevy_media_texture_resolver.js` 510, `domains/dashboard/dashboard_records.js` 509, `intuition/tools/contact_model.js` 505. Reduce those five below 500; leave the 499s alone unless touched by another task (then they inherit the obligation).
- [ ] **D8** `atome/src/squirrel/contacts/service.js` (510) only — `av_contracts.js` is under atome/src/application → OUT OF SCOPE.
- [x] **D9** OUT OF SCOPE (user decision 2026-07-02: ignore all `atome/src/application/**` — lyrix, jeezs, aBox, av_contracts, vie).

## E — Factorization & redundancy (P2)

- [x] **E1** AUDITED — NOT duplication (2026-07-02). `connector_contract.js` ×4 (4 distinct md5), `bootstrap.js` ×6 (6 distinct md5), `icloud_connector.js` ×2 (598/712 diff lines) are all DOMAIN-DIVERGENT (bank=powens read-only, calendar=caldav read-write, mail=mailbox logic…). Parallel file naming is a clean per-domain module convention, NOT copy-paste. Rule: do not force-merge real divergence → NO MERGE.
- [x] **E2** AUDITED — NOT duplication. kernel/errors.js = `KERNEL_ERROR_CODES` (timeline/track/clip validation); session/errors.js = session-lifecycle errors. Distinct error domains → NO MERGE.
- [x] **E3** AUDITED — NOT duplication. design/button.js = styled UI button factory (eveTokens/presets/i18n, 324 L); projection/button.js = intuition-X projection tool button (RIBBON_TOKENS/slider/projection state, 277 L). 549/601 diff lines, distinct responsibilities → NO MERGE. `updateStyle` seam noted for any future style change.
- [ ] **E4** JS server ↔ Rust local server duplication (`server/*.js` vs `platforms/desktop-tauri/src/server/*.rs`) is **by design** (offline parity) and cannot be factorized across languages. Anti-drift action instead: extract the shared HTTP contract (routes, payload shapes, status codes) into one contract document/fixture set under `tests/` consumed by both sides' tests, and state the parity rule in `maps/API_MAP.md`.
- [ ] **E5** While touching any file in D/E scope, migrate residual legacy `MTrax` naming to Molecule when safe (mandatory per rule module 04 §11).

## F — Structure & policy compliance (P3)

### F1 — PROGRESS LOG (live)

Total scope F1 = 150 colocated `*.test.mjs`.
- [x] Move 150/150 files into `./tests` (mirror layout) — **100%**
- [x] Rewrite 231 relative import specifiers (query-suffix safe) — 0 broken targets on disk
- [x] Fix macOS case-fold collision `tests/eVe/` → real `tests/eve/` (38 eVe-origin files)
- [x] Update 5 referrers: manifest (3), phase9_mcp (4), phase9_voice (5), CODEMAP (4), latency doc (1)
- [x] Re-sort + dedupe `tests/vitest.manifest.json` (56 entries)
- [x] `vitest_manifest_guard.test.mjs` → **3/3 GREEN**
- [x] 150/150 `node --check` OK ; 150/150 imports resolve on disk
- [x] phase9 suites: mcp (4/4 PASS) + voice (5/5 PASS)
- [x] CODEMAP updated inline

**F1 DONE (2026-07-02): 150/150 tests migrated, guard green, phase9 suites PASS.** Full 56-suite vitest run + temp cleanup deferred to end-of-effort batch (per user: stop fussing on details, resume).

- [ ] **F1 — MIGRATE ALL 150 COLOCATED `*.test.mjs` INTO `./tests`** (user decision 2026-07-02: they do not belong in source dirs; none are dead, so the branch is *move*, not *delete*). This is a scoped refactor, not a cleanup, because the files are **wired-in and guard-enforced**, currently *requiring* colocation. Full blast radius discovered by audit:
  - **150 files**: 106 under `atome/src`, 38 under `eVe`, 5 `database/adole.*.test.mjs`, 1 `server/mailRoutes.test.mjs` (the earlier count of 295 counted 145 build-artifact copies under `platforms/desktop-tauri/target/debug/` — ignore those).
  - **130 of the 150 import their sibling module by relative path** (`./service.js`, `../foo.js`). Every one must have its imports rewritten to reach back into the source tree after the move (`../../../atome/src/squirrel/…`).
  - **`tests/governance/vitest_manifest_guard.test.mjs` enforces the opposite** today: it runs `grep -rl "from vitest" tests eVe atome server` and fails if a vitest suite in those dirs is missing from the manifest. Migrating means this guard must be rewritten to scan only `tests/` (invert the convention) in the same task, or it will fail.
  - **`vitest.config.js` documents colocation as the convention** — its header comment and the manifest contract must be rewritten to match.
  - **`tests/vitest.manifest.json`**: 3 entries point at source-dir suites (`atome/src/squirrel/apis/unified/adole_api/session.current_project.test.mjs`, `eVe/intuition/projection/button.slider_contract.test.mjs`, `eVe/intuition/tools/ui/tool_button_factory.slider_contract.test.mjs`) → update to new paths.
  - **Hardcoded runner scripts**: `scripts/phase9_mcp_runtime_suite.mjs`, `scripts/phase9_ui_regression_suite.mjs`, `scripts/phase9_voice_interrupt_suite.mjs` (and any other `scripts/phase9_*.mjs`) list ~13 source-dir test paths literally → update each.
  - **Migration procedure**: (1) move each `<src>/x.test.mjs` → `tests/<mirror-of-src-path>/x.test.mjs` preserving structure so names stay unambiguous; (2) rewrite its relative imports; (3) update manifest + phase9 scripts + guard + `vitest.config.js`; (4) `node --check` each moved file, then `npm run test:run` (vitest) + the phase9 suites + `check:master-cleanup` to prove zero regressions; (5) confirm `check_*_guardrails.mjs` scripts don't depend on tests being colocated.
  - **CONFLICT NOTE (module 01 rule 7)**: this inverts a guard-enforced repo convention. Direction is confirmed by user + `.codex` module 02, but because it rewrites a governance guard it should be run as its own focused batch with the full suite green before/after — not folded silently into another task.
  - Start candidates (smallest, self-contained, high line-count payoff): `atome/src/squirrel/atome/mcp.runtime_bridge.test.mjs` (717 L) and the 5 `database/adole.*.test.mjs`.
- [x] **F2** NO ACTION — `media_diagnostics_probe.js` is a LIVE module imported by `media_diagnostics.js` (part of the diagnostics feature: `media_diagnostics_url.js` + `_probe.js` siblings, drives `media_diagnostics_full_suite`/scan). Not a leftover probe; 'probe' here = diagnostic prober. Cosmetic rename unwarranted.
- [ ] **F3** Mark vendored code as out-of-scope in `maps/CODEMAP.md`: `atome/renderers/wgpu-web-external-texture/` (patched wgpu 27.0.1 fork used by `bevy-core` for external-texture video — do NOT clean, do NOT apply size thresholds) and `platforms/desktop-tauri/vendor/tauri-plugin-stt/`. Document the fork's purpose and pin.
- [x] **F4** NO ACTION — dirs are NOT empty: `eVe/concept` (10 docs/html), `eVe/default_values/constants.json` (referenced config), `eVe/documentations` (29 md). '0 JS lines' just meant no code; the docs/json are legitimate content.
- [ ] **F5** Update `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md` at the end of each section A–E batch (same-task obligation, not a follow-up).

## Do NOT do (evidence-backed, from previous measured sessions)

- No Bevy pipeline prewarm (transparent sprite/text at Startup): measured zero gain (gap stayed 1819 ms), already removed once.
- No re-attempt of T1.3 (module bootstraps <20 ms) or T0.3 (immutable cache headers) — evaluated, not worth it.
- No cleaning inside the vendored wgpu fork or `tauri-plugin-stt` vendor tree (F3).
- No touching `eVe/R&D/` in any way (user decision 2026-07-02) — not moved, not archived, not deleted; only excluded from packaged bundles (B4).
- No git write operations of any kind; backups go to `./temp`, restores via file copy (eVe is a git submodule — never stash from the parent repo).
- No worktrees — all work in `/Users/jean-ericgodard/RubymineProjects/a/` directly.
- No optimization without a prior at-rest measurement and a red-first validation on the real mechanism.

## Suggested execution order

1. **A (all)** — pure deletions, immediate wins, de-noises every later scan. Rerun dead-file scan (A12).
2. **B4 + B6 + B7** — packaging/assets: biggest bytes for least risk.
3. **C2** (server logs → pino) then **B3** (API compression) — server latency batch, one restart validation.
4. **B5** (structuredClone, molecule first) + **C1** (intervals) — memory/reactivity batch.
5. **B2 → C3** (profile panels, then fix leaks found) — measurement before mutation.
6. **B1** — renderer texture dedup/atlas (dedicated at-rest session, before/after probes).
7. **D1–D5** (server/database/tauri splits), then **D7/D8**, then **D6** (needs Xcode), then **D9**.
8. **E1–E5** opportunistically inside D batches (same-file passes), **F** continuously.

## FAST eVe splits 2026-07-02 (node --check validated; client modules, runtime not boot-checked)
- bevy_media_texture_resolver 510→425 (+bevy_audio_waveform.js)
- contact_model 505→441 (+contact_model_helpers.js)
- user_login_choice 542→364 (+user_login_choice_ui.js)
- bevy_web_renderer_runtime 587→478 (+bevy_web_renderer_helpers.js)
- project_scene_runtime already 497 (no-op); reverted one broken auto-extraction.
REMAINING barely-over are single ~500-line factories (dashboard_runtime createDashboardRuntime, contacts/service createContactsService, av_contracts createAVLifecycleObject) or inline-heavy (eVeIntuition) or entangled (asset_box sendFileToServer→15 locals) — need careful ctx-pattern split, not fast auto-extraction.
