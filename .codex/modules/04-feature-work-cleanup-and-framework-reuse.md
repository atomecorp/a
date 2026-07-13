# Feature Work Cleanup And Framework Reuse

This module is part of the active .codex rule set.

## MANDATORY LEGACY FILE PRIORITY AND REMOVAL POLICY

This rule is strict, non-negotiable, and applies to every task without exception: feature work, bug fixes, optimization, refactor, cleanup, migration, API work, rendering work, synchronization work, tests, tooling, and documentation-driven architecture changes.

If the assistant encounters a legacy file, legacy module, legacy code path, legacy adapter, legacy wrapper, legacy bypass, or obsolete implementation involved in the requested scope, that legacy surface immediately becomes a priority of the task.

Mandatory behavior:

- The assistant MUST NOT ignore, preserve by habit, or postpone a legacy surface merely because the user's original request targeted something else.
- A legacy file encountered in scope MUST be analyzed as a first-class architectural liability and treated before the task can be considered complete.
- Legacy files are not allowed to remain in place when their responsibility can be migrated, factorized, replaced by the canonical owner, or removed safely.
- The target state for a legacy file is removal, not coexistence.
- If safe direct deletion is not immediately possible, the assistant MUST perform the necessary migration, call-site cleanup, dependency cleanup, ownership transfer, validation, and structural refactor required to make deletion correct and verifiable.
- Before deleting a legacy file, verify all imports, runtime references, dynamic loading paths, tests, synchronization dependencies, generated outputs, and map or documentation contracts that still depend on it.
- After deleting or replacing a legacy file, run the narrowest relevant executable validations first, then widen as needed to prove that nothing was broken.
- The assistant MUST NOT keep a legacy file as a dormant backup, compatibility layer, fallback, safety copy, or historical duplicate.

Strictly forbidden:

- leaving a known legacy file untouched in the active scope without an evidence-backed reason;
- treating legacy cleanup as optional follow-up when the file is already on the controlling path;
- deleting a legacy file without dependency verification and targeted validation;
- preserving parallel old and new implementations when the legacy surface can be removed.

## ARCHITECTURAL AUTHORITY

The authoritative architecture documentation is located under eve/application/documentations/, documentations/, and maps/. Before generating or modifying code, the assistant MUST ensure full consistency with these documents.

## MANDATORY MAP MAINTENANCE POLICY

The framework maps are active architectural contracts, not optional notes.

Mandatory maps are maps/CODEMAP.md, maps/API_MAP.md, maps/DESIGN_MAP.md, and maps/ARCHITECTURE_MAP.md once it exists.

Whenever a task changes structure, creates new files, moves modules, changes ownership boundaries, adds or modifies code or APIs, changes runtime exposure, changes design tokens, changes JavaScript-generated styling, changes visual factories, or changes product design behavior, the relevant map or maps MUST be updated in the same task.

Map responsibilities:

- CODEMAP: source structure, ownership, reusable modules, entry points, and major responsibility boundaries.
- API_MAP: API families, runtime exposure, public or internal surfaces, and open/closed ownership.
- DESIGN_MAP: JavaScript-generated design, tokens, presets, factories, injected styles, visual assets, and CSS exceptions.
- ARCHITECTURE_MAP: cross-layer architecture, dependency direction, lifecycle, and open/closed boundaries.

It is forbidden to create or move architectural surfaces and leave the maps stale.

## MANDATORY FRAMEWORK REUSE AND FACTORIZATION RULE

This rule is permanently active for every implementation, refactor, cleanup, migration, API change, design change, and structural change.

Before creating, modifying, or adding any file, module, API, component, helper, adapter, service, utility, design token, style generator, visual factory, runtime surface, or documentation-driven architecture contract:

- consult the relevant maps;
- search the existing codebase thoroughly;
- verify whether an equivalent, similar, partial, or reusable implementation already exists.

You must:

1. Prefer extending, connecting to, or factorizing existing code rather than creating a duplicate implementation.
2. Avoid parallel systems, duplicated logic, redundant adapters, temporary wrappers, fallback layers, or isolated implementations.
3. If similar code already exists, refactor or centralize it cleanly instead of adding another version.
4. Ensure new work integrates naturally into the existing architecture and respects the global vision of the framework.
5. Create a new file only when no existing file, module, API, abstraction, token module, or visual factory can correctly host the change.
6. Keep the implementation minimal, smaller when possible, less complex, coherent, maintainable, and aligned with the framework’s existing structure.
7. During every bug fix, debug session, cleanup, refactor, or feature addition, simplify the touched scope whenever possible: remove unnecessary branches, collapse redundant indirection, reduce moving parts, and keep responsibilities tight.
8. Preserve or restore a single canonical source of truth for each responsibility, state, configuration, rendering contract, and business rule touched by the task.
9. If the touched scope contains duplicated ownership, mirrored writable state, competing implementations, or parallel source-of-truth layers, converge them to the canonical owner instead of keeping both alive.
10. Always wire new behavior into the existing canonical module, API, component, state owner, or design contract when it can host the change correctly.
11. Whenever the touched scope still carries legacy `MTrax` naming, identifiers, comments, labels, modules, or references for behavior now owned by Molecule, verify whether they can be renamed or removed coherently and do so whenever the change is safe and verifiable.
12. After implementation, remove obsolete, redundant, unused, temporary, duplicated, or legacy transitional code introduced or discovered during the task.
13. Never leave test code, debug code, probes, traces, temporary logs, or experimental logic in the final result.

Mandatory simplicity gate before creating new code:

1. Can the canonical owner be extended with a smaller direct change?
2. Have existing code, configuration, and dependencies been checked for deletion, merging, or simplification before adding scope, and simplified where safe and relevant?
3. Does the proposed boundary represent a real independent responsibility rather than a speculative future need?
4. Does the change minimize and avoid any unnecessary increase in concepts, writable states, dependencies, branches, or runtime paths?
5. Is every cache, registry, adapter, worker, pool, or dependency justified by measured need or an unavoidable runtime boundary?

If any answer is no, do not add the proposed layer. Continue the inspection and simplify the owning architecture first.

Capacity recovery is mandatory in the touched scope:

- remove unused imports, dependencies, exports, code paths, feature flags, configuration, comments, and documentation claims when they no longer serve a verified purpose;
- collapse duplicated conditionals, aliases, conversions, and indirection into the canonical implementation;
- release resources, subscriptions, timers, listeners, caches, and retained media or GPU objects at their explicit lifecycle boundary;
- do not preserve dead code as a backup, example, dormant option, or historical copy; use version control and documentation for history instead.

Before coding, provide a short implementation plan stating:

- what existing files or modules were inspected;
- what reusable logic or architecture was found;
- what the canonical owner or single source of truth is for the touched behavior;
- whether legacy `MTrax` references in the touched scope can be migrated to Molecule now;
- whether the change will reuse, extend, refactor, or create new code;
- why the chosen approach is the cleanest and most consistent one.

If the codebase already contains the required functionality, do not recreate it. Use it, expose it properly, factorize it, or connect to it.

If multiple sources of truth exist in the touched area, the task is not complete until the change clearly restores or preserves one canonical owner.

If architectural uncertainty exists, stop immediately, request clarification, and never guess architecture behavior.
