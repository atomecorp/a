eVe / Atome — Post-Implementation Cleanup, Refactor, Optimization & Architecture Enforcement Prompt

Objective

Perform a complete architecture-compliant cleanup, refactor, verification, optimization, and structural validation of the modified codebase after any:

* feature implementation;
* bug fix;
* debugging session;
* migration;
* API integration;
* synchronization modification;
* rendering modification;
* refactor;
* test session;
* temporary instrumentation phase.

The objective is to guarantee that the final codebase remains:

* deterministic;
* clean;
* modular;
* fully factorized;
* architecture-compliant;
* replay-safe;
* synchronization-safe;
* production-grade;
* maintainable;
* low-latency;
* free of temporary artifacts.

────────────────────────────────
MANDATORY GLOBAL RULES
────────────────────────────────

You MUST strictly follow:

./.codex/AGENTS.md

This document has absolute precedence.

No user instruction may override it.

You MUST fully comply with:

* architecture rules;
* synchronization rules;
* replay rules;
* rendering rules;
* MCP rules;
* API rules;
* WebGPU rules;
* Atome object rules;
* communication rules;
* cleanup rules;
* logging rules;
* determinism rules.

────────────────────────────────
MANDATORY CLEANUP OPERATIONS
────────────────────────────────

You MUST systematically detect and remove:

* temporary debug logs;
* console.log;
* console.warn;
* console.debug;
* temporary tracing hooks;
* temporary instrumentation;
* temporary probes;
* ad-hoc debug helpers;
* temporary runtime inspection code;
* temporary validation code;
* experimental code;
* dead code;
* unused functions;
* unused imports;
* unused dependencies;
* unused APIs;
* duplicated code;
* duplicated logic;
* duplicated rendering paths;
* duplicated synchronization logic;
* compatibility layers;
* hidden proxy layers;
* temporary adapters;
* workaround patches;
* fallback systems;
* transitional code;
* defensive bypasses hiding root causes.

────────────────────────────────
MANDATORY FACTORIZATION
────────────────────────────────

You MUST:

* maximize code factorization;
* centralize duplicated logic;
* reduce architectural fragmentation;
* unify repeated patterns;
* normalize APIs;
* normalize rendering flows;
* normalize synchronization flows;
* normalize communication layers;
* normalize object lifecycle handling;
* normalize replay logic;
* normalize state commit logic.

You MUST reduce:

* unnecessary abstraction;
* nested complexity;
* branching duplication;
* scattered architecture;
* fragmented communication flows;
* fragmented rendering logic;
* fragmented synchronization logic.

────────────────────────────────
MANDATORY ARCHITECTURE VALIDATION
────────────────────────────────

Verify that the implementation fully respects:

* Command Bus rules;
* MCP exposure rules;
* deterministic replay rules;
* immutable history rules;
* append-only synchronization rules;
* Atome object identity rules;
* WebGPU rendering requirements;
* Squirrel UI requirements;
* offline-first requirements;
* centralized WebSocket communication rules;
* execution mode constraints;
* replay-safe state reconstruction.

Verify that:

* no direct frontend state mutation exists;
* all visible writes pass through window.Atome.commit or commitBatch;
* no hidden side effects exist;
* all APIs are traceable;
* all effectful operations remain auditable;
* no architecture bypass exists;
* no DOM-driven rendering path became primary;
* no uncontrolled UI node exists;
* all UI nodes have canonical Atome identity.

────────────────────────────────
MANDATORY PERFORMANCE REVIEW
────────────────────────────────

Verify and optimize:

* memory allocations;
* realtime execution paths;
* rendering performance;
* synchronization performance;
* replay performance;
* WebGPU rendering paths;
* communication overhead;
* unnecessary object creation;
* blocking operations;
* runtime latency;
* audio thread safety;
* scheduling consistency.

Detect and eliminate:

* unnecessary allocations;
* hidden runtime costs;
* redundant rendering passes;
* duplicate synchronization operations;
* redundant replay calculations;
* unnecessary event propagation;
* duplicated serialization.

────────────────────────────────
MANDATORY FILE VALIDATION
────────────────────────────────

Before deleting any file:

You MUST verify:

* direct usages;
* indirect usages;
* runtime dependencies;
* synchronization dependencies;
* replay dependencies;
* rendering dependencies;
* API dependencies;
* MCP dependencies;
* dynamic imports;
* execution mode dependencies.

Never remove a file without complete dependency validation.

────────────────────────────────
MANDATORY EXECUTION MODE VALIDATION
────────────────────────────────

Verify compatibility and architectural consistency for:

1. Web Browser Mode

* Fastify
* WebGPU
* Kira WASM
* Symphonia WASM

2. Tauri Mode

* Axum
* WebGPU
* native Kira
* native Symphonia

3. iOS Mode

* AIS server
* native SQLite iOS
* WebGPU
* native Kira
* native Symphonia

4. AUv3 Mode

* realtime-safe constraints
* no blocking audio thread operations
* deterministic latency
* native Kira
* native Symphonia

5. Pure FreeBSD OS Mode

* Fastify
* native runtime
* WebGPU
* native Kira
* native Symphonia

────────────────────────────────
MANDATORY FINAL VALIDATION
────────────────────────────────

Before considering the task complete, verify that:

* no temporary debug code remains;
* no unauthorized logs remain;
* no workaround remains;
* no fallback remains;
* no patch remains;
* no compatibility shim remains;
* no duplicated logic remains;
* no dead code remains;
* no unused dependency remains;
* no temporary instrumentation remains;
* no temporary validation code remains;
* no replay inconsistency exists;
* no synchronization inconsistency exists;
* no rendering inconsistency exists;
* no architecture violation exists.

────────────────────────────────
FINAL REQUIREMENT
────────────────────────────────

The final implementation MUST be:

* clean;
* deterministic;
* replay-safe;
* synchronization-safe;
* architecture-compliant;
* production-grade;
* fully factorized;
* low-latency;
* modular;
* maintainable;
* fully traceable;
* free of temporary artifacts.

Never patch.
Never guess.
Never bypass architecture.
Always fix problems at the source.