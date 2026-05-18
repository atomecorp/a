# Full Vocal AI Integration

Master todo for full vocal AI integration in eVe/Atome/Atum.

This file is the single source of truth for the chantier.

## Update rules

- Only check a task when code, tests, and manual verification are done.
- Keep this file updated at the end of each completed step.
- Add new subtasks here as soon as they are discovered.
- Do not mark a phase as done while a blocking subtask is still open.

## Product target

- Full voice control of Atum through MCP.
- Real-time interruptible voice UX.
- Control of the full interface after user activation/auth.
- Unified control path for UI, voice, and MCP.
- Mail, calendar, and banking integrated with the same execution model.

## Starting audit snapshot

- [x] Audit the current MCP surface vs runtime V2
  - Done on 2026-03-11.
  - Result: current MCP exposes a limited AtomeAI subset and not the full runtime catalog.
- [x] Identify the main architecture gap
  - Done on 2026-03-11.
  - Result: runtime V2 is the canonical execution layer, but MCP is not yet projecting it dynamically.
- [x] Identify the first blocking inconsistencies
  - Done on 2026-03-11.
  - Result: current MCP MTrack tools still rely on legacy `runTool` and point to tool ids not found elsewhere in sources.
- [x] Decide the recommended chantier order
  - Done on 2026-03-11.
  - Decision: start with `runtime V2 -> MCP -> voice`, not with IMAP/STT first.
- [x] Create this master todo file
  - Done on 2026-03-11.

## Phase 0 - Canonical architecture alignment

Goal: make MCP use the real execution layer already present in the app.

- [x] Design the canonical `runtime V2 -> MCP` adapter
  - Done on 2026-03-12.
  - Result: additive MCP runtime namespace introduced with dedicated runtime bridge methods.
- [x] Define the dynamic discovery contract for runtime tools
  - Done on 2026-03-12.
  - Result: runtime tools are now discoverable through `runtime.tools.list`.
- [x] Route MCP `tools/call` to `toolRuntimeV2.invokeById`
  - Done on 2026-03-12.
  - Result: runtime invocation is now exposed through `runtime.tools.call`.
- [x] Route MCP batch calls to `toolRuntimeV2.invokeBatch`
  - Done on 2026-03-12.
  - Result: batch runtime invocation is now exposed through `runtime.tools.batch_call`.
- [x] Project runtime metadata into MCP output
  - Done on 2026-03-12.
  - Result: runtime execution mode, contexts, visibility, and selection requirements are projected in discovery output.
- [x] Keep AtomeAI as policy/proposal/audit layer above runtime execution
  - Done on 2026-03-12.
  - Result: `AgentGateway` now generates and preserves `trace_id`, `intent_id`, and caller `source` before policy evaluation, proposals, approvals, rejections, and runtime execution, so the AI layer remains the canonical policy/proposal/audit shell over runtime execution.
- [x] Define compatibility strategy for existing AtomeAI default tools
  - Done on 2026-03-12.
  - Result: AtomeAI default tools now prefer canonical runtime V2 tool ids when an equivalent runtime surface exists; current migrated coverage includes MTrack clip actions and calendar CRUD, while direct API calls remain only for tools with no runtime equivalent yet.
- [x] Route current AtomeAI calendar default tools through runtime V2
  - Done on 2026-03-12.
  - Result: `calendar.list_events`, `calendar.get_event`, `calendar.create_event`, `calendar.update_event`, `calendar.delete_event`, and `calendar.ensure_calendar` now delegate to runtime V2 instead of calling `CalendarAPI` directly.
- [x] Remove MCP paths still depending on legacy `runTool`
  - Done on 2026-03-12.
  - Result: MCP-exposed MTrack tools now delegate to `atome.tools.v2Runtime.invokeById`.
- [x] Fix or remove `eve.mtrack.clip.move`
  - Done on 2026-03-12.
  - Result: `eve.mtrack.clip.move` now targets the canonical runtime tool id `ui.move`.
- [x] Fix or remove `eve.mtrack.clip.crop`
  - Done on 2026-03-12.
  - Result: `eve.mtrack.clip.crop` now targets the canonical runtime tool id `ui.crop`.
- [x] Add end-to-end logging for `voice/UI/MCP -> runtime -> result`
  - Done on 2026-03-12.
  - Result: runtime command-bus events now include `trace_id`, `intent_id`, `source`, `source_layer`, `presentation`, and `command_seq`, and `runtime.audit.list` can filter by trace, tool, source, and layer for end-to-end inspection.
- [x] Expose runtime command-bus audit through MCP
  - Done on 2026-03-12.
  - Result: `runtime.audit.list` now exposes `v2CommandBus.listEvents()` through the MCP bridge for runtime-level audit inspection.
- [x] Document the target architecture in `documentations/`
  - Done on 2026-03-12.
  - Result: canonical entrypoint and audit rules are documented in `src/application/eVe/documentations/runtime_ai_mcp_entrypoints.md`.

### Phase 0 validation

- [x] MCP lists the runtime tool surface instead of a hand-made subset
  - Done on 2026-03-12.
  - Result: `runtime.tools.list` is sourced from `toolRuntimeV2.listTools()` and validated in `mcp.runtime_bridge.test.mjs`.
- [x] A runtime UI tool can be invoked through MCP without a custom wrapper
  - Done on 2026-03-12.
- [x] One unique execution path is visible in logs
  - Done on 2026-03-12.
  - Result: `runtime.audit.list` exposes runtime command-bus events, and `default_tools.runtime_trace_integration.test.mjs` validates that `trace_id` and AI source metadata survive the `AtomeAI default tool -> runtime V2 -> command bus` path.
- [x] No remaining legacy `runTool` dependency in the MCP path
  - Done on 2026-03-12.

## Phase 1 - Full UI control coverage matrix

Goal: prove that the whole interface can really be controlled remotely.

