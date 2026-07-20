# Atome / eVe Architecture Map

Status: Initial architecture map after the Atome open / eVe closed boundary validation.

Current mobile resource/lifecycle contract (2026-07-17; supersedes older warmup, preview, and fixed-cadence details below wherever they conflict):

- Boot and workspace restoration are demand-driven. No delayed cascade may preload Dashboard, capture, panels, activities, voice/TTS, or renderer WASM. Camera/microphone permission belongs to the explicit capture gesture.
- Project listing excludes `preview_url` at the Tauri, iOS, and Fastify storage-query boundaries; canonical `meta.owner_id` participates in security projection and failures cannot masquerade as an empty project list. Preview capture is ephemeral, WebP, DPR 1, and limited to an explicit current project.
- One shared surface interceptor owns input. Dashboard render backpressure keeps only current plus latest state, and data hydration is restricted to lanes currently visible in the viewport; newly revealed lanes hydrate on scroll. Dashboard mode suspends hidden media decode and its frame callbacks. The Web renderer is strictly event-driven with explicit wakeups and no idle update cadence; surface DPR is capped at 1.5 and decoded texture retention at 16 MiB.
- iOS file propagation is event-driven. `FileSyncCoordinator.syncAll()` runs after initialization, confirmed explicit file mutations/imports/captures, explicit sync, or list freshness; `FileSystemDeletionTransaction` forbids success, tombstones, and sync when coordination, removal, or absence confirmation fails, and a partial batch marks only confirmed deletions. No repeating directory-scanning timer exists, and the local HTTP server never synchronizes all roots for ordinary static GET requests.

Purpose:

- Define the cross-layer architecture contract used before future implementation work.
- Make dependency direction, lifecycle, runtime modes, source-of-truth rules, and open/closed boundaries explicit.
- Prevent duplicated systems, hidden mutation paths, fallback transports, and product-specific code leaking into the open framework.

Mandatory Use:

- Before changing structure, runtime behavior, persistence, sync, MCP, tools, UI, or APIs, consult this file together with `maps/CODEMAP.md`, `maps/API_MAP.md`, and `maps/DESIGN_MAP.md`.
- Verify the referenced source module directly before relying on this map for a code change.
- Update this map in the same task when cross-layer ownership, dependency direction, lifecycle, source-of-truth rules, or runtime modes change.

## Mandatory Pre-Implementation Gate

No structural, runtime, persistence, sync, MCP, tool, UI, API, security, platform, or cross-layer change may start until the relevant maps have been consulted:

- Use `maps/CODEMAP.md` to establish file ownership, source placement, existing modules, and reusable implementation boundaries.
- Use `maps/API_MAP.md` to establish API visibility, runtime exposure, effectful operation paths, MCP compatibility, and public/semi-public/internal classification.
- Use `maps/DESIGN_MAP.md` to establish design ownership, JavaScript token/factory reuse, generated style exceptions, and product visual boundaries.
- Use this file to establish dependency direction, lifecycle, command/history flow, source-of-truth rules, runtime modes, and Atome open / eVe closed architecture constraints.

Implementation may proceed only after the architectural owner, dependency direction, mutation path, validation expectation, and required map updates are known.

## Global Vision

BevyUI panel architecture:

- Migrated eVe panels render as disposable BevyUI trees on the shared `eve_surface_project` canvas through `eVe/intuition/runtime/bevy_panel/` and `window.eveBevyUiRuntime`.
- `openPanelSurface(surfaceKey, context)` and `closePanelSurface(surfaceKey, context)` remain the single panel entry points. `panel_surface_runtime.js` routes only registered Bevy panel surfaces to the BevyUI panel runtime; non-migrated surfaces stay on the old path until their migration is complete and verified.
- The panel structure is fixed as `PanelRoot -> HeaderInfo -> BodyScroll -> FooterControls`. HeaderInfo is information-only, BodyScroll is the only scroll owner, and FooterControls owns close/resize controls. A generic tools dock is forbidden on migrated panels.
- Mobile panel geometry occupies the available shared canvas area above the toolbox-reserved band so the main toolbox remains accessible.
- Panel trees emit UI intentions such as close, resize, field, list, and command activation. Durable business mutations remain in their existing owners and must still pass through the canonical APIs or `Atome.commit` / `commitBatch` where canonical state changes.
- Timeline is the first migrated panel surface. `eVe/intuition/tools/timeline.js` is compatibility glue only and must not recreate the old HTML dialog. Future panel migrations must delete the old visible HTML code only after imports and runtime references prove the BevyUI surface fully owns the panel.

Dashboard Bevy architecture:

