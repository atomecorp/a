# Structured combination bypasses its dwell timer

Web baseline `matrix_dwell_baseline_v2` (2026-09-08) records a canonical wrap after
only 50 ms of overlap. Both List/Matrix runtimes assigned absorbTargetId directly
and treated any combine intent as armed on release, bypassing the shared timer.

Both now call armStationaryAbsorb and gate release with hasStationaryAbsorbOverlap.
Mode/placement is part of the dwell zone; changing zones restarts the 500 ms wait.
Progress updates use existing BevyUI motion patches. Cancellation, replaced
sessions and failed arming release timers. Canonical membership mutation remains
combineCanonicalMolecule; the new shared feedback module only projects session
geometry, translated intention and progress.

Twenty-four targeted tests pass, including early release, successful release,
zone rearming and cancelled timers. Web matrix_dwell_pixels_v3 and
list_dwell_fixed_v1 pass brief/maintained drops, reorder and reload with clean
console; the List run also expands the molecule. Inspected Matrix pixels show
its dragged image and the complete intention label.

The Matrix ghost had an additional layering bug: raising only the card root to
z=5 covered its preview at z=1. tileMediaCardNode now accepts a base zIndex and
applies the same offset to its children. It reuses the existing record preview.

Remaining acceptance: side-zone compositions, nested targets, undo/redo and
reopening through the Dashboard. Do not infer those from a center-drop result.

## Explicit composition palette — 2026-09-09

The latest approved contract supersedes automatic absorption: after the existing 500 ms dwell, the shared tool palette offers six operations. Release without a chosen option never combines. The original pointer session owns the whole gesture and disposes the palette on release/cancel/reset. Use project_composition_choice_acceptance.mjs; all six choices passed in Natural/List/Matrix, with nested insert/overwrite additionally passing in all three. Canonical history restores membership and spatial position.

A timer initially closed over the first hover point, offsetting its popup from the final pointer. The session now stores the latest normalized surface point; tests must supply the real surfacePointFromEvent contract. Canonical nested-cut playback must read meta.parent_id using the shared record reader. Copy planning remaps timeline owner and child-source IDs; group windows are derived transport slices.