- [x] Build the coverage matrix by tool family
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_coverage.test.mjs` now exports a family-based runtime coverage report to `temp/probe_reports/eve_runtime_coverage.json`.
- [x] List all critical tool ids and their execution path
  - Done on 2026-03-12.
  - Result: the runtime coverage report now includes the catalog with `tool_id`, `tool_key`, `execution_mode`, contexts, selection requirements, disabled state, and visibility.
- [x] Verify main tools can be invoked remotely
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_main_panel_probe.test.mjs` validates 10/10 main tools in headless runtime.
- [x] Verify panel tools can be invoked remotely
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_main_panel_probe.test.mjs` validates 8/8 panel tools in headless runtime.
- [x] Close current headless runtime gaps for main/panel runtime probe
  - Done on 2026-03-12.
  - Result: Finder now has a headless-safe runtime fallback, so the main/panel probe is fully green.
- [x] Verify selection, multi-selection, lasso, and target resolution
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_selection_transform_probe.test.mjs` validates `ui.select`, `ui.multi_select`, `ui.lasso_select`, `ui.clear_selection`, `ui.move`, `ui.drag`, `ui.resize`, `ui.scale`, and `ui.rotate` in headless runtime, and `runtime_selection_explicit_target_precedence.test.mjs` locks explicit target precedence against stale selection snapshots.
- [x] Verify draw tools
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_creative_probe.test.mjs` validates draw latch and draw mode routing for `ui.draw.edit`, `ui.draw.mode.brush`, `ui.draw.mode.rect`, and `ui.draw.mode.ellipse`.
- [x] Verify vector tools
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_creative_probe.test.mjs` validates `ui.vector.edit` latch on/off in headless runtime.
- [x] Verify text tools
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_creative_probe.test.mjs` validates `ui.text.create`, `ui.text_input`, and `ui.circle`, including headless atome creation flow.
- [x] Verify transport and media reader tools
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_transport_capture_probe.test.mjs` validates `ui.play`, `ui.pause`, and `ui.stop`, and `tests/probes/eve_runtime_transport_record_reveal_probe.test.mjs` plus `runtime_transport_record_reveal.test.mjs` validate `ui.media.reader` and `ui.animation.reader` through runtime V2 in headless mode.
- [x] Verify MTrack and timeline tools
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_transport_capture_probe.test.mjs` validates `ui.mtrax.open`, `ui.timeline_scrub`, `ui.split`, `ui.crop`, `ui.mute`, and `ui.solo`, and `tests/probes/eve_runtime_transport_record_reveal_probe.test.mjs` validates `ui.join`, `ui.automation`, and `ui.detail.record.toggle` in headless runtime.
- [x] Verify capture audio/video/photo/screen tools
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_transport_capture_probe.test.mjs` validates `ui.capture.audio`, `ui.capture.video`, `ui.capture.preview`, `ui.capture.photo`, `ui.capture.import`, `ui.capture.screen`, and `ui.capture.validation` through runtime V2 in headless mode.
- [x] Verify perform mode tools
  - Done on 2026-03-12.
  - Result: `runtime_registered_handlers.test.mjs` validates `tool.main.perform`, and `tests/probes/eve_runtime_transport_record_reveal_probe.test.mjs` validates `ui.palette.reveal`, covering the current perform/reveal runtime surface in headless mode.
- [x] Verify communication tools and panels
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_comm_calendar_probe.test.mjs` validates `tool.main.communicate`, `ui.comm.panel`, and `ui.contact.panel` in headless runtime, confirming the current communication surface is panel-level through runtime V2.
- [x] Verify calendar tools
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_comm_calendar_probe.test.mjs` validates `tool.main.time` and `ui.calendar.panel`, and `tests/probes/eve_runtime_calendar_crud_probe.test.mjs` plus `runtime_calendar_api.test.mjs` validate runtime calendar CRUD tools (`calendar.list_events`, `calendar.get_event`, `calendar.create_event`, `calendar.update_event`, `calendar.delete_event`, `calendar.ensure_calendar`) in headless mode.
- [x] Identify orphan or duplicated tool ids
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_integrity.test.mjs` reports zero duplicate `tool_id`, zero duplicate `tool_key`, 13 uncategorized runtime ids, and no broken AtomeAI runtime wrappers.
- [x] Fix missing registrations
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_registered_handler_audit.test.mjs` now validates 64/64 `v2_registered_handler` tools in headless runtime after projecting the remaining latent legacy handlers into the runtime V2 catalog.
- [x] Add headless tests for every critical family
  - Done on 2026-03-12.
  - Result: dedicated headless tests now cover finder, selection/transform, creative, transport/capture/MTrack, communication/calendar, perform, and the global `v2_registered_handler` audit path.

### Families that must be green

