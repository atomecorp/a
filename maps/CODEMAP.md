# Atome / eVe Code Map

Status: Initial framework map after the Atome open / eVe closed boundary validation.

Purpose:

- Provide the mandatory first navigation layer before future implementation work.
- Identify ownership, reusable modules, entry points, duplication risks, and areas that require targeted verification.
- Avoid using `docs/` as a root map directory. Framework maps live under `maps/`; product and framework documentation remain in `eve/documentations/` and `atome/documentations/`.

Mandatory Use:

- Before adding or changing code, consult this file first, then perform targeted code verification.
- Reuse, extend, or factorize existing modules before creating a new one.
- Update this map when ownership, structure, reusable APIs, or duplication risks change.

## Mandatory Pre-Implementation Gate

No implementation, refactor, cleanup, API work, UI work, tool work, persistence work, security work, or runtime behavior change may start until the relevant maps have been consulted:

- Start with this file to identify source ownership, existing modules, reusable boundaries, entry points, and known duplication or size risks.
- Consult `maps/API_MAP.md` before touching APIs, runtime globals, server routes, MCP surfaces, tools, persistence contracts, or exported methods.
- Consult `maps/DESIGN_MAP.md` before touching tokens, JavaScript-generated styles, visual factories, panels, tools, Matrix, Molecule/MTraX visuals, or assets.
- Consult `maps/ARCHITECTURE_MAP.md` before touching dependency direction, lifecycle, command/history flow, sync, server/database boundaries, cross-layer ownership, or runtime modes.

Implementation may proceed only after the map check identifies the owning layer, confirms whether reusable code already exists, and determines which maps must be updated in the same task.

## Global Ownership

Dashboard Bevy ownership:

- `eVe/default_values/constants.json` owns the seed data for dashboard categories. The default categories are data, not duplicated source constants.
- `eVe/domains/dashboard/` owns the closed eVe dashboard runtime: JSON default loading, category/item normalization, pure layout, visual tokens, transition interpolation, R&D mockup-style Bevy record projection, data adapters, and main Atom handle toggle lifecycle.
- `eVe/domains/rendering/surface_runtime.js` exposes the product-neutral `setRenderSurfaceInteractionInterceptor()` hook so canvas-owned overlays can intercept pointer/wheel input before project drag, resize, selection, or text edit routing. The hook is runtime-only and stores no business state in DOM.
- Dashboard visuals are projected as disposable logical-coordinate records into the existing project Bevy surface through `project_scene_runtime.js`; there is no dashboard DOM renderer, no per-item DOM node, no dashboard-side scale transform, and no second visible canvas.
- Product-neutral rounded shape support flows through `corner_radius` from render records to the Bevy projection adapter and `atome/renderers/bevy-core/src/texture.rs`, which generates alpha masks for native shape sprites. Dashboard uses that contract for its `3px` default radius token.
- `eVe/intuition/ribbon/menu_handle_runtime.js` forwards a tap on the main Atome handle (`button[data-role="eve_intuitionx-handle"]`) to `eVe/intuition/eVeIntuition.js`, which toggles `eVe/domains/dashboard/dashboard_runtime.js` in active workspaces. `tool.main.home` remains a normal `ui.home.panel` route so the user/Home panel is not coupled to the dashboard entry point.
- `eVe/intuition/tools/user_workspace_surface_runtime.js` owns post-session workspace surface activation for both authenticated and anonymous sessions. It first asks the existing project loader to attach the current project to the shared `eve_surface_project` canvas, then reveals the existing main ribbon through `window.new_menu_v2.reveal()` and opens the existing dashboard runtime through `window.eveDashboardRuntime.open()`; it does not create a second dashboard entry point, duplicate menu state, dashboard DOM, or an alternate canvas.
- `tests/probes/dashboard_bevy_runtime_probe.test.mjs` owns the real Playwright dashboard acceptance path: guest workspace, real main Atome handle click, canvas header and `+` clicks, generic record persistence, fullscreen editor final rect after transition, toolbox reservation, handedness mirroring, dashboard teardown, and screenshot checks for entêtes, card contrast, and no dashboard paint inside the toolbox band.
- `tests/eve/dashboard_mockup_design_contract.test.mjs` owns the maintained non-browser contract against stable `eVe/R&D/dashboard_design.html` constants: initial no-focus state, header/plus ratios, `300ms` expansion timing, category palette, and conditional plus strip.
- `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js` routes the Home tool to the canonical user/Home panel. It must not call the dashboard runtime; active-workspace dashboard toggling belongs to the main Atom handle callback in `eVe/intuition/eVeIntuition.js`.
- `eVe/intuition/tools/core/tool_runtime_bootstrap_defs_b.js` declares the dashboard News, Monitor, Goals, and future Store tool contracts. Runtime handlers are registered by `eVe/domains/dashboard/dashboard_runtime.js` in the existing `window.atome.tools.handlers` registry.

## Explicit Atome Open / eVe Closed Boundary

The source tree is split by ownership, not by convenience:

- `atome/`, `server/`, and `database/` are open framework or infrastructure surfaces only when the code remains product-neutral.
- `eVe/` is the closed product layer for UI, product tools, workflows, branding, product stores, Molecule/MTraX behavior, and private composition.
- `tests/` may cross both layers only to validate contracts, integration, and regression behavior.
- `temp/` is the only approved location for temporary diagnostics, probes, and generated transient outputs.

Dependency rule:

- Open Atome code may not import closed eVe UI, product workflows, private tools, branding, or product stores.
- When open Atome code needs a closed product capability, the capability must be injected, registered, or exposed through an explicit runtime boundary documented in `maps/API_MAP.md` and `maps/ARCHITECTURE_MAP.md`.
- eVe may consume Atome open contracts, but it must not duplicate Atome security, sync, server, database, audio, communication, AI, MCP, or cross-platform framework services.
- Product-specific code must stay in `eVe/` unless it is deliberately promoted to Atome through an open contract, tests, and map updates.

Placement rule:

- Framework APIs, reusable runtime contracts, security, sync, server, database, audio, voice orchestration, and MCP primitives belong to Atome/open infrastructure.
- Product UI, panel chrome, tool composition, Finder-facing workflows, Matrix, ribbon, flower, closed voice surfaces, product persistence adapters, and Molecule/MTraX workflows belong to eVe.
- Existing bootstrap touchpoints from Atome into eVe are boundary debt and must be verified before structural changes rather than normalized as generic dependency permission.

### Atome Open Layer

Path: `atome/`

Role: Open framework, reusable runtime, cross-platform infrastructure, security, server-facing contracts, Squirrel APIs, AI/voice contracts, and generic assets.

Main responsibilities:

- Core Squirrel framework and public API surface.
- Cross-platform runtime bootstrap for browser, Tauri, iOS, AUv3, and FreeBSD targets.
- Shared security and synchronization primitives that must remain product-neutral.
- Audio runtime contracts and native backend boundaries.
- AI, voice, mail, contacts, calendar, bank, and MCP-facing contracts when they are product-neutral.

Should be extended by:

- Framework-level APIs and runtime contracts.
- Open security, sync, server, and cross-platform modules.
- Generic components that are not eVe product UI.

Should not contain:

- Closed eVe product UI.
- eVe workflows, branding, private tool composition, or product-specific panels.
- Product-only MTraX/Molecule UI internals unless promoted through an explicit open contract.

Status: Verified by current tree inspection.

Adole mutation boundary:

- `atome/src/squirrel/apis/unified/adole_api/atomes.js` owns public `AdoleAPI.atomes.*` compatibility methods.
- `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js` owns browser-side Atome API record projection and must keep network/storage aliases at the boundary instead of re-emitting them as public record shape.
- `atome/src/squirrel/apis/unified/adole.js` owns detached WebSocket adapters, including `adapter.atome.commit` and `adapter.atome.commitBatch`.
- Framework code must route durable Atome writes through the event commit surface even when the public method name is still `create` or `alter`.

### eVe Closed Layer

Path: `eve/`

Role: Closed product layer containing eVe UI, product tools, workflows, composition, branding, persistence adapters, and product-specific media/Molecule/MTraX runtime.

Main responsibilities:

- eVe application bootstrap and product composition.
- Intuition UI, panels, tools, menu, ribbon, flower, matrix, and product interaction runtime.
- Closed media domains and MTraX/Molecule product workflows.
- Product-specific event stores, project stores, media stores, browser/iOS/Tauri storage adapters.
- Product i18n and design systems.

Should be extended by:

- eVe UI, panels, product tools, product workflows, branding, and closed runtime bridges.
- Product-specific media editing, MTraX/Molecule panels, and private persistence flows.

Should not contain:

- Open Atome framework primitives that must be reused outside the eVe product.
- Generic security or cross-platform server contracts that belong in Atome.

Status: Verified by current tree inspection.

Capture reveal ownership:

- `eVe/intuition/tools/capture_reveal_runtime.js` owns capture media reveal orchestration for audio recordings, video recordings, and photos.
- `eVe/intuition/tools/capture_export_geometry.js` owns the viewport-to-project-layer geometry contract for that reveal.
- `eVe/intuition/tools/capture_source_runtime.js` owns capture source/action tool resolution, source-tool memory, capture invocation input normalization, capture-menu detection, and capture result Atome id extraction for `capture.js`.
- `eVe/intuition/tools/capture_preview_session_runtime.js` owns capture preview overlay creation, audio/video preview mounting, frozen overlay creation, stream resolution, and visual-session start/stop cleanup for `capture.js`.
- `eVe/intuition/tools/capture_quick_record_runtime.js` owns capture quick-record mutable pointer/session state, click suppression, iOS native video-stop pointer interception, and active video-record start/stop preview overlay lifecycle for `capture.js`.
- `eVe/intuition/tools/capture_fullscreen_runtime.js` owns capture fullscreen preview state, permissions, audio/video/photo fullscreen actions, camera switching, preview-source teardown, and close/open lifecycle; `capture_fullscreen_chrome_runtime.js` owns the disposable fullscreen capture chrome controls and state projection for that runtime.
- `eVe/intuition/tools/capture.js` owns capture tool action registration, menu registration, and public capture preview API composition only; source resolution, preview sessions, quick-record sessions, fullscreen state, and media reveal are delegated to focused runtimes.
- `eVe/intuition/runtime/project_media_import_runtime.js` owns shared project media file selection for flower-menu import and capture import, emits the narrow Xcode-visible import trace for iOS/AUv3 picker diagnosis, then delegates durable project media creation to `project_drop.importFilesToProjectViaCreator`.
- `eVe/intuition/runtime/eve_intuition/panel_tool_registration_runtime.js` owns eVeIntuition panel tool registration for home/contact/info/AI/finder/communicate/delete/undo/paste/timeline/calendar/background/couleur/size/font/detail/layer.
- `eVe/intuition/runtime/eve_intuition/basic_ui_tools_runtime.js` owns eVeIntuition basic UI tool registration for undo, media reader transport registration, select, circle, text creation, matrix view, orientation, palette visibility, and item enable/disable. The former hidden `dummy` catalog registration was removed because it was diagnostic/demo surface, not product runtime.
- `eVe/intuition/runtime/eve_intuition/main_tool_latched_state_runtime.js` owns main-tool latched state resolution across runtime APIs, cached latch state, menu alias families, visible panel surfaces, and disposable tool button visuals.
- `eVe/intuition/runtime/eve_intuition/main_tool_selection_guard_runtime.js` owns main-tool selection-required policy and no-target activation blocking for vector/record-action style tools.
- `eVe/intuition/runtime/eve_intuition/finder_tool_identity_runtime.js` owns Finder tool identity, target normalization, candidate collection, and projection-instance target recovery.
- `eVe/intuition/runtime/eve_intuition/finder_inline_visual_runtime.js` owns disposable Finder inline input visual expansion/collapse styling.
- `eVe/intuition/runtime/eve_intuition/finder_inline_runtime.js` owns Finder inline search orchestration, finder panel open/close/focus/refresh wrappers, and the Finder touch handler consumed by main tools, footer tools, and the tool window bridge.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_model_runtime.js` owns Atome-edit footer tool-key normalization, default tool sets by atome kind, persisted footer tool read/write, project-playback tool availability, record-action mode/source normalization, and footer catalog tool definitions.
- `eVe/intuition/runtime/eve_intuition/atome_focus_fullscreen_runtime.js` owns Atome focus/fullscreen geometry, style restoration, layout scheduling, and footer-placement sync hooks.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_drag_runtime.js` owns Atome-edit footer record-action tool drag payloads, active drag session publication, MIME writes, drag guards, and preview ghost creation.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_palette_runtime.js` owns Atome-edit footer palette child button creation, palette expansion state, palette target resolution, and palette child drag binding.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_slider_runtime.js` owns Atome-edit footer slider events, value debounce, size-module loading, footer-row recentering, and slider collapse scheduling.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_tool_state_runtime.js` owns Atome-edit footer button latch visuals, record-action bridge state, record-action state-event sync, and footer row tool-state refresh.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_child_invocation_runtime.js` owns Atome-edit footer palette child invocation for record-action and generic child tools through the canonical tool invocation path.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_definition_invocation_runtime.js` owns Atome-edit footer definition invocation for footer runtime and explicit context calls, including selection-bound payload merge and slider dispatch.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_row_render_runtime.js` owns Atome-edit footer tool row rendering, button creation, palette/slider binding, and footer-row click routing through injected canonical tool invokers.
- All capture action/runtime files are below the 500-line hard maximum after R23.

Perform tool ownership:

- `eVe/intuition/tools/perform.js` owns only perform-mode lifecycle orchestration (activate/deactivate), pointer gating for the view-only context, tool-handler registration, and the public `window.evePerformApi` control surface; the removed dead `window.evePerformDebug` test surface and the no-op `logPerformDebug` tracing must not be reintroduced.
- `eVe/intuition/tools/perform_state.js` owns the perform-mode configuration constants and the shared `performState`/`preferenceState` singletons.
- `eVe/intuition/tools/perform_support.js` owns the stateless perform DOM helpers: element visibility, inline-style capture/restore, menu element resolution, transition building, pointer-target classification, perform CSS installation, and selection snapshot reading.
- `eVe/intuition/tools/perform_menu_runtime.js` owns the perform-mode toolbox preview reveal lifecycle (cached menu styles, fade/translate visual state, timed reveal, fade-out hide).
- `eVe/intuition/tools/perform_focus_runtime.js` owns hiding non-essential system UI for perform mode and isolating the selected Atome host(s) into a fullscreen tiled layout, plus restoring both.
- `eVe/intuition/tools/perform_preference_runtime.js` owns the perform-mode user-profile preference (debounced save, login restore, user-change watcher) and reaches the perform lifecycle only through injected isActive/deactivate hooks.

Selection-style tool ownership:

- `eVe/intuition/tools/selection_style_apply.js` owns only the public `applyColorToSelection`/`applySizeToSelection`/`applyFontToSelection`/`readSelectionCount` apply facade consumed by the couleur/size/font tools, plus the re-exported `hasTextStyleRangeSelectionIntent`/`resolveCurrentTextSizeValue`. The disabled `ATOMIC_INLINE_TEXT_SELECTION_MUTATIONS_ENABLED` inline range-mutation subsystem was removed as unreachable code; a `applyInlineStyleToActiveTextSelection` stub preserves the caller contract and must not be re-expanded into per-range DOM span mutation.
- `eVe/intuition/tools/selection_style_state.js` owns the text-selection memory / style-intent mutable state singletons and the timing/selector constants; `selection_style_ranges.js` owns the stateless DOM-range serialization and numeric/font-size helpers.
- `eVe/intuition/tools/selection_style_context.js` owns the selection target resolvers (selection ids, focused/editing text host, text-style intent, host elements, style-tool interaction targets); `selection_style_text_selection.js` owns the live/remembered editable and preview text-range contexts and the current text-size resolution.
- `eVe/intuition/tools/selection_style_memory.js` owns capturing/restoring the active text range selection for style tools and the selectionchange/pointerdown bridge.
- `eVe/intuition/tools/selection_style_atome.js` owns canonical Atome state/property reads, media/text classification, the canonical property update path, and per-selection mutation resolution/application; `selection_style_svg_layer.js` owns selected project SVG-layer color application through that update path.

Finder tool ownership:

- `eVe/intuition/tools/finder.js` owns only the disposable finder dialog skeleton DOM (search row, scope buttons, result header/list) and header-sort wiring; it populates the `finderEls` handle registry and is the lazy-import entry from `panel_definitions.js`. The removed dead `toErrorMessage`/`isTauriRuntime`/`getCurrentProjectId`/`logFinderToolsSources` helpers and the undefined `extractAtomeFromGetResult` people-lookup fallback must not be reintroduced.
- `eVe/intuition/tools/finder_state.js` owns `finderState` (query/scope/sort/records), the `finderEls` DOM handle registry, and the finder constants; `finder_record_model.js` owns pure Atome/user record normalization; `finder_record_projection.js` owns tool-record classification, query matching, property options, and drag-payload construction.
- `eVe/intuition/tools/finder_data_sources.js` owns the API/runtime tool-record loaders and the tool-registry divergence self-heal; `finder_refresh.js` owns local/project/tools/people record refresh into finderState and the atome-change event bus.
- `eVe/intuition/tools/finder_view.js` owns result filtering/sorting, header layout/tint/sort, and result-list rendering; `finder_row.js` owns row selection/drag/inline-rename/long-press; `finder_filters.js` owns the Filters accordion sub-panel and toggle; `finder_controller.js` owns scope-lock/matrix-context, the open/close/refresh/quick-search lifecycle, logged-in/out reset, and the `window.open_finder_panel`/`window.__eveFinder` exposure.

Detail tool ownership (in progress under R26):

- `eVe/intuition/tools/detail.js` owns only the detail panel facade: open/close lifecycle, polling, current-detail synchronization, toolbar button wiring, and window exposure.
- `eVe/intuition/tools/detail_actions.js` owns registration of the `ui.detail.karaoke.apply`, `ui.detail.record.toggle`, and `ui.detail.timecodes.toggle` UI actions while preserving the existing tool-gateway route.
- `eVe/intuition/tools/detail_state.js` owns detail panel constants, shared mutable panel state, record-action mirroring, preview source normalization, formatting, and host/footer API readers.
- `eVe/intuition/tools/detail_view.js` owns disposable detail-panel DOM construction and rendering for preview, summary, SVG layers, take composites, empty state, and toolbar projection.
- `eVe/intuition/tools/detail_context_tools.js` owns detail footer/context-tool rendering and footer tool-state synchronization.
- `eVe/intuition/tools/detail_editor_model.js` owns pure karaoke line payload normalization, rich/plain text conversion, and editor line id/markup helpers.
- `eVe/intuition/tools/detail_editor_runtime.js` owns the dormant lyrics/karaoke editor runtime: editable-state projection, line DOM normalization, line sync, line click/record interaction, paste/drop handling, and active-line scrolling.
- `eVe/intuition/tools/detail_styles.js` owns the detail panel base CSS injection (`ensureDetailStyles`) and concatenates the dormant karaoke/lyrics editor CSS from `detail_styles_karaoke.js`. The karaoke/lyrics editor stays dormant pending the Bevy karaoke host rebuild and must not be deleted as dead code.

Atome DOM projection ownership:

- `eVe/core/atome_dom_id.js` owns the final Atome DOM host id contract: `eve-atome_<atome_id>`, `toDomId`, `fromDomId`, `getAtomeElement`, nearest-host resolution helpers, and WeakMap-backed runtime metadata for projection-only elements.
- `eVe/intuition/matrix/core/project_dom_state.js` owns WeakMap-backed project projection metadata for project views, Matrix tiles, and project-scoped tool projection hosts; project identity must be recovered from this runtime registry or `project_view_<id>` ids, not from `data-project-id`.
- Final Atome DOM hosts and their final rendered subtrees must not carry Atome business state, type, selection, group, media, renderer, drag, resize, binding, project, replay, or persistence data in `data-*` attributes.
- Event layers such as click, double-click, selection, drag, resize, flower menu routing, media transport, and MTRAX opening must resolve the nearest `eve-atome_*` host, recover the canonical Atome id, and then consult the Atome registry, runtime registry, or owning domain registry for behavior decisions.
- Binding flags and ephemeral UI state belong in runtime registries or WeakMaps. Group/media runtime facts belong in their owning runtime/domain registries, not in the DOM.
- Legacy code may keep narrow read-only fallbacks while migrating old DOM, but new rendering code must emit the clean projection contract and new routing code must not branch on Atome `data-*` state.

Unified rendering ownership:

