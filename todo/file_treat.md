# Legacy File Treatment Plan

## Scope

This inventory covers maintained framework source files above the AGENTS hard maximum of 500 lines.

Excluded from this list:

- documentation and maps;
- tests;
- temporary files;
- examples and demo-only trees;
- build outputs, dependency folders, vendored/minified browser libraries.

Thresholds from `.codex/AGENTS.md`:

- `P0`: 1000+ lines, forbidden without active reduction.
- `P1`: 801-999 lines, critical legacy state.
- `P2`: 501-800 lines, non-compliant and must be reduced before feature growth.

## Mandatory Treatment Method

For every file below:

1. Read the owning map first: `maps/CODEMAP.md`, then `maps/API_MAP.md`, `maps/DESIGN_MAP.md`, or `maps/ARCHITECTURE_MAP.md` when relevant.
2. Identify the file responsibility: model, API boundary, persistence, projection/rendering, controller/action, session/editor runtime, service, native bridge, or visual/style generator.
3. Remove duplication, legacy aliases, compatibility shims, fallback paths, dead code, and mixed responsibilities.
4. Split only along stable architectural boundaries. Do not create pass-through modules or artificial fragments.
5. Keep source-of-truth state separate from projections:
   - Atome model and persistence must use canonical envelope/property contracts.
   - UI/DOM/native/WebGPU state must stay projection/runtime state.
6. Add or update focused tests before or with the refactor.
7. Run narrow validation first, then `npm run check:syntax`; for Atome/eVe architecture work also run `npm run check:m0`.
8. Update framework maps in the same task when ownership, APIs, runtime boundaries, or visual contracts move.

## P0 - 1000+ Lines

These files are forbidden legacy surfaces under AGENTS and require active reduction plans.

