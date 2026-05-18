# Deep UX Performance And iOS Boot Compliance

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Objective

Define and execute a deep optimization plan so the product feels consistently fast, fluid, and professional across the full UX surface.

This task explicitly targets:

- no visible lag when opening panels
- no visible lag when opening or activating tools
- no visible lag when opening Matrix
- no visible lag when opening Molecule
- reduced startup latency
- measurable compliance with strict iOS startup and interaction timing expectations

This is not a cosmetic micro-optimization pass. It is a system-level UX performance task.

## Product-Level Goal

The application must feel immediate and stable during the most common user flows:

- app launch
- first usable frame
- first tool interaction
- panel opening and closing
- Flower or toolbox opening
- Matrix open, close, and project switch
- Molecule open, reopen after recording, and first interaction
- repeated open/close cycles without progressive slowdown

The user must not perceive freezes, jank, delayed rendering, blocked input, or inconsistent warm/cold startup behavior.

## Scope

This task covers the following performance-sensitive surfaces:

1. Global startup and bootstrap.
2. Panel creation, mounting, reopening, and destruction.
3. Tool opening, tool activation, and toolbox or Flower rendering.
4. Matrix open, close, filtering, and project selection.
5. Molecule open, hydration, preview, transport, and post-record reopen.
6. iOS startup path, WebView readiness, bridge readiness, and first interactive state.

## Core Constraints

- No patch-level workaround that hides root causes.
- No fallback architecture added only to mask slowness.
- No decorative loading state used to hide a blocking synchronous path.
- No optimization that breaks deterministic behavior, history, replay, or the command pipeline.
- No panel-specific hacks when the latency source belongs to a shared runtime layer.

## Primary Performance Targets

The exact numbers must be measured on real devices and then refined, but the implementation work must converge toward explicit budgets.

### Startup Budgets

- Cold start must reach a visibly interactive state as early as possible.
- Warm start must feel immediate.
- The first usable frame must not wait for optional subsystems.
- Non-critical systems must not block the first user interaction.

### Interaction Budgets

- Opening a standard panel must feel immediate.
- Opening a tool surface must feel immediate.
- Matrix open and project switch must feel smooth and predictable.
- Molecule open must not stall the UI thread or require close-and-reopen recovery.
- Repeated interactions must not degrade over time.

### iOS-Specific Budgets

- iOS startup must comply with strict mobile expectations for perceived readiness.
- WebView boot, bridge boot, and first interactive render must be measured separately.
- No optional subsystem may delay the first useful interaction on iOS.
- The iOS path must avoid heavy synchronous work before the first interactive frame.

## Required Measurements

Add stable and comparable timing instrumentation for at least:

- application bootstrap start
- first DOM or WebGPU surface ready
- first interactive state
- first project visible
- first panel open
- first tool open
- Matrix open
- project switch from Matrix
- Molecule open
- Molecule reopen immediately after record
- iOS bridge ready
- iOS first interactive frame

Each metric must be measurable on both cold and warm paths where applicable.

## Required Investigations

### 1. Startup Path

- Identify eager imports and startup-only blocking work.
- Separate core bootstrap from optional subsystems.
- Defer non-critical initialization until first use.
- Validate that startup sequencing remains deterministic.

### 2. Panel Opening Latency

- Audit all panel entry points for synchronous data fetches, full DOM rebuilds, repeated selectors, and layout thrash.
- Reuse canonical panel shells where architecture allows it.
- Ensure panel open paths do not re-run expensive work that can be cached or deferred safely.

### 3. Tool And Flower Latency

- Audit tool open and tool activation flows for unnecessary runtime resolution, duplicate handler lookup, or redundant DOM work.
- Measure Flower open latency in multiple contexts, including Matrix.
- Remove repeated heavy scans or mount work from the interaction path.

### 4. Matrix Latency

- Separate Matrix chrome open from project hydration.
- Ensure non-visible content is deferred.
- Reduce layout recalculation during open, filter, and selection transitions.
- Keep transitions smooth under large project counts.

### 5. Molecule Latency

- Measure Molecule panel mount separately from timeline hydration, preview mount, and transport readiness.
- Remove blocking work from the first visible open path.
- Guarantee immediate reopen after record without requiring a second open cycle.
- Identify whether latency comes from persistence, hydration, preview, layout, or renderer setup.

### 6. iOS Boot Compliance

- Measure the exact ordering of native startup, WebView readiness, JS bootstrap, bridge availability, and first interaction.
- Eliminate any non-essential work before first interaction.
- Audit native-to-web bridge initialization for blocking or repeated setup.
- Confirm the iOS path follows the same architectural rules without extra silent fallbacks.

## Architectural Expectations

- Startup must be layered: core first, optional later.
- Shared performance fixes must land in shared entry points, not duplicated across panels.
- Reads and writes must be grouped to reduce layout thrash.
- Hidden or inactive surfaces must not keep expensive observers or continuous work alive unless strictly necessary.
- Metrics must remain available long enough to compare regressions over time.

## Non-Negotiable Deliverables

1. A measurable timing baseline for startup and key interaction flows.
2. A prioritized hotspot list with confirmed root causes.
3. A refactor plan removing blocking work from startup and open flows.
4. Explicit interaction budgets for panels, tools, Matrix, and Molecule.
5. Explicit iOS startup and first-interaction budgets.
6. A regression checklist for cold start, warm start, and repeated interaction cycles.

## Validation Checklist

- Startup timings are captured and comparable across runs.
- Standard panel opening no longer shows visible lag.
- Tool opening no longer shows visible lag.
- Matrix open and project switch no longer show visible lag.
- Molecule open and immediate reopen after record no longer show visible lag or stale state.
- iOS startup reaches first interactive state without optional subsystems blocking it.
- Warm paths remain faster than cold paths.
- Repeated open and close cycles do not introduce progressive slowdown.

## Definition Of Done

- The application has explicit UX performance budgets.
- Hotspots are measured, not guessed.
- Shared runtime bottlenecks have been reduced at the source.
- Panels, tools, Matrix, and Molecule feel immediate in normal usage.
- iOS startup has a measured and compliant first-interaction path.
- No fallback or patch architecture was introduced to fake responsiveness.
