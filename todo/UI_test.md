# UI DOM Automation Feasibility Test

## Context

The goal of this task is to prove that the product can be driven from the outside through real UI interactions on the DOM, not through internal mutation shortcuts.

This test campaign must answer one concrete question:

Can an autonomous agent manipulate the application reliably with click, double click, drag, drop, typing, and JavaScript console access across all supported runtime combinations?

Target runtime combinations:

- Fastify + browser
- Axum + browser
- Axum + Tauri

The result must not be a vague smoke test. It must be an execution-grade validation plan that can expose where DOM automation is possible, fragile, or impossible.

## Main Objective

Validate that an autonomous UI driver can:

- open the application;
- identify and click tools from the UI;
- import files through the visible interface;
- create atomes from the UI;
- move and resize atomes with pointer gestures;
- create text with a double click on a project surface;
- edit text content;
- move the text atome;
- open a molecule panel;
- move clips on timeline tracks;
- move one clip from one track to another;
- trim a clip at the start;
- trim a clip at the end;
- split a clip;
- open panels and navigate them;
- use the find tool and execute searches;
- read from the JavaScript console;
- write commands in the JavaScript console when explicitly required for diagnosis.

## Non-Negotiable Rules

### 1. External UI control only

The agent must interact through visible UI affordances and browser or Tauri automation primitives:

- click;
- double click;
- drag;
- drop;
- hover;
- type;
- keyboard shortcuts that are already exposed by the UI.

Forbidden for the main validation path:

- direct calls to internal mutation APIs;
- direct calls to window.Atome.commit or equivalent write helpers;
- direct state patching from DevTools;
- fake success based only on DOM injection.

Read-only diagnostics are allowed only to explain a failure after the UI attempt has already failed.

### 2. Same scenarios across all runtimes

The same action set must be executed on:

- Fastify + browser;
- Axum + browser;
- Axum + Tauri.

If one platform needs special handling, the difference must be documented explicitly as a platform defect or platform constraint.

### 3. Real visible success criteria

Each scenario must validate visible and reproducible outcomes:

- the expected tool becomes active;
- the imported file appears in the workspace;
- the atome position changes;
- the atome size changes;
- the text content changes;
- the molecule panel opens;
- the clip moves to the expected time or track;
- the trim changes clip bounds;
- the split creates two independent segments;
- the panel search returns visible results;
- console reads and writes are reflected in the runtime.

### 4. No coordinate-only hacks as the main strategy

Coordinates can be used for drag and resize once the target is identified, but the test should prefer stable runtime selectors first:

- data-role;
- data-atome-id;
- titles;
- labels;
- stable panel identifiers;
- deterministic visible text.

If the test depends on fragile screen coordinates because no stable selector exists, that must be reported as an automation weakness.

## Expected Deliverable

This task must produce a real feasibility report with:

- pass or fail per scenario;
- pass or fail per runtime target;
- selectors used for each interaction;
- screenshots before and after critical actions;
- console transcript when a failure requires diagnosis;
- list of blockers preventing autonomous control;
- list of missing DOM hooks or unstable selectors;
- list of runtime-specific differences.

## Runtime Matrix

| Runtime | Shell | Must pass | Notes |
| --- | --- | --- | --- |
| Fastify + browser | Browser only | Full scenario set | Baseline reference runtime |
| Axum + browser | Browser only | Full scenario set | Must match Fastify behavior as closely as possible |
| Axum + Tauri | Native shell + embedded webview | Full scenario set | Must validate pointer events, uploads, drag, and console access inside Tauri |

## Mandatory Scenario Set

### Phase 0 - Boot and baseline reachability

Validate that the autonomous driver can:

- open the application;
- wait until the UI is stable;
- detect the main project area;
- detect the main tool area;
- detect at least one visible project entry or workspace surface.

Failure at this stage means the runtime is not automatable yet.

### Phase 1 - Tool activation by click

Validate that the agent can click visible tools and observe a state change.

Minimum tools to validate:

- project tool or project entry;
- text tool;
- import tool;
- find tool;
- molecule-related entry point when available.

For each tool:

- locate it without using internal state;
- click it;
- verify that the tool becomes active or opens the expected panel;
- record the selector used.

### Phase 2 - Import files through the UI

Validate that the agent can import one or more files through the visible interface.