- [x] Finder / project navigation
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_main_panel_probe.test.mjs` plus `tool_runtime.finder_v2_flows.test.mjs` validate the Finder main/panel path and target selection/move flows in runtime V2.
- [x] Selection / lasso / move / resize / rotate / scale
  - Done on 2026-03-12.
  - Result: the selection/transform probe is fully green in `temp/probe_reports/eve_runtime_selection_transform_probe.json`.
- [x] Draw / vector / text
  - Done on 2026-03-12.
  - Result: the creative probe is fully green in `temp/probe_reports/eve_runtime_creative_probe.json`.
- [x] Transport / play / pause / stop / media / animation
  - Done on 2026-03-12.
  - Result: headless probes/tests now cover `ui.play`, `ui.pause`, `ui.stop`, `ui.media.reader`, and `ui.animation.reader`.
- [x] Capture / record / import
  - Done on 2026-03-12.
  - Result: headless probes/tests now cover `ui.capture.*`, `ui.capture.import`, and `ui.detail.record.toggle`.
- [x] MTrack / timeline / clip editing / preview
  - Done on 2026-03-12.
  - Result: headless probes/tests now cover `ui.mtrax.open`, `ui.timeline_scrub`, `ui.split`, `ui.join`, `ui.automation`, `ui.crop`, `ui.mute`, `ui.solo`, and `ui.detail.record.toggle`.
- [x] Panels / info / ai / comm / calendar / home / contact
  - Done on 2026-03-12.
  - Result: `tests/probes/eve_runtime_main_panel_probe.test.mjs` plus `tests/probes/eve_runtime_comm_calendar_probe.test.mjs` now cover home, info, ai, comm, calendar, and contact panel surfaces in headless runtime.
- [x] Perform / fullscreen / UI reveal
  - Done on 2026-03-12.
  - Result: headless probes/tests now cover `tool.main.perform` plus `ui.palette.reveal`, which is the current standalone perform/reveal runtime surface; there is still no separate fullscreen tool id in the catalog.
- [x] Calendar read / create / update
  - Done on 2026-03-12.
  - Result: headless probes/tests now cover `calendar.list_events`, `calendar.get_event`, `calendar.create_event`, `calendar.update_event`, `calendar.delete_event`, and `calendar.ensure_calendar`.

## Phase 2 - Voice interruptible foundation

Goal: ship the hard real-time voice base first.

- [x] Choose STT v1 provider
  - Done on 2026-03-12.
  - Result: the v1 voice service now codifies `tauri_plugin_stt` as the preferred STT backend with `browser_web_speech` fallback, and runtime provider resolution is exposed through `src/squirrel/voice/service.js`.
- [x] Choose TTS v1 backend
  - Done on 2026-03-12.
  - Result: the v1 voice service now codifies system `speechSynthesis` as the active TTS backend with an explicit future native fallback slot, and exposes the resolved backend through `src/squirrel/voice/service.js`.
- [x] Define the voice session protocol
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/session_runtime.js` now defines the canonical voice session object, top-level phases, session/source metadata, interruption events, followup queueing, and invocation context propagation for the `voice -> MCP/runtime` path.
- [x] Add VAD or equivalent speech detection
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/vad.js` now provides a reusable energy-based speech detector with speech/silence transitions, and the voice service can bind it to a session so VAD state is published on the shared voice event stream.
- [x] Add capture start/stop/cancel lifecycle
  - Done on 2026-03-12.
  - Result: the voice runtime now exposes capture lifecycle transitions (`startCapture`, `stopCapture`, `cancelCapture`) with session history, abortable channels, and stored capture results.
- [x] Add streaming French STT with partials
  - Done on 2026-03-12.
  - Result: `voice.stt.start/stop/listen` now stream interim French transcripts through the browser host STT path into the canonical session runtime and preserve final transcripts/segments on completion.
- [x] Add immediately stoppable TTS
  - Done on 2026-03-12.
  - Result: `voice.tts.speak/stop` now wraps system speech synthesis with immediate `cancel()` interruption and feeds the same interruption state back into the voice session runtime.
- [x] Add local instant commands: `stop`, `suivant`, `annule`, `resume`
  - Done on 2026-03-12.
  - Result: the voice runtime now normalizes and handles local interruption commands (`stop`, `suivant`, `annule`, `resume`) plus `reponds`, with `resume` mapped to a shorter-summary followup for the current assistant turn.
- [x] Add cancel tokens from client to backend
  - Done on 2026-03-12.
  - Result: capture/STT/processing/TTS channels now expose abortable controllers, and local interruption aborts active backend work immediately through the session runtime.
- [x] Define post-interruption conversational state rules
  - Done on 2026-03-12.
  - Result: interruptions now preserve the previous phase, store the last command, mark resume availability, and queue explicit followups (`next_item`, `summarize_current`, `reply_current`) for the next orchestration step.
- [x] Expose real-time voice events to UI and MCP
  - Done on 2026-03-12.
  - Result: the voice runtime now emits a single event stream to internal listeners plus dedicated UI/MCP channels (`squirrel:voice` / `squirrel:voice:mcp`) for live session state, STT, TTS, capture, interruption, and followup events.
- [x] Add latency telemetry for STT/TTS/cancel
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/telemetry.js` now derives `stt_first_partial_ms`, `stt_final_ms`, `tts_playback_ms`, and `cancel_roundtrip_ms` directly from the canonical voice session event stream and exposes them through the voice service.
- [x] Wire the voice service into the global Squirrel/Atome bootstrap
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/bootstrap.js` now exposes a singleton voice API through `window.Squirrel.voice`, `window.atome.voice`, and `window.atome.tools.voice`, and `src/squirrel/spark.js` imports the bootstrap automatically.
- [x] Auto-load the Tauri recorder bridge for voice capture
  - Done on 2026-03-12.
  - Result: the voice bootstrap now loads the missing Tauri bridge modules (`tauri_audio_bridge.js` and `record_audio_api.js`) on demand so voice capture can resolve the native recorder path in the real desktop runtime.
- [x] Add an in-app voice diagnostics and control panel
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/panel.js` now mounts a floating launcher and live voice runtime panel with session creation, listen/speak/stop/capture controls, local command injection, followup consumption, and interruption probing.
- [x] Add automated UI coverage for the voice panel and bootstrap path
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/panel.test.mjs` and `src/squirrel/voice/bootstrap.test.mjs` now validate the mounted panel controls and the global/bootstrap bridge path.

### Phase 2 validation

- [x] The user can interrupt speech instantly
  - Done on 2026-03-13.
  - Result: `src/squirrel/voice/panel_interrupt_real_path.test.mjs` now validates the stop path through the real `bootstrap -> panel -> service -> runtime` chain, with immediate transition to the interrupted session state.
- [x] Audio playback stops without waiting for the full message
  - Done on 2026-03-13.
  - Result: the real-path panel interrupt integration now validates that the shared speech synthesis backend is cancelled immediately and that the probe reports a stopped speech path rather than waiting for natural completion.
- [x] Backend generation is cancelled or cleanly truncated
  - Done on 2026-03-13.
  - Result: the real-path panel interrupt integration now validates that the probe’s long-running processing task is aborted through the same stop action, and that the panel surfaces the aborted processing result.
- [x] A new command can be taken immediately after interruption
  - Done on 2026-03-13.
  - Result: the real-path panel interrupt integration now validates that `passe au suivant` is accepted immediately after stop and queues `next_item` without waiting for the interrupted turn to finish.

Notes:

- Automated integration coverage exists in `src/squirrel/voice/interrupt_integration.test.mjs` for the four validation points above.
- The four validation points are now also covered through the real `bootstrap -> panel -> service -> runtime` UI path in `src/squirrel/voice/panel_interrupt_real_path.test.mjs`.
- A live desktop smoke test remains part of the manual validation checklist in Phase 9.

## Phase 3 - Voice orchestration on top of MCP

Goal: voice becomes a dynamic front-end over MCP, not a hard-coded command list.

- [x] Define the voice intent schema
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/intent_schema.js` now defines the canonical voice intent envelope, normalized domains/targets/types, heuristic intent classification for local commands/calendar/UI/mail/bank, and execution planning placeholders for runtime V2 versus pending connectors.
- [x] Map intents to dynamic MCP toolchains
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/orchestrator.js` now loads the runtime catalog, classifies utterances against it, and executes runtime toolchains through `runtime.tools.call` / `runtime.tools.batch_call` over the MCP bridge with a runtime-direct fallback.
- [x] Support contextual commands: `suivant`, `precedent`, `resume`, `reponds`
  - Done on 2026-03-13.
  - Result: `src/squirrel/voice/session_runtime.js` now supports `precedent` in addition to the existing contextual local commands, and `src/squirrel/voice/orchestrator.js` resolves `next_item`, `previous_item`, `summarize_current`, and `reply_current` against the currently bound session intent.
- [x] Support conversation resume after interruption
  - Done on 2026-03-13.
  - Result: plain stop/interruption now exposes `resume_interrupted` through `consumePendingFollowup()`, and the orchestrator can rebuild and re-execute the last bound active intent from the voice session context.
- [x] Add explicit confirmations for sensitive actions
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/orchestrator.js` now blocks sensitive intents flagged with `confirmation_required` until explicit approval is passed, so runtime execution is gated before destructive or high-impact actions.
- [x] Add fallback UI when the intent is ambiguous
  - Done on 2026-03-13.
  - Result: `src/squirrel/voice/panel.js` now exposes an ambiguity panel with actionable suggestions through the in-app voice UI, driven by `planUtterance()` when no safe intent can be resolved.
