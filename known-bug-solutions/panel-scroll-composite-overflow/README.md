# Panel scroll composite overflow

## Symptom

While a panel list scrolls past the lower edge of its body viewport, the row itself and its label disappear correctly but a nested avatar or icon reappears over fixed controls below the body. In the Contact panel, the avatar of `+33652575517` was visibly painted over `Tout sélectionner`.

## Confirmed owner and root cause

`eVe/domains/rendering/bevy_ui_overlay_record_projection.js#pushNodeRecords` is the canonical record and clip propagation owner for every BevyUI tree.

Panel scroll intentionally retains offscreen descendant records so crossing the viewport boundary produces stable transform/style updates instead of GPU despawn/spawn churn. For a fully offscreen composite child with its own `overflow: hidden`, `overflowClipForNode` correctly computed an empty intersection as `null`. At the record boundary, however, `null` means “no clip”. The nested image therefore lost the scroll viewport clip and became fully visible again while its row remained clipped.

## Durable correction

The projection walk now carries an explicit `clippedOut` state independently from the clip rectangle. Retained offscreen records keep their ids and geometry but the complete descendant subtree projects at zero opacity until it intersects the inherited viewport again. A `null` empty intersection can no longer be mistaken for an unclipped child. Partially visible descendants continue to use the ordinary rectangle intersection and are cropped at the exact viewport edge.

This rule is generic: Contact avatars, list thumbnails, icons, text and any future composite panel row share it. No panel-local mask, manual coordinate bound or DOM overlay is introduced.

## Rejected alternatives

- Clipping only the Contact avatar would leave the same record-projection defect in every other composite list row.
- Removing offscreen records would restore mount/unmount allocation flicker during scroll.
- Shrinking or repositioning the row changes layout but does not repair descendant clip semantics.
- Treating every `null` clip as hidden would break nodes that legitimately have no clipping ancestor.

## Regression check

Run:

```bash
./node_modules/.bin/vitest run tests/eve/bevy_ui_overlay_reconciliation.test.mjs -t "retained panel rows keep fully clipped composite children mounted but invisible"
```

The fixture places a phone row and its nested avatar completely below a retained panel scroll viewport. Both avatar records must remain mounted and both must have zero opacity. The complete nearby layout, overlay, Contact and Contact-pick suites pass 28/28.

## Real-runtime acceptance

Open Contact with enough entries to scroll. Move a row containing an avatar or placeholder through the lower and upper body boundaries. At every intermediate position, every pixel of the avatar, icon, label, shadow and background must remain inside the body viewport and must never cover `Tout sélectionner`, Import, Add, the Contact footer or the main toolbar. Repeat in Web, Tauri and iOS.