| Lines | File | Task To Perform |
| ---: | --- | --- |
| 18286 | `eVe/intuition/eVeIntuition.js` | Split UI orchestration into focused runtime modules; remove Atome model decisions, direct DOM-derived persistence, panel/tool coupling, and embedded style/runtime blocks. |
| 8899 | `eVe/intuition/tools/project_drop.js` | Split project drop/import, projection toolbox layout, tool shortcut persistence, native file handling, and drag sessions; route all Atome writes through canonical commit helpers. |
| 7129 | `atome/src/squirrel/components/intuition_builder/index.js` | Split canonical Intuition component builder by control/rendering responsibilities; remove parallel local UI contracts and duplicated DOM/style helpers. |
| 6001 | `eVe/intuition/tools/core/tool_runtime.js` | Split tool execution, persistence, Finder projection, latch, panel routing, and system-control handling; remove parallel persistence flows. |
| 5911 | `eVe/intuition/tools/user.js` | Split user/profile panel, auth UI, storage wiring, and visual/runtime helpers; remove direct DOM state as source of truth. |
| 5661 | `platforms/desktop-tauri/src/server/mod.rs` | Split local server routing, auth, media, Atome events, and filesystem bridge into Rust modules with explicit boundaries. |
| 5446 | `eVe/intuition/runtime/tool_genesis.js` | Split Atome creation, rendering projection, project load, group visual mounting, and property adapters; keep canonical properties separate from DOM datasets. |
| 5013 | `server/server.js` | Split Fastify bootstrap, route registration, auth/session, media, Atome, sync, and static serving; remove monolithic server ownership. |
| 4989 | `eVe/intuition/tools/communication.js` | Split communication tool UI, service calls, state handling, and persistence boundaries; consume open communication APIs only. |
| 4517 | `eVe/intuition/tools/core/mtrax_renderer_webgpu_adapter.js` | Split WebGPU renderer adapter into device/resource, pipeline, texture, frame dispatch, and cleanup modules. |
| 4350 | `atome/src/application/lyrix/src/features/lyrics/display.js` | Split lyrics rendering, sync, layout, input, and state; keep application UI out of reusable framework contracts. |
| 4069 | `eVe/intuition/ribbon/menu.js` | Split ribbon menu composition, state, drag/reveal, tool materialization, and visual behavior; consume canonical tool controls. |
| 4066 | `eVe/elements/eVe_look.js` | Split token generation, CSS variable installation, presets, base styles, and compatibility rules; remove hardcoded visual drift. |
| 3648 | `platforms/desktop-tauri/src/server/local_atome.rs` | Split local Atome event/state routes, storage mapping, validation, and response serialization. |
| 3451 | `atome/src/application/lyrix/index.js` | Split Lyrix bootstrap, app state, service wiring, and UI mounting; isolate app code from framework APIs. |
| 3429 | `eVe/elements/design.js` | Split eVe UI factory by controls, panels, dialogs, rows, text/input helpers, and i18n binding. |
| 3364 | `platforms/ios/atome-auv3/Common/LocalHTTPServer.swift` | Split iOS local HTTP routing, media serving, auth, and Atome event handling. |
| 2940 | `eVe/intuition/tools/mtrack.js` | Split MTraX tool entry, panel open, transport wiring, and runtime bridge calls; keep Molecule/MTraX state in domain modules. |
| 2617 | `eVe/intuition/tools/infos.js` | Split info panel UI, data fetching, and Atome/property inspection; remove direct DOM-derived state. |
| 2611 | `atome/src/application/jeezs/index.js` | Split application bootstrap and UI; verify whether it is active product code or removable legacy app surface. |
| 2610 | `eVe/intuition/tools/finder.js` | Split Finder search, projection, UI rows, drag/drop, and tool invocation; remove duplicated tool identity logic. |
| 2567 | `atome/src/squirrel/atome/mcp.js` | Split MCP registration, security surface, tool dispatch, runtime bridge, and platform-specific adapters. |
| 2494 | `server/auth.js` | Split auth routes, token/session handling, password/user flows, and security utilities. |
| 2494 | `eVe/intuition/tools/detail.js` | Split detail panel UI, property editing, selection integration, and commit boundary calls. |
| 2357 | `database/adole.js` | Split database Atome contract, events, particles/properties mapping, state_current projection, snapshots, and permissions. |
| 2265 | `atome/src/squirrel/voice/tool_router.js` | Split voice intent routing by domain, tool capability, Atome mutation, contacts/mail/calendar, and error handling. |
| 2154 | `eVe/core/atome_commit.js` | Continue extracting backend selection, HTTP/WS transport, state_current reads, event normalization, and mirroring into focused modules. |
| 2078 | `atome/src/application/lyrix/src/components/ui.js` | Split reusable UI components, dialogs, controls, and Lyrix-specific presentation. |
| 2019 | `eVe/domains/mtrax/timeline/loop_cells_runtime.js` | Split loop-cell model, rendering, interaction, deletion, and timeline synchronization. |
| 2013 | `eVe/intuition/matrix/core/matrix_runtime.js` | Split Matrix state, rendering, project data, preview, gestures, and persistence boundaries. |
| 2011 | `atome/src/squirrel/voice/orchestrator.js` | Split voice orchestration, AI planning, runtime tools, session state, and telemetry. |
| 2003 | `eVe/domains/media/api/video_api.js` | Split video recording, playback, poster capture, persistence, and native/browser bridge responsibilities. |
| 1940 | `eVe/intuition/tools/selection_style_apply.js` | Split selection style resolution, canonical mutation generation, and UI feedback. |
| 1927 | `eVe/intuition/tools/contact.js` | Split contact panel UI, service calls, local state, and Atome/tool integration. |
| 1901 | `eVe/intuition/tools/capture.js` | Split capture UI, recorder bridge, poster extraction, media Atome finalization, and transient preview state. |
| 1887 | `atome/src/squirrel/apis/unified/adole.js` | Split adapters, backend transport, commit bridge, auth headers, and compatibility entry points. |
| 1880 | `eVe/domains/mtrax/media/record_capture_runtime.js` | Split record session, media creation, native/browser source handling, and timeline insertion. |
| 1872 | `atome/src/application/lyrix/src/components/settings.js` | Split settings UI, persistence, service integration, and component primitives. |
| 1835 | `eVe/domains/media/asset_box.js` | Split media import, upload, metadata, Atome creation, preview, and UI chooser responsibilities. |
| 1753 | `atome/src/squirrel/voice/home_surface.js` | Split voice home UI, state, event handling, and service integration. |
| 1663 | `eVe/intuition/runtime/mtrack_dock_controller.js` | Split dock geometry, lifecycle, panel bridge, and MTraX-specific controller logic. |
| 1659 | `server/sharing.js` | Split sharing routes, permissions, invite handling, and persistence helpers. |
| 1629 | `eVe/intuition/tools/calendar.js` | Split calendar UI, service calls, event state, and product tool integration. |
| 1594 | `atome/src/squirrel/atome/atome.js` | Split Atome runtime core, public API exposure, MCP/tool integration, and state helpers. |
| 1583 | `eVe/domains/mtrax/audio/hmtracks_native_playback_runtime.js` | Split native playback setup, transport, synchronization, error handling, and resource cleanup. |
| 1570 | `eVe/intuition/tools/background.js` | Split background tool UI, property mutation, media/background state, and visual preview. |
| 1567 | `platforms/desktop-tauri/src/server/local_auth.rs` | Split local auth token generation, verification, request guards, and tests. |
| 1518 | `eVe/domains/media/api/audio_api.js` | Split audio recording, playback, metadata, Atome creation, and native/browser bridges. |
| 1502 | `eVe/intuition/menu/core/toolbox_runtime.js` | Split toolbox state, interaction, rendering, and tool registry integration. |
| 1502 | `atome/src/squirrel/components/editor_builder.js` | Split editor control building, state, keyboard handling, and visual contract. |
| 1491 | `eVe/intuition/tools/contextual/flower_menu_context.js` | Split flower context collection, selection filtering, action resolution, and UI positioning. |
| 1461 | `platforms/ios/atome-auv3/Common/WebViewManager.swift` | Split WebView setup, navigation policy, bridge messages, media/native handlers, and lifecycle. |
| 1429 | `atome/src/squirrel/components/matrix_builder.js` | Split matrix component model, rendering, interaction, and style contract. |
| 1427 | `atome/src/squirrel/voice/service.js` | Split STT/TTS/service state, provider calls, session handling, and failure modes. |
| 1426 | `atome/src/application/lyrix/src/components/songLibraryModal.js` | Split modal structure, search/filter, storage integration, and item rendering. |
| 1424 | `atome/src/squirrel/ai/default_tools.js` | Split AI default tools by domain; route Atome mutations through canonical runtime APIs. |
| 1404 | `platforms/ios/atome-auv3/Common/AppNativeMediaCaptureController.swift` | Split media capture session, permissions, file writing, preview, and bridge callbacks. |
| 1356 | `eVe/domains/mtrax/api/window_api_runtime.js` | Split public window API registration, transport, clips, media, preview, and project APIs. |
| 1348 | `atome/src/squirrel/components/button_builder.js` | Split button model, style, interaction, icon, disabled/active state, and accessibility. |
| 1346 | `eVe/intuition/tools/perform.js` | Split perform tool UI, execution routing, selection handling, and runtime command generation. |
| 1335 | `eVe/core/atome_timeline.js` | Split timeline model, rendering projection, event application, and persistence integration. |
| 1283 | `eVe/domains/mtrax/timeline/group_timeline_load_runtime.js` | Split group timeline load, Atome property extraction, schema normalization, and render handoff. |
| 1282 | `atome/src/application/aBox/index.js` | Split aBox UI, media import, server calls, and app bootstrap. |
| 1234 | `server/atomeRoutes.orm.js` | Split Atome routes, canonical serialization, state_current projection, and event persistence. |
| 1212 | `eVe/domains/mtrax/media/element_runtime.js` | Split media element creation, source binding, cleanup, and projection-only state. |
| 1187 | `eVe/domains/mtrax/transport/transport_gestures_runtime.js` | Split gesture capture, transport mutation, UI feedback, and timeline synchronization. |
| 1173 | `eVe/user/background.js` | Split user background state, media selection, persistence, and visual projection. |
| 1172 | `eVe/intuition/menu/visual/toolbox_styles.js` | Split style token generation, rule serialization, static rule groups, and runtime style installation. |
| 1157 | `atome/src/squirrel/components/unit_builder.js` | Split unit model, rendering, style, and interaction contracts. |
| 1125 | `eVe/intuition/tools/delete.js` | Split delete command resolution, selection/tool handling, soft-delete commit, and UI affordance. |
| 1114 | `eVe/intuition/runtime/tool.js` | Split runtime tool facade, registration, lookup, and invocation helpers. |
| 1107 | `atome/src/application/lyrix/src/features/import/dragDrop.js` | Split import drag/drop parsing, file handling, persistence, and UI state. |
| 1052 | `atome/src/squirrel/ai/agent_gateway.js` | Split gateway policy, model calls, toolchain execution, trace, and capability checks. |
| 1035 | `platforms/ios/atome-auv3/application/ViewController.swift` | Split view lifecycle, WebView bridge, native services, and UI events. |
| 1027 | `atome/src/squirrel/apis/unified/adole_api/auth.js` | Split auth API methods, session state, token handling, and request formatting. |
| 1021 | `eVe/intuition/tools/activities.js` | Split activity UI, data loading, filtering, and tool/runtime integration. |
| 1010 | `eVe/intuition/tools/project_bootstrap.js` | Split project bootstrap, loading, default project state, and runtime wiring. |