Minimum file set:

- one image;
- one audio file;
- one video file;
- one text-compatible asset if the UI supports it.

Accepted interaction paths:

- click an import tool and fill a file chooser;
- drag and drop files into a visible drop area.

Success criteria:

- imported assets appear in the UI;
- imported assets are selectable;
- imported assets can be manipulated afterward.

### Phase 3 - Move and resize atomes

Validate that the agent can create or select at least one atome, then:

- drag it to a new position;
- resize it from a visible resize affordance;
- verify that the DOM and the visible layout both changed.

Minimum evidence:

- before and after screenshot;
- before and after bounding box values;
- selector used to find the atome.

### Phase 4 - Create, edit, and move text

Validate the full text workflow:

- open or select a project surface;
- double click on the project surface to create text;
- verify that a text atome appears;
- edit the text content;
- exit editing mode;
- move the text atome to a different position.

This phase is mandatory because it mixes double click, content editing, selection state, and drag behavior.

### Phase 5 - Open molecule and edit timeline clips

Validate the molecule workflow end to end:

- open a molecule panel from the UI;
- detect the timeline surface;
- identify at least one clip;
- move the clip horizontally on its current track;
- move the clip to another track;
- trim the left edge of the clip;
- trim the right edge of the clip;
- split the clip;
- verify the expected visual result after each action.

Mandatory checks:

- clip position changed;
- track assignment changed when moving between tracks;
- clip duration changed after trim;
- two segments exist after split.

### Phase 6 - Open panels and use Find

Validate that the agent can:

- open relevant panels;
- focus panel content;
- use the find tool or search panel;
- enter a query;
- verify visible search results or empty-state feedback.

This phase must confirm that panel chrome, focus handling, and text input are automatable.

### Phase 7 - JavaScript console read and write

Validate runtime observability through the JavaScript console.

Required actions:

- read one known runtime value without mutating state;
- write one harmless diagnostic command only when explicitly needed;
- capture the console output;
- verify that console access works in browser and in Tauri.

Allowed examples:

- reading a visible selection summary;
- reading whether a panel exists;
- logging a diagnostic marker.

This phase is diagnostic support, not the primary control path.

## Autonomous Mode Requirements

The campaign must be executed as if an autonomous agent is trying to complete the workflow without manual hand-holding.

That means the test must evaluate:

- whether the agent can discover selectors from the DOM;
- whether visible labels are sufficient to find tools;
- whether overlays block pointer events;
- whether drag handles are reachable;
- whether double click is interpreted reliably;
- whether uploads are possible in browser and Tauri;
- whether the same workflow stays stable after reload.

The final report must clearly separate:

- possible autonomously;
- possible but fragile;
- impossible without product fixes.

## Failure Taxonomy

Every failure must be classified.

Allowed categories:

- missing selector;
- unstable selector;
- invisible but required control;
- overlay intercepting pointer events;
- drag gesture not captured;
- resize handle not reachable;
- double click not mapped correctly;
- file chooser not automatable in this runtime;
- drag and drop rejected;
- panel focus broken;
- console unavailable;
- runtime mismatch between Fastify, Axum, and Tauri;
- regression after reload.

## Evidence Required Per Scenario

For every scenario, store:

- runtime target;
- exact action attempted;
- selector or locator used;
- screenshot before;
- screenshot after;
- observed result;
- expected result;
- pass or fail;
- blocker classification if failed.

## Acceptance Criteria

The feasibility campaign is successful only if all of the following are true:

- the same scenario list is executable on the three runtime targets;
- tool clicks are reliable enough for autonomous use;
- file import is feasible through the UI;
- atome drag and resize are feasible through visible handles or stable surfaces;
- text creation and text editing are feasible;
- molecule clip editing is feasible;
- panel opening and find searches are feasible;
- console read and diagnostic write are feasible where required;
- all failures are explained by precise UI or runtime defects, not by vague observations.

## Expected Outcome

At the end of this work, we must know exactly:

- whether the current DOM is sufficiently controllable for autonomous UI testing;
- which workflows already work end to end;
- which workflows fail only on one runtime;
- which missing selectors, event bindings, or focus issues must be fixed before reliable autonomous operation is possible.

This document is not the implementation of the test runner.
It is the mandatory contract for the UI feasibility campaign.