- The active workspace is a single Bevy/WebGPU canvas with a logical scene hierarchy, not independent overlay stacks. `eVe/domains/rendering/workspace_scene_layers.js` defines the stable closed eVe roots `workspace_root`, `project_layer`, `dashboard_layer`, `panel_layer`, `main_menu_layer`, and `flower_layer`. Project Atomes, Dashboard records, BevyUI menu nodes, Bevy panels, and future Flower records must project as children of those logical layers with normalized render ordering and accessibility metadata. These roots are used for diagnostics/accessibility and hierarchy validation; they are not extra visible canvases, DOM layers, duplicated state stores, or public Atome entities.
- The BevyUI main-menu Atome tool is the dashboard entry point for authenticated or anonymous active workspaces. It toggles through `toggleWorkspaceDashboardAndMainMenu({ source: "bevy_ui_main_menu_atome" })`, so a presentable neutral Dashboard closes normally, while a logically active Dashboard with missing records/surface is repaired through the canonical neutral workspace opener instead of calling the low-level dashboard runtime toggle. It opens the eVe dashboard rendered into the neutral `__eve_dashboard_workspace__` Bevy scene by default and no longer hides the toolbox to reveal dashboard content. The Home main tool remains the user/Home panel route, including before workspace activation. The fixed-size BevyUI menu never shrinks tools to fit a narrow surface: `bevy_ui_main_menu_model.js` computes `scrollLeftPx` / `maxScrollLeft`, right-handed overflow starts at the terminal scroll position with Atome flush to the edge, `bevy_ui_main_menu_scroll_runtime.js` owns normalized wheel/pointer horizontal scrolling, snap, and activation suppression after drag, and `bevy_ui_main_menu_runtime.js` coalesces scroll renders so hover-wheel bursts cannot backlog stale BevyUI tree updates.
- BevyUI overlay rendering is versioned per tree before asynchronous texture hydration starts, then applied through a per-tree queue whose cleanup promise resolves on both success and failure while the returned operation preserves the original error for its caller. Standalone ImageNode hydration uses the same exported `DEFERRED_TEXTURE_BATCH_SIZE` as deferred media texture resolution and yields between batches. Dashboard card-media nodes are explicitly marked to defer generic ImageNode hydration; their forwarded overlay records enter the shared WebGPU deferred-media path, so project thumbnails cannot block the structural Dashboard mount while icons, shadows, and label backdrops retain normal prehydration. When a Bevy UI node carries a canonical `overlayRecord`, the overlay projector forwards that record exactly under the `__eve_bevy_ui_` prefix instead of reconstructing a simplified shape/text/image record, so the visible WebGPU overlay keeps the canonical dashboard visual contract. Large overlay trees are applied in 20-record batches separated by animation frames; this keeps static dashboard mount below the T3.5 no-frame-over-32ms budget while preserving a complete mount under 100ms. The BevyUI main-menu tree is the exception: its fixed icon/label set is reconciled atomically by prefix, not split into batches, so resize/hover/update races cannot leave only part of the menu committed as the stable overlay. BevyUI overlays are projected into the current foreground workspace scene, not a fixed Dashboard scene: project mode writes menu records into the active project, Dashboard mode writes them into `__eve_dashboard_workspace__`, and a tree projection clears stale records for that same tree from inactive scenes so project switches cannot keep a ghost menu baseline. Geometry remounts clear the old overlay and immediately mark the overlay baseline empty; if projection fails, `bevy_ui_overlay_reconciliation.js` keeps the error observable and queues one reconciliation through the existing per-tree queue rather than leaving a partial batch as the stable record baseline. Native BevyUI WASM submission remains opt-in and must not double-render over overlay-backed static dashboard surfaces. Stale menu renders caused by pointer focus/activate transitions must return without updating overlay records, so Dashboard opening cannot be followed by an older tool texture projection.
- Dashboard opening progressively projects one canonical tree: shape records mount first and establish workspace readiness, then the existing post-open task hydrates data and adds the complete text/image details in one projection. This transition preserves mounted shape ids and submits only new overlay records, preventing a redundant structural replacement while resources spawn. Texture resolution therefore cannot keep the preceding project visible; no alternate tree builder, renderer, canvas, or fallback state is introduced.
- `eveBevyUiRuntime.prewarmTreeImages({ surface, tree })` remains a hydration-only primitive. After its first stable mount, the main menu uses it one palette per idle frame to populate the existing bounded texture cache; closed palette nodes remain absent from trees, hit-testing, and projection. The cache shares concurrent resolutions by key, stores final tinted payloads as typed RGBA bytes, and advances a generation on clear so obsolete in-flight work cannot repopulate it. Hide, content replacement, destruction, or palette activation cancels pending work.
- Non-atomic BevyUI trees force scene projection only on their first mount. Later geometry updates, including Dashboard wheel/inertia/snap frames, retain normal `project_scene_direct_transform_runtime.js` eligibility so existing GPU entities move incrementally instead of being rebuilt; the fixed main-menu tree forces the full set only on its fresh mount and submits compatible hot structural changes through `project_scene_direct_prefix_runtime.js`. Palette activation therefore projects one complete opaque structural set at the expansion origin, including background, accents, tools, icons, and labels; direct motion begins on the first rAF and carries that whole set through the 180/70/120 ms curve without faded or delayed content.
- Direct prefix and motion operations normalize through the workspace-layer contract, reuse resident resources, and serialize through the shared direct-mutation queue in `project_scene_state.js`; full scene projection waits for that queue so no stale direct sample can overwrite newer structure. `project_scene_direct_motion_runtime.js` patches transforms/styles without re-normalizing render nodes or hashing unchanged RGBA payloads. Its rAF producer permits one renderer submission in flight and coalesces all pressure to one latest pending sample, never a FIFO. Dashboard vertical projection keeps all category ids resident, places non-visible lanes outside the canvas, and uses width/height-aware direct transform patches; wheel input lands on a whole-lane snap point in one coalesced render, while visible-lane hit-testing remains bounded.
- Web palette motion uses the existing batched `apply_atome_bevy_ops` route, never one WASM crossing per node. The Web Bevy runner drains that batch on its 16 ms reactive update; last-tick/last-wake throttling prevents redundant `WakeUp` events from postponing the update. Renderer artifacts are loaded as one content-addressed glue/WASM pair after a page-scoped refresh of the tiny version manifest, preventing hot-build cache mismatches without disabling immutable caching of the large binary.
- The dashboard reserves the registered active BevyUI main-menu height as an excluded bottom band. No legacy DOM toolbox measurement fallback is authorized; an unavailable or unmounted canonical menu is an explicit readiness error that must be repaired by the owning workspace/menu lifecycle. Dashboard hit-testing stops above the registered reserved rectangle. Dashboard rendering must not place a visual mask in the reserved band; the foreground menu remains the unchanged BevyUI main menu. This must not add a DOM overlay, CSS canvas filter, second canvas, or alternate renderer.
- Session entry into an authenticated or anonymous workspace uses `eVe/intuition/tools/user_workspace_surface_runtime.js` to ensure the canonical shared project canvas is attached to `project_view___eve_dashboard_workspace__`, run data-only dashboard warmup for the neutral Dashboard scene before the automatic open, call the shared workspace menu visibility helper so reserved-band geometry is stable, open `window.eveDashboardBevyUiRuntime` for `__eve_dashboard_workspace__`, repair the neutral host/canvas attachment through `dashboard_workspace_mode.js` if readiness detects an unavailable surface, and verify readiness directly after `dashboard.open()`. After auth/workspace entry, the main-menu invariant is centralized in `workspace_main_menu_visibility.js` and is reasserted after Dashboard open/repair, project-card activation, Dashboard-to-project restoration, Bevy panel opening, and project activation; the helper requires both an active BevyUI menu tree and main-menu overlay records in the current foreground scene before it accepts the menu as visible. The login/unauthenticated surface remains the only allowed pre-workspace exception. Authenticated dashboard entry also calls `dashboard_project_record_bootstrap.js` to ensure the user has at least one durable project record; that path lists authorized projects and may create `untitled`, but it must not call `activateProjectWorkspace()`, set a current project for the neutral Dashboard, or call `loadProjectAtomes()`. `eVe/domains/dashboard/dashboard_bevy_ui_runtime.js` is the only Dashboard runtime: it builds a Bevy UI tree from the same dashboard constants/data/layout/tokens and canonical dashboard records, mounts it through the shared `eve_surface_project` Bevy UI runtime, and verifies readiness from Bevy UI runtime diagnostics backed by mounted overlay records. It must not fall back to a deleted legacy runtime, create Dashboard DOM, or submit a second native UI visual layer during the static phase. Authenticated and anonymous Fastify entries must first prove a usable token/session and clear stale invalid-token state through the Atome auth token owner; a user identity without an installed token is not enough to open the neutral Dashboard. When auth restoration turns the workspace active after the initial login sequence has already mounted, the shared login sequence is closed from its singleton owner before authenticated toolbox content is exposed, so no stale login shell can mask the Dashboard or intercept the BevyUI menu. Default boot must not start `loadProjectAtomes(...)`, publish a user project surface, or hydrate project previews by loading projects in the background. A single neutral in-flight open lock prevents the boot and anonymous/authenticated entry paths from issuing duplicate dashboard opens, and failed Bevy projections must never become the virtual-scene diff baseline for later Dashboard reconciliation. Dashboard runtime diagnostics are transaction-scoped: `open()`, `refresh()`, and `warmup()` clear older async errors before the current attempt. This is lifecycle orchestration over the existing menu/dashboard/render APIs, not a separate dashboard DOM, background project loader, or DOM menu state owner.
- The delayed post-auth Dashboard bootstrap is subordinate to explicit project activation. If `window.__eveWorkspaceMode.mode` is already `project` when the delayed Dashboard bootstrap resumes, it may mark bootstrap complete but must not clear the active project host, detach the shared canvas, delete `window.__currentProject`, or overwrite the active scene with Dashboard cleanup.
- Dashboard category defaults are seeded from `eVe/default_values/constants.json` and normalized by `eVe/domains/dashboard/dashboard_model.js`; `eVe/domains/dashboard/dashboard_preferences.js` applies user profile rubrique visibility before hydration, layout, hit-testing, tool activation, and Bevy projection. Runtime state such as active category, scroll offsets, and fullscreen editor focus remains non-durable dashboard state.
- Dashboard item listing is cached in `dashboard_bevy_ui_runtime.js` by scene/data project context plus category; generic record categories are batch-loaded by `dashboard_data_adapters.js` through a single canonical `state_current` read per grouped dashboard load. Calendar dashboard items come from `CalendarAPI.listEvents()` through the read-only `calendar_api.js` facade, not the panel-building `calendar.js` module, and only dated, non-deleted, unique events are projected; reopening the Calendar panel refreshes its initialized cache from `CalendarAPI` so dashboard-side title/date commits are visible after close/reopen and app reload. Contacts dashboard items combine the Contacts panel directory source with local `eve_contacts_local` payloads, order local payloads first so editable contacts occupy the first visible cells, prefer display/name-like fields before phone or email labels, and keep non-matching directory contacts visible after them while matching local payloads remain the canonical editable item. Contact profile photos flow only as disposable `metadata.user_face` into Dashboard Bevy image records. The Contacts service binds its local source to the runtime environment storage and can synchronously rehydrate `list({ source_id: 'eve_contacts_local' })` after service recreation; local contacts are writable/read-write, while non-local contacts stay non-editable and never receive local aliases. Project items use persisted renderer-produced preview descriptors as `metadata.project_preview_source` plus natural dimensions during default Dashboard boot; first paint and neutral hydration request project/contact items with preview hydration disabled so cold capture or missing previews cannot load user projects in the background. Explicit project-to-Dashboard close and Matrix preview refresh paths may capture the preview source at default logical `640x400` with physical dimensions derived from DPR, persist the captured `preview_url`/dimensions/timestamp through `Atome.commit`, and rerender only after a persisted source is available. After the initial critical neutral Dashboard projection, the close path targets only the Projects category through the existing hydration controller and reuses retained current-scene records; this asynchronous task is observable in runtime diagnostics and does not introduce a background loader or alternate renderer. Wallpaper/background/dashboard records are excluded from project miniatures. The reusable Bevy preview capture iframe/canvas is hidden behind the app but kept paintable, waits for deferred texture resources, rejects skipped or pending resources, and treats transparent/nearly empty captures as explicit renderer errors rather than valid Dashboard previews. Dashboard item normalization deduplicates by normalized item id before focused rendering. Opens clear stale focused category state, invalidate any in-flight warmup, guard only the opening pointer sequence from also activating a lane, render immediate critical project/contact data without waiting for capture, then hydrate other visible categories and rerender only when projection-relevant content changes. Warmup must abort while the runtime is active/opening/closing or serial-invalidated and must remain data-only so it cannot create hidden Dashboard records in the project scene. The cache is invalidated by explicit refresh, project-change lifecycle, logout, `eve:people-directory-updated`, `eve:user-profile-updated`, any non-Dashboard Atome mutation carrying a project id for project preview refresh, and explicit invalidation; header clicks do not force a synchronous reload.
- Dashboard rendering keeps an internal disposable record cache and diffs records by id with a targeted structured comparison before calling `updateProjectSceneOverlay(...)`, which merges record removals, record updates, and scene effects into one Bevy projection render per logical dashboard render. `dashboard_bevy_ui_runtime.js` reuses the current watcher snapshot and `dashboard_environment.js` memoizes the active-category item projection, so hot render frames no longer repeat toolbox DOM measurement or item dedupe work. Dashboard records are non-selectable decorative/runtime records; opening projects only visible records, and close fades those records to opacity `0` for the canonical `dashboardFadeMs` duration before removing every `__eve_dashboard_` record from the scene instead of using canvas/host opacity or parking hidden entities. Intermediate fade frames are direct Bevy style updates over the existing records through `dashboard_projection_lifecycle.js` and `project_scene_direct_style_runtime.js`; the final settled frame re-enters the normal record projection so scene state stays deterministic. A closed Dashboard leaves zero Dashboard records/nodes, so later Atome drag/update projections do not reconcile stale Dashboard geometry. Layout hit-testing in `dashboard_bevy_ui_runtime.js` owns dashboard actions, while `dashboard_bevy_ui_runtime.js` commits header/item actions only after pointer release on the same target without drag movement; vertical drags over headers scroll the rubrique stack and suppress opening. The toolbox-reserved canvas band is inert while the dashboard is open so project selection cannot target dashboard veil, shadow, or fill records. High-frequency wheel, pointermove, and inertia ticks remain animation-frame-driven over the existing Dashboard runtime path; close cancels pending dashboard frames before removing records so stale header/category renders cannot repaint visible dashboard fragments. Open, close, and final editor states still project through the same Bevy record path so probes can verify deterministic scene state.
- Dashboard item label editing is a runtime interaction over the existing project canvas. `dashboard_bevy_ui_runtime.js` owns long-press detection, editable field hit resolution, and prevents the release click from opening an item; `dashboard_item_text_fields.js` is the single source for project/contact title fields and calendar title/start-date fields; `dashboard_label_edit_runtime.js` owns hidden text capture, Enter/Escape ownership, and Bevy-projected draft/caret/selection state; `dashboard_label_persistence.js` commits labels only through Matrix project rename, CalendarAPI event title/start update, or local Contacts update. Active project rename also persists the current-project name used by reload bootstrap. Only local `eve_contacts_local` contacts arm label editing; non-local contacts remain click-openable and direct persistence calls reject explicitly. The flower context resolver must allow Dashboard item hit zones to open the radial context menu by right-click or long press, while the toolbox-reserved band and non-item Dashboard chrome remain blocked. If the flower takes the pointer, Dashboard label-edit long press must yield to that flower pointer ownership.
- While open, the dashboard watches its environment through `dashboard_environment_watcher.js`: project surface size, surface parent size, toolbox candidate geometry, window resize, Intuition handedness state, and profile preference updates. The watcher compares a compact environment signature before rerendering, so resize/toolbox/latéralité changes update the Bevy records without timers, DOM dashboard state, or close/reopen. Profile category visibility changes are handled by the dashboard lifecycle event path so hidden rubriques are removed from the canonical runtime category list before render instead of being hidden by DOM or CSS.
- Dashboard layout precomputes lane item starts and uses bounded lookup for visible item records. Cells keep their logical square/double width even when partially visible; clipping is represented by layout metadata and visible-range filtering, not by shrinking durable item geometry or adding DOM. Visible card, media, backdrop, and label record ids are tied to stable category+item identities rather than visual slot numbers, so scroll and focused-category changes move existing items through transform/style diffs and only spawn/despawn records as they enter or leave the bounded visible window. The bottom reserved band uses the measured top of painted maintoolbox controls/surfaces when they are visible; the generic minimum band is used only when no toolbox surface is measurable.
- Initial dashboard open has no active category so each lane shows its own category color/data. Header activation starts the focused mode where the active category color fills the dashboard background, table, lanes, and entêtes as one uniform backdrop; cached/current active-category items are reused immediately through stable category+item records, and the active category's unique items are distributed once across the lanes instead of being mirrored into every lane. Clicking the already active header clears focus and restores the base dashboard overview. Missing focused-category data hydrates into the same item identities instead of forcing an empty intermediate projection. Focused item hit-testing preserves the item category as the action owner even when the item is displayed on another visual lane.
- Dashboard no longer owns `+` creation actions from focused entêtes. There is no full-height plus strip, no plus hit-test route, and no no-op plus branch. Header long press is the only Dashboard header creation gesture and is limited to `projects`, `calendar`, and `contacts`; it creates through the existing Matrix/Adole, CalendarAPI, or Contacts API owners, invalidates only the matching Dashboard category, and suppresses the following normal header activation after creation. Project header creation must not activate or load the project. Calendar/contact header creation opens only registered BevyUI panel surfaces and must preserve the workspace main menu. Project item clicks still follow the same transition rule: Dashboard and project must never be visible simultaneously, and `loadProjectAtomes`/project activation happens only after the explicit project-item click path begins. Project activation owns the recovery of active project layer visibility, `eve_surface_project` pointer interactivity, workspace `project` mode, and menu visibility through the existing project/render/Flower routing, not through Dashboard DOM cleanup.
- Default Dashboard mode owns a neutral project scene id, `__eve_dashboard_workspace__`, whose host is a fixed full-viewport shell. Its Bevy projection must claim the shared project canvas foreground instead of rendering as a project overlay; project bootstrap cleanup may remove user project hosts and project scene visuals, but when `startup_view` resolves to Dashboard it must preserve that neutral host, its shared canvas, its foreground ownership, and its active Dashboard scene records; otherwise the Dashboard runtime can remain logically active while the visible surface has been removed or cleared.
- The open Atome `record` type is the v1 storage contract for dashboard generic data. Dashboard category membership is stored as generic `category_id` plus `source_domain: "eve.dashboard"` so the Atome type remains product-neutral.
- Rounded dashboard geometry is not dashboard-specific renderer code: `corner_radius` is a product-neutral render style carried from Atome records through the virtual scene and Bevy projection adapter into Bevy core shape sprite masks. Bevy core also preserves that radius on spawned shape entities so `material.shadow` can generate disposable filled-mask shadow textures from the same rounded-rectangle geometry instead of falling back to square-corner shadow silhouettes or leaving a clear gap between the rounded card contour and the shadow falloff.
- Shape-shadow overlays are Bevy-owned transparent sprites under the source shape and explicitly opt out of automatic 2D batching. This keeps Safari/WebGPU presentation deterministic for Dashboard card shadows without changing Dashboard records, adding DOM, adding a renderer, or depending on a resize to repair the first frame.
- Flower glass surfaces use the same compositor-owned workspace capture as assistant optics: `backdrop_surface` samples the shared two-pass Gaussian target through a rounded SDF mask and renders the petal plus its content on the presentation layer, so the captured project remains below Flower rather than being recursively blurred. `workspace_blur.wgsl` is the attributed Bevy 0.19 separable Gaussian kernel, evaluated from physical fragment coordinates; Atome's `12 px` token maps to a Gaussian support radius after DPR conversion instead of a five-tap image-copy approximation. Shape shadows remain a separate cached Gaussian silhouette operation. Dashboard header side and bottom shadows remain dedicated external gradient textures and do not consume `material.backdrop` or `material.shadow`.
- Dashboard label outlines are not dashboard-specific renderer code: label weight, alignment, baseline, padding, lighter stroke, diffuse text shadow, optional texture scale, and opt-in `text_fit: "shrink"` use one structured `text_style` consumed by the Bevy text texture resolver. Dashboard card labels shrink deterministically inside their Bevy texture before clipping; image-backed card labels may receive a disposable `card_label_backdrop_*` Bevy image record underneath them, bottom-aligned to the card content rect with only the bottom corners rounded, to preserve readability without DOM/CSS overlays. Calendar cards may project a compact display date while retaining the full editable start value. Dashboard text/SVG/header/icon/media textures are cached by content, rich-text edit/selection state, style, dimensions, DPR, and scale through the shared Bevy media texture resolver cache, so repeated category switches do not rerasterize unchanged labels, icons, previews, or faces while caret and selection changes still invalidate the edited text texture; text and image cache keys are content-based and do not include the node id. Header SVG icons and detailed labels request higher texture density through the product-neutral media `texture_scale` field carried by `render_atom.js`, while project/contact card media uses `max(2, devicePixelRatio)` instead of the header/detail density to keep thumbnail upload cost bounded. Dashboard code must not add a renderer-local raster cache or compensate by scaling logical geometry. Dashboard cards use the product-neutral centered `material.shadow` shape contract and a slight same-hue lift from their visual lane entête color; lane bodies are derived from the same entête with `laneShadePercent: -10`. Entête rectangles are pixel-snapped to the handedness edge. The lateral entête shadow is a single external `header_side_shadow` image record that uses the existing Bevy image/texture path and is placed outside the entête block, so no shape-shadow blur can intersect the color block. Handedness determines whether the gradient sits on the left-side tracks for right-handed headers or on the right-side tracks for left-handed headers. Dashboard foreground depth is represented by a disposable project veil record below the dashboard and a single external vertical `bottom_shadow` texture-gradient record at the dashboard bottom; `backdrop_blur` remains dormant until a real renderer blur is accepted.
- Dashboard keeps layout, hit-testing, and disposable render records in the same logical project coordinate space as active Atomes. Dashboard code must not pre-scale or offset records for DPR, backing-buffer size, camera presentation, or WebGPU pixels; browser/WASM Bevy receives unscaled Virtual Scene nodes plus explicit DPR-aware surface metrics, and `atome/renderers/bevy-core/src/render_math.rs` owns the fixed logical orthographic camera projection plus the explicit camera depth volume needed for high Dashboard layers before any browser resize event. Dashboard text/image sharpness is handled by the DPR-sized WebGPU backing plus snapped record bounds and high-density texture rasterization before Bevy projection, not by changing logical geometry.
- Fullscreen item open/close is an immediate dashboard runtime detail projection into the table fullscreen rectangle. It affects only ephemeral Bevy records and never changes persisted Atome data; project items are the exception and close the dashboard before activating/loading the selected project as the active Bevy desktop.
- Late full-project Bevy renders may request preservation of explicit ephemeral scene records (`__eve_dashboard_`, `mol:lane:`, `mol:clip:`, `mol:kf:`, `mol:playhead`) so dashboard and Molecule overlays are not removed by project-load reconciliation. `__eve_dashboard_` records are preserved only while the dashboard runtime is active; closed dashboard fragments must not be revived by refresh/startup reconciliation. Ephemeral records do not participate in durable project z-index allocation: project media/drop placement reads durable project bounds through `project_scene_stack_runtime.js`, while visible Dashboard records reserve the active upper band and force new durable records to remain below them.
- Left/right handedness is a persistent runtime preference read by the dashboard layout and live Intuition state. It mirrors header side, clipping/content direction, hit-test zones, shadow direction, and horizontal scroll sign, and an open dashboard rerenders when profile visual preferences publish a handedness change.
- Dashboard acceptance is split between deterministic Node contracts for data/layout/mockup/record-geometry/data-adapter invariants and real Playwright probes for startup-only Dashboard state, main Atom handle toggling, record-opacity fade start under the interaction budget, canvas hit-testing, persistence, media import/drag, toolbox exclusion, fullscreen editor behavior, screenshot-visible entêtes/cards, logical-coordinate records, handedness mirroring, and 1680px+ no-resize reload readiness where header records must also produce visible pixels. Safari/WebKit reload acceptance must open at the large viewport before navigation, capture the reload state before any resize, and use resize only as a post-capture diagnostic comparison.
- `setRenderSurfaceInteractionInterceptor()` is the product-neutral surface hook used by dashboard to intercept canvas pointer/wheel events. It must not become a second project event system or a DOM authority layer.

