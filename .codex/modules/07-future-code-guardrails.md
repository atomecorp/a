# Common work method

Read completely for every task, after the project core. This is the single workflow source; domain modules own their technical contracts. References below identify evidence and rule owners, not a requirement to restart the entry-point reading cycle. Project-relative paths use the parent atome/eVe root, even inside the eVe submodule.

## 1. Understand and classify

State the intended observable result, task boundaries and acceptance criteria. Classify the work as applicable: feature, bug/regression, rendering/media/text/matrix preview, state/mutation, interaction/UI, performance, cleanup/refactor/migration, API/automation, test/guardrail or documentation/map work. Select the cumulative domain modules from the core routing table.

Identify the owning runtime: Web Browser, Tauri, iOS, server, AUv3 or a cross-runtime chain. Use the user's explicitly named context. Otherwise follow proven ownership; begin with Web Browser only while ownership is not established. Validate every participating boundary when the scenario spans runtimes.

Record repository/submodule state and pre-existing edits before mutation. Define the authorized file scope. Existing user authorization persists; do not ask again for decisions already given. Feature authorization still does not cover the creation or extension of a missing internal brick.

## 2. Inspect owners and reusable composition

Use relevant sections of the existing maps to locate contracts, then inspect the actual controlling implementation, callers, callees, registries, consumers, tests and loading/execution paths. Maps are contracts and navigation aids, not proof that every described feature is implemented or registered. Inspect important large files in successive passes; file size, fan-out and complexity do not excuse unread controlling logic or superficial repairs.

| Reference | Use |
| --- | --- |
| [CODEMAP](../../maps/CODEMAP.md) | Source structure and canonical owners |
| [ARCHITECTURE_MAP](../../maps/ARCHITECTURE_MAP.md) | Ownership, dependency and lifecycle boundaries |
| [API_MAP](../../maps/API_MAP.md) | Interfaces, runtime exposure and command owners |
| [DESIGN_MAP](../../maps/DESIGN_MAP.md) | Tokens, visual factories and rendering/design contracts |
| [Atome structure](../../atome/documentations/atome_structur_to_respect.md) | Object, event and state contracts |
| [atome documentation index](../../atome/documentations/README.md), [eVe documentation index](../../eVe/documentations/README.md) | Relevant platform/domain references |
| [Audit graphs](../../atome/documentations/graphs/) | Call/state/event/lifecycle evidence; check each graph's evidence status |
| [Known-bug solutions](../../known-bug-solutions/README.md) | Recurrent reproduction, confirmed owner, rejected hypotheses and regression checks |

For rendering work, follow the actual WebGPU/RenderAtom chain, text service/editor, applicable image/video/waveform adapters, matrix previews, interaction/hit-testing, cache invalidation and export/compositing owners. For state or command work, follow the real invocation, mutation, history, persistence and sync boundaries. Do not inspect just the first similar-looking result.

Decompose each future realization into its necessary internal bricks. For every decisive brick, record its need, owner path and symbol, internal access or registration, compatible object contract/platform, real consumer or assembly, relevant test and the evidence level. Reuse the actual implementation. Existing behavior may violate the intended contract: record that divergence rather than turning it into a new rule.

Use these exact availability statuses consistently:

| Status | Meaning |
| --- | --- |
| Available and compatible | Real implementation and the necessary access/contract/platform are verified at the stated evidence level |
| Existing but unsuitable | Implementation found, but its verified contract cannot cover the need |
| Unavailable | Evidence identifies an inaccessible, absent or unusable required dependency/access path |
| Not found after investigation | Searches and examined locations are recorded; this does not prove absolute nonexistence |
| Not verifiable because access is missing | A required source, runtime, registration or platform cannot be inspected/validated |

Documented intent, code inspection, executable test and actual runtime validation are distinct evidence levels. Do not promote a source declaration to proof of production registration, or a passing headless assertion to visual proof.

## 3. Resolve the implementation gate

Before editing, provide a short numbered plan and a gate report covering:

- classification, applicable modules and owning runtime;
- canonical owner, inspected files and reusable architecture with evidence; identify the internal components and their proposed assembly to demonstrate the core's primary construction rule before proposing any new implementation;
- authorized files likely to change and whether work reuses, repairs, factorizes, extends or creates;
- targeted validations/tests or guardrails to run or update;
- map impact and framework-state impact;
- precise DOM, rendering, mutation, legacy and security risks, or justified non-applicability;
- complexity delta, resource/dependency/code recovery, or a reason none is needed;
- relevant legacy `MTrax` references and whether safe Molecule convergence is in scope;
- decision: proceed within authorization, or blocked with the smallest compliant action.

Missing indispensable bricks require **stopping implementation**, including files that would depend on a guessed replacement. Only complete the read-only diagnostics needed to explain the blockage. Present an explicit **missing or unavailable internal components** list with one entry per brick:

| Required information | Content |
| --- | --- |
| Component and need | Exact missing capability and its reusable role |
| Status and proof | One status above; path/symbol/call/test or specific access limitation |
| Investigation | Locations and searches examined, including existing assemblies |
| Internal alternatives | Why existing composition/owners cannot cover the need |
| Proposal | Bounded creation or extension, integration point and impact on shared consumers |

Ask explicitly, in the user's language: “Do you authorize creating [component] as a reusable internal brick to provide [capability]?” or “Do you authorize extending [existing component] within [precise scope]?” Name all components requiring approval. Without a covering answer, or after refusal, remain blocked. No external wrapper, local copy, reduced substitute or silent assumption may replace the missing brick.

