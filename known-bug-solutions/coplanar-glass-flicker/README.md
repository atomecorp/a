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