Atome is the open framework layer. It owns product-neutral runtime contracts, Squirrel APIs, security, synchronization primitives, server-facing contracts, audio and AV runtime boundaries, AI/MCP orchestration, voice contracts, and reusable assets.

eVe is the closed product layer. It owns product UI, private tools, visual composition, panels, Matrix, ribbon, flower, Finder-facing product workflows, Molecule/MTraX product behavior, branding, product stores, and closed runtime composition.

The server and database layers are open infrastructure when they remain product-neutral. They own authenticated event intake, state projection, sync transport, database adapters, user data routes, and operational services. Product-named route families that already exist must be verified before being promoted as stable open contracts.

The core invariant is deterministic, tool-driven, append-only state:

- User, AI, voice, MCP, script, and automation actions converge on the same tool/runtime path.
- Communication contract: all Atome application and business operations use the canonical `/ws/api` WebSocket transport on every supported runtime. HTTP is forbidden as an Atome CRUD, event, state, history, snapshot, restore, authentication, sharing, synchronization, or user-data fallback. Static/bootstrap resources, health/configuration discovery, and explicit file/media/archive byte transfers remain separate HTTP-capable infrastructure concerns and must not mutate or query canonical Atome business state outside `/ws/api`.
- The login choice voice-guidance prompt is a pre-auth UI side effect routed through the existing global voice API only. It does not create a second TTS provider, does not mutate profile state, and does not decide accessibility preferences until a later explicit user choice is implemented.
- Durable mutation flows through `window.Atome.commit` or `window.Atome.commitBatch` on the client boundary.
- Server writes flow through the event commit helpers and database persistence boundary.
- `state_current` is a projection, not the source of truth.
- Snapshots and validation states are acceleration or approval anchors, not an alternate write path.
- Atome envelope normalization and property sanitization are centralized in `atome/shared/atome_contract.js` for server/database boundaries; envelope fields such as id, type, owner, parent, and timestamps must not become durable Atome properties.
- eVe client mutations apply the same property/envelope separation at `eVe/core/atome_commit.js`: raw `props`/`properties`/`patch`/`delta` are collapsed into sanitized `payload.props`, while project, parent, actor, transaction, and gesture ids stay top-level event metadata.
- Selection, lasso focus, SVG layer focus, tool latch state, and editor/session state are transient UI/runtime state unless explicitly modeled as schema-owned Atome properties. They must not be persisted as generic `selected`, `selection`, or DOM-derived properties.
- Media and MTraX creation paths use `kind`, `media_kind`, `media_source`, `media_url`, and schema-owned timeline/poster fields. Legacy render aliases such as `media_type` and `visualType` are adapter read inputs only, not durable write fields.
- Transitional Atome aliases are adapter inputs only. Normalized records must leave boundaries as `{ id, type, kind, renderer, meta, traits, properties }`.
- The shared `AtomGraph` contract in `atome/src/shared/atom_graph.js` derives a disposable structural graph from canonical state rows or append-only event rows. It owns roots, parent-child links, separate visual/semantic/focus ordering, deletion filtering, and graph diagnostics only; it does not own renderer payloads, product UI traversal, accessibility bridge DOM, or durable mutation writes.
- The shared `AccessibleAtomNode` contract in `atome/src/shared/accessible_atom_node.js` defines schema-governed accessibility semantics derived from Atome data: role, label, description, alt text, focusability, visibility, actions, and relations. It is not a DOM/ARIA mirror, native bridge, renderer payload, or product assistant runtime.
- The shared `AccessibilityGraph` contract in `atome/src/shared/accessibility_graph.js` derives a semantic graph from `AtomGraph` and `AccessibleAtomNode`. It owns accessible nodes, reading order, focus order, structural accessibility relations, and inaccessible-node filtering only; it is not the browser/WebView/native bridge and does not read visible DOM state.
- The shared `AccessibilityBridgeProjection` contract in `atome/src/shared/accessibility_bridge_contract.js` is the disposable semantic payload boundary for future browser/WebView/native accessibility bridges. It mirrors AccessibilityGraph data but does not create DOM nodes, ARIA attributes, selectors, renderer state, or product assistant behavior.
- Accessibility ownership is layered and non-overlapping: Atome state/events own durable semantic fields; `AtomGraph` owns structure and visual/semantic/focus ordering; `AccessibleAtomNode` owns node schema normalization; `AccessibilityGraph` owns graph-level accessible order, relations, and filtering; `AccessibilityBridgeProjection` owns disposable cross-runtime projection data; eVe interaction runtimes may consume these contracts but must not store accessible truth in DOM, Bevy ECS, hidden editors, or product panel state.
- User handicap preferences are closed eVe profile preferences under `eve_profile.preferences.accessibility`. The user panel may edit the durable `{ auditory, visual }` preference through the existing profile cache and autosave path, but runtime accessibility graph semantics remain owned by the Atome accessibility contracts above and must not be inferred from DOM controls.
- Core Atome type definitions in `atome/src/shared/core_atome_types.js` populate the existing shared type registry with strict schemas for text, shape, image, video, audio, waveform, group, project, tool instance, and generic `record` Atomes. A record is a `data_model` kind; all registered kinds remain constrained by the universal contract. These definitions do not replace renderer adapters or mutate visible projection behavior.
- The shared `SemanticRename` contract in `atome/src/shared/semantic_rename_contract.js` owns product-neutral rename semantics for all core Atomes. Rename writes use `properties.label`, synchronize `properties.accessibility.label`, require explicit `tx_id` for durable `set` events, and feed AccessibilityGraph labels without reading DOM state.
- Browser-side Adole Atome projection is centralized in `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js`; network/storage aliases may be consumed there but must not become the public record shape returned by framework APIs.
- Adole compatibility methods may keep historical names such as `atomes.create` and `atomes.alter`, but framework writes behind those methods must enter the append-only event pipeline through `adapter.atome.commit` / `adapter.atome.commitBatch`.
- Final Atome DOM is a disposable projection and must expose only `id="eve-atome_<atome_id>"`, CSS classes, necessary style, and visual children. Atome identity, kind, selection, grouping, media renderer state, binding flags, project ownership, replay state, sync state, and action routing facts belong in canonical Atome/runtime/domain registries outside the DOM.
- Browser events such as left click, double click, drag, resize, keyboard routing, flower menu routing, media transport, and MTRAX opening must recover only the `atome_id` from the DOM id and then consult the owning registry/correspondence table to decide behavior.

## Explicit Atome Open / eVe Closed Boundary Contract

The boundary is architectural, not cosmetic:

- Atome is open only for product-neutral contracts, framework runtime, API surfaces, security, sync, server/database infrastructure, AI/MCP orchestration, voice orchestration, audio/AV boundaries, and reusable assets.
- eVe is closed for product experience, product UI, private tools, panel chrome, Matrix/ribbon/flower/Finder workflows, product stores, branding, Molecule/MTraX behavior, and closed composition.
- Server and database are open infrastructure when they do not depend on product UI or product-only workflows.
- Tests may bridge layers to prove integration; source dependencies must still respect the owning layer.

Allowed dependency direction:

- eVe may depend on Atome open contracts.
- Generic system UI controls such as Button, Slider, Input, and Console belong to Atome when the control contract is product-neutral; eVe may compose them for ribbon, projection, flower, footer, toolbox, and panel surfaces but must not keep a parallel control source of truth.
- Atome must not depend on eVe closed implementation details.
- Atome may reach eVe capabilities only through injection, registered tools, runtime globals installed by product bootstrap, or explicit boundary modules with documented ownership.
- Cross-boundary calls must preserve command bus, policy checks, capability validation, audit logging, idempotency, and deterministic history semantics where the operation is effectful.

Forbidden boundary violations:

- Closed product UI, tools, stores, branding, Molecule/MTraX workflows, or panel behavior inside Atome open modules.
- eVe-local clones of open Atome security, sync, database, server, communication, audio, voice, AI, or MCP contracts.
- Direct durable state mutation from UI, panels, stores, imports, scripts, or MCP tools outside the canonical command/history path.
- Promotion of an eVe API, global, visual factory, or store to open framework status without an explicit Atome contract, tests, and synchronized map updates.
- Gesture, resize, and placement code reading canonical Atome geometry from DOM style or DOM offsets instead of described Atome state or an explicit description-derived cache.

Boundary debt:

- Product bootstrap references from Atome into eVe remain documented exceptions requiring targeted verification before structural changes.
- Project media persistence and projection are owned by `eVe/domains/media/api/media_persistence_service.js` and `eVe/domains/media/rendering/project_media_atome_renderer.js`; application examples must not recreate recording-path or media-source ownership.
- Legacy record-video bootstrap files still contain product media atome creation paths; they must preserve owner-scoped recording URLs until that ownership moves behind the shared media persistence boundary.
- Product-named server routes and closed product globals must be reviewed before they are treated as stable open APIs.
- Existing boundary debt is not permission for new cross-layer imports or duplicate service paths.
- Atome HTTP route ownership is split by responsibility: `server/atomeRoutes.orm.js` orchestrates registration and event commit helpers, `server/atomeCrudRoutes.js` owns CRUD handlers, `server/atomeEventRoutes.js` owns event/state/snapshot handlers, `server/atomeRouteContract.js` owns route-boundary formatting, and `server/atomeSyncRuntime.js` owns sync side effects.

## Main Layers

### Atome Open Framework

Primary paths:

- `atome/`
- `atome/src/squirrel/`
- `atome/src/application/audio_runtime/`
- `atome/security/`
- `atome/shared/`

Responsibilities:

- Squirrel framework APIs and product-neutral components.
- Audio, AV, STT, and backend runtime contracts.
- AI, MCP, voice, mail, contacts, calendar, and bank service contracts when product-neutral.
- Security, trusted server metadata, server verification, cloud sync, and sync queue primitives.
- Product-neutral Atome structure contracts such as `AtomGraph`, which may derive graph projections from canonical state/events but must stay independent from eVe UI and renderer-specific scene adapters.
- Generic assets and framework browser shell assets.

Dependency direction:

- Atome may depend on open server/database contracts, product-neutral utilities, and runtime adapters.
- Atome must not import closed eVe product UI, product workflows, private tools, or branding.
- When Atome needs a closed product capability, it must receive it through injection, runtime globals, registered capabilities, or an explicit boundary module.

Canonical extension points:

- `atome/src/squirrel/apis/` for Squirrel APIs.
- `atome/src/squirrel/apis/unified/` for Adole-style data APIs.
- `atome/src/squirrel/ai/` for AI/MCP orchestration.
- `atome/src/squirrel/voice/` for open voice orchestration and semantic contracts.
- `atome/src/squirrel/{mail,contacts,calendar,bank}/` for open communication service facades.
- `atome/src/application/audio_runtime/` for open audio and AV runtime contracts.
- `atome/src/application/audio_runtime/auv3_host_playback.js` for AUv3 host-routed media playback commands; eVe and MTraX consumers import this owner directly instead of mixing AUv3 playback command ownership into backend detection.
- `atome/security/` for product-neutral security and sync primitives.

Must not be duplicated by:

- eVe product-local security, sync, audio, communication, or AI orchestration bypasses.
- Product UI code embedded in Atome modules.
- Parallel service facades that do not reuse the open contracts listed in `maps/API_MAP.md`.

Status: Verified for ownership and major entry points through current maps and targeted source inspection.

### eVe Closed Product

Primary paths:

- `eVe/`
- `eVe/intuition/`
- `eVe/elements/`
- `eVe/domains/`
- `eVe/core/`
- `eVe/voice/`
- `eVe/i18n/`

Responsibilities:

- Product bootstrap and closed composition.
- Product UI shell, panels, tools, matrix, menu, ribbon, flower, projection, and Finder-facing workflows.
- Product design tokens, JavaScript visual factories, panel chrome, and i18n.
- Product stores for events, projects, media, browser, Tauri, and iOS adapters.
- Molecule/MTraX workflow, timeline, media editing, panel, preview, and product media runtime.
- Closed product voice surfaces that consume Atome voice contracts.
- Panel source-of-truth ownership: `eVe/intuition/panel_definitions.js` owns panel surface metadata, `eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js` owns eVeIntuition surface registration/open-close bridging, and `PanelCreatorV2` owns lifecycle execution. Tool runtime and menu surfaces must consume those contracts instead of declaring independent panel routing tables.
- Project media import intent is centralized in `eVe/intuition/runtime/project_media_import_runtime.js`; flower menu import and capture import must consume that runtime and must let `project_drop.importFilesToProjectViaCreator` remain the canonical media upload/project creation path.
- Flower contextual routing is owned by `eVe/intuition/flower/`: project-canvas Atome targeting reads the active project scene through lazy hit testing at menu-open time, active selection compatibility is computed outside the DOM, and mixed-kind multi-selection intentionally exposes only the `info` tool until a complete compatible batch-tool strategy is defined. A completed Flower long press owns bounded terminal-event guards: its native `pointercancel` is stopped before the captured BevyUI root can interpret it as `cancel`, and its derived `contextmenu` plus short compatibility-click window are consumed. Its pointer lock ends synchronously once that terminal event has crossed the earlier Bevy capture listener, so a subsequent press/release on a visible petal can always dispatch `activate`. Any subsequent primary `pointerdown`, including at the release point, is a new user gesture and uses the ordinary Flower close path. The Flower’s full-surface BevyUI root owns blank-space dismissal directly: `press` closes, while `release` stays passive unless the hit-test resolves a visible tool. During the opening animation, each petal’s center-origin hit is also dismissal rather than an invisible activation; only settled visible petals receive their normal activation handler. A genuine right-click is distinguished by its preceding secondary `pointerdown`, so it always retains the close contract. The Flower lock is a single shared contract in `context_pointer_lock.js`: `surface_runtime.js` cancels an active scene drag, while `bevy_ui_runtime.js` discards the pending `release`/`activate` of the control that received the initial primary press. This prevents that underlying control from closing a Flower opened by the same long press. Visible Flower interaction is owned by `eVe/intuition/ribbon/bevy_ui_flower_runtime.js` and `bevy_ui_flower_model.js`; it uses the shared BevyUI tree, captured pointer sessions, and the `flower` workspace layer. `bevy_ui_flower_motion.js` is the only opening/closing choreography owner: one interruption-safe animation-frame loop projects petal transforms and content opacity through `updateTreeMotion`, while a temporary procedural-SDF record supplies the short-range liquid core/bridges on the existing presentation layer. The four phases are `closed`, `opening`, `open`, and `closing`; reopening or closing samples the current frame instead of restarting or spawning another loop. `Back` is a submenu-only control, so root pointer movement over the center cannot trigger navigation or close the menu. The retired DOM Flower renderer is not an alternate path.
- Atome contextual editing is owned by `atome_contextual_edit_runtime.js` and `atome_contextual_edit_model.js`. Its registry is project-session runtime state outside Atomes and DOM; several Atomes may remain edited, one is active, and all visible chrome is one BevyUI projection on the shared project canvas. `dashboard_workspace_mode.js` notifies normalized mode changes: Dashboard and transition modes suspend and unmount the contextual projection without erasing its project session, return to the same project remounts it, and activation of another project clears that previous session. The fixed lateral rail, footers, fullscreen and slider expansion must reuse canonical scene gestures, tool definitions and mutation routes; the retired DOM footer lifecycle is not an alternate path.
- Tool latched-state ownership inside eVeIntuition is isolated in `eVe/intuition/runtime/eve_intuition/tool_latched_state_runtime.js`; menu state, panel surface events, and dialog-close synchronization must route through that runtime instead of local event listeners.
- Main menu content ownership stays in `eVe/intuition/eVeIntuition.js`; visible menu membership is product UI composition, while `tool_runtime.js` owns the executable tool ids. The normal visible main menu remains the existing ribbon API while BevyUI is introduced as a renderer foundation for panels and the later menu replacement. The visible sequence remains `home`, `find`, `capture`, `time`, `communicate`, `mode`, and `view`; `ai` remains an inline prompt route but is not exposed in the visible toolbox, `capture` is the product capture palette entry, the `time` palette exposes the calendar panel route without the old visible timeline child, the `mode` palette exposes perform/edit/consume intentions, and the `view` palette exposes list/table/natural view-mode intentions without creating DOM-owned view state.
- Intuition layer ordering is centralized in `eVe/intuition/runtime/layer_contract.js`: project tools, floating project palettes, Molecules, component/docked palettes, panels/dialogs, main ribbon, active drag.
- Palette child projection ownership is centralized in `eVe/intuition/shared/tool_children_projection_state.js`: renderers keep transient child lists in a WeakMap bound to the host element, while durable tool persistence remains in the tool instance store. DOM `data-*` attributes must not carry serialized palette child arrays.
- MTraX diagnostics are runtime-owned: `eVe/intuition/runtime/eve_intuition/mtrax_bridge_runtime.js` owns diagnostic flags and stack capture, while `eVe/intuition/runtime/mtrack_debug_snapshot.js` owns debug snapshot DOM cloning.
- MTraX hidden playback media elements and Molecule raster-pool media elements are runtime-owned resources, not model projection nodes. MTraX probe media must stay detached; Molecule raster-pool videos must mount below the closed raster-pool shadow root so upload URLs, local server origins, and `media_user_id` query state remain outside persisted or audited DOM snapshots.
- eVeIntuition app diagnostics are runtime-owned by `eVe/intuition/runtime/eve_intuition/debug_runtime.js`; `eVeIntuition.js` injects footer, media, selection, and Atome footer dependencies but must not own the `window.__DEBUG__` implementation or deterministic test-mode style rules.
- Atome DOM projection identity is centralized in `eVe/core/atome_dom_id.js`. eVe renderers, selection, event, media, and MTRAX runtimes must use this boundary for `eve-atome_<atome_id>` lookup and WeakMap/runtime metadata instead of writing Atome `data-*` attributes into final DOM.
- Runtime facts must not be reintroduced as class names or inline styles. `system.layer` stays in runtime state, selected visual state uses only `is-selected`, media/SVG categories use generic visual classes, and final media/SVG Atome hosts keep inline styles limited to dynamic geometry.
- Project-view and Matrix-tile projection metadata is centralized in `eVe/intuition/matrix/core/project_dom_state.js`. Project-scoped runtimes may derive the project id from `project_view_<id>` or this WeakMap registry, never from `data-project-id`.
- Unified Atome rendering projection is centralized in `eVe/domains/rendering/`: canonical Atome records are normalized into disposable `RenderAtom` values, scenes are hit-tested outside the DOM, project/matrix rendering zones use bounded WebGPU canvas surfaces, and text uses one hidden synchronized service root plus at most one active editor.
- Project wallpaper/background rendering is also centralized in `eVe/domains/rendering/`. `eVe/user/background.js` owns user preference loading, protected media authorization, stale-profile protection for local background preference updates, and consumption of `eve:profile-preferences-updated` for immediate background projection, but it must remain importable without starting the runtime; `eVe/eVe.js` explicitly calls `startUserBackgroundRuntime()` after `eve.user_background` imports, and a missing shell `#view` is an explicit startup error. Protected background reads select their authorization token from the resolved media owner: local Axum URLs use the local token and absolute Fastify URLs use the cloud token. Generated background parameters are owned by the Background panel modules, generated pixels come from `user_background_pattern_renderer.js`, preference-to-surface dispatch comes from `user_surface_background_texture_runtime.js`, and `bevy_surface_background_runtime.js` forwards a non-Atome surface-background patch to Bevy. Applied-background identity is scoped to the canvas plus its current WASM renderer instance, so renderer replacement on a reused Browser, Tauri, or iOS surface reapplies the latest background while duplicate updates to the same renderer remain suppressed. `surface_background_defaults.js` and the CSS custom property `--eve-default-surface-background` define the shared fallback project background color for the HTML shell and Bevy color-only surface patch; the default solid/no-pattern route must not manufacture a transparent texture. The explicit user wallpaper `download` action delegates remote image retrieval to the Fastify-owned `downloadRemoteWallpaper` upload/protected URL path before projection; local Axum/Tauri uploads must not own that remote-download route. The active project route uses an opaque Bevy canvas and must not depend on the removed `eve_background_visual_layer` DOM image layer.
- Universal Atome format ownership is split across `atome/src/shared/atome_contract.js` for canonical normalization/property sanitation, `atome/src/shared/atome_universal_contract.js` for universal schema defaults/type registry/capability-policy-lifecycle validation, `database/adole_storage_projection.js` for SQL storage row projection, `database/adole_schema_migrations.js` for additive schema migration ownership, and `database/adole_permissions.js` for SQL-backed ACL mutation/check ownership. SQL names such as `atome_id`, `atome_type`, `owner_id`, and `particles` are storage-boundary facts only and must not become a public Atome format or a legacy adapter API.
- Bevy integration is represented in JavaScript by `eVe/domains/rendering/render_atom.js`, `eVe/domains/rendering/virtual_scene_contract.js`, `eVe/domains/rendering/bevy_projection_adapter.js`, `eVe/domains/rendering/bevy_pending_media_contract.js`, `eVe/domains/rendering/bevy_media_texture_resolver.js`, `eVe/domains/rendering/bevy_media_resource_runtime.js`, `eVe/domains/rendering/bevy_web_presentation_runtime.js`, `eVe/domains/rendering/bevy_web_renderer_runtime.js`, `eVe/domains/rendering/bevy_web_applied_scene_runtime.js`, `eVe/domains/rendering/bevy_wasm_diagnostics_runtime.js`, `eVe/domains/rendering/bevy_ui_runtime.js`, `eVe/domains/rendering/bevy_native_renderer_runtime.js`, and `eVe/domains/rendering/project_scene_bevy_projection_runtime.js`; in shared open Atome Rust by `atome/renderers/bevy-core/`; in native Rust by the optional `platforms/desktop-tauri/src/bevy_backend/mod.rs` wrapper, `platforms/desktop-tauri/src/bevy_backend/bridge.rs`, and the iOS C ABI staticlib wrapper in `platforms/ios/bevy-renderer/`; and in browser/WASM Rust by `platforms/web/bevy-renderer/`. The JavaScript visual contract remains the renderer-agnostic `AtomeRenderNode` tree/diff/dirty-flag source derived from canonical Atome records, while the browser applied-scene baseline records only nodes already accepted by Bevy so skipped texture spawns/updates cannot make a disposable UI/tool image appear present before it is renderable. Bevy render DTOs/ops live in `atome/renderers/bevy-core/src/types.rs`, disposable Bevy ECS components/resources live in `atome/renderers/bevy-core/src/components.rs`, BevyUI tree ops/components/events live in `atome/renderers/bevy-core/src/ui/mod.rs`, and render operations, texture handling, live external-video components, render math, selection overlays, UI diagnostics, and video diagnostics live in Atome, not in platform-specific crates. Browser mode maps projection into the generated WASM renderer and exposes separate UI exports for BevyUI tree ops/events so Squirrel UI can target the same canvas without becoming a second source of truth; browser canvas pointer/mouse/wheel input for BevyUI is normalized by `bevy_ui_runtime.js` against the disposable UI tree and queued into the WASM event drain, preserving `drain_atome_bevy_ui_events()` as the browser BevyUI event surface. BevyUI overlay projection is scene-bound: during Dashboard/project workspace transitions, the target project scene is the active overlay destination before old-scene overlay cleanup runs, so the visible main menu is preserved by records rather than by DOM fallback, opacity changes, or visual compensation. Tauri project surfaces use the visible Bevy/WebGPU canvas unless the host explicitly declares a presentable native renderer through `window.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true`; iOS/AUv3 project surfaces dispatch the disposable Bevy scene and render-op contract through the native Swift bridge whenever `window.__ATOME_IOS_NATIVE_INVOKE` is available, while the WebView remains the application shell and host surface. These surfaces are not a full Virtual DOM and never own canonical Atome state.
- Browser surface-background registration is intentionally delayed until after `bevy_web_renderer_runtime.js` stores the canvas runtime state with `started: true`; this keeps wallpaper projection on the existing live Bevy canvas path and avoids a parallel background renderer.
- Browser Bevy/WASM startup resolves generated assets through same-origin `/wasm/...` URLs owned by the current page origin. The project renderer must not fetch `squirrel_bevy_renderer_bg.wasm` through a cross-port generated-module `import.meta.url`, because Safari rejects that CORS path and prevents the canonical Bevy/WebGPU surface from starting. On iOS/AUv3, `AudioSchemeHandler` resolves the path after removing query components but serves the original `atome://` request directly; versioned ES-module and WASM requests must never be redirected because WebKit rejects custom-scheme module redirects before the renderer can request its binary.
- iOS application and AUv3 resource packaging copies the Atome runtime with one filtered `rsync` boundary that excludes Rust `target` trees and `.git` metadata before data enters the product bundle. Packaging must not copy build artifacts first and prune them afterward, because the intermediate bundle can exhaust disk space and cannot represent a deterministic runtime resource set.
- Live project video must not be solved by copying the preview WebGPU renderer or adding a JavaScript side compositor beside Bevy. The direct JavaScript WebGPU probe proved browser `GPUExternalTexture` import/draw support, and `temp/c1_wgpu_external_texture_backend_probe/` proved the same concept through an isolated Bevy `RenderDevice` path. The maintained fork in `atome/renderers/wgpu-web-external-texture/` now provides the missing Web `wgpu` source descriptor, `GPUDevice.importExternalTexture`, and `BindingResource::ExternalTexture` resource mapping for the web renderer Cargo graph. `atome/renderers/bevy-core/src/video_external_texture.rs`, `atome/renderers/bevy-core/src/video_external_web.rs`, and `atome/renderers/bevy-core/assets/shaders/video_external.wgsl` integrate that support into the existing browser/WASM Bevy renderer without a JavaScript side compositor, visible DOM video overlay, live RGBA payload, or duplicate renderer. The external-video route carries the current compositor layer, opacity, color filters, transition parameters, and normalized crop `uv_rect` in the extracted video component and disables automatic batching on video meshes so each `ExternalTexture` bind group remains per-track while z-index ordering, local transform, crop/UV sampling, filters, and transitions stay inside Bevy's sorted 2D phase. Browser hidden-source timeline control is owned by `eVe/domains/rendering/bevy_video_decode_source_runtime.js`, which keeps the `HTMLVideoElement` resources fully transparent (`opacity:0`) and non-authoritative while applying trim, offset, speed, and loop before the frame is sampled; active playback uses `requestVideoFrameCallback` first and falls back to RAF only where RVFC is unavailable. `bevy_web_presentation_runtime.js` coalesces same-tick hidden-video frame notifications before the WASM boundary, and the web renderer applies video-frame redraw requests without adding a second wake after the queued notification already woke the reactive loop. High-frequency external render and video-frame event logging is opt-in in `bevy_perf_diagnostics_runtime.js`; the maintained fluency probe therefore measures the production-default path unless `BEVY_FLUENCY_EXTERNAL_RENDER_EVENTS=1` or `BEVY_FLUENCY_VIDEO_FRAME_EVENTS=1` is explicitly set. `temp/bevy_canvas_fluency_probe.mjs` records maintained JSON metrics plus stable-playback frame windows, project-canvas PNG/DPR evidence for 1/2/4/10 stream scenarios, and repeated 10-stream Google Chrome system acceptance attempts without adding a product renderer; the later focused 10-stream reports validate each expected visible video region in the centered `0.5` visual mapping and show wake pressure reduced from `6433` baseline wake calls to `731` in the opacity-zero hidden decode run. The latest stable-window visual recheck remains visually `ok:true` with 10 detected video regions, zero visible project media DOM nodes, zero readbacks/copies, global frame `p95 18.2 ms`, stable playback after pointer +1500 ms `p95 18.1 ms`, last 6000 ms `p95 18.2 ms`, and zero frames over 24/34/50 ms; `temp/browser_raf_floor_probe.mjs` shows blank RAF floor `p95 18.2-18.3 ms` across system Chrome default, no-Vulkan/Skia, Metal-angle, bundled Chromium, and headless launch variants without eVe, Bevy, or WebGPU scene code. Local transform and crop projection now flow through the standard Virtual Scene node/resource/transform/style operation path; the old direct `AtomeVideoTrack` / `VideoTrack*` mutation API and its WASM exports are deleted and guarded against reintroduction. A crates.io source check found the same upstream implementation gap in `wgpu 29.0.3`, which is the renderer dependency used by `bevy_render 0.19.0-rc.3`; a trunk source check on 2026-06-13 still showed web `create_external_texture` and `BindingResource::ExternalTexture` unimplemented, so a direct Bevy/wgpu version bump was not a compliant completion path at that date. `platforms/web/bevy-renderer/` exposes diagnostics-only `read_atome_bevy_video_backend_capabilities()` schema `atome.bevy.web.video_backend.v7`, reporting target/live backend `gpu_external_texture_texture_external`, Web `wgpu` external-texture create/source/resource support available through the maintained fork, and blocker `none`, without exposing a dead video-track capability. It also exposes diagnostics-only video copy counters from `atome/renderers/bevy-core/src/video_diagnostics.rs` for legacy/copy-pressure measurement, not as the active source-backed live video route. The browser route is delivered under the accepted browser-floor p95 validation, and future work must keep the fluency evidence green without reopening a second renderer path.
- Ephemeral browser camera frames reuse that same Bevy external-texture path. `bevy_video_hidden_dom_runtime.js` owns the one hidden media root contract; `bevy_video_stream_source_runtime.js` binds an existing controller-owned `MediaStream` to an overlay id, takes lookup priority over URL decode, and forwards at most 15 frame notifications per second through the shared Bevy redraw dispatcher. The binding is renderer-derived state only. Its cleanup cancels RVFC and detaches the hidden source without stopping tracks, mutating an Atome, creating a visible media element, or introducing another compositor.
- Renderer adapter registration is now an explicit JavaScript rendering-domain boundary. `eVe/domains/rendering/renderer_adapter_registry.js` owns immutable adapter metadata operations, while `eVe/domains/rendering/bevy_renderer_adapter_registry.js` declares the default Bevy support matrix and kind-specific node/resource mapping callbacks for `shape`, `text`, `image`, `video`, and `audio_waveform`. `bevy_projection_adapter.js` validates kinds through that registry, owns common payload validation/base fields, and delegates kind-specific projection to registered adapters.
- Render-surface sizing is centralized in `eVe/domains/rendering/surface_size_runtime.js` and consumed by `surface_runtime.js`. Host CSS size, raw device-pixel size, DPR, and optional GPU texture clamping are separate from logical Atome geometry; WebView resize must not mutate Atome positions or sizes. On browser/WASM, `surface_runtime.js` keeps the shared canvas CSS size in logical host units and synchronizes the backing-store only to physical dimensions that match the page DPR, while `bevy_web_renderer_runtime.js` forwards `width`, `height`, `pixel_width`, `pixel_height`, and `device_pixel_ratio` to Bevy startup and surface patches. Browser Bevy consumes the browser scale factor instead of forcing one, configures the window at the physical backing size, keeps the camera/projection and Atome records in logical coordinates, converges winit `WindowResized` events through the same shared `apply_surface` path as JavaScript surface patches, and `atome/renderers/bevy-core/` updates the camera projection on `apply_surface`. Scene diffs cross the JS/WASM boundary through `apply_atome_bevy_ops` batches; only direct async/resource/text/surface/background, transform, and opacity-style paths keep unit exports. `bevy_surface_backing_sync.js` keeps immediate backing sync plus strict attribute drift detection and must not reintroduce delayed repair timers that hide an incorrect surface contract. Browser image/SVG textures are rasterized at DPR-bounded physical density by `bevy_media_texture_resolver.js`; text textures keep the same route and may request a higher per-node texture scale through structured text style.
- Active project Atome visual rendering enters `eVe/domains/rendering/project_scene_runtime.js`. `project_scene_record_projection.js` owns project-record normalization and Bevy renderability filtering, `project_scene_record_preservation.js` owns ephemeral preservation gates, and `project_scene_hit_testing.js` owns client-coordinate point/rect queries against the disposable scene. Project-load ephemeral preservation is limited to non-dashboard overlays unless `window.eveDashboardBevyUiRuntime` is active for the same scene. Dashboard overlays are owned by `dashboard_bevy_ui_runtime.js`, and project visual clearing must diff the previous Virtual Scene against an empty scene before resetting projection state so Bevy receives despawns for old canvas entities. Foreground project rendering must resolve and claim `project_view_<projectId>` when the caller omits `host`; a project scene may not leave the shared `eve_surface_project` canvas attached to `#view` or to another workspace host after activation, reload, import, or switch. Transform-only updates use `project_scene_direct_transform_runtime.js`; Dashboard tree fade uses the Bevy UI runtime tree opacity path and keeps runtime records/virtual-scene caches aligned without creating a renderer branch. `surface_runtime.js` supports priority interaction layers ahead of the legacy singleton interceptor so canvas-owned UI overlays can intercept pointer/wheel input before Dashboard/project handlers without replacing them. `tool_genesis.js` may keep bounded project shell creation, but project Atome records must update the project scene and render through the Bevy web runtime instead of the removed `renderProjectAtTime()` / `project_scene_webgpu_adapter.js` legacy path or one visible `eve-atome_*` host with per-Atome interaction bindings.
- The legacy active project renderer family was removed after Bevy became the active project route: `render_at_time.js`, `project_scene_webgpu_adapter.js`, `image_adapter.js`, `video_adapter.js`, `waveform_adapter.js`, `text_adapter.js`, and `project_scene_selection_overlay.js` must not be reintroduced as fallbacks or parallel project renderers.
- Active project selection visuals are rendered inside the same project canvas through Bevy projection diffs. `project_scene_selection_state.js` derives selected ids from the existing selection runtime and `project_scene_runtime.js` marks disposable projection records; the browser Bevy adapter forwards `selected` and dense paint-order layer values in style patches; `atome/shared/render_visual_tokens.js` owns the cross-platform design values; and `atome/renderers/bevy-core/src/selection_overlay.rs` renders the visible dotted light-gray contour and progressively faded 12 px shadow blur as disposable Bevy entities above the selected object but below the next object already in front. No per-Atome DOM outline, host class, selection property, or legacy WebGPU selection overlay is allowed on the cleaned project route.
- Project drag, resize, and text editing are scene intents on the active project path. `surface_runtime.js` owns client-to-logical coordinate conversion before hit-testing so browser/device-pixel canvas scaling does not offset drag, resize, caret, or selection targets, and it handles native `dblclick` separately from `pointerdown` so browser click-count differences cannot block text edit re-entry. `surface_text_pointer_runtime.js` detects text edit re-entry, routes active text pointer sessions, gives active text caret/selection priority over resize except on the bottom-right corner, and marks active text targets from `project_scene_text_edit_state.js` without using DOM state. `surface_pointer_runtime.js` owns homothetic resize target calculation for active project single-selection and multi-selection gestures, deriving one uniform scale from canonical scene bounds before emitting `resize.move` or `resize.end` props; inactive text resize emits a recalculated `text_style.font_size` for crisp Bevy redraws, while active text resize emits only geometry. `project_scene_gesture_runtime.js` coalesces `drag.move` and `resize.move` bursts to animation-frame cadence, updates only disposable project scene records for live feedback, and batches realtime `gesture_frame` events for sharing. `inline_edit_session.js` owns the pure InlineEditSession mode contract for session id, project id, atom id, mode, activation source, initial/draft value, focus origin, overlay anchor, `tx_id`, optional gesture id, selection snapshot, and open/committed/cancelled transitions; it rejects DOM-bearing metadata and has no visible UI side effects. `inline_edit_close_overlay.js` owns the pure close-overlay action model for close, Escape, Enter, touch, and accessibility activation; it derives disposable overlay metadata from the session and returns commit/cancel/focus-restoration data without persisting overlay UI as Atomes. `project_scene_text_runtime.js` consumes that contract for active project text editing: it routes hidden keyboard input through `hidden_text_service_runtime.js`, records live draft changes in the active InlineEditSession, exposes that session through project scene text state, projects live multi-line text/cursor/selection feedback into disposable Bevy scene records, applies selected-range `rich_text.spans` formatting for bold and color, maps canvas pointer coordinates back to text indices, and commits clean text, rich spans, measured size, plus session `tx_id` through `text.commit`. `project_scene_invalidation_runtime.js` owns selection, video natural-size, and project-audio progress invalidation listeners, while `project_scene_direct_transform_runtime.js` owns direct Bevy transform patch construction for live gesture feedback and preserves canonical scale/rotation/origin during pointermove without durable commits. `drag.end`, `resize.end`, and `text.commit` persist through `set`/commit via `window.Atome.commit` or `window.Atome.commitBatch`; visible DOM text/edit hosts are not part of the active project route.
- Project lasso and click selection on the cleaned canvas route must consult `project_scene_runtime.js` scene hit-testing, not per-Atome DOM hosts. Lasso can start only when the scene hit-test reports empty space, then selected scene Atome ids flow through the existing selection runtime.
- Project-visible media Atomes on the cleaned canvas route may be opened in Molecule from canonical Atome state and `project_scene_runtime` records without requiring a visible Atome DOM host. Recording Atomes must use canonical recording kinds (`audio_recording` / `video_recording`) for project projection even when browser-local recording storage returns an IDB-local id first; audio recordings persist waveform peaks on the Atome so Bevy can draw the waveform after refresh without source re-decoding. Recording Atomes that already exist before final project projection must still be associated to the active project through the canonical commit path before scene rendering, otherwise refresh and project-list reconstruction can diverge. The Molecule timeline payload is derived from Atome properties and remains outside DOM attributes.
- T24 cleanup boundary: legacy DOM renderers, footer chrome, tool docks, and docked MTraX/Molecule UI remain product chrome or non-project presentation domains. They must not become active-project inline-edit owners, accessibility graph owners, focus-restoration stores, or substitutes for `project_scene_runtime` records. Any future dock/footer removal or split must preserve Molecule open behavior through canonical Atome state and explicit MTraX/Molecule APIs, not through `[data-atome-id]` host recovery.
- Active project resize gestures are resolved centrally in `surface_runtime.js` from scene hit-test bounds and logical canvas edge handles, with final resize geometry computed homothetically by `surface_pointer_runtime.js`. The resize edge band includes 5 logical px of additional inward tolerance so near-edge interior pointer starts choose resize before drag or lasso; this tolerance remains runtime hit-testing data and does not alter canonical Atome geometry. Legacy per-host resize listeners remain only for non-project DOM-rendered UI until those owners are separately migrated.
- `eVe/intuition/runtime/project_scene_render_bridge.js` is the extraction point that keeps `tool_genesis.js` from owning project-scene dispatch directly. Further `tool_genesis.js` reductions should move cohesive non-project responsibilities behind similarly explicit owners.
- `eVe/intuition/runtime/tool_genesis_spec_runtime.js`, `tool_genesis_mount_runtime.js`, `tool_genesis_properties_runtime.js`, `tool_genesis_create_runtime.js`, `tool_genesis_record_runtime.js`, `tool_genesis_host_runtime.js`, `tool_genesis_render_state_runtime.js`, `tool_genesis_project_load_runtime.js`, `tool_genesis_realtime_patch_runtime.js`, `tool_genesis_media_runtime.js`, `tool_genesis_group_runtime.js`, `tool_genesis_mutation_runtime.js`, `tool_genesis_projection_support_runtime.js`, `tool_genesis_lifecycle_runtime.js`, `tool_genesis_host_lifecycle_runtime.js`, `tool_genesis_core_services_runtime.js`, `tool_genesis_public_runtime.js`, and `tool_genesis_bootstrap_runtime.js` now own the creation/spec/mount/record/legacy-host/project-load/realtime/media/group/mutation/projection-support/lifecycle/public-bootstrap pipeline behind `tool_genesis.js`: spec presets and sizing, disposable root/layer mount resolution, sanitized property construction, commit -> state refresh -> optional render orchestration, record-to-spec conversion, legacy host creation, render-state reconciliation, project Atome load/filter/Bevy scene dispatch orchestration, realtime projection patching, media helper runtime wiring, group visual wiring, canonical mutation dispatch, projection normalization, project/user/shared-override lifecycle, host registry/index/diagnostic composition, cross-service setup, and public runtime installation. Project scene rendering stays in `project_scene_runtime.js` / `project_scene_render_bridge.js`; `tool_genesis_render_state_runtime.js` must route project parents to that bridge before any legacy host creation, and `tool_genesis_project_load_runtime.js` must render loaded project records through `renderProjectScene()`.
- `eVe/intuition/runtime/atome_description_frame_runtime.js` owns description-frame memory formerly embedded in `tool_genesis.js`, keeping frame lookup separate from Atome host creation.
- `eVe/intuition/runtime/media_integrity_runtime.js` owns legacy non-project media-host integrity registries and repair observers. This keeps media text-patch sanitization and host repair state out of `tool_genesis.js` while preserving the existing non-project media path until that path has its own full scene-render replacement.
- `eVe/intuition/runtime/shape_svg_runtime.js` owns legacy non-project SVG shape projection: SVG shape detection, data-url decoding, protected SVG fetch, mounting, and fetched-markup persistence through the canonical Atome commit API. The active project scene path must keep using RenderAtom/WebGPU instead of this DOM mounting path.
- `eVe/intuition/runtime/group_visual_runtime.js` owns legacy non-project group visual orchestration and runtime-only membership bookkeeping. `eVe/intuition/runtime/group_visual_preview_runtime.js` owns the disposable preview DOM mounted for non-project group hosts only. Neither module may store canonical group state in DOM attributes or render active project group Atomes outside `project_scene_runtime.js`.
- `eVe/intuition/runtime/media_source_runtime.js` owns legacy media source normalization behind `tool_genesis.js`. It classifies upload versus recording sources, resolves bundled assets, normalizes protected API media routes, preserves owner-scoped media query data, and injects local/Tauri credential policy without owning media mounting, hydration side effects, or canonical media state.
- `eVe/intuition/runtime/media_hydration_runtime.js` owns protected media hydration side effects behind the legacy projection path: local availability checks, authenticated fetches, Tauri streaming URLs, blob attachment/revocation, and projection-source updates. It must not own canonical media state, media source classification, or active project scene rendering.
- `eVe/intuition/runtime/media_mount_runtime.js` owns legacy media visual mounting side effects through the Molecule media runtime: media child cleanup, `mountVisual()` dispatch, projection error updates, video poster application, and preview scrub. It must remain projection plumbing and must not replace active project media rendering in `project_scene_runtime.js`.
- `eVe/intuition/runtime/atome_host_registry_runtime.js` owns legacy non-project host projection lifecycle state formerly embedded in `tool_genesis.js`: rendered-host caches, rebinding, rendered checks, host removal, and media resource cleanup. It is not a canonical Atome registry and must not decide active project rendering or durable state ownership.
- `eVe/intuition/runtime/project_atome_index_runtime.js` owns project Atome load/index lifecycle state formerly embedded in `tool_genesis.js`: remembered renderable IDs, project snapshots, in-flight load de-duplication, recent-load cache reads, and scoped cache clearing. It is not durable Atome state and must not replace `project_scene_runtime.js` as the active project rendering owner.
- `eVe/intuition/runtime/shared_project_override_runtime.js` owns shared Atome project override cache/persistence/fetch/pruning behind `tool_genesis.js`. It may hydrate fetched shared records with the target project id before scene invalidation, but canonical sharing, ownership, and project membership remain outside this bridge.
- Server sharing ownership is split so `server/sharing.js` orchestrates share message workflows, `server/sharingPermissionService.js` owns permission primitives and ACL listing, and `server/sharingAtomeAccessors.js` owns canonical Atome field reads. Sharing code must consume canonical Atome accessors instead of assuming SQL row shapes as Atome records.
- `eVe/intuition/runtime/implicit_gesture_commit_runtime.js` owns implicit gesture commit routing behind `tool_genesis.js`. It translates canonical gesture event batches into tool-gateway actions, marks self patches for realtime dedupe, suppresses duplicate gesture phases briefly, and delegates non-gesture batches to `window.Atome.commitBatch`; durable mutation ownership remains the canonical Atome/tool pipeline.
- `eVe/intuition/runtime/realtime_atome_events_runtime.js` owns legacy realtime binding behind `tool_genesis.js`: event bus listeners, DOM Atome event listeners, realtime update/delete routing, and media textual patch sanitation. `eVe/intuition/runtime/tool_genesis_realtime_patch_runtime.js` owns the paired realtime projection patch applicator for legacy non-project hosts and active project scene records; active project visual updates must enter `project_scene_runtime.js`, while legacy host patching remains disposable projection only. Canonical mutation ordering and durable Atome state remain outside DOM and outside both runtimes.
- `eVe/intuition/runtime/persistence_diag_runtime.js` owns temporary persistence diagnostics and compact record summaries for `tool_genesis.js` load/render tracing. It is observability-only and must not become a persistence policy owner, state source, or rendering decision point.
- `eVe/intuition/runtime/info_panel_sync_runtime.js` owns legacy info panel projection notifications behind `tool_genesis.js`. It computes panel-facing position/resize payloads, including right/bottom derivations, but it must not write canonical Atome state or own layout policy.
- Legacy project-adjacent tools that restore, assign, share, or replay project Atomes must treat project-visible updates as scene invalidations through `project_scene_runtime.js`. `delete.js`, `infos.js`, `communication.js`, and project-scoped timeline replay are not allowed to resurrect `renderAtomeRecord()` as an active project visual path.
- Matrix and Dashboard project preview rendering use `eVe/domains/rendering/project_preview_runtime.js`, which delegates to `matrix_preview_renderer.js` and the shared WebGPU compositor after filtering dashboard/background/wallpaper records. Matrix DOM tile application remains inside `eVe/intuition/matrix/core/preview.js`, while preview capture and canonical persistence (`preview_url`, `preview_width`, `preview_height`, `preview_updated_at` through `Atome.commit`) are reusable renderer responsibilities for Dashboard projects. Browser Dashboard previews use `bevy_project_preview_capture_adapter.js` to keep one hidden `/eve_preview_capture.html` iframe ready from project activation, then fit the complete active-project viewport homothetically inside the DPR-scaled `640x400` maximum output box on one reusable Bevy/WebGPU preview canvas. `bevy_surface_background_runtime.js` publishes the same canonical project surface descriptor into that capture canvas, so empty or transparent-content projects produce an opaque valid preview without weakening empty-pixel validation. Atome content bounds never become capture bounds. Default Dashboard boot must consume persisted preview descriptors only and must not force current-project preview hydration or call a project loader before a project-card click; explicit project close resolves the active project through `AdoleAPI.projects`, starts Projects preview hydration before non-critical categories, and failed persistence surfaces an error instead of a non-persisted preview source. Dashboard card images then pass through the product-neutral image texture path: `render_atom.js` carries disposable `media_fit` / `object_fit`, `bevy_media_texture_image_fit.js` computes contain/cover draw rectangles and rounded alpha clipping, and `bevy_media_texture_resolver.js` rasterizes the fitted texture for Bevy. Active previews must come from current project scene records or merged project-loader records and shared render targets, not live embedded projects in cards, `html2canvas`, SVG `foreignObject`, cloned DOM, DOM screenshots, CSS clipping, per-item canvases, or symbolic DOM scans.
- Matrix tile interactions are centralized in `eVe/intuition/matrix/ui/matrix_interaction_runtime.js`. Tile open, menu, create, and label-edit intents must be resolved by one scroll-surface gesture binding and scene hit testing rather than per-project preview/tile listeners.
- The shared render-at-time entry point in `eVe/domains/rendering/webgpu_compositor.js` is the architectural entry for interactive display, previews, animation, and export targets. It must consume the existing WebGPU adapter infrastructure and must not grow separate UI, preview, and export renderers.
- Global visual tiers must use distinct HTML layer nodes under `#intuition`; z-index values alone are not sufficient when tools, Molecules, docked palettes, panels, and drag items coexist.
- Shared product-tool slider ownership now lives in the open Atome/Squirrel component layer at `atome/src/squirrel/components/tool_slider_builder.js`; eVe consumers must use that owner through the shared wrapper/re-export surfaces instead of keeping feature-local slider DOM or gesture logic.
- Background text creation has one geometry owner per phase: `text_creation_session.js` owns the synchronous focusable provisional surface, `ui.text.create` owns the canonical Atome frame written through creation, and `text_fit_runtime.js` owns later content-driven growth without moving the original click coordinate.
- IntuitionX projection tools keep static visual constants class-owned in `eVe/elements/eVe_look.js`; projection runtimes may expose active/hover/kind state through data attributes and may keep slider width inline only while the slider control is dynamically resized.