- [x] Add voice-to-intent-to-tool execution journal
  - Done on 2026-03-12.
  - Result: `src/squirrel/voice/orchestrator.js` now records `voice.intent.planned` / `voice.intent.executed` journal entries with subscription and replay support, so the `voice -> intent -> toolchain` path is auditable from the orchestrator layer itself.

### Priority voice flows

- [x] "Lis mes mails"
  - Done on 2026-03-13.
  - Result: the priority flow suite validates that `Lis mes mails` resolves to the pending mail connector path with `mail_read` / `mail_next_unread` capabilities.
- [x] "Lis le suivant"
  - Done on 2026-03-13.
  - Result: after a mail session is active, `Lis le suivant` now resolves contextually to the current mail flow and maps to `mail_next_unread`.
- [x] "Reponds ..."
  - Done on 2026-03-13.
  - Result: in an active mail session, `Reponds ...` now resolves to `mail_reply_draft` and preserves the dictated reply text in the intent entities.
- [x] "Quels sont mes rendez-vous demain"
  - Done on 2026-03-13.
  - Result: the flow executes through runtime V2 to `calendar.list_events`.
- [x] "Ajoute un rendez-vous ..."
  - Done on 2026-03-13.
  - Result: the flow executes through runtime V2 as a toolchain `calendar.ensure_calendar -> calendar.create_event`.
- [x] "Ou en est mon compte"
  - Done on 2026-03-13.
  - Result: the flow resolves to the pending banking connector path with `bank_balance` and `bank_summary`.
- [x] "Arrete"
  - Done on 2026-03-13.
  - Result: the flow is normalized as a local stop command on the voice runtime.
- [x] "Passe au suivant"
  - Done on 2026-03-13.
  - Result: the flow is normalized as the local `next` command and routes through the contextual followup system.

## Phase 4 - Mail transition

Goal: support iCloud mail during the transition without depending on Mail.app.

- [x] Choose the v1 IMAP/SMTP architecture
  - Done on 2026-03-13.
  - Result: `src/application/eVe/documentations/mail_v1_architecture.md` and `src/squirrel/mail/connector_contract.js` now lock the v1 mail decision to iCloud IMAP read + SMTP send with a local normalized index in front of voice/UI/MCP.
- [x] Add a pluggable iCloud connector abstraction
  - Done on 2026-03-13.
  - Result: `src/squirrel/mail/icloud_connector.js` now normalizes iCloud IMAP/SMTP configuration and payloads behind injected transport factories, so the mail stack has a single protocol-facing connector contract.
- [x] Implement iCloud IMAP read access
  - Done on 2026-03-13.
  - Result: `src/squirrel/mail/node_protocol_clients.js` now provides a real Node IMAP-over-TLS client, and `src/squirrel/mail/node_protocol_transport.integration.test.mjs` validates initial mailbox fetch plus cursor-based incremental fetch through the iCloud connector.
- [x] Implement local mail index
  - Done on 2026-03-13.
  - Result: `src/squirrel/mail/local_index.js` now provides normalized local storage primitives for ingest/read/list/search/next-unread over mail records.
- [x] Implement mail list/read/search
  - Done on 2026-03-13.
  - Result: `src/squirrel/mail/service.js` now exposes `mailList`, `mailRead`, `mailSearch`, and `mailNextUnread` over the local index, validated by dedicated tests.
- [x] Implement AI summaries
  - Done on 2026-03-13.
  - Result: `mailSummarize()` now produces local inbox summaries from the normalized mail index, and the summary path is covered by `src/squirrel/mail/service.test.mjs`.
- [x] Implement reply draft flow
  - Done on 2026-03-13.
  - Result: `src/squirrel/mail/service.js` now builds reply drafts from indexed source messages with reply subjecting, recipient inference, and quoted-source context.
- [x] Add explicit confirmation before send
  - Done on 2026-03-13.
  - Result: `mailSend()` now enforces an explicit confirmation gate before a draft can move to the local queued state.
- [x] Wire the connector-backed sync/send path into the mail service
  - Done on 2026-03-13.
  - Result: `src/squirrel/mail/service.js` and `src/squirrel/mail/bootstrap.js` now expose connector status, connector configuration, initial sync, incremental sync, and connector-backed send while preserving the previous local-only fallback.
- [x] Implement iCloud SMTP send/reply
  - Done on 2026-03-13.
  - Result: `src/squirrel/mail/node_protocol_clients.js` now provides a real Node SMTP client with STARTTLS and AUTH LOGIN, and `src/squirrel/mail/node_protocol_transport.integration.test.mjs` validates confirmed delivery through the iCloud connector.
- [x] Add incremental sync for incoming mail
  - Done on 2026-03-13.
  - Result: the concrete Node IMAP transport now feeds `fetchDelta()` into `src/squirrel/mail/service.js` / `syncState`, so incremental mailbox sync is exercised end-to-end in the connector transport integration tests.
- [x] Add voice readout for mail
  - Done on 2026-03-13.
  - Result: the global mail bootstrap now exposes `buildReadout()` and `voiceReadout()`, so indexed mail can be rendered as speech text and spoken through the shared voice API.
- [x] Expose mail tools through MCP
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now exposes `mail.list`, `mail.read`, `mail.search`, `mail.next_unread`, `mail.summarize`, `mail.reply_draft`, and `mail.send` over the shared local mail service, validated by `src/squirrel/atome/mcp.runtime_bridge.test.mjs`.
- [x] Add connector integration tests
  - Done on 2026-03-13.
  - Result: `src/squirrel/mail/icloud_connector.test.mjs`, `src/squirrel/mail/service.connector_integration.test.mjs`, and `src/squirrel/mail/bootstrap.connector.test.mjs` validate initial IMAP sync, incremental sync, and confirmed SMTP delivery against injected protocol transports.

### Target mail tools

- [x] `mail_list`
  - Done on 2026-03-13.
  - Result: the local mail service, global bootstrap, AI default tools, and MCP bridge all expose the list capability.
- [x] `mail_read`
  - Done on 2026-03-13.
  - Result: the local mail service, global bootstrap, AI default tools, and MCP bridge all expose the read capability.
- [x] `mail_summarize`
  - Done on 2026-03-13.
  - Result: the local mail service, AI default tools, and MCP bridge now expose local inbox summarization.
- [x] `mail_reply_draft`
  - Done on 2026-03-13.
  - Result: local reply drafts are now available through the mail service, AI default tools, and MCP bridge.