## P1 - 801 To 999 Lines

These files are critical legacy surfaces and must be reduced before feature growth.

| Lines | File | Task To Perform |
| ---: | --- | --- |
| 997 | `atome/src/squirrel/components/console_builder.js` | Split console rendering, command input, history, and style contract. |
| 991 | `eVe/domains/mtrax/clips/node_render_runtime.js` | Split clip node creation, update, selection styling, and data binding. |
| 991 | `atome/src/squirrel/components/slice_builder.js` | Split slice model, rendering, controls, and style tokens. |
| 989 | `eVe/domains/mtrax/timeline/play_runtime.js` | Split playback loop, scheduling, transport state, and frame dispatch. |
| 980 | `atome/src/squirrel/components/tool_slider_builder.js` | Split canonical slider DOM, direct-drag, style, and state semantics while preserving public contract. |
| 969 | `eVe/i18n/languages.js` | Split language payloads by locale/domain; keep i18n API separate from data. |
| 942 | `eVe/intuition/tools/core/hmtracks_audio_engine_v1.js` | Split legacy audio engine pieces; decide removal or replacement by maintained MTraX audio domain. |
| 939 | `eVe/intuition/tools/core/svg_vector_edit_runtime.js` | Split SVG vector edit model, gestures, handles, and commit logic. |
| 935 | `eVe/domains/mtrax/preview/preview_frame_data_runtime.js` | Split preview frame data model, source resolution, and rendering handoff. |
| 920 | `eVe/core/media_engine/molecule.js` | Split Molecule engine sessions, commands, media, history, and rendering bridges. |
| 920 | `eVe/core/atome_events/drag_runtime.js` | Split drag baseline, pointer handling, commit generation, and projection updates; avoid DOM as canonical geometry. |
| 909 | `atome/src/application/lyrix/src/features/audio/audio.js` | Split Lyrix audio controls, playback, recording, and storage. |
| 908 | `eVe/domains/media/api/media_api_shared.js` | Split media route/source helpers, auth, runtime detection, and bridge utilities. |
| 905 | `platforms/ios/atome-auv3/Common/FileSystemBridge.swift` | Split filesystem operations, security checks, bridge serialization, and error mapping. |
| 903 | `eVe/intuition/tools/layer.js` | Split layer UI, Atome ordering mutation, selection handling, and visual feedback. |
| 901 | `platforms/ios/atome-auv3/Common/iCloudFileManager.swift` | Split iCloud auth, file sync, conflict handling, and bridge callbacks. |
| 877 | `atome/src/squirrel/voice/session_runtime.js` | Split voice session state, event buffer, interruption, and lifecycle. |
| 876 | `eVe/core/atome_events/project_layer_runtime.js` | Split lasso, group/text creation, project gestures, and canonical mutation generation. |
| 872 | `atome/src/squirrel/mail/node_protocol_clients.js` | Split IMAP/SMTP protocol clients, parsing, auth, and transport. |
| 858 | `server/visio.js` | Split room/contact routes, signaling state, and persistence. |
| 844 | `eVe/domains/mtrax/audio/hmtracks_native_audio_runtime.js` | Split native audio setup, metadata, playback/record bridge, and cleanup. |
| 837 | `atome/src/squirrel/components/slider_builder.js` | Split generic slider builder model, DOM, events, and style. |
| 824 | `eVe/intuition/tools/core/tool_registry.js` | Split registry persistence, definitions, migration, and lookup. |
| 820 | `atome/src/application/lyrix/src/components/modal.js` | Split modal shell, focus handling, content rendering, and callbacks. |
| 807 | `platforms/desktop-tauri/src/audio_engine/playback.rs` | Split playback device setup, stream state, decoding, and error handling. |