- `eVe/domains/rendering/` owns the closed product unified rendering projection contract for eVe Atomes: disposable `RenderAtom` normalization, render-scene ordering and hit testing, bounded project/matrix canvas surfaces, hidden text service lifecycle, and the shared WebGPU render-at-time compositor entry point.
- `eVe/domains/rendering/render_atom.js` owns the disposable RenderAtom content projection and must consume the shared media source canonicalization contract before media reaches Bevy, so bare uploaded or recorded filenames become explicit `/api/uploads/...` or `/api/recordings/...` sources with owner scope instead of browser-relative URLs. Video RenderAtom content also normalizes the derived timeline fields `start`, `duration`, `trimIn`, `trimOut`, `offset`, `speed`, and `loop` from canonical Atome properties for renderer/decode projection; this remains disposable projection data and must not become a writable renderer state store.
- `eVe/domains/rendering/virtual_scene_contract.js` owns the Phase 1 renderer-agnostic Virtual Scene contract: disposable `AtomeRenderNode` projection, deterministic tree construction, selected-state projection from the runtime selection table, dense render-layer assignment from the actual scene paint order, render diff operations, and dirty-flag names. It is a projection/diff contract only; it must not become an ECS, renderer, canonical Atome model, or DOM-backed state store.
- `eVe/domains/rendering/bevy_projection_adapter.js` owns the strict browser Bevy projection adapter from `AtomeRenderNode` Virtual Scene data into the `run_atome_bevy_renderer(...)` payload shape. It maps explicit id, kind, parent, logical position, logical size, local transform scale/rotation/origin, paint-order layer, opacity, selected flag, fill color, text, media source, media texture, media `uvRect` / pixel `sourceRect` crop data, video timeline projection, waveform peak fields, and project-audio waveform playback progress, normalizes direct CSS z-index/layer payloads to the Rust `i32` boundary when no Virtual Scene render layer exists, rejects unsupported advanced Bevy blend modes instead of falling back to normal, validates video timeline numbers and speed before payload emission, and rejects incomplete projection nodes instead of inventing silent defaults.
- `eVe/domains/rendering/renderer_adapter_registry.js` owns the pure renderer adapter registry contract: normalized kind ids, renderer names, immutable capability metadata, explicit registration, lookup, assertion, and list operations. It does not own DOM state, canonical Atome state, texture generation, or renderer dispatch side effects.
- `eVe/domains/rendering/bevy_renderer_adapter_registry.js` owns the default Bevy renderer adapter declarations and kind-specific node/resource mapping callbacks for the currently supported `shape`, `text`, `image`, `video`, and `audio_waveform` kinds. `bevy_projection_adapter.js` owns common Bevy payload validation/base fields and delegates kind-specific projection to the registered adapter.
- `eVe/domains/rendering/bevy_pending_media_contract.js` owns the browser Bevy contract for source-backed media whose disposable texture is not available at spawn time. It identifies persisted video poster and waveform peak inputs that must be consumed during initial projection, requires image nodes to resolve a texture before spawn, and marks uncached video plus waveform media with transparent material so Rust never exposes its default blue shape while the same Bevy resource path generates the delayed texture.
- `eVe/domains/rendering/bevy_media_texture_resolver.js` owns disposable browser texture decoding for the Bevy web route. It converts text, raster images, SVG documents, persisted video posters, and audio waveforms into explicit RGBA texture payloads without adding visible media DOM nodes and without rendering through a legacy project adapter. Source-backed live project video without a persisted poster rejects with `bevy_media_texture_video_gpu_source_only` before `drawImage` or `getImageData`, so the RGBA resolver cannot become the live playback path. Source-backed audio waveforms may decode source audio to derive real peaks before texture generation.
- `eVe/domains/rendering/bevy_surface_background_runtime.js` owns browser Bevy project-surface background delivery. It consumes the `eve:surface-background-changed` event from the user background preference path, decodes image backgrounds to cached RGBA texture payloads when needed, forwards generated textures directly, and calls `apply_atome_bevy_surface_background` so the Rust Bevy scene renders background pixels before Atomes and text. `user_background_pattern_renderer.js` owns generated background pixel production, while `user_surface_background_texture_runtime.js` owns preference-to-surface payload orchestration for `eVe/user/background.js`; `eVe/user/background.js` exports the strict `startUserBackgroundRuntime()` boot hook instead of starting at module import, and `eVe/eVe.js` invokes it immediately after `eve.user_background` loads so missing `#view` remains an explicit startup error without making the module import itself fail. `eVe/user/background.js` also consumes `eve:profile-preferences-updated` so background preference changes from the existing user-panel route are projected immediately. `eVe/intuition/tools/background_random_runtime.js` owns generated random background parameter creation when that generated-background mode is used. The explicit user `download` wallpaper action may fetch a remote image, upload it through the existing background media upload path, and persist the resulting protected media URL as the selected background.
- `eVe/domains/rendering/bevy_web_renderer_runtime.js` owns browser Bevy WASM startup and diff dispatch for an existing shared project canvas. It initializes the generated `atome/src/wasm/squirrel_bevy_renderer.js` module, prevents starting two Bevy apps for the same canvas, refuses to adopt a started renderer state from a replaced canvas with the same selector, applies surface-size patches through `apply_atome_bevy_surface`, registers the Bevy surface-background runtime, applies `diffVirtualSceneTrees(...)` operations through explicit Bevy WASM exports for spawn, despawn, transform, style, reparent, layer, visibility, text metadata, resource updates, and surface background, and delegates browser media-resource mapping plus presentation scheduling to the owners below; it does not own canonical Atome state or provide a legacy renderer fallback. When a project view refresh reuses the same canvas whose Bevy runtime is already started, this owner diffs the last canvas-owned virtual scene against the requested virtual scene and applies the missing render ops instead of returning a passive `already_started` result. Logout must clear project-scene visuals while preserving the shared connected canvas so the Web Bevy event loop remains attached to its real surface.
- `eVe/domains/rendering/bevy_media_resource_runtime.js` owns browser Bevy media-resource projection for the web runtime. It resolves immediately reusable image/video poster/text/audio-waveform textures before initial projection, keeps uncached video and waveform nodes present with transparent pending material, maps spawn/resource/text texture patches, applies decoded video/waveform textures later through one serialized deferred resource queue, retries deferred video texture failures with bounded backoff when Safari/WKWebView has not produced a frame yet, defers spawned video/waveform textures when metadata is not immediately available, and resumes queued media generation after surface-size patches without introducing a fallback renderer or DOM projection.
- `eVe/domains/rendering/bevy_web_presentation_runtime.js` owns browser Bevy presentation scheduling for the web runtime. It filters the known non-fatal WASM runner `unreachable` completion from page error reporting, primes bounded WebView presentation redraws through `request_atome_bevy_redraw`, coalesces same-tick hidden decode video-frame notifications into one latest-frame WASM notify with a redraw fallback only when no valid notify can be sent, and records WebGPU/canvas context lost/restored events against the existing Bevy canvas without creating a recovery renderer or DOM fallback. `eVe/domains/rendering/bevy_perf_diagnostics_runtime.js` owns shared browser Bevy perf counters and keeps high-frequency external render plus video-frame event logging opt-in by default; `eVe/domains/rendering/bevy_wasm_diagnostics_runtime.js` owns attachment of WASM diagnostics readers to that shared object so the startup/diff owner stays below the critical size threshold and does not duplicate diagnostics glue. The generated Web Bevy runtime in `platforms/web/bevy-renderer/src/lib.rs` uses an opaque canvas surface with Bevy's reactive desktop-app Winit settings, requests an initial redraw before any user input, preserves wake requests made before the winit event-loop proxy is installed, then wakes the Bevy winit event loop and emits redraw requests whenever queued WASM render operations, explicit redraw requests, or hidden video-frame notifications are applied. Video-frame notification application now relies on the existing queued-notification wake instead of adding a second wake after the `RequestRedraw` message. Web diagnostics count wake calls, redraw requests/applies, and accepted/applied video-frame redraws so startup, Atome creation, mutation diffs, deferred media resource updates, surface background changes, surface-size patches, and video playback present without an idle continuous loop or waiting for a pointer/keyboard event.
- `eVe/domains/rendering/bevy_video_decode_source_runtime.js` owns the hidden browser video decode resources that feed Bevy `GPUExternalTexture`. It synchronizes source-backed video nodes from the Virtual Scene, keeps those videos fully transparent under `#eve_bevy_video_decode_root` (`opacity:0`, 1px, pointer-events none), exposes diagnostics/status lookups, applies disposable video timeline projection to the decode element, uses `requestVideoFrameCallback` as the active-playback frame pump when available, and keeps RAF only as fallback: `trimIn` plus `offset` seeking, `trimOut` window enforcement, playback `speed`, and loop handling inside the trimmed source window. It must not autoplay from scene flags, create visible project media nodes, or become a second video renderer.
- `eVe/domains/rendering/surface_size_runtime.js` owns render-surface size derivation from host CSS dimensions, `devicePixelRatio`, `ResizeObserver` box data, and optional GPU texture-dimension clamping. It returns viewport/render-target measurements only and must not mutate Atome geometry.
- `eVe/domains/rendering/project_scene_runtime.js` owns active project scene projection state keyed by project id. It accepts canonical project Atome records, delegates project-record normalization/filtering to `project_scene_record_projection.js`, delegates client-coordinate hit-test and lasso rectangle collection to `project_scene_hit_testing.js`, builds the disposable Virtual Scene projection, delegates Bevy native/web renderer execution to `project_scene_bevy_projection_runtime.js`, updates the bounded project render surface, and returns projection handles instead of per-Atome DOM hosts. `eVe/intuition/runtime/tool_genesis.js` must await this projection before marking `loadProjectAtomes(...)` complete or refreshing the recent-load cache, so a project refresh cannot cache "loaded" Atomes before Bevy has accepted the scene.
- `eVe/domains/rendering/project_scene_bevy_projection_runtime.js` owns active project Bevy renderer execution. It selects the native or web Bevy runtime according to the existing capability contract, sends startup scenes or diffs, and converts native non-presentable errors into explicit projection results without selecting a Web/WASM fallback on iOS.
- Legacy active project renderer modules `render_at_time.js`, `project_scene_webgpu_adapter.js`, `image_adapter.js`, `video_adapter.js`, `waveform_adapter.js`, `text_adapter.js`, and `project_scene_selection_overlay.js` were removed once the active project route moved to Bevy. Project Atome rendering must use the Bevy Virtual Scene and media texture route, not the old WebGPU adapter family.
- Project selection visuals on the cleaned route are projected by `eVe/domains/rendering/` and drawn by the shared Atome Bevy core: `project_scene_selection_state.js` reads existing selection runtime state, `project_scene_runtime.js` marks disposable render atoms, `virtual_scene_contract.js`/`bevy_projection_adapter.js` propagate `selected` plus dense paint-order render layers, `bevy_web_renderer_runtime.js` forwards those fields in style diffs, `atome/shared/render_visual_tokens.js` owns the cross-platform design tokens, and `atome/renderers/bevy-core/src/selection_overlay.rs` draws the selected Atome as a light-gray dotted contour with a progressively faded 12 px shadow blur just above the selected entity and below the next paint layer inside the same project canvas. No per-Atome DOM outline, host class, selection overlay DOM, or legacy WebGPU selection bitmap is allowed on the active project route.
- `eVe/domains/rendering/inline_edit_session.js` owns the pure InlineEditSession state-machine contract: explicit session/project/atom ids, mode, activation source, initial/draft values, focus origin, overlay anchor, `tx_id`, optional gesture id, selection snapshot, immutable open/committed/cancelled transitions, and DOM-authority rejection for session metadata.
- `eVe/domains/rendering/inline_edit_close_overlay.js` owns the pure close-overlay interaction contract for inline editing. It derives disposable overlay metadata from an InlineEditSession, maps close/Escape/Enter/touch/accessibility activation to commit/cancel/none actions, and returns pure focus-restoration data without creating Atomes, DOM nodes, selectors, or visual style state.
- `eVe/domains/rendering/project_scene_runtime.js` owns active project scene orchestration, resize, drag, generic scene-intent commits, and synchronous disposable scene refresh when project-visible records are inserted before the async Bevy frame completes. It delegates live drag/resize frame coalescing to `eVe/domains/rendering/project_scene_gesture_runtime.js`, so move bursts update disposable scene records immediately while WebGPU rerenders and realtime `gesture_frame` commits are batched to animation frames. Text editing is delegated to `eVe/domains/rendering/project_scene_text_runtime.js`, active edit ownership is tracked outside the DOM by `eVe/domains/rendering/project_scene_text_edit_state.js`, hidden keyboard capture is owned by `eVe/domains/rendering/hidden_text_service_runtime.js`, direct Bevy transform patches are owned by `eVe/domains/rendering/project_scene_direct_transform_runtime.js`, which preserves canonical scale/rotation/origin during live pointer movement, and selection/video/audio invalidation listeners are owned by `eVe/domains/rendering/project_scene_invalidation_runtime.js`. `project_scene_text_runtime.js` consumes `InlineEditSession` for active text edit draft state, focus metadata, overlay anchor metadata, and deterministic `tx_id` propagation while keeping visible text on the Bevy canvas. Text commit and gesture end still persist `set` events through the canonical Atome commit boundary.
- `eVe/domains/rendering/surface_runtime.js` owns centralized project-surface pointer routing for select, drag, resize, native double-click Atome footer open, native double-click text edit re-entry, caret placement, and text drag-selection gestures. It also owns render-surface host attachment, logical size tracking, Bevy target client-rect derivation for UI anchoring, and client-to-logical coordinate conversion when the visible canvas rect is scaled relative to the render surface. `project_scene_runtime.js` exposes one UI-intent handler registration for product UI bridges such as the Atome footer; individual render callers must not duplicate footer handlers. `surface_text_pointer_runtime.js` owns text-specific pointer routing helpers and active-edit guards; active text gives caret/selection precedence over resize except on the bottom-right resize corner. `project_scene_hit_testing.js` owns project-scene client-point and lasso-rect queries against the disposable scene. Resize is resolved through scene hit-testing and logical edge handles on the canvas, not visible per-Atome resize DOM.
- `eVe/domains/rendering/surface_pointer_runtime.js` owns active project resize geometry for single and multi-selection gestures. Resize is homothetic by default: one uniform scale is derived from the active logical handle and applied to width and height for every selected scene target before the final canonical `set` commit. For inactive text Atomes it recalculates `text_style.font_size` from that scale so Bevy redraws crisp text; for actively edited text it changes only the bounding box. The resize hit band is an internal logical-canvas band on the right and bottom edges with 5 px of additional inward tolerance; it must not be represented by DOM handles or mutate canonical Atome bounds.
- `eVe/core/atome_events/project_layer_runtime.js` owns project background and lasso gestures. On the cleaned canvas route it must ask `project_scene_runtime.js` for scene hit-tests before arming lasso, and lasso rectangle selection must use scene Atome ids when no per-Atome DOM hosts exist.
- `eVe/intuition/runtime/project_scene_render_bridge.js` owns the `tool_genesis.js` bridge from bounded project shell parents to the project scene runtime. It prevents the active project visual path from depending on `HTMLElement` Atome hosts while leaving non-project tool/system UI rendering intact.
- `eVe/intuition/runtime/tool_genesis_spec_runtime.js` owns `tool_genesis.js` creation-spec presets, media/default sizing decisions, mount-layer normalization, and non-renderable/kind constants.
- `eVe/intuition/runtime/tool_genesis_mount_runtime.js` owns `tool_genesis.js` system root, Intuition tool layer, and project-layer DOM mount resolution. It is a disposable mount resolver and must not own project scene rendering.
- `eVe/intuition/runtime/tool_genesis_properties_runtime.js` owns conversion from create specs into sanitized Atome commit properties, including group preview/timeline property persistence.
- `eVe/intuition/runtime/tool_genesis_create_runtime.js` owns the canonical `createAtome` command/commit/refresh/optional-render pipeline behind `tool_genesis.js`; it must commit before state refresh and render only from the refreshed canonical record.
- `eVe/intuition/runtime/tool_genesis_record_runtime.js` owns Atome-result extraction, owner/creator filtering, record normalization, and record-to-render-spec conversion behind `tool_genesis.js`. It is a conversion boundary only and must not render, commit, or own project loading.
- `eVe/intuition/runtime/tool_genesis_host_runtime.js` owns legacy non-project host creation and frame style projection behind `tool_genesis.js`. It is the disposable DOM host path for non-project/tool/editor exceptions and must not become the active project renderer.
- `eVe/intuition/runtime/tool_genesis_render_state_runtime.js` owns legacy render-state reconciliation behind `tool_genesis.js`: deleted/renderable checks, project membership resolution, state-current fetches, and the `renderAtomeRecord` bridge that routes project parents to the project scene before any legacy host creation.
- `eVe/intuition/runtime/tool_genesis_project_load_runtime.js` owns `tool_genesis.js` project Atome loading: local/remote/shared override selection, owner filtering, in-flight de-duplication, recent-load cache completion, load/render perf events, and Bevy scene dispatch through `renderProjectScene()`. It must not create per-Atome DOM hosts for active project rendering.
- `eVe/intuition/runtime/tool_genesis_media_runtime.js` owns `tool_genesis.js` media helper composition: media source, protected hydration, media visual mount, SVG shape mount, and media-host integrity runtime wiring. The specialized media runtimes remain the implementation owners; this module only composes them for the legacy non-project projection path.
- `eVe/intuition/runtime/tool_genesis_group_runtime.js` owns `tool_genesis.js` group visual runtime composition and group wrapper functions for legacy non-project group hosts. It delegates preview, membership, sizing, and refresh behavior to `group_visual_runtime.js`.
- `eVe/intuition/runtime/tool_genesis_mutation_runtime.js` owns `tool_genesis.js` mutation bridge wiring: implicit gesture commit routing, sanitized `window.Atome.commit` set calls, text commit dispatch, and selection runtime configuration. It must not bypass the canonical commit pipeline.
- `eVe/intuition/runtime/tool_genesis_projection_support_runtime.js` owns the remaining pure projection support for `tool_genesis.js`: disposable inline-style sanitization, border/boolean/rich-text normalization, project-root parent detection, object-shape checks, and project-layer lookup. It must stay pure support and must not render, commit, or store canonical state.
- `eVe/intuition/runtime/tool_genesis_lifecycle_runtime.js` owns project/user lifecycle helpers for `tool_genesis.js`: Adole project/user lookup, anonymous workspace detection, shared-project override composition, project-render-done dispatch, debug gating, and pre-removal media/group cleanup. It must not own active project rendering.
- `eVe/intuition/runtime/tool_genesis_host_lifecycle_runtime.js` owns `tool_genesis.js` host lifecycle wiring: legacy host registry composition, project Atome index composition, persistence diagnostics, and the project-scene record bridge callback. It is lifecycle plumbing only and must not create an alternate renderer.
- `eVe/intuition/runtime/tool_genesis_core_services_runtime.js` owns cross-cutting `tool_genesis.js` service wiring for info-panel sync, lifecycle, mount resolution, and canonical mutation dispatch. It centralizes setup only; the specialized runtime modules remain the behavior owners.
- `eVe/intuition/runtime/tool_genesis_public_runtime.js` owns `tool_genesis.js` public surface composition: `toolBase`, realtime Atome event binding, and bootstrap installation wiring.
- `eVe/intuition/runtime/tool_genesis_bootstrap_runtime.js` owns public `window.eveToolBase` installation, Molecule timeline runtime installation, startup project load scheduling, realtime binding, selection event binding, and view/user cleanup listeners for `tool_genesis_public_runtime.js`.
- `eVe/intuition/runtime/atome_description_frame_runtime.js` owns description-derived frame memory for legacy non-project host synchronization and project bridge bookkeeping. `tool_genesis.js` consumes this owner instead of storing the frame registry inline.
- `eVe/intuition/runtime/panel_open_settle_runtime.js` owns the prepared-panel open lifecycle: panel visibility snapshots, hide-until-prepared, settle (layer attach + placement + reveal), and post-open floating placement scheduling. `eVeIntuition.js` injects its generic placement primitives (layer attach, near-tool positioning, placement observers) and consumes the returned API; the settle semantics must not be re-owned inline, and the deleted MTraX dock-preservation path must not be reintroduced.
- `eVe/intuition/runtime/media_integrity_runtime.js` owns non-project legacy media host integrity state: media kind hints, integrity history, text-patch key classification, and media-host repair observers. `tool_genesis.js` may wire the runtime with Atome lookup and media URL dependencies, but must not re-own the media integrity registries inline.
- `eVe/intuition/runtime/shape_svg_runtime.js` owns non-project legacy SVG shape detection, SVG data-url decoding, protected SVG fetch, and host mounting. `tool_genesis.js` may inject platform/media credential helpers and Atome lookup callbacks, but SVG parsing and mounting must not be reintroduced inline.
- `eVe/intuition/runtime/group_visual_runtime.js` owns non-project legacy group host visual orchestration: runtime-only membership bookkeeping, member visibility state, group-step visual synchronization, and group refresh. `eVe/intuition/runtime/group_visual_preview_runtime.js` owns the disposable non-project placeholder layer and preview media/text/member DOM mounting. They must keep canonical group state in Atome/runtime state and must not become the active project scene path; project-visible group Atomes remain `RenderAtom` entries in `project_scene_runtime.js`.
- `eVe/intuition/runtime/media_source_runtime.js` owns media URL/source resolution for the legacy `tool_genesis.js` path: bundled assets, upload/recording inference, protected API route normalization, direct renderability checks, persisted group/timeline media source normalization, and local/Tauri credential decisions. It reuses shared media source/identifier helpers and must not mount media or own canonical media state.
- `eVe/intuition/runtime/media_hydration_runtime.js` owns protected media hydration for the legacy projection path: local availability checks, Tauri streaming attachment, authenticated blob fetch, hydrated blob lifecycle, and media projection source state updates. It must not decide canonical media records or active project scene rendering.
- `eVe/intuition/runtime/media_mount_runtime.js` owns legacy media API visual mounting through `ensureMoleculeMediaRuntime()`: old media child cleanup, Molecule `mountVisual()` calls, projection error updates, video poster application, and preview scrub dispatch. It is projection plumbing only; active project media remains scene-rendered.
- `eVe/intuition/runtime/atome_host_registry_runtime.js` owns the legacy non-project Atome host registry: rendered-host cache, host rebinding, rendered checks, cache clearing, and DOM host removal with media resource cleanup. It must remain projection lifecycle only and must not decide canonical project membership or render active project Atomes.
- `eVe/intuition/runtime/project_atome_index_runtime.js` owns project Atome index bookkeeping for `tool_genesis.js`: remembered project snapshots, active load de-duplication, recent-load cache reads, and scoped project cleanup. It tracks projection/cache lifecycle only and must not become canonical Atome state or a project scene renderer.
- `eVe/intuition/runtime/shared_project_override_runtime.js` owns shared Atome project override bookkeeping for `tool_genesis.js`: owner-scoped local override persistence, Fastify Atome fetch de-duplication, shared record hydration back into the target project, and stale override pruning. It is a bridge/cache owner only and must not become canonical project membership state.
- `eVe/intuition/runtime/implicit_gesture_commit_runtime.js` owns implicit project gesture commit routing for `tool_genesis.js`: gesture event classification, short-window phase de-duplication, realtime self-patch dedupe marks, tool-gateway dispatch, and fallback to `window.Atome.commitBatch` for non-gesture batches. It is an event-routing bridge only and must not own durable gesture state.
- `eVe/intuition/runtime/realtime_atome_events_runtime.js` owns `tool_genesis.js` realtime event binding and media patch sanitation: event-bus update/delete routing, DOM realtime event routing, textual media patch stripping, and media integrity diagnostics. It must emit/consume canonical update intents through injected callbacks and must not store durable Atome state.
- `eVe/intuition/runtime/tool_genesis_realtime_patch_runtime.js` owns `tool_genesis.js` realtime patch application after event routing: legacy non-project host text/style/group/tool/media/SVG projection refresh, protected media rehydration requests through the existing media runtimes, shared-project override tagging for disposable hosts, and active project record updates through `project_scene_runtime.js`. It must not create durable state or render active project Atomes through per-Atome DOM hosts.
- `eVe/intuition/runtime/persistence_diag_runtime.js` owns temporary persistence diagnostics behind `tool_genesis.js`: diagnostic-gated bridge logging and compact record summaries for load/render traces. It must remain observability-only and must not influence project membership, rendering, or mutation ordering.
- `eVe/intuition/runtime/info_panel_sync_runtime.js` owns legacy info panel synchronization callbacks behind `tool_genesis.js`: position/resize projection payloads and optional right/bottom derived values. It may notify the panel, but it must not mutate canonical Atome state or infer project membership.
- `eVe/intuition/matrix/core/preview.js` consumes the unified `createMatrixPreviewRenderer()` and project scene records for Matrix thumbnails. It must not use DOM capture paths such as `html2canvas`, SVG `foreignObject`, cloned project DOM, or symbolic Atome DOM scanning.
- `eVe/intuition/matrix/ui/matrix_interaction_runtime.js` owns Matrix tile interaction routing through a single scroll-surface gesture binding and scene hit testing. `eVe/intuition/matrix/ui/view.js` owns bounded shell tile DOM only and must not attach per-tile preview/open/rename/menu listeners.
- Project restore, info assignment, shared-Atome hydration, and timeline replay paths update `project_scene_runtime.js` for project-visible records. They must not call `renderAtomeRecord()` as a project visual fallback or require an `HTMLElement` render return.
- `RenderAtom` data is runtime-only and derived from canonical Atome records. It must not be written into DOM attributes, persisted as business state, or used as a second writable source of truth.
- Project audio waveform Atomes now publish waveform render metadata into the Atome runtime registry and Bevy texture route instead of creating per-Atome visible waveform DOM or SVG nodes. Project-only audio playback progress is owned by `eVe/domains/media/project_audio_playback_progress_runtime.js`, projected at a bounded runtime cadence as disposable `playback_progress` Virtual Scene style data, and rendered by Bevy as a waveform playhead overlay inside the existing project canvas; Molecule, sequencer, timeline, and direct API audio playback paths must not consume this project playhead runtime. Browser/WASM Bevy coalesces queued progress-only style ops per Atome and `bevy_web_renderer_runtime.js` uses a single redraw request for progress-only diffs so audio playback cannot starve the renderer queue. Direct audio/video recording APIs must render the committed media Atome through `project_media_atome_renderer.js` so the canonical project source Atome appears on the current project canvas. Browser audio recordings must persist canonical `audio_recording` kind plus waveform peak arrays on the project Atome before Bevy texture generation; pending recording Atomes without a renderable media source must stay out of the Bevy projection until the committed media source is available.

