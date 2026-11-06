# A rubric's plates blur the home they replaced

## Symptom

On the eVe Dashboard, a rubric opened from a home tile (Activité, Média…) shows plates whose glass carries blurred
pieces of the home: a pink glow at the top of the plate lying where the V logo was, an orange tinge on the plate over
the Moniteur tile. The user described it as "the background blur is done on the previous screen" (2026-11-04).

## Confirmed cause

Not a stale capture. The Mystic plates (`procedural_sdf`, mode 3) are glass: the ordered composition snapshots the
presentation attachment before their plane, and `intuition_mystic_plate` blurs that snapshot. The Dashboard kept the
home's tiles laid under the plates for the whole time the rubric was open (`dashboard_mystic_cells.js` only removed
their shadow), because the opening and closing cascades capture the workspace (`mystic_capture.rs`, front target) and
the plates turn carrying those pieces. At rest the plates hid the tiles but their glass still blurred them.

Proof: suspending the home tree while the rubric is open turned the plate over the V logo from [131,101,163] to
[102,79,128], the plate over Moniteur from [102,92,136] to [81,75,120] (the wallpaper alone); a plate over an empty
cell did not move.

## Durable correction

- The grid Mystic tells its caller when its plates rest over the caller's cells: `onCovered(true)` once the opening
  cascade has landed (or at once for a `place` reopen), `onCovered(false)` awaited at the start of `close()`, before
  the closing capture (`bevy_ui_mystic_grid_runtime.js#covered`, `bevy_ui_mystic_runtime.js`).
- The Dashboard lays no home tile under a rubric while covered (`dashboard_mystic_runtime.js#cellShown`), and lays
  them again before the closing cascade; every new rubric starts uncovered so its opening still carries the home.
- No renderer, capture or redraw change.

## Regression evidence

`temp/d18_glass/fix.probe.mjs` (isolated server, Metal Chromium): each plate's pixel equals the same plate over the
wallpaper alone (Δ 0 at three points); the home after closing equals the home before (Δ 0 at four points).
`temp/d18_glass/hypo.probe.mjs` shows the defect on the code before the fix.

Other transitions, same pixel method (`temp/d18_glass/transitions.probe.mjs`, `page_turn.probe.mjs`): project → Dashboard
(tiles Δ 0), eVe Pro → eVe Basic (as a fresh Basic boot, only the Agenda glyph differs), eVe Basic → eVe Pro (4 px),
a level opened from a plate, a page turned (Capture, page 2) and eVe Basic's Contacts rubric: no home in the plates' glass.

## Closing cascade (residual, fixed 2026-11-04)

During the closing cascade (≈0.5 s) the home's tiles are laid again under the turning plates: a plate that has landed
(progress 0) paints nothing and shows the live workspace, so the tiles must be live from the first landing. The plates
still up then blurred them, since `intuition_mystic_plate` blurred the live snapshot.

Renderer fix: a plate's glass lies over its own hole, so it blurs what the hole shows, the surface background captured
with the menu, never the live workspace.

- `mystic_capture.rs`: a fourth capture camera draws `MENU_BACKGROUND_LAYER` (layer 4), at the same instants as the
  background target, into a quarter-resolution linear capture (the workspace backdrop's own `capture_image` /
  `blur_pyramid_image`, same size, so `backdrop_blur_lod` reads the same level). It carries a `BlurCapture`.
- `workspace_blur_pyramid.rs`: the downsample chain serves every pyramid (one chain per image: the workspace's and each
  `BlurCapture`'s); `BlurCapture` is the extracted component of any capture camera whose image is reduced into a
  pyramid. `workspace_blur.rs#generate_workspace_blur_mips` runs for every such camera view (the workspace camera now
  carries a `BlurCapture` too; the `AtomeWorkspaceCamera` marker is gone).
- `procedural_sdf.rs` / `procedural_sdf.wgsl`: binding 9/10 `menu_back_blur`; `sample_pyramid_mip` takes the pyramid
  (`sample_aligned_mip` is the workspace's call of it); `intuition_mystic_plate` reads `menu_back` (unblurred) and
  `menu_back_blur` (blurred).
- Accepted cost: a video wallpaper is frozen under the plates (as it already was in the holes): the background is
  captured when the menu opens, turns a page or closes, not every frame.

The Dashboard's `covered` hiding stays: at rest the joints between the plates (and any cell a rubric leaves free) show
the live workspace, not glass. With the home tiles live under resting plates, 1025 px of tile edges showed in the
joints (closing cascade probe, instant 0), while the plates themselves were identical.

Proof (isolated server, Metal Chromium):

- `temp/d18_glass/closing_cascade.probe.mjs`: the cascade's animation clock is frozen at 0, 75, 150, 225, 300, 375 and
  450 ms; at each instant the frame with the live home is compared with the same frame with the home tree suspended,
  over every pixel a plate paints (a pixel differing from the wallpaper alone). 360 363 painted pixels lay over a home
  tile across the instants, 11 landed cells showed the live home: Δ 0 on every plate pixel. Only a landed cell's
  neighbour contact shadow (translucent by design, ≤ 3 px a cell) lets the live home through.
- `fix.probe.mjs` (plates Δ 0 at three points, home back Δ 0 at four), `transitions.probe.mjs` (four rubric states
  Δ 0 on 146 410 to 204 974 plate pixels, project and mode switches unchanged), `page_turn.probe.mjs` (Capture page 2:
  Δ 0). The two last probes now compare inside the rubric's plates only (≥ 100 px): the band's field and the pager
  arrow lie in the home tree and are hidden with it, which they had counted as glass.
- Zero console errors on every run.

Not verified: iPad (A12Z: the new pyramid uses only colour attachments, no storage texture), a video wallpaper.