## P2 - 501 To 800 Lines

These files are above the hard maximum and must be reduced when touched.

| Lines | File | Task To Perform |
| ---: | --- | --- |
| 791 | `eVe/intuition/runtime/layer_contract.js` | Split layer constants, DOM ensurers, z-index contracts, and tests. |
| 751 | `atome/src/wasm/squirrel_audio_wasm.js` | Split WASM loading, audio processing bridge, and public API. |
| 738 | `atome/src/application/jeezs/demo.js` | Verify active status; remove or split demo runtime from maintained code. |
| 732 | `eVe/intuition/tools/core/svg_draw_runtime.js` | Split SVG drawing input, model updates, rendering, and commit calls. |
| 731 | `eVe/intuition/matrix/core/project_data.js` | Split project data loading, normalization, and Matrix-facing projection. |
| 726 | `atome/src/squirrel/mail/bootstrap.js` | Split mail service bootstrap, connector setup, sync, and public exposure. |
| 718 | `atome/src/squirrel/voice/panel.js` | Split voice panel UI, state, controls, and service integration. |
| 717 | `atome/src/application/jeezs/index backup.js` | Remove backup/legacy duplicate if not runtime-referenced; otherwise split active responsibilities. |
| 711 | `eVe/domains/mtrax/timeline/persist_runtime.js` | Split timeline persistence serialization, commit bridge, and schema migration. |
| 709 | `atome/src/squirrel/apis/unified/adole_api/atomes.js` | Split Atome API create/list/upsert, state_current adapters, and canonical formatters. |
| 708 | `eVe/domains/user/profile_api.js` | Split profile service calls, persistence, and UI-facing helpers. |
| 706 | `atome/src/squirrel/components/draggable_builder.js` | Split draggable model, pointer handling, DOM projection, and style. |
| 698 | `atome/src/application/lyrix/src/features/midi/midi_utilities.js` | Split MIDI parsing, routing, device handling, and Lyrix-specific helpers. |
| 697 | `atome/src/squirrel/apis/unified/adole_api/activities.js` | Split activity API methods, formatting, and request helpers. |
| 686 | `eVe/shared/lasso_context_zone_runtime.js` | Split lasso hit-testing, zone model, and UI feedback. |
| 681 | `eVe/domains/mtrax/media/position_runtime.js` | Split media positioning math, clip state, and projection updates. |
| 670 | `eVe/domains/mtrax/core/diagnostics.js` | Split diagnostics collection, formatting, and public debug hooks. |
| 668 | `eVe/domains/media/media_diagnostics.js` | Split media diagnostics by recording, playback, source, and environment. |
| 654 | `atome/security/syncQueue.js` | Split queue model, storage, retry policy, and cloud sync integration. |
| 650 | `eVe/core/media_engine/molecule.api.js` | Split public Molecule API, session lookup, command dispatch, and persistence bridge. |
| 650 | `atome/src/application/audio_runtime/av_contracts.js` | Split AV contracts by playback, recording, backend, and metadata. |
| 646 | `server/userFiles.js` | Split file upload, listing, permissions, and storage paths. |
| 638 | `eVe/intuition/tools/core/svg_vector_model.js` | Split SVG vector state, validation, and transformation helpers. |
| 625 | `eVe/intuition/tools/ui/tool_button_factory.js` | Split tool button construction, icon handling, slider composition, and state styling. |
| 624 | `atome/src/squirrel/ai/provider_client.js` | Split provider request construction, streaming, errors, and model metadata. |
| 614 | `eVe/intuition/flower/menu.js` | Split flower menu rendering, input handling, positioning, and action dispatch. |
| 614 | `eVe/domains/mtrax/media/authorized_playback_runtime.js` | Split auth source resolution, playback URL generation, and cache behavior. |
| 608 | `atome/src/squirrel/contacts/node_protocol_clients.js` | Split contacts protocol clients, transport, parsing, and auth. |
| 597 | `eVe/domains/media/preview/video_preview_panel_service.js` | Split preview panel lifecycle, source handling, controls, and cleanup. |
| 591 | `atome/src/squirrel/contacts/service.js` | Completed: extracted contact normalization, matching, cloning, source snapshots, and query helpers to `atome/src/squirrel/contacts/service_contact_utils.js`; service is now below 500 lines. |
| 585 | `platforms/ios/atome-auv3/Common/FileSyncCoordinator.swift` | Completed: extracted root discovery, inventory building, file copy/delete helpers, and cleanup operations to `platforms/ios/atome-auv3/Common/FileSyncCoordinatorFileOperations.swift`; coordinator is now below 500 lines. |
| 579 | `atome/src/application/audio_runtime/play_record_core.js` | Completed: extracted public play-record contract constants and media source canonicalization to dedicated audio runtime modules; core is now below 500 lines. |
| 567 | `platforms/desktop-tauri/src/audio_engine/recorder.rs` | Completed: extracted desktop WAV format/file-writing/thread-drain responsibilities to `platforms/desktop-tauri/src/audio_engine/recorder_wav.rs`; recorder is now below 500 lines. |
| 557 | `platforms/ios/atome-auv3/auv3/AUv3Recorder.swift` | Completed: extracted recorded WAV analysis to `platforms/ios/atome-auv3/auv3/AUv3RecorderAnalysis.swift`; recorder is now below 500 lines. |
| 550 | `platforms/ios/atome-auv3/Common/MIDIController.swift` | Split MIDI session, device enumeration, event routing, and bridge. |
| 550 | `atome/src/squirrel/voice/ai_planner.js` | Split planning prompt, tool selection, quota handling, and output validation. |
| 542 | `eVe/intuition/tools/paste.js` | Split clipboard parsing, Atome creation, selection, and commit handling. |
| 541 | `eVe/intuition/matrix/ui/view.js` | Split Matrix DOM view, event binding, visual tokens, and render updates. |
| 536 | `atome/src/squirrel/apis/loadServerConfig.js` | Split server config discovery, defaults, validation, and runtime exposure. |
| 535 | `atome/src/squirrel/mail/icloud_connector.js` | Split iCloud auth, fetch/send/sync, and connector contract. |
| 533 | `eVe/domains/mtrax/karaoke/detail_runtime.js` | Split karaoke detail model, UI rendering, sync, and timeline bridge. |
| 530 | `eVe/intuition/tools/copy.js` | Split clipboard payload construction, canonical property filtering, and selection handling. |
| 530 | `atome/src/squirrel/components/table_builder.js` | Split table model, rendering, interaction, and style contract. |
| 515 | `atome/src/application/audio_runtime/runtime_audio_backend.js` | Split backend selection, native/browser adapters, and error policy. |
| 509 | `atome/security/serverVerification.js` | Split verification policy, trusted key lookup, cache, and network checks. |
| 507 | `eVe/domains/mtrax/preview/preview_edit_bridges_runtime.js` | Split preview edit bridge registration, dispatch, and cleanup. |
| 503 | `eVe/intuition/tools/core/mtrax_renderer_runtime.js` | Split renderer bootstrap, state, adapter calls, and public facade. |
| 502 | `eVe/intuition/flower/context.js` | Split flower context collection, filtering, and action metadata. |