### Tests

Path: `tests/`.

Role: Validation for framework, eVe runtime, probes, server, UI scenarios, media, security, and governance.

Fixtures:

- `tests/fixtures/media/` contains Git-tracked media fixtures used by media, Molecule, and MTraX probes.
- Runtime probes should prefer `ATOME_MEDIA_TEST_DIR` when supplied and fall back to `tests/fixtures/media/`.
- `tests/fixtures/dom/maintained_projection.dom` is the maintained clean DOM projection fixture scanned by the default DOM projection guardrail.
- `tests/eve/media_fixture_restore_contract.test.mjs` guards the fixture-driven project media persistence contract for every maintained audio/video fixture and verifies canonical properties survive DOM teardown reconstruction without reading DOM state.
- `tests/eve/project_dom_teardown_reconstruction.test.mjs` guards project reconstruction from serialized canonical records after DOM teardown across normal Atomes, grouped Atomes, media Atomes, timeline tracks, clips, waveform refs, and thumbnail refs.

Main entry points:

- `npm run check:syntax`
- `npm run check:no-fallbacks`
- `npm run check:palette-ssot`
- `npm run check:tauri-fs-boundary`
- `npm run check:molecule-guardrails`
- `npm run test:run`
- Targeted `node --test ...` commands for persistent regression coverage. New persistent tests must be placed under `tests/`; temporary probes belong under `temp/`.
- `tests/scripts/check_mutation_ownership_guardrails.test.mjs` guards the mutation ownership checker that prevents direct client/runtime writes to `state_current` and direct event-commit transport bypasses outside the canonical owners.
- `tests/scripts/check_squirrel_dom_adapter_guardrails.test.mjs` guards Squirrel Atome DOM adapter containment: `this.element` and local `element` projections must not receive canonical business state properties or serialized model payloads.
- `database/adole.event_projection_invariants.test.mjs` guards event/particle/`state_current` projection coherence: append-only event dedupe, projection versioning, sanitized reserved fields, and matching particle/state properties.
- `database/adole.snapshot_restore_invariants.test.mjs` guards controlled state snapshot restoration through event replay instead of direct DOM or projection writes.
- `tests/database/adole_event_replay_rebuild.test.mjs` guards full `state_current` rebuild from append-only events without mutating event or particle history.
- `tests/database/adole_history_transactions.test.mjs` guards the durable HistoryTransaction contract: `tx_id` grouping, continuous gesture visibility, append-only redo selection after restart, isolated missing-`tx_id` events, and non-contiguous `tx_id` reuse detection.
- `tests/database/adole_legacy_snapshot_event_restore.test.mjs` guards legacy snapshot containment: `restoreSnapshot` must append a `set` event, restore through projection, and extend particle history instead of deleting particles directly.
- `tests/database/adole_restart_safe_interactions.test.mjs` guards restart-safe reconstruction for text edit, drag, resize, and semantic rename interactions from append-only events, including durable undo/redo transaction grouping after reload.
- `tests/shared/atom_graph.test.mjs` guards the pure AtomGraph contract: record normalization, deterministic roots/links/order, event patch folding, deletion filtering, cycle/orphan diagnostics, duplicate state-row diagnostics, stable child order, deleted-parent reachability, and distinct visual/semantic/focus ordering.
- `tests/shared/accessible_atom_node.test.mjs` guards the pure AccessibleAtomNode schema and sanitizer for role, label, description, alt text, focusable state, actions, relations, invalid diagnostics, and strict assertion behavior.
- `tests/shared/accessibility_graph.test.mjs` guards the pure AccessibilityGraph derivation from AtomGraph and Atome properties across text, shape, image, video, audio, and group nodes without visible DOM state.
- `tests/shared/accessibility_bridge_contract.test.mjs` guards the disposable accessibility bridge projection contract: bridge nodes mirror AccessibilityGraph ids, labels, actions, reading/focus order, and remain free of DOM authority fields.
- `tests/shared/accessibility_behavior_contract.test.mjs` guards accessibility behavior across AccessibilityGraph, AccessibilityBridgeProjection, SemanticRename, and InlineEditSession: reading order, focus order, accessible actions, label update, and focus restoration without DOM-owned state.
- `tests/shared/core_atome_types.test.mjs` guards the core Atome type definitions and registry installation for text, shape, image, video, audio, waveform, group, project, and tool instance contracts.
- `tests/shared/semantic_rename_contract.test.mjs` guards semantic rename normalization, deterministic label fallback, `set` event construction with required `tx_id`, HistoryTransaction grouping, and AccessibilityGraph label updates without DOM state.
- `tests/eve/bevy_projection_adapter_contract.test.mjs` guards Bevy projection adapter compatibility, including the default renderer adapter registry, immutable registry metadata, adapter-delegated kind mapping, existing kind payload parity, CSS layer clamping, natural video texture size, and display-size exclusion from video texture metadata.
- `tests/eve/bevy_project_renderer_guards.test.mjs` guards active Bevy project renderer ownership: external renderers cannot target `canvas#eve_surface_project`, transform-only diffs do not schedule delayed redraw primes, selected project video playback cannot bypass the project timeline, source-backed live video cannot enter the RGBA media resolver/readback path, and the pinned `wgpu 27.0.1` backend cannot be masked by facade video-track exports before real web external-texture support exists.
- `tests/eve/project_scene_media_projection_filter.test.mjs` guards project media filtering before Bevy projection and source-backed live-video DOM boundaries: project video must start on `#eve_surface_project`, visible Atome/media DOM projection stays absent, and the only allowed `<video>` is the fully hidden Bevy decode resource under `#eve_bevy_video_decode_root`.
- `tests/eve/unified_rendering_contract.test.mjs` guards renderer-agnostic unified rendering contracts: disposable RenderAtom normalization/cache keys, scene hit testing without per-Atome DOM routing, canonical commit dispatch, external WebGPU project-canvas rejection, bounded project/matrix surfaces, and the hidden text bridge.
- `tests/eve/project_scene_unified_rendering_contract.test.mjs` guards the active project-scene half of the unified rendering contract: one Bevy project canvas, no visible Atome DOM/media overlay nodes, hidden decode-root-only live video resources, no live-video RGBA resource fallback during startup, canonical drag/resize/text commits, canvas selection routing, and Bevy selected-style invalidation.
- `tests/eve/inline_edit_close_overlay_contract.test.mjs` guards the pure close-overlay contract: disposable non-Atome overlay metadata, close/Escape cancel behavior, Enter commit behavior when applicable, touch close activation, accessibility activation, and focus restoration.
- `tests/eve/inline_edit_session_contract.test.mjs` guards the pure InlineEditSession contract: required ids and `tx_id`, activation source and mode enums, immutable draft/overlay updates, commit/cancel transitions, focus restoration metadata, selection snapshots, and rejection of DOM/function data in session metadata.
- `tests/eve/project_scene_text_edit_contract.test.mjs` guards the active project text route: one hidden editor, no visible `.eve-atome-text`, InlineEditSession exposure through project scene state, text commit `tx_id` propagation, rich-text span commits, cancel cleanup, DOM-independent refresh, pointer caret/selection, and resize behavior.
- `tests/probes/project_scene_inline_edit_accessibility_bridge_smoke.test.mjs` guards T23 smoke coverage for browser and Tauri/WebView-like project scenes: visible Bevy canvas ownership, inline-edit commit `tx_id`, AtomGraph rebuild from committed events, AccessibilityGraph reading/focus order, disposable AccessibilityBridge labels/actions, and absence of selector/element authority.
- `tests/molecule/run_molecule_tests.mjs` owns the maintained Node-runnable Molecule test list and must contain only existing, deterministic Molecule engine/session suites. Legacy browser probes and deleted MTraX-panel/API probes are not part of this runner.
- `tests/probes/molecule_dual_time_model.test.mjs` guards Molecule tempo-map normalization, seconds/musical conversion, dual-time clip/transport references, and migration of older timeline snapshots into the dual-time model.
- `tests/probes/molecule_session_history.test.mjs` guards Molecule session undo/redo, append-only history events, persistence of restored timeline snapshots, timeline verb aliasing, session clipboard edits, and single-undo-point batch behavior.
- `tests/probes/molecule_multitrack_timeline_probe.test.mjs` guards Molecule timeline normalization, active-clip collection, source seek math, and fade envelope math without the deleted MTraX panel.
- `tests/probes/molecule_track_type_registry.test.mjs` guards the Molecule track-type registry, built-in video/audio/image/text/automation definitions, custom registry isolation, and kernel clip/track compatibility.
- `atome/src/squirrel/ai/default_tools_timeline.test.mjs` guards `eve.timeline.*` AI tool registration and delegation to `window.eveMoleculeTimelineApi`.
- `atome/src/squirrel/atome/mcp.timeline_policy.test.mjs` guards `eve.timeline.*` / `ui.timeline.*` MCP capability policy.
- `tests/probes/browser_media_acceptance_probe.test.mjs` owns the browser media acceptance scenario runner; `browser_media_acceptance_probe_runtime.mjs`, `browser_media_acceptance_probe_inventory.mjs`, and `browser_media_acceptance_probe_desktop.mjs` own runtime/import/capture helpers, imported media inventory matching, and desktop resize/playback assertions.
- `tests/probes/project_render_legacy_audit.test.mjs` owns implicit gesture commit and project-atome index legacy-deletion guards; `project_render_legacy_source_audit.test.mjs`, `project_render_legacy_media_runtime.test.mjs`, and `project_render_legacy_sync_runtime.test.mjs` own source-delegation, media runtime, and synchronization/runtime deletion guards with shared source loading in `project_render_legacy_audit_fixture.mjs`.
- `tests/probes/media_api_suite_probe.test.mjs` guards the project media import DOM projection contract for image, SVG, video, and audio Atomes. It fails when final Atome DOM contains forbidden Atome `data-*` attributes, runtime/custom attributes, empty `class=""`, disguised runtime classes such as `eve-system-layer-*`, forbidden selection classes, `border: medium`, inline outline without `is-selected`, or renderer state stored in DOM instead of runtime state.
- `tests/strangler_v2/_env.mjs` owns the maintained mock browser fixture for colocated eVe Intuition runtime tests.
- `tests/strangler_v2/palette_ssot_guard.test.mjs` guards the menu/palette source-of-truth contract by preventing legacy example entrypoints from mutating `new_menu_v2` directly.
- `tests/probes/user_panel_content_contract.test.mjs` verifies the home/user panel module still mounts non-empty auth and profile dialog bodies from the canonical panel controls, and keeps authenticated account actions in the scrollable user body directly below Preferences.

Status: Verified by current tree inspection.

### Temporary Artifacts

Path: `temp/`

Role: Only approved location for temporary probes, debug scripts, reports, generated test outputs, and transient diagnostics.

Rules:

- Do not create temporary files in source, root, tool, or documentation directories.
- Remove temporary probes when no longer needed.

Status: Verified by current tree inspection.

## Atome Areas

### Atome Documentation

Path: `atome/documentations/`

Owner: Atome open layer.

Purpose: Existing Atome-specific documentation, API notes, audio documentation, server setup, sync protocol, security architecture, and historical troubleshooting notes.

Main files:

- `atome/documentations/AI.md`
- `atome/documentations/AUv3_API_Reference.md`
- `atome/documentations/CRUD_apis.md`
- `atome/documentations/media_capture_apis.md`
- `atome/documentations/security_architecture.md`
- `atome/documentations/sync_protocol.md`
- `atome/documentations/tools_api_and_coding.md`
- `atome/documentations/using_squirrel.md`

Reusable logic exposed: No runtime logic. Use as source material only after validating against code.

Should be extended by:

- Atome-specific user or developer documentation.

Should not be duplicated by:

- Framework maps. Cross-layer maps belong in `maps/`.

Status: Verified.

### Atome Security

Path: `atome/security/`

Owner: Atome open layer.

Purpose: Product-neutral security, cloud sync, server verification, trusted key metadata, and offline sync queue primitives.

Main files:

- `atome/security/cloudSync.js`
- `atome/security/serverVerification.js`
- `atome/security/serverVerificationCrypto.js`
- `atome/security/serverVerificationState.js`
- `atome/security/syncQueue.js`
- `atome/security/sync_queue_constants.js`
- `atome/security/sync_queue_storage.js`
- `atome/security/sync_queue_items.js`
- `atome/security/sync_queue_credentials.js`
- `atome/security/trusted_keys.js`

Reusable APIs:

- Trusted server lookup and fingerprint matching.
- Server verification orchestration, cryptographic challenge helpers, status presentation, and cache control.
- Sync queue action lifecycle and retry processing.
- Cloud sync status and conflict resolution entry points.

Primary dependencies:

- `atome/src/squirrel/apis/serverUrls.js` for server URL resolution in cloud sync.
- Browser storage and fetch-like runtime services. Status: To verify before mutation.

Should be extended by:

- Open security checks, trusted server policy, sync queue behavior, and framework-level verification.

Should not be duplicated by:

- eVe product security surfaces. Product flows should call or wrap explicit Atome security contracts, not reimplement trust checks.

Known risks:

- `syncQueue.js` owns sync execution and scheduler orchestration; queue constants, storage obfuscation, item operations, and auto-sync metadata are split into focused `sync_queue_*` modules.
- Security phase must audit secrets, token storage, bridge permissions, and command injection surfaces.

### Atome Shared Contracts

Path: `atome/src/shared/`

Owner: Atome open layer.

Purpose: Product-neutral framework contracts shared by browser, server, and database layers.

Main files:

- `atome/src/shared/atome_contract.js`
- `atome/src/shared/atome_universal_contract.js`
- `atome/src/shared/atome_contract_errors.js`
- `atome/src/shared/atom_graph.js`
- `atome/src/shared/accessible_atom_node.js`
- `atome/src/shared/accessibility_graph.js`
- `atome/src/shared/accessibility_bridge_contract.js`
- `atome/src/shared/core_atome_types.js`
- `atome/src/shared/semantic_rename_contract.js`
- `atome/shared/atome_contract.js` re-exports the browser-served contract for Node and server consumers.
- `atome/shared/atom_graph.js` re-exports the browser-served graph contract for Node and server consumers.
- `atome/shared/accessible_atom_node.js` re-exports the browser-served accessibility-node contract for Node and server consumers.
- `atome/shared/accessibility_graph.js` re-exports the browser-served accessibility graph contract for Node and server consumers.
- `atome/shared/accessibility_bridge_contract.js` re-exports the browser-served bridge projection contract for Node and server consumers.
- `atome/shared/core_atome_types.js` re-exports the browser-served core type definitions for Node and server consumers.
- `atome/shared/semantic_rename_contract.js` re-exports the browser-served semantic rename contract for Node and server consumers.

Reusable APIs:

- Canonical Atome envelope normalization through `normalizeCanonicalAtome`.
- Universal Atome envelope normalization through `normalizeCanonicalAtome(..., { universal: true })`, including `schema_version`, capabilities, interfaces, composition, policy, and lifecycle defaults.
- Boundary-only alias normalization for `atome_id`, `atome_type`, `particles`, and `data`.
- Canonical Atome property sanitization with reserved-key rejection and schema hooks.
- Minimal Atome type registration through `registerAtomeType`, `getAtomeType`, and `listAtomeTypes`.
- Tool contract projection through `toolToUniversalAtome`, while keeping tool compatibility data inside a property subtree instead of turning tool fields into envelope fields.
- Reserved envelope-field rejection for durable property writes.
- Canonical Atome envelope formatting for tolerant server/database responses.
- Pure AtomGraph construction through `buildAtomGraph`, with deterministic roots, parent-child links, visual/semantic/focus ordering, deletion filtering, and orphan/cycle/duplicate-state-row diagnostics from state rows or append-only event rows.
- AtomGraph record normalization through `normalizeAtomGraphRecord`.
- AccessibleAtomNode schema and sanitation through `sanitizeAccessibleAtomNode` and `assertAccessibleAtomNode`, covering role, label, description, alt text, focusable state, visible-to-accessibility state, actions, and relations without reading the DOM.
- AccessibilityGraph derivation through `buildAccessibilityGraph`, which filters inaccessible nodes, derives reading/focus orders, wires structural relations, and keeps accessibility semantics independent from visible DOM or renderer payloads.
- Disposable bridge projection through `buildAccessibilityBridgeProjection`, which mirrors accessibility graph nodes into a browser/WebView/native-ready semantic payload without creating DOM state.
- Core type registration through `registerCoreAtomeTypes`, with strict schema definitions for `text`, `shape`, `image`, `video`, `audio`, `audio_waveform`, `waveform`, `group`, `project`, and `tool_instance`.
- Semantic rename patch/event construction through `buildSemanticRenamePatch`, `buildSemanticRenameEvent`, `applySemanticRenameToRecord`, and `resolveSemanticLabel`. The canonical rename property is `properties.label`; rename patches also update `properties.accessibility.label`; durable rename events require explicit `tx_id` and emit `set` events for HistoryTransaction grouping.
- No public `fromLegacy...` or `toLegacy...` Atome adapter is allowed; historical shapes are input-boundary concerns only, and SQL storage serialization must not circulate as an Atome format.

