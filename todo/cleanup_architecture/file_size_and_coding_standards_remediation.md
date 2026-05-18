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
- warning threshold: 500 lines
- critical threshold: 800 lines
- forbidden without explicit architectural justification and a reduction plan: 1000+ lines

## Scope

This task covers:

1. Existing source files already above size thresholds.
2. Existing files mixing too many responsibilities.
3. Existing code that violates mandatory coding standards.
4. Missing reduction plans for oversized legacy files.

## Mandatory Coding Standards

The remediation must enforce at least the following rules:

- one clear responsibility per module whenever architecture allows it
- no dead, deprecated, duplicated, or unreachable code kept by inertia
- no silent catch or silent failure path hiding structural problems
- no repeated local utility logic across many files when a shared module is appropriate
- explicit and stable naming
- maintainable file boundaries and readable control flow

## Required Work

### 1. Inventory

- Identify all files above 300, 500, 800, and 1000 lines.
- Group oversized files by subsystem and responsibility.
- Distinguish justified legacy boundaries from uncontrolled accumulation.

### 2. Structural Audit

- Identify files that combine unrelated domains or responsibilities.
- Identify files where complexity comes from duplicated helpers, repeated guards, repeated transport logic, repeated DOM scans, or repeated state resolution logic.
- Identify files whose size is causing navigation, maintenance, or regression risk.

### 3. Remediation

- Split oversized files by stable architectural responsibility.
- Move duplicated utilities into shared modules where appropriate.
- Remove dead, deprecated, and duplicated code discovered during the split.
- Keep runtime behavior deterministic during refactors.

### 4. Governance

- For every file that remains above the critical threshold, document why it still exists in that state.
- For every file above 1000 lines, attach an explicit reduction plan instead of silently accepting it.
- Ensure future tasks do not keep growing critical files without first reducing them.

## Validation Checklist

- Oversized files are inventoried with clear thresholds.
- Critical files have an explicit reduction plan.
- Deprecated, duplicated, and dead code found during remediation is removed.
- New shared modules are introduced only when they remove real duplication.
- Refactors preserve runtime behavior and architecture contracts.

## Definition Of Done

- The codebase has an explicit file-size governance policy.
- Existing oversized files are inventoried and prioritized.
- Critical offenders have active reduction work or a documented split plan.
- Coding-standard violations are being reduced at the source.
- Oversized legacy files are no longer treated as normal or acceptable by default.
