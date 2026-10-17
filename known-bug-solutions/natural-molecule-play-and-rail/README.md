# Natural: a Molecule's Play does nothing, Stop swaps its rail, a video plays the List way

## Symptoms

- In Natural, Play on a Molecule's rail logs
  `atome_contextual_tool_failed play project_view_selection_target_invalid:<id>`.
- Stop replaces the Molecule's rail by the project's rail; the next Play plays
  the project.
- A lone video selected in the List then shown in Natural plays through the
  List transport instead of its own reader.

## Confirmed causes

- `project_view_surface_context_runtime.js#playLevel` read records from the
  active structured content, which is `null` in Natural: the plan had no
  records.
- `stopEverything` always called `openCurrentLevel()`, entering the container
  rail even in Natural, where the rail belongs to the selection.
- `promoteActiveToCanvas` kept the List's `structured_context` marker.

## Durable correction

- Natural loads the playback records through `loadProjectViewRecordsForPlayback`
  (the List/Matrix loader).
- Stop refreshes through `sync({ force: true })` (keeps the selection's rail);
  Natural reopens the container only when it owns it.
- Promotion drops the marker for a lone medium; a Molecule keeps its structured
  rail (Natural opens Molecules that way).

## Regression checks

- Acceptance, layered scenario (cold image+audio play/stop/end, standalone video,
  Molecule mixes).
