# Incremental maintenance and first local report — 2026-10-12

The single live register is [execution_order.md](../execution_order.md). [Source manifest](spring_git_cleanup_sources.json) and [reconciliation snapshot](spring_git_cleanup_reconciliation.json) are dated evidence/provenance, not competing task states. This is a manual procedure: no generator, hook, scheduled automation or product test campaign was added.

## Incremental procedure

1. Record parent/eVe HEADs, dirty/index status, date and the last reviewed SHA; use local `git status`, `git log`, `git show` and `git diff` only. Remote access or Git writes require the user's explicit action-specific request. Never infer current GitHub freshness from local refs.
2. Inspect new commit diffs and actual owners since the last review, including reversions. Map the changed contracts to existing ATM and SCN IDs; note unmatched commits before creating a new task. Do not rewrite old commits to add IDs.
3. Update advancement only for fulfilled inspected criteria. Existing files, historic checkmarks and commit titles are insufficient on their own. Retire a delivered creation requirement from the active backlog while preserving its source and any outstanding acceptance.
4. Update verification only from a dated actual run tied to SHA/build, runtime/device/OS, scenario result and evidence. Preserve BLOCKED/NOT RUN/FAIL explicitly; never turn a merge or deployed file into PASS. Real UI and physical platform contracts remain applicable.
5. Consolidate the matching entry in execution_order.md and update its next action/dependencies. Specifications, old report copies and this report never acquire an independent live state.
6. Run the existing execution-order checker and its relevant focused tests after checker changes; check changed links, IDs, source hashes, move mappings, duplicates and diff scope. Provide a local review diff. Stage/commit/push only after a new explicit request covering that action.

## First report

Period: 2026-10-05 through 2026-10-12, Europe/Paris. Initial inspected HEADs were parent e805920a and eVe 1dc2eab2. The explicitly requested main repair preserved the concurrent commits 163a63e1 / 6ac91ece and published parent 12415352 with the requested Git policy. Cleanup continuation baseline is parent 1241535281747379b9b177bfec0efde27dcabe83 / eVe 6ac91ece0a58ba2b695380738dac79271d39a9f8. Later cleanup changes are local and uncommitted.

Read-only local history contains beginner-workflow/menu/TV, HealthKit, Dashboard/UI, YouTube and assistant/wake/remote-control changes in this period. Selected owner inspection confirms existing SMS provider/device-link, opaque identity, template creation/selection, page/action capture and MIDI-binding implementation. Their complete shipped/runtime status is not inferred from commit titles. Scope is the supplied corpus and existing local To Do, not all missing historical Library candidates.

The older 161 task entries are accounted for in the reconciliation snapshot. Its 76 checked entries are removed from active creation with historical provenance; their runtime assertions were not repeated. Remaining work is consolidated in 22 stable ATM packages. Five implementation reports leave todo for done, with physical/UI/performance limitations retained in the corresponding canonical tasks. Creation of already available templates/pages/MIDI/SMS/menu foundations is not repeated.

All 60 exported files remain unchanged. Every regular entry in the two objectives ZIPs is hashed and classified as specification/reference; only exact-byte duplicates are merged as inventory references. Prompt/scenario/bricks counts are not delivery counts. Three technical Office sources receive OpenXML text review; commercial/administrative documents and images remain outside deep/content-publication review. Sensitive sources remain excluded from active technical task contents. The raw export was included in the concurrent commit and the user's subsequent explicit request to preserve/publish all existing local work; this continuation does not publish further material.

No product/browser/device acceptance was run. Existing reported iOS restoration and native source repairs remain partial acceptance; old failing test or hardware limitations are not silently certified. At this report date, ARB-0001 held the cookie/device-session contract decision; it was resolved by the user on 2026-10-13 as recorded below. Missing annex sources, full semantic ZIP reconciliation, Office layout/formulas/images, end-to-end production behavior and unselected runtime defects remain outside this broad-pass evidence.

Next priorities are the registry's security/SMS/identity and durable recovery prerequisites, then sharing/concurrency and the permanent Web/Tauri/iPad scenarios. Deferred creation work is now named and ordered, rather than hidden in an undifferentiated follow-up. No maps or eVe/FRAMEWORK_STATE.md are edited: architecture is unchanged and eVe is read-only for cleanup. To verify: all product acceptance gates under the retained browser-session contract.

