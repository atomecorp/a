# Molecule Rename Plan

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Objective

Align the internal naming with the product domain.

The user-facing domain is Molecule, but the codebase still mixes `mtrack`, `mtrax`, `mtracks`, `hmtracks`, `MTRACK`, and `MTRAX` across runtime modules, UI layers, logs, APIs, and diagnostics.

This task defines the dedicated rename plan needed to migrate legacy naming toward `molecule`.

## Current Problem

- The visible product domain is Molecule, but internal names still mostly use legacy Mtrack or Mtrax variants.
- The names mix multiple historical layers: timeline, tracks, audio engine, panel, preview, bridge, and window APIs.
- Some files live under `domains/mtrax`, some variables use `mtrack`, and logs alternate between `MTRACK_TRACE`, `MTRACK_VIDEO_DIAG`, `MTRACK_IOS_*`, and `hmtracks_audio_stage`.

## Impact

- Code search is noisy and incomplete: searching for `mtrax` misses part of the surface, while searching for `mtrack` returns too much unrelated legacy material.
- New work can pick an arbitrary prefix and deepen the inconsistency.
- The internal API surface does not reflect the actual user domain `molecule`.
- Logs and diagnostics are harder to correlate.

## Target State

- The application domain should read as `molecule`.
- Legacy names `mtrack`, `mtrax`, and `mtracks` must remain only in clearly identified migration adapters or hard compatibility boundaries.
- Main diagnostic namespaces should be unified, for example `MOLECULE_TRACE`, `MOLECULE_LAYOUT`, `MOLECULE_PREVIEW`, and `MOLECULE_AUDIO`.

## Rename Scope

The migration must be done progressively by layer to reduce risk.

1. File and module names.
2. Variables, functions, and classes.
3. Dataset attributes and CSS class names.
4. DOM events and custom event names.
5. Window APIs and public runtime entry points.
6. Logs, probes, and diagnostic tags.

## Mandatory Rules

- Rename progressively toward `molecule`.
- Keep temporary compatibility aliases only at public boundaries.
- Every remaining alias must be explicit, temporary, and documented.
- Legitimate exceptions must be documented, for example `hmtracks` if it is still a distinct third-party or backend name.
- Do not introduce new internal names using `mtrack`, `mtrax`, or `mtracks`.

## Execution Plan

### Phase 1 - Inventory

- Inventory all symbols using `mtrack`, `mtrax`, and `mtracks`.
- Separate internal names from public compatibility surfaces.
- Identify legitimate exceptions such as third-party or backend-specific names.

### Phase 2 - Internal Rename

- Rename internal files and modules toward `molecule`.
- Rename internal variables, functions, classes, and helpers toward `molecule`.
- Rename internal datasets, CSS classes, and DOM event names toward `molecule` where the runtime contract allows it.

### Phase 3 - Boundary Cleanup

- Keep temporary aliases only on public APIs that still need backward compatibility.
- Document each remaining alias and the removal phase.
- Ensure new code paths use only `molecule` naming.

### Phase 4 - Diagnostic Cleanup

- Rename the main logs toward a `MOLECULE_*` namespace.
- Keep diagnostics searchable under the new canonical naming.
- Remove mixed old/new diagnostic prefixes once compatibility windows close.

## Definition Of Done

- Most internal names use `molecule` instead of `mtrack`, `mtrax`, or `mtracks`.
- Remaining legacy names are limited to explicit compatibility or backend-specific exceptions.
- The rename plan is documented and traceable.
- New development surfaces use `molecule` naming only.
- Main logs use a unified `MOLECULE_*` namespace.