Should be extended by:

- Open Atome description, validation, history, and persistence contracts needed across client/server/database boundaries.

Must not own:

- DOM projection, renderer-specific scene payloads, Bevy/WebGPU state, product UI traversal, accessibility bridge DOM, or durable mutation writes.

Status: `atom_graph.js` added for T06 and extended through T08/T09 as a pure graph contract. `accessible_atom_node.js` added for T10 as the pure accessibility node schema. `accessibility_graph.js` added for T11 as the pure graph derivation. `accessibility_bridge_contract.js` added for T12 as the disposable bridge projection contract. `core_atome_types.js` added for T15 as the core registry definitions and extended in T21 so every core Atome type accepts `label`. `semantic_rename_contract.js` added for T21 as the deterministic rename contract. T14 documents graph, bridge, semantic rename, and inline focus-restoration ownership across `CODEMAP`, `API_MAP`, `ARCHITECTURE_MAP`, `DESIGN_MAP`, and `todo/eve_features/eve_accessibility.md`.

### ADOLE Storage Projection

Purpose: Convert SQL storage rows into canonical Atome envelopes at the database boundary without creating a public legacy format.

Main file:

- `database/adole_storage_projection.js`

Reusable APIs:

- `projectStoredAtome` projects rows from `atomes` plus particle properties into universal canonical Atomes.
- `projectStoredStateCurrent` projects `state_current` rows into universal canonical Atomes.
- `projectStoredEvent` parses event rows while preserving append-only event identity.

Used by:

- `database/adole.js` for canonical `getAtome`, `getStateCurrent`, and `listStateCurrent` outputs.

Must not be extended with:

- public `fromLegacy...` or `toLegacy...` APIs;
- runtime compatibility shims;
- application-level propagation of SQL column names as Atome format.

### ADOLE History Transactions

Purpose: Define durable transaction semantics over append-only ADOLE events without depending on client runtime memory.

Main file:

- `database/adole_history_transactions.js`

Reusable APIs:

- `classifyHistoryEvent` classifies persistent, continuous, replay-only, audit-only, and history-control events.
- `buildHistoryTransactions` sorts events deterministically and groups them by `tx_id`, with isolated `event:<id>` transactions for missing `tx_id`.
- `selectUndoTransaction` and `selectRedoTransaction` use cursor positions over the append-only transaction list; redo is derived from events after the cursor, not from in-memory snapshots.
- `HISTORY_EVENT_CLASS`, `HISTORY_TRANSACTION_VISIBILITY`, and `HISTORY_REDO_RULE` define the stable contract vocabulary.

Used by:

- `database/adole.js` re-exports the contract for server/database consumers.
- Future timeline/runtime undo work must consume this contract instead of inventing local grouping rules.

Must not own:

- DOM replay, UI timeline panels, runtime selection, or renderer projection.
- Direct event mutation or state projection writes.

Status: Added for T04 durable history semantics.

### ADOLE Schema Migrations

Purpose: Keep additive ADOLE schema migrations outside the oversized data-layer runtime.

Main file:

- `database/adole_schema_migrations.js`

Reusable APIs:

- `runAdoleSchemaMigrations` applies permissions, snapshots, events, and `state_current` additive migration checks during `database/adole.js` initialization.

Should not be duplicated by:

- Server route formatters, ADOLE client helpers, database property writers, or eVe product tools.

Status: Added for Atome sanitization.

Status: Verified.

### ADOLE Permissions

Purpose: Own ADOLE permission writes, condition evaluation, and can-read/write/delete/share/create checks outside the oversized persistence runtime.

Main file:

- `database/adole_permissions.js`

Reusable APIs:

- `createAdolePermissionApi` binds the SQL query boundary plus canonical Atome accessors and returns permission mutation/check functions consumed by `database/adole.js`.

Used by:

- `database/adole.js` for the public ADOLE permission exports.

Must not be duplicated by:

- server sharing services, route handlers, client adapters, or direct permission SQL checks that bypass the canonical ADOLE permission API.

### Atome Shared Utilities

Path: `atome/shared/`

Owner: Atome open layer.

Purpose: Shared product-neutral utility contracts.

Main files:

- `atome/shared/logging.js`
- `atome/shared/recipient_access.js`

Reusable APIs:

- Structured log envelope building, coercion, validation, and serialization.
- Recipient access classification and summary helpers.

Should be extended by:

- Generic framework helpers with stable ownership and reuse beyond eVe.

Should not contain:

- eVe-specific i18n, UI, tool, or workflow helpers.

Status: Verified.

### Atome Browser Application Shell

Path: `atome/src/`

Owner: Atome open layer with product bootstrap touchpoints.

Purpose: Web entrypoint, static runtime assets, framework bootstrap, bundled third-party browser libraries, and WASM assets.

Main files:

- `atome/src/index.html`
- `atome/src/application/index.js`
- `atome/src/squirrel/spark.js`
- `atome/src/squirrel/apis/loadServerConfig.js`
- `atome/src/squirrel/apis/loadServerConfigDebug.js`
- `atome/src/squirrel/apis/loadServerConfigDefaults.js`
- `atome/src/squirrel/apis/loadServerConfigWs.js`
- `atome/src/squirrel/kickstart.js`
- `atome/src/squirrel/squirrel.js`
- `atome/src/squirrel/apis.js`
- `atome/src/version.json`

Primary dependencies:

- `atome/src/js/` for bundled browser libraries.
- `atome/src/wasm/` for generated audio WASM artifacts and generated `squirrel_bevy_renderer*` Bevy WebGPU renderer artifacts.
- Server config loading is split between runtime fetch/exposure in `loadServerConfig.js`, debug flag application in `loadServerConfigDebug.js`, generated defaults in `loadServerConfigDefaults.js`, and WebSocket URL construction in `loadServerConfigWs.js`.
- eVe bootstrap/version product references still exist in `atome/src/application/index.js` and `atome/src/squirrel/kickstart.js`.
- `atome/src/application/examples/user.js` is legacy product-bootstrap rendering debt and must use the shared eVe media source canonicalization contract for media atome sources instead of reconstructing recording or upload paths locally.
- Legacy application example menu files under `atome/src/application/examples/`, `atome/src/application/vie/`, `atome/src/application/lyrix/`, and `atome/src/application/jeezs/` must not mutate `window.new_menu_v2` content or theme. The eVe Intuition menu is owned by `eVe/intuition/`; app-specific menu replacement requires an explicit product runtime boundary.
- `atome/src/application/jeezs/demo.js` owns only the Jeezs demo mounting/runtime menu synchronization; `demo_messages.js` owns localized demo copy, and `demo_blocks.js` owns demo block payload construction.

Should be extended by:

- Framework bootstrap and open runtime composition.

Should not be extended by:

- Closed product UI or product-only tool workflows.

Known risks:

- Product bootstrap references need targeted verification during architecture map work.
- The legacy examples user renderer is above the normal file-size threshold and remains critical boundary debt; media behavior changes there must stay narrowly scoped and validated against the shared media route contract.
- `atome/src/js/` contains vendored/minified assets and should not be edited manually unless regenerating assets through the owning build process.

Status: Verified.

### Atome Audio Runtime

Path: `atome/src/application/audio_runtime/`

Owner: Atome open layer.

Purpose: Public audio/video runtime contracts, Kira command normalization, play/record core, backend resolution, AV contracts, playback and recording API facades.

Main files:

- `audio.facade.js`
- `audio_playback_api.js`
- `audio_recording_api.js`
- `av_contracts.js`
- `backend.kira.js`
- `kira_audio_commands.js`
- `play_record_contract.js`
- `play_record_core.js`
- `play_record_media_source.js`
- `record_audio_api.js`
- `runtime_audio_backend.js`
- `auv3_host_playback.js`
- `stt_api.js`

Reusable APIs:

- `getPlayRecordCore()`
- `PLAY_RECORD_API_CONTRACT`
- `canonicalizePlayRecordMediaSource()`
- Kira payload normalization and command invocation helpers.
- Runtime audio backend resolution.
- AUv3 host-routed media playback commands and source-to-native-path resolution.
- Audio playback and recording API facades.

Tests:

- `play_record_core.test.mjs`
- `runtime_audio_backend.strict_native.test.mjs`
- `auv3_host_playback.test.mjs`
- `av_api_boundaries.test.mjs`

Should be extended by:

- Open audio playback, recording, STT, and backend boundary work.

Should not be duplicated by:

- eVe media domains or MTraX runtime. Product code should depend on these contracts where possible.

Known risks:

- `play_record_core.js` owns the PlayRecordCore class and delegates public contract constants and media source canonicalization to focused runtime modules.
- `av_api_boundaries.test.mjs` still has eVe integration context and belongs to later AV boundary cleanup.

Status: Verified.

### Squirrel Public API Surface

Path: `atome/src/squirrel/apis/`

Owner: Atome open layer.

Purpose: Core Squirrel APIs and unified ADOLE API modules.

Main files:

- `atome/src/squirrel/apis.js`
- `apis/essentials.js`
- `apis/utils.js`
- `apis/shortcut.js`
- `apis/dragdrop.js`
- `apis/loader.js`
- `apis/serverUrls.js`
- `apis/svg_utils.js`
- `apis/update_atome.js`
- `apis/unified/adole.js`
- `apis/unified/adole_apis.js`
- `apis/unified/adole_api/*.js`
- `apis/unified/realtime_dedupe.js`
- `apis/unified/text_dom.js`

Reusable APIs:

- Essential wait/runtime helpers.
- Platform and server URL utilities.
- ADOLE auth, session, projects, storage, sharing, activities, atomes, and runtime modules.
- `adole_api/session.js`, `projects.js`, and `auth.js` jointly own durable current-project restoration across WebView reloads: the cache is stored in `squirrel_current_project_v2` with `userId`, restored only for the same authenticated user, and preserved through login/register only when `transferOwner` successfully migrates the previous pre-auth workspace.
- `eVe/intuition/tools/project_bootstrap.js` may recover from a stale empty current project by selecting the single renderable `project_id` already owned by the authenticated user in `state_current`; it must not select from another owner or from DOM state. If `squirrel:user-logged-in` arrives while a project bootstrap is already in flight, it queues a forced authenticated re-bootstrap so the newly authenticated user's project and atomes load without requiring a browser refresh. If project creation succeeds but the authoritative relist is not immediately visible, the bootstrap scheduler must still queue the bounded retry from the active bootstrap pass so the user does not remain logged in without a current project.
- ADOLE atome project-state reads keep Tauri loopback state authoritative and avoid secondary cross-origin loopback Fastify `/api/state_current` fetches.
- Realtime dedupe and text DOM contracts.

Should be extended by:

- Open Squirrel APIs and product-neutral backend contracts.

Should not be duplicated by:

- eVe product APIs. eVe should call open Squirrel APIs or create closed adapters only when product-specific behavior is required.

Status: Verified.

### Squirrel Atome / MCP Surface

Path: `atome/src/squirrel/atome/`

Owner: Atome open layer.

Purpose: Atome object integration and MCP-facing platform, communication, security, and runtime bridge surfaces.

Main files:

- `atome.js`
- `mcp.js` owns only the public JSON-RPC sync/async MCP request handlers and global `handleAtomeMCPRequest` / `handleAtomeMCPRequestAsync` installation. `mcp_core.js` owns MCP protocol constants, event dispatch, operation tracking, cloning, and bounded history helpers. `mcp_security.js` owns actor profiles, security journal state, proposal/confirmation/idempotency state, rate-limit consumption, and confirmation validation. `mcp_security_policy.js` owns ACL/resource/prompt capability policy, sensitive runtime tool matching, access-policy resolution, and rate-limit rule definitions. `mcp_bridges.js` owns optional/required platform API resolvers. `mcp_communication.js` owns unified mail/messages item normalization, list/search/read helpers. `mcp_discovery.js` owns unified tool discovery. `mcp_resources.js` owns MCP resources and prompt templates/read routing. `mcp_runtime.js` owns Atome/runtime invocation payload normalization. `mcp_handlers.js` composes focused handler groups: `mcp_handlers_platform.js`, `mcp_handlers_ai_runtime.js`, and `mcp_handlers_communication.js`. All MCP modules are below the 500-line hard maximum.
- `runtime_tool_resolution.js`

Tests:

- `mcp.communication_surface.test.mjs`
- `mcp.platform_surface.test.mjs`
- `mcp.runtime_bridge.test.mjs`
- `mcp.security_surface.test.mjs`

Should be extended by:

- MCP-compatible Atome public contracts.

Should not be duplicated by:

- eVe hidden tool bridges or direct runtime mutations.

Status: Verified.

### Squirrel AI Runtime

Path: `atome/src/squirrel/ai/`

Owner: Atome open layer.

Purpose: AI gateway, trace policy, provider/model catalog, memory, quota, proactive scheduling, offline mutation queue, and runtime profile loading.

Main files:

- `agent_gateway.js`
- `default_tools.js`
- `default_tools_adole.js`
- `default_tools_bank.js`
- `default_tools_calendar.js`
- `default_tools_contacts.js`
- `default_tools_mail.js`
- `default_tools_share.js`
- `model_catalog_cache.js`
- `model_catalog_refresh.js`
- `model_catalog_registry.js`
- `offline_mutation_queue.js`
- `persistent_memory.js`
- `proactive_scheduler.js`
- `proactive_state_store.js`
- `profile_loader.js`
- `provider_client.js`
- `quota_tracker.js`
- `trace_store.js`

Reusable APIs:

- `AgentGateway`
- Tool status, policy, and risk constants.
- Model catalog cache and refresh contracts.
- Provider client and runtime profile loading.
- Trace store and persistent memory stores.
- Offline mutation queue.

Should be extended by:

- Product-neutral AI/MCP contracts and deterministic AI execution policies.

Should not be duplicated by:

- eVe product AI tools. eVe tools should integrate through explicit tool or gateway contracts.

Known risks:

- `agent_gateway.js` is above the hard threshold and must be reduced before feature growth.

Status: Verified.

### Squirrel Communication Domains

Path: `atome/src/squirrel/{mail,contacts,calendar,bank}/`

Owner: Atome open layer.

Purpose: Product-neutral service/bootstrap/contracts for communication and account-adjacent domains.

Main files:

- `mail/bootstrap.js`, `mail/service.js`, `mail/connector_contract.js`, `mail/icloud_connector.js`, `mail/icloud_connector_normalization.js`, `mail/node_protocol_clients.js`
- `contacts/bootstrap.js`, `contacts/service.js`, `contacts/service_contact_utils.js`, `contacts/connector_contract.js`, `contacts/icloud_connector.js`, `contacts/local_source.js`, `contacts/macos_source.js`
- `calendar/bootstrap.js`, `calendar/service.js`, `calendar/calendar_api_source.js`, `calendar/node_protocol_clients.js`
- `bank/bootstrap.js`, `bank/service.js`, `bank/connector_contract.js`, `bank/local_index.js`

Reusable APIs:

- Bootstrap installers for runtime registration.
- Service contracts and connector contracts.
- Local, iCloud, macOS, and protocol client adapters.
- iCloud mail connector normalization for config, mailbox names, read payloads, and connector records.

Should be extended by:

- Open domain contracts and service logic.

Should not be duplicated by:

- eVe UI panels, tools, or voice routing. Product code should route through these services.

Status: Verified.

### Squirrel Components

Path: `atome/src/squirrel/components/`

Owner: Atome open layer.

Purpose: Generic Squirrel component builders and product-neutral component contracts.

Main files:

- `button_builder.js`
- `editor_builder.js`
- `input_builder.js`
- `matrix_builder.js`
- `menu_builder.js`
- `slider_builder.js`
- `tool_slider_builder.js`
- `table_builder.js`
- `table_visual_contract.js`

Reusable APIs:

- Component builders for common Squirrel UI structures.
- `table_builder.js` owns table runtime creation and interactions; `table_visual_contract.js` owns the product-neutral table templates and style variants.
- Canonical Squirrel system control builders now include Button, Slider, ToolSlider, Input, and Console via the spark bootstrap registry.

Should be extended by:

- Product-neutral component builders.

Should not be duplicated by:

- eVe product UI components when the generic builder or tool-slider runtime can be reused.

Known risks:

- Some builder implementations may still use DOM patterns that need later WebGPU/Squirrel policy review.

Status: Verified for placement, To verify for rendering policy compliance.

### Squirrel Voice Runtime

Path: `atome/src/squirrel/voice/`

Owner: Atome open layer for semantic contracts and voice orchestration.

Purpose: Voice service, semantic request contracts, AI planner, orchestrator, STT normalization, tool routing, session runtime, identity resolution, working memory, telemetry, and runtime bridges.

Main files:

- `semantic_contract.js`
- `service.js` owns the public `createVoiceService` factory and wires capture/STT/TTS/orchestrator/processing/proactive APIs. `service_support.js` owns shared environment, deferred, timing, permission, and speech-constructor helpers. `service_speech.js` owns locale normalization, speech hints/corrections, candidate scoring, and preferred voice selection. `service_providers.js` owns `VOICE_V1_PROVIDER_DECISION` and `resolveVoiceProviders`. `service_browser_stt.js`, `service_tauri_stt.js`, and `service_tts_runtime.js` own the provider-specific Web Speech STT, Tauri STT, and browser speech synthesis runtimes. All voice service files are below the 500-line hard maximum.
- `orchestrator.js` owns the public voice orchestrator facade, shared state, journal dispatch, trace accessors, and the `createVoiceOrchestrator` / `VoiceOrchestrator` / `resolveVoiceExecutionBridge` export surface. `orchestrator_env.js`, `orchestrator_invocation.js`, `orchestrator_connectors.js`, `orchestrator_bridge.js`, `orchestrator_reply.js`, `orchestrator_mail_summary.js`, `orchestrator_planning_runtime.js`, `orchestrator_agent_toolchain.js`, `orchestrator_tool_router_runtime.js`, and `orchestrator_execution_runtime.js` own the focused internal orchestration helpers. The explicit `mail:send` follow-up command creates durable confirmation metadata before dispatching to `tool_router.js`; auto-send/reply draft paths still require router confirmation. All orchestrator files are below the 500-line hard maximum.
- `tool_router.js`
- `ai_planner.js`
- `ai_planner_runtime_context.js`
- `main_handle_bridge.js`
- `session_runtime.js`
- `stt_normalizer.js`
- `working_memory.js`
- `home_surface.js` owns the home voice surface mount/controller orchestration only; `home_surface_state.js` owns timing/history/state helpers, `home_surface_view.js` owns the disposable home-surface DOM composition and render refresh functions, `home_surface_i18n.js` owns localized home-surface copy, `home_surface_transcript.js` owns transcript normalization/echo/decision helpers, `home_surface_response.js` owns assistant response extraction, and the focused `home_surface_*_runtime.js` modules own transcript timers, interrupt handling, turn execution, listening subscription, and meter lifecycle. All home-surface files are below the 500-line hard maximum.
- `panel.js` owns the dev voice-panel behavior controller wiring panel actions to the voice API; `panel_view.js` owns the disposable panel DOM composition and log appender; `panel_probe.js` owns the interrupt-cancellation diagnostic controller. All three are below the 500-line hard maximum.

Test ownership:

- `orchestrator.test.mjs` owns core planner/runtime/MCP/session/journal orchestration coverage.
- `orchestrator.mail_flows.test.mjs` owns mail list, read, unread status, summary, stall, and filtered-selection orchestration coverage.
- `orchestrator.mail_reply.test.mjs` owns mail reply confirmation and contextual reply orchestration coverage.
- `orchestrator.planner_fixture.mjs` and `orchestrator.test_fixture.mjs` own reusable voice-orchestrator test planners and env fixtures.

Reusable APIs:

- Structured mail, contacts, calendar, and Atome semantic requests.
- Structured result contracts.
- Voice orchestration and tool routing.
- STT normalization and VAD helpers.

Should be extended by:

- Open semantic and voice contracts.

Should not contain:

- Closed eVe product panels. `eve/voice/aVa_panel.js` owns the moved closed Dilas panel.

Known risks:

- `tool_router.js` needs line-count review before feature growth.
- UI-related voice modules need targeted ownership verification during API and architecture map work.

Status: Verified.

## eVe Areas

### eVe Product Bootstrap

Path: `eve/`

Owner: eVe closed layer.

Purpose: Product entrypoint, closed bootstrap, concepts, defaults, and versioning.

Main files:

- `eve/eVe.js`
- `eve/README.md`
- `eve/version.txt`
- `eve/default/shortcuts.js`
- `eve/default_data/default_project.js`

Should be extended by:

- Product composition and closed bootstrapping.

Should not be duplicated by:

- Atome open framework bootstrap.

Status: Verified.

### eVe Core Runtime And Stores

Path: `eve/core/`

Owner: eVe closed layer.

Purpose: Product event commits, timelines, media engine, and project security. Persistence is owned by the local-first servers (Axum/AiS) and Fastify through the commit boundary — no client-side store layer (atome_concepts.md §7.5, §21.1).

Main files:

- `atome_commit.js`
- `atome_commit_gesture_trace.js`
- `atome_events.js`
- `atome_timeline.js` owns timeline event replay, preview, undo/redo, and backend apply. It remains an oversized legacy module after the DOM-baseline removal; the active reduction plan is to split pure replay snapshot construction, DOM preview projection, backend apply, and transport controls into cohesive modules before adding new timeline feature scope.
- `event_bus.js`
- `project_security.js`
- `media_engine/*`

Reusable APIs:

- eVe commit and event runtime.
- `atome_commit.js` reuses the canonical Squirrel runtime detector from `atome/src/squirrel/apis/unified/adole_api/runtime.js`; localhost port 3000 is Tauri/Axum for backend selection, preventing startup `state_current` refreshes from falling through to Fastify HTTP.
- `atome_commit.js` owns Fastify bearer invalidation for commit and `state_current` requests: a 401 with a bearer token clears the stored cloud token and stops repeated invalid-signature retries.
- `atome_commit.js` caches Fastify `state_current` 404 results as bounded missing ids, returning canonical `null` without repeated absent-id GETs during UI refresh loops.
- `eVe/core/atome_events/text_creation_session.js` owns the synchronous provisional text-edit surface used during background text creation; it must keep focus behavior and pointer-origin geometry aligned with the canonical text Atome creation path.
- `eVe/core/atome_events/text_fit_runtime.js` owns automatic text host sizing for editable text Atomes; empty point-origin text starts from the described one-pixel origin instead of deriving geometry from DOM projection padding.
- `eVe/core/atome_events/drag_runtime.js` owns canonical drag binding orchestration: per-host listener installation, pointer move handling, snap application, gesture-frame emission, active-drag promotion, and info-panel position updates.
- `eVe/core/atome_events/drag_arm_runtime.js` owns drag `pointerdown` arming: primary-pointer gating, nested-host/interactive/resize rejection, text-edit tap arming, active drag session claims, drag item collection, snap target initialization, and pointer tracking attachment.
- `eVe/core/atome_events/drag_finish_runtime.js` owns drag release/cancel cleanup: pointer capture release, final snap payload resolution, gesture end/cancel/drop emission, text tap release, local drag-end guard recording, shadow/lift restore, runtime drag state reset, and active drag session release.
- `eVe/core/atome_events/drag_session_state.js` owns the mutable per-pointer drag session record and reset semantics; durable Atome state remains outside this object.
- `eVe/core/atome_events/drag_session_support.js` owns deps-independent drag item geometry collection and transient drag shadow snapshots.
- Local gesture trace recording for commit diagnostics is owned by `atome_commit_gesture_trace.js`; `atome_commit.js` may call it but must not own trace-store internals.
- `scripts/check_mutation_ownership_guardrails.mjs` owns the persistent mutation ownership guardrail for source scans: `state_current` remains read/projection-only outside server route owners, event commit transport calls stay inside `eVe/core/atome_commit.js`, Adole adapter ownership, or server route definitions, timeline replay baselines must not be rebuilt from DOM projection state, and timeline preview/replay code must not combine DOM projection reads with backend commits.
- `scripts/check_squirrel_dom_adapter_guardrails.mjs` owns the Squirrel Atome DOM adapter containment scan: legacy `this.element` remains a renderer adapter only and must not receive `properties`, `state`, `model`, `timeline`, media source/ref/url, waveform, thumbnail, group state, sync, permission, or serialized dataset payloads as canonical state.
- `scripts/check_dom_projection_guardrails.mjs` owns maintained DOM projection scans and audit reporting. The default scan targets `tests/fixtures/dom`, emits measurable DOM size/node/tag/data/style/id/root/media metrics plus repeated `data-atome-id` projection contexts, inline style ratio/property summaries, data URI/base64/preview-signature counters, source-attribute leak checks, and canvas role distribution, and enforces forbidden model-shaped `data-*` state, durable media error attributes, duplicate ids, subtree document-root rejection for `.dom` exports, nested document roots in full documents, local source leaks, oversized attributes, repeated Atome projection model-data duplication, named canvas renderer surfaces, node-count thresholds, inline-style thresholds, and canvas/video thresholds.
- T24 final cleanup validation uses the mutation ownership, Squirrel DOM adapter, DOM projection, browser shared import, no-fallback, Tauri FS, Molecule, and syntax guardrails to keep active-project inline edit/accessibility work separated from legacy DOM, footer, dock, and MTraX presentation boundaries.
- `scripts/export_dom_subtrees.mjs` owns offline extraction from full DOM captures into maintained subtree fixtures. Matrix, project, and timeline exports select one canonical root per file; media-host exports deduplicate by `data-atome-id`; full-app captures are written as `.snapshot` diagnostics under `temp/` and are not treated as maintained `.dom` fixtures.
- `tests/probes/tool_genesis_create_atome_order.test.mjs` guards the `toolBase.createAtome` orchestration boundary: commit must precede state refresh, render must follow canonical state refresh, `render:false` must stay available, and `createAtome` must not allocate DOM or write render caches directly.
- `database/adole.js` owns server-side event-to-projection application. `appendEvent` and `appendEvents` must sanitize event patches before writing both `particles` and `state_current.properties`; envelope fields belong in `atomes`, event metadata, or projection columns, not in durable properties.
- `database/adole_history_transactions.js` owns pure HistoryTransaction semantics over event rows: deterministic event ordering, grouping by `tx_id`, continuous gesture frame replay visibility, undo-visible transaction detection, redo selection from append-only events after a cursor, and integrity detection for non-contiguous `tx_id` reuse.
- `database/adole.js` exposes `restoreStateSnapshot` as the controlled state snapshot restore path: snapshot records are normalized into `set` events and replayed through `appendEvents`. Legacy `restoreSnapshot` is contained as an event-log adapter: it reads legacy atome snapshots, builds a canonical `set` patch, and calls `appendEvent`; it must not delete particles or write `state_current` directly.
- Shared Atome property sanitization for eVe commit and project Atome creation boundaries.
- Event, media, and project store APIs with memory adapters.
- Platform-specific storage backends.
- Molecule engine, command catalog, API, native audio, and WebGPU renderer.
- `eVe/intuition/tools/molecule/track_types/index.js` owns the pure Molecule track-type registry. `kernel/schemas.js` and `kernel/reducers.js` consume that registry for accepted track kinds and clip/track compatibility instead of owning separate hard-coded rules.
- `eVe/intuition/tools/molecule/kernel/automation.js` owns the pure Molecule automation reducers (V1.7): add/remove `timeline.automation` lanes and add/move/edit/remove time-ordered keyframes `{ keyframe_id, time_seconds, value, curve }`, with typed errors and re-validation. The automation schema (`AUTOMATION_CURVES`, lane/keyframe validators) lives in `kernel/schemas.js`; session dispatch/durable ops + `automation.*` verb aliases route through it; `render/timeline_scene.js` projects keyframes as dots on the target lane; AI/MCP parity via the named `eve.timeline.automation.*`/`ui.timeline.automation.*` tools.
- `eVe/intuition/tools/molecule/kernel/time_model.js` owns the pure Molecule tempo-map and dual-time model: deterministic seconds-to-musical conversion, musical-to-seconds conversion, time reference creation, and snapshot normalization. `kernel/schemas.js`, `kernel/reducers.js`, and `persistence/index.js` consume it so timeline snapshots keep seconds as render/seek truth while carrying musical references for editing.
- `eVe/intuition/tools/molecule/render/timeline_scene.js` owns the pure Molecule timeline-to-virtual-scene projection (V1.5 render foundation): it maps a timeline snapshot to flat render records (track lanes, clip rectangles, single playhead) on the dedicated `molecule` layer and builds the scene tree through the canonical `domains/rendering/virtual_scene_contract.js` seam. It introduces no renderer of its own — records feed `createVirtualSceneTree`/`diffVirtualSceneTrees` and render on the single Bevy/WebGPU project surface; seconds remain the x-layout truth and per-clip filter/transition flow to the M1/M2 material path only when present. Clip blocks are emitted as `shape` records (carrying the media kind as `clip_kind` metadata) so the Bevy projection filter (`recordsForBevyProjection`) cannot drop source-less clips before a decoded texture is bound.
- `eVe/intuition/runtime/molecule_timeline_scene_bridge.js` owns the Molecule timeline → project Bevy canvas wiring (V1.5 render + V1.6 drag): it projects a timeline snapshot via `render/timeline_scene.js` and pushes the records onto `#eve_surface_project` through `domains/rendering/project_scene_runtime.js` `updateProjectSceneRecords`, reconciling stale lane/clip records across frames and clearing on close. It also registers a project-scene commit interceptor (`setProjectSceneRecordCommitInterceptor`) so an on-canvas drag of a `mol:clip:*` block is translated back into a timeline-semantic `clip.move` (scene px → seconds via `effectivePxPerSecond`) instead of a generic 2D atome commit; the committed move re-renders authoritatively so collision/lane snapping come from the kernel. Lives outside the Molecule core (like `timeline_actions.js`) with injectable dependencies so reconciliation and drag translation are unit-testable without a live canvas. Exposed as `window.eveMoleculeTimelineApi.renderTimelineScene`/`clearTimelineScene`.
- `eVe/domains/rendering/project_scene_runtime.js` `setProjectSceneRecordCommitInterceptor` lets an overlay owner claim the commit of its own records on a drag/resize end before the generic atome commit (returns true when handled). Generic atome edits are untouched; used by the Molecule timeline to route clip drags to `clip.move`.
- `eVe/domains/rendering/project_scene_runtime.js` `updateProjectSceneRecords` merges several records into the project scene (and drops `removeAtomeIds`) in a single render pass — the batch counterpart of `updateProjectSceneRecord`, used by overlay owners (the Molecule timeline) that push a whole lane/clip/playhead frame at once.
- `eVe/intuition/runtime/molecule_stores.js` owns the canonical Molecule session stores (V1.8 foundation, product decision 2026-06-20): `projectStore.saveTimeline` persists the timeline snapshot as the `molecule_timeline` property of the owner group atome through `window.Atome.commit` (so every edit is one deterministic Time Machine entry), `projectStore.loadTimeline` reads it back via `getStateCurrent`, and `eventStore.append` emits each kernel history event on eVe's deterministic event bus. `installMoleculeStores(window)` wires `window.Atome.moleculeStores` at boot (in `tool_genesis_bootstrap_runtime.js`, before `installMoleculeGroupTimelineRuntime`); `window.Atome` is resolved lazily per call so install never races the commit-API attach order. The Molecule kernel stays pure of persistence (this module lives outside the Molecule core).
- `eVe/intuition/tools/molecule/runtime.js` `openGroupTimeline` now renders the timeline on the single Bevy canvas (via `molecule_timeline_scene_bridge.js`) and re-renders on every committed edit through `onStateCommitted`; it no longer opens the DOM editor panel (canvas is the mandated render path; editor chrome is parked under NewMolecules §7, so `molecule/panel/` is no longer wired by the runtime). `closeGroupTimeline` clears the canvas overlay.
- `eVe/intuition/tools/molecule/session/timeline_operations.js` owns Molecule timeline verb normalization (`eve.timeline.*` / `ui.timeline.*` to kernel operations), selected-clip extraction, clipboard paste operation construction, and atomic batch operation normalization consumed by `session/session.js`.
- `eVe/intuition/tools/timeline_actions.js` owns canonical `ui.timeline.*` runtime tool registration and delegates to the active `group_timeline_api`; Molecule runtime modules must not register tool definitions locally.
- Molecule media image mounting owns alpha-preserving WebGPU canvas projection for raster images. SVG sources must remain on the vector shape renderer path and must not be rasterized by the Molecule image canvas.

Should be extended by:

- Closed product persistence and media engine workflows.

Should not be duplicated by:

- New product stores outside `eve/core/*_store/`.

Known risks:

- Molecule engine files include large cohesive runtimes and must be reduced when touched.
- Store adapters need API map coverage before new storage features.

Status: Verified.

### eVe Domains

Path: `eve/domains/`

Owner: eVe closed layer.

Purpose: Product-specific domain logic for Atome genesis, media, user profile, and MTraX/Molecule workflows.

Main areas:

- `eve/domains/atome/`
- `eve/domains/media/`
- `eve/domains/mtrax/`
- `eve/domains/user/`

Reusable APIs:

- Media API facades, persistence service, diagnostics, media source and identifier helpers.
- `eVe/domains/media/api/media_api_shared.js` is the compatibility export facade for media API helpers. `media_api_auth.js` owns Adole API discovery, local/cloud auth headers, backend URL selection, protected streaming auth query handling, and protected-media local path primitives; `media_api_local_availability.js` owns Fastify-to-local sync and `ensureMediaLocallyAvailable(...)`. Do not add MTraX media aliases, secondary media routes, or fallback transport logic to these modules.
- Media source and identifier helpers own canonical `/api/uploads` and `/api/recordings` route resolution for product media playback paths, including timestamped recording filenames before renderer handoff and Tauri-local canonicalization away from loopback Fastify media URLs.
- SVG uploads are editable Atome `shape` objects: `eVe/domains/media/asset_box.js` is the public upload facade and delegates plain uploaded media Atome creation to `asset_box_atome_store.js`, upload/download transport to `asset_box_upload_transport.js`, runtime/auth base selection to `asset_box_auth.js`, type/dimension/SVG inference to `asset_box_media.js`, path normalization to `asset_box_paths.js`, share/cache state to `asset_box_selection_state.js`, and the disposable upload panel to `asset_box_panel_dom.js` / `asset_box_panel_render.js`; these modules contain no MTraX import grouping path. `eVe/intuition/runtime/tool_genesis.js` must not convert SVG shape specs into `group/mtrax_media`.
- `eVe/domains/media/media_diagnostics.js` validates renderer-owned media projections by reading canonical media state plus lightweight host visibility/renderer summaries. `media_diagnostics_url.js` owns diagnostic URL normalization, token redaction, media-kind inference, and rect summaries; `media_diagnostics_probe.js` owns HTTP and temporary probe-element checks. Static image/SVG/video/audio imports can pass diagnostics through visible project projection evidence when minimal DOM hosts intentionally do not expose native media tags. The full-suite diagnostic checks HTTP access plus project projection/playback only; it must not reopen MTrack or inspect deleted `window.eveMtrackApi` state.
- `eVe/domains/media/shared/media_projection_state.js` owns disposable host-side media projection source, identifier, and runtime error state. Renderers may use it to bind playback resources and transient mount failures to DOM hosts, but must not serialize media URLs, recording identifiers, local paths, user-scoped media query state, or durable `data-media-api-error` values into `data-*` attributes.
- `eVe/domains/media/shared/media_atom_integrity.js` owns the closed product media Atome integrity contract for persisted project media: stable source, duration for audio/video, visual refs, and pending visual status before commit/render.
- Fixture-driven media restoration coverage for this contract lives in `tests/eve/media_fixture_restore_contract.test.mjs`; browser playback probes remain higher-level acceptance coverage and must not be the only guard for persisted media Atome integrity.
- DOM teardown reconstruction coverage lives in `tests/eve/project_dom_teardown_reconstruction.test.mjs`; it verifies grouped timeline/step state and media visual refs are restored from canonical properties, not from stale `data-*` payloads.
- MTraX panel close is the canonical runtime cleanup boundary: pending audio/media work is awaited with bounded close tasks, transient clip/runtime state is cleared after dormant metadata is preserved, and expensive timeline verification/prewarm/preview export work must not run synchronously for `panel_close`.
- Browser video recording owns a single persisted project atome: the `video_recording_*` atome created during recording persistence is reused and rendered on the project surface after stop. Reusing that recording atome still requires a canonical `set` commit with the active project id so `state_current`, project listing, refresh, and WebGPU scene reconstruction all agree. `ensureProjectMediaAtome` remains for media paths that do not already return a recording atome, such as native/file-only captures and image capture.
- `eVe/domains/media/shared/media_video_poster_runtime.js` owns reusable video frame poster capture for project-visible video media and molecule previews; it uses `eVe/domains/media/shared/video_decode_pool_runtime.js` before seek/play/readback and rejects transparent WebKit readbacks instead of persisting blank posters. `video_decode_pool_runtime.js` also owns shared frame-presentation waiting and non-fatal WebKit `play()` rejection handling, so poster capture and Bevy texture readback cannot drift. Normal video atomes and group previews must consume it instead of duplicating video seek/canvas capture logic.
- `eVe/intuition/shared/capture_video_poster_runtime.js` owns live capture-tool poster extraction from the active preview overlay, persistence of poster fields, and DOM mounting for recorded video atomes; `capture.js` may only wire this shared runtime into UI stop paths.
- Recorded video atome creation must carry the recording owner into `resolveMediaUrl` and persist owner/media-user particles so the first load uses the user-scoped recordings route.
- The cleaned `eVeIntuition.js` path must not auto-create MTraX group Atomes and no longer owns deleted-editor open/panel/API routes. Deleted-editor footer controls such as `ui.mtrack.footer_control`, `ui.mtrack.loop_cells`, `ui.mtrack.clone`, `ui.mtrack.follow*`, and MTraX zoom/snap/tempo controls are no longer `eVeIntuition.js` footer definitions or registered tool handlers. Deleted-editor clip-selection, automation, split/join/crop, track mute/solo, hidden timeline split, old MTraX move surfaces (`ui.mtrack.clip_selection`, `ui.automation`, `ui.split`, `ui.join`, `ui.crop`, `ui.mute`, `ui.solo`, `ui.timeline_split`, MTraX `ui.move`/`moveClip`), `ui.mtrax.open`, `ui.mtrack.panel`, `tool.main.mtrack`, `ensureMtrackPanelModule`, `window.eveMtrackApi`, MTrax preview metadata events, MTrax timeline payload builders, `mtrax_timeline*` fallback aliases, Atome-editor MTrack footer embedding/session state (`mtrackHost`, `mtrackExpanded`, `MTRACK_FOOTER_ANCHOR_UPDATE_EVENT`), the old DOM footer socket/placement/lock engine (`ensureAtomeEditFooterRoot`, `setAtomeEditFooterVisibility`, layout locks, resize observers), Flower/footer/default/warmup `mtrack` exposure, `mtracks`/`mtrax` footer-kind aliases, mtrack preview-text creation, stale `tool_ui.mtrack.*` boot cleanup, stale MTrack-named project/selection helpers, bootstrap mtrack diagnostics, `mtrack_preview_text_*` text-create behavior, project-drop MTrack native file routing, project-drop MTrack projection latch behavior, clipboard MTrack selection, `resolveMtrackToolScope` routing, MTrack delete routing, MTrack transport interception, selected-group DOM media transport (`groupPlaybackState`, `playGroupTransport`, `pauseGroupTransport`), selected-Atome DOM media transport through local `video/audio` nodes, and `__DEBUG__` MTrack state readers are no longer `eVeIntuition.js`, `tool_runtime.js`, `project_drop.js`, `copy.js`, `tool_invocation_runtime.js`, `delete.js`, `tool_button_factory.js`, `tool_interaction.js`, `panel_module_loaders.js`, or `debug_runtime.js` surfaces/default behavior; `eVeIntuition.js`, `tool_runtime.js`, `project_drop.js`, `delete.js`, `tool_button_factory.js`, `tool_interaction.js`, `panel_module_loaders.js`, and `debug_runtime.js` currently have no active `mtrack`/`mtrax`/`eveMtrack` references, while `tool_runtime.js` alone owns generic `ui.move` through `v2_move`.
- Atome-triggered Molecule/MTraX opening through `requestMtrackOpenForAtome` was removed. Future montage/editor opening must be rebuilt through the Bevy/WebGPU editor command surface, with `group_timeline_api` owned by the Molecule runtime rather than re-registered from `eVeIntuition.js`.
- Project-visible media Atomes on the cleaned canvas route may not have visible Atome DOM hosts. Media diagnostics must resolve those Atomes from canonical state and `project_scene_runtime` records without rebuilding deleted MTraX timeline payloads or requiring `[data-atome-id]` hosts.
- `eVe/domains/media/selected_project_media_playback_runtime.js` owns selected active-project media transport for the cleaned canvas route. It resolves selected media records from `project_scene_runtime`, sends audio and extracted video-audio through the existing `Squirrel.av.audio`/Kira facade, preserves runtime-only Audio Atome and extracted video-audio pause/resume positions across play-tool toggles through Kira voice start offsets, and requires selected project video playback to use the project timeline automation path instead of mutating project-scene records directly. Extracted video-audio must consume the per-Atome project timeline playhead returned by the project playback runtime so Bevy video decode and audio resume from the same position. It must not create visible per-Atome media DOM hosts, a second media engine, a deleted MTraX forced-transport branch, a selected-group `eveMtrackApi.loadGroupTimeline` route, a selected-group DOM video/audio sequence transport, or a selected-Atome DOM `video/audio` transport in `eVeIntuition.js`.
- `eVe/intuition/runtime/eve_intuition/media_reader_tool_runtime.js` owns eVeIntuition registration and orchestration for `ui.media.reader`, `ui.animation.reader`, `ui.play`, `ui.pause`, and `ui.stop`. It injects selection and latch dependencies from `eVeIntuition.js`, delegates selected media transport to `selected_project_media_playback_runtime.js`, delegates project automation lookup to `project_scene_runtime.js`, and is the only non-decode runtime allowed to call `setBevyVideoDecodePlayback(...)`.
- Audio/video recording persistence uses `record_capture_runtime.js` -> `add_clip_runtime.js` -> media Atome creation with the current project id. Suppressing source Atome creation for stopped recordings is invalid because the project-visible source Atome is the canonical object shown on the current project.
- Video preview renderers and preview panel services. `eVe/domains/media/api/video_recording_controller.js` must pass the exact `MediaStream` returned by `startVideoRecording` into `eVe/domains/media/preview/video_preview_renderer.js` for recording overlays, while standalone preview panels may still acquire a preview-registry stream; the renderer releases only streams it acquired itself and always displays through the existing WebGPU video preview renderer.
- `eVe/intuition/shared/group_video_poster_runtime.js` owns conversion of project-visible video molecule previews into persisted image posters, so imported or recorded video molecules do not render live black video placeholders in the project grid.
- MTraX transport, clips, tracks, timeline, media, preview, project, automation, SVG, text, and recording runtime modules.
- `eVe/domains/mtrax/timeline/ruler_canvas_runtime.js` owns canvas-backed ruler tick rendering and visible tick-window calculation. `ruler_render_runtime.js` keeps interactive loop and marker zones in DOM, but repeated tick marks and labels should render through the canvas surface when available.
- MTraX local file drops create linked video/audio clip pairs through `eVe/domains/mtrax/clips/add_clip_runtime.js` and `linked_video_audio_drop_runtime.js`; the audio side must keep the existing `video_audio` descriptor path so server/native extraction and conversion remain centralized.
- MTraX preview frame dispatch owns visual track priority: during playback and transport scrub, video/image clips are resolved by top visible track order; paused editing may temporarily promote selected clips for manipulation, while audio clips remain outside visual priority filtering.
- MTraX molecule poster capture is owned by `preview_poster_capture_runtime.js` and the shared video poster path; the removed internal preview canvas readback must not be reintroduced as a poster fallback.
- MTraX clip preview metadata owns source-window rendering for audio waveforms and video thumbnails, so split/crop edits must preserve the source `in`/`out` interval visually instead of resampling the full media source. Preview render payloads are registered through `eVe/domains/mtrax/preview/preview_registry_runtime.js`; timeline DOM hosts may expose only short `data-preview-id` references, never `data-preview-signature`, waveform arrays, thumbnail data URLs, or serialized preview payloads. Hidden media elements used for MTraX duration probing must remain detached runtime resources, while Molecule raster-pool videos must mount under the closed raster-pool shadow root so upload URLs and `media_user_id` query state do not enter the product DOM.
- MTraX clip split/join editing is split by responsibility: `split_join_runtime.js` owns split execution and selected-target filtering, while `join_runtime.js` owns join segment construction and replacement. Split targets are explicit clip inputs, selected clips at the playhead, or clips on selected tracks at the playhead; linked audio/video companions are never auto-added by split.
- MTraX clip deletion is split by responsibility: `deletion_runtime.js` owns selected clip/track deletion and source cleanup, while `loop_cell_deletion_runtime.js` owns loop-cell range deletion and intra-cell split preservation. Interactive clip deletion uses the same selected clip/track scope model as split and must not auto-expand through linked audio/video metadata or `sync_group_id`.
- MTraX clip selection API ownership lives in `selection_context_runtime.js`: selection reads expose runtime clip ids, selection/persistence ids, and per-clip descriptors; selection writes resolve incoming clip identifiers through the existing clip target resolver before mutating `selectedClipIds`.
- MTraX clip crop preview masking lives in `eVe/domains/mtrax/clips/crop_preview_mask_runtime.js`; crop gestures use it for live visual feedback while the final preview metadata redraw remains owned by `preview_metadata_runtime.js`.
- MTraX karaoke detail is split by responsibility: `karaoke/detail_runtime.js` owns detail state and mutation application, while `karaoke/detail_record_schedule_state.js` owns selection-only record-schedule detail projection.
- User profile API.

