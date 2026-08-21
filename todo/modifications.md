# Requested Interaction Corrections

## 1. Dashboard Project Flowers Menu

### Scope

In Dashboard mode, a secondary-pointer click or touch long press on a project must open the existing canonical Flowers context menu for that project.

### Interaction behavior

1. Resolve the project under the pointer from canonical Dashboard/project state.
2. Select that project through the existing canonical selection path before opening the menu.
3. Open the existing Flowers menu in the Dashboard context with exactly `Rename`, `Delete`, `Copy`, `Paste`, and `Info`.
4. Dispatch each entry through the existing canonical project action: Rename changes the selected project name; Delete deletes the selected project; Copy copies the selected project; Paste uses the canonical project clipboard and destination rules; Info displays information for the selected project.

### Invariants and implementation constraints

- Reuse the existing Flowers/context-menu, project selection, clipboard, and project mutation owners; do not create a Dashboard-specific menu or mutation route.
- Canonical project and selection state remain outside the DOM. The DOM only identifies the pointer target for event routing and never stores project, selection, clipboard, or command authority.
- Preserve the canonical mutation, history, authorization, synchronization, and i18n paths. No direct state mutation, DOM-authoritative state, fallback behavior, or duplicate UI component is permitted.
- Keep the established WebGPU-first and minimal-DOM rendering architecture unchanged.

### Acceptance criteria

- With real mouse input, right-clicking each of at least two Dashboard projects selects the clicked project first and opens the Flowers menu containing only the five specified actions.
- With real touch input, long-pressing each project produces the same selection and menu result without triggering an unintended primary action.
- Rename, Delete, Copy, Paste, and Info are exercised through the visible menu and are verified to target the project selected under the pointer; Paste is also verified against the canonical clipboard/destination behavior.
- After rerender, reopen, and DOM replacement, the selected project and command target still derive from canonical state, not DOM metadata.

## 2. List and Molecule/Matrix Drag-and-Drop Feedback

### Scope

Correct drag-and-drop feedback for list items and Molecule/Matrix cells. The drag presentation must show the actual line or matrix cell being moved, never a generic ghost representation.

### Interaction behavior

- While dragging, render the actual dragged list line or Matrix cell through the established shared interaction/rendering path.
- When the pointer hovers an eligible item/cell, keep the dragged object positioned on that target, rather than displaying an insertion gap. On release, illuminate the target and create the Molecule through the canonical creation path.
- When the pointer hovers between two list positions, display spacing only between those two positions. On release, reorder the list into that gap through the canonical ordering path.
- The target highlight and between-items spacing are transient interaction projections. They must clear on drop, cancel, escape, or loss of pointer/touch capture.

### Invariants and implementation constraints

- Reuse the existing list-row, drag, Matrix, Molecule, selection, and canonical mutation owners; do not introduce a parallel drag controller, ghost renderer, list model, or Molecule creation path.
- Drag session state, hover target, and insertion position are runtime state outside the DOM; DOM/canvas output is disposable feedback only. Do not encode identifiers or behavior in DOM attributes, classes, or inline styles.
- Creation and reordering must use the canonical command/mutation and history paths, remain deterministic through replay and synchronization, and preserve authorization checks.
- Keep the shared WebGPU rendering route and minimal DOM. No canvas-per-item, DOM clone, fallback renderer, or view-local writable business state is permitted.

### Acceptance criteria

- A real mouse drag and a real touch drag each show the actual line/cell moving; no generic ghost is visible.
- Hovering an eligible item/cell keeps the dragged object on that target; dropping illuminates the target and creates exactly one Molecule with the intended canonical source and target.
- Hovering between two list items shows a gap only between them; dropping reorders the item to that exact position and creates no Molecule.
- Pointer/touch cancellation clears transient drag feedback and makes no mutation. Rerender, reload, and deterministic replay preserve committed reorder/Molecule results without reading state from the DOM.

## 3. Correction 3 — Project-as-Molecule, Record, and Molecule Creation

### Scope