Dependency direction:

- eVe may consume Atome open contracts.
- eVe may own closed adapters around product workflows.
- eVe must not reimplement generic Atome security, server, sync, persistence, communication, or audio contracts.
- eVe closed APIs must not be promoted to Atome without an explicit open contract, tests, and map updates.

Canonical extension points:

- `eVe/intuition/runtime/` for closed UI/tool runtime surfaces.
- `eVe/intuition/tools/core/` for tool registry, runtime, interaction, and tool definition SSOT.
- `eVe/intuition/tools/` for product tools.
- `eVe/intuition/tools/clipboard/` for shared closed copy/paste state, clipboard payload normalization, system clipboard bridge behavior, and paste event generation behind the copy/paste product tools.
- `eVe/elements/` for product design factories, tokens, and i18n-bound UI construction.
- `eVe/domains/*/api/` for closed domain APIs.
- `eVe/core/*_store/` for closed product store adapters.
- `eVe/domains/mtrax/` and `eVe/intuition/tools/molecule/` for closed Molecule/MTraX workflows.
- Linked audio for dropped video files is owned inside `eVe/domains/mtrax/clips/` and must consume the existing MTraX descriptor media resolver and extraction/conversion path instead of introducing a parallel audio import pipeline.

Must not be duplicated by:

- Atome open product-specific UI.
- New product stores outside the existing store families without a documented ownership reason.
- Panel-local styling or tool behavior that bypasses the shared eVe visual and tool runtime contracts.
- Application example files that bypass the closed Intuition BevyUI registry to replace product menu content or theme.
- Feature-local slider interaction readers keyed only to legacy toolbox/projection class names when the canonical shared slider data-role contract already exists.

Status: Verified for major layer responsibilities through current maps and targeted source inspection.

### Server and Database Infrastructure

Primary paths:

- `server/`
- `database/`

Responsibilities:

- Fastify server bootstrap, auth, routes, WebSocket endpoints, file/user/sharing services, mail gateway, visio, operational logging, and sync.
- Database driver selection and Atome persistence over `atomes`, `particles`, `particles_versions`, `events`, `state_current`, `snapshots`, `permissions`, and `sync_queue`.
- Durable event commit and current-state projection.
- Deferred owner or parent references stored through `_pending_owner_id` or `_pending_parent_id` must resolve both the identity row in `atomes` and the matching `state_current` projection metadata, so runtime current-state reads do not diverge from persistence identity reads.

Dependency direction:

- Server/database may depend on Atome product-neutral shared helpers and open service contracts.
- Server/database must not depend on eVe product UI.
- Product-specific routes or names must be treated as boundary debt until explicitly reviewed.

Canonical extension points:

- `server/atomeRoutes.orm.js` for server-side Atome event commit helpers.
- `database/adole.js` and `database/driver.js` for SQL persistence and database driver concerns.
- `server/wsApiState.js`, `server/wsSend.js`, `server/wsApiIdentity.js`, `server/wsAtomeOperations.js`, and `server/wsSyncSecurity.js` for WebSocket runtime state, identity, operations, and notification authorization.
- Existing route modules for their own families only, with size reduction required before feature growth in oversized files.
- Login pre-auth account lookup and phone verification belong to the existing auth/WebSocket boundary: the eVe login shell first calls `AdoleAPI.auth.lookupPhone(...)` on the active auth backend. A found local account skips OTP and moves directly to password; an explicit `User not found` launches `AdoleAPI.auth.requestPhoneVerification(...)`, then `AdoleAPI.auth.verifyPhoneVerification(...)`, and only after a successful check may it call `AdoleAPI.auth.bootstrap(...)`. Lookup failures other than explicit absence are hard failures and must not request OTP. The OTP secret is a transient auth artifact; in test/demo mode it may be projected in the login shell instruction band, but it must not become Atome state, DOM-owned canonical state, durable project state, or a production response field. The explicit local test launcher `./run.sh --test` may set `SQUIRREL_AUTH_OTP_BYPASS=1`; Fastify and Tauri/Axum may then return `otpBypassed: true` only outside production, after request validation and rate limiting, so the login shell skips the OTP entry step without bypassing password/bootstrap. After local password validation, `user_auth_flow_runtime.js` may call the login shell's internal `onAuthenticating` callback before `bootstrap` so the user gets neutral immediate wait feedback; after successful `bootstrap`, it may call `onAuthenticated` before profile restoration, current-project creation, tool-catalog refresh, dashboard open, and menu reveal without awaiting that visual animation. These callbacks are disposable UI acknowledgements only and must not become auth/session authority.
- The login shell owns only a transient visual choreography. Its persistent logo may dock to the Bevy main-menu Atome item during final reveal; the deleted DOM ribbon auth-dock path must not be reintroduced as a second competing post-auth movement.

Must not be duplicated by:

- Direct SQL from UI or product modules.
- Independent persistence code outside database and server commit boundaries.
- HTTP polling or non-WebSocket communication paths for framework communication.

Status: Verified for route families and persistence boundary through `maps/API_MAP.md`, `eVe/documentations/atome_persistence_contract.md`, and targeted search. Oversized server files require reduction before feature growth.

### Tests, Probes, and Temporary Artifacts

Primary paths:

- `tests/`
- colocated `*.test.mjs` files under owning modules
- `temp/`

Responsibilities:

- Persistent tests live under `tests/` or colocated where the project already owns targeted module tests.
- Temporary probes, reports, generated diagnostics, and transient scripts live only under `temp/`.
- Recording boundary coverage is owned by `tests/probes/capture_tool_recording_boundary_probe.test.mjs`, `tests/probes/molecule_audio_capture_adapter.test.mjs`, `tests/probes/molecule_recording_session.test.mjs`, `tests/probes/molecule_recording_runtime.test.mjs`, `tests/probes/audio_browser_recording_flush_contract.test.mjs`, `tests/atome/audio_sample_accurate_recording.test.mjs`, `tests/atome/record_audio_auv3_clock_contract.test.mjs`, `tests/probes/video_recording_stop_contract.test.mjs`, `tests/probes/video_recording_failure_lifecycle.test.mjs`, `tests/probes/native_video_recording_recovery_contract.test.mjs`, `tests/probes/native_video_public_commit_ack_contract.test.mjs`, `tests/probes/filesystem_deletion_transaction_contract.test.mjs`, and `tests/native/recorder_core_frame_contract.cpp`.

Dependency direction:

- Tests may exercise Atome, eVe, server, and database boundaries.
- Temporary probes must not become maintained source or documentation.

Status: Verified by repository tree inspection and existing scripts.

## Runtime Modes

The architecture targets these runtime modes with the same Atome contract, command/history policy, sharing model, and synchronization rules:

- Web browser: Fastify, WebGPU, Kira WASM, Symphonia WASM.
- Tauri desktop: local Axum, WebGPU, native Kira, native Symphonia, and feature-gated native Bevy command routing for the main project surface through the shared Atome Bevy core instead of the browser/WASM renderer.
- iOS AiS companion app: AIS server, native SQLite iOS, WebGPU, native Kira, native Symphonia, and a native Bevy command boundary backed by a linked Rust Bevy staticlib; successful Rust scene validation is accepted by the import flow, and the native Metal/Bevy presenter still must be connected before the iOS main project surface can visually render.
- AUv3: AIS server, native SQLite iOS, WebGPU, native Kira, native Symphonia, no blocking or allocation-prone realtime audio work.
- FreeBSD Pure OS: native FreeBSD runtime, Fastify server, auto-launched WebView, native Kira, native Symphonia.

Runtime parity rule:

- A feature shipped in one mode must either keep the same Atome, tool, history, sharing, and sync semantics in all supported modes, or return an explicit typed unsupported-mode error.
- Platform differences belong in adapters, not in duplicated business logic.

Connection rules:

- Tauri UI may initiate to local Axum, then sync outward to Fastify.
- Browser targets Fastify only.
- AiS targets Fastify.
- AUv3 coordinates with the companion app and approved local channels.
- Cloud Fastify must not initiate to client-local Tauri or Axum services.
- Communication must be centralized and WebSocket-based for framework communication.