Should be extended by:

- Product-specific media and MTraX features.

Should not be duplicated by:

- Intuition tools when a domain runtime already owns the behavior.
- Atome open APIs unless the behavior is product-neutral and explicitly promoted.

Known risks:

- MTraX still has legacy aliases and naming (`mtrack`, `mtrax`, `hmtracks`) pending Molecule stabilization and rename phase.

Status: Verified.

### eVe Intuition UI

Path: `eve/intuition/`

Owner: eVe closed layer.

Purpose: Product UI shell, tools, panels, matrix, menu, ribbon, flower menu, projection, runtime, contracts, and shared closed UI helpers.

Main areas:

- `eve/intuition/eVeIntuition.js`
- `eve/intuition/bootstrap.js`
- `eve/intuition/panel_definitions.js`
- `eve/intuition/contracts/`
- `eve/intuition/runtime/`
- `eve/intuition/tools/`
- `eve/intuition/panels/`
- `eve/intuition/menu/`
- `eve/intuition/matrix/`
- `eve/intuition/flower/`
- `eve/intuition/ribbon/`
- `eve/intuition/shared/`

Reusable APIs:

- Command bus and tool gateway.
- Tool registry and interaction runtime.
- `PANEL_SURFACE_DEFINITIONS` as the single source of truth for panel ids, module keys, open/close function names, TTL policy, and pointer-toggle behavior.
- `buildPanelRuntimeConfigByToolId()` derives tool-runtime panel config from `PANEL_SURFACE_DEFINITIONS`; do not add a second panel config table in tool runtime code.
- `panelCreatorV2` owns panel lifecycle registration, lazy loading, attach-to-layer, open/close, destroy policy, and panel bounds mode.
- `eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js` owns eVeIntuition panel surface registration, window-function payload normalization, surface id lookup, and PanelCreatorV2 open/close bridging. It no longer carries MTraX-only panel close diagnostics.
- `eVe/intuition/runtime/eve_intuition/tool_latched_state_runtime.js` owns eVeIntuition tool latched-state cache, menu sync, surface-state/dialog-close listeners, and panel tool-state event emission. It no longer carries MTraX-only surface/dialog trace branches.
- `eVe/intuition/runtime/eve_intuition/debug_runtime.js` owns the eVeIntuition `window.__DEBUG__` diagnostic facade, deterministic test-mode style injection, footer/selection/timeline debug readers, and project persistence diagnostics.
- `eVe/intuition/runtime/eve_intuition/main_menu_auth_runtime.js` owns authenticated/disconnected main-menu content patching and initial login-sequence gating. Initial unauthenticated boot opens the shared login sequence directly through `eVe/intuition/tools/user_login_shared_runtime.js`, then lazy-loads the Home module only when the user submits credentials or chooses guest entry. `eVeIntuition.js` injects `intuition_content`, translation, and the Home module loader; it must not re-inline auth menu child lists, home patches, or initial-login sequencing.
- `eVe/intuition/runtime/eve_intuition/main_tool_registration_runtime.js` owns registration of base main-menu definitions as Atome tools, including duplicate name/tool-id guardrails, visible/catalog scope derivation, and handler routing back through the canonical main-tool interaction path. `eVeIntuition.js` keeps only the content declaration and injected tool-runtime dependencies.
- `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js` owns the main Intuition menu content declaration. The visible main sequence is now `home`, `find`, `time`, `communicate`, `mode`, and `view`; the unimplemented no-op `help` tool is not exposed. `eVeIntuition.js` injects panel/tool callbacks only and must not re-inline the content object.
- `eVe/intuition/runtime/eve_intuition/main_menu_runtime.js` composes the closed main-menu owners: catalog, latched-state resolution, selection guard, interaction dispatch, content declaration, auth gate, and Atome-tool registration. `eVeIntuition.js` must consume this composite instead of wiring those owners inline.
- `eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js` owns main-tool id catalog resolution, dedicated declaration ids, base-tool definition filtering, and canonical main-tool interaction dispatch/latch synchronization. `eVeIntuition.js` consumes the returned catalog and trigger function and must not re-inline `triggerMainToolInteraction`.
- `eVe/intuition/runtime/eve_intuition/text_tool_runtime.js` composes the text-tool coordinator state and injects the focused `text_tool_editing_runtime.js`, `text_tool_create_runtime.js`, and `text_tool_background_runtime.js` owners. `eVeIntuition.js` must not re-inline text session helpers, text background focus state, or create alternate DOM/non-Bevy text renderers.
- `eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js` owns Flower/context item resolution, mixed-selection routing, transport-bound extra input construction, Flower import/delete dispatch, and the shared context-bound transport tool id set used by footer invocations. `eVeIntuition.js` must not re-inline Flower item builders or duplicate the transport-selection payload policy.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_selection_runtime.js` owns Atome-edit footer selection normalization, selection publication, and footer tool `extraInput` payload construction. Footer row/child/definition runtimes consume these injected helpers instead of rebuilding selection payloads inline.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_lifecycle_runtime.js` owns Atome-edit footer ownership, `createIntuitionXFooterRuntime` lifecycle, generated style installation, focused fullscreen layout for DOM-host contexts, double-click host resolution, Bevy project-scene rect anchoring without visible Atome DOM hosts, show/hide, workspace reset listeners, and project-timeline availability sync.
- `eVe/intuition/runtime/eve_intuition/atome_edit_footer_runtime.js` composes the focused Atome-edit footer owners and exposes the single closed footer runtime consumed by `eVeIntuition.js`.
- `eVe/intuition/runtime/eve_intuition/panel_actions_runtime.js` owns standard panel open routing, generated panel operations, canonical Home/Matrix/Delete/Undo/Orientation actions, and Intuition item enabled-state updates. `eVeIntuition.js` must not re-inline panel open logging or the standard panel action table.
- `eVe/intuition/runtime/eve_intuition/context_tool_invocation_runtime.js` owns unified context tool invocation for footer, Flower, and the main ribbon. It delegates only to the canonical `invokeToolFromUiButton` and the injected Finder handler; it must not create another tool bus.
- `eVe/intuition/runtime/eve_intuition/boot_runtime.js` owns eVeIntuition boot-time menu exposure, auth sync, panel surface registration, Flower/footer/vector/draw installation, deferred non-critical module warmup, UI tool registration, footer API exposure, debug runtime installation, and reload-time workspace reveal for already-active authenticated or anonymous sessions. `eVeIntuition.js` creates the main ribbon closed (`open: false`) so disconnected boot cannot paint toolbox buttons before the login accueil. Workspace/tool warmups start only after an active workspace is known or after `eve:login-choice-mounted`; `eve:login-choice-visible` remains a post-fade readiness signal and is emitted after the login choice entry fade finishes, so disconnected boot does not reveal toolbox content before the visible login accueil. When a workspace is already active at boot, `boot_runtime.js` waits until a current project exists and then calls the canonical `openWorkspaceDashboardAndMainMenu({ source: 'boot_workspace', projectId })` entry once; it must not create a second dashboard/menu path. `eVeIntuition.js` must not re-inline boot/warmup/register code.
- `eVe/intuition/runtime/eve_intuition/tool_window_bridge_runtime.js` owns the closed runtime globals `window.__eveTextTool` and `window.__eveFinderUiRuntime`, including text creation helpers, background keyboard bridge, Finder inline/panel bridge, and injected command routing. These globals remain eVe closed bridge surfaces and must not become canonical Atome state or rendering owners.
- `eVe/intuition/eVeIntuition.js` is now a sub-500-line closed boot coordinator after RF-01. It wires existing focused runtime owners, exposes `new_menu`/`new_menu_v2`, and must stay below the 500-line hard limit; future changes must extend the focused runtime owners instead of re-inlining panel actions, text state, main-menu composition, Atome-edit footer lifecycle, or boot registration.
- Panel API, panel layout policy, layer contract, layer ownership, selection, latched state.
- Layer contract owns the global stack order and its distinct HTML layer nodes: project tools, floating project palettes, Molecules, component/docked palettes, panels/dialogs, main ribbon, active drag.
- `project_drop.js` owns the remaining project-drop/projection-toolbox coordination while RF-02 reduction continues; focused owners already extracted are `project_drop_media_runtime.js` (ABox lazy loader, file/text/drop-position helpers, media kind/source normalization), `project_drop_finder_payload_runtime.js` (Finder/tool payload parsing and tool/source resolvers), `project_drop_event_runtime.js` (native-file/drop event predicates and project-layer resolution), `project_drop_zone_runtime.js` (drop styles, project drop-zone registry, document drop bridge, attach/destroy/reset), `project_drop_main_toolbox_session_runtime.js` (main-ribbon trash/drop session, handle icon switching, delete-hover overlay state), `project_drop_tool_catalog_runtime.js` (projected tool name/type/palette/catalog behavior resolution), `project_drop_projection_palette_runtime.js` (projection palette child hydration, expand/collapse state, visibility relayout, and dynamic toolbox palette sync), `project_drop_projection_slider_runtime.js` (projection slider relayout and value apply routing through the canonical tool invocation path), `project_drop_projection_drag_preview_runtime.js` (projection drag ghost image creation and cleanup), `project_drop_projection_move_runtime.js` (tool-projection instance drag/move/delete/toolbox-reinsert persistence), `project_drop_projection_move_flower_guard.js` (Flower pointer-lock cancellation and drag trace boundary), `project_drop_toolbox_handle_drag_runtime.js` (projection dynamic toolbox handle gesture: tap toggles expand/collapse, horizontal drag resizes, held drag relocates the grouped toolbox with main-ribbon trash drop), `project_drop_toolbox_rebalance_runtime.js` (proximity clustering of projected tool hosts into rebuilt grouped dynamic-toolbox containers: handle, scrollable content track, packed tool items, cap, persisted expand/collapse), `project_drop_toolbox_chrome_runtime.js` (grouped toolbox container chrome build/refresh: handle, scrollable content host, packed track, scroll cap with prev/next stepping, and handle/content/cap geometry reflow for the current expand/dock state), `project_drop_tool_visual_mount_runtime.js` (`createToolProjectionVisualFromInstance`: resolve a Finder/tool payload into a projected tool-instance host + button, wire state/drag/move/action bindings, hydrate palette children, schedule rebalance), `project_drop_finder_record_drop_runtime.js` (`resolveToolDropRuntime` + `handleFinderRecordDrop`: resolve the active tool-drop runtime, invoke/move a Finder tool instance on project drop, create the dropped Finder atome, orchestrate a Finder record drop with token de-dup + handler dispatch), `project_drop_tool_button_state_runtime.js` (projected tool button state: apply/cache latched visual state across alias families, resolve cached latch, swap button icon, recognize a projection tool button, build its drag payload from live DOM/store state), `project_drop_delegation_runtime.js` (one-time document-level click/dragstart/dragend + tool-state-change delegation for projected tool buttons: latch sync across alias families, drag payload + main-toolbox drop session; module-internal one-shot guard flags), `project_drop_projection_host_geometry_runtime.js` (pure leaf helpers: node intrinsic size/abs position, host snapshot, per-project host collection, proximity clustering/merge, container id + expand prefs, grouped-host local layout storage, dynamic gap/inset resolvers, projection boolean/edge/collapsed parsers — no toolbox-chrome callbacks), `project_drop_external_runtime.js` (external/native-file import through canonical `ui.creator`, upload result normalization, stack-position merge, per-file creator invocation), and `project_drop_dedupe_runtime.js` (Finder/tool drop token de-duplication and in-flight token state). `eVe/intuition/shared/tool_drag.js` owns the canonical `application/x-eve-finder-record` MIME constant, active tool-drag session payload writes, and drag-preview setup for Intuition tool drags. Finder/tool drops from Finder, main toolbox, Flower, projection strip, ribbon, and Atome-editor footer surfaces use only that canonical payload plus active drag-session state; do not reintroduce `text/plain` / `eve-tool:` mirror payloads. Project drop must not route native file drops to deleted `window.eveMtrackApi` handlers, keep MTrack panel/drop priority selectors, or special-case MTrack projection latch state.
- Project-drop diagnostic logging was removed after the project import path was validated. `eVe/intuition/tools/project_drop.js` now keeps the creator/drop path without the temporary debug ring buffer or console emission module.
- `tool_runtime.js` owns protected system-tool contract reconciliation before gateway execution, including `ui.creator` recovery when persisted registry state has a stale execution mode. Focused runtime owners are split out: `tool_runtime_registered_handler.js` owns registered-handler publication, latched state, and window-function calls; `tool_runtime_atome_ops.js` owns bootstrap Atome modifiability checks, sanitized set batches, duplicate/opacity/z-index/align/distribute/move-relative operations; `tool_runtime_creator_media.js` owns creator media URL normalization and intrinsic image/video sizing probes; `tool_runtime_context.js` owns runtime selection/current-project/active-target context construction; `tool_runtime_finder_execution.js` owns finder panel visibility/target/inline-open resolution, finder UI-runtime access (no registry), the `executeFinderMain`/`executeFinderPanel` handlers, and creator spec building (`buildCreatorSpec`), dispatched via `resolveExecutor` by mode; `tool_runtime_gesture_selection.js` owns implicit gesture sessions (drag/resize/scale/rotate aliases) and select/multi-select/clear/lasso selection mutations, rename, and activate/inactivate handlers; `tool_runtime_create_execution.js` owns the text/vector/draw/matrix create handlers (`executeTextCreate`/`executeVectorEdit`/`executeDraw`/`executeMatrixView`, lazy matrix runtime helpers, shared move-session key resolver); `tool_runtime_circle_tool_state.js` owns `executeCircleCreate` plus the text/vector/draw tool active-state accessors (read/set/next-from-menu-action) and text-atome DOM helpers consumed by the create handlers; `tool_runtime_bootstrap_panel_handlers.js` owns the bootstrap secondary handlers (panel/palette/perform/toggle/momentary + internal undo/redo operations); `tool_runtime_bootstrap_transport_handlers.js` owns the bootstrap transport/reader/record-toggle and action-proxy handlers; `tool_runtime_bootstrap_defs_a.js` and `tool_runtime_bootstrap_defs_b.js` own the declarative V2 bootstrap tool-definition data (103 defs, split for size) as `buildBootstrapDefsA`/`buildBootstrapDefsB` builder functions taking the injected def builders + execution-mode constants; `tool_runtime.js` concatenates them into `V2_BOOTSTRAP_DEFS`. The deleted MTraX tool IDs (`tool.main.mtrack`, `ui.mtrack.panel`, `ui.mtrax.open`) must stay out of bootstrap handlers, default tool definitions, `eVeIntuition.js` panel wrappers, dock-preservation paths, visual latch bridges, latch alias groups, bootstrap diagnostics, and text-create source-layer behavior until the editor is rebuilt on the Bevy/WebGPU path. Generic `ui.move` remains in `tool_runtime.js` as `v2_move` for Finder/arrange and must not be re-routed through deleted MTraX clip APIs. `tool_invocation_runtime.js` now only invokes tools; the deleted `resolveMtrackToolScope` helper must not be restored.
- Shared media types, DOM utilities, SVG runtime, color values, group state, slider content, slider DOM/data-role selectors, shared slider direct-drag control, and tool drag.
- `eVe/intuition/tools/core/svg_draw_runtime.js` owns SVG draw tool activation, pointer-session orchestration, live project gesture updates, and `window.__eveDrawTool` installation. `eVe/intuition/tools/core/svg_draw_dom_runtime.js` owns SVG draw DOM/project-pointer resolution and live markup projection for the disposable legacy host path. `eVe/intuition/tools/core/svg_draw_commit_runtime.js` owns draw gesture ids, canonical commit payload construction, and project patch derivation. SVG geometry and markup descriptors remain in `svg_draw_model.js`.
- IntuitionX projection tool DOM is created by `eVe/intuition/projection/button.js` and projected through `eVe/intuition/projection/tool_strip.js`; static projection visuals live in `eVe/elements/eVe_look.js`, while `eVe/intuition/core/dom.js` prevents projection surface color/shadow constants from being rewritten inline.
- `eVe/intuition/ribbon/menu.js` is the main ribbon bootstrap/coordinator and must attach the shared `.eve-intuitionx-projection-tool` visual class through the extracted tool renderer instead of recreating browser-native button visuals. `menu_model.js` owns ribbon content cloning/patching, tool-entry normalization, handle/icon resolution, tool sizing/radius, color interpolation, transform composition, and pressed/tool visual-state helpers. Runtime ownership is split across focused modules: `menu_shell_runtime.js` creates the ribbon/layer DOM shell, `menu_delete_visual_runtime.js` owns delete target/backdrop visuals and dragged-node attraction, `menu_drag_delete_runtime.js` owns drag-delete event routing, `menu_layout_runtime.js` owns metrics/overflow/reveal stops, `menu_scroll_runtime.js` owns wheel/native scroll snap behavior, `menu_tool_render_runtime.js` owns tool/palette button rendering and tool press hover routing, `menu_visibility_runtime.js` owns open/close/dismiss visibility state, `menu_placement_runtime.js` owns placement/handedness, `menu_public_api_runtime.js` owns the public API facade and latch adapters, `menu_auth_dock_runtime.js` owns auth dock transition animation, `menu_external_open_runtime.js` owns external-open width/geometry resync, and `menu_quick_capture_runtime.js` owns the Home-handle quick-capture overlay, reveal/hover state, fullscreen handoff, and sweep completion. `menu.js` must not reintroduce those helpers inline.
- `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js` owns the authenticated main ribbon content declaration. The visible main sequence is `home`, `find`, `time`, `communicate`, `mode`, and `view`; `time` exposes `calendar` instead of the removed visible `timeline` child, `mode` is a palette whose children are `perform`, `mode_edit`, and `mode_consume`, and `view` is a palette whose children are `view_list`, `view_table`, and `view_natural`, while `matrix`, `activity`, `capture`, and `undo` remain catalog/runtime tools but are no longer main-ribbon children.
- `eVe/intuition/shared/group_state_runtime.js` owns disposable host-side group projection state for group steps, timelines, and previews. Group renderers may keep cloned runtime values on host object properties, but must not serialize group timelines, steps, members, media sources, or previews into `data-*` attributes as canonical state.
- `eVe/intuition/shared/tool_children_projection_state.js` owns disposable host-side palette child projection state for Intuition tool buttons and tool-instance hosts. Tool renderers may use it to bind palette expansion behavior to DOM hosts, but must not serialize palette child lists into `data-tool-children` or `data-source-tool-children`.
- `eVe/intuition/tools/ui/tool_button_factory.js` owns V2 Intuition tool button DOM creation and icon/slider visual application. `eVe/intuition/tools/ui/tool_button_params.js` owns normalized/serialized tool-button parameters consumed by the factory and main toolbox runtime; toolbox code must consume that owner instead of duplicating parameter serialization.
- `eVe/intuition/shared/dom_utils.js` owns reusable DOM style helpers, including `toPx`, `applyStyleObject`, `toKebabCase`, and `buildCssRule`; feature tools must consume these helpers instead of cloning CSS serialization logic.
- `eVe/intuition/shared/dom_utils.js` also owns reusable CSS declaration/rule serialization through `serializeCssDeclarations()` and `serializeCssRule()`; generated style modules such as toolbox visual CSS must consume those helpers instead of local serializers.
- Finder tool drops create `tool_instance` projection hosts through `project_drop.js` and `tool_instances.js`; they must not create persisted `shape` atomes or `tool_shortcut` DOM hosts.
- `eVe/intuition/tools/map.js` owns the Finder `place` scope Leaflet integration: container lifecycle, Nominatim search dispatch, map marker focus, responsive Leaflet size invalidation, and passive in-app attribution handling. Do not edit vendored Leaflet files or move map behavior into `finder.js`.
- `eVe/intuition/tools/visual/atome_editor_runtime_style.js` owns Atome editor footer/fullscreen generated runtime style rules; `eVeIntuition.js` may install the style node but must not own the rule construction. The deleted MTrack footer host style contract (`mtrack-host`, `data-mtrack-open`, embedded `eve_mtrack_dialog`) and the old `#eve_atome_editor` DOM socket placement engine must not be reintroduced; active footer placement belongs to `createIntuitionXFooterRuntime`. Atome-editor footer tool drags must use only the canonical `application/x-eve-finder-record` payload plus the active tool drag session and must not restore a parallel `text/plain` / `eve-tool:` payload.
- `eVe/intuition/menu/core/toolbox_runtime_model.js` owns toolbox runtime model normalization: main-entry/palette-child construction, slider defaults, drag payload serialization, active tool-drag payload cache writes, exclusive toolbox groups, pointer/number helpers, and toolbox handle sizing constants. `eVe/intuition/menu/core/toolbox_latch_runtime.js` owns toolbox latched-state mutation, tool/name alias application, exclusive-group toggling, latch epochs, and `eve:tool-state-changed` emission. `eVe/intuition/menu/core/toolbox_hold_runtime.js` owns toolbox long-press hold timers and click suppression. `eVe/intuition/menu/core/toolbox_slider_runtime.js` owns toolbox slider event binding and debounced slider tool invocation. `eVe/intuition/menu/core/toolbox_drag_runtime.js` owns toolbox drag event binding, drag preview ghosting, active drag payload installation, and drop-session start/end hooks. `eVe/intuition/menu/core/toolbox_external_open_runtime.js` owns external-open target resolution and reveal-width CSS variable application. `eVe/intuition/menu/core/toolbox_handle_runtime.js` owns main toolbox handle click/swipe gesture binding. `eVe/intuition/menu/core/toolbox_palette_runtime.js` owns palette expanded-state visual application, palette dismissal, and scroll reveal scheduling. `eVe/intuition/menu/core/toolbox_entry_runtime.js` owns toolbox entry invocation, latch rollback/update logging, and momentary pulse behavior. `eVe/intuition/menu/core/toolbox_state_sync_runtime.js` owns `eve:tool-state-changed` latch synchronization and public get/set latch state adapters. `toolbox_runtime.js` must stay focused on DOM/runtime orchestration and must not duplicate those model, latch, hold, slider, drag, external-open, handle, palette, entry, or state-sync helpers.
- `eVe/intuition/tools/shared/atome_record_utils.js` owns shared eVe tool-side Atome record projection helpers: property extraction, record normalization, user-facing label formatting, media-source detection, and JSON description formatting. Clipboard and delete tooling must consume this owner instead of keeping local record helper copies.
- `eVe/intuition/tools/clipboard/` owns shared copy/paste clipboard state, system clipboard writes, and paste event generation. `copy.js` and `paste.js` remain product tool entrypoints and panel/action registration surfaces; record normalization now belongs to `eVe/intuition/tools/shared/atome_record_utils.js`; `eVeIntuition.js` paste action must call the canonical `window.eve_paste_selection` entrypoint and must not detour through deleted MTraX clipboard APIs.
- `eVe/intuition/tools/delete.js` owns only the delete tool entrypoint, project-layer SVG deletion through `window.eveSvgLayerApi`, restore-drop document binding, panel open/close wiring, and `ui.delete.selection` routing. `eVe/intuition/tools/delete/blackhole_runtime.js` owns black-hole Atome creation/discovery, deleted-record cache ownership, sanitized delete/restore commits, canonical `eve-atome_<id>` host cleanup through `getAtomeElement(...)`, and project-scene remove/update calls through the Bevy scene runtime. `eVe/intuition/tools/delete/panel_view.js` owns the delete panel DOM composition and deleted-row rendering. Deleted-row UI must keep target Atome ids in closures/canonical `application/x-eve-atome` drag payloads rather than `data-*` row metadata or parallel text MIME restore fallbacks, must clear list contents with DOM node replacement rather than string HTML, and must use the shared `createEveButton` control for row restore actions. `ui.delete.selection` must not route timeline clips or SVG layers through deleted `window.eveMtrackApi.deleteSelection` / `deleteSvgLayer`. All three delete modules are below the 500-line hard maximum.
- `eVe/intuition/tools/layer.js` owns only the project SVG-layer panel surface (dialog DOM, row rendering, panel refresh, `ui.layer.select`) and installs `window.eveSvgLayerApi`; `eVe/intuition/tools/core/svg_layer_store.js` owns the canonical per-Atome project layer-selection store, SVG layer markup add/remove/update mutation, the `eve:svg-layer-*` event emitters, and the `createProjectSvgLayerApi` command factory; `eVe/intuition/tools/layer_panel_styles.js` owns the injected layer-panel CSS. None of them may read MTrack preview layer manifests, emit `clip_id` layer events, or call deleted `window.eveMtrackApi` SVG-layer routes. `eVe/intuition/tools/core/svg_vector_edit_runtime.js` consumes those layer selection events as project-Atome events only.
- `eVe/intuition/tools/core/svg_vector_edit_runtime.js` owns vector-edit activation, drag lifecycle, commit completion, double-click point insertion, and `window.__eveVectorTool` installation. `svg_vector_dom_runtime.js` owns SVG host/layer resolution, overlay handles, flower-menu lock attributes, and screen/local point projection. `svg_vector_refresh_runtime.js` owns selected-SVG refresh, model parsing, session switching, and handle rerender scheduling. `svg_vector_mutation_runtime.js` owns mutation payload classification for SVG versus geometry changes.
- `eVe/intuition/flower/menu.js` owns flower menu DOM orchestration; `menu_layout.js` owns radial geometry, `menu_items.js` owns item/icon normalization, `context_target.js` owns context target resolution including lazy project-canvas Atome hit testing, `context_selection.js` owns active-selection and mixed-kind menu strategy, and `context_pointer_lock.js` owns flower pointer locks.
- `eVe/intuition/matrix/ui/view.js` owns Matrix root/project-view/tile DOM orchestration; `eVe/intuition/matrix/ui/matrix_layout.js` owns Matrix viewport fitting, toolbar-aware row/column sizing, scroll positioning, and layout observers.
- `eVe/intuition/matrix/core/project_data.js` owns Matrix project list loading, current-project persistence, active-project flag synchronization, and project rename commits. `eVe/intuition/matrix/core/project_order_runtime.js` owns stable Matrix project slot ordering, per-user slot update serialization, and sanitized project slot `commitBatch` payloads. All Atome mutation payloads built by either owner must pass through the shared `sanitizeAtomeProperties(...)` contract before `window.Atome.commit` or `window.Atome.commitBatch`.
- `eVe/intuition/matrix/core/project_dom_state.js` stores Matrix/project DOM projection metadata outside attributes and is consumed by Matrix runtime, project bootstrap, user project surfaces, and project drop/tool projection paths.
- `eVe/intuition/matrix/ui/matrix_virtual_slots.js` owns Matrix logical slot virtualization: it maps projects to collision-free logical slots and keeps repeated empty slots out of the DOM, leaving only project tiles and the first actionable empty creation tile.
- `eVe/intuition/ribbon/disconnected_handle_logo.js` owns the shared disconnected Atome handle pulse style used by the initial main handle.
- `eVe/intuition/tools/user_login_shared_runtime.js` owns the singleton login sequence used by both initial boot and Home-panel routes, with lazy Home handler delegation for first paint. `eVe/intuition/tools/user_login_sequence.js` owns the unauthenticated login orchestrator and preserves the public `createUserLoginSequence(...)` entry point. `eVe/intuition/tools/user_login_choice.js` owns the first pre-authentication choice screen, the two distinct violet animated choice backgrounds, the low wide bright modulated separator sweep behind the persistent logo, progressive opacity/text-shadow hover and click label acknowledgement, the mounted and visible readiness events, and the `Essayer` / `Connexion / inscription` choice labels; `user_login_credentials.js` owns the phone/OTP/password collection UI; `user_login_step_config.js` owns static step labels and i18n keys; `user_login_choreography.js` owns the single persistent login logo, FLIP movement, living panel transitions, scroll-down step swaps, invalid pulses, return-home animation, same-size silhouette logo glow revealed by a horizontal mask synchronized with the choice separator sweep, cleanup of its own choice-exit fade handles, shared password/guest desktop reveal, and final docking to the Intuition handle; `user_login_visual_contract.js` owns the login-only visual tokens, `LOGIN_GRADIENT_MOTION` speed/intensity parameters, `LOGIN_TEXT_STYLE` typography parameters, `LOGIN_CHOICE_FEEDBACK` four-second accueil fade/hover/click text-shadow feedback parameters, shared animated-gradient helper, shared choice light timeline, shell, band geometry, and native input/caret styling. Voice helpers remain isolated in `user_login_voice.js`. `user_home_panel_runtime.js` owns Home-panel open/close/toggle, login-sequence display through the shared login runtime, guest workspace entry, and Home tool latch events; `user_workspace_surface_runtime.js` owns the canonical workspace reveal gate: load the project canvas, open the dashboard, wait for dashboard Bevy scene records and two render frames, then reveal the existing main ribbon. `user_auth_flow_runtime.js` owns auth state, current-user refresh, login bootstrap, and post-auth project/profile coordination. `user_dialogs_runtime.js` owns user/auth dialog creation and base chrome; `user_panel_mode_runtime.js` owns compact/full auth-mode visibility; `user_action_buttons_runtime.js` owns Login/Guest/Logout/Delete row composition, labels, delete confirmation, auth token cache cleanup, and directory-cache purge. `user_background_actions.js` owns Background quick actions and routes generator open/close through `invokeToolGateway`; the explicit `download` quick action calls `window.download_random_background_image`, while selection and import keep their existing background module entry points. `user_background_language_preferences.js` owns the Background quick-action controls and language selector. `user_photo_runtime.js` owns the photo row, image/video preview lifecycle, face data URL state, long-press import gesture, and drop-zone attachment. `user_identity_fields_runtime.js` owns identity/security/display rows; `user_profile_sections_runtime.js` owns Bio/Pro/Pass-and-keys/Preferences section layout; `user_visual_preferences_runtime.js`, `user_preferences_cache_runtime.js`, `user_mail_preferences_runtime.js`, and `user_server_preferences.js` own visual/security preference synchronization, global preference cache, Mail controls/runtime persistence, and server preference UI respectively. `user_profile_model.js` owns profile form collection, sanitized save payload creation, hydration, and display-radio replay; `user_profile_lifecycle_runtime.js` owns profile autosave, restore, auth event binding, profile-loaded state, and visibility sync; `user_panel_reset_runtime.js` owns profile panel reset. `user_media_upload_runtime.js` owns the Home-panel drop upload bridge; `user_workspace_runtime.js` owns Home-panel workspace cleanup glue while preserving `project_bootstrap.js` as project/workspace bootstrap authority. `user_custom_field_list.js` owns Pro custom-field row composition and `user_ai_catalog_runtime.js` owns Pass-and-keys AI catalog controls. `eVe/intuition/tools/user.js` is the user-panel facade that composes these owners and exposes `window.open_home_panel` / `window.close_home_panel`; it must stay below 500 lines and must not re-own the extracted auth, profile, preference, dialog, or action-button responsibilities.
- Tool definition SSOT and tool instances.

