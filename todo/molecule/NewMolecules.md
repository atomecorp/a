# Molecule v2 — Canonical Product And Implementation Specification

Status: active and authoritative.

This document replaces the former Molecule/MTraX editor backlog. It defines a
clean v2 product model. Schema-v1 timelines, Marker/Cell models, MTraX aliases,
and historical compatibility paths are not supported.

## 1. Product definition

A Molecule is an explicitly identified complex Atome that owns structured
content. A song, video edit, graphic group, page, or mixed-media composition is
a use of Molecule rather than a competing object type.

The shared hierarchy is:

```text
Molecule list
  -> Molecule
    -> Section
      -> Track
        -> referenced content Atomes
```

The Molecule owner is an Atome. Sections and Tracks are canonical structures
inside its `molecule_timeline` snapshot. Referenced media and creative content
remain real Atomes. No Cell object or copied interval content exists.

The list shows Molecules only. It stays visually shallow until the user opens
the hierarchy. Technical level labels are not shown: rows display only their
own names, initially `Molecule 1`, `Section 1`, and `Track 1` through i18n.

## 2. Non-negotiable architecture

- One shared Bevy/WebGPU compositor and the active `#eve_surface_project`.
- No visible Molecule DOM, canvas-per-item, private renderer, or fallback.
- `molecule_timeline` on the owner Atome is the sole durable snapshot.
- All durable writes use the canonical commit pipeline and deterministic Time
  Machine history.
- The Molecule kernel remains pure. Views, transport, media resources, and
  caches are disposable projections or bounded runtime state.
- Every user operation has API and MCP parity and supports atomic batches.
- Kira remains the playback clock. Integer frames/samples are canonical;
  seconds and musical positions are derived projections.
- Existing Squirrel controls, Bevy list primitives, menu, contextual rail,
  media controllers, and render adapters must be reused.
- There is no schema-v1 reader, migration, compatibility alias, or shim.

## 3. Canonical v2 snapshot

The snapshot schema is `eve.molecule.timeline`, version `2`, with:

- immutable timeline, project, and owner identities;
- timebase: sample rate, frame rate, ticks, tempo map, and meter map;
- Sections ordered by `order`;
- Tracks owned by one `section_id`;
- clips referencing Atomes, media references, or nested Molecules;
- automation lanes;
- persistent armed Record regions;
- one transport state;
- global quantization and metronome settings.

A Section is either:

- structural: `duration_frames` is absent;
- temporal: positive `duration_frames`, with its absolute start derived from
  the ordered durations of preceding temporal Sections.

Temporal Sections are contiguous. Resizing or reordering a Section moves all
later Sections and their content atomically. Adding the first temporal medium
to a structural Section gives it the medium extent. Removing its last temporal
medium returns it to structural form when non-temporal content remains.

Tracks are local to Sections. Each deepest Section owns exactly one canonical
empty content Track at the end. Filling it creates the next empty Track in the
same transaction. Group/bus Tracks appear before that trailing Track.

A Track may explicitly continue beyond its Section. Without that option,
out-of-bounds content is virtually clipped and remains recoverable.

Removing content detaches its reference and never deletes the source Atome.
Removing a Molecule's last real content deletes the Molecule structure. If the
first Create or Record action fails or is cancelled, its empty Molecule,
Section, and Track are rolled back atomically.

## 4. List, focus, and handedness

The Molecule list extends the shared Bevy hierarchical virtualized list. A row
contains an accordion, group cell, name shield, and playable preview. Its
height is exactly half the canonical square tool size.

Gestures are fixed:

- accordion: expand/collapse only;
- name shield click: select;
- stationary long press on the shield: rename;
- shield drag: reorder or transfer;
- preview tap: Play/Stop;
- preview double tap: deep focus.

The breadcrumb contains interactive names only. The last focus and playhead
are restored per Molecule as workspace state; global selection and every
accordion state are not persisted.

The existing handedness setting mirrors accordion, group, name, preview,
indentation, contextual rail, panels, controls, and hit zones. Time always
flows left to right; ruler, clips, Record regions, crop, loops, and playhead are
never reversed.

Sections and Tracks can move atomically between Molecules. A Section inserts
at the targeted order. A Track that exceeds its destination Section is
virtually clipped. A group route is retained only when its bus moves with it;
otherwise the Track returns to direct output.

## 5. Main menu and contextual Info

The fixed main menu order from the handedness edge is:

1. Atom
2. Home
3. Finder
4. Record
5. Time
6. Communication
7. Mode
8. View
9. Create

Create v1 contains Text, Draw, Code, and Page. Generator appears only when a
real generator capability is registered. Destination follows current focus:

- list -> Molecule + Section + Track;
- Molecule -> Section + Track;
- Section or Track level -> parallel Track.

Code and Page immediately open their canonical editor or surface.

