# Coding Standards And Prohibitions

This module is part of the active .codex rule set.

## MANDATORY CODE QUALITY RULES

All generated code must be:

- modular;
- highly factorized;
- production-grade;
- maintainable;
- deterministic;
- DRY;
- architecture-oriented;
- fully traceable;
- professionally structured.

You must:

- eliminate duplication;
- remove dead code;
- remove unused dependencies;
- simplify complexity;
- preserve coherence across the framework;
- optimize memory allocations;
- optimize realtime performance;
- avoid unnecessary abstractions.

## MANDATORY SIMPLICITY AND RESOURCE EFFICIENCY POLICY

Simplicity is a mandatory architectural constraint, not a stylistic preference.

At equal correctness, determinism, security, and validation, choose the solution with:

- fewer concepts to understand;
- fewer writable state holders;
- fewer modules, branches, and execution paths;
- fewer dependencies, allocations, and retained resources;
- less code and less configuration;
- one explicit canonical owner for every responsibility.

Before adding a module, abstraction, adapter, cache, registry, wrapper, service, state layer, compatibility path, or new dependency, prove that the existing canonical architecture cannot correctly own the responsibility.

Strictly forbidden:

- speculative abstractions created for imagined future use;
- generalized helpers with only one real caller when direct cohesive code is clearer;
- caches, memoization, pooling, background work, or indexes without measured evidence of a real bottleneck;
- new configuration switches that only preserve obsolete behavior or compensate for unclear ownership;
- adding code to avoid reading, understanding, simplifying, or correctly repairing the owning path.

Required decision rules:

1. Extend the existing canonical owner when it can own the behavior cleanly.
2. Create a new boundary only for a proven independent responsibility, lifecycle, runtime boundary, or reusable contract.
3. Remove an abstraction when it no longer reduces total complexity.
4. Prefer deletion, convergence, and direct composition over another compatibility layer.
5. Measure performance before adding a performance mechanism; remove the mechanism if the evidence no longer justifies its cost.

Every substantive change must leave the touched scope no more complex than before. When safe and relevant, it must reduce code size, duplicate logic, allocation pressure, dependency surface, or runtime work.

## MANDATORY FILE SIZE AND CODING STANDARDS

The codebase MUST respect explicit file-size, module-boundary, and cleanup rules.

Scope and thresholds:

- This policy applies to source code and maintained executable or configuration modules.
- Markdown files, maps, plans, reports, and documentation are exempt from the numeric thresholds because they are documentary, not executable, but they must still remain clear, navigable, non-duplicative, and architecturally coherent.
- ideal file: under 300 lines;
- transitional zone: 300 to 500 lines only when the module remains cohesive and the boundary is architecturally justified;
- hard maximum for a normal module: 500 lines;
- above 500 lines: non-compliant and must be reduced before adding new scope, except when the current task is explicitly performing that reduction;
- above 800 lines: critical legacy state requiring immediate reduction ownership and no feature growth;
- 1000+ lines: forbidden without explicit architectural justification and an active reduction plan.

Mandatory rules:

- Do not create new oversized files when a split is possible.
- Do not keep extending a file already above 500 lines unless the current task is explicitly reducing or restructuring it.
- Do not multiply files artificially to satisfy line-count targets; split only along stable responsibilities or real shared reusable logic.
- Do not create pass-through files, proxy wrappers, useless micro-modules, or scattered file fragments just to lower a line count.
- File-size thresholds and legacy complexity never authorize skipping, deferring, or aborting the treatment of an important file during debugging, optimization, cleanup, or refactoring work.
- Every touched file, including legacy files, inherits the same size, factorization, cleanup, and optimization obligations as new code.
- If a touched file can be brought into compliance within the current scope, it must be.
- If compliance requires a broader architectural split, that split becomes part of the task rather than an optional follow-up.
- Any justified exception above 800 lines must document the reason, ownership boundary, and intended reduction plan.

Coding standards:

- one clear responsibility per module whenever architecture allows it;
- strong factorization without artificial file multiplication;
- cohesive file boundaries;
- explicit and consistent naming;
- stable and readable public interfaces;
- no dead, deprecated, duplicated, or unreachable code;
- no silent failure paths hiding invalid states;
- no broad utility duplication when a shared module is appropriate;
- no artificial fragmentation that harms navigation or hides cohesion problems.

Mandatory validation for every modified file:

- run the narrowest relevant executable validation after each substantive edit when one exists;
- verify security, authorization, validation, sanitization, trust boundaries, and secret handling did not regress;
- verify final line count, module boundary, and factorization quality;
- verify the change did not scatter previously cohesive logic across an unjustified number of files;
- verify no dead, duplicated, deprecated, or unreachable code remains in touched files;
- do not finalize while a touched file remains unvalidated.

Before deleting files, verify all usages, runtime dependencies, and synchronization dependencies.

## ABSOLUTE PROHIBITION OF PATCHING

Patching is categorically forbidden.

Architecture always takes precedence over delivery speed.

The following are strictly prohibited:

- temporary fixes;
- workaround patches;
- quick fixes;
- symptom-level fixes;
- compatibility shims;
- defensive guards hiding root causes;
- silent catch blocks;
- hidden bypasses;
- fallback architectures;
- transitional adapters;
- duplicated compatibility layers;
- intermediary proxy layers created to avoid proper fixes.

You must:

- identify the root cause;
- isolate the architectural issue;
- fix the problem at the source;
- perform deep refactors when necessary;
- perform structural rewrites when required.

If a clean solution is impossible:

- stop;
- explicitly explain the architectural uncertainty;
- request clarification.

Under no condition may a temporary solution be implemented “until later”.

## LANGUAGE AND STACK POLICY

Implementation languages are restricted to JavaScript only for the main codebase, Rust for Tauri and iOS platform code, Swift for iOS native code, Ruby when needed for scripts, and C/C++ for DSP or high-end operations.

Strictly forbidden languages: TypeScript and Python.

All generated comments, logs, warnings, errors, documentation, and debug messages must be written exclusively in English.

Any request requiring TypeScript or Python implementation must be refused.

## TEMPORARY FILE POLICY

All temporary files MUST be created exclusively under ./temp. This includes probes, debug scripts, validation scripts, temporary fixtures, temporary outputs, and temporary logs.

Persistent test files MUST be created exclusively under ./tests.

Temporary files MUST NEVER be created in source directories, documentation directories, tool directories, project root, or anywhere outside ./temp.

## GIT CONFLICT RESOLUTION POLICY

Git inspection is allowed when needed for the task.

Only when a user explicitly asks the agent to perform Git conflict resolution or integration may the agent run Git write operations for that request. A coding task, a request to inspect Git status, or the presence of conflicts does not by itself authorize Git write operations. For an explicitly authorized request, the agent may fetch changes, start or continue a merge or rebase, preserve local work with stash, resolve conflicts, stage resolved files, create or switch to a branch, update a submodule, and create the commits needed to complete the integration. Before acting, inspect the working tree and preserve unrelated local changes. Inspect the resulting diff and report the commits and remaining local changes.

Agents must never run git push, including force-push. The user performs every push. Agents must not delete branches or tags, discard local changes with reset --hard, restore, or clean, or change Git credentials, hooks, remotes, or configuration. Outside the scope of an explicit user request for conflict resolution or integration, Git remains read-only for agents.

## FALLBACK POLICY

Forbidden:

- runtime fallbacks;
- data fallbacks;
- control-flow fallbacks;
- hidden proxies;
- silent fallback behavior;
- legacy bypass routes.

Missing dependencies MUST generate explicit errors.

Only allowed exception:

- eveT(key, fallback)
- ui.label_fallback

No other fallback mechanism is permitted.

## INTERNATIONALIZATION POLICY

All user-visible text MUST use the existing Atome/eVe internationalization system:

- eveT()

This applies to every system text rendered or exposed by:

- tools;
- panels;
- dialogs;
- modal windows;
- confirmation boxes;
- system objects;
- Atome objects;
- menu entries;
- tooltips;
- buttons;
- labels;
- placeholders;
- empty states;
- status messages;
- visible warnings;
- visible errors;
- onboarding or helper text;
- accessibility-facing text when it is user-visible or assistive.

Hardcoded user-visible strings are forbidden in tools, panels, dialogs, object definitions, and system UI.

Keys must remain grouped by domain:

- eve.menu.*
- eve.user.*
- etc.

Non-i18n-compliant labels, placeholders, messages, titles, buttons, and system UI text are forbidden.

English-only internal code comments, logs, warnings, debug messages, and developer documentation remain governed by the LANGUAGE AND STACK POLICY and must not be confused with user-visible localized text.