Should be extended by:

- Closed product tools, panels, and interaction flows.

Should not be duplicated by:

- New unmanaged UI systems.
- Direct DOM product tools when an Intuition runtime API already exists.

Known risks:

- Several UI/tool runtime files exceed size thresholds and require reduction when touched.
- `eVe/intuition/runtime/tool_genesis.js` remains a critical legacy owner for project group visual mounting. New group-preview behavior must be extracted into shared modules and only wired there until group visual rendering is split out; the intended reduction path is to move group host preview rendering, project-layer refresh, and persisted-preview mounting into focused Intuition group visual runtime modules. Group placeholder creation must use the existing `ensureGroupPlaceholderLayer` helper instead of feature-local DOM duplication.
- `eVe/intuition/runtime/tool_genesis.js` owns the public `toolBase.createAtome` orchestration boundary: raw specs are converted into internal create commands, committed through `window.Atome.commit`, refreshed from `state_current` when available, and only then projected through `renderAtomeRecord`. `createAtome(..., { render: false })` must remain canonical-only and must not emit a DOM projection event.
- `eVe/intuition/runtime/mtrack_debug_snapshot.js` owns MTraX panel debug snapshot DOM cloning. `eVe/intuition/eVeIntuition.js` may request snapshots, but must not own the snapshot DOM construction.
- Direct DOM helpers exist in this layer; compliance with the WebGPU/Squirrel rendering policy needs targeted review before broad UI rewrites.
- Slider styling still relies on toolbox/editor compatibility classes in visual token modules, even though behavioral readers now target the canonical slider data-role contract.

Status: Verified.

### eVe Design System And i18n

Path: `eVe/elements/`, `eVe/i18n/`

Owner: eVe closed layer.

Purpose: Product design tokens, panel chrome, dialog runtime, presets, i18n bindings, messages, and system UI tokens.

Main files:

- `eVe/elements/design.js`
- `eVe/elements/eVe_look.js`
- `eVe/elements/look/tokens.js`
- `eVe/elements/look/base_preset.js`
- `eVe/elements/look/eve_presets.js`
- `eVe/elements/look/goey_menu_preset.js`
- `eVe/elements/look/matrix_preset.js`
- `eVe/elements/look/calendar_preset.js`
- `eVe/elements/look/utility_presets.js`
- `eVe/elements/look/preset_chrome.js`
- `eVe/elements/look/preset_comm_table.js`
- `eVe/elements/look/preset_comm_surface.js`
- `eVe/elements/look/preset_controls.js`
- `eVe/elements/look/tool_theme.js`
- `eVe/elements/design/panel_chrome.js`
- `eVe/elements/design/panel_chrome_tokens.js`
- `eVe/elements/design/dialog_runtime.js`
- `eVe/elements/design/dialog_drag_runtime.js`
- `eVe/elements/design/dialog_geometry_runtime.js`
- `eVe/elements/design/dialog_reveal_runtime.js`
- `eVe/elements/design/dialog_viewport_runtime.js`
- `eVe/elements/system_ui_tokens.js`
- `eVe/i18n/i18n.js`
- `eVe/i18n/languages.js`
- `eVe/i18n/languages_fr_core.js`
- `eVe/i18n/languages_fr_account.js`
- `eVe/i18n/languages_en_core.js`
- `eVe/i18n/languages_en_account.js`

Reusable APIs:

- `eveT`, `eveTList`, locale helpers.
- `languages.js` remains the public message registry entry point; locale message data is split by locale/domain modules and composed there.
- `eVe_look.js` remains the public look facade; `look/tokens.js`, `look/base_preset.js`, `look/eve_presets.js`, and the feature preset modules own token translation, root CSS variables, base style installation, preset composition, and shared tool theme exports.
- Panel chrome contracts without injected scroll overflow arrow indicators.
- Dialog bounds/fullscreen runtime, including viewport resize reflow while fullscreen is active. Fullscreen dialogs use exact container edges and stop at the main toolbar top; no margin-based viewport constraint helper owns this geometry.
- Shared footer title placement belongs to `eVe/elements/design/panel_chrome.js`: titles stay centered in the footer across resize/fullscreen changes, while the invisible bottom-right resize grip remains interactive.
- `eVe/elements/design/button.js` owns shared `createEveButton(...)` text-clamp behavior. The explicit `truncateText: false` option is reserved for composed visual buttons that manage their own child layers, such as the login choice buttons; callers must not use it to hide overflowing plain text.
- Fullscreen double-click is limited to explicit panel chrome handles so tool/body double-clicks stay context-owned.
- Preset and token APIs.

Should be extended by:

- Product-visible text through i18n keys only.
- Product design tokens and panel chrome behavior.

Should not be duplicated by:

- Hardcoded visible labels in tools or panels.
- New local styling systems outside the existing design token structure.

Known risks:

- `design.js` is critically oversized and must be reduced when touched.

Status: Verified.

### eVe Voice Product UI

Path: `eve/voice/`

Owner: eVe closed layer.

Purpose: Closed product voice UI modules moved out of Atome.

Main files:

- `eve/voice/aVa_panel.js`

Should be extended by:

- Closed eVe voice panels and product-facing voice UI.

Should not be duplicated by:

- Atome open voice contracts.

Status: Verified.

### eVe Documentation

Path: `eve/documentations/`

Owner: eVe closed layer.

Purpose: Product documentation, persistence contracts, security/sharing notes, realtime sync architecture, runtime AI/MCP entrypoints, and product manual validation checklists.

Main files:

- `runtime_ai_mcp_entrypoints.md`
- `atome_persistence_contract.md`
- `realtime_sync_architecture.md`
- `Security_and_sharing.md`
- `tools.md`
- `tools_cahier_des_charges.md`
- `eve_structure_audit.md`

Reusable logic exposed: No runtime logic. Use as source material only after validating against code.

Should not be duplicated by:

- Cross-layer framework maps under `maps/`.

Status: Verified.

## Server And Platform Areas

### Fastify Server

Path: `server/`

Owner: Open server infrastructure unless product-specific ownership is later narrowed.

Purpose: Fastify server, authentication, realtime state, routes, mail routes, notifications, sharing, file storage, sync watcher, shell, and WebSocket send/state APIs.