# file_treat.md

# GLOBAL EXECUTION DIRECTIVE

This document defines a mandatory exhaustive execution policy.

The AI MUST execute ALL requested operations completely, exhaustively, recursively, and continuously until absolutely no actionable item remains.

The AI is forbidden from:

- partial execution;
- scoped execution;
- selective execution;
- batch-only execution;
- milestone-only execution;
- “proof-of-concept” execution;
- deferred execution;
- postponed continuation;
- voluntarily interrupted execution.

The task is considered COMPLETE ONLY when:

- every file;
- every section;
- every TODO;
- every P0/P1/P2 item;
- every legacy surface;
- every dependency;
- every validation;
- every refactor;
- every reduction;
- every cleanup;
- every optimization;
- every migration;
- every verification

has been fully processed and validated.

---

# MANDATORY FULL EXECUTION POLICY

The AI MUST process the ENTIRE document and ENTIRE codebase from beginning to end.

The AI MUST NOT:

- stop after a coherent subset;
- stop after a “first batch”;
- stop after a “safe reduction”;
- stop after a “completed P2”;
- stop after “significant progress”;
- provide partial completion summaries;
- emit unfinished milestone reports.

Forbidden response patterns:

- “I started with…”
- “I processed a first batch…”
- “I focused on…”
- “remaining items…”
- “next steps…”
- “continued later…”
- “future pass…”
- “to be handled separately…”

