# Framework Documentation Conformance Remediation

Date: 2026-07-14  
Status: Actif — evidence-backed audit findings

## Scope and authority

This backlog is the actionable output of the comparison between the active contracts in `atome/documentations/` and `eVe/documentations/`, the active architecture maps, source code, and executable guardrails. Archived documentation was excluded as a normative source.

The target architecture remains: canonical Atome description outside the DOM, durable writes through `window.Atome.commit` / `commitBatch`, append-only server commits, and one visible Bevy/WebGPU canvas for the active project route.

## Completed 2026-07-14 — Restore core Atome type registry initialization

**Evidence**

- `atome/src/shared/core_atome_types.js:166-184` registers the core `record` type with `kind: 'data'`.
- `atome/src/shared/atome_universal_contract.js:3-23` validates every registered kind against `UNIVERSAL_KINDS`; `data` is absent.
- `node --test tests/shared/core_atome_types.test.mjs` fails three registry tests with `Unsupported universal Atome kind: data`.
- `done/full_atome_architecture.md` marks T15 and T18 complete with this suite green, so that completion evidence is stale.

**Required remediation**

1. Decide the canonical broad kind for records from the documented universal vocabulary; do not weaken schema validation or add a compatibility alias without a documented contract decision.
2. Make `CORE_ATOME_TYPE_DEFINITIONS` and `UNIVERSAL_KINDS` agree, preserving strict unknown-property validation.
3. Run the core-type suite and all consumers of the type registry; update the architecture/API/code maps and reopen or correct the stale completion entry only after green evidence.

**Acceptance**

- `registerCoreAtomeTypes()` is idempotent and succeeds.
- `tests/shared/core_atome_types.test.mjs` passes with the project-supported runner.
- A regression assertion covers the selected record-kind contract.

**Resolution**

`record` now uses the existing universal `data_model` kind, retaining strict validation. The focused Node suite passes 5/5, including idempotent registration and a direct record-kind assertion.

## Completed 2026-07-14 — Repair mutation-ownership guardrail after commit-pipeline extraction

**Evidence**

- `npm run check:mutation-ownership-guardrails` fails on `eVe/core/atome_commit_effects.js:24` and `eVe/core/atome_commit_url.js:59`.
- The first is an actual post-commit effect invoked by the canonical commit entry; the second is a pure classifier whose string literal matches the guardrail’s transport-path heuristic.
- `done/atome_urgent_treatment.md:82-88` and `done/full_atome_architecture.md:824` state that this guardrail passed, so the governance claim is no longer true.

**Required remediation**

1. Review the guardrail’s ownership model against the decomposed `eVe/core/atome_commit*.js` DAG.
2. Make it recognize the explicit canonical commit family without allowing arbitrary client-side event transports.
3. Add clean/dirty fixtures: canonical delegated effect accepted; a non-owner UI/domain transport rejected; path-classifier strings do not trigger a false violation.
4. Update the maps and completion evidence only after the checker and its tests pass.

**Acceptance**

- `npm run check:mutation-ownership-guardrails` passes.
- The guardrail remains capable of rejecting a real bypass.
- No durable write path is added outside `window.Atome.commit` / server commit owners.

**Resolution**

The scanner now exposes a testable scan function and recognizes only the two explicit canonical commit leaves that triggered false positives. Its regression test proves that those leaves pass while a domain-level transport bypass still fails. The command and focused test both pass.

## P1 — Execute the existing file-size remediation backlog

**Evidence**

- The active code scope (`eVe`, `atome/src`, `server`, `platforms/desktop-tauri/src`, `platforms/web`; excluding generated targets, vendored code, and dependencies) contains 367 files over 300 lines, 54 over 500, 28 over 800, and 23 over 1000.
- Largest active modules include `platforms/desktop-tauri/src/server/mod.rs` (5764), `server/server.js` (4646), `atome/src/application/lyrix/src/features/lyrics/display.js` (4350), and `platforms/desktop-tauri/src/server/local_atome.rs` (3736).
- This violates the active 300/500-line policy. The measured critical-file register with required stable boundaries is now tracked in `todo/cleanup_architecture/file_size_inventory_2026-07-14.md`; implementation remains active.

**Required remediation**

1. Add the measured inventory and a dependency-safe reduction owner for every file over 1000 lines to the existing file-size backlog.
2. Prioritize canonical server, local persistence, renderer, and boot surfaces before examples or generated mirrors.
3. Split only on stable responsibilities; delete dead paths and duplicate logic discovered during the split.

**Acceptance**

- Every >1000-line active source file has an owner, target boundary, validation command, and map-update requirement.
- No touched source remains above 500 lines unless the same work actively reduces it under an explicit transition plan.

## Audit controls that currently conform

- The maintained DOM projection guardrail passes and reports one bounded timeline-ruler canvas fixture with no forbidden payload or inline-style violations.
- The focused Bevy renderer contracts pass: 33 tests across projection, web runtime, panel, and project-scene suites.
- Source searches found no forbidden final-Atome DOM identity/state attributes in `eVe`, `atome/src`, `server`, or platform source (test/probe selectors were deliberately excluded from this finding).

## Validation protocol

Run the targeted source test with its declared runner, then:

1. `npm run check:dom-projection-guardrails`
2. `npm run check:mutation-ownership-guardrails`
3. `npm run check:no-fallbacks`
4. relevant Bevy and persistence suites through Vitest or Node according to the test’s import style

Do not treat historical `done/` claims as current proof; rerun the stated command before closing an item.