Status: Derived from `.codex/AGENTS.md` and `eVe/eVe_essentials.md`; specific adapter implementations must be verified before mutation.

## Recording Control and Sample-Clock Boundary

- The visible audio, video, and detail-record controls are BevyUI tool projections, not recorder implementations. Their actions traverse `eVe/intuition/tools/core/tool_runtime_recording_handlers.js` into the registered `capture.js` handlers, then reach the real product controllers in `eVe/domains/media/api/audio_api.js` and `eVe/domains/media/api/video_recording_controller.js`. Latch state reflects controller results; it cannot substitute for start/stop side effects.
- Generic audio and video recording remains available through the existing runtime-specific controllers. A successful generic capture does not imply a sample-accurate overdub guarantee.
- Exact overdub is a narrower typed capability owned by `atome/src/application/audio_runtime/sample_accurate_recording.js`. It is enabled only by the explicit native `requireSampleAccurate` flag and supported only for AUv3 `plugin_input`. Capture uses `clock_id: "auv3.render"` / `clock_reference: "record_start_render_quantum"`; placement uses `timeline_clock_id: "auv3.host_transport"`, with the native `clock_epoch` and `timeline_origin_frame` returned by `record_started`. The `plugin` source remains generic plugin-output/mix capture. Browser, desktop/Tauri, ordinary iOS app, microphone/plugin-output exact capture, and exact video capture return `av_sample_accurate_overdub_unsupported` until they expose a measured common duplex clock or audio-sample PTS mapping.
- Exact timing crosses boundaries only as safe integer frames: host-transport origin/sample rate at start; recording start, real earlier playback start, same-quantum playback observation, frame count, strictly positive `input_latency_frames`, `output_latency_frames`, `roundtrip_latency_frames`, `record_offset_frames_applied`, overrun count, and discontinuity count at stop. The invariants are `playback_start_frame < recording_start_frame`, `playback_observed_frame == recording_start_frame`, `roundtrip_latency_frames == input_latency_frames + output_latency_frames`, and `record_offset_frames_applied == roundtrip_latency_frames`. Timeline placement is `timeline_origin_frame - roundtrip_latency_frames`, with negative placement represented by `source_in_frame`; the playback-start delta is validation evidence and is not applied again. Any mismatch, missing/non-positive latency evidence, overrun, or discontinuity rejects the exact take instead of silently degrading to seconds or wall-clock time.
- Molecule consumes the installed `createMoleculeRecordingCaptureAdapter` from `audio_api.js`; it does not own another audio engine. `eVe/intuition/tools/molecule/recording/index.js` validates the armed track/capability, builds the frame-exact clip, and commits only through the active session. `eVe/intuition/tools/molecule/runtime.js` exposes read/start/stop/cancel and disposes active capture on close. The persisted timeline keeps integer frame fields and recording-clock metadata; seconds are derived projections for existing render/edit consumers.
- Exact capture finalization and clip commit are two explicit phases. Once capture, timing validation, and media-Atome persistence succeed, the Molecule coordinator caches the immutable finalized result. If `session.apply("molecule.clip.add", clip)` fails, state becomes `commit_failed`; a later `stop()` retries only the canonical clip commit with the same media Atome and never stops or persists the backend a second time.
- Generic video recording stays on the existing controllers and owns no visible DOM `<video>`/`<img>` renderer or native preview overlay. During recording, `capture_recording_feedback_runtime.js` binds the controller-owned browser/Tauri stream to the shared Bevy external-image route, or polls the latest bounded iOS `AVCaptureVideoDataOutput` frame and submits it as a Bevy texture. The feedback consumer never owns recorder tracks, is capped at 15 fps and 96 x 96 native pixels, and is cleared before persistence completion can expose a stale frame. Exact video remains a typed refusal rather than an approximate timing path.
- Audio recording feedback is derived from the same recorded PCM: browser worklet chunks, Tauri's lock-free fixed 64-bin metering snapshot, and iOS/AUv3 fixed native scope buffers publish bounded min/max pairs outside canonical state. `record_audio_scope_transport.js` owns the session-bound latest-frame registry and subscriptions, including early-frame replay, strict sequence rejection, terminal cleanup, and one bounded first-error diagnostic; native events are compatibility notifications rather than the required transport. Tauri's `audio-engine` capability explicitly authorizes `audio_get_scope`. The Bevy menu derives a disposable rolling 64-column history from those real frames. UI polling and changed-history projection are capped at 30 Hz; zero input remains motionless, and the real-time callbacks allocate no scope containers, take no locks, log nothing, and perform no scope disk writes.
- Browser video finalization freezes the terminal MediaRecorder payload, validates non-empty bytes, positive duration, and a video MIME result, then retries persistence/project association with stable recording and upload identities when a durable write fails. Retryable stop or project-association failures retain the controller and capture-tool feedback; only confirmed discard, terminal resource failure, or durable project association clears it.
- Audio capture allocates one `audio_recording_*` project Atome ID before backend start, exposes it in recording state, and reuses it for every stop, retry, persistence, and Molecule association. A different stop-only ID fails with `audio_recording_project_identity_mismatch`. AUv3 `record_error` carries relative/absolute paths, `discarded`, and `discard_error`; an unconfirmed deletion retains the controller and path so physical cleanup can be retried without a second native `recordStop`.
- Native iOS video uses one serialized recovery protocol: `media_video_record_state` discovers active or cached terminal work after WebView reload; `media_video_record_stop` coalesces callers and validates the encoded file; `media_video_record_cancel` physically discards it; and `media_video_record_ack` releases the cached successful terminal result only after the project media Atome is durable. Swift start/stop watchdogs bound missing delegate callbacks, cleanup failures remain recoverable, and a new start is rejected while unacknowledged terminal work exists.
- `WebViewManager.swift` remains the sole shared WebView/native-bridge composition owner. Its script-message, audio/transport, navigation/permission, and IPC responsibilities live in `WebViewManagerScriptMessages.swift`, `WebViewManagerAudioTransport.swift`, `WebViewManagerNavigation.swift`, and `WebViewManagerIPC.swift`; this structural split preserves one invoke and transport boundary rather than introducing parallel bridges.
- Native audio stop first closes producer admission, waits until every in-flight realtime push leaves the producer boundary, marks the producer drained, and lets the writer empty the ring before the final WAV header and frame count are emitted. A timing/protocol failure after file creation is terminal but recoverable through explicit physical deletion; failure to delete remains retryable and cannot be reported as successful discard.

## Canonical Data and Mutation Flow

Durable mutation flow:

```text
Human / AI / Voice / MCP / Script / Automation
  -> tool or runtime capability
  -> command / policy / capability / idempotency checks
  -> window.Atome.commit or window.Atome.commitBatch
  -> server event commit helper
  -> database/adole.js
  -> append-only events and property versions
  -> state_current projection
  -> WebSocket sync and deterministic replay
```

Rules:

- Tools are the canonical mutation entry point.
- Tool execution emits intentions and property-level diffs; history must not depend on re-executing arbitrary tool code to rebuild state.
- Runtime state is derived and rebuildable.
- Event history and property versions are authoritative.
- Molecule session history is timeline-scoped: durable Molecule commands append history events, undo/redo restore deterministic timeline snapshots, and keyboard handling inside a Molecule must not fall through to global Atome selection undo.
- Validation states and snapshots are explicit and immutable anchors.
- Direct UI, panel, import handler, store, or domain mutation of durable Atome state is forbidden.
- Soft-delete is the durable deletion model for canonical Atome history.

Primary sources:

- `todo/ai_voice/history_and_ai.md`
- `eVe/documentations/atome_persistence_contract.md`
- `eVe/eVe_essentials.md`
- `maps/API_MAP.md`

Status: Documented as the target architecture. Individual legacy code paths must be verified during relevant implementation phases.

## UI, Design, and Rendering Separation

UI ownership:

- Atome owns product-neutral Squirrel components and framework shell assets.
- eVe owns product UI, panels, tools, design tokens, JavaScript visual factories, and product styling behavior.

Design source of truth:

- Product design is JavaScript-driven and documented in `maps/DESIGN_MAP.md`.
- Product styling must use structured JavaScript objects, token modules, approved visual factories, and documented CSS variable installation points.
- Static CSS files are framework, vendor, or generated exceptions, not the eVe product design source of truth.

Rendering and identity:

- UI elements must have stable, traceable identity.
- Product UI should route through Squirrel/eVe factories and layer contracts.
- Panel UI must respect the header/body/tools/footer panel contract.
- Panel body remains the scrollable region when the panel contract applies.
- DOM projection attributes must stay limited to short references, renderer hints, roles, and transient interaction flags. Group timelines, group steps, members, media sources, media identifiers, local paths, previews, caches, and serialized Atome state must stay in Atome properties, timeline persistence, media stores, or disposable non-serialized renderer state, never in `data-*` attributes such as `data-media-src` or `data-eve-media-source`.
- Persisted project media Atomes must pass an explicit integrity contract before commit/render: stable source ref, renderable media kind, duration for audio/video, visual ref, and visual status. Generated waveform/thumbnail refs are model properties, not DOM attributes.
- Durable media cache artifacts must be lightweight canonical properties or media-store refs only: SVG source/markup, video poster data URLs or poster refs, and waveform peak arrays or waveform refs. Full RGBA payloads, GPU textures, Bevy `Image` assets, canvas snapshots, decoded media elements, and WebGPU buffers are disposable renderer resources derived from those canonical artifacts and must not be persisted as Atome truth.
- Import and recording restoration coverage must include every maintained audio/video fixture and must validate reconstruction from serialized canonical properties after DOM teardown. Browser media probes can validate playback, but local Node contract tests must continue to guard the persistence boundary without requiring auth or a running server.
- Project DOM teardown tests must include mixed project content: normal Atomes, grouped Atomes, media Atomes, timeline tracks, clips, waveform refs, and thumbnail refs. The pass condition is reconstruction from canonical serialized properties only; stale DOM attributes are never accepted as restoration input.
- Media diagnostics inspect canonical media/runtime state and lightweight projection evidence only. A visible renderer-owned project host is acceptable evidence for imports whose minimal DOM projection intentionally has no native `<img>`, `<video>`, `<audio>`, or inline `<svg>` child.
- Audio/video recording stop flows must create and project a project-visible source Atome through the existing media Atome creation path and active project id. Direct audio/video recording facades that already commit the recording Atome must call the project media renderer after commit; timeline clips remain derived Molecule content and must not replace the canonical project Atome created for the recording.
- Matrix slot state is logical state, not a permanent DOM grid. The Matrix DOM may expose project tiles and the first actionable empty creation tile; repeated empty slots are represented by layout math and CSS grid positioning through `matrix_virtual_slots.js`.
- MTraX timeline ticks are dense renderer output. Interactive loop and marker zones remain
  bounded UI controls, while repeated ruler ticks and labels use the single canonical
  canvas/Bevy rendering route. A missing renderer is an explicit unsupported/error state;
  no DOM tick fallback is retained.
- MTraX close orchestration must complete canonical teardown before the public close API resolves. Close may preserve dormant metadata for desktop restoration, but stale runtime clips, queued prewarm, close-time preview export, and post-commit verification must not block or repopulate a closed panel.
- Mutation ownership is enforced by `scripts/check_mutation_ownership_guardrails.mjs`: `state_current` is a projection read surface outside server route owners, runtime durable writes must enter through the canonical event commit owner rather than ad hoc HTTP calls, timeline replay baselines must never be recovered from DOM projection state before backend apply, and timeline preview/replay code must never produce backend commits from DOM projection reads.
- WebSocket-only transport ownership is enforced by `scripts/check_websocket_only_transport.mjs` through `npm run check:websocket-only-transport`. It rejects maintained HTTP Atome business calls, HTTP remote-control commands, generic WebSocket-to-HTTP tunnels, and unauthenticated `/ws/sync` composition.
- New project Atomes created through `toolBase.createAtome` follow the command sequence `buildCreateAtomeCommand -> validateCreateAtomeCommand -> commitCreateAtome -> refreshCreatedAtomeState -> renderCreatedAtome`. DOM hosts and `renderedAtomes` / `renderedAtomeHosts` are render caches only and are populated after commit; `{ render: false }` keeps creation canonical without dispatching projection events.
- Event projection invariants are enforced at `database/adole.js`: append-only events update `particles` and `state_current` in one transaction, duplicate event ids do not advance projection version, and reserved envelope fields are stripped from projected properties.
- Durable undo/redo grouping is defined by `database/adole_history_transactions.js`: event rows are sorted deterministically, grouped by `tx_id`, continuous `gesture_start`/`gesture_frame` events stay replay-visible but not undo-visible, `gesture_end` closes an undo-visible transaction, audit/history-control events do not become undo targets, missing `tx_id` values become isolated `event:<id>` transactions, and redo is selected from append-only transactions after a durable cursor rather than client memory.
- State snapshots are restoration accelerators, not superior truth: controlled snapshot restore uses `restoreStateSnapshot` to normalize snapshot records into append-only `set` events before projection; legacy `restoreSnapshot` is contained as a single-atome migration adapter that appends a `set` event through `appendEvent` and must not delete particles or write projections directly.
- The current `state_current` rebuild safely replays the full scoped event stream. Snapshot-accelerated reconstruction is active work and must use a cross-database deterministic event cursor, integrity-checked snapshot state, subsequent-event replay, and equivalence comparison with full replay before atomic projection replacement. Event compaction, archival deletion, or retention-based removal is forbidden until a separate validated policy proves reconstruction, history availability, offline/sync continuity, and recovery safety.
- Time Machine historical branching is an active product requirement, not a current runtime capability. Implementation must wait for explicit validation of a versioned branch model covering identity, divergence, forward recomputation, conflicts, merge, abandonment, permissions, sharing, offline sync, snapshots, APIs, MCP, AI, and Bevy UI presentation. Original event rows remain immutable; branches must be represented through the canonical append-only state/history architecture and must not introduce a parallel source of truth.
- Legacy Squirrel Atome instances may keep `this.element` only as a DOM projection adapter. Canonical Atome business state, media refs, waveform/thumbnail refs, and group timeline/member state must not be stored on HTMLElement properties or serialized model-shaped `data-*` attributes; `scripts/check_squirrel_dom_adapter_guardrails.mjs` enforces that containment boundary.
- MTraX preview render payloads are derived cache data owned by `eVe/domains/mtrax/preview/preview_registry_runtime.js`; timeline DOM projections must reference them through short `data-preview-id` values and must not serialize preview signatures, thumbnail pixels, waveform peaks, local media URLs, or cache payloads.
- `scripts/check_dom_projection_guardrails.mjs` is the persistent validation and audit-report entry point for maintained DOM snapshots and debug captures that need measurable minimal-projection evidence, repeated `data-atome-id` projection context documentation, duplicate-id/root-shape checks, `.dom` subtree rejection of `html/head/body` roots, full-document nested-root checks, local source leak checks, durable media-error attribute checks, repeated Atome model-data duplication checks, named canvas renderer surface checks, and density thresholds for nodes, inline styles, canvas, and video elements.
- `scripts/export_dom_subtrees.mjs` owns offline extraction of matrix, project, timeline, and media-host subtree exports from a captured DOM/HTML file. It writes only under `temp/`; maintained subtree files contain one canonical root per matrix/project/timeline export, media-host exports deduplicate repeated captured projections by `data-atome-id`, and full-app captures are `.snapshot` diagnostics rather than audited `.dom` fixtures.

