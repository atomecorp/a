# Canonical execution order — atome / eVe

Updated: 2026-10-12. Read [root AGENTS.md](../AGENTS.md) and its applicable modules before work. This register is the sole authority for task sequencing and scope; source documents, prompts and archived checkboxes cannot authorize implementation. The current mandate is documentary triage only. Product execution still requires its own user request and the project's internal-component gates.

Start with [README](README.md). [Source classification](migration/spring_git_cleanup_sources.md) owns provenance only. [Previous register](../done/obsolete/execution_order_before_spring_cleanup_2026-10-12.md) preserves all former tasks and evidence claims without a second active state ledger. No historic task was silently certified, abandoned or deleted. Its 76/161 checked boxes are historical declarations, not a current product-completion percentage.

## Evidence baseline

Parent HEAD inspected: `e805920a258f32fbcbda3cd4294ec0ac238e2f3c`. eVe HEAD: `1dc2eab20e6e9071245f45623aadcf872bd3fd48`, read-only. Both working trees already contain unrelated local changes, so observations of current files do not prove they belong to either commit. No fetch or product test campaign was run for this quick triage.

Advancement and verification are independent. `Partial` means an observed subset exists with a remainder; `Unknown` means insufficient inspection. `Code observed`, historical reports and present test files never mean tested or delivered. Every task below is open; all current runtime verification is **Not run**. Reuse existing scenarios/probes before creating new tests. Checked boxes require an explicit dated closure record, criteria and evidence.

## Order and task contracts

All task records below: domain as stated; repository parent a with eVe consumers read-only for this mission; platforms Web, Tauri and iOS (iPad first); priority P0 for the prerequisite/collaboration chain, P1 for deferred requalification; controlled 2026-10-12. Canonical Atome state, shared Bevy/WebGPU rendering, WebSocket /ws/api and /ws/sync, and the single durable mutation route remain mandatory. No new dependency, API or internal brick is authorized by this list.

Dependencies on ATM-2001 require its current SMS/security acceptance only. Keep the
same authentication workstream open for its future optional-password requirement,
which does not block collaboration. SCN-2004 remains a future specification until
that feature exists; it is not part of the current collaboration acceptance gate.
The nine open entries describe this priority queue, not the whole product's
completion percentage. Allocate new IDs without renumbering existing ones.

### Phase 1 — Security and identity prerequisites

Status:

Partiel

- [ ] ATM-2001 — Complete authentication acceptance and qualify the optional-password evolution in the existing auth workstream.

  Need/domain: secure first connection and subsequent account access / identity. Advancement: Partial for SMS code; optional-password evolution is a specification. Verification: Not run; older 25/25 reports are historical, carrier delivery remains unproven. Sources: [phone-link status](auth_phone_link_implementation.md), [auth backlog](communication_social/user_auth.md), [password migration](cleanup_architecture/argon2id_password_hash_migration.md), imported Authentication security and Next Task. Evidence: server/auth_phone_link.js start/confirm and atome/src/squirrel/security/auth_phone_link_client.js resume/consume were inspected; commit 3d56e258 touches the server owner, with no delivery inference. Depends on: authorized SMS access, real test devices and isolated accounts. Next: execute the existing focused auth acceptance, then a real SMS handoff. Exit: delivery, originating-device proof, expiry/replay rejection and restart are evidenced per platform; future password criteria remain explicitly separate until implemented. First connection stays SMS; a verified user may later set an optional password inside the account and choose password or SMS after entering the phone number. That future password feature is not a prerequisite for sharing. Scenarios: SCN-2001 and SCN-2004.

- [ ] ATM-2002 — Verify stable identity, explicit provisioning and private-by-default data before collaboration.

  Need/domain: sharing must identify accounts and enforce authorization without exposing private data / security. Advancement: Unknown as a complete chain. Verification: Not run. Sources: todo/cleanup_architecture/stable_user_identity_independent_of_phone.md, todo/cleanup_architecture/explicit_cross_runtime_account_provisioning.md, todo/cleanup_architecture/account_recovery_trusted_device_and_recovery_kit.md and archived Phase 1 / Phase 6 privacy criteria. Evidence: share-rights and server authorization paths are present; not a full security audit. Depends on: ATM-2001 SMS acceptance. Next: inspect the existing identity/provisioning and permission tests, then verify consent, revocation and secret-free payloads. Exit: phone changes do not change account identity; no shadow-account fallback; ACL and consent apply across clients, sync, search and offline projections; no password_hash or secrets in client payloads. Scenario: SCN-2002.

