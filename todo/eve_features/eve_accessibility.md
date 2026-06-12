eVe / F — Universal Accessibility Bootstrap & Adaptive Assistant Architecture

## All implementation work defined in this document MUST strictly comply with:

./.codex/AGENTS.md

## Objective

Design and implement a fully integrated accessibility-first onboarding, authentication, and adaptive assistant system for the closed-source eVe/F operating environment.

The system must NOT depend on external accessibility systems such as iOS VoiceOver, Android accessibility layers, browser accessibility APIs, or operating-system-level assistive frameworks.

Accessibility must be intrinsic to the eVe/F shell itself.

The solution must work:

* before authentication;
* during installation;
* during onboarding;
* during daily usage;
* during recovery/error states;
* online and offline;
* across desktop, mobile, webview, and standalone OS modes.

The assistant must act as:

* an accessibility layer;
* a contextual guide;
* a first-use onboarding system;
* an adaptive UI orchestrator;
* a task-oriented assistant;
* an interface simplification engine.

────────────────────────────────
CORE PRINCIPLES
────────────────────────────────

## Current Graph-Based Accessibility Ownership

Status as of 2026-06-12:

* Atome durable state owns semantic accessibility fields under canonical Atome properties.
* `atome/src/shared/atom_graph.js` owns structural graph derivation from canonical state rows or append-only events, including roots, parent-child links, visual order, semantic reading order, focus order, and diagnostics.
* `atome/src/shared/accessible_atom_node.js` owns accessible node normalization for role, label, description, alt text, focusability, visibility, actions, and relations.
* `atome/src/shared/accessibility_graph.js` owns graph-level accessibility derivation from `AtomGraph` and Atome properties. It owns accessible nodes, reading order, focus order, structural relations, inaccessible-node filtering, and diagnostics without reading visible DOM, browser accessibility APIs, renderer payloads, or product UI state.
* `atome/src/shared/accessibility_bridge_contract.js` owns the disposable semantic bridge payload for future browser, WebView, native, or assistant consumers. It mirrors graph ids, labels, roles, actions, relations, reading order, and focus order; it must not create DOM nodes, ARIA attributes, CSS selectors, renderer state, or product UI state.
* `atome/src/shared/semantic_rename_contract.js` owns semantic rename behavior. The canonical rename field is `properties.label`; rename patches also update `properties.accessibility.label`; durable rename events require explicit `tx_id`.
* `eVe/domains/rendering/inline_edit_session.js` owns inline edit session state and focus restoration metadata. It may reference graph or bridge ids as pure data but must reject DOM nodes, functions, selectors, and mutable UI objects.

Ownership rule:

* Accessibility truth must be derived from canonical Atome state and append-only history, not from DOM, Bevy ECS, browser accessibility APIs, hidden text editors, product panel state, screenshots, or visual renderer payloads.
* Accessible actions are declarative capabilities. They may be routed later through approved tool/runtime capability paths, but the graph and bridge do not execute actions and do not imply a DOM event target.
* Focus restoration after inline editing must use pure session data and graph/bridge identifiers. It must not store browser elements or selector strings as authoritative state.
* Product design may consume semantic labels, roles, actions, and order data for presentation, but design tokens, CSS classes, inline styles, and visual selection state remain separate from the accessibility graph.

1. Accessibility is native

Accessibility must NOT be delegated to:

* iOS accessibility APIs;
* Android accessibility systems;
* browser accessibility modes;
* external screen readers.

The eVe/F shell itself must generate:

* speech;
* visual guidance;
* interaction logic;
* navigation assistance;
* adaptive layouts.

────────────────────────────────

2. Accessibility starts BEFORE login

The accessibility assistant must start immediately:

* at first boot;
* at installation;
* before account authentication;
* before session initialization.

The login interface itself must be fully accessible.

────────────────────────────────

3. Dual interaction system

The system must support:

* vocal interaction;
* visual interaction;
* simultaneous hybrid mode.

The user must be able to:

* hear instructions;
* read instructions;
* answer vocally;
* answer visually;
* switch modes dynamically.

────────────────────────────────

4. Adaptive interface

The interface must adapt according to:

* user preference;
* disability profile;
* visual capability;
* hearing capability;
* interaction history;
* current task;
* stress/failure conditions;
* expertise level.

────────────────────────────────
FIRST BOOT FLOW
────────────────────────────────

Stage 1 — Welcome Screen

At startup:

* display a minimal clean interface;
* launch speech synthesis automatically;
* display large readable text;
* show simple visual icons.

Example:

“Welcome to eVe.
Would you like visual guidance, voice guidance, or both?”

Modes:

* visual only;
* voice only;
* hybrid mode.

The system must support:

* touch;
* keyboard;
* voice commands;
* switch devices;
* minimal motor interactions.

────────────────────────────────

Stage 2 — Authentication

Authentication must support:

* vocal guidance;
* sequential navigation;
* large text fields;
* zoomed layouts;
* simplified UI mode.

Possible authentication methods:

* phone number;
* password;
* PIN;
* biometric;
* local offline profile.

Voice flow example:

“Please enter your phone number.”
“Please say or type your password.”
“Authentication successful.”

Security constraints:

* passwords must never be spoken aloud after recognition;
* confirmation must use neutral masking;
* speech processing may be local-first;
* offline authentication fallback must exist.

────────────────────────────────
POST LOGIN ADAPTIVE ASSISTANT
────────────────────────────────

First Use Detection

If first launch:

The assistant asks:

“Would you like guided onboarding?”

Then:

“What would you like to do?”

Examples:

* create music;
* edit video;
* create graphics;
* social media creation;
* programming;
* live performance;
* communication;
* collaboration.

────────────────────────────────

Dynamic UI Adaptation

The assistant dynamically modifies:

* panel visibility;
* UI density;
* icon size;
* typography;
* layout complexity;
* workflow shortcuts;
* displayed tools;
* tutorials;
* contextual help.

Examples:

Video editing mode:

* timeline emphasized;
* media browser enlarged;
* unnecessary modules hidden;
* rendering tools highlighted.

Accessibility mode:

* high contrast;
* large typography;
* reduced cognitive load;
* voice confirmations;
* guided navigation.

────────────────────────────────
MCP INTEGRATION
────────────────────────────────

The assistant must be MCP-native.

The MCP layer must:

* expose all available tools;
* expose all available APIs;
* expose all UI capabilities;
* expose accessibility adaptation hooks;
* expose workflow templates.

The assistant must be able to:

* reconfigure the interface dynamically;
* launch workflows;
* simplify panels;
* create contextual shortcuts;
* explain features;
* guide navigation.

────────────────────────────────
GUIDED TASK MODE
────────────────────────────────

The assistant can guide users interactively.

Example:

User:
“I want to edit a video for social networks.”

Assistant:

* opens the appropriate workspace;
* configures the interface;
* highlights required tools;
* explains each step;
* proposes export presets;
* guides interaction sequentially.

The assistant becomes:

* contextual instructor;
* adaptive workflow orchestrator;
* accessibility layer;
* productivity assistant.

────────────────────────────────
PERSISTENT USER PROFILES
────────────────────────────────

The system stores:

* accessibility preferences;
* interaction modes;
* font scaling;
* speech preferences;
* workflow habits;
* onboarding progression;
* preferred task categories.

Profiles must synchronize:

* online;
* offline;
* cross-device;
* cross-session.

────────────────────────────────
ADVANCED IDEAS
────────────────────────────────

Contextual Explanation Engine

The assistant can explain:

* current panel;
* hovered tool;
* current workflow;
* current error;
* current limitation;
* available actions.

Example:

“This panel allows audio routing between tracks.”

────────────────────────────────

Stress Reduction Mode

If the user appears lost or repeatedly fails:

The assistant may:

* simplify the interface;
* reduce visible complexity;
* propose guided mode;
* enlarge controls;
* activate sequential workflows.

────────────────────────────────

Silent Mode

For hearing-impaired users:

* full visual guidance;
* animated cues;
* subtitles;
* contextual highlights;
* gesture-based confirmations.

────────────────────────────────

Cognitive Simplicity Mode

For beginners:

* progressive disclosure;
* limited simultaneous tools;
* step-by-step navigation;
* tutorial overlays;
* contextual explanations.

────────────────────────────────
TECHNICAL ARCHITECTURE
────────────────────────────────

The assistant architecture must be:

* modular;
* platform-independent;
* runtime-adaptive;
* fully integrated into eVe/F;
* independent from external accessibility APIs.

The assistant should ideally support:

* local STT;
* local TTS;
* remote fallback AI;
* offline operation;
* contextual memory;
* MCP orchestration;
* real-time UI adaptation.

────────────────────────────────
IMPLEMENTATION REQUIREMENTS
────────────────────────────────

The implementation must:

* avoid hacks;
* avoid duplicated accessibility layers;
* avoid platform-specific branching explosion;
* centralize adaptation logic;
* expose accessibility through unified APIs;
* keep latency minimal;
* support future multimodal AI integration.

────────────────────────────────
FINAL OBJECTIVE
────────────────────────────────

Transform eVe/F into:

* a universally accessible creative OS;
* a self-guided adaptive environment;
* an AI-assisted workflow platform;
* a context-aware interface system;
* an onboarding experience that teaches itself dynamically.

The assistant must not merely read the interface.

It must understand:

* what the user wants;
* how the user interacts;
* what the user struggles with;
* how to simplify the experience;
* how to adapt the environment dynamically.

## Execution Constraints

* Do not reinvent existing functionality.
* Do not add unnecessary abstraction layers.
* Do not use DOM hacks when a proper API exists or should exist.
* Do not create fake tests that validate nothing.
* Do not hide errors.
* Do not create silent fallbacks.
* Every API must be properly connected to a tool, then optionally exposed through MCP.
* Tools must remain separated from the UI layer.
* The UI must consume tools/APIs but must not contain business logic.
* Tests must be reproducible.
* Tests must support automated execution.
* Temporary logs are allowed only for diagnosing precise issues.
* Once an issue is resolved, all temporary logs, traces, probes, verbose outputs, and debugging remnants must be completely removed.
* After every feature addition or bug fix:

  * clean the codebase;
  * remove redundancies;
  * factorize when needed;
  * optimize without changing expected behavior.
* During implementation, strictly apply the rules defined in:
