# Mixer strips cannot be scrolled by dragging (touch)

## Symptom

With more strips than the screen holds, a finger (or mouse) drag never scrolls the
mixer row; only the wheel does. A swipe on a fader moves the fader, on the empty
space draws a lasso.

## Confirmed cause

`bevy_ui_pointer_runtime.js` hands a drag to the scroll area only when the target
does not own its drag. Every strip surface owns one: faders, the lasso layer, and
the band and modules (long press then move). Once a quick travel cancelled the
band's hold, the drag still went to the band.

## Durable correction

A `long_press` handler marked `quickTravelScrolls = true` hands a travel made
before the hold to the scroll area; the strip band declares it
(`molecule_mix_strip_tree.js`). Modules keep their quick swipe (bypass).

## Regression checks

- `temp/mixer/mixer_touch_real_app.probe.mjs` (`touch_swipe_scrolls_the_strips`);
  `temp/mixer/mixer_ui_real_app.probe.mjs` (band hold-drag into a group unchanged).