### Phase 2 — Durable data and recovery

Status:

Partiel

- [ ] ATM-2003 — Verify durable offline writes, canonical replay and central synchronization.

  Need/domain: keep work across disconnects and device changes / persistence. Advancement: Partial, owning modules and probes exist; full cross-device result unknown. Verification: Not run. Sources: imported Todo/Next Task.md, todo/2- Granularity_Validation.md, archived state/sync phases. Evidence: atome/src/squirrel/apis/unified/sync_engine.js and tests/server/ws_sync_runtime.test.mjs exist; source presence is not acceptance. Depends on: ATM-2001 and ATM-2002. Next: run existing targeted sync/replay probes, then offline/reconnect on isolated clients. Exit: durable event IDs, idempotence, authorized replay and unchanged history; atome.one remains central for shared synchronization, while local offline writes remain durable. Scenario: SCN-2003.

- [ ] ATM-2008 — Qualify and verify account backup, reinstall and restoration through existing owners.

  Need/domain: recover the same user's data without server loss / recovery. Advancement: Unknown end to end. Verification: Not run. Sources: imported User Backup and Format and Todo/Next Task.md; archived snapshots/history contracts. Depends on: ATM-2003 and a proven backup before any destructive local test. Next: identify the existing export/restore contract and preserve a reference dataset. Exit: same-account restoration preserves contents, hierarchy, media, metadata and permissions after local reset/reinstall on Web/Tauri/iPad; no production data or unsynchronized work is removed. Scenario: SCN-2003.

### Phase 3 — Sharing and collaboration, first product priority

Status:

Partiel

- [ ] ATM-2004 — Validate invitations, bounded acceptance, share modes, permissions and revocation.

  Need/domain: safely share objects/projects/files with another user / sharing. Advancement: Partial; server paths observed, client/platform acceptance unknown. Verification: Not run. Sources: todo/sharing_search_monitoring/Share_tool.md, todo/sharing_search_monitoring/sharing_to_code.md and archived Phase 6. Evidence: server/syncSharingService.js has mode/type selection, bounded policies and revoke; tests/server/sync_sharing_service.probe.mjs exists. Depends on: ATM-2001, ATM-2002 and ATM-2003. Next: reproduce two-account Fastify/Tauri sharing using real owners, confirm receiverProjectId/parent filtering before repair. Exit: linked realtime, linked manual and detached copy are distinct; acceptance policy is bounded/revocable; unauthorized reads/writes, expired grants and implicit privilege expansion are rejected. Scenario: SCN-2002.

- [ ] ATM-2005 — Verify concurrent editing, manual publication and offline conflict replay.

  Need/domain: collaborate without data or history loss / sync. Advancement: Unknown as a complete multi-client contract. Verification: Not run. Sources: imported Todo/Next Task.md, archived Phase 6 manual-delta and append-only last-write-wins criteria, todo/2- Granularity_Validation.md. Evidence: tests/server/offline_lww_conflicts.probe.mjs and ws_sync replay probes exist; not executed here. Depends on: ATM-2004. Next: run the existing conflict/replay probes, then simultaneous edits and reconnection with two isolated accounts. Exit: deterministic ties, preserved concurrent events, corrections as new events, no background propagation in manual mode, explicit delta publication, ACL/revocation enforced after reconnect. Scenarios: SCN-2002 and SCN-2003.

- [ ] ATM-2006 — Requalify communication, Matrix roles/identity and media integration against the canonical transport.

  Need/domain: collaborative conversations and calls / communication. Advancement: Unknown for the complete Matrix/Keycloak/mediasoup target; historical Communication closure is preserved separately. Verification: Not run. Sources: todo/communication_social/matrix.md, todo/communication_social/social_network_tool.md, todo/dev_ops/install_MediaSoup.md, todo/debug_communication_notifications_publications_2026-09-01.md. Depends on: ATM-2004; identify any additional prerequisite before implementation. Next: compare actual account/role and communication owners to these specifications, recording verified availability. Exit: bounded executable gaps and acceptance criteria identified without duplicate identity or transport; /ws/api and /ws/sync remain canonical; only the already documented media-plane exception may apply. Missing bricks or external dependencies require separate authorization. Scenario linkage remains to qualify; do not invent a completed scenario.

