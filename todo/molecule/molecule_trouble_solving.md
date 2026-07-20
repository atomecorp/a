# Molecule Trouble Solving Guide

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Purpose

This guide defines the investigation and correction plan for the current Molecule/Mtrack instability. It must be followed before any source code change.

The goal is to solve each problem from its root cause, one by one, without workaround, fallback, hidden guard, or symptom-level patch.

Reference rules:

- `.codex/AGENTS.md`
- `eVe/documentations/debug_UI.md`

## Mandatory Workflow

For every task below:

1. Reproduce the issue with a browser-driven scenario.
2. Capture the state before and after the operation.
3. Identify which layer fails:
   - timeline model
   - clip model
   - track model
   - DOM projection
   - renderer
   - playback transport
   - persistence
   - command bus/API
4. Write the failing invariant.
5. Fix only the responsible module.
6. Add a persistent test under `./tests` once the root cause is confirmed.
7. Keep temporary probes and diagnostic outputs under `./temp`.
8. Run guardrails and targeted regression tests before moving to the next task.

No task is complete until the same browser scenario that reproduced the bug passes.

## Global Diagnostics To Build First

- Capture `window.__DEBUG__.getAppState()` when available.
- Capture `window.__DEBUG__.getTimelineState()` when available.
- Capture `window.__DEBUG__.getWorkspaceSceneState()` and the renderer owner's existing diagnostics when playback or rendering is involved; do not install a detached GPU capability probe.
- Capture `window.eveMtrackApi.getState()`.
- Capture `window.eveMtrackApi.exportTimeline()`.
- Capture visible clip DOM nodes:
  - clip id
  - persist id
  - track id
  - bounding rectangle
  - parent track row
  - handle hit boxes
- Capture track DOM nodes:
  - track id
  - row order
  - lane rectangle
- Capture console errors.
- Capture a screenshot for each failing interaction.

## Core Invariants

- Moving a clip must never create a new track unless the UI gesture is explicitly a track creation gesture.
- Moving a clip must preserve its identity, media source, and persisted identity.
- A clip must never disappear from the model during drag.
- A clip must never disappear from the DOM if it remains visible in the current timeline viewport.
- Left crop must update the clip start and source in-point consistently.
- Right crop must update the clip out-point consistently.
- Crop handles must receive pointer events reliably.
- Split must replace one clip with two contiguous clips.
- Split must not duplicate the original full clip.
- Split must not delete the wrong part of the clip.
- Playback must not stop globally because one clip has invalid timing without exposing a typed error.
- A recorded molecule opened immediately after record must show the committed tracks without requiring close and reopen.

## Task 1: Clip Disappears When Moving Tracks Or Clips

Problem:

- When moving a clip or track inside an opened molecule, clips can disappear.

Investigation:

- Reproduce with several tracks and several clips.
- Drag one clip horizontally.
- Drag one clip vertically to the track above.
- Drag one clip vertically to the track below.
- Capture model state and DOM state after every pointer move and after pointer up.

Suspected areas:

- `domains/mtrax/clips/node_render_runtime.js`
- `domains/mtrax/tracks/render_tracks_runtime.js`
- track lane hit testing
- clip DOM reuse
- timeline render cache

Acceptance criteria:

- The same clip id and persist id remain present after drag.
- Track count does not change unless the pointer intentionally targets the explicit new-track zone.
- The clip remains visible in the expected track.
- No stale DOM node remains attached to the wrong lane.

## Task 2: Crop Handles Do Not Work

Problem:

- The left and right handles at clip edges often cannot be grabbed.
- After split, handles near the split point are especially unreliable.

Investigation:

- Measure left and right handle bounding boxes.
- Verify pointer target during `pointerdown`.
- Verify whether the event reaches the handle or the clip body.
- Verify whether pointer capture is established.
- Verify model changes for `start`, `in`, `out`, and timeline duration.

Suspected areas:

- `domains/mtrax/clips/node_render_runtime.js`
- `domains/mtrax/ui/styles.js`
- clip handle layering
- hit testing around adjacent split clips

Acceptance criteria:

- Left crop works with a real browser drag on the left handle.
- Right crop works with a real browser drag on the right handle.
- Crop works on both clips created by a split.
- No crop gesture is interpreted as a clip move.

## Task 3: Split Duplicates Instead Of Splitting

Problem:

- Split duplicates the clip or keeps the left clip full length while creating a second partial clip.
- A part of the end can be removed incorrectly.

Investigation:

- Start with one known clip.
- Set playhead at a deterministic time.
- Run split through the public Mtrack command/API.
- Compare before and after timeline export.

Required invariant:

- Before split:
  - one clip covers `[start, end]`.
- After split:
  - left clip covers `[start, split]`.
  - right clip covers `[split, end]`.
  - both clips share the original media source.
  - their source in/out points map to the original media interval.
  - there is no third duplicate full-length clip.

Suspected areas:

- `domains/mtrax/clips/split_join_runtime.js`
- timeline normalization
- persist/export mapping
- linked audio/video split behavior

Acceptance criteria:

- Split at playhead produces exactly two contiguous clips.
- The original full-length interval is not duplicated.
- Linked audio/video clips remain synchronized after split.
- Playback still works after split.

## Task 4: Playback Does Not Start With Many Tracks

Problem:

- A molecule with many tracks and many dropped files does not play.

Investigation:

- Build a deterministic timeline with many tracks and many clips.
- Try playback before and after a split.
- Capture transport state, renderer state, audio engine state, and errors.
- Determine whether playback is blocked by:
  - invalid clip timing
  - invalid source descriptors
  - renderer preparation
  - audio session preparation
  - timeline export
  - command bus failure

Suspected areas:

- Mtrack playback transport runtime
- Molecule media engine
- timeline export
- renderer adapter state
- audio engine state

Acceptance criteria:

- Playback starts with many tracks.
- Playback starts after split.
- If a clip is invalid, playback exposes a typed diagnostic and continues where architecture allows.

## Task 5: Dragging An External Atome Into Mtrack Drops Text Instead Of Media

Problem:

- Dragging a video atome into an opened molecule can create text containing the atome name instead of a video clip.

Investigation:

- Capture the atome state before drop.
- Capture resolved capture descriptor.
- Verify source kind resolution.
- Verify whether the drop is handled by Mtrack, project drop, or both.

Suspected areas:

- `domains/mtrax/visual/descriptor_capture_runtime.js`
- `domains/mtrax/project/project_local_drag_runtime.js`
- project drop bridge
- capture descriptor priority

Acceptance criteria:

- A video atome dropped into Mtrack creates a video clip.
- An audio atome dropped into Mtrack creates an audio clip.
- Text atomes still create text clips only when the source is truly text.
- The same pointer release is not consumed twice by Mtrack and project drop logic.

## Task 6: Opened Molecule Is Empty When Reopened Too Quickly After Record

Problem:

- If a molecule is opened immediately after the end of recording, tracks can appear empty until the panel is closed and reopened.

Investigation:

- Record a short media item.
- Immediately open the molecule.
- Capture persistence state and Mtrack state before and after the delayed load completes.
- Determine whether the issue is:
  - record commit not finished
  - molecule load uses stale persisted state
  - panel opens before timeline hydration
  - render cache does not refresh after hydration

Suspected areas:

- record capture runtime
- active group timeline persist runtime
- group timeline load bridge
- panel lifecycle
- render refresh after hydration

Acceptance criteria:

- Opening immediately after record shows the recorded tracks.
- No close/reopen is required.
- The UI exposes a typed loading or persistence error if commit fails.

## Task 7: Search And Restore Record Tools

Problem:

- Previous record tooling may have disappeared:
  - media record tool for audio/video on a synchronized track
  - motion record tool for atome movement animation
  - possible SVG point animation recording

Investigation:

- Search the codebase for existing record action modules.
- Search for motion/keyframe/automation recording modules.
- Search for SVG point animation or SVG layer automation code.
- Identify whether the implementation still exists, was disconnected from UI, or was removed.

Search targets:

- record media
- record motion
- record action
- automation lanes
- keyframes
- SVG layer
- SVG point editing
- atome movement recording

Acceptance criteria:

- Produce an inventory of existing record-related modules.
- Identify the canonical APIs that still exist.
- Identify missing UI bindings.
- Define the standard tool buttons to restore:
  - `record media`
  - `record motion`
  - source selection for audio/video
  - synchronized track target

No restoration code should be written until the current implementation is fully mapped.

## Task 8: Replace The Mtrack Slider Band With Toolbar Tools

Problem:

- The band containing vertical zoom, horizontal zoom, snap, tempo, tempo slider, and loop activation must be removed from the molecule panel.
- Each control must become a standard tool in the toolbar below the molecule.

Required controls to convert:

- vertical zoom
- horizontal zoom
- snap
- tempo value
- tempo slider
- loop activation

Strict UI rule:

- Do not create a new slider implementation.
- Reuse the standard Atome/eVe slider.
- The slider must expand on mouse down and retract on mouse up, matching the existing standard slider behavior.

Investigation:

- Identify the current control band module.
- Identify the standard Atome/eVe slider implementation.
- Identify toolbar tool registration patterns below the molecule.
- Map each current control to a toolbar tool.
- Verify keyboard, pointer, and command bus behavior.

Acceptance criteria:

- The old slider/control band is removed.
- Each control exists as a toolbar tool below the molecule.
- Sliders use the canonical Atome/eVe slider behavior.
- Snap and loop expose deterministic state changes through the existing Mtrack API.
- Tempo value and tempo slider remain synchronized.

## Execution Order

1. Build diagnostics and probes.
2. Fix clip disappearance during drag.
3. Fix crop handles.
4. Fix split semantics.
5. Fix playback after split and many tracks.
6. Fix external atome media drop.
7. Fix fast reopen after record.
8. Inventory record media and record motion tools.
9. Restore record tools only after inventory is validated.
10. Replace the slider band with toolbar tools.

## Required Validation Commands

Run relevant targeted tests first, then broader checks:

```bash
npm run check:no-fallbacks
npm run check:molecule-guardrails
```

Additional tests and probes must be added as the root causes are confirmed.
