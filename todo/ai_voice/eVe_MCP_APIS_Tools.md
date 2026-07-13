# Unified MCP / API / Tooling Architecture Tasks

All implementation work MUST strictly comply with:
./.codex/AGENTS.md
This document only defines functional and architectural objectives.

Objective

Create a fully structured and standardized development workflow for Atome / eVe so that:

* every API is discoverable;
* every tool is linked to a clear MCP capability;
* every capability is documented;
* every component can be automatically indexed;
* all future coding follows a unified architecture contract;
* testing and validation become systematic;
* AI coding assistants can operate using a strict pre-prompt architecture specification.

⸻

Phase 1 — Integrate the Code Editor

Goals

Integrate a professional code editor inside Atome/eVe capable of:

* editing MCP tools;
* editing APIs;
* editing schemas;
* editing prompts;
* editing runtime objects;
* editing workflows;
* editing tests;
* interacting with the MCP system.

Requirements

The editor must:

* support syntax highlighting;
* support TypeScript, JavaScript, Rust, Ruby, JSON, Markdown;
* support schema validation;
* support autocomplete;
* support AI-assisted generation;
* support direct MCP inspection;
* support structured tool declarations;
* support API metadata visualization;
* support live reload when possible;
* support future visual debugging.

Expected Outcome

The editor becomes the central environment for:

* API creation;
* MCP capability declaration;
* testing;
* debugging;
* architecture validation.

⸻

Phase 2 — Create an Automated API Testing System

Goals

Generate a complete automated testing framework able to validate:

* audio APIs;
* video APIs;
* MCP APIs;
* synchronization APIs;
* storage APIs;
* communication APIs;
* runtime APIs;
* UI APIs;
* offline/online behavior;
* cross-platform compatibility.

Requirements

The testing framework must:

* support unit tests;
* support integration tests;
* support stress tests;
* support realtime tests;
* support latency measurement;
* support API contract validation;
* support MCP compatibility verification;
* support automatic reporting;
* support failure diagnostics;
* support platform-specific validation.

Expected Outcome

Every API and MCP capability can be validated automatically before integration.

⸻

Phase 3 — MCP Validation and Integration

Goals

Ensure every tool and API can be:

* exposed as MCP capabilities;
* discovered automatically;
* executed safely;
* categorized correctly;
* documented consistently;
* versioned properly.

Requirements

Each MCP capability must include:

* unique identifier;
* category;
* description;
* permissions;
* risk level;
* side effects;
* input schema;
* output schema;
* execution environment;
* supported platforms;
* examples;
* version;
* dependency list;
* rollback capability when relevant.

Expected Outcome

Atome/eVe gains a professional MCP infrastructure with deterministic capability discovery.

⸻

Phase 4 — Global API and Tool Registry System

Goals

Create a mandatory centralized registry system for all APIs and tools.

Every newly created:

* API;
* tool;
* MCP capability;
* runtime service;
* internal module;
* automation;
* communication layer;
* multimedia engine;

must be automatically declared inside a global registry.

⸻

Registry Requirements

Every API Must Include

* API name;
* category;
* description;
* owner/module;
* input schema;
* output schema;
* dependencies;
* supported platforms;
* realtime compatibility;
* offline compatibility;
* online compatibility;
* MCP mapping;
* security requirements;
* version;
* test coverage;
* examples;
* status;
* deprecation policy.

Every Tool Must Include

* tool name;
* linked APIs;
* MCP capability mapping;
* required permissions;
* execution environment;
* supported runtimes;
* UI dependency;
* headless compatibility;
* examples;
* risk level.

⸻

Automatic Discovery System

Goals

The architecture must support automatic discovery of:

* APIs;
* tools;
* MCP capabilities;
* services;
* runtime modules.

Requirements

When a developer creates a new API or tool:

1. it must be automatically registered;
2. metadata must be validated;
3. schemas must be validated;
4. MCP mapping must be verified;
5. documentation must be generated or updated;
6. tests must be linked automatically;
7. category classification must be enforced.

⸻