### Phase 4 — Permanent acceptance, then deferred backlog

Status:

Actif

- [ ] ATM-2007 — Reconcile and execute the priority permanent collaboration scenarios when prerequisites are ready.

  Need/domain: reproducible evidence for real users / acceptance. Advancement: Remaining consolidation and execution. Verification: Not run. Sources: todo/tests/, imported Extensive Test variants and Todo/Next Task.md. Depends on: ATM-2001 through ATM-2005; ATM-2008 before reset/reinstall scenarios, ATM-2006 for communication-specific runs. Next: consolidate decisive scenario variants into the existing test family, preserving unique requirements, then prepare isolated atome.one accounts and real clients. Exit: Web/Tauri/iPad matrix with real gestures, logs/pixels where applicable, results dated against SHA/build, explicit blocked/not-run cells and iPhone-only exceptions. Keep scenarios after bugs are closed. Scenarios: SCN-2001 through SCN-2004 plus the existing permanent corpus.

- [ ] ATM-2009 — Requalify the next deferred package after the collaboration prerequisites and gates.

  Need/domain: resume UI/media/AI/product work in a coherent order / backlog qualification. Priority: P1. Advancement: Unknown until the package is selected; historical completion remains attributed. Verification: Not run. Sources: historical register, specification families below and source index. Depends on: priority collaboration chain sufficiently stable and explicit selection of a package. Next: choose the next existing package, inspect canonical owners and its historical evidence, then refine this register rather than creating a second task ledger. Exit: the chosen package has bounded criteria, dependencies, platforms and applicable validation. This triage does not implement or certify the deferred backlog.

## Specification and historical scope registry

Registration below is provenance/reference coverage, not executable authorization. Only the task contracts above activate a bounded requirement. Other items remain specifications, historical reports or unqualified backlog; their imported imperatives and checkbox states have no current execution authority. Source-sensitive documents remain local and excluded from publication. todo/tests/ is permanent, transverse acceptance material, never a product ticket to delete.

Legacy phase correspondence: security/auth → ATM-2001/2002; state/sync → ATM-2003; snapshots/backup → ATM-2008; sharing → ATM-2004/2005; communication → ATM-2006; final validation → ATM-2007; panels/Molecule/media/cleanup/AI/deferred product packages → ATM-2009 qualification. This supersedes the old panels-first ordering and auth-after-sharing dependency. Earlier field-focus/password/OTP assumptions require current auth-contract qualification rather than blind execution.

