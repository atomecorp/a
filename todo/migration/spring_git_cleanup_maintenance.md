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
