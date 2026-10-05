# atome/eVe instruction refactor report

Date: 2026-10-05. Status: implemented and documentation acceptance passed, with live-loading limitations stated below. This report is traceability and evidence, not an active instruction module. No entry point prescribes reading it for ordinary tasks.

## Authorization, baseline and scope

The user explicitly approved the plan and requested implementation. The sole separate policy arbitration was confirmed before execution: retain `eveT(key, fallback)` and `ui.label_fallback` only for localization, with no application-capability fallback.

Initial working trees were clean, including non-ignored untracked files. Heads remain:

- main project: `696dcd29b6715a90637a36fc4d8ce65fda280172`;
- eVe submodule: `2b0c981fca4653ff1b440e24a58d417a96906fb6`.

Before the first instruction edit, 14 original documents were copied byte-for-byte into [the task backup](../temp/codex-instructions-refactor-20261005T082734Z/original/). [manifest.json](../temp/codex-instructions-refactor-20261005T082734Z/manifest.json) records initial paths, bytes, lines, SHA-256 values, new-file absence, Git heads/status and unchanged-watch hashes. The backup and disposable checker outputs are under the main project's ignored `temp/`; they are not another permanent report or active corpus.

Initial authorized changes covered the three proposed entries, seven existing modules, the three approved adjuncts, navigation-file removal and this one report. The user subsequently approved consolidating all entries into one root `AGENTS.md`. That follow-up also migrates current document references and the two DeepSeek install/remove destinations needed to prevent recreating the former entry. No application, engine, component, dependency, Git configuration or personal file was edited. No install, commit, push, destructive cleanup, model/provider switch or configuration/context-limit change was performed.

## Construction-priority clarification

After implementation, the user reiterated that the framework must prioritize building itself with its own components. The root core now names internal composition as the primary mandatory construction rule for the framework itself and every realization. The common pre-edit gate requires evidence of the actual internal components and proposed assembly before a new implementation is considered. Existing missing-brick stop conditions, bounded explicit authorization and permission limits remain unchanged. A separate read-only reviewer confirmed this emphasis does not weaken those protections or create a competing rule source. Static checks passed again; no application or live-loading test was performed. Measurements below reflect this clarification. The prior completed version is preserved under the task backup's construction-priority follow-up snapshot.

## Single-entry consolidation

The user asked to retain one `AGENTS.md` and approved the root location after the documented discovery issue with a sole `.codex/AGENTS.md` was explained. All mandatory core invariants and reading obligations remain in the root file; domain rules remain in the seven modules. The unchanged marker-delimited DeepSeek block was merged into the root. Both `.codex/AGENTS.md` and the temporary eVe router were removed. The seven modules remain under `.codex/modules/`.

Before this follow-up, both repository states and heads were recorded again and 70 potentially affected files were copied with hashes and permissions into [the consolidation snapshot](../temp/codex-instructions-refactor-20261005T082734Z/single-entry-followup-20261005T150321Z/). This includes the prior refactor state, not only Git originals; it permits undoing this consolidation without losing the earlier work.

Current entry references in the architecture map, secondary eVe diagnostic guide, plugin user guide, live prompt and registered task gates now point to the root. Dated audit/completion records, pinned GitHub citations, non-active specifications and the unapproved plugin-method draft retain their historical references. These preserved paths are provenance, not alternate active instruction files or current loading routes.

The prompt/task reference migration changed 51 files, 99 lines and 144 literal path occurrences. Whole-file comparison against the pre-edit snapshots confirms that every other byte, status, checkbox and task scope remains unchanged; 35 historical/non-active references in that candidate set were preserved. The exact paths, line numbers and before/after strings are recorded in [the migration trace](../temp/codex-instructions-refactor-20261005T082734Z/single-entry-followup-20261005T150321Z/prompts-todo-reference-migration.json). No registered task was executed or activated by this migration.

The DeepSeek script changed only its two install/remove destinations from `.codex/AGENTS.md` to root `AGENTS.md`. Its historical `legacy_cleanup` destination is deliberately retained: retargeting that cleanup to root would remove the active block. Cleanup does not create an absent legacy file. The delegation guide now distinguishes worker `setup` from explicitly requested `install-rules`. Delegation and rule operations must be invoked from the main project root, as prescribed; the script's unchanged nearest-Git-root resolution is not a guarantee for standalone eVe invocations. No real setup, delegation, authentication, configuration or cleanup command was executed.