Status: Verified in `maps/DESIGN_MAP.md`; source modules must be inspected before visual changes.

## API and MCP Separation

API ownership:

- Open APIs live in Atome, server, and database when product-neutral.
- Closed APIs live in eVe when they control product UI, tools, stores, Molecule/MTraX, or branding.
- The exhaustive public, semi-public, and internal API inventory is a separate Phase 2 task; this map defines architectural placement and direction.

MCP/AI ownership:

- Atome owns AI/MCP orchestration, trace stores, provider client boundaries, default tool registration, and MCP protocol runtime.
- eVe owns closed runtime tools and product capabilities exposed through explicit runtime registration and capability checks.

Canonical MCP path:

```text
MCP / AI / Voice
  -> AtomeAI policy, proposal, audit, and idempotency layer
  -> runtime tool resolution
  -> eVe toolRuntimeV2 or open Atome service contract
  -> command / commit path for mutations
```

Rules:

- MCP tools must connect to existing runtime capabilities or open service contracts before direct domain APIs.
- Direct domain API use is allowed only when no runtime V2 surface exists yet and the reason is documented.
- Tools return intentions, not hidden side effects.
- Sensitive operations require policy, capability validation, audit, and confirmation flow where applicable.
- New APIs must be declared and documented in the relevant map and future registry once the registry exists.

Status: Verified at map level through `maps/API_MAP.md`, `todo/ai_voice/eVe_MCP_APIS_Tools.md`, and `eVe/eVe_essentials.md`.

## Storage, Sync, and Communication Separation

Storage:

- Durable Atome persistence belongs to `database/adole.js` and the server commit helpers.
- eVe product stores own closed product state and adapters, but durable Atome writes still route through the canonical commit flow.
- Detached profile, sharing, and sync adapters use the Adole WebSocket event commit surface for Atome mutations. Direct WebSocket `atome.create` / `atome.alter` actions remain legacy protocol edges, not framework mutation owners.
- Raw SQL outside the database layer is forbidden for Atome persistence.

Sync:

- Sync is event-based, append-only, and replayable.
- Authenticated `/ws/sync` transports only permission-scoped, redacted Atome, file/media, and ACL notifications. Account-directory broadcasts and private filesystem metadata are excluded from the ordinary channel.
- Offline writes queue in `sync_queue` and replay in order with idempotency keys.

Communication:

- Framework communication must stay centralized and WebSocket-based.
- HTTP remains a resource and operational boundary only; communication architecture must not add polling, hidden REST fallbacks, or scattered duplicate transports for application operations.
- New login pre-auth OTP communication uses `/ws/api` auth actions only; adding matching REST endpoints would violate the current communication direction.

Status: Verified and guarded for the WebSocket-only application boundary. Product-named route families and unrelated debug surfaces remain separate review areas.

## Code Placement Rules

Place new or changed code according to ownership:

- Product-neutral Squirrel API: `atome/src/squirrel/apis/`.
- Product-neutral communication service: `atome/src/squirrel/{mail,contacts,calendar,bank}/`.
- Product-neutral AI/MCP/voice contract: `atome/src/squirrel/{ai,voice}/`.
- Product-neutral audio or AV runtime: `atome/src/application/audio_runtime/`.
- Product-neutral security or sync primitive: `atome/security/`.
- Server route, WebSocket, auth, or operational infrastructure: `server/`.
- Database adapter or persistence primitive: `database/`.
- eVe product UI, panels, tools, menu, Matrix, ribbon, flower, Finder workflow: `eVe/intuition/`.
- eVe product design tokens or factories: `eVe/elements/` and `eVe/i18n/`.
- eVe product domain workflow: `eVe/domains/`.
- eVe product store or media engine: `eVe/core/`.
- Molecule/MTraX product workflow: `eVe/domains/mtrax/`, `eVe/core/media_engine/`, or `eVe/intuition/tools/molecule/` according to the existing owner.
- Persistent tests: `tests/` or colocated with existing owner tests.
- Temporary probes and transient diagnostics: `temp/`.

Before creating a new file:

- Consult the maps.
- Search for an equivalent or partial owner.
- Reuse, extend, or factorize the existing owner when possible.
- Create a new file only when the responsibility is stable and cannot be cleanly hosted by an existing module.

## Reuse Rules

Reuse first:

- Squirrel APIs for product-neutral framework behavior.
- Adole unified APIs for authenticated data and sync semantics.
- In Tauri, local loopback state/mutation paths are authoritative during bootstrap and media opening; optional Fastify mirrors or secondary state reads must not race through cross-origin loopback HTTP.
- Tauri/WebKit reload restoration keeps the current project as authenticated model state, not DOM state: `squirrel_current_project_v2` is durable only with an owning `userId`, and pre-auth workspace migration is owned by `auth_workspace.js`, which must pass through the guarded local `transferOwner` path before the authenticated user reuses that project or clear the cache when no recoverable source exists.
- Atome security and sync primitives for trust, verification, cloud sync, and queue behavior.
- Communication service facades for mail, contacts, calendar, and bank.
- Atome audio/AV runtime facade for playback, recording, STT, device, codec, and graph behavior.
- eVe tool registry/runtime for product tools.
- eVe panel APIs and design factories for product panels.
- eVe visual tokens and factories for product styling.
- eVe stores for product event, project, media, browser, Tauri, and iOS storage adapters.

Do not create:

- Parallel security checks.
- Parallel sync queues.
- Parallel tool registries.
- Parallel audio engines for the same product path.
- Parallel product design token systems.
- Product-specific open Atome modules.
- Closed eVe clones of open framework services.

## Anti-Duplication Rules

The following are architectural violations unless explicitly documented as a deliberate replacement and completed in the same task:

- Runtime fallbacks, compatibility shims, temporary adapters, hidden proxies, or silent bypasses.
- Direct durable state mutation outside the command/commit path.
- New HTTP polling or REST fallback channels for framework communication.
- Direct SQL for Atome persistence outside `database/`.
- UI mutations that bypass tool/runtime contracts for durable behavior.
- Product CSS or HTML source-of-truth layers outside the documented JavaScript design system.
- New MCP tools that bypass existing runtime tools or service contracts.
- New platform-specific business logic that should be an adapter around shared semantics.

Known duplication or legacy risks:

- Oversized server, database, tool runtime, media, and design files listed in `maps/CODEMAP.md` require reduction ownership before feature growth.
- Product bootstrap references from Atome into eVe remain documented boundary points and require targeted verification before structural changes.
- Product-named server route families such as mail routes require review before becoming stable open API names.
- Molecule/MTraX naming remains transitional and belongs to later execution phases.

Recent rendering/persistence contracts:

- Recording media files live under the user `recordings` storage root, but durable project ownership is the Atome commit/reload contract, not a DOM projection side effect.
- Project-scene WebGPU projection is the render authority. It must reject stale media records with no source before Bevy startup so legacy `audio_recording_*` entries cannot blank the whole canvas.
- A media record whose immediately required image texture input fails decoding is not allowed to reject the full initial Bevy scene; the node is skipped and tracked by the Bevy web runtime while valid nodes render. Uncached source-backed video and waveform media enter the deferred queue with transparent pending material, then receive textures through the same Bevy resource update path; video frame failures and blank transparent/black readbacks are retried with bounded backoff before being skipped so slow Safari/WKWebView readiness cannot empty a video-only project on reload or leave refresh-time videos permanently transparent after the first failed frame read.
- Bevy receives normalized virtual-scene nodes only; layer values may preserve Atome ordering metadata but render depth must remain inside the camera-visible range.

## Maintenance Rules

Before implementation:

- Read the relevant maps.
- Inspect the owning source modules.
- Identify the existing owner, API, helper, visual factory, or runtime capability.
- State whether the change reuses, extends, refactors, or creates code.

During implementation:

- Keep changes inside the owning layer.
- Preserve dependency direction.
- Remove dead, duplicated, deprecated, unreachable, fallback, or temporary code encountered inside touched files.
- Avoid growing oversized files; reduce or split along real ownership boundaries when a touched file violates size rules.
- Keep temporary probes under `temp/`.

After implementation:

- Run the narrowest relevant validation.
- Verify modified file boundaries, line counts, and absence of temporary logs or probes.
- Update `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/DESIGN_MAP.md`, and this file when their covered contracts change.
- Record unclear areas as `Status: To verify` instead of inventing architecture.

## Voice Assistant Pipeline

1. The canonical BevyUI Atome tool emits `press`, `drag`, `release`, and `activate`; the focused hold runtime claims the gesture at 520 ms and suppresses its short activation.
2. `eveAssistantApi` traces the toggle command, installs the project interaction interceptor, and delegates the DOM-free session lifecycle to Squirrel Voice.
3. The local worker converts French text to model phoneme ids and runs the bundled `fr_FR-siwis-medium` ONNX model off the UI/audio render threads. ONNX Runtime Web is MIT; the specified Siwis model card records its training dataset as CC-BY 4.0 and is shipped beside the model for attribution. Creating that worker/session is a post-workspace non-critical warmup owned by `boot_runtime.js`, delayed beyond initial WebGPU/UI stabilization; importing the assistant remains allocation-free so physical iOS devices do not combine the Bevy and ONNX memory peaks.
4. PCM is encoded once for the existing Kira playback authority through an ephemeral transient-asset contract. Twenty-millisecond analysis windows publish only ephemeral TTS frames.
5. eVe coalesces the latest frame into one ephemeral full-workspace assistant record whose layout uniforms preserve the bounded centered shell. The shared compositor capture/blur/presentation path remains unchanged; stretching and directional ejection run inside that full surface, eliminating internal clipping without another renderer or canvas.
6. While active, the assistant interceptor at priority 1100 precedes Dashboard BevyUI at 1000 and owns one ephemeral pointer session outside the main toolbox. Canonical main-toolbox hit-tests are yielded and latched by pointer id through release, allowing short Atome Dashboard toggles, long Atome assistant closure and every other tool while Dashboard cards and project content remain protected. The single assistant record migrates to the current foreground WebGPU scene and stale scene prefixes are removed; there is no dim record. One browser-to-SDF conversion feeds organic contact and ejection, preventing vertical direction drift. Pointer movement only updates organic deformation; destructive classification runs once on `pointerup`. A release inside the shell responds and returns to rest, while a release outside after shell entry ejects along the normalized start-to-release vector. The Atome hold bridge bootstraps the singleton assistant on demand and invokes one toggle: closed opens, active closes. Scene cleanup returns the visual runtime to closed without awaiting native farewell completion, preventing voice latency from blocking a later opening.

The removed `aVa_panel` and main-handle DOM bridge are not architectural fallbacks. Browser `speechSynthesis`, extra canvases, visible assistant DOM, durable audio-frame commits, and renderer-private state are forbidden on this path.

## Current To-Verify Areas

- Exact product bootstrap boundaries still present from Atome browser shell into eVe product startup.
- Server open/closed naming and route ownership for product-named route families.
- Product-named and operational HTTP surfaces outside the canonical Atome application boundary.
- Runtime parity of all modes outside the documented contract.
- Full public, semi-public, and internal API classification, which is the next Phase 2 task.
- Complete MCP registry and automatic discovery system, which remains future architecture work.

## Source References

Primary maps:

- `maps/CODEMAP.md`
- `maps/API_MAP.md`
- `maps/DESIGN_MAP.md`

Primary architecture sources:

- `.codex/AGENTS.md`
- `todo/ai_voice/eVe_MCP_APIS_Tools.md`
- `todo/ai_voice/history_and_ai.md`
- `eVe/eVe_essentials.md`
- `eVe/documentations/atome_persistence_contract.md`
- `atome/documentations/security_architecture.md`
- `atome/documentations/sync_protocol.md`
# Dashboard residency boundary (2026-07-17, authoritative)

The current project scene remains the WebGPU owner across Dashboard toggles. Workspace mode identifies the projection scene with the real project id; `__eve_dashboard_workspace__` is only the no-project scene. The Dashboard runtime owns one resident BevyUI tree per current scene and the shared BevyUI runtime owns suspension. Suspension is projection state, not canonical Atome or DOM state. The same-project return path is forbidden from crossing the project activation/data boundary. A real project change destroys the old Dashboard tree before entering `activateProjectWorkspace()`. The main toolbox is invariant and is neither unmounted nor force-refreshed during a toggle. Existing workspace-mode subscribers suspend contextual editing and video decode work without releasing the last GPU texture.

# Resident overlay hot path (2026-07-18, authoritative)

The shared scene is not a reason to rebuild static Dashboard records when a toolbox palette changes. Closed palette subtrees are absent. Activation uses `project_scene_direct_prefix_runtime.js` to present every opaque palette record atomically at the expansion origin, then `project_scene_direct_motion_runtime.js` moves those resident records through the complete 180 ms expansion, 6–14 px / 70 ms outward overshoot, and exact 120 ms settlement without texture re-resolution or RGBA signature hashing. Prefix and motion share one serialized direct-mutation queue with canonical full rendering. The rAF loop is independent of renderer completion, allows one batch in flight, and replaces any queued sample with the latest position; backpressure therefore cannot produce a trail or replay stale motion. Completion does not trigger another structural render. Dashboard data hydration has no autonomous retry loop, and Dashboard headers own vertical input before any adjacent lane ownership is considered.