GitHub's repair-push response reported one moderate dependency alert. No dependency change or security fix is claimed by this documentary scope.

## 2026-10-13 — Final documentary arbitration resolved

The user selected the recent SMS/device-proof flow with access tokens in memory. The unconditional browser-cookie migration requirement is retired as historical provenance in secure_auth_token_storage.md; applicable security acceptance remains in ATM-2001/ATM-2002. The decision record, single register and source index are aligned. No documentary arbitration remains pending for this triage. This follow-up changes documentation only, preserves the source export and eVe, and performs no Git write or GitHub action. No product/runtime validation is inferred from approval.

## 2026-10-13 — User-selected product priority and visual approval

The user made ATM-2017 (projects, objectives and transversal activities, including sport) execution rank 1, superseding the earlier security/collaboration-first recommendation. The single register now places this package first and explicitly repeats Objectif.md section 4: every new panel, visible proposal, state or step must be shown and receive explicit user visual approval before integration. Remaining priorities are provisional. This is a documentary ordering change, not product implementation or a new runtime result. No architecture maps change; eVe/FRAMEWORK_STATE.md stays outside the authorized read-only submodule scope.

## 2026-10-16 — Coherence pass

Scope: quick documentary reconciliation of all 22 canonical workstreams, with decisive current-owner/registration inspection, selected local commit diffs and dated execution records. Parent c4bc412659b489172993f008441e6ad1e0d1fd93 and eVe 6ad3122c8f8637bb0daf94c48dd64a048e58337a; both inspected main working trees contain substantial unrelated concurrent changes. No remote refresh, Git write, product repair or product/runtime test campaign. Local uncommitted implementation is distinguished from integration/publication. The eighteen functional ranks after reconciliation are recorded for user review; only rank 1 is approved. Collaboration/conflict acceptance accompanies sharing rather than remaining a standalone test priority.

Corrections: SMS is complete as explicitly user-confirmed; optional password already exists. Stable identity, sync/LWW/manual publication, permanent scenarios are supporting verification records, not whole systems to recreate. Real Mac/iPad messaging/calls and accepted read-only sharing are retained from the 15 October record with their actual limits. Registered MusicGPT/Runway generation, programme/health/Nutrition slices, MIDI learn, timeline/mixer/Cells/Scenes/basic comping/punch/native fades and Android release preparation leave creation scope. Eight newer audio/mixer/timeline/screen-recording documents are registered. The timeline journal now marks its superseded initial remainder as historical. SCN-2004 is reconciled from future specification to acceptance of the existing optional-password owner, with the current documented anti-enumeration choice behavior; SCN-2001 preserves the user-confirmed baseline without implying a new run. No source or completed report is deleted.

### Dated evidence sample by workstream (not a second live task ledger)