## Audit and concrete architectural evidence

All 11 accessible original `.codex` Markdown documents were fully read. The three adjuncts, canonical UI guide and Atome structure contract were also read fully. Large maps and implementation owners were inspected only for relevant evidence; this was not an exhaustive application audit. The draft plugin method was inspected for its status and relevant sections, not claimed to be fully audited or active.

| Concept | Inspected evidence | Limit |
| --- | --- | --- |
| Typed object | [core_atome_types.js](../atome/src/shared/core_atome_types.js) defines the image type with schema, kind and traits; the conditions property catalog consumes core definitions. | Declaration is source evidence. Production registration/creation for every target runtime was not demonstrated. |
| Shared tool | [selection_style_apply.js](../eVe/intuition/tools/selection_style_apply.js) has shared color application and a text-only Font contract; [existing contract tests](../tests/eve/selection_style_font_size_contract.test.mjs) cover color/text/SVG and non-text Font rejection. | Tests were inspected, not run. Some classification in [selection_style_atome.js](../eVe/intuition/tools/selection_style_atome.js) still reads view properties; existing code is not automatically architectural conformance. |
| Real composition | [bevy_panel_info_runtime.js](../eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js) imports and uses the canonical text editor, selectable list and shared panel nodes; its persistence uses the canonical commit path. | Real imports/calls were inspected; mounting, pixels and all-platform behavior were not validated. |
| Canonical execution | [tool_gateway.js](../eVe/intuition/runtime/tool_gateway.js), registered tool invocation and Command Bus/commit owners define actual execution boundaries. | Exposure and source paths do not imply all commands or capability checks passed runtime tests. |
| Product ToolSlider | [tool_slider_builder.js](../atome/src/squirrel/components/tool_slider_builder.js), spark registration and [eVe's consumer](../eVe/intuition/shared/slider_tool_content.js). | The owner already exists; no promotion/migration or new component was implemented. |
| Snapshot API | [atome_commit.js](../eVe/core/atome_commit.js) exports `snapshot` and installs it on the Atome target. | Explicit user-driven creation is the preserved policy; snapshot acceleration and runtime invocation are not newly verified. |

Priority findings were semantic duplication, the missing recognized root entry, submodule discovery boundaries, circular/nonexistent Part 1/Part 2 reading directives, project-supremacy claims, automatic component creation/parameter extension, automatic scope expansion, contradictory localization policy, obsolete `check:m2`, stale ToolSlider/sync ownership and misleading diagnostic examples.

## Final organization and loading

- [Sole root entry](../AGENTS.md): mandatory invariants, cumulative reading triggers, authority/authorization limits and preserved conditional DeepSeek block.
- [Common method](modules/07-future-code-guardrails.md): classification, evidence-based reuse audit, availability statuses, missing-components list, bounded authorization, implementation/validation/reporting gates and factual framework-state maintenance.
- The former eVe and `.codex` routers are removed; no alternate `AGENTS.md` remains in the active repository.
- Modules 01–06 retain their existing paths and own domain contracts.
- Copilot and Squirrel route into that corpus. The secondary eVe debug document is a source-verified API reference, not an alternative UI acceptance procedure.
- `infos.md` was removed after transferring its routing/invariants. Canonical UI and visual procedures were retained unchanged. The unapproved plugin-method draft stays unchanged and non-active.

The previous `.codex/AGENTS.md` was not an automatically recognized root instruction file for sessions starting at the main root. No ancestor/root override was found in the audit. eVe has its own `.git` file and Git boundary. No project loading config was present; the inspected loading-related personal keys did not override the documented defaults.

The audited app was version `26.930.51102` (build 13100), with `codex-cli 0.160.0`. The [official AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md) documents directory detection, override precedence, explicit references versus automatic inclusion, and the default 32 KiB combined detected-file cap. The [advanced configuration guide](https://learn.chatgpt.com/docs/config-file/config-advanced) documents project-root markers; the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) identifies the relevant loading keys. No loading setting was changed.

| Starting directory | Documented detection applied to the current filesystem | Detected bytes | Further explicit reading |
| --- | --- | ---: | --- |
| Main root | Root `AGENTS.md` | 10,661 | Common method and cumulative domains |
| `atome/` | Root `AGENTS.md` | 10,661 | Same corpus |
| `eVe/` or `eVe/intuition/` as standalone project | No parent entry detected across its Git boundary | 0 | Start from main root for eVe work, or explicitly attach/read parent core, method and domains; stop if inaccessible |
| `.codex/` | Root `AGENTS.md` | 10,661 | Common method and cumulative domains |

These are **static discovery checks**, not observed prompts from a fresh Codex session. The sole detected root file is below 32,768 bytes. Standalone eVe detection is empty: the parent corpus is a prescribed manual read or main-root session requirement, not an automatically injected safeguard. Explicitly read modules are not claimed to be automatically injected or protected by this cap. Normative cross-references do not require restarting mandatory entry reads.

Live isolated CLI/model sessions were not launched: `--ephemeral` documents session-history behavior but does not establish zero writes to personal logs, databases, caches or PATH aliases. The earlier read-only CLI inspection itself reported an attempted PATH-alias setup blocked by the sandbox. A fresh session using existing authentication/configuration could therefore violate this task's personal-state restriction. No auth was copied, profile replaced, dependency installed or cache cleared to work around that limit. Application and Web/Tauri/iOS acceptance runs were also not performed for this documentary change.

## Requirement correspondence

The table maps old requirement families to their new canonical owner. Detailed carrier/style lists remain intact in module 01; domain contracts and meaningful executable/evidence obligations were compared against the backed-up originals.

| Original source/section | Preserved requirement or approved change | New owner |
| --- | --- | --- |
| Entry implementation protocol; 04 reuse; 07 preflight | Identify owner, controlling execution/source of truth, inspect reuse before edits, minimal coherent repair and completion evidence | Root core; method §§1–5 |
| Entry routing; infos coverage; 01 task routing | Cumulative domains, owning runtime, full reads and relevant maps/graphs | Root reading table; method §§1–2 |
| Entry/01 supremacy and integrated wrappers | Remove claims overriding system/user hierarchy and nonexistent Part 1/2 reads; retain explicit conflict evidence/arbitration | Root §Mandatory core; method §3; historical provenance below |
| 01 non-negotiable state/DOM authority; 07 §3 | Canonical truth outside disposable DOM; no payload/authority mirrors; single role per writable fact | Root invariant; 01 projection; 06 model/history |
| 01 absolute DOM projection | Host id, all prohibited/allowed attributes/classes/styles, registry/event roles, nearest-host event resolution and actual final-DOM regressions | 01 Final Atome DOM projection contract |
| 01 legacy behavioral fallback exception versus 02 fallback prohibition | No new behavioral fallback; the approved localization-only exceptions close the contradictory legacy behavioral-read allowance. Legacy projection exceptions remain bounded and non-authoritative. | 01 projection; 02 Fallbacks and localization |
| 01 core role/final rule | Cross-platform architecture understanding, determinism, performance, low latency, coherence; remove inflated job-title rhetoric | 01 Architectural priorities; 02 quality; method gates |
| 02 code quality/simplicity | DRY, production quality, no speculation, measured caches/pools/indexes, smaller complexity/resource footprint, explicit ownership | 02 Code quality and simplicity; 04 factorization |
| 02 file size | All 300/500/800/1000 thresholds, documentary exemption, cohesive splitting, no artificial fragments and no inspection-size excuse | 02 File size and boundaries |
| 02 validation/deletion/security | Narrow checks, authorization/sanitization/trust/secrets, final boundaries, full usage/dependency checks | 02 boundaries; 03 checks; 04 deletion checklist |
| 02 no patching | Root-cause correction; no temporary shim, symptom fix, silent catch or bypass; editing tools are not architectural workarounds | 02 Root-cause repair |
| 02 languages; Copilot JavaScript/English/HTML/system-dialog rules | Main JS preserved; existing Rust/Swift/Ruby/C/C++ boundaries retained; no TS/Python/new UI stack; English developer docs; no raw product HTML/CSS or alert/confirm flows | Root; 02 stack; 05 canonical UI |
| 02 temporary-file/Git rules | Main-root temp/tests locations; read-only Git unless explicit conflict integration; never push, delete branches/tags, discard work or alter Git config | 02 Temporary artifacts and Git |
| 02/Copilot fallback/i18n | Only two confirmed localization exceptions; visible/assistive text through existing i18n and domain keys; no hidden missing-component substitution | 02 Fallbacks and localization |
| 03 autonomous validation/evidence | Falsifiable hypotheses, real reproductions, owner/context/log investigation, narrow then surrounding checks, no probable-cause success | 03 Evidence-driven investigation |
| 03 large-file/full-scope investigation | Complete controlling-chain inspection remains mandatory; necessary broader edits require bounded authorization | 03 Full controlling-path coverage; method gate |
| 03 runtimes/consoles | Requested or proven runtime, every crossed boundary, unexplained errors/warnings resolved or explicitly blocked | 03 Runtime and console coverage |
| 03 command list | Current manifest commands preserved; nonexistent `check:m2` removed without inventing a replacement milestone | 03 Validation routing |
| 03 UI adjunct; entry UI recap; 07 §9 real actions | Full canonical UI procedure, mounted BevyUI readiness, foreground record-center real pointer, hit-test/pixel evidence, no proxies/direct test activation/state-only acceptance | 03 UI and visual acceptance; unchanged canonical UI guide |
| 03 logs/cleanup | Temporary logic branches/probes removed; clean path retested; no production ad-hoc logs except version logs, structured authorized observability | 03 Diagnostic cleanup |
| 04 legacy cleanup | Prioritize legacy liability; verify imports/runtime/dynamic/tests/rendering/API/MCP/history/replay/sync/generated/docs before deletion; no dormant duplicates | 04 Legacy cleanup |
| Entry/04 named owners and guardrail | All 13 owners, actual contracts, guardrail in check:m0, non-growing allowlist and validated convergence | 04 Canonical component owners |
| Entry/04 additive parameter; 05 missing control | Automatic creation/extension replaced with stop, explicit missing list and bounded authorization; preserve existing behavior on authorized extension | Root; method §3; owner references in 04/05 |
| 04 architectural authority/map maintenance | Relevant CODEMAP/API/DESIGN/ARCHITECTURE updates for real contract/owner/exposure/structure changes | 04 Architectural contracts and maps |
| 04 factorization/capacity/Molecule | One owner, removal/convergence, safe MTrax naming migration, resource/listener/media/GPU lifecycle release | 04 Factorization and capacity recovery |
| 05 API/MCP; Copilot programmable tools | Explicit typed API, AI/MCP access, Command Bus, policy/capability/audit/idempotency, intentions/determinism, sandbox, UI/AI/Voice inputs, history and precise gestures | 05 API and command execution |
| 05 communication | Shared WebSockets, no REST/polling/hybrid bypass; bounded mediasoup media plane and host-native capability adapters | 05 Communication architecture; 06 sync |
| 05 rendering; 07 purpose/§§1–2/4 | Shared WebGPU, RenderAtom/type routes, one canvas/zone, no private per-Atome renderer/event system, matrix/export/compositing unified; bounded text/media decode exceptions | 01 Shared rendering architecture and exceptions |
| 05 controls/design | Unique traced Atome UI, canonical owners/native options; structured JS tokens/presets/factories; exact shell/vendor/generated CSS exceptions; no string-built parallel product HTML/CSS | 05 Canonical UI and structured design |
| 05 ToolSlider transitional wording | Correct actual builder/registration/consumer; retain compact expand/pin/collapse native behavior | 05 Product ToolSlider owner |
| 06 model; Copilot complete creation/ontology | Minimal schema/type/meta/traits/properties, all concepts as Atomes, complete replayable creation, default project parent, immutable creator/time | 06 Canonical Atome model |
| 06 mutation; Copilot direct-write ban | Canonical commit/commitBatch/server events; no direct Adole frontend mutation or competing view/cache/store owner | 06 Single mutation and history pipeline |
| 06 history/replay; Copilot temporal contracts | One immutable history, particles/property timelines/current projection roles, logical gesture boundaries, trusted anchors, copy/branch past modes, deterministic restore | 06 history pipeline |
| Copilot snapshots; 06 reconstruction | Explicit user-driven immutable snapshots; target snapshot+cursor+tail distinct from current full-scope replay; no falsely verified acceleration | 06 history pipeline |
| 06 offline/sync; Copilot Sync names | Local offline writes, client-initiated bidirectional reconnect, no loss/overwrite, canonical auth/recipient projection; correct SyncEngine owner and documented Fastify coordinator/vault durability | 06 Offline operation and synchronization |
| 06 runtime modes | Web/Tauri/iOS/AUv3/FreeBSD stacks, Axum-only Tauri filesystem/backend/no1430, iOS battery/offline, AUv3 realtime-thread restrictions | 06 Per-runtime contracts |
| 06 ACL; Copilot sharing/public/property permissions | Explicit policy/audit, linked realtime/manual versus detached copy, no redundant linked data copy or silent propagation, public and property grants | 06 Sharing and access control |
| 07 §§0/5–8/10/12–14 | Full reads/classification/reuse/gate, per-edit invariant checks, repair before feature growth, exact blocker/evidence/remaining-work semantics and completion lock | Root; method §§1–5; domains 01–06 |
| 07 §9 detailed regression list | DOM/canvas budgets, text/media/matrix, hit-testing, canonical invalidation/state survival, real affected gestures/IME/frame/waveform evidence | 03 Rendering/state/interaction coverage |
| 07 §11 progress and final-report templates | Preserve validated-step percentage semantics, evidence/files/checks/maps/risks and completion facts; remove rigid repetitive formatting | Method §§4–5 |
| 07 Framework state maintenance | All triggers, evidence levels, seven section names, To verify reasons/actions, capability/issue/task facts, concise dated secret-free record and final decision | Method Framework state maintenance |
| 07 short pasted block | Removed duplicate, never a replacement for full reading | Root plus prescribed method/domains |
| Copilot remaining sections | Become routed canonical references; no shorter competing rules | Copilot entry |
| Squirrel examples/readiness/templates | Actual exports/registration, array children, supported options/batch, kebab-case define, structured styles, lifecycle; no unsupported global/CDN/alert recipe | Squirrel guide |
| eVe debug API/procedure | Preserve verified APIs, actual field names and diagnostic side effects; remove install/config/runner recipes, stale Key/Live assumptions and state-only UI claims | Secondary diagnostic reference; canonical procedure in 03 |
| Entry DeepSeek block | Preserve exact marker-delimited operational text; only explicitly requested delegation, no real execution during this task | Sole root entry; conditional section |
| infos cross-cutting summary | Canonical references replace duplicate summary; file removed | Root table; method and domains |
| Visual protocol/short entry/canonical UI guide | Complete original obligations remain unchanged | Original files, hash-confirmed |

Automatic scope expansion was removed consistently across size reduction, legacy convergence and non-compliance repair. Complete diagnosis and necessary protection remain mandatory; dependent implementation stops when broader authorization is missing.

Semantic overlap families consolidated include reading/routing, reusable-owner audits, state/DOM truth, WebGPU budgets, mutation paths, cleanup/resource recovery, size/simplicity gates, map maintenance, runtime selection, UI evidence, progress/blocker/final reports and factual state maintenance. The narrow normalized-paragraph check found no exact cross-file duplicate paragraphs of at least 90 characters before or after; it is not a measure of all semantic repetition or proof of complete non-duplication.

Historical provenance removed from active wrappers:

- former integrated-entry marker: `fc114913c863d3e09feed1463e7adb869e6e8974086933abee9c3296503529da`;
- historical `AGENTS(3).md` marker: `6b8a1bcaa231c77f4a4441d6237fbe1619cc4e9ce931dfd5fee658584cc54e86`;
- historical future-guardrails marker: `34286ece5866f0145f5cccfbf332d86aa8e567ca93acfc49e4913ebda77a9560`.

Those source filenames were not found in the accessible corpus. These are preserved historical labels, not claims that their unavailable source bytes were independently verified.

## Executed checks and scenario evaluation

| Check | Method and result |
| --- | --- |
| Links/anchors | Disposable Ruby checker: all 90 local Markdown targets in active instruction files resolve; any local anchor is checked against target headings/ids. |
| Commands | Every active `npm run` citation matches an actual script in the root manifest. Manifest references were checked, not executed. No eVe package manifest was assumed. |
| Canonical owner paths | All 13 module04 owner files and inspected ToolSlider/sync/debug owners exist. Existence is not runtime availability. |
| DeepSeek integrity | Marker-delimited block unchanged byte-for-byte; SHA-256 `bdf71210582179c0b34a5d39122605b61c7c8cc7c531e5ea8f1d10897e1f6d8d`. Only the two install/remove destination strings changed; managed block renderer and all global logic remain unchanged. |
| DeepSeek operational migration | `bash -n` passed; disposable extracted-function fixtures verified root-only installation/replacement/removal, non-managed core preservation, absent-file no-op, historical cleanup, and unchanged fake configuration/authentication sentinels. No real home or worker command was used. |
| Reference-only migration | Exact snapshot comparison passed for 51 prompt/task files, plus the two-string script migration. Historical references were reviewed and preserved; task scopes and statuses did not change. |
| Single entry | Repository file discovery finds only root `AGENTS.md`; backups are ignored and non-active. |
| Protected document integrity | Canonical UI guide, visual protocol, short UI entry and unapproved plugin-method draft match baseline SHA-256. |
| Removed contradictions | Static scan rejects project supremacy, nonexistent Part read directives, automatic component-parameter/control creation and obsolete active milestone citations. Localization checked by semantic review. |
| Discovery/routing | Static documented discovery evaluated at main root, atome, eVe, .codex and eVe/intuition. Paths/cap checked; eVe standalone auto-detection explicitly absent; no mandatory reading restart cycle. No live loading claim. |
| Diff/scope | Main and eVe `git diff --check` pass. Changed/non-ignored untracked paths are within the approved documents plus the two-string script migration. Heads unchanged. No application change. |
| Requirement preservation | Authors compared all old/new domain requirements; another agent reviewed the core/method/domains and backed-up entry/infos/modules fully. Two P2 wording omissions were repaired and rereviewed. |
| Exact duplicates | No cross-file normalized duplicate paragraphs >=90 characters in the active corpus; semantic overlap reviewed separately. |

The disposable checker and evidence are in [the backup directory](../temp/codex-instructions-refactor-20261005T082734Z/): `check_documentation.rb`, `checks.json`, `loading-static.json` and `metrics.json`. The final report's own links are checked separately; the report stays excluded from active-reading metrics and obsolete-rule scans because it legitimately names retired rules.

A delegated agent evaluated the following nine adversarial/request scenarios against the rewritten documents, without edits or application execution. The first eight rule outcomes remain supported; the ninth now explicitly requires a main-root session or manual parent-corpus reading across the eVe boundary. This is an **executed documentary scenario evaluation**, not a fresh-session automatic-loading test, actual feature implementation, or assurance of future agent compliance.

| Scenario | Result and rule evidence |
| --- | --- |
| Existing tool already covers need | Reuse real owner/consumer; no copy. Root core 1/3; method §2; module04 owner table. |
| One operation across compatible image/text types | Shared tool and existing compatibility mechanism; no tool-per-type duplication or invented capability system. Root core 2; method §2. |
| Font requested on a non-text target | Explain incompatibility; no invented property or conversion. Root core 2; module06 schema constraints. |
| Essential TimeWarp component absent or registration unverifiable | Stop implementation; only read-only diagnostics; five statuses, explicit missing list, bounded question; silence/refusal stays blocked. Root core 4; method §3. |
| External widget wrapped as internal, or local tool copy | Reject disguised external substitution/parallel owner. Root core 1/4/5; module05 command/UI contracts. |
| User approves only one named internal extension | Limit work to that contract; no dependency or foundation extension without separate approval. Root core 5; method §3. |
| Panel needs an existing tool | Verify gateway/registration/dispatch/mutation owner and native options; no parallel settings. Root core 6; module05. |
| TypeScript UI/direct mutation request | Identify rule conflict and alternative/arbitration; never self-edit permissions or bypass. Root core 7/9; modules02/06. |
| Start inside eVe submodule | Standalone discovery cannot load the parent automatically. Start from main root targeting `eVe/...`, or explicitly attach/read parent core, method and domains; inaccessible parent stops work. Sole root detection notes; no local router or live-loading proof. |

Review corrections: `temporary branches` was clarified to `temporary logic branches` to avoid suggesting Git branch deletion; the deletion checklist explicitly retains rendering, API/MCP, history and replay dependencies. The reviewer confirmed both corrections and no remaining material finding.

An independent read-only follow-up review found no material issue with the sole root entry, invariant preservation, nine documentary outcomes, local DeepSeek anchor, exact managed block or current diagnostic/map/user-guide entry references. This review explicitly recognizes the absent automatic parent loading for standalone eVe sessions.

Application tests, media rendering, actual tool invocation, Web/Tauri/iOS pixels and fresh isolated model sessions were **not run**. Their runtime behavior is not claimed by this report. No tests mirroring implementation or product-injected diagnostic helper were added.

## Missing information, limits and framework-state decision

| Item | Status and examined evidence | Smallest verification action |
| --- | --- | --- |
| Core type production registration | Type declaration verified in core definitions and catalog; production registration not verified by this source audit. No executed target-runtime access during this task. | In an authorized runtime investigation, inspect actual startup/registration and create/query the typed object through canonical APIs. |
| Named `runShellCommand` recipe | Not found after investigation of atome/src and eVe JavaScript; the name had appeared only in documentation. No proof of global nonexistence. | Identify the actual platform/system capability owner; if indispensable and unavailable, use the missing-component gate. |
| Actual fresh-session root/eVe loading | Not verifiable here while ensuring zero personal-state writes using existing CLI auth/config. Static routes and byte limits were checked; standalone eVe cannot discover the parent automatically. | Use an authorized safely isolated harness and capture actual loaded sources/read provenance; do not rely on an agent's paraphrase. |
| Existing DOM-dependent style classification | Source-inspected divergence from canonical type/registry intent; not repaired or runtime-tested. | Separate authorized investigation of that owner and affected contracts; no fix is implied by this documentary refactor. |
| Diagnostic/runtime API availability | Source signatures verified; actual installer/method presence and target-platform behavior not executed. | Verify real readiness and API presence, then canonical gesture/state/pixel evidence under an authorized UI test. |

No missing application brick was necessary to perform this refactor. The above are evidence limits or existing application investigation subjects, not authorization to create or repair anything.

The architecture map changed only two current instruction-source paths during the approved consolidation. Application structure, ownership, API, renderer, design and runtime behavior were not changed. Existing instruction-module paths were retained. No framework-state update was made: this task validates documentary organization, not a new framework capability, runtime result or registration status. The approved whitelist excludes the State File; known source-level uncertainties remain clearly qualified here. The future factual-maintenance obligation itself is retained in the common method.

## Before/after measurements

All sizes are actual UTF-8 bytes from files. The report, backup and temporary checker outputs are excluded from active corpus measurements. No token estimate or speed benchmark is claimed.

| Measure | Before | After |
| --- | ---: | ---: |
| .codex instruction Markdown (old infos included; new report excluded) | 120,658 | 84,042 |
| Selected project instruction corpus (.codex plus three adjuncts and the new root entry) | 150,291 | 110,299 |
| General entry/core document (now includes the unchanged DeepSeek block) | 14,518 | 10,661 |
| Old prescribed base versus new always-required core plus common method | 44,889 | 24,723 |

The selected corpus is 26.6% smaller. Operational documents, maps and task prompts changed only for reference migration are outside this same-scope instruction-volume comparison, both before and after. The base row is a routing comparison: domain modules still add required reads, and the new common method is mandatory even for documentary tasks. It does not imply that all future tasks read only the core or method.

| Representative task and declared reading set | Before | After |
| --- | ---: | ---: |
| Developer-document wording only: old entry+01+02; new core+07+02 | 44,889 | 34,584 |
| Existing non-UI/non-state application owner repair: entry/core+01+02+03+04+07 | 97,426 | 67,171 |
| UI/state maintenance and full visual acceptance with diagnostic capture: entry/core+all seven modules+canonical UI guide+visual protocol+secondary diagnostic reference | 148,051 | 114,865 |

These are whole-file prescribed-reading bytes, not automatically injected bytes. Squirrel usage, additional domain documentation, relevant maps and runtime source/tests add reads when their triggers apply. The merged DeepSeek block is already counted in the root file; its use remains conditional. The underlying selected file lists are preserved in `metrics.json`.

| Original file | Before bytes | After bytes |
| --- | ---: | ---: |
| `.codex/AGENTS.md` | 14,518 | Removed; unique rules and DeepSeek transferred |
| `.codex/how_debug_UI.md` | 760 | 760 |
| `.codex/infos.md` | 1,611 | Removed |
| `.codex/modules/01-root-constitution.md` | 20,198 | 13,194 |
| `.codex/modules/02-coding-standards-and-prohibitions.md` | 10,173 | 9,861 |
| `.codex/modules/03-debugging-testing-and-ui-validation.md` | 12,945 | 10,991 |
| `.codex/modules/04-feature-work-cleanup-and-framework-reuse.md` | 11,751 | 8,402 |
| `.codex/modules/05-api-rendering-and-ui.md` | 6,674 | 7,281 |
| `.codex/modules/06-atome-state-sync-and-runtime-modes.md` | 6,385 | 11,689 |
| `.codex/modules/07-future-code-guardrails.md` | 27,841 | 14,062 |
| `.codex/visual-test-protocol.md` | 7,802 | 7,802 |
| `.github/copilot-instructions.md` | 8,629 | 2,656 |
| `atome/documentations/instructions_for_ai.md` | 4,156 | 4,934 |
| `eVe/documentations/debug_UI.md` | 16,848 | 8,006 |
| `AGENTS.md` | Absent | 10,661 |
| `eVe/AGENTS.md` | Absent | Absent; intermediate router removed |

Modules05/06 and the Squirrel guide grow because they now contain transferred unique contracts or factual availability limitations. Reducing every file individually was not a goal.

## Safe rollback procedure

Rollback has not been performed. Do not use Git restore/reset/clean, branch deletion, submodule reset or a blanket directory replacement.

1. Reinspect both Git working trees and heads, including non-ignored untracked files. Read initial `manifest.json`, final `installed-manifest.json` and the consolidation snapshot manifest. Choose whether to undo only consolidation or the entire refactor; do not mix their baselines.
2. For each changed original document, compare its current SHA-256 with the installed hash. If it differs, preserve and review intervening edits; apply only the inverse of this refactor. Never overwrite later user work.
3. For the entire refactor, restore changed original instructions from `original/<path>` only when the installed hash matches, preserving permissions. Restore added consolidation-scope paths from `single-entry-followup-20261005T150321Z/before/<path>`; those were unchanged by the earlier refactor. Recreate original `.codex/infos.md` and `.codex/AGENTS.md` only if absent and without intervening user content.
4. For the entire refactor, remove only the newly created root entry and report matching installed hashes; the eVe entry is already absent. For consolidation alone, restore each changed path from the consolidation `before/` snapshot, including its prior root/core/report and two routers, only if the current existence/hash matches the consolidation installed manifest. If any path changed since, review a three-way inverse edit instead. Never delete the eVe checkout or overwrite existing user content.
5. Recheck diffs, links and both heads; report retained later edits. Keep the backup until the user no longer needs it. Cleanup of this task's artifacts is a separate deliberate action.

If the ignored backup is unavailable, the initial clean original documents can be recovered by read-only `git show` at the recorded main/eVe heads, followed by the same per-file comparison and bounded edits. The initial root/eVe entries and report were absent; the consolidation snapshot records the intermediate entries separately. No broad checkout rollback is required.

The final rule remains: **atome/eVe develops by composition of real reusable internal bricks; tools act across compatible typed objects; an indispensable missing brick requires stopping and explicit bounded authorization.**
