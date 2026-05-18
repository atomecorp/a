Unified MCP / API / Tooling Architecture Tasks

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

