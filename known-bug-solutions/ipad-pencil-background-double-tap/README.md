# Pencil double-tap on the project background only toggles the selection

Confirmed on a physical iPad Pro 11-inch (M5), iPadOS 27.2, Apple Pencil, on
2026-10-09, from a Web Inspector trace of the real WebView.

Symptom: in edit mode, two quick Apple Pencil tip taps on the empty project
background never arm Draw. The first tap selects the project background
(contextual rail appears), the next double-tap deselects it (rail disappears),
and so on.

## Root cause

iPadOS WebKit never dispatches pointer events for the **second** tip contact of
a Pencil double-tap. Recorded sequence, four out of four double-taps:

```text
pointerdown pen  → pointerup pen          (first contact, ~60 ms)
click (pointerType "mouse", detail 1)
click (pointerType "mouse", pointerId 1, detail 2)   ~160 ms after pointerup
dblclick (detail 2)
```

`project_layer_tap_classifier.js` waited for two matching pen pointer contacts,
so every Pencil double-tap resolved as one single tap → background selection
toggle. Finger double-taps are delivered as two pointer contacts and were
unaffected.

Owning layer: `eVe/core/atome_events/project_layer_runtime.js` (pointer
lifecycle), `project_layer_tap_classifier.js` (classification),
`project_layer_routing.js` (route to Text / Draw / selection).

## Correction

- `isProjectBackgroundPenDoubleClick` accepts the native `dblclick` as the
  second contact when the pending background tap is a pen tap, within the same
  520 ms / 32 px envelope. The layer's capture `dblclick` listener then calls
  `armBackgroundDraw` (`tool.main.draw`, `state.on`, brush). A lone, stale or
  mouse `dblclick` never arms Draw; pen pointer releases still ignore native
  click detail.
- Tip slide during one contact measured 3.6–7.2 px against the 8 px lasso
  threshold: pen contacts keep a 16 px tap slop (`resolveProjectBackgroundTapSlop`).
  Active Draw keeps its own 8 px claim so strokes start immediately.
- A single background tap selects the project only after the 520 ms double-tap
  window (`scheduleBackgroundSelection`); any new press cancels it. The first
  tap of a double-tap therefore never opens/closes the contextual rail.
- `text_tool_background_runtime.js` stops other armed creation tools
  (`stopOperativeCreationTools`) when it opens the temporary background Text
  session. Before, a finger double-tap with Draw armed activated Text while
  Draw stayed armed underneath; the next Pencil double-tap then went to Draw and
  a 10 px tip slide drew a parasitic mark.

## Rejected hypotheses

- Missing Draw registration or gateway failure: Draw arms correctly from the
  menu and from the corrected shortcut (2026-10-08 and 2026-10-09 traces).
- Text editor swallowing the second contact: repaired on 2026-10-08, not the
  cause here — the trace shows no second pointer contact at all.
- Unit fixtures that dispatch two pen pointer pairs pass by construction; they
  cannot reveal this WebKit behaviour. Keep the recorded sequence in tests.

## Regression coverage

- `tests/eve/project_background_pen_draw.test.mjs`: replays the recorded WebKit
  sequence (0, 7, 14 px slide), rejects lone/mouse/stale `dblclick`, deferred
  single-tap selection for pen/touch/mouse, no selection on finger/mouse
  double-tap, cancellation by a later press.
- `tests/eve/text_tool_background_runtime_contract.test.mjs`: the temporary
  background Text session stops an armed Draw.

## Real-platform acceptance

On a physical iPad with Apple Pencil, empty edit background: Text → Pencil
double-tap → stroke → finger double-tap → type → Pencil double-tap → stroke.
Check in the WebView trace (`window.__EVE_TEXT_BG_TRACE__ = true` plus capture
listeners) that `pen_double_click` fires, Draw/Text are never both active, and
no selection change happens between the two taps. XCUITest cannot synthesize
Pencil contacts; the acceptance needs real Pencil input.