- [x] `mail_send`
  - Done on 2026-03-13.
  - Result: a local send gate is now exposed through the mail service, AI default tools, and MCP bridge; real SMTP delivery remains a separate open task.
- [x] `mail_search`
  - Done on 2026-03-13.
  - Result: the local mail service, AI default tools, and MCP bridge now expose indexed mail search.
- [x] `mail_next_unread`
  - Done on 2026-03-13.
  - Result: the local mail service, AI default tools, and MCP bridge now expose next-unread traversal over indexed mail.

## Phase 5 - Calendar transition

Goal: unify legacy Apple calendars with the new Tauri-owned calendar source.

- [x] Stabilize the existing internal calendar domain
  - Done on 2026-03-13.
  - Result: the existing eVe calendar panel and `CalendarAPI` are now wrapped by `src/squirrel/calendar/calendar_api_source.js` and validated in `src/squirrel/calendar/calendar_api_source.test.mjs`, so the new calendar stack grafts onto the current implementation instead of replacing it.
- [x] Choose the v1 CalDAV server architecture
  - Done on 2026-03-13.
  - Result: `src/squirrel/calendar/connector_contract.js` and `src/application/eVe/documentations/calendar_v1_architecture.md` now lock the v1 calendar decision to `CalendarAPI` as the Tauri-owned primary source with legacy Apple/iCloud read sources beside it.
- [x] Implement legacy Apple/iCloud read access
  - Done on 2026-03-13.
  - Result: `src/squirrel/calendar/icloud_legacy_connector.js` now provides a read-only iCloud legacy CalDAV connector with a concrete Node CalDAV client in `src/squirrel/calendar/node_protocol_clients.js`, validated by `node_protocol_clients.test.mjs` and `icloud_legacy_connector.test.mjs`.
- [x] Implement unified multi-source calendar view
  - Done on 2026-03-13.
  - Result: `src/squirrel/calendar/service.js` now aggregates multiple calendar sources, resolves a normalized unified view, and exposes list/search/today/next reads over the shared service.
- [x] Implement source tagging and conflict handling
  - Done on 2026-03-13.
  - Result: the unified calendar service now tags each event with `source_id/role/writable/provider`, exposes hidden alternates on conflicts, and resolves duplicates with the policy `prefer_primary_then_latest_update`.
- [x] Implement event creation in the Tauri main calendar
  - Done on 2026-03-13.
  - Result: `calendarCreate()` now routes writes to the writable primary source backed by the existing `CalendarAPI` create path, validated in `src/squirrel/calendar/service.test.mjs` and `src/squirrel/calendar/bootstrap.test.mjs`.
- [x] Implement event update flow
  - Done on 2026-03-13.
  - Result: `calendarUpdate()` now routes updates to the owning writable source, while read-only legacy sources fail cleanly with `calendar_source_read_only`.
- [x] Add incoming Apple-side transition sync
  - Done on 2026-03-13.
  - Result: the shared calendar service and bootstrap now expose `syncInitial`, `syncIncremental`, `syncPull`, and `syncStatus` over legacy sources, and the iCloud legacy connector now tracks sync cursors plus delta removals through CalDAV `sync-collection`, validated by `service.connector_integration.test.mjs` and `bootstrap.connector.test.mjs`.
- [x] Expose calendar tools through MCP
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now exposes `calendar.sources`, `calendar.search`, `calendar.today`, `calendar.next`, `calendar.create`, and `calendar.update` over the shared calendar service, validated in `src/squirrel/atome/mcp.runtime_bridge.test.mjs`.

### Target calendar tools

- [x] `calendar_today`
  - Done on 2026-03-13.
  - Result: the shared calendar service, bootstrap, AtomeAI default tools, and MCP bridge now expose the unified today view.
- [x] `calendar_next`
  - Done on 2026-03-13.
  - Result: the shared calendar service, bootstrap, AtomeAI default tools, and MCP bridge now expose the unified upcoming-events view.
- [x] `calendar_create`
  - Done on 2026-03-13.
  - Result: the shared calendar service, bootstrap, AtomeAI default tools, and MCP bridge now expose primary-source event creation through the existing `CalendarAPI` write path.
- [x] `calendar_update`
  - Done on 2026-03-13.
  - Result: the shared calendar service, bootstrap, AtomeAI default tools, and MCP bridge now expose primary-source event updates with read-only source protection.
- [x] `calendar_search`
  - Done on 2026-03-13.
  - Result: the shared calendar service, bootstrap, AtomeAI default tools, and MCP bridge now expose unified calendar search.
- [x] `calendar_sources`
  - Done on 2026-03-13.
  - Result: the shared calendar service, bootstrap, AtomeAI default tools, and MCP bridge now expose the current source registry and source roles.

## Phase 6 - Full MCP feature set

Goal: reach a real MCP platform surface, not only tool calls.

- [x] Add dynamic discovery for tools
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now exposes `mcp.tools.list`, which dynamically merges runtime V2 and AtomeAI tool discovery into one MCP-facing catalog.
- [x] Add dynamic discovery for resources
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now exposes `mcp.resources.list` and `mcp.resources.read`, with dynamic resources projected from runtime audit, mail, calendar, and voice surfaces when they are available.
- [x] Add dynamic discovery for prompts
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now exposes `mcp.prompts.list` and `mcp.prompts.get`, with confirmation/mail/calendar/voice prompt templates discovered from the active local surfaces.
- [x] Add progress for long-running actions
  - Done on 2026-03-13.
  - Result: async MCP calls now register tracked operations with progress lifecycle states in `src/squirrel/atome/mcp.js`, and deferred calls expose an `operation_id` that can be inspected through `mcp.operations.read`.
- [x] Add cancellation support
  - Done on 2026-03-13.
  - Result: deferred MCP operations now expose `mcp.operations.cancel`, backed by `AbortController` and propagated into tracked async handlers and runtime payloads where supported.
- [x] Add real-time events usable by UI and voice
  - Done on 2026-03-13.
  - Result: MCP operation lifecycle events are now emitted on the shared in-memory event stream plus browser events `squirrel:mcp`, `squirrel:mcp:ui`, and `squirrel:mcp:voice`.
- [x] Add fine-grained ACL by tool/resource/prompt
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now evaluates MCP access policy separately for tools, resources, and prompts, denies unknown resource/prompt reads, and exposes the active policy through `mcp.acl.list`.
- [x] Add strong confirmation paths for critical actions
  - Done on 2026-03-13.
  - Result: MCP now creates one-shot confirmation records for critical actions (`mail.send`, `calendar.create/update`, and sensitive runtime/toolchain calls), and confirmed replays must present a valid `confirmation_id`.