Implement one canonical Project-as-Molecule model, its Record/Play performance behavior, and Molecule creation/editing across List, Matrix, and Natural views. This correction is a future implementation specification only; it must not introduce a second playback, recording, rendering, drag, grouping, state, or mutation system.

### Non-negotiable invariants

- Every project is its root Molecule and owns `molecule_timeline`; the timeline owner has `owner_atome_id` equal to the project id.
- Canonical Atome parentage is the sole membership authority. Every Atome has exactly one direct Molecule parent; no view, container, projection, selection state, or legacy group structure may become a competing membership authority.
- Visible List and Matrix order is independent from the recorded temporal order.
- Canonical state remains outside the DOM. DOM and WebGPU output are disposable projections; the implementation must preserve one WebGPU canvas per active rendering zone, no DOM authority, no parallel renderer, and no fallback path.
- Every operation must use the canonical API/MCP, Command Bus, ACL, history, synchronization, and undo/redo paths. Visible mutations use the canonical `window.Atome.commit` or `window.Atome.commitBatch` pipeline.

### Existing ownership and mandatory reuse

Apply this order for every future change: reuse the owner as-is; extend its existing responsibility; factor or remove an obsolete path; create a module only when no existing responsibility can own the work cleanly.

- `project_view_playback_rules.js` owns the sequential default and playback-mode resolution. Keep it and replace only its child-Molecule dependency.
- `project_view_playback_runtime.js` owns classification, exclusive triggering, durations, and the playback queue. Extend it; do not create a second playback engine.
- `project_view_interaction_recorder.js` and `project_view_record_trigger.js` own `T0`, event capture, and Record-time behavior. Keep them; do not create a new Record engine.
- `project_view_capture_to_timeline.js` contains the regression because it calls `wrapAtomeInGroupTimeline`. The future correction must instead write into the timeline of the current project or owning Molecule.
- `project_view_surface_context_runtime.js` owns Record, Play, and performance selection. Retarget it to the current owner and retire `playback_performance_id`.
- The Molecule v2 kernel, sessions, store, transport, automations, and Timeline projection remain canonical.
- List behavior must reuse `bevy_panel_selectable_list.js`. Natural gestures must reuse existing multi-selection, lasso, scene mutations, and `commitBatch`.
- Do not create a Record engine, renderer, drag controller, or parallel grouping system.

### Project initialization, migration, and cleanup

1. New projects initialize as root Molecules with their canonical `molecule_timeline` and `owner_atome_id` equal to the project id.
2. Provide a complete, idempotent migration for existing projects. It must establish the root-Molecule model, absorb explicitly referenced legacy child performances into the current owner timeline, and preserve canonical history and references.
3. Remove obsolete containers only after proving that every direct, indirect, runtime, history, synchronization, and serialized reference has migrated or is absent.
4. Retire `groupSteps`, the Grouper action, and obsolete group rendering only within this scope and only after dependency verification proves that no active dependency remains.
5. A migration rerun must make no additional membership, timeline, performance, or history mutation after the first successful run.

### Playback mode and Record semantics

#### Playback rule

- Before a valid Record performance exists, or when no usable performance exists, `resolvePlaybackRule()` returns `sequential`.
- Without a valid Record performance, Play remains strictly sequential.
- After the first valid Record, Play uses the recorded performance.
- An empty, cancelled, or failed capture never disables sequential playback and never destroys a previous valid performance.
- Deleting the active performance automatically restores sequential playback.

#### Capture ownership and replacement

- Stop atomically replaces the current owner performance: the project at root, or the owning Molecule when recording inside a Molecule, Section, or Track.
- A valid new take atomically replaces the prior owner performance through canonical history and undo. A failed replacement preserves the prior performance intact.
- The project Timeline activity may edit the performance, but Stop must not automatically switch the active performance.
- Edits made while recording are ordinary durable canonical edits. Cancelling Record discards only the candidate performance, never those edits or a prior valid performance.

#### Recorded behavior

