# File Size And Coding Standards Remediation

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Objective

Bring the already-written codebase into compliance with explicit file-size limits and mandatory coding standards.

This task exists for current code, not only for future code generation.

## File Size Policy

The remediation work must use the following thresholds:

- ideal file: under 300 lines
- transitional zone: 300 to 500 lines only when the module remains cohesive and the boundary is architecturally justified
- hard maximum for a normal module: 500 lines
- above 500 lines: non-compliant and must be reduced before adding new scope, except when the current change is explicitly performing that reduction
- above 800 lines: critical legacy state requiring immediate reduction ownership and no feature growth
- 1000+ lines: forbidden without explicit architectural justification and an active reduction plan

## Scope

This task covers:

1. Existing source files already above size thresholds.
2. Existing files mixing too many responsibilities.
3. Existing code that violates mandatory coding standards.
4. Missing reduction plans for oversized legacy files.
5. Existing files whose comments, annotations, or explanatory noise have become excessive relative to the code's real complexity.
6. Existing files that may duplicate logic already present elsewhere in the framework and must be checked against the maps before more code is kept or added.
7. Existing files whose verbosity can be reduced through simplification and factorization without removing functionality or destabilizing the app.
8. Existing files containing dead, inoperative, misleading, fragile, or otherwise problematic code paths that should be removed, rewritten, or isolated once proven unnecessary or unsafe.

## Mandatory Coding Standards

The remediation must enforce at least the following rules:

- one clear responsibility per module whenever architecture allows it
- strong factorization without artificial file multiplication
- cohesive file boundaries; do not disperse a single coherent responsibility across many files unless that split creates a real architectural benefit
- every modified file must be brought back under these rules; touching a file means accepting responsibility for its size, cohesion, cleanup, factorization, and optimization
- no dead, deprecated, duplicated, or unreachable code kept by inertia
- no silent catch or silent failure path hiding structural problems
- no repeated local utility logic across many files when a shared module is appropriate
- no artificial micro-file split creating wrappers, pass-through layers, or navigation overhead without real architectural value
- explicit and stable naming
- maintainable file boundaries and readable control flow
- comments and annotations must remain concise, useful, and justified by real complexity; verbose commentary that restates obvious code or pollutes maintenance must be reduced or removed
- simplification is mandatory when behavior can be preserved with a clearer and smaller implementation
- duplication checks must use the framework maps and verified code search, not intuition or partial local inspection
- dead, inoperative, misleading, or structurally problematic code must not remain by inertia once identified and verified

## Required Work

### 1. Inventory

- Identify all files above 300, 500, 800, and 1000 lines.
- Group oversized files by subsystem and responsibility.
- Distinguish justified legacy boundaries from uncontrolled accumulation.

### 2. Structural Audit

- Identify files that combine unrelated domains or responsibilities.
- Identify files where complexity comes from duplicated helpers, repeated guards, repeated transport logic, repeated DOM scans, or repeated state resolution logic.
- Identify files whose size is causing navigation, maintenance, or regression risk.
- Identify files whose comments, annotations, or inline explanations are disproportionately verbose compared with the real complexity of the code.
- Use maps/CODEMAP.md, maps/API_MAP.md, maps/DESIGN_MAP.md, and maps/ARCHITECTURE_MAP.md when relevant to verify whether similar logic, ownership, APIs, factories, or runtime responsibilities already exist elsewhere.
- Identify dead code, inoperative branches, misleading guards, stale compatibility remnants, and code paths that are structurally problematic even if they still execute occasionally.

### 3. Remediation

- Split oversized files by stable architectural responsibility.
- Move duplicated utilities into shared modules where appropriate.
- Do not split files only to satisfy a line-count target; prefer cohesive modules and real factorization over file multiplication.
- Do not introduce a proliferation of small files to evade size limits; keep related logic grouped when separation would only scatter the implementation.
- For every modified file, enforce the line-count policy even if the file was already oversized before the change.
- Do not leave a touched file in a knowingly non-compliant state when the current task can fix it.
- Remove dead, deprecated, and duplicated code discovered during the split.
- Keep runtime behavior deterministic during refactors.
- Reduce or remove non-essential comments, annotations, and explanatory noise when they do not carry durable architectural or behavioral value.
- Simplify verbose code paths, conditionals, wrappers, and indirection when the same behavior can be expressed more clearly and with less code.
- Use the maps to confirm whether logic should be reused, moved, merged, or deleted before keeping parallel implementations in two places.
- Maximize factorization and simplification without removing functionality, changing intended behavior, or breaking the application.
- Remove or rewrite dead, inoperative, or problematic code once the owning behavior has been verified and the safe replacement path is known.

### 4. Governance

- For every file that remains above the critical threshold, document why it still exists in that state.
- For every file above 1000 lines, attach an explicit reduction plan instead of silently accepting it.
- Ensure future tasks do not keep growing critical files without first reducing them.
- Any task that modifies a file must include the compliance work needed to make that file respect size, factorization, cleanup, and validation rules.

## Validation Checklist

- Oversized files are inventoried with clear thresholds.
- Critical files have an explicit reduction plan.
- Deprecated, duplicated, and dead code found during remediation is removed.
- New shared modules are introduced only when they remove real duplication.
- Every modified file is explicitly validated after change.
- Every modified file is checked against the line-count policy before task closure.
- No touched file is left exempt because it was already non-compliant before the change.
- Refactors preserve runtime behavior and architecture contracts.
- Comment and annotation cleanup does not remove useful architectural, contractual, safety, or debugging-critical information.
- Map-guided duplicate checks confirm that similar code is not being kept in multiple places without justification.
- Simplification reduces verbosity without reducing functional coverage or product behavior.
- Dead, inoperative, and problematic code findings are either removed or explicitly justified with owner and remediation plan when removal cannot happen immediately.

## Definition Of Done

- The codebase has an explicit file-size governance policy.
- Existing oversized files are inventoried and prioritized.
- Critical offenders have active reduction work or a documented split plan.
- Coding-standard violations are being reduced at the source.
- Oversized legacy files are no longer treated as normal or acceptable by default.
- Excessive annotations and non-essential commentary are reduced where they harm readability or maintenance.
- Similar logic has been checked against the maps and consolidated when appropriate.
- Verbose code has been simplified as far as possible without feature loss or app regression.
- Dead, inoperative, and problematic code is actively reduced instead of being tolerated as legacy background noise.
