# iOS panel input: the long press that opens Flower closes the field

## Symptom

On iPhone, a long press inside a Bevy panel input box (the API key field being the
case that surfaced it) opens the `copier` / `coller` Flower menu. Then, **on the
finger lift**, the field stops being edited, the iOS keyboard dismisses, the whole
panel reflows, the petals move, and the paste tool becomes unreachable — and would
have had no field to write into anyway.

## Confirmed cause

Measured on the physical device, not inferred. At the lift the runtime emits **no
`blur` of its own**: `bevy_ui_pointer_runtime.js` emits `blur` only on pointerdown
against a different target and in the `click` branch, and the Flower's
`capturePointerSession` has already replaced `state.pointerTarget` with a flower-root
object. What actually fires is WebKit's own end-of-long-press blur on the hidden
`<textarea>`:

    [atome:focus-trace] pointerup            target=eve_bevy_ui_flower_root focusTarget=home_bio_weight_input
    [atome:focus-trace] native_blur_on_editor retainOnBlur=false
    [atome:focus-trace] editor_unmounted      ownerKey=text_editing_session:home_editor_bio.weight

`createBevyUiTextInputSession` left `retainOnBlur` at its `false` default, so that
native blur ran `stop({ notifyBlur: true })` → `unmountActiveTextEditor()` → the
element is **removed from the DOM**. The keyboard follows that element's DOM focus and
nothing else, so it dismissed; its dismissal contracts `visualViewport`, which is a
deliberate structural resize signal (`surface_runtime.js`), which reflows every
mounted panel (`bevy_panel_runtime.js refreshMountedPanelsAfterViewportSettles`).

A second, independent kill followed: pressing a petal is a pointerdown on a non-text
node, so `bevy_ui_pointer_runtime.js` blurred the previously focused field *before*
the petal's `activate` ever ran.

## Durable correction

- `text_editing_session.js` accepts `retainOnBlur` **and** `reclaimFocusOnBlur` as
  values or predicates resolved at blur time. `retainOnBlur` keeps its existing
  meaning (stay active, look unfocused — what scene text wants); reclaiming the focus
  is the separate opt-in an input box needs.
- `bevy_panel_text_editing.js` holds the session while the Flower **it opened** is on
  screen: `longPress` records the field, the menu's `onClose` releases it, and `stop()`
  clears it. Nothing else changes about the gesture or the menu.
- `bevy_ui_pointer_runtime.js` does not let a press on the `flower` layer take the
  focus: a menu standing over a field in order to act on it is not where the user's
  attention moved. The hit result carries the tree's layer (`bevy_ui_runtime.js`).
- `bevy_panel_text_editing.js paste()` selects the whole value before writing, whether
  or not the field was still open: nobody pastes an API key halfway into another.
- `bevy_ui_flower_runtime.js` gained the surface-resize owner it was the only mounted
  tree to lack (`subscribeRenderSurfaceSize`), re-deriving its centre from the stored
  opening point, and `disableScaleWatch: true` like the panel. A close in flight is
  never interrupted by a resize, or the menu would stay mounted for ever.

## Follow-up: the pasted value stayed invisible until the next tap

Once the menu was usable, `coller` wrote the value into the draft but painted
nothing: the field showed the old text until the user tapped it again. Measured on
the device, `project()` reported `branch: "patch"` — `textInputProjectionUpdates`
returns a patch whenever the selection is collapsed on **both** sides, which a paste
always is, so `sync()` took the in-place caret patch instead of a rebuild and the
glyphs were never re-laid out. `paste()` and `insertText()` now repaint once after
`sync()`. The value appears immediately, with no further interaction.

## Follow-up: the press that reaches for a selection destroyed it

A double click selects a word; the long press that opens the copy menu is itself a
press, and `beginSelection` / `placeCaret` collapsed the selection to the pressed
index before the menu existed. `copier` then had nothing selected to take.
`text_editing_session.js` now keeps the selection when the press lands **inside** it —
the behaviour of every text surface — and only a drag from that point, or a press
outside, replaces it. The drag anchors where the finger went down rather than at the
old selection start. `bevy_panel_text_editing.js copy()` also prefers the selected
text over the whole field, so selecting a word and copying it means something.

## Rejected hypotheses

- *The Bevy pointer runtime blurs the field at pointerup.* It does not; the trace above
  shows no `blur` event at the lift.
- *The Flower's pointer lock would have swallowed it.* That guard
  (`bevy_ui_pointer_runtime.js`, `isFlowerPointerInteractionActive`) only affects Bevy
  routing; it cannot stop a native DOM blur.
- *Re-focusing the editor from inside the blur handler keeps the keyboard.* Measured on
  device: iOS refuses it. The keyboard still goes down. Only a focus issued inside a
  fresh user gesture raises it — which `paste()` already does.

## Regression evidence

- `tests/eve/text_editing_session_contract.test.mjs` — a predicate-retained session
  survives a native blur, keeps its editor mounted, does not commit, takes the focus
  back, and returns to normal commit-on-blur once the predicate goes false.
- `tests/eve/bevy_ui_flower_contract.probe.mjs` — the corolla re-derives its centre on
  a surface change and stays inside it; a resize during a close still unmounts.

Physical iPhone acceptance (Debug, cleaned binary, `one.atome.app`): a real 900 ms
long press on the `Clé API` field shows the menu with the panel **completely still** —
no keyboard dismissal, no reflow, petals where the finger left them. Copy from one
field and paste into another writes the value through the menu.

**Known limitation:** the keyboard is still dismissed by iOS at the lift; only the
editing session survives. `paste()` raises it again inside its own tap gesture, which
is the only moment iOS allows it.