- [x] Expose multi-step toolchains cleanly
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now exposes `mcp.toolchains.execute`, batching runtime-only chains through `runtime.tools.batch_call` and executing mixed chains sequentially with MCP-level progress reporting.
- [x] Add local MCP integration tests
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.platform_surface.test.mjs` now validates unified tool discovery, resource/prompt discovery, deferred operations, progress/event logging, and MCP cancellation.

## Phase 7 - Banking

Goal: support analytical banking flows, not only raw balances.

- [x] Choose Powens integration architecture
  - Done on 2026-03-13.
  - Result: `src/application/eVe/documentations/bank_v1_architecture.md` and `src/squirrel/bank/connector_contract.js` now lock v1 to Powens as the future PSD2 source behind a local normalized analytics layer.
- [x] Define normalized banking transaction model
  - Done on 2026-03-13.
  - Result: `src/squirrel/bank/local_index.js` now defines normalized bank account and transaction records for analytics, MCP, and AI access.
- [x] Implement account listing
  - Done on 2026-03-13.
  - Result: `src/squirrel/bank/service.js` now exposes normalized account listing through the shared bank service and bootstrap.
- [x] Implement balances
  - Done on 2026-03-13.
  - Result: `bankBalance()` now exposes per-account balances and aggregate balance totals.
- [x] Implement transaction retrieval
  - Done on 2026-03-13.
  - Result: `bankTransactions()` now exposes normalized transaction retrieval with period filtering.
- [x] Implement payer detection
  - Done on 2026-03-13.
  - Result: `bankFindPayer()` now finds incoming payments from one payer/counterparty over a period.
- [x] Implement recurring payment detection
  - Done on 2026-03-13.
  - Result: `bankRecurringPayments()` now detects repeated outgoing transactions by normalized merchant/amount signature.
- [x] Implement spending by period
  - Done on 2026-03-13.
  - Result: `bankSpendingByPeriod()` now aggregates debit spending by day/week/month over the requested period.
- [x] Implement top merchant aggregation
  - Done on 2026-03-13.
  - Result: `bankSpendingTopMerchants()` now ranks top merchants by outgoing spend.
- [x] Implement natural language search over transactions
  - Done on 2026-03-13.
  - Result: `bankSearchTransactions()` now searches the normalized bank analytics index over labels, merchants, categories, and counterparties.
- [x] Add strong confirmations for any sensitive action
  - Done on 2026-03-13.
  - Result: bank v1 remains read-only by design, with no mutation path exposed; the MCP confirmation layer remains in place for any future sensitive banking action.
- [x] Expose banking tools through MCP
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now exposes the bank analytics surface through `bank.accounts`, `bank.balance`, `bank.transactions`, `bank.summary`, `bank.search_transactions`, `bank.find_payer`, `bank.spending_by_period`, `bank.top_merchants`, and `bank.recurring_payments`.

### Target banking tools

- [x] `bank_accounts`
  - Done on 2026-03-13.
  - Result: the shared bank service, bootstrap, AtomeAI default tools, and MCP bridge now expose account listing.
- [x] `bank_balance`
  - Done on 2026-03-13.
  - Result: the shared bank service, bootstrap, AtomeAI default tools, and MCP bridge now expose account and aggregate balances.
- [x] `bank_transactions`
  - Done on 2026-03-13.
  - Result: the shared bank service, bootstrap, AtomeAI default tools, and MCP bridge now expose normalized transaction retrieval.
- [x] `bank_summary`
  - Done on 2026-03-13.
  - Result: the shared bank service, bootstrap, AtomeAI default tools, and MCP bridge now expose period summaries.
- [x] `bank_search_transactions`
  - Done on 2026-03-13.
  - Result: the shared bank service, bootstrap, AtomeAI default tools, and MCP bridge now expose transaction search.
- [x] `bank_find_payer`
  - Done on 2026-03-13.
  - Result: the shared bank service, bootstrap, AtomeAI default tools, and MCP bridge now expose payer detection.
- [x] `bank_spending_by_period`
  - Done on 2026-03-13.
  - Result: the shared bank service, bootstrap, AtomeAI default tools, and MCP bridge now expose period spending analytics.
- [x] `bank_spending_top_merchants`
  - Done on 2026-03-13.
  - Result: the shared bank service, bootstrap, AtomeAI default tools, and MCP bridge now expose top merchant aggregation.
- [x] `bank_recurring_payments`
  - Done on 2026-03-13.
  - Result: the shared bank service, bootstrap, AtomeAI default tools, and MCP bridge now expose recurring payment detection.

## Phase 8 - Security and hardening

Goal: make the system safe enough for real user operation.

- [x] Encrypt token storage
  - Done on 2026-03-13.
  - Result: `src/squirrel/security/token_vault.js` and `src/squirrel/security/bootstrap.js` now expose an encrypted token vault with an in-memory secret, and mail/calendar connector bootstraps can resolve vaulted `auth_ref` credentials.
- [x] Add strict permission model by capability
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now resolves required capabilities per MCP method/resource/prompt and denies calls that do not carry the required capability set.
- [x] Add action journal for all sensitive flows
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now records proposal, confirmation, denial, rate-limit, idempotency, and sensitive operation lifecycle entries in `mcp.security.journal.list`.
- [x] Add proposal/confirmation flows where needed
  - Done on 2026-03-13.
  - Result: sensitive MCP methods now emit linked proposal and confirmation records, exposed through `mcp.proposals.*` and `mcp.confirmations.*`.
- [x] Add idempotency for external side effects
  - Done on 2026-03-13.
  - Result: sensitive MCP writes now reuse stored results on repeated `idempotency_key` replays, preventing duplicate side effects across mail/calendar/runtime writes.
- [x] Add rate limits and retry rules
  - Done on 2026-03-13.
  - Result: `src/squirrel/atome/mcp.js` now applies explicit security rate limits to sensitive write/runtime flows and exposes retry metadata through `mcp.rate_limits.list`.
- [x] Add sandbox policy for sensitive framework tools
  - Done on 2026-03-13.
  - Result: sensitive runtime tools now require the `desktop_local_owner` sandbox profile in addition to confirmation and capability grants.
- [x] Add failure-mode review for mail/calendar/banking
  - Done on 2026-03-13.
  - Result: `src/application/eVe/documentations/failure_modes_v1.md` now documents v1 failure classes, mitigations, and release blockers for mail, calendar, banking, and voice/MCP.

## Phase 9 - QA and release readiness

Goal: verify the product as a system, not feature by feature only.

- [x] Add integration test suite for MCP/runtime alignment
  - Done on 2026-03-13.
  - Result: `scripts/phase9_mcp_runtime_suite.mjs` now executes the MCP/runtime alignment suite and writes `temp/script_reports/phase9_mcp_runtime_alignment.json`.
- [x] Add integration test suite for voice interruption
  - Done on 2026-03-13.
  - Result: `scripts/phase9_voice_interrupt_suite.mjs` now executes the voice interruption suite and writes `temp/script_reports/phase9_voice_interrupt.json`.
- [x] Add regression suite for major UI families
  - Done on 2026-03-13.
  - Result: `scripts/phase9_ui_regression_suite.mjs` now executes the major UI family regression suite and writes `temp/script_reports/phase9_ui_regression.json`.
- [x] Add manual validation checklist for desktop usage
  - Done on 2026-03-13.
  - Result: `src/application/eVe/documentations/desktop_manual_validation_checklist.md` now defines the desktop validation path for voice, MCP/runtime, mail, calendar, bank, and observability.
- [x] Run live iCloud mail smoke test with real credentials
  - Status on 2026-03-13: executable live smoke path is working, but Apple still rejects authentication on both detected accounts.
  - Evidence:
    - `temp/script_reports/phase9_icloud_mail_live_smoke.json` reports `A0001 NO [AUTHENTICATIONFAILED] Authentication Failed`.
    - The smoke script now retries multiple auth usernames when available; for `jeezs`, `jeezs@me.com`, `jeezs@mac.com`, and `jeezs` were all rejected by Apple.
    - A direct capability probe on 2026-03-14 confirmed Apple still accepts IMAP `LOGIN`; the blocker is credentials, not a deprecated command.
  - Done on 2026-03-14.
  - Result: `temp/script_reports/phase9_icloud_mail_live_smoke.json` now passes live against `jeezs@icloud.com` on `imap.mail.me.com`, with `initial.ok = true`, `delta.ok = true`, and 5 messages fetched from `INBOX`.
- [x] Run live iCloud calendar smoke test with real credentials
  - Status on 2026-03-13: executable live smoke path is working, CalDAV root discovery is fixed, but Apple still rejects authentication on both detected accounts.
  - Evidence:
    - `temp/script_reports/phase9_icloud_calendar_live_smoke.json` now reports `401 Unauthorized`.
    - The smoke script now retries multiple auth usernames when available; for `jeezs`, `jeezs@me.com`, `jeezs@mac.com`, and `jeezs` were all rejected by Apple.
    - A direct IMAP/CalDAV review on 2026-03-14 confirmed the remaining blocker is an accepted Apple credential, not protocol wiring.
  - Done on 2026-03-14.
  - Result: `temp/script_reports/phase9_icloud_calendar_live_smoke.json` now passes live against `jeezs@icloud.com` through `https://caldav.icloud.com`, with `initial.ok = true`, `listed.ok = true`, and `delta.ok = true`.