No new contextual menu is created. The existing contextual rail and Info tool
own selection options. Track Info includes name, kind, mute, group route,
Section-end behavior, continuation, Loop In/Out, repetition, quantization, and
kind-specific properties.

V1 activities are List and Mix. The rail shows only working Play, Import,
Info, Activity, and required group/mute actions.

## 6. Mix groups

Group means an audio/visual mix bus only. A Track can route to a group Track in
the same Section.

- unassigned group-cell click: no action;
- assigned group-cell click: mute/unmute the bus;
- group-cell long press: choose or create a group Track.

There are no linked instances, generic line groups, or content propagation.

## 7. Time, ruler, and transport

The Mix surface ends with exactly two temporal bands:

1. Section boundaries/names and Record regions;
2. time ruler.

One playhead crosses both. Section boundaries are directly draggable. No third
band, mini-toolbar, permanent legend, or decorative controls are allowed.

Molecule time settings include tempo, meter, metronome, pre-roll, and global
quantization. Sections may change tempo or meter. Tracks may override
quantization through Info. Quantization supports Off, bars, beats, and musical
subdivisions and applies to placement, move, resize, Record, crop, and loops.

Each Molecule has one transport:

- Molecule preview plays all Sections;
- Section preview plays all its Tracks;
- Track preview plays only that Track;
- list Play sequences Molecules.

A new play request within a Molecule replaces its current playback.

## 8. Record regions

Record without an armed region creates the focused structure when needed and
records freely until Stop. The resulting Section uses the actual take length.

Dragging a selected Record source onto a Track creates a typed, armed,
persistent region. Initial Home defaults are:

- audio: four bars;
- video/screen: fill empty space;
- pre-roll: one bar;
- independent settings per media type.

Fill empty space extends from the drop point to the next content or Section
end. Placement avoids existing content unless a fixed default or explicit
resize overlaps it. Only the interval actually recorded replaces content;
outside pieces remain referenced and recoverable.

During capture, target-Track content is silent under the region and audible
outside it. Other Tracks keep playing. A short take replaces only its actual
duration. A successful take consumes the Record region and projects the real
media. Unconsumed regions survive reload armed.

Record starts with pre-roll before the first armed region. Compatible regions
can capture together as one transaction. Normal forward playback of the list,
Molecule, or Section triggers armed regions when the playhead reaches them.
Manual scrub never triggers capture. Starting transport inside a region begins
capture at that offset. Each region stops at its own end.

A region beyond Section end enables Track continuation. Web, Tauri, and iOS
app captures remain canonical generic captures explicitly marked non-exact.
Only the validated AUv3 `plugin_input` path may claim sample-accurate overdub.

Photo uses a timed Record region. One photo is captured at its start and the
resulting image occupies the region duration. Starting normal transport exactly
on the boundary triggers it. Import uses the canonical picker and inserts the
chosen media at its real duration without a Record region.

## 9. Crop, loops, and previews

Crop is non-destructive. Start/end handles change source projection without
discarding source data and produce one reversible mutation.

V1 Track loops are configured in Info with independent Loop In/Out, finite or
continuous repetition, and quantization. Independent lengths support
polyrhythm.

V1 previews use the existing unified render pipeline:

- audio waveform;
- video frame;
- image/photo thumbnail;
- typographic text preview;
- composed Draw/Page preview;
- minimal neutral registered presentation for other types.

Molecule and Section previews are derived compositions of real Track content,
never copied state or a second renderer.

## 10. Phase 2

Add Timeline as a third activity. It unfolds every Section left-to-right on one
continuous projection of the same snapshot.

Add Apple-style per-block looping by extending a block edge. Repetitions are
visible, non-destructive, quantized, tempo-aware, and compatible with crop.
List, Mix, and Timeline remain synchronized projections of one canonical state.

## 11. API and acceptance

Extend `eve.timeline.*` and `ui.timeline.*` for Section, Track, group, Record
region, transport, crop, loop, and contextual creation operations. Every UI
operation is programmatic, policy-gated, batchable, traceable, and reversible.

Required validation:

- pure kernel tests for Section topology, structural/temporal transitions,
  trailing empty Track, continuation, virtual clipping, transfer, groups,
  deletion, and rollback;
- Record tests for defaults, fill, overlap, short takes, multi-region,
  pre-roll, forward-play versus scrub, Photo, generic capture, and AUv3 exact
  capability;
- API/MCP parity, atomic batch, and single-point undo/redo tests;
- Bevy tests for nine menu tools, handedness, hierarchy gestures, breadcrumb,
  Info, two-band time surface, crop, loops, and previews;
- real pointer interactions on `#eve_surface_project`, Bevy diagnostics,
  screenshots, and clean browser/runtime logs;
- Molecule, syntax, architecture, DOM, renderer, and no-fallback guardrails.

Completion requires zero active v1/MTraX/Marker/Cell compatibility in the
touched route, zero visible Molecule DOM, no dead tool, no duplicate authority,
and no temporary diagnostic residue.