- Every recorded click is a distinct temporal occurrence. Reclicking an item restarts it and records a new occurrence.
- Each triggered item remains active until the next click or Stop. A completed video holds its final frame; a completed audio item is silent.
- Clips carry activations. Automations carry numeric properties. Typed events plus the `T0` baseline replay all other recorded mutations.
- Natural-mode Record captures validated local actions only: full move, resize, and rotate trajectories; creation; deletion; visibility; z-index; and property changes. Exclude remote collaborator events.
- Spatial replay is a non-destructive WebGPU projection. It restores the current canonical state when playback ends or Stop is invoked; it must not make the projection, cache, or renderer authoritative.

### One canonical Molecule-creation command

The same canonical command serves List, Matrix, and Natural views.

- A stationary 500 ms overlap creates a Molecule from two simple Atomes, adds an Atome to an existing Molecule, or merges two Molecules without nesting.
- When an Atome drops on a Molecule, the target Molecule absorbs the source Atome. When a Molecule drops on an Atome, the moved Molecule absorbs the target Atome. Molecule-on-Molecule merges contents and atomically removes the source container.
- The resulting Molecule appears at the target position.
- List and Matrix replace the members with one row or cell.
- Natural preserves exact composition, member positions, and z-index, while exposing one interactive Molecule target outside edit mode.
- Move, resize, and rotation of a Molecule transform every member proportionally and atomically.
- Double-click enters Molecule editing. The footer shows the Molecule name and a localized Retour button.
- Multi-lasso exposes localized Create Molecule through the existing i18n system and replaces Grouper.
- Ungroup dissolves the structure and restores all members to the parent unchanged. Delete removes the Molecule and all of its project members.

### Atomicity, authorization, and replay requirements

- Validate target eligibility, ownership, ACL, and command capabilities before a creation, merge, transform, Record replacement, Ungroup, or Delete mutation.
- Commit each compound operation as one canonical, atomic, deterministic history entry or batch, with correct synchronization and undo/redo behavior.
- No operation may create nested Molecules through merging, duplicate membership, orphaned members, a view-local grouping result, or a parallel timeline/performance owner.
- The command and its history must remain deterministic across replay, restore, offline synchronization, and remote reconciliation. Remote collaborator events remain excluded only from local Record capture, not from canonical synchronized state.

### Executable acceptance criteria for the future implementation

#### Playback and Record

- A new project with no Record plays sequentially.
- Empty, cancelled, and failed Record attempts leave sequential playback unchanged and preserve any prior performance.
- The first valid Record activates the recorded performance; deleting it restores sequential playback.
- Replay a photo, interrupt a video after three seconds, and verify that the next item starts at the recorded timing.
- Verify atomic retake replacement and undo/redo, repeated activations of the same item, ignored remote events, non-destructive spatial replay, owner selection inside a Molecule/Section/Track, and idempotent migration.

#### Molecule creation and editing

- Exercise every Atome/Molecule overlap direction, including simple-Atome creation, add-to-Molecule, both Molecule/Atome absorption directions, and Molecule/Molecule merge; verify no nesting and exactly one direct parent per Atome.
- Verify target placement, List row and Matrix cell replacement, Natural composition/position/z-index preservation, proportional atomic transforms, double-click editing footer, localized multi-lasso Create Molecule, Ungroup, Delete, and undo/redo.
- Verify that a failed or unauthorized compound operation leaves canonical state, membership, performance, history, and projections unchanged.

#### Cross-runtime and architectural gates

- Exercise real mouse and touch interactions in List, Matrix, and Natural on Web, Tauri, and a physical iPhone.
- Confirm one WebGPU canvas per active rendering zone, no DOM authority, no parallel renderer, no fallback route, and no active `groupSteps` residue.
- Run focused owner tests, Molecule tests, syntax checks, API/MCP checks, architecture checks, and anti-fallback guardrails. Run the narrowest relevant check first, then widen to the real runtime interaction path.
- During implementation, update the ownership maps, authority documentation, and `eVe/documentations/FRAMEWORK_STATE.md` with only verified behavior, validation evidence, limitations, and unresolved items.