| ATM | Decisive inspected owner/evidence | Reconciliation boundary |
| --- | --- | --- |
| 2001 | server/auth_password.js challenge/login/set; wsPhoneLinkAuth.js; auth_phone_link.js; user confirmation | SMS done; password code exists; activation/new-hardening acceptance separate. |
| 2002 | server/auth_identity.js replaceVerifiedPhone; userVaultRouter.js commit; diff 788c76449 | Stable opaque identity/private ownership exist; whole security/recovery chain not certified. |
| 2003 | sync_engine.js cursor/reconnect; userVaultProcess.js/wsSyncRuntime.js diff c4bc41265 | Delivery/replay exist; short byte-bounded batches continue; native/reconnect coverage separate. |
| 2004 | syncSharingService.js activate/respond/revoke; syncShareHierarchy.js; communication_share_resolve.js | Accepted read-only sharing reported 15 Oct.; Dashboard discovery/Programme consent remain. |
| 2005 | database/adole.js offline-lww; syncSharingService.js publish; offline_lww_conflicts probe source | LWW and manual cursor publication exist; multi-client acceptance is separate. |
| 2006 | communication_push.js APNs/FCM registration; current communication owners; 15 Oct. two-device record | Text/takes/live calls exist; native delivery/UI/lifecycle defects remain bounded. |
| 2007 | todo/tests/; SCN-2001..2004 | Permanent scenarios remain available, no blanket new PASS. |
| 2008 | state_snapshot_restore.js; adole_snapshots.js; imported backup specification | Snapshot/cloud restore differs from portable versioned archive; named archive APIs not found in targeted source search. |
| 2009 | canonical bevy_panel owners; current programme/mixer consumers | Reuse panels/interactions; old unchecked acceptance alone does not establish a current missing component. |
| 2010 | project_view_timeline_owner.js; runtime_cells.js; mix_structure.js; current reports | Concrete newer implementations supersede old creation claims; plugins/MIDI-on-block and other explicit remainders retained. |
| 2011 | database/adole.js rebuildStateCurrentFromEvents ordered scoped SQL; state_snapshot_restore.js | Manual restore/full replay exist; snapshot-tail acceleration is still a distinct requirement. |
| 2012 | conditions/engine.js/live_sources.js; health_owner.js; programme collection/session runtime | Existing evaluators/health consumers not recreated; broader consumer/native claims stay scoped. |
| 2013 | current maps/guardrails and local native/audio changes | No fresh performance audit or proof every historical cleanup remains necessary. |
| 2014 | default_tools_*; mcp_runtime.js; remote_command.js; assistant_generation.js | Core assistant/MCP/remote generation exist; residual semantic/editor requirements need bounded comparison. |
| 2015 | MusicGPT/Runway adapters and registration; assistant generator consumer; diff 7cdd27367 | Supported operations exist; unsupported adapter capability flags remain honest. |
| 2016 | taxonomy_editor_bridge.js taxonomy_read/save | Existing editor is deliberately Tauri debug-only, not an automatic release/Web/iOS port requirement. |
| 2017 | project_program_runtime; program_collection/session/Nutrition owners; diff eVe 6ad3122c and local follow-ups | Programme/Nutrition slices exist; catalogue/previews do not complete all scenarios/sport programmes. |
| 2018 | remote_command.js listRemoteSurfaces/runRemoteCommand; relay/grant owners | Canonical cross-device tools exist; not all ten historical packages are runtime-certified. |
| 2019 | gps/navigation_owner.js start/stop/replan; navigation_engine.js; existing GPS record | Guidance/typed/native owners exist; capacity/deployment/physical acceptance remain. |
| 2020 | Android_testflight_generator -> android/apk.sh and Play lane; 15 Oct. signed AAB record | Build/preparation implemented; Google publication/device acceptance and future OS scope separate. |
| 2021 | midi_binding_service.js beginMidiLearn/create/remap/output; current timeline MIDI paths | Basic learn/bindings/capture exist; do not label generic MIDI learning absent. |
| 2022 | mcp_runtime.js; plugin specification versus current canonical tool owners | Existing APIs not recreated; full third-party sandbox/publication not certified. |

Limits: this is a one-pass workstream-level reconciliation, not a renewed semantic read of every archive/Office/image or an exhaustive criterion-by-criterion product audit. Historical test counts are attributed to their existing dated records, never rerun here. No fresh physical, UI, provider, cloud, production or paid generation result is claimed. The first report above remains a dated snapshot; its older priority and acceptance statements do not override the current register/user decisions. No maps change because architecture is untouched. eVe/FRAMEWORK_STATE.md is not edited: the cleanup mandate keeps the submodule read-only, and this report carries the documentary findings. Original export hashes and the scoped documentary diff are checked before delivery; see the local verification artifact for actual results.

Validation actually run for this pass: the existing execution-order checker passes with zero violations (the initial eight unregistered documents are covered), 22 unique stable workstream IDs remain, local Markdown targets resolve, all 60 raw export hashes match the start of this pass, and scoped git diff --check passes. Seven documentary files are changed. No executable checker or product test was changed, so no additional test suite was needed. The local review patch and verification results are at temp/spring-git-cleanup-coherence-2026-10-16/review.patch and verification.json; the preserved baseline permits reviewing/reversing this documentary delta without resetting unrelated work.