- `todo/tests/`
- `todo/ui_bevy/`
- `todo/molecule/`
- `todo/New work/`
- `todo/media_handling/`
- `todo/sharing_search_monitoring/`
- `todo/cleanup_architecture/`
- `todo/audits/`
- `todo/rendering_graphics/`
- `todo/tools/`
- `todo/ai_voice/`
- `todo/midi/`
- `todo/dev_ops/`
- `todo/ui_bevy/bevy_panel_migration_guide.md`
- `todo/ui_bevy/component_convergence.md`
- `todo/ui_bevy/finder_html_line_migration_registry.md`
- `todo/ui_bevy/finder_place_map_package.md`
- `todo/audits/2026-07-14_framework_documentation_conformance.md`
- `done/obsolete/eVe_optimisations.md`
- `todo/cleanup_architecture/file_size_inventory_2026-07-14.md`
- `todo/dev_ops/developer-experience.md`
- `todo/molecule/PROJET_MOLECULE_DEBUG.md`
- `todo/New work/atome_songlist_full_spec.md`
- `todo/New work/atome_toolbox_addons_spec.md`
- `todo/audit_execution_plan.md`
- `todo/context_tools.md`
- `todo/perf_audit_2026-08-09.md`
- `todo/perf_parity_html.md`
- `todo/remote_session_audit.md`
- `done/molecule/molecule-status-2026-04-28.md`
- `todo/rendering_graphics/robust_bevy_regression_fix_prompt_en.md`
- `todo/sharing_search_monitoring/tool_monitor.md`
- `done/obsolete/tools_monitoring.md`
- `todo/text_caret_creation_contract.md`
- `done/planning_audit/execution_order_reconciliation_2026-07-16.md`
- `todo/1- condition.md`
- `todo/2- Granularity_Validation.md`
- `todo/cleanup_architecture/file_size_and_coding_standards_remediation.md`
- `done/urgent_task.md`
- `todo/eve_features/update_panel_refactor.md`
- `todo/eve_features/panel_tools_above_footer_band.md`
- `todo/eve_features/panel_overflow_direction_indicators.md`
- `todo/molecule/molecule_sanitizer.md`
- `todo/media_handling/MTraX_edition.md`
- `todo/molecule/molecule_tests.md`
- `todo/molecule/molecule_trouble_solving.md`
- `todo/molecule/molecule_rename_mtrack_to_molecule.md`
- `done/media_handling/RECORDING_INTEGRATION_PLAN.md`
- `done/media_handling/video_recording_and_preview.md`
- `todo/molecule/NewMolecules.md`
- `maps/API_MAP.md`
- `maps/ARCHITECTURE_MAP.md`
- `maps/CODEMAP.md`
- `maps/DESIGN_MAP.md`
- `done/websocket_only_atome_transport.md`
- `todo/cleanup_architecture/authenticated_permission_scoped_ws_sync.md`
- `todo/cleanup_architecture/stable_user_identity_independent_of_phone.md`
- `todo/cleanup_architecture/explicit_cross_runtime_account_provisioning.md`
- `todo/cleanup_architecture/argon2id_password_hash_migration.md`
- `todo/cleanup_architecture/production_sms_provider_boundary.md`
- `todo/cleanup_architecture/account_recovery_trusted_device_and_recovery_kit.md`
- `todo/cleanup_architecture/secure_auth_token_storage.md`
- `todo/cleanup_architecture/snapshot_accelerated_state_rebuild.md`
- `todo/ai_voice/time_machine_historical_branching.md`
- `todo/ai_voice/history_and_ai.md`
- `todo/cleanup_architecture/system_ui_component_ssot.md`
- `todo/cleanup_architecture/v2_full_migration_framework.md`
- `todo/eve_features/menu_interactions.md`
- `todo/eve_features/calendar_todos.md`
- `todo/eve_features/map_localization.md`
- `todo/communication_social/matrix_flower_context_menu.md`
- `todo/cleanup_architecture/eve_atome_master_cleanup_plan.md`
- `todo/ai_voice/eVe_MCP_APIS_Tools.md`
- `done/planning_audit/framework_security_audit_and_vulnerability_remediation.md`
- `todo/communication_social/user_auth.md`
- `todo/communication_social/apple_mail_security.md`
- `todo/sharing_search_monitoring/Share_tool.md`
- `todo/ai_voice/MCP_voice_control.md`
- `done/ai_voice/Full_vocal_AI_integration.md`
- `todo/media_handling/AV_APIS.md`
- `todo/media_handling/RUNNING_VIDEO_AUDIO_SYNC_PLAN.md`
- `done/media_handling/debug_ios_media_recorder.md`
- `todo/sharing_search_monitoring/sharing_to_code.md`
- `todo/sharing_search_monitoring/finder.md`
- `todo/sharing_search_monitoring/finder_UI.md`
- `todo/debug_communication_notifications_publications_2026-09-01.md`
- `todo/cleanup_architecture/framework_cleanup_and_ui_optimization_plan_2026-04-19.md`
- `todo/cleanup_architecture/deep_ux_performance_and_ios_boot_compliance.md`
- `todo/cleanup_architecture/ios_fullscreen_surface_compliance.md`
- `todo/tools/tool_sanitisation.md`
- `todo/eve_features/Notification_tool.md`
- `todo/ai_voice/AI_integration_problems_to_solve.md`
- `todo/ai_voice/AI_Integration.md`
- `todo/ai_voice/eVe_AI.md`
- `todo/ai_voice/eVe_code_editor.md`
- `todo/ai_voice/voice_recognition.md`
- `todo/midi/atome_midi_binding_system.md`
- `todo/midi/Midi_implementation.md`
- `todo/rendering_graphics/vector_editing_layer.md`
- `todo/rendering_graphics/universal_canvas.md`
- `todo/dev_ops/install_MediaSoup.md`
- `todo/communication_social/social_network_tool.md`
- `todo/eve_features/presets-system.md`
- `todo/dev_ops/api-sugar.md`
- `todo/dev_ops/npm-publication-checklist.md`
- `todo/dev_ops/rewrite_documentation.md`
- `todo/dev_ops/eve_website_publishing.md`
- `todo/ai_voice/ace_step_integration.md`
- `done/eve_features/prompt_modification_menu_mvp_v146_ios_touch_tests.md`
- `todo/communication_social/mail.md`
- `todo/communication_social/matrix.md`
- `todo/eve_features/eve_accessibility.md`
- `todo/eVe_plugin.md`
- `todo/problems.md`
- `todo/problems_fixes.md`
- `todo/!!!!atome_eve_liste_hierarchie_lecture_prompt.md`
- `todo/!!!!testflight_automation_prompt.md`
- `todo/!!!_urgent_debug.md`
- `todo/!urgent_corrections.md`
- `todo/0-finalise-features_AUDIT_PLAN.md`
- `todo/000_View Mode Correction.md`
- `todo/00_UI_spécifications__application.md`
- `todo/0_record_actions.md`
- `todo/0_stretch_samplig.md`
- `todo/3 - teleport.md`
- `todo/4 - finalise-hardening.md`
- `todo/5 - objectives.md`
- `todo/AI Audio Integration.md`
- `todo/AI Video Integration.md`
- `todo/AI_problem.md`
- `todo/Calendar Scheduled Actions.md`
- `todo/DSP_audio_engine.md`
- `todo/UI refactor.md`
- `todo/android.md`
- `todo/archive_user.md`
- `todo/assistant_debug_selection_tv.md`
- `todo/atome OS Audit.md`
- `todo/atome_better_modfiying_development .md`
- `todo/atome_plugin_api_SPEC.md`
- `todo/audit_isolation_2026-10-01.md`
- `todo/auth_phone_link_implementation.md`
- `todo/clipboard_host_bridge_2026-09-10.md`
- `todo/communication_refonte.md`
- `todo/context_menus_modes_spec_2026-09-20.md`
- `todo/contextual_taxonomy_2026-09-24.md`
- `todo/fond_ecran_telechargement_2026-08-22.md`
- `todo/full_native_atome.md`
- `todo/health_monitors.md`
- `todo/import_panel.md`
- `todo/intuition_liquid_menus.md`
- `todo/ios_assistant_key_2026-09-10.md`
- `todo/lecture_contextuelle_list_matrix_2026-08-19.md`
- `todo/menu_cleanup_2026-08-16.md`
- `todo/menu_regressions_2026-10-02.md`
- `todo/menu_solution_2026-09-24.md`
- `todo/modifications.md`
- `todo/molecule_drag_and_playback_2026-08-22.md`
- `todo/news_feature_2026-09-09.md`
- `todo/news_templates_stacking_2026-09-10.md`
- `todo/orchestrateur_test_et_reparations_2026-08-18.md`
- `todo/page_media_perf_list_playback_2026-09-20.md`
- `todo/page_record_fixes_2026-09-20.md`
- `todo/perf_audit_2026-10-07.md`
- `todo/project_view_zoom.md`
- `todo/record_page_placeholder_template_2026-09-19.md`
- `todo/teleport/00_audit.md`
- `todo/teleport/01_surface_registry.md`
- `todo/teleport/02_teleport_manager.md`
- `todo/teleport/03_render_filter_residual_proxy.md`
- `todo/teleport/04_contextual_tools.md`
- `todo/teleport/05_edge_intent_and_destinations.md`
- `todo/teleport/07_remote_control_trackpad.md`
- `todo/teleport/08_cross_user_permissions.md`
- `todo/teleport/09_resilience.md`
- `todo/teleport/10_completion.md`
- `todo/teleport/README.md`
- `todo/tool_rail_refonte_2026-09-24.md`
- `todo/video_clip_in_page_2026-09-20.md`
- `todo/atome_chat_GPT_Archives/`
- `todo/migration/`
- `todo/README.md`

Confirmed path corrections: the recording integration plan, video recording/preview and iOS recorder debug sources are under done/media_handling/; the completed editing-menu source is done/eve_features/prompt_modification_menu_mvp_v146_ios_touch_tests.md. Their archival locations do not constitute new test evidence.

## Maintenance

Keep this register after tasks close; do not delete the single authority or the permanent test corpus. Update advancement only against inspected code/diffs; update verification only against a dated run and its actual platforms. Link future commits with Refs ATM-xxxx when relevant, without rewriting history. New scope must receive a task/dependency/exit contract here before execution. No automation or report generator is added by this triage.
