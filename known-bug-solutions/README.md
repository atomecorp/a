# Known Bug Solutions

- [Private-vault history routing](vault-history-routing/README.md): empty history and unavailable undo despite persisted edits.

This directory records confirmed root causes and durable fixes for recurring
regressions. Each issue owns one folder so an agent can reproduce and validate
the established solution before attempting a new implementation.

## Index

| Symptom | Folder |
| --- | --- |
| A panel or home level is empty / « Chargement… » offline or with a silent network; iOS first touch slow | [display-waits-for-network](display-waits-for-network/README.md) |
| Android app (Firebase build) stays on a white screen after the splash; or a blank page where WebGPU has no adapter | [android-white-screen-at-launch](android-white-screen-at-launch/README.md) |
| iOS guest back on the access screen after relaunch; « Mieux dormir » / « Dashboard eVe » duplicated at each « Commencer » | [guest-session-erased-by-preview-frame](guest-session-erased-by-preview-frame/README.md) |
| A media preview (Médiathèque Lecture, contact takes) shows Pause but is silent | [preview-playback-silent-null-duration](preview-playback-silent-null-duration/README.md) |
| Tauri: project opening 10–25 s; return to the home stuck grey in `transition` | [home-return-stuck-in-transition](home-return-stuck-in-transition/README.md) |
| Home/projects repeatedly reload after restart or suspension; interrupted iOS reconstruction restarts at zero | [durable-startup-sync](durable-startup-sync/README.md) |
| Home opens another Dashboard than chosen; false « liaison avec le serveur a échoué »; lift on a channel does nothing; TV sound without picture | [home-wrong-dashboard-and-false-link-errors](home-wrong-dashboard-and-false-link-errors/README.md) |
| Input calibration reports no impulse on a high-latency output | [calibration-impulse-unheard-high-latency](calibration-impulse-unheard-high-latency/README.md) |
| Shrinking a Timeline clip by its end loops it instead of cropping | [timeline-crop-becomes-loop](timeline-crop-becomes-loop/README.md) |
| A Timeline clip moves only after it has been cropped (clips back to back) | [timeline-clip-moves-only-after-crop](timeline-clip-moves-only-after-crop/README.md) |
| Timeline Play stops at the last clip; Stop rewinds; the bottom scrub does nothing | [timeline-transport-stops-at-content-end](timeline-transport-stops-at-content-end/README.md) |
| Mix/Timeline of a selected Molecule shows the project | [molecule-activity-shows-project](molecule-activity-shows-project/README.md) |
| Ribbon shows only the Atome after a sign-in that settles before the workspace | [ribbon-atom-only-after-sign-in](ribbon-atom-only-after-sign-in/README.md) |
| Web import creates nothing on a first visit, or imported sound is silent in a Molecule | [web-import-first-visit-and-duration](web-import-first-visit-and-duration/README.md) |
| Natural: Molecule Play fails, Stop swaps its rail, a video plays the List way | [natural-molecule-play-and-rail](natural-molecule-play-and-rail/README.md) |
| The contextual rail re-renders on every transport tick while playing | [rail-rerender-each-transport-tick](rail-rerender-each-transport-tick/README.md) |
| Include wraps the target Molecule instead of adding to it | [include-wraps-target-molecule](include-wraps-target-molecule/README.md) |
| Matrix drag throws `px is not defined` | [matrix-drag-media-card-px](matrix-drag-media-card-px/README.md) |
| Web render clock becomes null seconds after boot; takes lose sample accuracy | [kira-backend-double-evaluation](kira-backend-double-evaluation/README.md) |
| Web takes shorter than recorded, later material too early | [recorder-inactive-input-drops-time](recorder-inactive-input-drops-time/README.md) |
| Video picture runs ahead of its sound during playback | [video-picture-ahead-of-sound](video-picture-ahead-of-sound/README.md) |
| Mixer strips cannot be scrolled by a finger drag | [mixer-strips-never-drag-scroll](mixer-strips-never-drag-scroll/README.md) |
| A successful grouped preference/grant write still reads as missing and empties the editor | [batch-write-retains-missing-state](batch-write-retains-missing-state/README.md) |
| Sending to a contact from the Dashboard fails with `project_work_mode_editing_blocked` | [communication-blocked-by-consultation](communication-blocked-by-consultation/README.md) |
| iOS: switching to another app restarts atome from the beginning (SIGKILL `0xdead10cc`) | [ios-app-restarts-after-switching-apps](ios-app-restarts-after-switching-apps/README.md) |
| iOS: ~300 000 pending deliveries, slow state listings, daily `diskwrites_resource`, other devices writing MB/s while they replay | [ios-outbox-backlog-unchanged-import-origins](ios-outbox-backlog-unchanged-import-origins/README.md) |
| iOS: nothing loads after returning from background (« certaines données n'ont pas pu être chargées ») | [ios-local-server-dies-after-background](ios-local-server-dies-after-background/README.md) |
| Dashboard wallpaper returns to a default or previous choice; project default greys diverge | [wallpaper-selection-races](wallpaper-selection-races/README.md) |
| Nested User accordions shift or lose their open anchor; List Play covers the hierarchy cap | [nested-panel-anchor-and-row-seams](nested-panel-anchor-and-row-seams/README.md) |
| Native builds repeatedly fill the disk with Rust objects and per-run Xcode caches | [build-cache-disk-exhaustion](build-cache-disk-exhaustion/README.md) |
| Edges between adjacent blurred glass cards flicker over an animated wallpaper | [coplanar-glass-flicker](coplanar-glass-flicker/README.md) |
| Logout loses the welcome screen; Billing actions stall; Dashboard restoration flashes gray | [first-launch-logout-and-restore](first-launch-logout-and-restore/README.md) |
| Guest project rail remains absent and a browser update retains the old reader | [guest-contextual-access](guest-contextual-access/README.md) |
| Expert List opens without its main menu while catalog registration replaces the first render | [main-menu-projection-admission](main-menu-projection-admission/README.md) |
| Opaque floating Bevy panels interleave rails, text, commands and footers | [panel-window-stack](panel-window-stack/README.md) |
| Assistant appears before connection, loses voice on token refresh, or its input covers ribbon tools | [assistant-connection-ribbon](assistant-connection-ribbon/README.md) |
| Nested media cannot crop, images stretch, or trimmed waveforms deform | [source-space-media-crop](source-space-media-crop/README.md) |
| SVG double-click has no WebGPU handles or Color targets an old layer | [svg-vector-edit-webgpu](svg-vector-edit-webgpu/README.md) |
| Matrix cumulative selection toggles the wrong cell after a store reload | [structured-selection-reload-order](structured-selection-reload-order/README.md) |
| Draw stretches its initial SVG segment into a blue block | [svg-draw-stale-projection](svg-draw-stale-projection/README.md) |
| Moving the rail Size on a selected drawing leaves its stroke unchanged | [draw-size-not-applied-to-selection](draw-size-not-applied-to-selection/README.md) |
| Text selection shrinks its frame or silently formats an invisible range | [text-selection-frame-and-target](text-selection-frame-and-target/README.md) |
| Native Cmd-Z is inactive or history repeats an already undone transaction | [canonical-history-shortcuts](canonical-history-shortcuts/README.md) |
| Tauri Home or Dashboard first-open times out under permission-heavy accounts | [tauri-panel-permission-scans](tauri-panel-permission-scans/README.md) |
| An imported video plays audio once, then later playbacks are silent | [media-video-audio-replay](media-video-audio-replay/README.md) |
| An imported HEVC MOV shows wrong colors, or a silent MOV never starts | [media-video-codec-and-silent-playback](media-video-codec-and-silent-playback/README.md) |
| List Delete has no handler, playback skips paged items, or projected audio progress freezes | [project-view-list-media-regressions](project-view-list-media-regressions/README.md) |
| Projects disappear, project views look empty, or legacy media returns 404 after identity migration | [project-state-media-identity-reconciliation](project-state-media-identity-reconciliation/README.md) |
| Bottom menu or moved panels float after rotation or WebView resize | [cross-runtime-viewport-reanchor](cross-runtime-viewport-reanchor/README.md) |
| Flower or tool glass keeps stale white/image pixels, or turns opaque dark, during resize or content movement | [dynamic-backdrop-refresh](dynamic-backdrop-refresh/README.md) |
| Browser login with a Tauri-created account terminates Fastify during sync | [sync-subscription-burst-fastify-crash](sync-subscription-burst-fastify-crash/README.md) |
| iOS shows purple then black because WebContent is terminated during boot | [ios-webcontent-boot](ios-webcontent-boot/README.md) |
| A12-class iPad shows a uniform grey canvas while boot states read "ready" | [ipad-a12-grey-canvas-storage-limit](ipad-a12-grey-canvas-storage-limit/README.md) |
| A panel keeps its first frame ("Chargement des contacts") and ignores taps; console repeats `bevy_media_texture_fetch_failed:404` | [panel-frozen-by-missing-image](panel-frozen-by-missing-image/README.md) |
| Every tap is dead after media lands in a project not on screen; `elementFromPoint` returns another `project_view_` | [offscreen-project-layer-steals-pointer](offscreen-project-layer-steals-pointer/README.md) |
| Deleted Atomes come back on iOS/Tauri: template cells stacked or duplicated, deleted cells visible | [local-server-tombstones-in-lists](local-server-tombstones-in-lists/README.md) |
| iOS launch shows "Le démarrage continue…" for 10-20 s when the server does not answer | [ios-boot-server-await](ios-boot-server-await/README.md) |
| iPhone assistant answers nothing and shows nothing although the app looks signed in | [ios-assistant-silent-dead-remote-session](ios-assistant-silent-dead-remote-session/README.md) |
| Dashboard rows (contacts, appointments, health) vanish and come back at boot | [dashboard-lane-flicker](dashboard-lane-flicker/README.md) |
| Many contacts missing for good, photos missing, editing one contact deletes others | [contacts-lost-by-global-replace](contacts-lost-by-global-replace/README.md) |
| A new device or reinstalled browser restores nothing; re-imports duplicate contacts/appointments; old duplicate cards remain (merge on request) | [new-device-restores-nothing](new-device-restores-nothing/README.md) |
| Contact favorites lost; Dashboard rows reload/flicker each visit; one heart shows a person several times | [home-panel-save-erases-favorites](home-panel-save-erases-favorites/README.md) |
| Project → Dashboard pauses then snaps to the wallpaper | [dashboard-transition-jump](dashboard-transition-jump/README.md) |
| Native contacts import stops after ~14 min or after a kill, then a reinstall duplicates the book | [contacts-import-interrupted-and-duplicated](contacts-import-interrupted-and-duplicated/README.md) |
| iOS launch keeps "Le démarrage continue…" over a Dashboard entry or a late Main Toolbar mount | [ios-boot-presentation-contract](ios-boot-presentation-contract/README.md) |
| A long press in a panel input box closes the field, the keyboard and the layout on finger lift | [ios-panel-input-fast-tap-blur](ios-panel-input-fast-tap-blur/README.md) |
| iOS freezes after a rotation: the old frame is stretched, the bottom band stops answering and every tool raises the keyboard | [ios-rotation-freeze](ios-rotation-freeze/README.md) |
| An AI-generated image or speech keeps displaying an older generation | [ai-generated-media-identity](ai-generated-media-identity/README.md) |
| Production update stops on `@emnapi` and a later restart returns Nginx 502 | [production-update-dependency-gate](production-update-dependency-gate/README.md) |
| Phone-link SMS stays inert in Tauri/iOS, Tauri hangs, or iOS never leaves its boot cover | [phone-link-native-runtime](phone-link-native-runtime/README.md) |
| A recorded video or audio shows no Play in the contextual rail or Mystic menu | [recorded-media-contextual-play](recorded-media-contextual-play/README.md) |
| Panel/list rows flash while scrolling, or a panel row shows pointer hover paint | [panel-scroll-hover-flicker](panel-scroll-hover-flicker/README.md) |
| A scrolled panel row is hidden but its avatar/icon reappears over fixed actions below | [panel-scroll-composite-overflow](panel-scroll-composite-overflow/README.md) |
| The device heats up or the GPU stays busy while the app sits idle — or zoom, rotation and Mystic stutter at ~2 frames/s | [idle-render-loop-heat](idle-render-loop-heat/README.md) |
| The phone heats up on an idle Dashboard although rendering is at rest; thousands of `subscribe`/`replay-complete` or `sync:projection-ready` per minute | [sync-replay-storm-idle-heat](sync-replay-storm-idle-heat/README.md) |
| A recorded video stays black in a Bevy preview on Web; decoder `errorCode: 4`, the bare `/api/recordings/` URL answers 404 | [hidden-video-missing-media-token](hidden-video-missing-media-token/README.md) |
| A Pencil double-tap on the project background toggles the selection/rail instead of arming Draw | [ipad-pencil-background-double-tap](ipad-pencil-background-double-tap/README.md) |
| iOS reports hundreds of GB of disk writes, the first launch is slow, `adole.db` weighs GB or calendars vanish after a contacts import | [local-db-disk-writes-and-slow-listing](local-db-disk-writes-and-slow-listing/README.md) |
| iOS: importing or downloading a background leaves the surface unchanged, no error (opaque `atome:` origin vs CORS) | [ios-opaque-origin-media-cors](ios-opaque-origin-media-cors/README.md) |
| Project view: reorder detaches a Molecule member, Delete bypasses the Molecule, Create Text/Code/Return/long press misroute text editing | [project-view-molecule-text-regressions](project-view-molecule-text-regressions/README.md) |
| Slow first canvas (purple wait), surface briefly drawn at 75 %, unstable motion while the UI prepares | [ui-preparation-motion](ui-preparation-motion/README.md) |

## Maintenance rules

- Add an entry only after the failing path, owning layer, and correction have
  been evidenced.
- Record rejected hypotheses when they prevent the same unproductive work.
- Keep reproduction steps on the canonical UI path; do not document direct
  runtime invocation as a product test method.
- Include the persistent regression test and the real-platform acceptance
  sequence required before declaring the issue resolved.

- [Structured drop dwell and dragged-card layering](structured-drop-dwell/README.md) — confirmed short-overlap combination and WebGPU ghost fixes.

- [Performance recording loses Stop](performance-record-stop-rail/README.md) — forced context refresh during recording.

- [Multiple-selection playback scope](selection-playback-scope/README.md) — full selection transport and active-leaf preview.

- [Live Mute canonical event](live-mute-canonical-event/README.md)

- [End-anchored List loses visible rows after scrub](project-list-virtual-window/README.md): retain the shared virtualizer window when consuming the end anchor.

- [iOS restore identity, durable retry and Dashboard error recovery](ios-sync-restoration/README.md): actual-owner regressions; full physical-account recovery remains a separate acceptance check.

- [Calls straight to voicemail, or connected without media](calls-silent-or-straight-to-voicemail/README.md): presence renewal; mediasoup must announce a public address.

- [iOS takes time out: wake listener holds the microphone](ios-takes-blocked-by-wake-listener/README.md): suspend `AtomeVoice.wake` for the take.

- [Communication tool unfolds again after being folded](comm-tool-reopens-after-fold/README.md): acknowledged notifications no longer unfold it; only new ones do.
