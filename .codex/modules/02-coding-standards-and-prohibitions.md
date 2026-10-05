# Coding Standards And Prohibitions

Read this module when changing code, executable configuration, scripts, developer documentation, or their standards. The root instructions and common method have already selected the applicable contracts; their authorization gates apply to every rule below.

## Code quality and simplicity

Generated code must be modular, factorized, production-grade, maintainable, deterministic, DRY, traceable, and professionally structured around explicit architectural owners.

Within the authorized scope, eliminate duplication and dead code, remove unused dependencies, simplify complexity, preserve framework coherence, optimize allocations and realtime performance, and avoid unnecessary abstractions.

At equal correctness, determinism, security, and validation, choose fewer concepts, writable state holders, modules, branches, execution paths, dependencies, allocations, retained resources, code, and configuration. Keep one canonical owner per responsibility.

Before proposing a module, abstraction, adapter, cache, registry, wrapper, service, state layer, compatibility path, or dependency, prove that the existing owner cannot correctly own the responsibility. This evidence does not authorize its creation or extension; apply the root gate.

Forbidden:

- speculative abstractions for imagined future use;
- generalized helpers with one real caller when cohesive direct code is clearer;
- caches, memoization, pooling, indexes, or background work without a measured bottleneck;
- configuration switches preserving obsolete behavior or compensating for unclear ownership;
- adding code to avoid understanding, simplifying, or repairing the owning path.

Use the existing owner when its verified contract can serve the need. Propose a new boundary only for a proven independent responsibility, lifecycle, runtime boundary, or reusable contract. Remove abstractions that no longer reduce total complexity. Prefer deletion, convergence, and direct composition over compatibility layers. Measure performance before proposing a performance mechanism; remove unjustified mechanisms when safe and authorized.

Every substantive change must leave the touched scope no more complex than before. Where safe and relevant, reduce code size, duplicate logic, allocation pressure, dependencies, or runtime work.

## File size and boundaries

Numeric thresholds apply to source code and maintained executable or configuration modules. Markdown, maps, plans, reports, and documentation are exempt, but must remain clear, navigable, coherent, and non-duplicative.

| Size | Requirement |
| --- | --- |
| Under 300 lines | Preferred size. |
| 300–500 lines | Transitional zone; require a cohesive, justified boundary. |
| Above 500 lines | Non-compliant; reduce before adding scope unless the task explicitly performs that reduction. |
| Above 800 lines | Critical legacy state; identify reduction ownership and prohibit feature growth. |
| 1000+ lines | Forbidden without explicit architectural justification and an active reduction plan. |

- Do not create oversized files when a coherent split is possible.
- Do not extend a file above 500 lines unless the authorized task reduces or restructures it.
- Split along stable responsibilities or real shared logic. Artificial fragmentation, pass-through files, proxy wrappers, useless micro-modules, and scattered fragments are forbidden.
- File size never excuses skipping investigation. Inspect important large files in sequential passes and cover their full relevant controlling chain.
- Touched legacy files inherit the same size, factorization, cleanup, and optimization obligations as new code. Bring them into compliance when possible within the authorized scope.
- If compliance requires a broader split or a missing internal component, identify the owner, evidence, and bounded proposal through the common method. Do not enlarge the task automatically or add feature scope while the prerequisite remains unresolved.
- Any justified exception above 800 lines must record the reason, ownership boundary, and reduction plan.

Use clear responsibilities, cohesive boundaries, explicit consistent naming, stable readable public interfaces, and shared owners instead of broad utility duplication. Do not retain dead, deprecated, duplicated, unreachable code or silent paths hiding invalid states.

For each substantively modified executable file:

- run the narrowest relevant executable validation after the edit when one exists;
- check security, authorization, validation, sanitization, trust boundaries, and secret handling for regressions;
- verify final line count, boundaries, factorization, and absence of unjustified fragmentation;
- verify no dead, duplicated, deprecated, or unreachable code remains in the touched scope;
- report unavailable required validation as blocked; do not claim an unvalidated file is complete.

