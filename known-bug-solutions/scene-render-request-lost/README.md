# A scene render request lost while the previous render ends

## Symptom

A Dashboard list's cover keeps its old words after an action (Coachs › Mes réservations:
« Annul. » leaves the band, the projected record says « Annulée », the pixels keep
« Confirmée »). Neither a pointer move nor a repaint brings the new text: only some later,
unrelated render of the scene does.

## Cause

`createProjectSceneRenderScheduler` (`eVe/domains/rendering/project_scene_render_scheduler.js`)
renders while `pendingRuntime` is set, then cleared `rendering` in a `.finally` chained after
the loop — microtasks later. A `renderNow` arriving in between (here: the band's unmount
renders the scene, then the list's tree update replaces `runtime.records` and asks again)
saw `rendering` still true, left its runtime pending and received the render that had just
ended. Its records were in `runtime.records` but never reached `runtime.virtualScene` nor
Bevy; the request stayed pending until another one drained it.

Measured on 29 Oct. 2026 (`temp/bevy_scroll_blank/cancel.mjs`, `TRACE=1`): records set
« Annulée » at t+1 ms after the first render's virtual scene, `drain.request` with
`rendering: true`, no second `projection.*` event; the virtual scene node kept « Confirmée ».

## Fix

The render loop clears `rendering` in a `try/finally` inside the same async function, in
the same turn as its last look at `pendingRuntime`: a later request starts its own render.

## Regression

- `node temp/bevy_scroll_blank/scheduler.probe.mjs`: a request arriving 0–7 microtasks after
  a render returns is rendered (HEAD lost it at depths 0–2: `HEAD=1`).
- `node temp/bevy_scroll_blank/cancel.mjs`: after « Annul. » the virtual scene node and the
  pixels read « Annulée ».
- `node temp/activities_audit/l12/ui.probe.mjs`: ALL PASS, `ui/20b_cancelled_later.png`.

## Acceptance

Cancel a booking on its cover: the cover reads « Annulée » at once, without touching anything.