Any such response is considered FAILURE.

The AI MUST continue automatically until full completion.

---

# NO SELF-LIMITATION POLICY

The AI is forbidden from reducing scope due to:

- token size;
- file size;
- project size;
- estimated complexity;
- number of legacy surfaces;
- recursion depth;
- time estimation;
- contextual pressure;
- amount of work;
- quantity of files;
- amount of TODOs;
- amount of generated output.

The AI MUST adapt automatically.

The AI MUST internally chunk work if necessary while preserving global continuity.

Internal chunking MUST remain invisible to the user.

---

# RECURSIVE EXECUTION POLICY

The AI MUST recursively continue execution until:

remaining_actionable_items == 0

The AI MUST:

1. scan;
2. execute;
3. validate;
4. rescan;
5. continue recursively.

The process MUST repeat until no actionable item remains anywhere.

Stopping before recursive exhaustion is forbidden.

---

# CONTINUITY POLICY

If the context window becomes insufficient, the AI MUST:

1. create compressed internal summaries;
2. preserve execution continuity;
3. continue automatically;
4. resume exactly where processing stopped;
5. maintain global consistency.

The AI MUST NEVER use context limitations as a reason to stop execution.

---

# EXHAUSTIVENESS POLICY

The AI MUST:

- inspect all referenced files;
- inspect all imports;
- inspect all linked APIs;
- inspect all related modules;
- inspect all legacy surfaces;
- inspect all dependent systems;
- inspect all side effects.

The AI MUST NOT assume a task is isolated without verification.

---

# CODE QUALITY POLICY

After every modification the AI MUST:

- remove dead code;
- remove temporary code;
- remove debug code;
- remove obsolete code;
- remove duplicate logic;
- remove redundant paths;
- remove abandoned experiments;
- factorize repeated logic;
- optimize architecture;
- preserve consistency;
- preserve naming coherence;
- preserve API consistency;
- preserve type consistency.

The repository MUST end in a cleaner state than before execution.

---

# DEBUG POLICY

Temporary logs are allowed ONLY for active debugging.

Once a problem is resolved the AI MUST IMMEDIATELY remove:

- temporary logs;
- probes;
- traces;
- instrumentation;
- debug outputs;
- verbose diagnostics;
- temporary test code.

Zero residual debug code is allowed.

---

# VALIDATION POLICY

The AI MUST validate:

- build integrity;
- runtime integrity;
- type integrity;
- dependency integrity;
- import integrity;
- architectural consistency;
- API consistency;
- cross-platform consistency.

The AI MUST verify that modifications do not break:

