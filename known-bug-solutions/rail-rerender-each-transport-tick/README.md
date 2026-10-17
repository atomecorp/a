# The contextual rail re-renders on every transport tick

## Symptom

While anything plays, the rail tree re-renders ~30 times per second
(`renderVersions` +85 in 3 s): wasted energy, and a scene that never settles.

## Confirmed cause

The rail refreshed on `PROJECT_VIEW_TRANSPORT_STATE_EVENT`, published each tick
with the position, although it only shows the playback's state.

## Durable correction

`project_view_transport_runtime.js` also publishes
`PROJECT_VIEW_TRANSPORT_STATUS_EVENT` when what plays changes (status, root,
selection, active leaves); the rail listens to that one. Measured: +1 render
in 3 s.

## Regression checks

- Sample `eveBevyUiRuntime.state.renderVersions` for 3 s during playback.