Before deleting a file, verify usages, runtime dependencies, and synchronization dependencies. Apply the fuller dependency checklist in [module 04](04-feature-work-cleanup-and-framework-reuse.md) for legacy removals.

## Root-cause repair

"Patching" here means a symptom-level workaround, not the file-editing tool used to make a source correction. Architecture takes precedence over delivery speed.

Forbidden: temporary fixes, workaround or quick fixes, symptom-level repairs, compatibility shims, defensive guards hiding root causes, silent catches, hidden bypasses, fallback architectures, transitional adapters, duplicated compatibility layers, and proxy layers created to avoid a proper repair.

Identify the root cause and architectural issue. Correct the source and perform a structured refactor or rewrite when required and authorized. If a clean correction needs broader scope, a missing component, or an unresolved architectural decision, follow the common stop-and-proposal procedure. Never implement a temporary solution "until later".

## Language and stack details

The main application language and architectural stack are governed by the root instructions. Existing platform-specific boundaries permit Rust for Tauri and iOS platform code, Swift for iOS native code, Ruby where needed for scripts, and C/C++ for DSP or high-end operations. These exceptions do not authorize moving main application behavior to another language or introducing a new dependency or platform layer.

TypeScript and Python implementations are forbidden. Report the conflicting requirement and a compliant alternative rather than implementing them.

Generated comments, internal logs, warnings, errors, documentation, and debug messages must be English. User-visible and assistive text instead follows the localization policy below.

Do not generate raw product HTML or CSS outside documented existing shell, native, or canonical Squirrel/Atome ownership exceptions in [modules 01](01-root-constitution.md) and [05](05-api-rendering-and-ui.md). Do not use browser/system `alert` or `confirm` dialogs for product flows; use the verified internal dialog owner. If none can serve the need, follow the root missing-component gate rather than inventing a substitute.

## Temporary artifacts

All temporary files belong exclusively under the main repository's `temp/`: probes, debug or validation scripts, fixtures, outputs, screenshots, and logs. Persistent tests belong exclusively under `tests/`.

Never create temporary files in source, documentation, tools, repository root, or elsewhere. When working from eVe or another subdirectory, resolve these paths against the main repository root, not the current directory.

## Git operations

Git inspection is allowed as needed. Git writes require an explicit user request for conflict resolution or integration; a coding request, status inspection, or observed conflict alone does not authorize them.

For an explicitly authorized integration request, agents may fetch, start or continue a merge or rebase, preserve local work with stash, resolve conflicts, stage resolved files, create or switch branches, update a submodule, and create the commits needed for the integration. Inspect the working trees first, preserve unrelated local work, inspect the resulting diff, and report commits and remaining changes.

Agents must never run `git push`, including force-push. The user performs all pushes. Do not delete branches or tags, discard local changes with `reset --hard`, `restore`, or `clean`, or change Git credentials, hooks, remotes, or configuration. Outside explicitly requested conflict resolution or integration, Git remains read-only.

## Fallbacks and localization

Runtime, data, control-flow, silent, proxy, and legacy-bypass fallbacks are forbidden. Missing dependencies must produce explicit errors and follow the root missing-component gate.

The only permitted fallback forms are `eveT(key, fallback)` and `ui.label_fallback`, strictly for translating user-visible labels or messages. They cannot replace an unavailable tool, unsupported type, missing property, component, runtime capability, dependency, mutation route, or architecture. No other fallback mechanism is permitted. Correct missing translation keys in scope instead of using these exceptions to hide unresolved localization defects.

All user-visible system and Atome text must use the existing `eveT()` internationalization system. This includes tools, panels, dialogs, modals, confirmations, objects, menus, tooltips, buttons, labels, placeholders, empty states, statuses, visible warnings and errors, onboarding, helpers, and accessibility-facing text.

Hardcoded user-visible strings are forbidden in tools, panels, dialogs, object definitions, and system UI. Group keys by domain, such as `eve.menu.*` and `eve.user.*`. Internal English-only developer messages must not be confused with localized visible or assistive messages.