Main files:

- `server/server.js`
- `server/auth.js`
- `server/atomeRoutes.orm.js`
- `server/atomeCrudRoutes.js`
- `server/atomeEventRoutes.js`
- `server/atomeRouteContract.js`
- `server/atomeSyncRuntime.js`
- `server/atomeRealtime.js`
- `server/sharingAtomeAccessors.js`
- `server/sharingPermissionService.js`
- `server/wsApiState.js`
- `server/wsSend.js`
- `server/ws_api_schema.js`
- `server/sharing.js`
- `server/notificationStack.js`
- `server/fileStorage.js`
- `server/mailRoutes.js`
- `server/userFiles.js`
- `server/userHome.js`

Should be extended by:

- Server-side source-of-truth behavior, websocket communication, auth, sharing, sync, and file APIs.
- Atome route changes through the split route owners: orchestration and event commit helpers in `server/atomeRoutes.orm.js`, CRUD route handlers in `server/atomeCrudRoutes.js`, event/state/snapshot routes in `server/atomeEventRoutes.js`, route-boundary formatting in `server/atomeRouteContract.js`, and sync side effects in `server/atomeSyncRuntime.js`.
- Sharing changes through the split sharing owners: message orchestration in `server/sharing.js`, ACL primitives in `server/sharingPermissionService.js`, and canonical Atome field accessors in `server/sharingAtomeAccessors.js`.

Should not be duplicated by:

- Browser-side REST/polling fallbacks or parallel communication systems.

Status: Verified for file ownership, To verify for open/closed boundary and API map.

### Native And Platform Runtimes

Path: `platforms/`

Owner: Cross-platform runtime layer.

Purpose: Tauri desktop, iOS/AUv3, web audio WASM, and AtomeOS platform assets.

Main areas:

- `platforms/desktop-tauri/`
- `platforms/ios/atome-auv3/`
- `platforms/web/audio-wasm/`
- `platforms/web/bevy-renderer/`
- `platforms/atomeOS/`

Verified desktop Bevy renderer owner:

- `platforms/desktop-tauri/Cargo.toml` declares optional Bevy dependency `0.18.1` behind `bevy_backend` and explicit renderer feature groups `bevy_renderer_core` and `bevy_renderer_native`. Renderer features enable Bevy WebGPU/window/render/sprite/camera crates without enabling `bevy_audio`, so Kira remains the single Atome audio engine.
- `atome/renderers/bevy-core/` owns the open Atome Bevy renderer core shared by browser/WASM and native/Tauri wrappers. It contains the Atome render DTOs/ops in `src/types.rs`, disposable ECS components/resources in `src/components.rs`, spawn/render-op projection, texture handling, render math, and selection overlay drawing. `src/render_math.rs` owns the fixed logical orthographic camera projection, and `src/render_ops.rs` reapplies it on surface resize so logical Atome geometry is not scaled by browser/window backing-buffer details.
- `platforms/desktop-tauri/src/bevy_backend/mod.rs` owns the native Atome-to-Bevy backend surface. With `bevy_backend` it re-exports the shared Atome Bevy core and native power contracts; with `bevy_renderer_core` it also exposes the embedded native Bevy scene/ops entry point used by Tauri IPC. It must not become canonical Atome state, a DOM path, a canvas-per-Atome path, or a parallel scene model.
- `platforms/desktop-tauri/src/bevy_backend/bridge.rs` owns the Tauri native Bevy command bridge. It accepts already-normalized disposable Bevy projection scenes and render ops from the eVe rendering runtime, starts an embedded `bevy_renderer_core` Bevy App with the shared Atome Bevy core, runs the Startup scene schedule without installing Bevy `WindowPlugin` or a nested winit/render loop from IPC, applies later render ops in native Rust, rejects ECS-only `bevy_backend` startup as non-presentable, and returns `presentable:false` diagnostics until a real native presenter is wired to the project surface.
- `platforms/desktop-tauri/permissions/bevy-native-renderer.toml` owns the Tauri capability permission set for `bevy_native_start`, `bevy_native_apply_ops`, and `bevy_native_resize`; `platforms/desktop-tauri/capabilities/default.json` must include this set for the main webview so native Bevy startup cannot fail at the IPC authorization layer.
- `platforms/desktop-tauri/src/bevy_backend/power.rs` owns the native Bevy power-policy contract. It defines `ATOME_POWER_PROFILE=eco|balanced|performance`, defaults to low-power idle behavior, keeps continuous/game mode opt-in, tracks explicit redraw requests, rejects idle transform writes without a dirty cause, and converts Atome power policy into real Bevy `WinitSettings`, `UpdateMode`, and `PresentMode` when renderer features are enabled.
- `platforms/desktop-tauri/src/bevy_backend/renderer.rs` owns both Bevy App construction modes. `build_atome_bevy_embedded_app(...)` is the Tauri IPC-safe scene/ops engine and does not install Bevy window/render plugins; `build_atome_bevy_app(...)` and `run_atome_bevy_native(...)` remain gated behind `bevy_renderer_native` for standalone Bevy/winit presentation. Both modes install `atome_bevy_renderer_core::AtomeBevyRendererPlugin` instead of duplicating projection, spawn, or selection rendering.
- `platforms/ios/bevy-renderer/` owns the iOS C ABI staticlib wrapper around the shared Atome Bevy renderer core. Xcode builds it for iPhoneOS/iPhoneSimulator targets before Swift links, exposes `atome_ios_bevy_renderer_status(...)` and `atome_ios_bevy_scene_probe(...)`, and lets Swift report `linked_no_presenter` after Rust validates the native scene while the real native Metal/Bevy presenter is still being connected to the iOS project surface. The paired `platforms/ios/build_bevy_renderer.sh` build owner compiles this Rust staticlib with aborting panics, stripped debuginfo, and no forced unwind tables so the app and AUv3 Xcode targets do not overflow ld compact-unwind encoding with Bevy/Rust `__eh_frame` data.
- `platforms/web/bevy-renderer/` owns the browser/WASM Bevy WebGPU renderer surface. It consumes an explicit logical-coordinate `AtomeRenderScene` JSON/wasm-bindgen input, binds Bevy to a caller-owned canvas selector, consumes the browser window scale factor instead of overriding it, converges winit `WindowResized` messages through the shared `apply_surface` camera-projection path, and exports `run_atome_bevy_renderer(...)`, `request_atome_bevy_redraw()`, explicit diff/resource/surface update exports, renderer diagnostics, `read_atome_bevy_video_backend_capabilities()`, and video copy diagnostics read/reset methods without implementing a DOM renderer, canvas-per-Atome path, or fallback renderer. The video backend diagnostic uses schema `atome.bevy.web.video_backend.v7` to expose the live product backend as `gpu_external_texture_texture_external`, browser `GPUDevice.importExternalTexture` availability, and Web `wgpu` external-texture create/source/bind-group-resource support provided by the maintained backend fork while the blocker is `none`; it intentionally does not expose the deleted `video_track` API as a capability. Video-frame redraw notifications request Bevy redraw through the existing queued notification wake and no longer add a second post-application wake. `atome/renderers/bevy-core/src/video_diagnostics.rs` owns copy/skip counters for legacy/copy-pressure diagnostics only; it is not the active live project-video route. Supported browser projections now include Bevy sprite shapes, visible pending media sprites, Bevy RGBA texture sprites for text/raster images/SVG/persisted video posters/audio waveforms, and Bevy-owned live video mesh quads sampled from external browser video textures with per-track z-index ordering and canonical crop/UV mesh rectangles.
- Live project video external-texture work stays in this same Bevy ownership chain: `eVe/domains/rendering/bevy_web_renderer_runtime.js`, `eVe/domains/rendering/bevy_web_presentation_runtime.js`, and `eVe/domains/rendering/bevy_video_decode_source_runtime.js` bridge browser runtime resources and coalesced frame notifications, `platforms/web/bevy-renderer/` owns WASM exports and web renderer integration, and `atome/renderers/bevy-core/` owns shared Bevy ECS/material/render logic. `bevy_video_decode_source_runtime.js` applies derived timeline fields to the hidden source element before Bevy imports it as `GPUExternalTexture`, including trim seek, trim end/loop enforcement, offset, playback speed, status diagnostics, RVFC-first active playback pumping, and RAF fallback only when RVFC is unavailable. `atome/renderers/bevy-core/src/video_external_texture.rs` owns the shared ECS component, current extracted compositor layer, current per-track opacity, current normalized `uv_rect`, no-automatic-batching video mesh contract, and mesh helpers that rebuild UV coordinates for cropped source rectangles; `atome/renderers/bevy-core/src/video_external_texture_tests.rs` owns its focused Rust guardrails; `atome/renderers/bevy-core/src/video_external_web.rs` owns the browser `RenderApp` extraction/queue/draw integration, sorts external-video phase items by the extracted layer, and binds the per-video opacity uniform; `atome/renderers/bevy-core/assets/shaders/video_external.wgsl` owns the `texture_external` sampling path and applies color filters, transitions, and opacity as source alpha for the existing source-over blend. Local transform and crop projection flow through `AtomeRenderNode`, `AtomeTransformPatch`, `AtomeResourcePatch`, `render_math.rs`, and `render_ops.rs`; the old direct `AtomeVideoTrack` / `VideoTrack*` API and its WASM exports are deleted and must not be reintroduced. `atome/renderers/wgpu-web-external-texture/` owns the maintained `wgpu 27.0.1` / `wgpu-types 27.0.1` backend fork used by the web renderer Cargo graph to provide browser media source descriptors, `GPUDevice.importExternalTexture`, and `BindingResource::ExternalTexture` resource mapping. Direct JavaScript `GPUExternalTexture` probes remain diagnostics/reference only and must not become a second project renderer, hidden compositor, fallback, or canvas-per-Atome path.
- Browser/WASM Bevy rendering stays in the web-owned crate rather than the desktop Tauri crate, because the desktop crate owns Axum/Tauri/native dependencies that do not compile for `wasm32-unknown-unknown`.
- `eVe/domains/rendering/bevy_native_renderer_runtime.js` owns the eVe-side native Bevy dispatch path. Browser mode uses `bevy_web_renderer_runtime.js`; Tauri WebView project surfaces use the visible Bevy/WebGPU canvas unless the host explicitly declares `window.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true`. iOS/AUv3 project surfaces always select the native Bevy bridge when `window.__ATOME_IOS_NATIVE_INVOKE` is available, while the WebView remains the application shell and host surface. The native path maps Virtual Scene nodes directly into source/text/peak payloads and must not call the browser RGBA media texture resolver before Swift/Rust receives the scene.
- `platforms/ios/atome-auv3/Common/AppNativeBevyRendererController.swift` owns the current iOS native Bevy command boundary. It calls the Rust staticlib status and scene-probe ABI so Xcode logs prove the shared Bevy core is compiled and linked, returns `ios_bevy_native_not_presentable` with `renderer_mode=linked_no_presenter` while the Rust/Metal presenter is absent, and keeps `presentable=0` diagnostics visible in Xcode. iOS must not silently use the browser/WASM main-canvas renderer.
- `setup.sh` and `scripts/setup/bootstrap.sh` own clean-clone setup for Rust/Cargo metadata resolution. They verify the Rust toolchain and resolve Cargo metadata without installing any global Bevy binary.

Verified iOS/AUv3 native owners:

- `platforms/ios/atome-auv3/Common/FileSyncCoordinator.swift` owns file sync scheduling, safe-mode gating, tombstone state, move/deletion tracking, and the core newest-wins sync pass.
- `platforms/ios/atome-auv3/Common/FileSyncCoordinatorFileOperations.swift` owns visible/App Group/iCloud root discovery, syncable file inventory, file copy/delete helpers, and cleanup of leaked or duplicated sync artifacts.
- `platforms/ios/atome-auv3/Common/MIDIController.swift` owns MIDI client lifecycle, input monitoring, source discovery, notifications, and parsed input logging.
- `platforms/ios/atome-auv3/Common/MIDIOutputSender.swift` owns JS-to-MIDI packet output to host destinations.
- `platforms/ios/atome-auv3/auv3/AUv3Recorder.swift` owns AUv3 recording session state, source start/stop, mic engine lifecycle, render buffer capture, and browser event emission.
- `platforms/ios/atome-auv3/auv3/AUv3RecorderAnalysis.swift` owns recorded WAV metadata analysis for peak and first-peak frame reporting after capture stops.

Verified desktop audio native owners:

- `platforms/desktop-tauri/src/audio_engine/recorder.rs` owns desktop recorder session state, CPAL input stream setup, capture callbacks, ring buffer production, and public recorder controls.
- `platforms/desktop-tauri/src/audio_engine/recorder_wav.rs` owns desktop recorder WAV output format selection, CPAL buffer-size hints, sample conversion, file creation, and writer-thread draining/finalization.

Should be extended by:

- Platform-specific native runtime boundaries, not product UI.

Should not be duplicated by:

- Browser-side filesystem or audio shortcuts that bypass the native boundary.

Known risks:

- AV phase has explicit pending work around Rust bridge extraction, CPAL callback disk writes, callback allocations, Swift debug paths, and legacy recorder FFI.

Status: Verified.

### Scripts And Tooling

Path: `scripts/`, `scripts_utils/`, `tools/`

Owner: Development and validation tooling.

Purpose: Build scripts, setup workflows, syntax/fallback guardrails, Tauri boundary checks, Molecule guardrails, Fastify runner, static server, publishing scripts, and live smoke/probe suites.

Main files:

- `scripts/check_no_fallbacks.mjs`
- `scripts/check_tauri_fs_boundary.mjs`
- `scripts/check_molecule_guardrails.mjs`
- `scripts/check_eve_ai_guardrails.mjs`
- `scripts/check_dom_projection_guardrails.mjs`
- `scripts/export_dom_subtrees.mjs`
- `scripts/setup/bootstrap.sh`
- `scripts/static_file_server.mjs`
- `scripts/run_fastify.sh`
- `scripts/rollup.config.cdn.js`
- `scripts/rollup.config.npm.js`

Should be extended by:

- Persistent validation and build tooling.

Should not contain:

- Temporary probes. Use `temp/` for disposable diagnostics.

Status: Verified.

## Reuse Rules By Task Type

### New API

Start with:

- `atome/src/squirrel/apis/` for open framework APIs.
- `atome/src/squirrel/atome/mcp.js` for MCP-facing Atome surfaces.
- `eve/domains/*/api/` for closed product domain APIs.
- `eve/intuition/runtime/` for closed UI/tool runtime APIs.

Do not create:

- Parallel API facades without checking existing domain API modules.
- Hidden effectful paths bypassing command bus, policy, capability validation, audit, idempotency, or history.

Status: Initial rule, to be refined by `maps/API_MAP.md`.

### New Tool Or Panel

Start with:

- `eve/intuition/tools/core/tool_definition_ssot.js`
- `eve/intuition/tools/core/tool_registry.js`
- `eve/intuition/tools/core/tool_runtime.js`
- `eve/intuition/runtime/tool_gateway.js`
- `eve/intuition/runtime/panel_api.js`
- `eve/elements/design/panel_chrome.js`

Do not create:

- Unregistered tools.
- New panel chrome systems.
- User-visible strings outside `eve/i18n/`.

Status: Verified.

### New Media Or MTraX Feature

Start with:

- `eve/domains/media/api/`
- `eve/domains/media/shared/`
- `eve/domains/mtrax/`
- `eve/core/media_engine/`
- `atome/src/application/audio_runtime/` when the feature touches open audio contracts.

Do not create:

- Duplicate preview, media source, timeline, track, transport, or playback layers.
- New native audio boundaries without checking Kira and PlayRecord contracts.

Status: Verified.

### New Voice / AI / MCP Feature

Start with:

- `atome/src/squirrel/ai/`
- `atome/src/squirrel/voice/`
- `atome/src/squirrel/atome/mcp.js`
- `eve/documentations/runtime_ai_mcp_entrypoints.md` as source material, then verify in code.
- `eve/voice/` only for closed product UI.

Do not create:

- Direct runtime mutation from AI.
- Voice actions outside semantic request/tool routing.
- MCP shortcuts with hidden side effects.

Status: Verified.

### New Communication / Mail / Contacts / Calendar Feature

Start with:

- `atome/src/squirrel/mail/`
- `atome/src/squirrel/contacts/`
- `atome/src/squirrel/calendar/`
- `server/mailRoutes.js` and WebSocket server modules when server behavior is involved.

Do not create:

- Product-level duplicate mail/contact/calendar state models before checking these services.
- HTTP polling or REST fallback transport paths.

Status: Verified.

### New Security Or Sharing Feature

Start with:

- `atome/security/`
- `atome/src/squirrel/security/`
- `server/auth.js`
- `server/sharing.js`
- `eve/core/project_security.js`
- `eve/documentations/Security_and_sharing.md` as source material, then verify in code.

Do not create:

- Silent permission bypasses.
- Token storage outside the existing security/token surfaces without explicit architecture review.

Status: Verified.

## Duplication And Cleanup Risks

Recent rendering and persistence fixes:

- `eVe/domains/media/api/media_persistence_service.js`: recording Atome reuse must commit the active `project_id` before rendering; reusing an existing `video_recording_*` / `audio_recording_*` without this association leaves project reload and list results inconsistent.
- `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js`: `state_current.meta.project_id` is part of the client projection contract and must survive reload into both top-level `project_id` and `meta.project_id`.
- `eVe/domains/rendering/project_scene_runtime.js`: Bevy projection must skip stale media records that have no renderable source; old source-less `audio_recording_*` records must not abort WebGPU scene startup.
- `eVe/domains/rendering/bevy_web_renderer_runtime.js`: initial Bevy startup and later spawn diffs record unrecoverable media texture decode failures as skipped nodes instead of rejecting the whole scene or diff batch; valid nodes must still start. Uncached video and audio-waveform nodes remain present as Bevy entities and receive textures later through one-at-a-time resource updates; video frame failures and blank transparent/black readbacks are retried with bounded backoff before being marked skipped, so Safari/WKWebView frame timing cannot make Atomes disappear or leave a refresh-time video permanently transparent after one early miss.
- `atome/renderers/bevy-core/src/render_math.rs` and `render_ops.rs`: layer depth is clamped for Bevy sprites, meshes, overlays, and source-backed video so timestamp-like z-index values remain inside the camera range while preserving the canonical `AtomeLayer`; render-op transform/layer updates explicitly refresh Bevy transform components for extraction. Local transform scale/rotation/origin is derived from the canonical Virtual Scene payload, stored as disposable ECS `AtomeLocalTransform`, and reapplied during transform and surface-size operations without becoming canonical state. Camera projection is fixed to the logical surface dimensions and updated on surface resize; do not compensate with dashboard/project record scale transforms.
- Durable media cache reuse is owned by the existing projection path, not by a new renderer cache layer: `render_atom.js` exposes persisted video poster data URLs and waveform peaks, `bevy_media_texture_resolver.js` consumes persisted video posters only for non-live poster texture payloads, and `project_audio_waveform_renderer.js` consumes persisted waveform peaks before requesting metadata or decoding audio. Full RGBA/GPU textures remain disposable derived renderer resources.

High priority risks:

- Oversized files: `eve/elements/design.js`, `atome/src/squirrel/ai/agent_gateway.js`, `atome/src/application/jeezs/index.js`, `atome/src/application/audio_runtime/play_record_core.js`.
- Legacy naming overlap: `mtrack`, `mtrax`, `hmtracks`, and `Molecule` remain mixed pending the Molecule rename phase.
- Product bootstrap references still exist in Atome bootstrap paths and need architecture-map treatment.
- Direct DOM helper modules exist in eVe Intuition and need targeted policy review before UI expansion.
- Server ownership is likely open infrastructure, but exact product/open boundary needs explicit architecture-map verification.

General risks:

- Avoid adding logic to vendored/minified assets under `atome/src/js/`.
- Avoid creating new temporary scripts outside `temp/`.
- Avoid creating new maps under `docs/`; use `maps/`.

## Areas Marked To Verify

- Exact API stability and public/semi-public/internal classification. To be mapped in `maps/API_MAP.md`.
- Exact high-level runtime flow and command/history/source-of-truth rules. To be mapped in `maps/ARCHITECTURE_MAP.md`.
- Server open/closed ownership details.
- Rendering policy compliance across existing DOM-centric UI helpers.
- Product bootstrap references from Atome into eVe.
- Which legacy MTraX/Molecule aliases are public boundary aliases and which are internal debt.

## Search Keywords

Atome:

- `squirrel`, `adole`, `mcp`, `agent_gateway`, `semantic_contract`, `voice`, `provider_client`, `play_record`, `kira`, `serverVerification`, `syncQueue`, `token_vault`.

eVe:

- `intuition`, `tool_registry`, `tool_gateway`, `panel_api`, `panel_chrome`, `molecule`, `mtrax`, `hmtracks`, `eveT`, `layer_contract`.

Server/platform:

- `Fastify`, `websocket`, `sharing`, `auth`, `wsSend`, `Tauri`, `Axum`, `AUv3`, `WebGPU`, `Kira`, `Symphonia`.