- Tauri;
- Web;
- iOS;
- Android;
- FreeBSD;
- WASM;
- desktop targets;
- server targets;
- audio systems;
- synchronization systems.

---

# FAILURE POLICY

The AI MUST NOT:

- silently skip files;
- silently skip TODOs;
- silently skip errors;
- silently ignore warnings;
- silently downgrade scope.

Any unresolved issue MUST be:

1. explicitly identified;
2. fully analyzed;
3. fully resolved if technically possible.

---

# PRIORITY POLICY

Priority order:

1. correctness;
2. completion;
3. consistency;
4. cleanup;
5. optimization;
6. performance;
7. output verbosity.

The AI MUST prioritize finishing the ENTIRE task over explaining the task.

---

# FINAL RESPONSE POLICY

The AI MUST emit a final response ONLY when:

- all actionable items are exhausted;
- all scans are complete;
- all validations pass;
- all recursive passes are complete;
- no remaining TODO exists.

Completion condition:

remaining_actionable_items == 0

Only then may the AI declare the task complete.

---

# MANDATORY EXECUTION MINDSET

The AI MUST behave as:

- an autonomous execution engine;
- a recursive completion system;
- a full-project processor;
- a zero-shortcut system.

The AI MUST NOT behave as:

- a conversational assistant;
- a partial helper;
- a milestone generator;
- a scoped optimizer.

Execution MUST continue until total exhaustion of remaining work.

# HARD ENFORCEMENT — LARGE FILE REDUCTION POLICY

The existence of architectural ownership boundaries, runtime boundaries, stable public APIs, maps, registries, stores, adapters, service containers, lookup tables, routing layers, or internal module ownership DOES NOT exempt files from mandatory reduction and refactoring.

ALL files exceeding the defined maximum size threshold MUST be processed.

No exception is allowed for:

- maps;
- registries;
- stores;
- routers;
- dispatchers;
- managers;
- runtime owners;
- API containers;
- configuration hubs;
- orchestration layers;
- centralization files;
- aggregation files;
- bridge files;
- compatibility layers;
- legacy wrappers.

The AI MUST:

- split oversized files;
- extract responsibilities;
- isolate concerns;
- factorize logic;
- modularize implementations;
- reduce complexity;
- preserve behavior.

Preserving architecture does NOT justify preserving oversized files.

Stable public APIs are NOT a valid reason to avoid internal refactoring.

The AI MUST preserve:

- runtime behavior;
- API compatibility;
- platform compatibility;
- synchronization integrity;
- architectural semantics;

WHILE STILL reducing file size below the required threshold.

---

# MANDATORY SIZE TARGET POLICY

Every file above the maximum authorized line count MUST be reduced below the threshold.

Completion condition:

files_above_threshold == 0

The task is NOT complete while any oversized file remains.

Inventorying remaining oversized files is forbidden as a final state.

The AI MUST continue processing automatically until:

remaining_oversized_files == 0

# AUTONOMOUS CONTINUATION LOOP — NO USER CONFIRMATION

The AI MUST NOT ask the user whether to continue.

When a tranche, batch, file, or refactor is completed, the AI MUST automatically select the next remaining item from todo/file_treat.md and continue execution.

The following response is forbidden:

"I can continue with the next item."

Instead, the AI MUST immediately continue.

Completion is only allowed when:

remaining_P0_items == 0
remaining_P1_items == 0
remaining_P2_items == 0
remaining_files_above_500_lines == 0
remaining_maps_to_update == 0
remaining_validations_to_run == 0

Any intermediate state MUST NOT be presented as final.

---

# FORBIDDEN STOPPING BEHAVIOR

The AI MUST NOT stop with:

- "I treated a first tranche"
- "I can continue"
- "next realistic item"
- "this would require a long series"
- "remaining items exist"
- "large architectural refactors remain"

These are not valid stopping conditions.

If remaining items exist, the AI MUST continue automatically.

---

# EXECUTION LOOP

The AI MUST follow this loop:

1. Read the full remaining inventory.
2. Pick the highest-priority remaining item:
   - P0 first
   - then P1
   - then P2
   - then all files above 500 lines
3. Refactor the selected item completely.
4. Update all related maps.
5. Preserve public APIs and runtime boundaries.
6. Run required validations.
7. Update the remaining inventory.
8. Repeat from step 1.

The AI MUST repeat this loop until the inventory is empty.

---

# NO "REALISTIC ITEM" ESCAPE

The AI is forbidden from choosing only "realistic", "small", "safe", or "coherent" items while leaving larger required refactors untreated.

Large architectural refactors are mandatory.

The AI MUST decompose large refactors internally and continue until complete.

---

# FINAL ANSWER CONDITION

The AI may answer only when the following is true:

remaining_actionable_items == 0

