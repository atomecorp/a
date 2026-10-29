# Coplanar glass flicker

## Symptom

Behind blurred glass cards that sit side by side (Dashboard "24 pas" / "18 m",
"Objectif sommeil" priorities), a band along the facing edges flickers while the
video wallpaper plays. It is strongest at card edges whose neighbor lies inside
the blur sampling halo; card interiors and unblurred wallpaper stay stable.

## Confirmed cause

Bevy 0.19 removes transient phase items with `swap_remove`
(`ViewSortedRenderPhases::prepare_for_new_frame`) and `Transparent2d` sorts by
depth only. Retained glass cards sharing one depth therefore change relative
order whenever ordinary sprites/video items are requeued, without any scene
mutation. The ordered compositor (`workspace_blur_composition.rs`) captured, for
each glass card, everything already painted. A neighbor at the same depth was
captured into the halo of the card drawn after it on one frame and excluded on
the next: the halo pixels alternated between two states.

Rejected hypotheses: blur shader/radius/mip quality (unchanged, deterministic),
wallpaper decoding (unblurred wallpaper regions show no reversals), canvas or
DOM stacking.

## Durable correction

`composition_ranges` groups consecutive glass whose paint rectangles do not
overlap and which share the same depth (`SampleRegion::depth`, the mesh
translation z) against one common capture of what lies below their plane.
Overlapping paint and different-depth sampling still split into ordered
captures, so nested glass keeps seeing the glass beneath it. Coplanar cards
never sample each other, independently of tied phase order. One capture replaces
one capture + mip pyramid per card.

## Regression checks

- `tests/rendering/backdrop_temporal_order.rs` — planner contract for any tied
  order, and a real-GPU test that requeues transient content while the scene is
  static and requires every presentation byte to stay identical (fails on the
  pre-fix compositor at logical (128,66), RGB 187 vs 188).
- `tests/rendering/backdrop_composition.rs` GPU reference scenes must stay
  byte-identical.
- Run: `cargo test --offline --manifest-path atome/renderers/bevy-core/Cargo.toml backdrop -- --include-ignored --test-threads=1`
  (needs a real GPU adapter, outside the sandbox).
- Real Web check: pause the wallpaper video, request redraws through
  `request_atome_bevy_redraw` (pointer activity resumes the wallpaper), and
  compare screenshots of the seams between adjacent Dashboard cards.

## Second case (2026-10-27): other items of the glass plane

Symptom: in a panel list (Capture › Audio list on iPad), the row just above the
selected row flickered (~10 Hz, two states): its lower half alternately took a
blue glow from the selected row and lost it. Any selected row did it.

Cause: the grouping above only held while glass items of one plane were
consecutive in the phase. A resting row's drop shadow is projected on a
transparent shape of the row's own plane (`bevy_ui_overlay_record_projection.js`,
`<row>_outer_shadow_<n>` at the row's `layer`). Those non-glass items landed
between the glass rows in an order Bevy reshuffles on every requeue; each one
closed the group, so the next row took a fresh capture that contained the rows
already drawn. The light selected row (no drop shadow, pressed in) made the
bleed visible on its neighbour.

Correction: `composition_ranges` now receives every item's phase depth and
works plane by plane. A plane holding glass gets its capture before its first
item, whatever that item is, so no item of the plane — glass or not — ever
reaches a capture of that plane. A new capture is taken only when something
drawn since the last one lies below the plane (content, or glass under the
sampling halo), or when glass overlaps glass of its own plane. `SampleRegion`
no longer carries a depth: the phase sort key is the one source.

Regression checks:
- `coplanar_glass_shares_one_capture_whatever_other_items_of_its_plane_come_between`
  (planner, every rotation of rows and carriers).
- `equal_depth_glass_remains_pixel_stable_when_transient_content_is_requeued`
  now holds shadow carriers on the glass plane, a light middle row, panel-like
  blur and gap, and photographs every frame while rows are requeued on each
  update (as an animated item does on a device). On the previous planner it
  fails at logical (128,53), the bottom of the row above the light one; the
  phase then splits the plane into three captures right after each requeue and
  settles back a few frames later, which is why a settled screenshot missed it.
- Web A/B on the real app was not completed (probe harness: isolated server
  start timeouts and home not laid while other sessions ran their probes).