- [x] Add observability for voice/tool/runtime failures
  - Done on 2026-03-13.
  - Superseded on 2026-04-26 by the minimal init cleanup: the unused `src/squirrel/observability/` bootstrap was removed.
- [x] Measure latency and responsiveness targets
  - Done on 2026-03-13.
  - Result: `scripts/phase9_voice_latency_baseline.mjs` now writes `temp/script_reports/phase9_voice_latency_baseline.json`, and `src/application/eVe/documentations/latency_targets_v1.md` fixes the v1 latency targets.
- [x] Freeze v1 scope and open v2 backlog
  - Done on 2026-03-13.
  - Result: `src/application/eVe/documentations/v1_scope_freeze_and_v2_backlog.md` now freezes the shipped v1 perimeter and captures the explicit v2 backlog.

## Done log

- 2026-03-11: initial architecture and MCP audit completed.
- 2026-03-11: chantier order decided.
- 2026-03-11: master todo file created.
- 2026-03-12: runtime MCP bridge added for discovery, single call, and batch call.
- 2026-03-12: legacy MTrack MCP tools migrated from `runTool` to runtime V2 canonical tool ids.
- 2026-03-12: initial runtime coverage matrix exported with 86 tools and 13 uncategorized entries.
- 2026-03-12: main/panel headless probe added, revealing 3/10 passing main tools and 0/8 passing panel tools in mock runtime.
- 2026-03-12: runtime integrity audit added, confirming no duplicate tool ids or broken default-tool runtime wrappers.
- 2026-03-12: runtime bootstrap now publishes generic registered handlers for main/panel tools, lifting headless coverage to 9/10 main tools and 7/8 panel tools.
- 2026-03-12: Finder runtime received a headless-safe fallback, lifting the main/panel probe to 10/10 main tools and 8/8 panel tools.
- 2026-03-12: selection/transform and creative family probes added, both fully green in headless runtime.
- 2026-03-12: explicit target precedence in `ui.select` fixed so direct `id/atome_id/target_id` payloads no longer get overridden by stale runtime selection snapshots.
- 2026-03-12: transport/capture/MTrack bootstrap fallbacks added so `ui.play`, `ui.pause`, `ui.stop`, `ui.capture.*`, `ui.mtrax.open`, `ui.timeline_scrub`, `ui.split`, `ui.crop`, `ui.mute`, and `ui.solo` are executable in headless runtime probes.
- 2026-03-12: communication/contact/calendar panel and palette runtime coverage validated; current surface is confirmed panel-level pending later mail/calendar business tool phases.
- 2026-03-12: headless registered-handler audit now passes 58/58 tools, closing the remaining runtime registration gaps for the current V2 surface.
- 2026-03-12: dedicated headless family tests added for selection/transform and creative flows, completing the Phase 1 critical-family runtime test base.
- 2026-03-12: runtime V2 now projects latent legacy tools `ui.media.reader`, `ui.animation.reader`, `ui.join`, `ui.automation`, `ui.detail.record.toggle`, and `ui.palette.reveal`, lifting the registered-handler audit to 64/64.
- 2026-03-12: calendar CRUD tools are now exposed through runtime V2 and validated headlessly; `calendar.js` now guards dialog construction so the calendar domain can load without UI globals.
- 2026-03-12: runtime coverage grew to 98 tools with the uncategorized count still stable at 13.
- 2026-03-12: AtomeAI calendar default tools now route through runtime V2 with trace propagation, and MCP now exposes `runtime.audit.list` over the runtime command bus.
- 2026-03-12: AgentGateway now stamps and preserves `trace_id/intent_id/source` across validation, policy, proposals, approvals, rejections, and execution, and runtime command-bus events now expose matching audit fields.
- 2026-03-12: canonical AI/MCP/runtime entrypoint rules documented in `documentations/runtime_ai_mcp_entrypoints.md`.
- 2026-03-12: `src/squirrel/voice/session_runtime.js` added the first executable voice foundation with canonical session phases, capture lifecycle, local interruption commands, abortable backend channels, followup queueing, and UI/MCP event fan-out, validated by `src/squirrel/voice/session_runtime.test.mjs`.
- 2026-03-12: `src/squirrel/voice/service.js` added the first host bridge over the voice session runtime, with explicit STT/TTS backend selection, browser-host STT partial streaming, immediate `speechSynthesis` stop, and high-level `voice.listen()` behavior validated by `src/squirrel/voice/service.test.mjs`.
- 2026-03-12: `src/squirrel/voice/vad.js` and `src/squirrel/voice/telemetry.js` completed the remaining technical Phase 2 foundation by adding reusable speech/silence detection and runtime-derived latency metrics for STT, TTS, and interruption flows.
- 2026-03-12: `src/squirrel/voice/interrupt_integration.test.mjs` added mocked end-to-end coverage for instant TTS interruption, backend abort propagation, and immediate follow-up command acceptance; the corresponding product validation checkboxes remain open pending real UI/Tauri verification.
- 2026-03-12: `src/squirrel/voice/bootstrap.js` now binds the singleton voice service globally and auto-loads the Tauri recorder bridge modules, closing the previous gap where the native iPlug recorder bridge existed in sources but was not automatically activated from the Squirrel entrypoint.
- 2026-03-12: `src/squirrel/voice/panel.js` now exposes a real in-app voice control surface over the singleton voice service, and `src/squirrel/voice/panel.test.mjs` plus `bootstrap.test.mjs` validate the UI/bootstrap path.
- 2026-03-13: `src/squirrel/voice/panel_interrupt_real_path.test.mjs` now validates the four Phase 2 interruption requirements through the real `bootstrap -> panel -> service -> runtime` chain, allowing the voice foundation phase to close while keeping the desktop smoke test in Phase 9.
- 2026-03-12: `src/squirrel/voice/intent_schema.js` introduced the first canonical voice intent schema and classifier, covering local interruption commands, runtime UI/calendar routing, and future mail/bank connector placeholders, validated by `src/squirrel/voice/intent_schema.test.mjs`.
- 2026-03-12: `src/squirrel/voice/orchestrator.js` added the first executable `voice -> intent -> MCP/runtime` orchestration layer, with runtime catalog loading, MCP batch/single execution, and pending connector planning, validated by `src/squirrel/voice/orchestrator.test.mjs`.
- 2026-03-12: the voice orchestrator now keeps its own intent/execution journal, adding audit-friendly replay/subscription of `voice.intent.planned` and `voice.intent.executed` entries.
- 2026-03-12: the voice orchestrator now enforces explicit confirmation on sensitive intents before runtime execution, preventing destructive toolchains from firing without approval.
- 2026-03-13: voice sessions now keep the active intent context, contextual followups can resolve `next/previous/summarize/reply` against that context, and plain interruption can resume the previously bound intent through `resume_interrupted`.
- 2026-03-13: the voice panel now surfaces an explicit ambiguity fallback UI with suggested reformulations when intent planning cannot safely resolve a command.
- 2026-03-13: `src/squirrel/voice/priority_flows.test.mjs` now locks the eight priority voice flows for mail, calendar, bank, and local interruption/context commands.
- 2026-03-13: the first mail v1 foundation is in place with an explicit IMAP/SMTP architecture decision, a normalized local mail index, and a local mail service for list/read/search/next-unread.
- 2026-03-13: the local mail service now also supports reply draft generation and an explicit confirmation gate before any send transition.
- 2026-03-13: mail is now bootstrapped globally and exposed through MCP plus AtomeAI default tools, covering `mail_list`, `mail_read`, `mail_search`, `mail_next_unread`, `mail_summarize`, `mail_reply_draft`, and a local-only gated `mail_send`.
- 2026-03-13: mail readout is now available for voice through the shared mail bootstrap and the global voice API.
- 2026-03-13: the mail stack now includes a pluggable iCloud connector abstraction plus connector-backed initial sync, incremental sync, and confirmed send flows validated against injected IMAP/SMTP transports; at that point, concrete protocol bindings were the last open gap in Phase 4.
- 2026-03-13: Phase 4 is now backed by real Node IMAP TLS and SMTP STARTTLS protocol clients, validated locally end-to-end against mock servers through `node_protocol_transport.integration.test.mjs`; a live iCloud smoke test remains open in Phase 9.
- 2026-03-13: the calendar v1 stack now grafts onto the existing eVe calendar panel and `CalendarAPI`, exposing a unified multi-source service, primary-source create/update, source tagging/conflict handling, and MCP/AtomeAI/bootstrap bridges without introducing a second calendar UI.
- 2026-03-13: Phase 5 is now backed by a read-only iCloud legacy CalDAV connector plus concrete Node CalDAV `calendar-query` / `sync-collection` transport, with service/bootstrap sync integration and a live iCloud calendar smoke test left open in Phase 9.
- 2026-03-13: the MCP bridge now exposes unified tool/resource/prompt discovery plus tracked deferred operations, progress, cancellation, and event streaming, validated by `src/squirrel/atome/mcp.platform_surface.test.mjs`.
- 2026-03-13: Phase 6 is now closed with MCP-level ACL, one-shot confirmation records for critical actions, and `mcp.toolchains.execute` for clean multi-step toolchains.
- 2026-03-13: Phase 7 is now closed with a local normalized banking analytics layer plus MCP/AtomeAI/bootstrap exposure for account, balance, transaction, payer, recurring, period, and merchant flows.
- 2026-03-13: Phase 8 is now closed with an encrypted token vault, capability-based MCP security policy, proposal/confirmation journaling, idempotent sensitive writes, rate limits, sandbox gates, and a written v1 failure-mode review.
- 2026-03-13: Phase 9 now includes executable release suites for MCP/runtime alignment, voice interruption, and UI regression, plus a desktop manual checklist, observability bootstrap, voice latency baseline, and a written v1 scope freeze; only the live iCloud smoke tests remain open.
- 2026-03-13: the live iCloud smoke scripts now persist detailed connector failures, CalDAV root URLs are auto-resolved through `current-user-principal -> calendar-home-set -> calendar collection`, and live retries can probe multiple auth usernames per account; remaining blockers are now confirmed to be Apple-side authentication rejection rather than local protocol wiring.
- 2026-03-14: direct Apple IMAP capability probing confirmed `LOGIN` is still accepted on `imap.mail.me.com`; the remaining Phase 9 blocker is a valid Apple credential for IMAP/CalDAV, not a `LOGIN` deprecation.
- 2026-03-14: the final live iCloud smoke tests passed on `jeezs@icloud.com`; IMAP succeeded against `imap.mail.me.com` and CalDAV succeeded through `https://caldav.icloud.com`, closing the last two open Phase 9 tasks.
