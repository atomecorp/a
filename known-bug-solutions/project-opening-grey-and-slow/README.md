# Opening a project shows a grey page for seconds (iOS), then the List view jumps in

## Symptom

iPhone, 2026-10-27: opening a small project (8 Atomes) from the eVe home showed
the bare project surface (grey) for 6–9 s; then the objects, then the saved view
(List) a few seconds later. Returning to the home reopened the assistant.

## Evidence (`temp/project_open_speed/`, real WebView by the inspector)

- `/ws/api` answers in 2–250 ms during the wait: not the database.
- `atomes.render` 6.5 s for 7 records; `bevy.diff.map_spawns` 4.6 s: the spawn
  batch awaited each project photo's texture (fetched from `atome.one/api/uploads`,
  ~4 s each, then decoded) before spawning any node.
- The mode switched to `project` 30 ms after the touch (Projects rubric tile:
  no transition), so the project surface colour covered the screen at once.
- At launch, the import cycles read the 21 000 `import_origin` rows six times and
  the 16 000 `calendar_event` three times (~70 s on the local server's single
  queue): every request made meanwhile waited behind them.

## Root causes and corrections

1. Image textures were the only media resolved before spawn →
   `bevy_pending_media_contract.js#shouldDeferMediaImageTextureResolution` (project
   pictures and every server-read picture — List thumbnails and the List footer's
   stills from the local server included: a full-size phone photo decodes in ~1.3 s —
   spawn pending, the deferred owner hydrates them).
2. The opening was not a transition from the home and presented the page only
   after the load → `project_workspace_activation_runtime.js` begins the transition
   at the touch, plays the growth from the tile beside the load, writes the current
   project after presentation; `project_opening_progress.js` shows the ring once the
   page is presented and still waiting 300 ms (never as a flash).
3. Concurrent import cycles and the personal profile import each read the tables
   → one shared snapshot while cycles run (`canonical_import.js#acquireImportSnapshot`).
4. The home reached by leaving a project replayed the launch welcome →
   `user_workspace_surface_runtime.js` remembers the grid mode on return.

## Regression checks

- `node temp/project_open_speed/import_snapshot.probe.mjs` (one read for two
  concurrent cycles; writes kept, fresh read after).
- Device: `temp/project_open_speed/fair_open.sh LABEL` (from the home; reads
  `atomes.render doneMs`, `bevy.diff.map_spawns`).

## Results (27 Oct. 2026)

- iPhone: 8-object project 8.7 s → 1.19 s (List painted at 0.79 s); boot database
  work 70 s → 24 s, origins read once instead of six times (51 s → 4.7 s).
- iPad M5: 8 objects 0.99 s, 53 objects 1.08 s; ring checked on screen with a
  forced 8.5 s read; return to the home: tiles and « Rechercher », no assistant.

## Open

Thumbnails still fill one by one (~1.3 s per full-size photo decode, the same photo
decoded again for each size): decoding once per source, or at the drawn size, is
the next gain.
