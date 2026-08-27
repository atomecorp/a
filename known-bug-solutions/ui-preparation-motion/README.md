# UI preparation, motion and opening stability

Date: 2026-08-27. Status: partial implementation; not full optimization acceptance.

## Initial refresh follow-up: purple wait and 75% canvas

The user's Tauri screenshot showed the whole surface reduced, not merely a
misplaced toolbar. The same defect was reproduced in the user's Chrome session
on `http://localhost:3001/` (Fastify, native DPR 2, capped render DPR 1.5).

- Before repair: no canvas through 11.82 s; first observed at 12.24 s. It then
  changed from 1204x854 to 903x640.5 at 13.10 s and returned at 14.38 s.
- Boot modules completed by 1.78 s and authentication by about 0.27 s. Dashboard
  dependency requests spent roughly nine seconds waiting for server responses.
  A three-second native sample of Fastify showed its main thread inside
  `better_sqlite3` statement reads; request traces identified repeated
  `PersistentToolRegistryStorage.list` calls, two catalogue queries per call.
- `ToolRegistryV2.ensureReady` previously launched a fresh `refresh` for every
  concurrent caller. Sharing the pending refresh reduced the first canvas to
  about 2.52 s in the same session, before any geometry/reveal changes.
- Winit rewrites CSS from physical pixels using the browser DPR. The backing
  guard was installed only after renderer startup and a fixed one-second wait.
  It now runs before invocation and reconciles in the mutation-observer phase,
  before paint. The canonical surface metrics are refreshed after async loading.
- The existing surface is transparent while the workspace prepares its menu and
  Dashboard, then fades once at full size. No new DOM overlay or renderer exists.
  WASM preparation overlaps JS imports; the fixed startup idle second is removed.

Final uninstrumented Chrome refreshes: first visible 3.71 s / 2.86 s; fully
visible 3.86 s / 3.01 s. Both sampled runs retained 1204x854 throughout. A separate
first-visible screenshot pair captured the complete Dashboard and toolbar during
the fade and at full opacity. These are warm local refreshes, not cold benchmarks.
Temporary source diagnostics were removed. The native sampling artifact is
`temp/fastify_boot_sample.txt`.

Regression coverage: `boot_initial_presentation.test.mjs` exercises 300 concurrent
registry readers, failure/retry, pre-frame capped-DPR repair, one-shot reveal and
resize during module preparation. Broader checks passed 72 tests in 14 files,
four standalone contracts, M1 (28 Molecule suites), and syntax (1935 files).
Two stale test contracts were corrected: timers must remain asynchronous, and
native video resource publication does not remain indefinitely in the CPU queue.

Tauri's HTTP server serves the corrected source, but its unbundled executable
cannot be selected by the available native UI tool. Tauri and iOS pixel/timing
proofs remain open. The later project-switch contextual-rail handoff limitation
below is not declared fixed by this initial-refresh correction.

## Confirmed causes and repairs

| Cause proved by executable regression | Repair / evidence |
| --- | --- |
| Flower child coordinates applied the parent offset twice: expected x=389, actual x=778 | Canonical layout offsets and surface-space motion; icon/label placement survives animation and replay |
| Palette accent used an index-based offset belonging to another child | Child-ID offsets include accents; expected final y=161 replaces stale y=276 |
| One ordinary motion sample submitted two renderer batches | Motion-owned procedural styles are not sent a second time; unchanged atomic-batch assertion passes |
| Nine already-cached icons still consumed two preparation-frame waits | Yield budget runs only inside the cache-miss resolver; warm preparation consumes zero such waits, cold preparation remains bounded |
| Labels rendered as Bevy text were also rasterized into unused images | Skip redundant rasterization on the non-native-UI route; native UI retains its texture path |
| Surface changed from 960 to 1280 during image preparation | Refresh through the original tree builder before publishing; test publishes one 1280x720 tree |
| Renderer-driven size synchronization did not notify UI owners | Every effective size change notifies once; identical sizes do not notify |
| List/Matrix painted an empty page before loading records | Load and contextual geometry precede one tree replacement; failures and stale completions are covered |
| Dashboard was destroyed before the incoming project loaded | Activation now removes it after scene, view and menu preparation; scene ownership preserves only workspace chrome |

The existing image cache, UI render queue, Atome commit APIs, canvas and media
owners are reused. There is no replacement renderer, proxy DOM, persistent
progress state or per-row timer. The previous video/scrub repairs are retained.

## Validation

- Focused regression tests cover Flower projection/replay, preparation, size
  notification, main-menu geometry/animation, tree replacement, transport,
  List migration, selection/mutation and workspace activation.
- The final broad run passed 185 tests across 28 files, including workspace
  activation and empty-project menu transfer. M1 passed (including 28 Molecule
  suites); syntax passed for 1932 files. Whitespace checks passed in both repos.
- The obsolete Panel Lab shortcut and Create palette expectations were updated
  to the current product contract. Large touched test owners were split without
  dropping their remaining assertions; new suites are in the Vitest manifest.
- Real HTTP Web session, existing user Project 3: Dashboard and six-icon Flower
  observed through real canvas clicks; icons remain inside their bubbles.
  Menu geometry is bottom-right at a 1280x720 viewport. Project List shows its
  existing media previews. No artificial DOM controls or forced clicks were used.
- The application and backend were not restarted. The browser capture sometimes
  remained visually stale until an input event; those intervals are not valid
  startup or frame-pacing measurements.

## Explicit limits

- Dashboard remains visible during project preparation, but the contextual rail
  can appear above it before final handoff. Whole-screen atomic publication is
  not complete; first-screen visible-media readiness is not fully proved.
- Cold/warm p95 targets, 20 boots, 100 Flower cycles, 30 project transitions and
  30-minute endurance were not measured. No claim of an ultra-fast boot or
  resolved three-minute iOS latency is made.
- Native Tauri has not been visually accepted in this pass. Web tests are not
  native evidence.
- iPhone was unavailable. The available iPad could not run WebDriverAgent:
  Xcode exit 65, provisioning profile excludes the signing certificate. No
  signing, device data or user Xcode state was modified.
- Late project-load publications and startup/deferred-resource scheduling need
  their own measured cancellation/readiness audit; they are not repaired merely
  by moving Dashboard teardown.

Relevant owners: `eVe/intuition/ribbon/bevy_ui_flower_motion.js`,
`eVe/domains/rendering/bevy_ui_image_runtime.js`,
`eVe/domains/rendering/project_view_surface_runtime.js`,
`eVe/domains/rendering/project_scene_record_preservation.js`, and
`eVe/intuition/matrix/core/project_workspace_activation_runtime.js`.