After approval, recheck the actual contract, platform, shared consumers, mutation/lifecycle implications and tests. Use the existing declaration/discovery/composition/test mechanisms. Ask separately if a foundation extension or external dependency is required; brick approval does not authorize either automatically.

For other blockers, identify the exact conflicting rule, missing decision, dependency or mandatory validation access, the blocked step, evidence, completed validated work, remaining steps and smallest next action. Complexity or duration alone is not a stop condition. Do not insist on an exact output template that obscures the evidence.

## 4. Implement and maintain within scope

After each substantive edit, check the applicable domain contracts: state/DOM authority, rendering budget, canonical tool and mutation paths, compatible types, no duplicate or fallback owner, language/i18n, size/cohesion, resource lifecycle, determinism, replay/save/sync, authorization and security. These contracts are defined in modules 01–06; this check is not an alternate abbreviated policy.

Apply the smallest coherent source repair. Prove why an additional boundary is necessary; do not introduce speculative abstractions, configuration, caches, registries, adapters or dependencies. Remove safely obsolete/duplicate/dead code and release owned resources at their lifecycle boundary. Maintain maps when their actual architecture, API, ownership, rendering or design contracts change; module 04 defines that obligation.

Treat non-compliance on the touched controlling path as part of the diagnosis before adding feature scope. Identify its root cause and owner, restore canonical ownership, remove invalid parallel routes, update checks/maps and rerun the failing scenario when this repair is authorized. If required repair exceeds authorization, report the precise extension and stop dependent implementation until approved. Do not silently preserve a violation, expand the task, or replace repair with a TODO.

Keep temporary diagnostics outside production and remove failed experiments incrementally. Revalidate after cleanup; module 03 owns console, UI, test and evidence procedures. Persistent regression tests belong under `tests/`; temporary artifacts belong under `temp/`, governed by module 02.

Report progress at meaningful step boundaries with status, evidence, inspected/changed files, validation results, maps, remaining work and material risks. If using a percentage, calculate `floor(validated_completed_steps / total_numbered_steps * 100)`. A step is validated only after its acceptance criteria are satisfied and required checks pass; planning, partial edits, failed tests, placeholders and “looks correct” claims do not count. State a precisely justified non-applicability instead of inventing an executed check.

## 5. Validate and close

Run the narrowest relevant executable check first, then broaden for new failures, changed boundaries or unresolved risk. Preserve/update the meaningful regression coverage required by the touched domains; if absent, create the smallest correct persistent regression test when authorized. Do not mirror the implementation with an assertion that cannot catch the failure.

Actual UI and runtime proof, including visual pixels and real interactions where applicable, is governed by module 03 and the canonical UI/visual procedures. Do not substitute static reading for required available runtime validation. Record missing tooling instead of installing it without authorization. An unavailable mandatory acceptance check leaves that acceptance blocked; a check outside the task domain is explicitly not applicable.

Before completion verify every applicable architecture, owner, authorization, validation and cleanup gate. Inspect the complete diff, preserve unrelated edits, check security/trust boundaries and verify no diagnostic residue remains. Do not claim success with unresolved required failures, unexplained relevant console errors/warnings, missing mandatory proofs, duplicate authority or forbidden active paths.

The final report must state:

- complete, partial, blocked, reverted or no-change outcome, with the exact completion limitation;
- verified architecture and reused owners; created/changed/removed files and rationale;
- checks actually run and results, tests changed, skipped/unavailable checks and reasons;
- applicable DOM budget, WebGPU, text service, matrix/media, legacy route and mutation results, with evidence or explicit non-applicability;
- map updates or reason none is needed;
- framework-state update decision and factual summary, with **To verify** items;
- remaining risks, unresolved scope and the smallest evidence-based next action.

Keep one coherent report rather than repeating the same facts in competing templates. Never report an edit, proposed test or requested work as a verified capability.

## Framework state maintenance

[FRAMEWORK_STATE](../../eVe/documentations/FRAMEWORK_STATE.md) is the factual operational record of verified framework behavior, ownership, validation status, limitations, regressions, uncertainties and evidence-based recommendations. It is not a roadmap, task list or substitute for architecture maps.

Before finalizing a task that produces such new facts, update the State File within the authorized scope. This applies to features, removals, repairs, investigations, refactors, migrations, cleanup, API/rendering/UI/media/state/sync/history/replay, tests, validation, maps and documentation. A no-change task merits an update only if it adds factual evidence, a changed verification status, a known limitation or an evidence-based recommendation; do not repeat known information. If the required update is outside authorization, report that precise limitation rather than silently editing another file.

Before updating: read the relevant implementation, documents, maps, records and current entries; inspect the actual diff; run the narrowest relevant validation; distinguish code-inspected, test-confirmed, manually validated, documented intent, inference and unverified facts; preserve verified information unless superseded by current evidence.

Mark material uncertain claims, ambiguous owners, unavailable validation, suspected defects or stale entries **To verify**, with reason, affected scope and smallest verification action. Never hide failed, blocked, skipped, flaky or not-run checks, or label planned work implemented.

Keep these State File sections:

1. Scope and evidence status
2. Implemented and verified capabilities
3. Partial implementations and known limitations
4. Regressions, bugs, and unresolved issues
5. Recent task record
6. Uncertainties and verification backlog
7. Recommended next steps

Each material capability identifies observable behavior, owner/source, evidence level and operational constraints. Each limitation/issue identifies scope and evidence. Recent task records are concise and newest-first, with date, title, outcome, factual change, files, validation results, unavailable/skipped checks and **To verify** items. Condense older records only after preserving their essential facts. Keep entries dated, traceable, concise and free of secrets/personal data; label recommendations as recommendations. State in the final report whether the file was updated and why.