If this condition is false, the AI MUST continue working and MUST NOT produce a final answer.

# GIT READ-ONLY CLARIFICATION

The repository Git history MUST remain read-only.

The AI MUST NOT run mutating Git commands such as:

- git commit
- git push
- git pull
- git reset
- git checkout
- git switch
- git rebase
- git merge
- git clean
- git stash
- git restore

However, this Git read-only policy DOES NOT mean the filesystem is read-only.

The AI IS explicitly allowed and required to:

- edit source files;
- create new source files;
- split oversized files;
- move code into new modules;
- update imports;
- update maps;
- update registries;
- update tests;
- update validation scripts;
- delete obsolete source files when safe.

The AI MUST treat the working tree as writable.

Git read-only means:

- do not mutate Git history;
- do not create commits;
- do not change branches;
- do not reset files through Git.

Git read-only DOES NOT mean:

- do not edit files;
- do not refactor;
- do not split files;
- do not complete the task.

Using Git read-only as a reason to stop is forbidden.

# OVERSIZED FILE CONTINUATION POLICY

If a file remains above the line threshold after extraction, the AI MUST continue extracting responsibilities from that same file until it is below the threshold.

The AI MUST NOT mark a file as partially processed if it remains above the threshold.

For any file still above threshold, the AI MUST:

1. re-open the file;
2. identify the next separable responsibility;
3. extract it into a dedicated module;
4. update imports and maps;
5. run validation;
6. re-check line count;
7. repeat until the file is below threshold.

Completion condition for each oversized file:

file_line_count <= 500

A file remaining above 500 lines means the task for that file is NOT complete.

# NO INTERMEDIATE REPORTING POLICY

The AI MUST NOT stop after a successful extraction, validation, map update, or refactor to provide a progress report.

Successful completion of:

- a file split;
- a module extraction;
- a validation pass;
- a map update;
- a syntax check;
- a runtime check;

MUST immediately trigger continuation toward the next remaining actionable item.

The AI MUST continue automatically after every successful step.

Progress reports are forbidden until the global task is complete.

---

# FORBIDDEN PROGRESS REPORTING

The AI MUST NOT emit messages such as:

- "I applied the rules"
- "I started with the first P0"
- "Change performed"
- "Maps updated"
- "Validations passed"
- "The worktree already contained changes"
- "I did not perform Git mutations"

These are intermediate execution details, not completion conditions.

Execution MUST continue immediately after such operations.

---

# CONTINUOUS EXECUTION MODE

The AI MUST remain in execution mode continuously.

Execution mode means:

- process item;
- validate;
- continue;
- process next item;
- validate;
- continue recursively.

The AI MUST NOT switch into conversational mode between items.

The AI MUST behave like a continuous autonomous refactoring engine.

---

# GLOBAL COMPLETION CONDITION

The AI MUST continue until ALL of the following are true:

remaining_P0_items == 0
remaining_P1_items == 0
remaining_P2_items == 0
remaining_files_above_threshold == 0
remaining_required_refactors == 0
remaining_map_updates == 0
remaining_validations == 0
remaining_actionable_items == 0

If any value is non-zero, the AI MUST continue automatically.

---

# NO MICRO-COMPLETION POLICY

Reducing a file from 17948 lines to 17471 lines is NOT considered meaningful completion.

A file remains actionable until:
file_line_count <= threshold

The AI MUST continue decomposing the file recursively until the threshold is reached.

Large files MUST undergo repeated extractions without interruption.

---

# AUTONOMOUS RECURSIVE DECOMPOSITION

For oversized files, the AI MUST:

1. identify the next extractable responsibility;
2. extract it;
3. update imports and maps;
4. validate;
5. immediately repeat on the same file;
6. continue until below threshold;
7. only then move to the next item.

The AI MUST NOT pause between recursive decompositions.

# PERSISTENT REFACTORING PROTOCOL

The AI MUST process this task across multiple executions if necessary.

Each execution MUST:

1. recalculate the remaining inventory;
2. select the highest-priority remaining item;
3. fully reduce that item below 500 lines;
4. update maps;
5. run validations;
6. update todo/file_treat.md by marking the item as completed;
7. immediately continue with the next item until execution limits are reached.

If execution limits are reached, the AI MUST stop only after:

- completing the current item fully;
- updating the remaining inventory;
- writing an exact resume point into todo/file_treat.md.

The next run MUST resume from that exact point without redoing completed work.

Continue from the current state.

Do not restart from the beginning.

Recalculate the remaining inventory, pick the highest-priority remaining file above 500 lines, reduce it below 500 lines, update maps, run validations, mark it completed in todo/file_treat.md, then continue automatically with the next remaining item until the execution limit is reached.

If you must stop, stop only after a fully completed item and write the exact resume point into todo/file_treat.md.
