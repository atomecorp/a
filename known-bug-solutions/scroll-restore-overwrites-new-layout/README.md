# A panel turned (lying → standing) keeps its old rows, stretched; its slab is at the new place

## Symptom

A Dashboard panel whose body scrolled (the Sport card lying on a phone, Forme/Force cut at its foot) is turned
standing. Its slab moves to the standing place, but its title, tabs and rows stay where they lay lying, wider
than the screen, their letters stretched sideways (by the ratio of the two widths), a frosted band over the
strip. Touches land where the rows should be (the JS hit scene is right).

## Cause

The panel standing fits without scrolling: the browser lays every record again at its standing place and size
(text textures drawn for the new width), then, with no list left, detaches the tree's scroll areas
(`bevy_ui_scroll_runtime.js` `describe` → `detach_atome_bevy_scroll_tree`). The renderer then ran
`ScrollTree::restore` (`atome/renderers/bevy-core/src/scroll_area.rs`), which laid every record it had ever
presented back on its *base* — the pose read when the tree was described lying — over the pose the browser had
just written: lying place and lying width, with the standing texture inside. The JS mirrors (records, virtual
scene) said standing, so no later diff ever corrected it.

## Fix

`ScrollTree::restore` lays a record back on its base only while the record still shows the renderer's own last
pose: its `AtomeLogicalPosition` change tick equals the tick recorded when it was last read or laid
(`RecordState::laid`). A record the browser wrote since is left as the browser laid it (the same rule
`linear_lens_band.rs#restore` applies through `notice_described_records`).

## Regression

- Rust: `a_detached_tree_lays_back_only_the_records_the_browser_did_not_lay_again` (`src/scroll_tests.rs`).
- Web probe: `temp/sport_rotation_2026-11-17/rotate.probe.mjs` (phone 932×430 → 430×932, Sport card open).

## Acceptance

After the turn, the panel's rows lie inside its standing slab at their standing width, unstretched, with no
action needed; sending the panel's transforms again changes nothing on screen.
