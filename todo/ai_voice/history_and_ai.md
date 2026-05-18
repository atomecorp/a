# Atome – Three-State History, Validation, and Runtime State System

## Purpose

This document defines the functional and technical specifications required to implement a **three-part state system** in Atome, enabling:

* Full historical traceability of user and AI actions
* Explicit, user- or AI-controlled validation states (manual snapshots)
* High-performance access to the current scene state

This system is designed to allow AI agents (via MCP or other interfaces) to understand, reason about, and manipulate the Atome environment without relying on a virtual DOM or accessibility APIs.

---

## Core Principles

1. **Everything meaningful is historized**
2. **Nothing is implicitly snapshotted**
3. **The current state must always be directly accessible**
4. **History is authoritative, current state is optimized**
5. **Validation states are intentional and explicit**

---

## The Three-State Model

### 1. Historical State (Event-Level History)

The historical state is the complete, append-only record of all actions performed in the system.

#### Scope

The following must be historized:

* Object creation and deletion
* Object transformations:

  * Position (x, y, z)
  * Size / scale
  * Rotation
* Visual and structural properties
* Tool creation
* Tool deletion
* Tool configuration changes
* Application of tools to objects
* Script creation and modification
* Script execution when it produces side effects
* Any action performed by an AI agent

Each historical entry must include:

* Timestamp
* Actor (user ID or AI agent ID)
* Target object(s)
* Action type
* Parameters (before / after when applicable)
* Tool or script identifier if involved

History must be **sufficient to deterministically replay the scene** from any validated state.

---

### 2. Validation States (Manual Snapshots)

Validation states are **explicitly declared stable states** of the scene.

They serve two purposes:

* User-defined save points
* Performance anchors for fast reconstruction

#### Key Characteristics

* No automatic snapshots
* Created only by:

  * User action
  * AI action explicitly authorized by the user
* Stored as *validated state markers*, not full scene dumps

A validation state represents:

* A reference to a specific point in history
* Optional metadata (name, description, intent)

Example use cases:

* "This layout is final"
* "Baseline before AI modification"
* "Approved version for sharing"

Validation states may be used as:

* Starting points for history replay
* Rollback targets
* Synchronization anchors between devices or users

---

### 3. Current Runtime State (Live State)

The current runtime state is the **materialized representation of the scene at time T**.

#### Purpose

* Instant access for rendering
* Fast querying by AI
* Avoid replaying the entire history on every operation

#### Properties

* Continuously updated
* Derived from:

  * Last validation state (if any)
  * Plus all subsequent historical actions
* Non-authoritative (can be rebuilt at any time)

The runtime state must expose:

* Object positions
* Object hierarchy / grouping
* Tool locations and availability
* Active scripts
* Selection state
* Viewport-relative information (e.g. top-right object)

This state is what AI agents query when they need spatial or contextual understanding.

---

## Tools Historization

Tools are first-class entities and **must be historized themselves**.

### Tool Lifecycle

The following must be tracked:

* Tool creation
* Tool placement on screen
* Tool movement
* Tool resizing
* Tool configuration changes
* Tool removal

### Tool Application

Each application of a tool must be historized as:

* Tool ID
* Target object(s)
* Parameters
* Resulting changes

This ensures AI agents can:

* Understand what tools exist
* Know where they are
* Know how they were used
* Reapply or modify past actions

---

## Tool-Centric Action Model (Mandatory)

### Fundamental Rule

**All actions in Atome MUST go through a tool.**

There is no direct mutation of atoms, properties, or runtime state outside of a tool execution.

This rule applies equally to:

* User interactions
* AI-driven actions
* Scripts
* Automation systems

There are no exceptions.

---

### Tools as the Single Entry Point

A **tool** is the only valid mechanism allowed to:

* Create atoms
* Delete atoms
* Move atoms
* Resize or transform atoms
* Modify any property
* Create or modify scripts
* Apply logic or behavior

Any system component that changes the state of Atome must do so by invoking a tool.

---

### Scripts Are Tools

Scripts are **not a special execution path**.

They are implemented and treated as tools:

* A script is executed via the *Script Tool*
* Script execution is an explicit tool application
* Script side effects are not implicit

A script:

* Cannot mutate atoms directly
* Can only produce effects by emitting property changes through the tool system

This guarantees that scripted actions are:

* Traceable
* Replayable
* Auditable

---

### Property-Level Historization

Tools do **not** store abstract commands in history.

Each tool execution must:

1. Compute the resulting property changes
2. Emit **property-level diffs**
3. Persist those diffs in the historical state

The history only records:

* Which properties changed
* Their previous and new values
* Which tool caused the change
* Who triggered the tool (user or AI)

The history does **not** depend on tool re-execution to reconstruct state.

---

### Runtime State Integrity

The runtime state:

* Is updated exclusively from tool-emitted property diffs
* Is never mutated directly
* Can always be rebuilt from:

  * A validation state
  * Plus the subsequent property diffs

The runtime state is therefore a cache, not a source of truth.

---

### API Enforcement

All mutation APIs must be tool-backed.

This includes, but is not limited to:

* move()
* resize()
* scale()
* rotate()
* applyTool()
* createTool()
* deleteTool()
* createObject()
* deleteObject()

Any API that bypasses the tool system is considered invalid and must be removed or refactored.

---

### Consequences of This Model

This model ensures:

* Deterministic replay
* Perfect AI observability
* Unified behavior between humans and machines
* No hidden or implicit state mutations

Atome becomes a fully tool-driven, history-authoritative system where **intent (tool)** and **effect (property diff)** are always explicit.

---

---

## AI Integration Requirements

AI agents must be able to:

* Query the current runtime state
* Query validation states
* Query filtered history (by object, tool, timeframe)
* Create validation states (with user consent)
* Perform actions exclusively through historized APIs

AI must **never** directly manipulate the runtime state bypassing history.

---

## Performance Strategy

* Runtime state is always used for real-time access
* History is used for:

  * Audit
  * Replay
  * Understanding intent
* Validation states limit replay depth

This architecture avoids:

* Virtual DOM duplication
* Accessibility API dependency
* Full-history replay on every query

---

## Non-Goals

* No automatic snapshots
* No parallel UI trees
* No implicit state mutations

---

## Summary

Atome will rely on:

1. **Complete historization** for truth and replay
2. **Explicit validation states** for stability and performance
3. **A continuously updated runtime state** for speed and AI awareness

This three-part system provides a deterministic, AI-compatible, and high-performance foundation without introducing redundant structural layers.