Suggested Architecture

Possible Structure

/registry/apis/
/registry/tools/
/registry/mcp/
/registry/schemas/
/docs/apis/
/docs/tools/
/docs/mcp/
/tests/apis/
/tests/tools/

⸻

Metadata Standardization

Goals

Define a unified declaration format for:

* APIs;
* MCP capabilities;
* tools;
* services;
* runtime objects.

Suggested Format

Possible formats:

* JSON;
* YAML;
* TypeScript declarations;
* hybrid schema-driven registry.

Requirements

The declaration format must:

* be machine readable;
* be AI readable;
* support automatic documentation;
* support validation;
* support dependency analysis;
* support permission analysis;
* support code generation;
* support future visual tooling.

⸻

Documentation Requirements

Every API and tool must generate:

* developer documentation;
* MCP documentation;
* examples;
* usage constraints;
* supported environments;
* platform limitations;
* lifecycle information.

Documentation generation should be automated whenever possible.

⸻

Phase 5 — Framework Code and API Map

Objective

Create and maintain a structured framework map so future development tasks can reuse existing code, APIs, modules, helpers, services, adapters, and components without scanning the whole codebase blindly every time.

This map becomes a mandatory entry point before any new implementation.

The goal is to prevent duplicated logic, parallel systems, redundant APIs, architectural drift, and unnecessary reinvention.

Required Output Files

Create or update:

* `./maps/CODEMAP.md`
* `./maps/API_MAP.md`
* `./maps/ARCHITECTURE_MAP.md`

If `./docs` does not exist, create it.

Mandatory Analysis Before Writing the Maps

Before creating or updating the maps, inspect the codebase and identify:

1. main directories and their purpose;
2. existing APIs;
3. existing services;
4. existing helpers and utilities;
5. existing UI components;
6. existing backend and native adapters;
7. existing runtime-specific code;
8. existing MCP and tool-related code;
9. existing duplicated or overlapping logic;
10. areas where the architecture is unclear or undocumented.

Do not invent architecture that is not present in the code.

If something is uncertain, mark it clearly as:

`Status: To verify`

Do not hallucinate missing APIs.

`CODEMAP.md` Requirements

Create a tree-like framework map grouped by responsibility, not as a raw file dump.

For each major area, document:

* path;
* role;
* main responsibility;
* related modules;
* canonical owner or owning layer;
* main entry points;
* primary upstream callers or dependents when known;
* primary downstream services, adapters, or storage dependencies when known;
* search keywords, aliases, and legacy names when they exist;
* whether it exposes reusable logic;
* whether it should be reused, extended, or avoided;
* known duplication risks.

The description must be precise enough that a future coding task can determine where similar logic already lives and where a new change must connect.

The map must help answer quickly:

* does this already exist;
* where should this feature be added;
* which module owns this responsibility;
* whether creating a new file is justified.

`API_MAP.md` Requirements

Create a complete map of public, semi-public, and internal APIs.

For each API, document:

* API name;
* file path;
* exported functions or classes;
* exact or normalized signature shape when known;
* purpose;
* input parameters;
* output format;
* side effects;
* runtime target when applicable: Web, Tauri, iOS, AUv3, FreeBSD, server, and others when relevant;
* related MCP or tool exposure when applicable;
* main call sites or consuming modules when known;
* backend, adapter, storage, transport, or bridge dependencies when known;
* canonical location for future extension;
* known aliases, historical names, or replacement APIs when they exist;
* whether the API is stable, experimental, deprecated, missing, or `To verify`;
* what should reuse it.

The map must clearly state which APIs must be reused first and which duplicate implementations must not be created.

The API descriptions must be precise enough that a future coding task can verify whether an equivalent API already exists and can connect to it without reopening a broad exploratory search.

`ARCHITECTURE_MAP.md` Requirements

Create a high-level architecture map describing:

* global architecture;
* major layers;
* runtime modes;
* data flow;
* UI, tool, API, runtime, backend, storage, sync, and MCP separation;
* source-of-truth rules;
* where new code should go;
* where new APIs should be declared;
* where MCP tools should connect;
* what must never be duplicated.

Suggested sections:

* Global Vision
* Main Layers
* Runtime Modes
* Code Placement Rules
* Reuse Rules
* Anti-Duplication Rules
* MCP Integration Rules
* Maintenance Rules

Tree Optimization Requirement

The maps must be optimized for future AI and developer navigation.

Do not dump every file mechanically.

Group files and APIs by responsibility, and for each major area provide:

* Area
* Purpose
* Main files
* Exact ownership
* Reusable APIs
* Internal helpers
* Runtime targets
* Main integration points
* Search keywords and legacy aliases
* Should be extended by
* Should not be duplicated by
* Notes

Mandatory Usage Rule

Before implementing any new feature, bug fix, refactor, API, component, service, adapter, helper, utility, or tool, the coding agent must first consult:

* `./maps/CODEMAP.md`
* `./maps/API_MAP.md`
* `./maps/ARCHITECTURE_MAP.md`

Then it must perform only targeted verification in the codebase.

If the maps identify an existing API, helper, module, service, component, adapter, or architectural pattern that matches the task, it must be reused, extended, exposed properly, or factorized.

Creating new code is allowed only when no existing location or abstraction can correctly support the change.

If new code changes framework structure, exposes a new API, modifies an existing API, moves responsibilities, or removes duplicated logic, the maps must be updated in the same task.

Integration With Future Coding Tasks

Any future implementation prompt must include this rule:

Before creating, modifying, or adding any file, module, API, component, helper, adapter, service, or utility, first consult:

* `./maps/CODEMAP.md`
* `./maps/API_MAP.md`
* `./maps/ARCHITECTURE_MAP.md`

Then perform a targeted verification in the codebase.

If an equivalent, similar, partial, or reusable implementation already exists, reuse it, extend it, expose it properly, or factorize it.

Do not reinvent the wheel.

Do not create parallel systems, duplicated logic, redundant adapters, fallback layers, wrappers, or isolated implementations unless there is a documented architectural reason.

If creating a new file or API is truly necessary, justify why no existing file, module, API, or abstraction can correctly host the change.

After implementation, remove obsolete, redundant, unused, temporary, or duplicated code introduced or discovered during the task.

Update the relevant maps if the task changes structure, APIs, responsibilities, or reuse rules.

Final Response Required

After completing the mapping task, provide a concise report with:

* files created or updated;
* main APIs discovered;
* main reusable modules discovered;
* duplication risks found;
* unclear areas marked `To verify`;
* recommendations for future cleanup.

This task is documentation and architecture mapping only.

⸻

Unified AI Coding Pre-Prompt

Goals

Create a master pre-prompt document used before every AI-assisted coding task.

This pre-prompt must enforce:

* Atome/eVe architecture rules;
* MCP integration rules;
* API declaration rules;
* registry rules;
* testing rules;
* synchronization rules;
* realtime requirements;
* modularity requirements;
* performance constraints;
* cleanup rules;
* debugging rules;
* documentation requirements.

⸻

Mandatory Enforcement Rules

The AI coding pre-prompt must require:

1. Every API to be declared in the registry.
2. Every tool to be linked to MCP.
3. Every MCP capability to include schemas.
4. Every feature to include tests.
5. Every temporary debugging log to be removed after resolution.
6. Every generated code path to respect the Atome architecture.
7. Every module to support future extensibility.
8. Every API to support deterministic behavior.
9. Every component to avoid hidden implicit dependencies.
10. Every implementation to prioritize maintainability and clarity.
11. Every implementation task to consult `./maps/CODEMAP.md`, `./maps/API_MAP.md`, and `./maps/ARCHITECTURE_MAP.md` before broad codebase search.
12. Every task to reuse, extend, or factorize existing framework code before creating new modules.
13. Every structural or API change to update the relevant framework maps in the same task.

⸻

Phase 6 — Close the Remaining Normalization and AI-Control Gaps

Objective

Make the architecture fully AI-controllable in practice, not only by design, while preserving one canonical state, mutation, security, history, and synchronization model.

This phase consolidates the remaining cross-cutting risks identified during the architecture review. It must be completed before claiming that the framework is fully normalized and universally pilotable through MCP.

Mandatory Workstreams

1. Source-of-truth and runtime authority

* Document and enforce the precise authority model:
  * local Tauri/iOS runtime is the operational authority while offline;
  * Fastify/cloud is the shared synchronization authority;
  * synchronization is deterministic, append-only, lossless, and conflict-aware.
* Remove contradictory documentation and implementation paths that describe Fastify as the only immediate writer while also requiring local-first execution.
* Add contract tests for offline commit, delayed synchronization, reconnect, replay, and cross-device convergence.

2. Single mutation gateway

* Inventory every public, internal, legacy, and runtime mutation API.
* Route every durable mutation through ToolRuntime and CommandBus/ADOLE.
* Remove or formally deprecate direct domain APIs, direct property assignment, DOM mutation, renderer-owned state, and hidden shortcuts that bypass the canonical gateway.
* Reject new bypasses through CI/static checks and targeted integration tests.
* Any convenience syntax such as `A.color = 'red'` must compile to a canonical intention and must never perform an untracked direct mutation.

3. Strict Atome type and property contracts

* Enforce one canonical Atome envelope and one versioned type registry.
* Validate `type`, `kind`, `traits`, and `properties` at creation and mutation boundaries.
* Reject unknown properties unless an explicit schema extension allows them.
* Keep renderer, DOM, cache, debug, and transport details out of canonical Atome data.
* Add schema compatibility, migration, and rejection tests for every AI-facing type family.

4. Secure AI-created tools and code

* Treat every AI-created tool, script, connector, and automation as untrusted input.
* Require schema validation, capability declarations, policy evaluation, sandboxed execution, idempotency, audit, versioning, and explicit ownership before activation.
* Forbid raw filesystem, network, process, secret, or native access from generic AI code unless an explicit approved connector exposes it.
* Require confirmation tokens for high-risk, destructive, external, financial, publication, sharing, and privilege-changing actions.
* Add tests proving denied, confirmation-required, replayed, expired, and unauthorized calls cannot execute.

5. Complete MCP coverage and parity

* Generate or co-locate MCP definitions with the canonical ToolRuntime/API implementation.
* Produce a coverage report for every capability: registry entry, runtime tool, MCP exposure, schema, ACL, risk metadata, audit, history policy, supported runtimes, and tests.
* Eliminate undocumented direct-domain exceptions; if a capability has no ToolRuntime surface, register it as a blocking migration item.
* Verify behavioral parity across UI, API, script, batch, voice, and MCP for the same tool.
* Verify that MCP is an adapter to the canonical runtime, never a second execution engine.

6. Legacy and exception closure

* Inventory legacy bridges, fallback paths, duplicate APIs, and unregistered capabilities.
* Assign each one a canonical replacement, owner, migration test, and removal condition.
* Do not claim full normalization while an active production path remains outside the canonical registry and mutation gateway.

Definition of Done

The phase is complete only when:

* every supported business capability is discoverable as a canonical tool and MCP capability;
* every mutation has one auditable write gateway;
* Atome schemas are enforced at all boundaries;
* AI-created code is capability-gated and sandboxed;
* local/offline and cloud authority rules are documented and tested;
* UI, API, script, batch, voice, and MCP produce equivalent validated effects;
* coverage, bypass, legacy, and normalization reports pass with no unexplained exceptions;
* the relevant architecture, API, and code maps are updated in the same task.

⸻

Final Objective

Build a professional-grade unified architecture where:

* APIs;
* tools;
* MCP capabilities;
* services;
* runtime modules;
* AI coding workflows;
* testing systems;
* documentation systems;

all operate under a single coherent standardized ecosystem.

The entire architecture must remain:

* modular;
* discoverable;
* AI-compatible;
* deterministic;
* maintainable;
* cross-platform;
* scalable;
* realtime-ready;
* synchronization-aware.
