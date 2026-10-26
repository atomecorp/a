2026-10-26 Films & séries commands (MCP, runtime V2, assistant): `films.services` → `{ services: [{ service, label, declared }] }`; `films.set_service { service, declared }`; `films.search { query?, service?, page_token? }` (no query: newest; service: that one alone, no free channel) → `{ entries: [{ entry_id, kind: movie|tv|archive, title, year, overview?, services, free, has_trailer }], next_page_token }`; `films.similar { entry_id }`; `films.lists { list: favorites|history }`; `films.favorite { entry_id, favorite }`; `films.like { entry_id, liked }`; `films.open { list: films|videos, view?: home|favorites|history|platforms, query?, service? }`; `films.play { entry_id }`; `films.control { action: play|pause|stop|next|previous|fullscreen|exit_fullscreen }` → `{ ok, list, shown, current, page }` (`shown`, not `view`: `projectRuntimeMcpResult` drops `view`/`scene`/`surface`). Errors `INVALID_ARGUMENT|ENTRY_NOT_FOUND|NOT_CONFIGURED|SOURCE_UNAVAILABLE|PRESENTATION_UNAVAILABLE|NOTHING_TO_PLAY|NOT_PLAYING|SAVE_FAILED`. Capabilities `films.read|write|control` (default actor). Contract `atome/src/squirrel/films/contracts.js`, runtime `eVe/domains/media/films_runtime.js` (`registerFilmsPresentation({ present, control })` by `dashboard_mystic_stage.js`). STREAMING_SERVICES + `shadowz` (TMDB 513), `molotov` (1967, no public search: its home opens); `canal` also covers Canal+ Séries (345).

2026-10-26 Streaming view (iOS app, Tauri macOS and Android): native commands `streaming_view_open { service, url (https), rect, radius }` (laid BEHIND the app page), `streaming_view_place { rect, visible }`, `streaming_view_front { front }` (over the page while the person acts in it), `streaming_view_media { action: state|play|pause }` → `{ ok, playing, has_media }`, `streaming_view_close`; errors `streaming_view_unavailable|unsupported|closed|request_invalid|os_unsupported|host_missing|command_invalid|window_forbidden`. iOS: `__ATOME_IOS_NATIVE_INVOKE`; Tauri: command `streaming_view_invoke { command, payload }` when `__ATOME_STREAMING_VIEW_NATIVE__`. TV catalogue stream kind `service_page` (`service`, `url`): France TV channels.

2026-10-26 MCP `shows.*` (`atome/src/squirrel/shows/contracts.js`): `shows.plates {}` → `{ plates: [{ plate, level, label, name }] }`; `shows.search { plate, query?, radius_km? (2|5|10|20|50|100), cinemas?, page_token? }` → `{ entries: [{ entry_id, kind, title, summary?, start?, end?, place?, city?, distance_km?, league?, price?, has_site, has_tickets }], next_page_token, radius_km }`; `shows.open { plate, query?, entry_id?, cinemas? }`; `shows.set_radius { radius_km }`; `shows.add_to_calendar|navigate|open_site|open_tickets { entry_id }` (errors `PLATE_NOT_FOUND|ENTRY_NOT_FOUND|POSITION_UNAVAILABLE|NOT_CONFIGURED|NO_DATE|NO_PLACE|NO_SITE|NO_TICKETS|USER_GESTURE_REQUIRED|PRESENTATION_UNAVAILABLE|CALENDAR_UNAVAILABLE|NAVIGATION_FAILED`). `shows-nearby` entries of OpenAgenda kinds gain `ticketUrl`.

2026-10-26 `shows.*` MCP for Temps libre: `shows.plates` → `{ plate, level: shows|leisure, label, name }` and lists only the plates the server can fill (the DATAtourisme ones need `sources.tourism`, `dashboard_shows.js#dashboardShowPlateKeyed`); `shows.search` on Musées without the key reads the exhibitions (as on screen); `shows.navigate` passes the entry's position (`gps.navigate_to { place }`); entries carry `source` / `credit` (DATAtourisme attribution); `SHOWS_ASSISTANT_INSTRUCTIONS` adds the Temps libre phrases. Probe `temp/leisure/leisure_mcp.probe.mjs` (12/12, keyed 2/2) through `handleAtomeMCPRequestAsync`.

2026-10-26 Temps libre DATAtourisme: `shows-nearby` adds kinds `museums|nature|hiking|experiences|wellbeing` (DATAtourisme, server key `DATATOURISME_API_KEY`; without it `shows_tourism_not_configured`; past the hourly budget `shows_tourism_busy`; entries `kind: place` + `summary?`, `address?`, `image?` with `credit`, `source` = producer, last update) and `sources` → `{ ok, sources: { tourism: boolean } }` (no position). Client `shows_client.js#readShowsSources()`. `stageListCoverNode({ glyph })` optional image source shown when `cover` is empty.

2026-10-26 Video catalogue: public `/ws/api` `video-catalog { op: discover|search|similar, services: [STREAMING_SERVICES keys], free?: false, query? (search, ≤120), ref? (similar, movie:<id>|tv:<id>), pageToken?, region (XX), language (xx) }` → `{ ok, entries: [{ id: movie:<id>|tv:<id>, media, title, year, date, image, overview, offers: [{ key, service, name, logo, monetization: flatrate|free|ads }], trailer (YouTube id or '') }], nextPageToken }`; a title is listed only with an offer that needs no purchase or rental (declared services' `flatrate`, any `free`/`ads`; `free: false` keeps only the declared services); errors `video_catalog_request_invalid|rate_limited|not_configured|unavailable`; 60 requests/min per address; TMDB key server-only (`TMDB_API_KEY`). Relayed by Tauri (`public_relay.rs`) and iOS (`FastifySyncPublicRelay.swift`). `media-library-search { kind: 'film' }`: Internet Archive feature films; `media-library-fetch` of a film answers `stream` and `thumb` only (`file` → `media_library_fetch_range_invalid`). iOS native invoke: `streaming_view_open { service, url (https), rect, radius }`, `streaming_view_place { rect }`, `streaming_view_close` → `{ ok, error? }`.

2026-10-26 Temps libre: `shows-nearby` kinds become `concerts|stage|expos|events|family|free|sport|cinemas|heritage|restaurants|bars|films|matches` (`festivals` removed, `events` = festivals, fêtes, carnivals, markets, flea markets, fairs); place kinds answer `kind: place` entries `{ id, title, place, city, lat, lon, distanceKm, phone?, url? }` nearest first (OSM France on OpenDataSoft, ODbL, no key). `gps.navigate_to` takes an optional `place: point` (a known position: no `search_places`).

2026-10-26 List selection boxes, one contract: `hierarchicalSelectableListNode({ selection })` and `buildAccordionList({ selection })` take `listSelectionHandlers(prefix, emit)` (`bevy_panel_list_selection.js`; replaces `onSelectionPress/Drag/Release/Cancel` and the accordion's `emit` + `intentPrefix`); a box needs all four gestures (`listSelectionBoxEvents` throws `list_selection_gesture_incomplete`). Intents `<prefix>.press|drag|release|cancel` carry `value` (the row id, formerly `id` for Info, Contact, Messages) and are answered by `createListSelectionRuntime(...).route(prefix, intent, context)` (null otherwise). New prefixes: `dashboard_takes.selection` (Créer / Captures lists), `people_picker.selection`, `contact.conversation.attach.selection`, `contact.conversation.takes.selection` (replaces `contact.conversation.take.tick`), `sleep_page.routine.selection` (replaces `sleep_page.routine.toggle`; the programme is written once, at the gesture's release).

2026-10-26 Shows around a position: public `/ws/api` `shows-nearby { kind: concerts|stage|expos|festivals|family|free|sport|cinemas|films|matches, lat?, lon?, radiusKm? (1–100), query?, pageToken?, region?, language? }` → `{ ok, entries: [{ id, kind: event|cinema|film|match, title, summary?, dateLabel?, start?, end?, place?, address?, city?, lat?, lon?, distanceKm?, price?, image?, url?, phone?, league?, sport? }], nextPageToken }` (`server/ws_shows.js`: OpenAgenda public dataset and OSM France cinemas on OpenDataSoft, no key; TMDB `now_playing` with server-only `TMDB_API_KEY`, cached 12 h per region; TheSportsDB free key, next match of eight French leagues, cached 1 h; 30 requests/min per address; errors `shows_request_invalid|shows_rate_limited|shows_films_not_configured|shows_unavailable`), relayed by Tauri `public_relay.rs` and iOS `FastifySyncPublicRelay.swift`. Client `eVe/domains/shows/shows_client.js#readShows({ kind, at, radiusKm, query, pageToken })`. Shared `atome/src/squirrel/shared/external_page.js#openExternalPage(url, reserved)` (https only; iOS `squirrel.openURL`, Tauri opener, Web tab).

2026-10-24 Médiathèque streaming: `media-library-fetch { id, variant: 'stream' }` → `{ ok, url, total, mime, name }` — the checked provider address (redirects followed and checked by the server, `Range: bytes=0-0` must answer 206/200, ≤ 256 MB) for a page player or the audio engine; the client still names only a result id. Rate limit per client (`user:<id>` for an account, else the address): 240 fresh requests/min (search, thumb, waveform, stream, first range), following ranges 1200/min. Client `media_library_online.js#readOnlineMediaStream`; player `intuition/tools/media_library_video_runtime.js#mediaLibraryVideoRuntime` (stage records `media_source: 'media_library'`).

2026-10-24 Atom corner: `createDashboardEveAtom({ docksInGrid, centreRef })` (removed `onExpanded`; new `engaged()`, `inspect().docked/travelling/present`), `layoutToolsBand({ handedness })`, `buildBevyMenuToolNode({ shape: 'round' })`, `dashboardFooterNavigation.dockedAtomRecords(base, box, living)`, `DASHBOARD_SESSION_REF` / `dashboardSessionNeighbours` (replaces `dashboardAtomNeighbours`); `createDashboardEveAssistantChoices` no longer returns `followUntilLift`. Template `dashboard_eve` v7: cells `session` (centre) and `atom` (footer).

2026-10-24 Unified tiles and Matrix collections: removed with the built-in full-screen Dashboard engine: `window.eveDashboardBevyUiRuntime` / `getDashboardBevyUiRuntime` (and the other `*DashboardBevyUiRuntime` exports), `warmupDashboardRuntime`, the `creationCategory` option of `openWorkspaceDashboardAndMainMenu` (it only opens the eVe home), the tool `ui.dashboard.sidebar.set` with `toggleProfessionalDashboardSidebar` / `onAtomSlide` / `setMatrixDashboardSidebar`, the Mystic hooks `readDashboardMysticTarget` / `isMysticContextItemTarget` / `MYSTIC_DASHBOARD_SURFACE_CONTEXT_TYPE` (context type `dashboard_surface`), the `invalidateCategories` / `invalidate` refresh params (creation actions, News publish/reception: displays refresh from canonical atome events only), `matrix_background`, card label editing and the system template `dashboard` (« Dashboard Pro »). New: `eVe/domains/matrix/matrix_collections_runtime.js#createMatrixCollectionsRuntime({ atomeId, projectId, treeId, readBounds, normalized, interactive, onZone })` → `{ state, treeId, open, render, close/destroy, toggleCategoryFilter, createDefault, activateCategory }`; `onZone({ zone, kind, category, item })` with zones `header_filter` / `header_new` / `item` lets project Interactions answer first. New export `eVe/elements/skin/tool_skin.js#resolveBevyGlassTint(hex)`.

2026-10-24 Mystic Dashboard footer navigation: grid-anchored Mystic grids may declare `navigation: 'caller'` (the caller draws its return and page turns outside the cells): `paginateMysticGrid` then needs no `previous`/`next` cells; the grid may give `onPaging({ page, pages, depth })` (called synchronously when a layout changes them, before its filter is laid) and persistent cells `{ onSelect, onLongPress?, holdMs?, navigation? }`; Mystic runtime API `navigateGrid('back' | 'next')` (back = previous page, then the level above, then close). Dashboard: `createDashboardFooterNavigation({ tokens, readTree, fieldId, isRubricShown, isStageShown, navigate, closeStage, goHome, refresh, openUrgent, atomRect, atomTouch, patchTree })`; `createDashboardCommunicationInput({ navigation, fieldShown })` + `fieldIn(band)`; `createDashboardMysticGeometry({ fieldIn })`; `DASHBOARD_HOME_LAYOUT.lastProject` (ex-`turnCells`).

2026-10-24 Musique: Apple Music commands `apple_music.seek { seconds }` (control) and `apple_music.artwork { ids?, scope?, size? }` (read; no ids = the song playing; `items: [{ id, artwork }]` JPEG data URLs); `apple_music.get_state` adds `artist`, `duration`, `position`; Apple items add `duration`. Music items (`MUSIC_ITEM_SCHEMA`) add `artwork_url` (https) and `duration`; `music.get_state` adds `position`; `musicArtworkUrl(value)` in `atome/src/squirrel/music/contracts.js`. Dashboard: `createMusicSource`/`resolveMusicProvider` (`eVe/domains/music/music_source.js`), `createDashboardMusic` (`dashboard_music.js`), `createDashboardStageCells({ treeId, rubric })` (`dashboard_stage_cells.js`, ex-`createDashboardShoppingPlates`), `createDashboardSurfaceTools({ treeId })` and `buildDashboardSurfaceToolsTree({ treeId })`, stage `openPanel({ title, placeholder })` + context `hostClearField()`, stage `filterPlaceholder()`, snapshot `title`.

2026-10-24 Media handoff: assistant context commands (`atome/src/shared/assistant_context_contract.js`) `surface.send_media { surface, atome_id?, fullscreen? }` → `{ ok, device, media: { name, kind, atome_id }, result, message }` or `{ ok: false, error, message }` (`media_handoff_nothing`, `remote_command_surface_not_found|ambiguous`, `teleport_target_offline`, `teleport_declined|timeout|…`, the destination's `MEDIA_NOT_HERE|MEDIA_PROJECT_UNAVAILABLE|…`; not relayable: `surface.*`) and `media.resume { atome_id, project_id?, position_seconds?, fullscreen? }` → `{ ok, atome_id, project_id, kind: tv|online|audio|video, position_seconds, fullscreen, playback }` (run on the destination, by the relay as actor `remote_surface`). Online video runtime: `cue(atomeId, seconds)`. No new transport, server route, Atome type or durable field: teleport (`teleport` family) + remote command (`remote-control` `command`) carry it. `teleport` `return` (« Rapatrier ») now also pushes `teleport-arrived { atome_id, session_id: null, surface_id: <destination>, origin_surface_id: <surface it left>, returned: true }` to the owner's connections, like an accepted offer.

2026-10-23 Scene Master: Molecule op `scene.update` accepts `gain_db` (-120..+12; 0 removes it); kernel exports `sceneGainDb(scene)`, `sceneGainLinear(scene)`. Molecule timeline API `setGroupTimelineSceneGain({ group_id, scene_id, gain_db })` → `{ ok, transport, cells }`: the playing Timeline and cells hear the level at once, nothing is stored. Engine session (`MoleculeSession`): `setSceneGain(sceneId, linearGain)`, pieces kept in `session.sceneVoices` (voice id → piece); transport timeline field `sceneGains` and track field `followsScenes`.

2026-10-23 Contextual rail order: `orderRailDefinitions(definitions)` / `railBaseRank(definition)` / `isRailBaseDefinition(definition)` (`eVe/intuition/runtime/eve_intuition/atome_contextual_rail_order.js`). Rail definition changes: `container_play` and `news_play` are plain `{ toolType: 'tool', label Play|Stop, icon play|stop, active }` (no `longPressChildren`, `container_play_stop` / `playbackStop` removed; `projectViewTransportToolDefinition(playing)` in `project_view_contextual_rail.js`); News adds `container_play_mode` (`NEWS_RAIL_TOOL_KEYS`); Molecule info adds the palette `molecule_play_mode` (its `play` has no hold options); `timeline_cells_play` label key `eve.timeline.cells.launch` (replaces `eve.timeline.cells.play`), icon `cursor`; `timeline_cell_play_mode` icon `redo`. Projection runtime: `activeSlots()` returns the base + foreign running tools; `state.activeSlotOrder` removed.

2026-10-23 Timeline `view.set` (Molecule op `molecule.view.set`): `layout` timeline|cells|split|scene; `scene_id` (the Scene the Scene view shows, a Scene id or null; a removed Scene resets it); `scene_slots` `{ [scene_id]: { [track_id]: { column, row } } }` (validated: existing Scenes and tracks, non-negative integers, one track per slot; stale entries pruned on every write). `cells_projection` removed (ignored on replay). Kernel exports `resolveSceneSlots(timeline, sceneId)`, `placeSceneSlot(timeline, { scene_id, track_id, column, row })` → whole `scene_slots`, `timelineLanes`.

2026-10-23 Voice engine commands (`atome/engines/audio-engine/src/commands.rs` `dispatch`, feature `voice`; Tauri `audio_voice_*` in `audio_engine/bridge.rs` + `permissions/audio-engine.toml`; iOS app through `atome_ios_audio_command`, start/stop owned by `AppNativeVoiceEngine.swift`): `audio_voice_start { modelsRoot, ownCapture }` → `{ active }`, `audio_voice_stop`, `audio_voice_set_phrases { phrases }` (error `voice_words_out_of_vocabulary: …`), `audio_voice_set_speaking { speaking }`, `audio_voice_set_listening { listening: 'conversation' | 'wake' }`, `audio_voice_set_wake_verifier { verifier: json | null }`, `audio_voice_read` → `{ active, events, input_db, overrun }`; events `speech_start`, `phrase { text, words: [{ word, conf }] }`, `unknown { reason: 'outside_grammar' | 'too_long' }`, `wake { score }`, `error { code }`. Without the feature (AUv3, iOS simulator) the names answer `audio_command_unknown`. C ABI `atome_ios_voice_push(samples, count)`. JS: `createNativeVoiceEngine` / `createBrowserVoiceEngine` (same API: `start`, `stop`, `setPhrases`, `setSpeaking`, `setListening`, `setWakeVerifier`, `inputDb`, `onEvent`), `createConversationTurns({ say, phrases, understand, lines, onWake })`, `withAssistantOfflineGate(api, { env })` (offline: no session, line `eve.voice.assistant.error.offline`). WASM `VoiceConversation` (`setSpeaking`, `reset`, `inputDb`, `listen`, `push`). Removed: `AtomeVoice.muteListening`, STT `mute`, `setMuted`, `onUtterance`, `plugin:stt|set_muted`.

2026-10-23 Private iOS OTA developer distribution: CLI `--adhoc [--dry-run|--prepare|--publish REPORT]`; no App Store Connect upload in Ad Hoc. Fastify `GET /ios/install`, `POST /ios/session` (personal bearer -> two-hour build/tester capability), `GET /ios/builds/:id/{manifest.plist,atome.ipa}` (capability, no cookie dependency, ranges), `GET /ios/status` (redacted release version/id). The session route issues download-media capabilities, not application commands or business mutations. Administrative enrollment/revocation/publication uses existing SSH, never a public execution endpoint.

2026-10-23 Home corrections: `dashboard.monitors.place { id, position: 0|1|2 }` (persistent, `progression.write`) → `{ ok, ids, slots }` places a selected monitor on the eVe Pro home's two monitor cells (0 = not on the home, still selected; a taken position swaps when the monitor held the other one, else the former one leaves), error `progression_monitor_not_selected`; preference `dashboard.health_monitors` gains optional `slots: [id|'', id|'']` (absent = the first two selected, unchanged behaviour), kept by `monitors.select` (an unticked monitor leaves its place). `food.scan` gains error `NO_BARCODE` (time out with the camera still shown; the camera closed by the user stays `CANCELLED`); the shopping list shows every scan failure but `CANCELLED` on its sheet. Contacter: new BevyUI surface `contact_reach` (number with the phone keypad + « Votre premier message »), `sendContactConversationText` waits for the contact; `bindContactConversation` / `contactConversationBound` and the conversation's `awaitNumber` context are gone; a request's note shows as my message « En attente » (`buildConversationHistoryNodes({ pendingNote })`).
2026-10-23 Médiathèque online sources: `media-library-search { kind, discover: true }` (no query: a theme drawn at random by the server, first page) → same answer; results gain `has_waveform`; `media-library-fetch { id, variant: 'waveform' }` → `{ ok, points: [0…1] }` (Openverse audio). Sounds come from Openverse only; NASA videos resolve to their lightest rendition; Archive items ≤ 80 MB. A source slower than 8 s is left out once another answered; answers kept 1 h. Client `media_library_online.js#discoverOnlineMedia`, `readOnlineWaveform`. Mystic contracts: `item.pending` (breathing plate), `parent.search(text, { update })`.
2026-10-23 `/api/eve/mail/*` (`server/mailRoutes.js`): every route requires a verified device session (`registerMailRoutes(server, { identify })`, 401 `mail_auth_required`); gateway methods take `(options, userId)`; the cached connection is keyed by user + hashed password; `checkMailHosts` refuses IP literals, non-mail ports and non-public addresses (`mail_<imap|smtp>_host_invalid|port_not_allowed|address_not_public`). Client `bootstrap_transport.js#resolveMailSyncHeaders` sends the Fastify session (none to the local Tauri server); `normalizeReadPayload` keeps `ok: false`.
2026-10-22 `training.*` (`atome/src/squirrel/training/contracts.js`): `set_profile` gains `tempo { concentric_s, eccentric_s }` (integers 1-6, strength only, `TRAINING_TEMPO_LIMITS`/`trainingTempo` in `training_catalog.js`) and `auto` (boolean, default true); profiles return `tempo`, `auto`; record `program_activity.training` gains `tempo`, `auto` (`validateTrainingActivity`). `read_log` sessions gain `energy { total_kcal, active_kcal, method, estimate }` (null without a body weight), `work_minutes`, `rest_minutes`, `paused_minutes`, and the result gains `days` (per-day sessions, active minutes, kcal); `get_exercise` sessions carry the same; `session_transition` returns `energy` once every step is done. `schedule_week` updates kept slots' exercises and deletes future slots the new plan dropped. `CalendarAPI.releaseProjectEvents(projectId)` → `{ ok, removed, errors }`.
2026-10-22 `/ws/api` `contact` `request` (server/communication_request_guard.js): new sender-only errors `contact_request_too_soon` (15 s), `contact_request_quota` (10/h, 20/day, 3/day for an account < 72 h), `contact_request_pending_limit` (20 unanswered within 30 days), `contact_request_suspended` (3 blocks within 30 days), `contact_phone_invalid`; every answer waits a 400 ms floor; a number without account is counted like any other and answers `{ ok, status: 'pending' }`. `respond { decision: 'accept' }` persists the note the recipient read as the first conversation message (both vaults, `message_id` `contact_request_*`). Messages/shares/calls to a sender refused or blocked without ever being accepted now answer `contact_required` instead of a silent success. Account creation (`account-create`): 10 per network per day besides 5 per hour.
2026-10-22 Bevy `surface_paint` (Rust `surface_paint.rs`, JS `bevy_projection_style.js#normalizeBevySurfacePaint`): optional `textureScale` (1..3, texels per logical pixel; lengths stay logical, so a `1 / devicePixelRatio` border is one physical pixel), optional `gradient` (linear, CSS angle) on `border` (replaces `color`/`colors`) and on each inset shadow (replaces `color`). All three enter the texture cache key. Tests `tests/rendering/panel_surface_paint.rs` (graded border, fading inset stroke, scaled raster).
2026-10-22 Removed with the DOM Matrix runtime: `window.open_matrix_view`, `window.close_matrix_view`, panel globals `matrix_view`, `window.__eveMatrix`, `window.__eveFinder.setContext` / `setFinderContext`, `findProjectTileElement`, `closestProjectElement` and the `matrix:context` event. Tools `ui.matrix.view` and `tool.main.matrix` take no input (`TOOL_NO_INPUT_SCHEMA`) and accept `open` / `pointer.click`; `close` returns `matrix_view_action_unsupported:close`.
2026-10-22 Assistant captions: `window.eveAssistantApi.retell(text)` — a sentence she heard, corrected by the person: sent in writing (`sendText`); when the exchange was spoken, her answer is read aloud (`readAloud`) and she listens again (`listen`). Conversation snapshots gain `live` (`{ id, role: 'user'|'assistant', text }` or null): the voice turn still being said, fed by `createRealtimeSession({ onHear })` (each transcript delta, the turn's accumulated text) through `conversation.hearVoice(turn)`; never persisted, cleared by `appendVoiceTurn` of the same id, `restore` and `reset`. `commFieldNode` accepts `textStyle` and `multiline: 'wrap'` (`registerField`: one-line value, Return submits, painted wrapped). `surface_ui_pointer.js#bevyUiPointerHit(payload)` returns the BevyUI hit (`isBevyUiPointer` = its truthiness). Matrix templates call `frameNodes(frame, { editing, emit })`.
2026-10-21 Sport v3 (`atome/src/squirrel/training/contracts.js`): `training.list_favorites` → `{ favorites: [target] }`, `training.set_favorite { target, favorite }`, `training.read_program` → `{ program: [{ target, exercises }] }`, `training.add_to_program { target }`, `training.set_program { targets }` (reorder, remove, empty), `training.open_program` (card). A target is an exercise id or `zone:upper|lower|core`. Stored in the user profile (`preferences.training.favorites|program`), account-wide. `TRAINING_ASSISTANT_INSTRUCTIONS`: « série terminée / série validée / étape validée / c'est validé » = confirm the current step, « je reprends / série suivante » during a rest = confirm the rest, « enregistre la séance » = finish (objectives only when said). Exercise display name `plank` = « Planche » (zone « Gainage »).
2026-10-21 GPS position sharing: commands `gps.share_position { user_id }` (persistent, fresh fix + outbox flush + `share request` read-only real-time linked), `gps.stop_sharing_position { user_id }` (revokes my `live_position_<me>` shares with that peer), `gps.list_shared_positions {}` → `positions: [{ user_id, atome_id, lat, lon, accuracy, timestamp, name }]` (< 30 min). New error `CONTACT_REQUIRED`. Also `window.atome.gps.*`, MCP `gps.*`. Map intents `finder.place.pinch { phase: start|change|end, event.delta_x = cumulative scale }`; `finder.place.zoom` now accumulates `delta_y` (100 px = one level). Exported `invokeGpsCommand(action, input, layer)` (`eVe/domains/gps/gps_api.js`).
2026-10-21 Offline-first displays (local first, network completes): new owner `eVe/intuition/runtime/local_first_read.js` (`readLocalFirst({ local, remote, update, scope })` — both reads start together, the local answer is returned, the network one is handed to `update` after it, a network failure is reported and keeps the local answer). Mystic `loadChildren({ update })` (`bevy_ui_mystic_activation.js#refreshChildren`: a lazy level refreshes in place only while it is on top); Dashboard rubric sources get `update` from the new `eVe/domains/dashboard/dashboard_mystic_rubric_reads.js` (`createDashboardRubricReads`: cache, freshest answer, prefetch — moved out of `dashboard_mystic_runtime.js`); Finder sources `load({ scope, update })` (`bevy_panel_finder_runtime.js`). Local-first sources: Contacts rubric + live search + home `load()` (`dashboard_mystic_sources.js`, `dashboard_mystic_runtime.js`), Divertissement + TV (`dashboard_stage_media.js`, `tools/tv.js`), Médiathèque types (`dashboard_library.js`), Finder contacts scope. People directory: new owner `eVe/intuition/tools/contact_public_directory.js` (`readPublicDirectoryOf(owner)` one read at a time, last answer kept; `knownPublicDirectory`); `contact_model.js#collectPeopleDirectory({ local })`, `findPersonById`, `readPublicDirectory({ local })`; `dashboard_contact_items.js#listContactItems(..., { local })`. Media list: `audio_core_media.js#list_user_media_files` reads the server list and the device's takes together (wave per source, `local: true` skips the Web server, server read bounded 10 s, no `auth_required` on Web without cloud token); `media.js#listUserMedia({ local })`. Non-blocking network reads: Home panel `contacts.getPreferences`, Privacy rules, Sommeil page circle posts, Communication sync (after the local selection), conversation call lines first, weather fetch bounded 10 s. Tool catalogue refresh (`intuition/runtime/tool.js#refreshToolCatalogFromDatabase`, on window focus = first touch on iOS) goes by slices of 6 and skips unchanged entries (`tool_state.js` `TOOL_CANONICAL_PERSISTED`, `TOOL_CATALOG_RECORD_VERSIONS`). Templates panel lists before installing the onboarding templates.
2026-10-22 Calendar event panel: intents `calendar.editor.time { minutes }`, `calendar.editor.duration.step { delta }`, `calendar.editor.alarm.toggle { value: at_time|before_5m|before_15m|before_30m|before_1h|before_1d }`, `calendar.editor.recurrence { value: none|daily|weekly|monthly }`, `calendar.editor.more` (the select/preset intents `calendar.editor.alarms` and `calendar.editor.select.toggle` are gone). Calendar events carry an optional `icon` (dashboard icon key; particle `icon`, kept when absent from an update). Slider contract: `sliderOptions.valueFontSizePx` (expanded horizontal value size). `trainingActionDisc({ size })` + `trainingActionDiscHeight(size)`. Sleep routine: `routine.items[]` now stores the planned `start`/`minutes`; an unchanged plan only updates `suspended`/`icon`, so a time moved in the calendar survives switches. Sommeil page intent `sleep_page.routine.open { value: key }` opens the event via `openPanelSurface('calendar', { eventId, projectId, source: { type: 'dashboard_calendar_item' } })`.
2026-10-21 Sommeil page day list: `project.program.commit` `configure` accepts `routine_off` (array of `SLEEP_ROUTINE_KEYS`, `sleep_routine_model.js`; omitted = the stored `routine.off`, else none). Switched-off items get no calendar event (an existing one is deleted, re-created when switched on); the programme stores `routine: { enabled, items, off }`. The Sommeil page's « Ta journée » is the panels' `hierarchicalSelectableListNode` (leading icon, time meta column, selection box → intent `sleep_page.routine.toggle`); the dinner card hides while `dinner` is off.
2026-10-21 Assistant touch: `window.eveAssistantApi.respond()` (via `invokeAssistant('respond')`): she answers a touch aloud (`eve.voice.assistant.touch_response`, now « Oui, que veux-tu ? » / "Yes, what would you like?", pre-rendered Siwis line) and listens on; while writing it brings the voice back. `createRealtimeSession` gains optional `announceTouch` and `respond()` (microphone shut while the line plays, like `announceReady`; `realtime_touch_announcer_required` without it); `bindVoiceAssistantSession` accepts `announceTouch`. The local controller keeps its `respond()`. `eveAtomPoses({ poke })` and `eveAtomPoke(elapsedMs, layer)` (`dashboard_eve_tokens.js`, token `poke`).
2026-10-21 Sport v2 (`atome/src/squirrel/training/contracts.js`): `level` is `1 | 2 | 3 | 'custom'` everywhere (level 4 retired; a stored 4 reads as `profile.level: null`, `prepare_session` then answers `TRAINING_PROFILE_REQUIRED`). `training.set_profile` gains `custom` (a prescription in the shape of one of the exercise's catalogue levels; started from the current level when omitted) and `sound` (beeps and spoken steps, on unless false); `get_exercise`/`set_profile` profiles return `{ level, base_level, custom, sound, load_kg, involvement }`. `suggest_load` at `custom`: `basis: 'custom'`, the user's reps, their load. Record `program_activity.training` gains `custom`, `use_custom`, `sound` (`validateTrainingActivity`). New exercise ids `wall_sit`, `dead_hang`, `leg_press`, `leg_extension`, `leg_curl`.
2026-10-21 MCP and clipboard (iPad campaign): `ui.copy.action`, `ui.cut.action`, `ui.paste.action`, `ui.copy.duplicate`, `ui.delete.selection` run from their bootstrap entry by importing the owner module's exported action (`copyAction`, `cutAction`, `pasteAction` in `tools/copy.js`/`tools/paste.js`, `deleteSelectionAction` in `tools/delete.js`, `duplicateSelectionViaClipboard`): before, an MCP call answered a fake success (paste) or `tool_handler_missing_v2` until a ribbon touch had loaded the module. Explicit targets (`atome_id`, `atome_ids`, `selection_ids`) are the whole target set: dispatch no longer adds the active atome. `ai.tools.call`/`ai.tools.list`/`ai.audit.list` and `mcp.tools.list` load the optional integrations wave (`loadAIAgent`, `mcp_bridges.js`) instead of failing `AtomeAI is not available`. `atome.create`/`atome.box` no longer merge the legacy Squirrel DOM defaults (0,0 · 69 px · #272727) and `atome.describe` no longer returns them (`ensureAtomeContext` removed); `ui.creator` reads `name` as the label (never a file name) and a shape's fill sets `color`. `ui.new_project` declares `goal` as an enum and lists each family's goals. `tool.main.paste` declares the `ui.paste.action` schema (`PASTE_INPUT`) and the menu `touch` forwards the invocation input (`triggerMainToolInteraction(..., { input })`): the Mystic's Paste lands at its project point. `findPersistedClipboardGroup(copyKey)` (`clipboard/state.js`) finds a copy in any project's clipboard atome; a copy key with no copy pastes nothing (`clipboard_copy_unavailable`). iOS `clipboard_read_items` answers an own copy from the persisted `(changeCount, key)` without reading the pasteboard (no « Allow Paste » prompt). `ui.level.*` are allowed outside Edition. `resolveProjectSceneNextPlacement(projectId, { records })` places against canonical records when the project scene is not loaded. `setProjectMatrixModulesSuspended(projectId, suspended)` (`matrix_module_runtime.js`). `atomeDisplayLabel(record)` (`atome_record_utils.js`): own name, else first text line, else media family + time.

2026-10-20 Communities (Cercle Sommeil, a network in the network): `/ws/api` type `community` (`server/communities.js`, answer `community-response`), actions `join` → `{ joined }` (false, silently, for a refused person within 30 days or a banned one), `leave`, `feed` → `{ member, host, host_id, publications }` (newest first; banned authors and blocked pairs left out), host only: `members` → `[{ id, status, name }]`, `refuse { userId }`, `ban { userId }`, `unban { userId }`, `remove-post { newsId }` (host or author, with its reposts). A member posts with `news/publish` and `audience: { community: id }` (`community_not_member` otherwise); `news/like` and `news/repost` work for members, a repost stays in the community. Client `AdoleAPI.communities.{join, leave, feed, members, refuse, ban, unban, removePost}(community, …)`; contract `atome/src/shared/community_contract.js` (`COMMUNITIES`, `communityAudience`, `communityOfAudience`). Env `SLEEP_CIRCLE_HOST_PHONE` names the host account (else a phone-less account « Morphée » is created on first use).

2026-10-20 Sport commands (`atome/src/squirrel/training/contracts.js`, runtime V2 + direct MCP + assistant): `training.list_exercises { kind? }`, `get_exercise { exercise_id }` (+ `zones` from the user's age), `open_exercise`, `open_journal { exercise_id? }`, `open_week` (Dashboard cards), `set_profile { exercise_id, level, load_kg?, minutes_per_week?, days? }`, `suggest_load { exercise_id, level?, body_weight_kg? }`, `plan_week { minutes_per_week?, days?, goal? }` (goal from `dashboard.objectives.list` when omitted, else `TRAINING_GOAL_REQUIRED`), `schedule_week { week_start, hour?, … }` (personal calendar events with `programLink.source = 'training'`, never doubled; MCP access `confirm`), `prepare_session { request_id, exercise_id, level?, load_kg? }` (writes the `program_objective:<activity>:<objective>` links), `session_transition { session_id, base_revision, request_id, action, step_id?, actual?, actual_measures?, source? }` (`elapse`, `measure`), `get_session`, `read_log`. Capabilities `training.read` / `training.write`; heart rates only for `source.type === 'ui'` with `healthAccessAllowedNow()`, `health_access_denied_for_actor` for a health-store measure from MCP/AI.

2026-10-20 Dashboard Enhancement: `/ws/api` `directory` actions `meet { goal, theme, scope, query }` (cards declaring the goal, reciprocal for Amour/Sexe, hidden people excluded) and `meet_card { principalId, goal, theme, scope }` (hook, presentation, photos only for a searcher the card matches) — client `AdoleAPI.directory.meet/meetCard`; `news` actions `like { newsId }` (the author alone is notified, kind `news-like`) and `repost { newsId }` (republished, `reposted_from` credit, the author's media readable by the reposter's audience) — client `AdoleAPI.news.like/repost`, `window.eveNews.like/repost`; user property `meeting_photos` (≤ 6, written apart from `eve_profile`); profile `meeting` gains `hook`, `presentation`, `hidden`; preferences `media.likes`, `youtube.favorites`. Contact relations (`server/communication_relations.js`, decision of 20 Oct. replacing 14 Oct.): `respond { decision: 'refuse' }` no longer blocks — status `refused`, silent for the sender, a new request is notified again only after 30 days (`REFUSAL_WAIT_DAYS`); `block` stays the permanent ban; `request` while a request is pending is not notified again; `list` reports `statuses[peer] = 'refused'` and `blocked` holds only real blocks.

2026-10-20 Online video services (YouTube, PeerTube): public `/ws/api` `peertube-search { query, pageToken? }` → `{ ok, results: [{ url, title, thumbnail, channel, host, duration }], nextPageToken }` (Sepia Search, public non-NSFW non-live videos, 10 per page, `pageToken` = next offset) and `peertube-resolve { url }` → `{ ok, url, title, duration, streams: [{ kind: hls|video, url }] }` (only instances of the joinpeertube.org directory; errors `peertube_video_invalid|peertube_video_unavailable|peertube_resolve_unavailable|peertube_search_rate_limited`), relayed by Tauri and iOS. Commands `peertube.search|play|close|set_fullscreen` (input `video_url`, capabilities `peertube.read|control`) built with YouTube's by `atome/src/squirrel/online_video/contracts.js#createOnlineVideoContract` (YouTube contract unchanged). Atome props `peertube_video_url`, `peertube_title`; profile lists `preferences.peertube.history|favorites`. Finder event `finder.video.more` (was `finder.youtube.more`), snapshot `videoHistory` (was `youtubeHistory`), `searchOnlineVideos({ provider, query, pageToken })` (was `searchYoutube`), `playVideoOnAtome({ ref })` (was `videoId`).

2026-10-20 Médiathèque online sources (public `/ws/api`, relayed by Tauri and iOS): `media-library-search { kind: image|video|audio, query }` → `{ ok, kind, results: [{ id, provider, kind, title, license, author, source_url, width?, height?, duration?, has_thumb }] }` (public domain / CC0 only; ids `openverse_image:` `openverse_audio:` `nasa:` `archive:`, never a URL); `media-library-fetch { id, variant: file|thumb, offset }` → one byte range `{ base64, offset, length, total, mime, name }` (never `data`: the browser WS client reads a reply's `data` as its envelope) (512 KB, 256 MB max, result ids kept 1 h by the server; unknown id → `media_library_result_unknown`). Owner `server/ws_media_library.js` over `server/public_source_fetch.js`. Profile list `preferences.media.favorites` (media only: `{ id, kind, name, file_name, file_path, owner_id, mime_type }`).

2026-10-20 Dashboard style: `preferences.visual.dashboardStyle` accepts `eve_basic` | `eve` only (retired `basic`, `pro`, `mystic`, `auto` read as `eve_basic`). Tool `ui.first_launch.home` removed (declaration in `tool_runtime_bootstrap_matrix_defs.js`, handler, consultation allowlist). `toggleWorkspaceDashboardAndMainMenu` removed: the Atom short press opens the eVe home (`openWorkspaceDashboardAndMainMenu`). Workspace preference key `home_eve_project_id` only (`home_template_project_id`, `home_mystic_project_id` retired).

2026-10-20 Objective settings (time, effort, optional money budget): `dashboard.objective.settings.read { objective_id }` and `dashboard.objective.settings.set { objective_id, time_budget?, effort?, money_budget? }` (same `dashboard.*` family, capabilities `progression.read|write`) → `{ objective_id, settings{ time_budget|null, effort|null, money_budget|null } }`. Schemas in `atome/src/shared/objective_settings_contract.js` (`OBJECTIVE_TIME_BUDGET_SCHEMA`, `OBJECTIVE_EFFORT_SCHEMA` 1–5, `OBJECTIVE_MONEY_BUDGET_SCHEMA {amount ≥ 0, currency ISO 4217, basis total|month|week}`; `money_budget: null` removes it). `set` first composes missing engagement controls (`ensureObjectiveEngagement`), checks every value with the `ui.matrix.value` owner (`matrixControlValueEvent`) and commits them in one batch. `ui.matrix.value` accepts declared `money_budget` controls (`null` only when `optional`). Errors add `progression_settings_invalid|unavailable`.

2026-10-20 Voice assistant on GPT-Live: `OPENAI_MODALITY_MODELS.voice` = `gpt-live-1` (was `gpt-realtime-2.1`), `voice_backend` = `OPENAI_MODEL_PROFILES[0]` (light Sol, effort low), `OPENAI_LIVE_VOICES` `{ default: 'marin', fr: 'brise' }` (`brise` exists only in GPT-Live), `OPENAI_LIVE_PRICING` `$0.05/min` billed per second, silence included. Relay actions unchanged (`realtime-connect|send|close|close-all`): `server/providerRealtimeSession.js` posts JSON `{ session, transport: { type: 'webrtc', sdp } }` to `POST /v1/live/sessions`, attaches the sideband `wss://…/v1/live/sessions/{live_id}/attach`, imposes `client.data_channel` (no client event; server events limited to session/transcript/delegation/usage/closed/error/info + `response.event`/`response.completed`) and refuses any other model, backend model, non-`responses` delegation or `developer` history → `provider_realtime_connect_invalid`. `realtime-connect` payload `session` = `{ model, audio.output.voice, instructions, input (≤128 messages, ≤20,000 chars), delegation: { type: 'responses', responses: { model, reasoning, parallel_tool_calls: false, instructions, tools } } }`; `realtime-send` accepts only `response.item.create` (pending `function_call_output`), `session.update { delegation: { type: 'responses', responses: { tools } } }`, `response.create`; `realtime-close` sends `session.close`, waits `session.closed` (10 s, else `provider_realtime_hangup_failed`) and returns `{ usage_seconds }`. Control events to the page: `{ type: 'response.output_item.done', item: function_call }` and `{ type: 'error', code }`. Client `createRealtimeSession`: `vad` option and `configure({ vad })` removed (`configure({ deviceId })` only; tool `ui.ai.voice.configure` now `{ device_id }` required), new `voice`, `turnGapMs` (1200) and `idleTimeoutMs` (180000, then `pause` → `idle`); turns are assembled from `session.input|output_transcript.delta` (assistant turns `heard: true`, `interrupted` when the user speaks over her); `onUsage({ seconds }, 'gpt-live-1')` for voice and `onUsage(usage, model, service_tier)` for backend `response.completed`; `session.closed` reasons `expired` → `session_expired`, `content` → `realtime_provider_error`, others → `realtime_disconnected`. `quota_tracker.js#estimateOpenAiLiveCost`, usage events and summary carry `voice_seconds`; Realtime token estimates apply to any model in `OPENAI_REALTIME_TOKEN_PRICING`. TTS: `OPENAI_MODALITY_MODELS.tts` = `gpt-realtime-2.1-mini` (the `/audio/speech` models shut down 2027-01-06 and the replacement is refused there); provider action `speech` is served by `server/providerRealtimeSpeech.js#synthesizeRealtimeSpeech` (Realtime WebSocket, audio only, read-aloud instructions; payload exactly `{ model, voice ∈ 10 Realtime voices, input ≤4096, response_format: pcm|wav }`) → `{ base64, mime: audio/pcm|audio/wav, model, usage }` (24 kHz mono 16-bit). Probes: `temp/gpt_live_migration/` (`relay_live_probe.mjs` live, real modules; `speech_live_probe.mjs`).

2026-10-20 Phone uniqueness: `assignVerifiedPhone` stores E.164 only (`auth_phone_e164_required`); boot retires active non-E.164 credentials (`revoked_reason 'not_e164'`, `database/adole_principal_identity_schema.js`). `phone-change-start` no longer refuses a number held by another account before the SMS; its consume/resume answers `{ ok: true, phoneTaken: true }` (client `auth-response` projection carries `phoneTaken`; `squirrel:phone-login-pending` detail `phoneTaken` opens Home › Security intent `home.security.phone.taken`). `recovery-start` accepts `phone` (E.164) instead of `handle`; `AdoleAPI.auth.startRecovery({ handle | phone, code })`.

2026-10-20 Pairing by verified phone: `/ws/api` `pair-start` accepts `phone` (E.164) as an alternative to `handle` (both → `auth_request_invalid`); it routes only to an account with that verified, unrevoked phone (`server/auth_handles.js#resolvePhone`), same answer whether or not it exists, limit `pair-phone:` 3 per 10 min. `AdoleAPI.auth.startPairing({ handle | phone })`; the first-launch reconnect field sends the phone when the typed value has no letter.

2026-10-20 OpenAI transcription migration: `OPENAI_MODALITY_MODELS.transcription` = `gpt-transcribe` (whisper-1/gpt-4o-transcribe retire 2027-02-26); Realtime input transcription sends `languages: [lang]` (not `language`). Provider action `translation` (`/audio/translations`) removed from `server/wsAiProviderOperations.js` → `provider_operation_not_allowed`; `ui.ai.media` `translate` = `transcription` then a light-Sol `responses` call into English (`assistant_audio_transcript_empty` on silence). Probe: `temp/openai_transcribe_migration/migration.probe.mjs`.

2026-10-20 Dashboard progression: Tool Gateway/MCP contract family `dashboard.*` (`atome/src/shared/dashboard_progression_contract.js`, capabilities `progression.read|write`, remote seats read only): `progression.read { include?: 'catalog' }` → `{ tier, bricks[{brick_id,kind,ref,tier,state}], next{brick_id,tier,rule_id,objective_id,progress{source,met,required,window_days}}, visible_refs, activity_keys, health: counted|denied_for_actor|unavailable }`; `progression.evaluate { preview? }` → `{ unlocked[], skipped[{rule_id,reason}], tier }` (writes only new facts, idempotent by id); `objectives.list {}`; `objective.target.set { objective_id, monitor_id?, comparator?, value?, sessions_only? }`; `monitors.select { ids[] }` (the home selector writes through it). Health measures count only for source `ui` inside an allowed health scope; MCP/AI/remote callers get declared sessions only. `ui.new_project` now gives a health objective its default `project_intent.target`.

2026-10-20 Shopping list + Open Food Facts: closed Tool Gateway/MCP contracts `shopping.*` (`atome/src/squirrel/shopping/contracts.js`: `list { category?, checked? }`, `add { label, category?, quantity?{value,unit}, note? }`, `update { item_id, label?, category?, quantity?, note? }` (quantity = the user's own share, added to meal shares), `check`/`uncheck`/`remove { item_id | label }` (exact label first, else unique near match, else `AMBIGUOUS_ITEM` + `candidates`), `clear_checked {}` (ACL `confirm`), `sync_nutrition { activity_id }`, `open {}`) and `food.*` (`atome/src/squirrel/food/contracts.js`: `lookup { barcode, source?: off|obf|opf }`, `search { query, source?, limit≤20 }`, `alternatives { barcode }` (≤3, verdict good), `attach { item_id, barcode, source? }`, `scan { item_id? }`). Capabilities `shopping.read`, `shopping.write`, `food.read` (default actor). New public `/ws/api` frame `food-facts { action: lookup|search|alternatives }` → `food-facts-response` (errors `INVALID_ARGUMENT`, `NOT_CONFIGURED` when `OPEN_FOOD_FACTS_USER_AGENT` is unset, `RATE_LIMITED`, `PRODUCT_NOT_FOUND`, `PROVIDER_UNAVAILABLE`), relayed by Tauri `public_relay.rs` and iOS `FastifySyncPublicRelay.swift`. iOS native media commands `media_barcode_scan_start|read|stop` (metadata output on the live preview session). `project.program.commit` `activity_create`/`activity_revise` of a nutrition activity now also return `shopping: { ok, changed | error }`.

2026-10-20 Event project from containment (Tauri, iOS): the local `events/commit` and `commit-batch` of Axum and AiS resolve the event project with the same rule as Fastify; the stored `events.project_id`, `stream_id`, outbox payload and `state_current.project_id` follow the resolved project, and the Axum response returns it.

2026-10-20 Event project from containment: `events/commit` no longer trusts the client `project_id` for an existing atome; the vault resolves it (`database/adole_event_containment.js#resolveEventProjectId`: project atome → itself, else nearest project ancestor of the declared parent or the atome, else its stored project; only a new atome with no known container takes the client value). The stored `events.project_id`, the stream and `state_current.project_id` follow the resolved project.

2026-10-20 Share stream binding: vault IPC gains `stream:of-atome { atome_id }` → `{ stream_id, project_id, atome_id }` (`database/adole_event_log.js#streamOfAtome`): a project binds to its `project:<id>` stream (created when missing), any other atome to its latest event's stream. Every event of a project atome is now sequenced in `project:<its id>` whatever `project_id` the client sent; `event.project_id` and `state_current` are unchanged.

2026-10-19 MCP typing: every `mcp.tools.list` entry now declares a typed `input_schema`/`parameters` (real-app probe: 611 tools, 0 untyped; tools that read nothing declare `{ type: 'object', additionalProperties: false, properties: {} }` = `TOOL_NO_INPUT_SCHEMA` from `eVe/intuition/contracts/index.js`, 106 of them). One schema owner per capability: `atome/src/shared/calendar_tool_contract.js` (`CALENDAR_AGENDA_TOOLS`: `calendar.time.read|alarm.set|alarm.read|alarm.cancel|list_events|get_event|create_event|update_event|delete_event|ensure_calendar|share|export_webcal`, consumed by the runtime defs and by `default_tools_calendar.js`, whose AI twins now forward params unchanged — `create_event` takes the flat event fields, `update_event { eventId, changes }`, `list_events {}` since the API reads no filter); `atome/src/shared/timeline_tool_contract.js` (`TIMELINE_WRITE_VERBS`, `timelineWriteVerbSchema(verb)` = `{ group_id?, command }`, `TIMELINE_TOOL_SCHEMAS`, consumed by `default_tools_timeline.js` and `eVe/intuition/tools/timeline_actions.js`; `eve.timeline.clip.stretch` added); `personalImportInputSchema(tool)` in `personal_import_tools.js`; hand-written built-in tools in `eVe/intuition/tools/core/tool_runtime_bootstrap_input_schemas.js` (`BOOTSTRAP_INPUT_SCHEMAS`, keyed by tool id). `buildDefaultToolDef` throws `tool_input_schema_missing|duplicate:<id>` unless a built-in tool has exactly one schema. `registerUiAction`/`registerAtomeTool` `params_schema` is now the tool's `input_schema` (`buildCanonicalToolDefinition`, reconciled by `buildCanonicalPatch`); a code registration that overrides a built-in id declares no schema, and the generic main-menu handler publishes one only when the menu entry declares `params_schema`. Fixes: `eve.timeline.*` handlers read `{ params }` (the gateway calls `handler({ params, context })`; `group_id`/`command` were lost before); `default_tools.js` registers into the imported `AgentGateway` (same concurrent boot wave: the AI tool set was sometimes empty); `mask.js` loads in the deferred intuition wave so `ui.mask.apply`/`ui.mask.extract` are listed typed.

2026-10-19 Framework cleanup: no MCP method or tool removed (real-app `mcp.tools.list` before/after, `temp/cleanup_audit/mcp_runtime_catalog.probe.mjs`). Removed public functions had no caller; `/api/files/share|unshare` now pass `ownerId` to `ensureSharedFileLink`/`removeSharedFileLink` (the shared link was never created). Known MCP gap: 307 of 605 tools expose no typed `input_schema`, and 11 `calendar.*` runtime tools are untyped while their `atome_ai` twins are typed (`temp/cleanup_audit/mcp_untyped_tools.txt`).

2026-10-19 GPS voice/MCP: new contract command `gps.navigate_to { destination: string (user words, ≤200), origin?: point }` → `{ ok, place, trip, state }` composes `search_places` (first result) → `locate` (unless origin) → `create_trip` → `calculate_route` → `preview` (when a presentation is registered) → `start_navigation`; errors add `PLACE_NOT_FOUND`; refuses `NAVIGATION_ALREADY_ACTIVE`. All `gps.*` commands are now direct MCP methods (`createMcpGpsHandlers` in `atome/src/squirrel/atome/mcp_handlers_contracts.js`) with their contract capability (`gps.read` / `gps.control`, added to the default MCP actor; remote seats unchanged). The assistant preloads `gps.navigate_to` + `gps.stop_navigation` and receives `GPS_ASSISTANT_INSTRUCTIONS` (`#squirrel/gps/contracts.js`). The engine announces the destination maneuver before its `arrived` intent. No new transport, Atome type or registry.

2026-10-19 MIDI: closed Tool Gateway/MCP commands `midi.output.set { atome_ids[], project_id?, output?: port name ('' = as recorded), channel?: 0-16 (0 = as recorded) }` and `midi.notes.set { atome_id, project_id?, notes: [{ pitch, start_ms, end_ms, velocity?, channel?, device? }], duration_ms? }` (writes a new SMF and repoints the clip in one `set`: `media_url`, `file_*`, `note_count`, `duration_sec`); panel tool `ui.midi.output.panel` (rail key `midi_output`, label « Sortie »/Out, kinds `midi`). Schemas in `tool_runtime_bootstrap_midi_schemas.js`. `midi` type schema gains `midi_output` (string) and `midi_channel` (number). `startMidiRecordPlayback({ atomeId, record, output, channel, outputs? })` replaces `outputId`; `encodeSmfFromEvents` accepts `event.device`. MIDI capture: `selectMidiCaptureChannel`/`readMidiCaptureChannel`, `readMidiCaptureNotes()`; default every input and every channel; an empty take now creates an empty clip (no `discarded`). Main-menu recording visual runtime: kind `midi_roll`, `pushToolMidiRoll({ toolId, sessionId, notes, now_ms })`. `context_menu_resolver.js` grants `playback` to `midi`; the rail treats `midi` as media (Play shown). History: `history.undo`/`history.redo` events now patch the project scene like `set`.

2026-10-18 Assistant presence: `eveAssistantApi.getState()` gains `acting` (true while the conversation runs one of its own tool calls, `conversation.phase === 'tool'`). `eVe/voice/assistant/assistant_host.js` adds `subscribeAssistantHost(listener)` (called with the host at every change, null when it leaves). `createVoiceAssistantSessionController` no longer takes `closingGreeting` and its `close({ reason })` has no `speakFarewell`; i18n key `eve.voice.assistant.closing_greeting` removed (FR/EN); `assistant.session.end` ends the session in silence. `eve.voice.assistant.startup_line` is « Bonjour, j’arrive ! » / "Hi, I'm coming!".

2026-10-18 Personal imports from the home: `contacts.import_macos` (method `importMacosContacts`, write, capability `contacts.write`) joins `PERSONAL_IMPORT_TOOLS` (`atome/src/shared/personal_import_tools.js`) — the separate AI registration, MCP handler, MCP list entry and policy line were removed, so the runtime V2 catalog (hidden tool), the AI agent and MCP share one entry and its redacted result `{ ok, imported, changed, … }`. `atome/src/squirrel/contacts/macos_source.js` exports `nativePersonalImportSupported(domain)` ('contact' | 'calendar_event': iOS app but not AUv3, Tauri macOS, Tauri Windows for contacts) and `openPersonalImportSettings()` (iOS `contacts_open_settings`, this app's Settings page). iOS `macos_contacts_snapshot` / `native_calendar_snapshot` answer `contacts_permission_denied_settings` / `calendar_full_access_required_settings` when the system will no longer ask (denied/restricted; still matched by the lifecycle's deactivation rule). `eVe/intuition/runtime/tool_gateway.js` exports `readToolGatewayError(result)` (the handler error wrapped twice by the V2 runtime); the Calendar Import/export window now reads the denial through it.

2026-10-17 Authentication V1 on `/ws/api` (`type: 'auth'`): `account-create-challenge`, `account-create`, `approve-key-add-challenge`, `approve-key-add`, `approval-challenge` (purposes `pair-approve`, `recovery-code-set`, `recovery-cancel`, `device-revoke`, `device-class`), `pair-start-challenge`, `pair-start`, `pair-claim`, `pair-view`, `pair-approve`, `pair-requester-challenge`, `pair-status`, `pair-complete`, `pair-cancel`, `not-my-account`, `recovery-code-set`, `recovery-start-challenge`, `recovery-start`, `recovery-cancel`, `recovery-requester-challenge`, `recovery-status`, `recovery-complete`, `devices-list`, `device-rename`, `device-revoke`, `device-class`, `connection-challenge`, `connection-proof`, `shared-open-challenge`, `shared-open-start`; `session-renew` accepts `pop: true`; `account-create`, `pair-start`, `recovery-start` accept `connectionProof: true` (the client proves its key on every connection; the Web client only). `/ws/sync` accepts `auth-challenge {token}` before `auth {token, challengeId, signature}` for key-bound tokens. Pair/recovery identifiers are `pairId` / `recoveryId` (never `requestId`, the envelope's correlation id). Pushes: `auth-notice {kind}` and `auth-pair-update {pairId, state}` (window `squirrel:auth-notice` / `squirrel:auth-pair-update`). Tokens of keys that prove their connection carry `cnf.pop` and are refused on another `/ws/api` connection (`auth_connection_proof_required`). The phone-link consume of an existing account now answers `{ recoveryPending, recoveryId, notBefore }` instead of a session. `AdoleAPI.auth` adds `createAccount`, `startPairing`, `getPendingPairing`, `getPairingStatus`, `completePairing`, `cancelPairing`, `claimPairing`, `viewPairing`, `refusePairing`, `approvePairing`, `notMyAccount`, `addApproveKey`, `listDevices`, `renameDevice`, `revokeDevice`, `setDeviceClass`, `createRecoveryCode`, `startRecovery`, `getPendingRecovery`, `completeRecovery`, `abandonRecovery`, `cancelRecovery`, `listLocalAccounts`, `switchAccount`, `startSharedOpen`, `addAccount`, `approveKeyAvailable`, `describeThisDevice`. The `ui.first_launch.auth` tool enum is `FIRST_LAUNCH_AUTH_OPERATIONS` (`first_launch_model.js`). Matrix controls accept `label_value_key`.

2026-10-16 Home: `openWorkspaceHomeProjection` returns `homeId` (read with `readMatrixInstance`); the home runtime exposes `readProjectThumbnail(projectId)` and `presentationCover.setOpacity(v)` consumed by the closing transition. `tvPlayer.play(id, { projectId })` and `youtubeToolRuntime.playVideoOnAtome({ projectId })` place the picture in that scene. `workspaceSyncMessageKey` returns '' while synchronization works (only offline / reconnect / recovery error are shown). `squirrel:local-connection-ready` is dispatched on reconnection only. `requestProviderService` replays a frame never sent and `realtime-connect` once on link loss.

2026-10-16 Native get-pending includes failed actor-owned delivery rows and their last error code; synced rows do not count. Native delivery outcomes emit the existing scoped sync:status notice. Browser ws/sync changes coalesce into synchronizeBrowserWorkspace, preserving pending local changes and exact outbound IDs. Event retries after compaction validate the original normalized intent hash, with immutable-projection proof for legacy journals. No new public mutation or transport API.

2026-10-16 AdoleAPI.sync.getStatus() reads {principal_id, environment_fingerprint, connection_state, restore_state, pending_delivery_count, pending_replay_count, last_error_code} from existing native get-pending/browser workspace and SyncEngine owners; obsolete principal/environment responses are rejected. Existing sync:status and sync:projection-ready notices invalidate readers only. /ws/sync advertises subscribe-batch-settlement; optional subscription_id is echoed in replay-complete, with settled_streams including authorized already-current/empty streams. Legacy streams receipts are preserved. Native /ws/api forwards progress/projection notices only to the matching still-authenticated principal. No business event or new public command is introduced.

2026-10-16 Main-menu visibility command: ui.main_menu.tools.set accepts required {collapsed:boolean} with action commit and a persistent effect, registered in the existing bootstrap definitions/handlers. setToolsCollapsed(boolean) invokes the canonical tool gateway; the registered handler calls the menu owner applyToolsCollapsed, then setVisualPreferences -> canonical profile upsert/global Atome commit. preferences.visual.mainMenuToolsCollapsed is a normalized boolean, default false; measure().toolsCollapsed exposes the current published choice. Existing profile hydration events redraw the menu; showFully/open/reveal preserve this choice. No new transport.

2026-10-16 communication.notification.open is an ephemeral CONTACT_COMMUNICATION_COMMANDS tool: required notificationId; optional presentation panel|dashboard and numeric positive source rect. It reads the current account's canonical notification stack through bevy_panel_comm_notification_detail.js. Dashboard presentation requires an internally prepared live host, cannot supply a destination URL/function. Existing Runtime V2 declaration/handler discovery and gateway policy apply. Full read marks the same notification read after presentation; idle preview/grid do not. Contextual actions remain typed gateway calls.

2026-10-16 eVe corrections: shared `communication_contract.js` adds normal/priority/urgent, typed message metadata, bounded declarative conversation/message or command actions, optional conversation `messageId`, and self-only `communication.notification.publish`. Existing registered tool/command paths and /ws/api remain canonical. Server VIP authority is recipient-owned favorites, authenticated sender and per-recipient validation after block/rate checks. `dashboardStyle` adds `eve_basic`; existing `eve` is labelled eVe Pro. Hosted Assistant readiness requires connection plus microphone, independently of visual solo/grid/open. See FRAMEWORK_STATE's approved eVe corrections record for evidence and limits.

2026-10-15 Dashboard eVe adds no public command. Assistant runtime: `open({ surface })` resolves `screen` to `hosted` while a host is registered (`setAssistantHost(host) -> release`, no dock and no scene, finishes closing at once); snapshot carries `surface`; `subscribeSignal(listener) -> unsubscribe` delivers `{ speechRms, inputRms }`. Realtime session: `subscribeFrames(fn)` → `{ session_id, rms }` of the voice heard (the remote track through `createVoiceInputMeter`), phase `speaking` from `output_audio_buffer.started` to `stopped`/`cleared` (`response.done` no longer cuts it); CarPlay maps `speaking` to `responding`. Durable profile values: `preferences.visual.dashboardStyle: 'eve'`, `preferences.workspace.home_eve_project_id`. Matrix home `inspect().atom` (read-only).

2026-10-20 Music keys: Spotify and Deezer entries are server-vault key providers (`AI_SERVICE_KEY_PROVIDERS`, kind `music`) shown in Passwords and keys → Music. `credential.store|status|remove` with provider spotify (Client ID, 32 hex) or deezer (public profile ID, checked live on api.deezer.com/user/<id>) go through `musicCredentialProvider` in `server/music/music_operations.js`; removing the Spotify key drops the `music.spotify` session. `readMusicConfig(vault)` reads both from the principal vault (SPOTIFY_CLIENT_ID env is no longer read; MUSIC_PUBLIC_BASE_URL stays operator config). `music.get_state` reports configured false until entered and the Fun palette omits the provider.

2026-10-15 music.get_state|connect|await_connection|cancel_connection|disconnect|search|open_item|list_library|list_playlists|playlist_tracks|devices|play|resume|pause|next|previous|create_playlist|add_tracks|favorite_current|operation_status are declared Runtime V2/MCP commands with provider spotify/deezer. music.read/control/write policies apply equally to direct calls, batches and toolchains. Requests use the existing authenticated ai-provider music.* lane on /ws/api and existing native relays, without an AI key. Spotify OAuth reuses the existing state-bound callback at /api/social/oauth/callback/spotify. SPOTIFY_CLIENT_ID and MUSIC_PUBLIC_BASE_URL are operator prerequisites; no values were configured. Deezer reports catalog_only and exposes the verified public song search plus an official page-opening intention; private library, writes and playback report DEVELOPER_ACCESS_REQUIRED. Authenticated real-service acceptance remains To verify.

2026-10-15 Apple Music favorite_current: a declared write command accepts only optional request_id and captures the native current song/queue entry before canonical intent/claim. The receipt schema retains the frozen target and a bounded song_id/favorited result. Capability, Command Bus, audit and idempotency use existing registration. Native MusicDataRequest uses only Apple provider endpoints; POST acceptance alone is unconfirmed until inFavorites read-back is true.

2026-10-15 Android release CLI: `scripts/Android_testflight_generator` and `./run.sh apk --play-internal` share `scripts/android/play_internal.mjs#runRelease`. Options are declared/validated by `play_configuration.mjs#parseReleaseArguments`; `--dry-run` is nonmutating/offline, `--prepare` builds and verifies without Google, and `--publish <report>` explicitly revalidates/reconciles one prepared AAB. The default live call uses the Android Publisher OAuth scope, existing-package identity, upload-certificate pinning and `internal` only. `play_api.mjs#createPlayClient` exposes no configurable production-track or arbitrary URL write; `play_release.mjs#publishRelease` checkpoints upload/commit and reads committed state before confirmation. This is developer distribution tooling, not a new application business API, Atome mutation owner or frontend transport. See `atome/documentations/android_play_internal_distribution.md`.

2026-10-15 SMS authentication hardening: `/ws/api` phone-link-start delivers the same shape for new/existing numbers (attemptId, absolute expiresAt, serverNow, requesting-device pairingCode); paymentRequired is disclosed only after successful SMS/device proof. phone-link-confirm and phone-link-approve additionally require the 8-digit pairingCode, with five failed guesses persisted in the existing protected rate-limit owner. Signed resume restores the same deadline/code. AdoleAPI.auth.confirmPhoneLogin(code) submits the memory-only foreign link; squirrel:phone-login-pending opens the canonical Matrix pairing/Billing presentation. ui.first_launch.auth declares confirm_link/dismiss_link. Native mock transport allows the same confirm action. No REST or business-history authentication secret was introduced. See FRAMEWORK_STATE for acceptance limits.

2026-10-15 Apple Music (native iPhone/iPad): `apple_music.get_state|authorize|search|list_playlists|list_library|playlist_tracks|play|resume|pause|stop|next|previous|create_playlist|add_tracks|favorite_current|operation_status` share typed contracts in `atome/src/squirrel/apple_music/contracts.js`, Runtime V2 service registration and direct MCP dispatch. Native IDs retain `kind`/`scope`; ambiguous queries return candidates. Playlist writes retain private account-global `apple_music_operation` request/receipt Atomes through `Atome.commit`, CAS claims and request IDs; unconfirmed writes never replay. iOS `apple_music_invoke` is a bundled-main-frame, authenticated MusicKit capability, not an alternate application transport. Voice preloads play/search and uses the same command path as TV. Unsupported hosts report unsupported for native playback/library access; private operation_status receipts remain readable through Atome on other hosts. Runtime dry-run now stops before any executor; MCP batches propagate actor/dry-run/per-step idempotency and aggregate contract capabilities. MCP idempotency receipts are scoped to the actual Atome account and delegated actor. Library/player live acceptance remains To verify.

2026-10-15 Timeline/Cells API (Molecule timeline API, MCP verbs in `default_tools_timeline.js` and `timeline_actions.js`): ops `scene.add|update|remove|move`, `cell.set|clear|place`, `clip.join`, `clip.take`; `view.set` gains `layout` (timeline|cells|split), `split_ratio` (0.15..0.85), `cells_mode` (edit|play), `cells_projection` (tracks|scenes); `record_region.add|update` accept `takes` (1..16). Transport: `triggerGroupTimelineCells({ group_id, cells: [{ scene_id, track_id|'scene' }], gesture: press|release, record? })`, `stopGroupTimelineCells`, `readGroupTimelineCells` (verbs `eve.timeline.cells.trigger|stop`). Native audio commands (Tauri invoke / iOS dispatch / WASM): `audio_set_voice_end { voiceId, endFrame, releaseFrames }`, `audio_measure_input_latency`; scheduled voices' `envelope` accepts `attackStartSeconds`, `attackSeconds`, `releaseSeconds`. Executor: `setVoiceEnd`, `outputLatencySeconds`. Pointer runtime: a `long_press` handler marked `quickTravelScrolls` hands a quick travel to the scroll area.

2026-10-14 Communication: `atome/src/shared/communication_contract.js` adds `isConversationDestination(destination)` and `isContactCommunicationCommand(id)` (contact communication runs in every project work mode). `/ws/api` `contact respond decision:'refuse'` now blocks (status `blocked`, silent for the sender); `unblock` forgets a refusal; `list` reports legacy refusals as `blocked` and no longer returns a `refused` array. `conversation` read items carry `media: [{ id, type, media_kind?, mime_type?, duration?, width?, height?, name?, media_url }]` for the Atomes the reader may read (vault projection; `media_url` without query, to be signed by the reader). A read-only share of a conversation recording between accepted contacts starts `active`. Shared projections (state and sync events) strip `media_token`/`token`/`access_token` from string properties. Current FCM uses register/onRegistered and HTTP v1 message.fid; the SDK owns provider-only registration metadata, while Atome grants/inbox remain Rust/Axum-owned.

2026-10-14 Android OS capabilities: the existing authenticated `/ws/api` push-register accepts provider `fcm` or default `apns`; protected installation/session ownership remains shared. Native `notifications_invoke` accepts only tokens/take/ack/enable/call_result/call_end/logout from the main loopback window on actual Android. The internal mobile-host plugin exposes no direct JS command. Private JNI storage enters the existing Rust/Axum auth owner and returns only opaque routing/grant references; native device proofs reuse `auth_device_key` with hardware-backed P-256 Android Keystore. FCM OAuth credentials stay exclusively on the server. Answer/decline use the existing communication tool gateway and call arbitration; no application transport is added. iOS keeps its PushKit metadata and CallKit owner. Runtime/device acceptance remains To verify under ATM-2006/ATM-2020.

2026-10-14 ATM-2001/ATM-2006 extensions: /ws/api auth actions `password-login-challenge`, `password-login`, `session-set-password`, existing `session-challenge` purpose set-password bound to requestDigest, `push-register` and `push-prune`. Shared `authPasswordRequestDigest` binds current/new credentials to fresh device proof. Public typed tools `contacts.select_personal {contact_id}`, `communication.conversation.open {contactId}` and `communication.call.respond` compose canonical owners through the existing runtime gateway (see shared declarations for precise fields). Native notifications_tokens/take/ack/enable/call_result/call_end/logout require the bundled main-frame bridge; navigation inbox contains opaque references only. AiS state-current get returns property_versions including tombstones for existing expected_versions commits. Password policy: Argon2id v19 m19456/t2/p1, maximum two concurrent hashes, new minimum 15 Unicode points, maximum 4096 UTF-8 bytes, no trimming/truncation; operator-maintained SHA-256 blocklist is mandatory for setting a password. APNS_KEY_ID/TEAM_ID/KEY_PATH/TOPIC and AUTH_PASSWORD_BLOCKLIST_PATH are server-only configuration, currently absent locally. No legacy auth route enabled. [Acceptance limits](../eVe/documentations/FRAMEWORK_STATE.md#5-recent-task-record).

2026-10-14 GPS commands (ATM-2019): `gps.list_trips/get_trip/create_trip/search_places/locate/calculate_route/new_trip/preview/start_navigation/stop_navigation/get_state` are typed in `#squirrel/gps/contracts.js`, registered in existing runtime handlers/definitions and exposed through `window.atome.gps` and existing runtime.tools list/call (UI/AI/MCP). Private global `gps_trip` retains route/status/revision; streamed positions remain transient. Provider WS family `gps-resource` accepts describe/route/search/tiles; endpoints are server-only `ATOME_GPS_VALHALLA_URL`, `ATOME_GPS_GEOCODER_URL`, `ATOME_GPS_TILE_URL`. iOS `gps_invoke` / Axum `gps-native` adapt capabilities through the native exception and canonical local commit owners. Closing preview is independent of stop_navigation. See [GPS contract](../eVe/documentations/GPS_INTEGRATION.md).

2026-10-14 BevyUI node option `hold_delay_ms` (opt-in long-press delay). `relayoutMysticMenu()` (mystic/index.js); grid option `readCells()` → `{ anchor, cells, filterRect }`; `dashboardMysticGrid({ fromBottom })`; Mystic tile `ghost` (renderer: `mystic_tile_motion.w = -1`).

2026-10-14 `state-current list` on the iOS (Swift) and Tauri (Rust) local servers now honours `include_deleted` like Fastify: deleted Atomes are excluded by default. Matrix template runtime option `onFailure(failure, control)`; layout hook frames may carry `viewHeight`. Clock/weather card builders take `layout: 'line'`.

2026-10-13 Dashboard mystique v2 adds no public command. Internal: `replaceMysticMenuItems(items)` (grid Mystic, no wave replay); grid `filter: { rect, placeholder, searchPlaceholder, color?, radius? }` and per-item `color`, `search(query)` (submit search of a palette); `tvPlayer.play(atomeId, { channel, tapTogglesFullscreen })`, `youtubeToolRuntime.playVideoOnAtome({ …, history, tapTogglesFullscreen })`; `activateAtomShortPress(payload, { openDashboard, professional })` injection used by the Atom tile; Matrix home runtime `inspect()` (read-only diagnostics). On a template home in Consultation, `authorizeProjectTool` lets `ui.project.open`, `ui.new_project` and `ui.capture.audio|video|photo|midi` through.

2026-10-13 Dashboard mystique adds no public command. Internal surfaces: `openAt({ …, grid })` / `openMysticMenu({ …, grid })` take `{ anchor: rect, radius?, cells: [{ x, y, width, height, role: content|create|previous|next }] }`; a Mystic item may carry `face({ id, size }) -> BevyUI nodes` and `slot: 'create'`. `openMysticContextMenu({ context: { mysticGrid, mysticItems } })` bypasses the taxonomy for a caller-composed grid. `createMysticContextItemsRuntime()` returns `resolveMysticToolItems(keys, context)` beside `resolveMysticContextItems`. Dashboard card content accepts `content.tint` (ribbon glyph colour; the image is then hydrated by the BevyUI image owner). Durable profile keys: `preferences.visual.dashboardStyle` (`auto` default), `preferences.workspace.home_mystic_project_id`, `preferences.contacts.recent` (one id). `syncTemplateInstance` upgrades any outdated home template source (`kind: 'home'`), not only `dashboard_basic`. Tile actions reuse `ui.panel.open` (calendar/contact `createNew`, home `section`/`subsections`), `ui.project.open`, `ui.new_project`, the Contact rapide and the health monitor owners.

2026-10-12 Contacts merge duplicates: `contacts.merge_duplicates {}` joins `PERSONAL_IMPORT_TOOLS` (`atome/src/shared/personal_import_tools.js`, write, capability `contacts.write`), so MCP, the AI agent and the runtime tool catalog register it from the same entry; tool result `{ ok, groups, duplicates_merged }` (never the address book). Public API `atome.contacts.mergeDuplicates()` → service `mergeDuplicateContacts()` → owner `createLocalContactsSource().mergeDuplicates()` (`atome/src/squirrel/contacts/local_source.js`), returning `{ ok, groups, duplicates_merged, merges: [{ kept_id, removed_ids, phone }], items }`. Explicit only (never on import or boot): live cards sharing an E.164 number (`contactBookPhone`, transitively) form a group; the kept card is the hand-made one, else the one with a photo, else the most complete; it receives the others' missing values (`preferExistingImportValues`, photo taken whole, numbers deduplicated by E.164); the others are deleted with `Atome.commit` kind `delete` (restorable with kind `restore`); their `import_origin` rows and `contact_group.members` are repointed to the kept card. `eve:people-directory-updated` carries `{ action: 'merge', merges }`; `eVe/intuition/tools/contact_favorites_preference.js` (`moveContactFavorites`) moves a deleted card's heart to the kept card. UI: Contacts › Import/export button `contact_merge_duplicates`, intent `contact.merge_duplicates`, notice keys `eve.contact.merge_duplicates.*`. No new transport, Atome type or durable field.

2026-10-12 Siri and desktop entries of the assistant: no new public command. One internal host command `assistant_request_take` (iOS native invoke, owned by `platforms/ios/atome-auv3/application/AssistantRequestInbox.swift`; Tauri command owned by `platforms/desktop-tauri/src/assistant_link.rs`, permission set `assistant-link`) returns and clears the latest native request `{ action: open|close, source: carplay|siri|desktop_link, surface: screen|voice }` (`{}` on iOS / `null` on Tauri when none); the payload-free page event `eve:assistant-request` only says one is waiting. It replaces `carplay_assistant_take` and `eve:carplay-assistant`; `carplay_assistant_state` is unchanged. iOS App Intent `OpenAssistantIntent` (`application/AssistantSiriIntent.swift`, foreground) with App Shortcut phrases « Passe-moi ${applicationName} », « Ouvre l'assistant ${applicationName} », « Lance l'assistant ${applicationName} » (en: Talk to / Open the … assistant / Start the … assistant; `application/AppShortcuts.xcstrings`). Desktop URL `atome://assistant` (macOS `CFBundleURLTypes` in `platforms/desktop-tauri/Info.plist`, `RunEvent::Opened`). `voice.assistant.toggle` command records carry `source: 'siri'` or `'desktop_link'`. No new transport, Atome type or durable field.

2026-10-12 Remote command (voice orders to another device): the `remote-control` family on `/ws/api` gains `command { target_surface_id, target_user_id?, tool_id, tool_action?, input, confirmed? }` (caller; reply `remote-control-response { command_id, target_surface_id, target_label, result }` once the TARGET answered, or `error` `remote_command_target_offline|timeout|cross_user_not_authorized|target_is_caller|tool_invalid|action_invalid|input_invalid|input_too_large` (64 KB), `surface_not_announced`) and `command-result { command_id, result }` (target only; `remote_command_not_target|unknown`). Server push `remote-control-command { command_id, tool_id, tool_action, input, confirmed, from_surface_id, from_user_id, from_label }`. Timeout `REMOTE_COMMAND_TIMEOUT_MS` (30 s); the loss of either surface ends pending commands at once. New grant capability `remote_command` (cross-account only; same account trusted, §11.1). `AdoleAPI.surfaces.run({ surfaceId, userId?, toolId, input, toolAction?, confirmed? })` and `AdoleAPI.surfaces.listRemote()`. The target runs the tool through its own MCP `runtime.tools.call` as actor `role: 'remote_surface'` (no `runtime.sensitive`, mail/social/bank/contact/calendar writes, sandbox `remote_surface` only), refuses `surface.*`/`surfaces.*` relays, answers `SPOKEN_CONFIRMATION_REQUIRED` to `*delete*` tools (not `.panel`) without `confirmed`, and maps a local confirmation gate to `remote_command_requires_local_confirmation`. Assistant context commands: `surfaces.list {}`, `surface.run { surface, tool, arguments?, action?, confirmed? }` (spoken name resolution: exact label, label inclusion, then platform words), `surface.rename { label }`; each result carries a localized `message` (`eve.voice.assistant.devices.*`) for the assistant to say. No new transport, Atome type or durable field.

2026-10-12 Voice activation without Porcupine: `AtomeVoice.wake` now exposes start(), stop(), getState(), subscribe(listener), setEnabled(value, { cause }), enroll({ prompt, signal }), hasPersonalModel(), suspend(reason), resume(reason); `configure()` (Porcupine AccessKey/models) and `test()` (30 s) are removed. Snapshot `{ phase, error, cause, enabled, armed, detected, locale, phrase }`; `cause` is `profile` (launch/profile publication, silent), `preference` (explicit switch), `detection` (heard phrase) or `enrollment`. `enroll` drives `runWakeEnrollment` (4 takes, 10 s speech, 5 s room) through a `prompt(step, detail)` callback (`intro|say|repeat|speak_freely|silence|training|done`) and stores the verifier in the device vault (`voice.wake.verifier.<userId>`). Error codes: `wake_model_missing`, `wake_capture_busy|overrun|failed`, `wake_engine_failed`, `wake_native_capture_unavailable`, `microphone_permission_denied` (an assistant that fails to open announces its own error and no longer blocks standby), enrollment `wake_enrollment_phrase_not_heard|inconsistent|audio_missing|cancelled`, `wake_principal_unavailable`, `wake_vault_locked`. Home intents: `home.assistant.enabled` (switch), `home.assistant.improve` (start/stop enrollment). Native `audio_wake_start/read/stop` are unchanged. No new transport, command bus entry or durable field.

2026-10-12 Professional sidebar disclosure: the restored Dashboard button invokes the existing ui.dashboard.sidebar.set through invokeToolGateway, click with inverse open state and upward slide with open=true. sidebar_toggle_rect describes that control independently of the persistent Atom menu anchor; header_side is unchanged. No new command, durable field or transport.

2026-10-12 Assistant hang-up: `assistant_context_contract.js` adds `assistant.session.end {}` (ephemeral; result `{ ok, ended }`, `ended: false, reason: 'assistant_not_active'` when no session). Same single registration as the other context commands, so UI, assistant and MCP share `runtime.tools.list/call`; preloaded in the voice/text tool set by `conversation_session.js`, whose instructions map dismissals (« au revoir », « tu peux partir », « raccroche », « quitte ») to it. The handler (`assistant_context_tools.js`) defers `eveAssistantApi.close({ source: 'assistant_tool', reason: 'user_dismissed' })` out of the call. `createRealtimeSession` gains optional `farewellLine`; its `close({ speakFarewell })` now honours the flag already passed by the assistant runtime: microphone stopped at once, farewell spoken out of band (excluded from the conversation), transport released after its audio stops or 6 s. A `response_cancel_not_active` provider error is ignored as a benign cancel race. No new transport, Atome type or registry.

2026-10-12 CarPlay assistant: no new public command. Internal native invoke commands `carplay_assistant_state` ({ phase: closed|connecting|listening|responding|error, message, labels }) owned by `platforms/ios/atome-auv3/application/CarPlayAssistantLink.swift`; requests go through the shared `assistant_request_take` / `eve:assistant-request` inbox (see the Siri entry above). `eveAssistantApi.open` accepts `surface: 'voice'`; `createRealtimeSession` accepts `suspendWhenHidden` (default true) and `bindVoiceAssistantSession` accepts `keepWhenHidden`. `voice.assistant.toggle` command records carry `source: 'carplay'`. The iOS `mediaTypesRequiringUserActionForPlayback = []` setting now lives in `application/AppPageHost.swift`.

2026-10-12 Professional Atom navigation: activateAtomShortPress retains active-assistant close precedence, then uses toggleWorkspaceDashboardAndMainMenu only at advanced expertise; other expertise retains its opening route. The existing internal menu adds showAtomOnly(), onAtomSlide and professionalResolver composition, and the model adds atomOnly. Layout exposes presentation-only header_side independently of the canonical menu handedness; no inverse handedness is applied to Atom. The slide invokes the existing registered ui.dashboard.sidebar.set command with the inverse open state. No public command, transport, durable property or schema change.

2026-10-11 In-place media windows: new internal owner `eVe/domains/media/inplace_media_window_layout.js` (`IN_PLACE_MEDIA_WINDOW_SIZE` 700×394, `inPlaceMediaWindowSpec(projectId)`, `revealInPlaceMediaWindow(projectId, spec)`). Every TV channel opened and every YouTube video chosen gets its own `video` Atome (a selected empty YouTube Atome is still reused), piled in one column under the lowest in-place window with a 24 px gutter; the first one uses the existing flow placement. `normalizeCreatedAtomeSize` leaves `media_source` tv/youtube specs at their owner's size. iOS `WKWebViewConfiguration.mediaTypesRequiringUserActionForPlayback = []` (app `ViewController.swift`, AUv3 `WKWebViewFactory.swift`): media starts with sound without a tap. No public command or schema change.

2026-10-11 Assistant context contract: `atome/src/shared/assistant_context_contract.js` declares `selection.get {}` (read: project, live selection ids/last_id/count, compact scene atomes selected first, max 64), `debug.report { request, reason, attempted?, origin?: user_requested|assistant_failure, conversation? }` (persistent: one `record` Atome with `source_domain: 'assistant_debug'`, Markdown `description`, structured `payload`) and `debug.reports.list { limit? }` (read, newest first). They are registered once in the existing runtime tool bootstrap (`tool_runtime_bootstrap_defs_a.js`, `tool_runtime_bootstrap.js`), so UI, assistant and MCP share `runtime.tools.list/call` with the default `runtime.execute` policy; handlers live in `eVe/voice/assistant/assistant_context_tools.js` and read the selection through the same `readSelectedIds()` snapshot as the runtime style/size/delete tools. `conversation_session.js` preloads the three tools, adds selection/debug rules and injects its own transcript excerpt into `debug.report.conversation`. `createRealtimeSession` gains optional `readyLine`; `#squirrel/tv/contracts.js` now owns `tvPageAcceptsHttp`/`playableTvStreams` (moved from `tv_inplace_player.js`). No new transport, Atome type or registry.

2026-10-11 Approved internal native viewport extension: iOS supplies __EVE_NATIVE_VIEWPORT__ {width,height,safeAreaInsets:{top,right,bottom,left}} through the existing eve:native-viewport-resize event and IPC owner. Dimensions/insets are native logical points; readRenderSurfaceSafeAreaInsets maps them to the actual canvas CSS bounds and rejects malformed published payloads. Only the personal expert Dashboard consumes exclusions in this task. The existing Tauri width/height-only contract and AUv3 route remain unchanged; no public tool or persisted schema is added.

2026-10-11 Confirmed Dashboard disclosure: the canonical ui.dashboard.sidebar.set tool remains the sole command route. Click supplies the inverse of the current open state; the existing withPaletteSlideDirection(handler, 'up') handler supplies open:true immediately upon recognition. Releasing the pointer does not emit a second activation; an already-open sidebar keeps its state. No public command, persistent option, account schema or native boundary is added. dashboard_layout.js overview is an internal composition option for the personal advanced runtime; embedded consumers retain the default layout.

2026-10-11 Secret/session reliability: Bevy definitions' optional asynchronous beforeClose precedes cleanup and retains refused surfaces. The shared internal secret-save factory composes 500 ms autosave/immediate flush for Home providers, credentials and Mail through existing owners. home.key.reauthenticate retains the declared ui.home.panel phone flow. Native local-link-complete persists the renewable descriptor only after server proof; local-session-describe optionally includesLocked returns descriptor authority; signed local-session-lock optionally remoteOnly clears remote authority while preserving local access. No bearer is persisted and no public command/transport is added. Matrix's existing readBounds.zIndex places reconnection above retained callers. Catalogs reuse provider_broker/wsAiProviderOperations and bounded pagination. Public projections contain no secrets. Physical/backend limitations are recorded in eVe/documentations/FRAMEWORK_STATE.md.

2026-10-11 Local guest personal profiles: loadUserProfile(userId?, options?) and upsertUserProfile(profile, options?) keep their public signatures and recognize only the active guest principal. Their guest operations use account-global guest_workspace/eve_profile + canonical user_face, with no Fastify authentication or repair. The existing profile bridge accepts optional internal eventSource to refresh Home/Contacts after confirmed adoption. guest-adoption payload accepts optional sanitized personal profile separately from atomes; finalize/replay returns profile_event. The operation journal adds nullable profile_event_json. Native sync.getPending keeps its signature and adds data.pending_delivery_count for the authenticated principal, including queued/error media deliveries; zero is required to finish native adoption. No billing or authentication-proof semantics change.

2026-10-11 Blank beginner List uses the existing ui.delete.selection gateway, lazy registration and structured-row targeting; no command or durable schema is added. project_view_list_options.js exports isBeginnerBlankProjectContext({ level, projectRecord }) as the shared composition predicate based on canonical project identity, guided intent and existing News/template provenance. The internal footer levelTransport presentation carries optional replaceName, false by default; only the blank beginner List project root sets it. Repeat keeps ui.project.transport and its off/all/one contract. Source/test and real Web evidence are recorded in eVe/documentations/FRAMEWORK_STATE.md.

2026-10-11 Beginner Dashboard navigation reuses ui.project.open, ui.matrix.focus and ui.first_launch.home. ui.project.open recognizes canonical type, atome_type and properties.kind through project_template_model.typeOf before standard workspace activation. Existing focus categories now include the presentation-only discussions rubric. No message send action is declared. New monitor reaches the existing dashboard_health_monitors selector; its closeLabel is localized Validate. Monitor cards invoke the same internal health.activate -> health detail cell-presentation route as Expert. The published workspace.home_template_project_id is set before first home activation and drives existing menu suspension; no new preference or public command.

2026-10-11 Required-screen navigation (source and automated tests verified; real-platform acceptance To verify). The declared ui.home.panel pointer.click action is ephemeral and accepts optional focusField, requireAuthentication and navigation { owner: assistant|generator, generation }; existing section/subsection(s)/revealNodeId are retained. open_home_panel merges canonical input, guards the requesting session before/after loading, and awaits Home's section/projection/reveal/editor completion. Authentication opens the existing phone flow without changing the account. assistant_ai_settings.js owns typed prerequisite classification and one destination per explicit attempt; provider_principal_unavailable targets security.aiKeys.openai/home_key_openai_api. Navigation generations are ephemeral, surfaced in assistant/generator snapshots, and never replay a request. openAiSettings remains an explicit asynchronous compatibility entry. No new command, panel, durable property or navigation registry. This supersedes the 2026-09-26 intermediate-message/button contract below.

2026-10-11 ui.dashboard.sidebar.set is a hidden registered ephemeral command with required boolean open and optional nonempty matrix_atome_id. The existing gateway and Matrix bootstrap definitions/handlers expose it. Without a Matrix target it uses the presented professional Dashboard; an explicit target must identify a current-project Matrix runtime supporting setSidebarOpen. Basic/headerless, inactive, editing or hidden surfaces reject it. The command changes per-instance presentation only and writes no durable properties.

2026-10-11 Internal history: `getHealthOwner().readHistory(monitorId, { from, to, detail, signal })` returns `{ ok, monitorId, days }` with typed readings/statistics and selected-day points/bands. Existing `health_read` accepts `{ id, key, from, to, history }`; results use key (omission retains id). Native account/link, sealed-channel and MCP gates apply. Abort stops subsequent batches and late replies are discarded; no native cancellation command. `getHealthDetailPanel()` shares one boot-owner detail between Dashboards; the injectable `createHealthDetailPanel({ owner, now, locale, presentation })` exposes `open(monitorId, { rect, readSourceRect, readBounds, onClose })`, close and destroy. `createPanelCellPresentation(surfaceKey)` and `historyGraphNode` enrich the existing internal panel composition. No window health export or remote/MCP health operation.

2026-10-10 Internal BevyUI scroll extension: mountTree/updateTree accept optional scrollIntent `{ userRevision, valid?, reveals?, restore?, onApplied? }`; captureTreeScroll(id) returns `{ userRevision, offsets:[{nodeId,x,y}] }`, treeScrollRevision(id) reads manual-gesture revision. prepareTree applies valid reveals/restoration before projection, announcePreparedScroll notifies after paint. Panel refresh.beginIntent captures an opening generation and revision before async handling; readActivePanelTextField/subscribePanelTextFocus expose the existing editing owner internally. Public panel opening/closing signatures and registered tools are unchanged; no new command, global, transport or durable schema.

2026-10-09 Beginner List playback: `ui.project.transport` keeps its id, handler and project scope and gains optional inputs — `start_atome_id` (play from that row; a paused run whose active rows include it, or play without a start, resumes) and `operation: 'repeat'` with `repeat: 'off' | 'all' | 'one'` (declared in `tool_runtime_bootstrap_defs_a.js`; other tools of that declaration keep their schema). The repeat rule is the existing canonical `playback_loop` property of the project, now tri-state (`true` all rows, `'one'` the playing row, otherwise off) written through `writePlaybackRuleOverride({ rule: { repeat } })`; `resolvePlaybackRule`/`readPlaybackRuleOverride` add `repeat` beside the unchanged boolean `loop`; `playbackRepeatOf` and `PLAYBACK_REPEATS` are exported from `project_view_playback_rules.js`. `playProjectViewEntry({ entry })` (row Play) now invokes `ui.project.transport` (`play` + `start_atome_id`, or `stop` on its playing row) instead of selecting then invoking `play`. No new tool, command, global or event.
2026-10-09 Internal User countdown contract repair: startToolCountdown({toolId,complete}) and startControlCountdown({controlId,complete}) now require the originating hold to remain active, otherwise return {ok:true,cancelled:true}. Existing native release/cancel handlers cancel the disposable feedback and settle the pending session action without logout. No public tool id, command, signature or authentication API changes.

2026-10-09 User tool preserves ui.contact.panel/contact_panel identifiers; its declaration now includes pointer.long alongside click/on/off. The existing UI panel registration forwards hold/pointer.long through its extraHandlers, and the canonical bootstrap panel handler routes only pointer.long to user.js#disconnectHomeSession; ordinary presses retain panel opening/toggling. Internal menu startToolCountdown({toolId,complete}) and Matrix resolveLongPress(control,id)/startControlCountdown({controlId,complete}) compose createBevyCountdown, without a new command or browser global. Countdown cancellation and principal/mode validation precede existing auth.logout/security.leaveGuest. Generic panel requests honor runtime_owner:window through the declared lazy module/open_fn/close_fn. The contact onOpen contract returns cleanup before hydration; late reveal remains lifecycle-bound. Menu and tool labels use existing eve.menu.contact and eve.tool.contact_panel.label translations (Utilisateur/User).

2026-10-09 Visual right-click repair adds no public tool/MCP API. The existing Visual panel exposes internal read-only `readMysticContext(point)` to the lazy Mystic context resolver, returning displayed Atome/project ids and kind. `openMysticContextMenu` remains the opening/access owner; the secondary click keeps its contextmenu source and never synthesizes primary activate or fullscreen-exit hold.

2026-10-09 Reference maintenance: active code paths must exist. An explicit `retired:path` identifies a former source absent from this checkout, never a callable owner or availability proof. Historical entries below are qualified accordingly; unresolved feature equivalence remains **To verify**. The map guard checks active paths and rejects retired annotations on existing files.

2026-10-09 Import source and persistence contracts. The native import request adds the `contacts` source (with label `contacts`) beside `files`/`photos`/`music` whenever images are accepted; iOS answers it with `{success:true, data:{source:'contacts', files:[]}}` and `requestProjectImportFiles` / `importProjectMediaFromSystemWindow` return `{ ok:true, source:'contacts' }` so the Media panel lists the contact photos it already owns (`isContactPhotoMedia`, `atome/src/squirrel/contacts/photo_media.js`); they no longer appear in the base Media list. `fetchStateCurrent` returns `null` for an absent Atome on the local (Tauri/iOS) branch as on Fastify. `state-current/list` keeps its message and response shape on all three servers; its page is chosen on ids and its type filter matches the new schema expression indexes. iOS and Tauri drop properties rewritten identically from stored events and particle writes (the Fastify rule). The user profile commit is `scope: 'global'` and `eve_profile` no longer embeds `user_face` (still returned by `parseProfileParticle`). `fetchStateCurrentList` accepts `pageSize` up to 1000. No new command, endpoint or transport.

2026-10-08 List internal composition: fixedColumns.presentation=thumbnail_name_play and onPlayActivate extend the existing reusable row contract. playProjectViewEntry selects the canonical target then invokes the normalized catalog Play definition through the contextual API. feedContextualRailWithRow accepts enterTarget for the existing list.enter controller route; Organizer delegates returnToProjectDashboard. Beginner root uses canonical api.enter and normal ACL/catalog resolution. Creation command aliases reuse project-create authorization only; no object conversion, public API, registry, property or transport was added.

2026-10-08 createProjectRecord consumes the existing empty:true creation intention: at beginner expertise it commits one ordinary white text child with the project root and forces the initial view_mode to list. The creator now invokes the canonical Atome.commitBatch entry instead of the lower-level projects.create adapter. Explicit project/parent scope prevents current-project injection. No new public command, transport, schema field or runtime global.

2026-10-08 Free-access first launch preserves ui.first_launch.auth/commit and project.program.commit. The guest operation now returns the existing Goals presentation instead of closing the sequence. Home onWithoutAccount returns the local guest identity; first launch owns subsequent navigation, session-only progress and completion. Account profile mutation and authenticated flow contracts are unchanged. No new command, endpoint, schema or persistent guest preference is introduced.

2026-10-08 Internal Atom interface: activateAtomShortPress({ source }) closes the active AI-slot occupant explicitly or calls openWorkspaceDashboardAndMainMenu; it never toggles an already-open dashboard. Main-menu and Mystic factories accept an internal onAtomShortPress callback. Long-press invocation contracts are unchanged. ensureBeginnerHomeProject() returns { ok, projectId } or { ok:false, error }; authenticated references use the existing profile API, anonymous references the existing preferences publication. No public command, endpoint, schema key or transport is added.

2026-10-08 Original-source refinement and shared palettes: the browser media resolver accepts imageMaxTextureSize (default 4096) separately from UI/waveform limits. bevy_image_texture_source exports resolveImageRasterSize and resolveImageNodeTexture. Internal refreshBevyWebRendererProjectTextures replaces the text-only refresh; refreshBevyNativeRendererProjectTextures uses the existing native resource/text operation mapping. Both accept surface, isProjectNode and isCurrent and reject obsolete source/geometry/style/transform results after decoding. createMenuPaletteOwnership in the existing product registry provides claim/release for the two existing palette owners; no panel, tool-command or durable-state API changes.

2026-10-08 Programme template cards: `eVe/domains/templates/system_template_catalog.js` composes `buildDashboardCreationCellRecords` and the shared Dashboard unit, gap, font, icons and glass into ordinary project Atomes. Template version 2 retains Plan/Journal/Monitor panel actions and stable background/label refs; accent and icon refs participate in activation. No new renderer or control. Pinned existing instances are not silently updated.

2026-10-08 Beginner creation and new-project background — ui.first_launch.home operation new_program opens the existing Dashboard creation surface instead of the Programme panel. openWorkspaceDashboardAndMainMenu accepts optional creationCategory; omitted means the normal home for the current expertise. createMatrixTemplateRuntime accepts optional onSubmit(key), inactive during busy/non-interactive states; Phone binds it to the same ui.first_launch.auth authenticate action as Continue. preferences.visual.newProjectBackgroundColor is normalized by the visual preference owner (default #272727, canonical hex or rgba colour) and saved by the existing Home/profile command path. Project creation captures it into background unless background/backgroundColor/bg is explicitly supplied. Existing project state is not migrated.

2026-10-08 Host Clipboard — ui.paste.action keeps its registered command identity and accepts the existing context_type to distinguish project and editing destinations. tools/clipboard/system_bridge.js exposes readSystemClipboardContents({ textOnly }), returning { ok, source, revision?, copyKey?, items }, with text items or transient File/native-file descriptors. clipboard_read_items is registered in the Tauri command table/clipboard permission and the shared iOS/AUv3 controller; clipboard_write_text accepts optional copyKey. Native refusal is explicit, with no browser substitution. Axum POST /api/clipboard/files transfers resources only, requires its local bearer, accepts only revision/indexes and reacquires file URLs from the OS; it cannot accept client disk paths. Canonical Atome writes still traverse ui.creator/Atome.commit. Project import's projectPosition is an optional project-coordinate placement; default callers retain existing placement. Text-field opening also composes the existing exported ensureMysticContextItemsRuntime loader before the common context opener, so it works before a project/workspace is presented. Matrix/template fields report clipboard refusals through their existing localized notice line.

2026-10-09 Basic Dashboard v6 retains ui.matrix.focus and ui.first_launch.home signatures for bottom section titles and square add cards. syncTemplateInstance retains its existing API and pinned-instance early return; for an older dashboard_basic system source it calls existing ensureSystemTemplate before the canonical sync planner. Installer failures propagate before instance writes. No new command, endpoint, durable property or transport contract.

2026-10-08 Basic Dashboard v5 exposes existing Matrix focus semantics: toggleCategoryFilter(projects|monitor) toggles state.filteredCategoryId between the selected category and the normal empty state. Native ribbons invoke existing ui.matrix.focus with matrix_atome_id, project_id and category. The existing ui.first_launch.home add and navigation actions remain; expanded programme cards pass their actual programme project_id. No new public command, endpoint, persistent property or transport contract is introduced.

2026-10-08 createMatrixTemplateRuntime accepts optional internal layoutFrame(grid, bounds, root) and layoutCell(parent, frame, record) composition callbacks; dashboard_basic_runtime.js supplies them for beginner surface placement and mirrored heading controls. Existing updateRecords, open, render, destroy and ui.first_launch.home routes are preserved. No new command, endpoint, schema property or public transport is introduced.

2026-10-08 Internal material projection: `SYSTEM_UI_THEME_TOKENS.surface` is code-owned; `resolveSystemUiSurface(settings, { blur })` derives CSS and GPU tint/material for the existing skin owners and isolated simulation. `dashboardGlassMaterial({ shadow, settings, blur })` delegates to that owner; no runtime preference, persistence or public command API was added. `dashboardContentGlassStyle()` takes no local tint arguments. Validation: `eVe/documentations/system_surface_theme_validation_2026-10-08.md`.

2026-10-07 Tauri first-launch repair keeps existing API contracts: Matrix accepts canonical Axum record identities via the shared idOf reader. ui.first_launch.home is a navigation command authorized in consultation/performance alongside ui.panel.open and Matrix focus/create; persistent scene-edit tools remain blocked. SMS proof, simulated payment, account creation, profile writes and program commits retain their canonical owners. Native tests use only the existing loopback SMS mock.

2026-10-07 Native build maintenance: scripts/build_cache_retention.mjs exposes planBuildCleanup(options), cleanBuildCaches(options) and activeCompilers() for the shared development owner. CLI defaults to read-only preview; --apply performs typed deletion; --phase=start|end selects lifecycle work. package.json declares clean:build-cache and clean:build-cache:preview; macOS run.sh calls the owner before and after the existing runner. This authorized host build-maintenance boundary has no application/MCP endpoint, account mutation, renderer or durable business state. Policy: scripts/build_cache_retention.md.
2026-10-18 Workspace residue: scripts/workspace_residue_retention.mjs exports planResidueCleanup(options, add) and residueRetentionDays; cleanBuildCaches(options) accepts residue { scratch?, deviceSupport? } and reports convergence: deferred with compilers when builds are active. CLI passes the agent scratchpad and DeviceSupport paths. Policy: scripts/build_cache_retention.md.

2026-10-07 Native local-test auth transport repair: auth_development_request remains restricted to SQUIRREL_AUTH_SMS_MOCK=1 and an exact HTTP localhost/127.0.0.1 origin. Its existing action allowlist now includes phone-link-simulate-payment, phone-link-resend, phone-link-cancel, session-challenge, session-renew and session-logout. It still rejects unrelated account mutations and remote origins; signatures are verified by the existing Fastify handlers. Native local-session-lock keeps its API and uses the same enrolled scope/keyId contract as local-session-resume. No public command or durable schema was added.

2026-10-07 Authenticated logout, Billing v3 and restore follow-up: resetWorkspaceForNextUser keeps its flags/events and delegates visual teardown to eVe. performFullLogoutWorkspaceCleanup now returns the awaited canonical clearProjectView task; clearProjectView returns its shared pending scene-cleanup promise while retaining synchronous host cleanup. Home waits for that promise before auth-checked or logout opens Access; the menu leaves opening to loaded Home handlers. Existing ui.first_launch.auth Pay/Back intentions reveal SMS/Phone before signed delivery/cancellation settles, leaving controls actionable and stale completions unable to replace the current step. Session proof, endpoints, storage and durable mutation contracts stay unchanged. Restore reuses beginDashboardWorkspaceTransition, prepareProjectOpening and presentOpenedProject; no new command or global.

2026-10-07 Basic Dashboard v3 keeps ui.first_launch.home: Profile/Calendar dispatch ui.panel.open; the heading plus buttons dispatch existing new_program/new_monitor operations; Weather uses its existing Matrix source runtime. Matrix template_control.content_layout:icon_button with icon_source calls panelIconButtonNode, retaining the native appearance and activation contract. programMonitorSources additionally exposes measurement from existing consented, nondeleted observations; no durable schema changes. createBasicDashboardRuntime retains its exports and delegates updateRecords while reading current canonical frame dimensions. No new command, endpoint or transport. Browser evidence uses isolated read sources and records intents; authenticated end-to-end acceptance remains pending.

2026-10-06 Mystic « Niveau d'expertise » adds no public API, event or global. `createMainMenuContentRuntime` keeps its surface and gains one fourth child on the existing `utilities` palette: `level` opens the same hierarchical navigation with `level_beginner` / `level_intermediate` / `level_advanced`. Each leaf uses the existing registered-handler route (`ui.level.beginner|intermediate|advanced` with `extra_input.mastery_level`) and writes the ONE existing preference `preferences.visual.masteryLevel` through the canonical profile owner (`eVe/intuition/tools/user_mastery_level_preference.js`, same `upsertUserProfile` + publication shape as the Home panel and `workspace_surface_preference.js`). `mystic_context_items_runtime.js` keeps its exports and only reads the published visual preferences to mark the active choice with the existing `check` icon (`user` otherwise). No new durable key, method or option.

2026-10-06 Access presentation restoration adds no public command, transport or durable property. The existing `template_control` declaration selects `surface: content` and `animation: choice_light`; `buildDashboardCardRecords` accepts optional composed content while retaining its ordinary thumbnail behavior by default. The existing procedural texture payload and `updateTreeMotion({updates:[{nodeId,procedural}]})` carry the logo/light on reserved renderer mode 4. The native material patches resident uniforms; the canonical texture resolver and surface-size subscription retain resource and geometry ownership. Stop/destroy cancel the animation and pending scheduling. Other procedural modes and panel factories are unchanged.

2026-10-06 First-launch commands enter the existing gateway/registered handlers: ui.first_launch.auth (ephemeral stage transitions and existing phone proof exchange), ui.first_launch.commit (profile/programme/template mutations), ui.first_launch.home (normal Basic Dashboard actions), ui.matrix.value (canonical template_control/template_value commit). project.program.commit supports configure with declared bricks and sleep_preferences, without calendar publication. phone-link-start returns paymentRequired for new-number preparation; phone-link-simulate-payment consumes the existing signed device challenge and delivers the SMS link once. No account exists before link proof. Auth responses and current user info preserve first_launch_version; simulation is fixed at EUR1200/month and cannot debit. Existing AdoleAPI.sync.flushWorkspace completes canonical browser recovery before first profile reads. No new transport or merchant integration.

2026-10-06 Couleur live preview API: `createColorControlRuntime` accepts an `onPreview(channels, { phase })` option, invoked with the pointed value during a held palette sweep and with `null` when the finger leaves; the wheel/brightness/opacity captures and `colorSwatchGridNode` declare `palette_preview` / `palette_preview_leave` handlers alongside `palette_choose`. The shared pointer runtime emits that pair only during a held palette gesture. `intuition/tools/selection_style_apply.js` exports `previewColorOnSelection(color)` and `clearSelectionColorPreview()`; `domains/rendering/project_scene_runtime.js` exports `previewProjectSceneRecordStyles({ projectId, patches })`. None of these commit a record or change durable state. No command, endpoint or durable schema changed.

2026-10-06 Couleur control contract: `createColorControlRuntime` accepts a `showTitle` option (default true) and its wheel and brightness/opacity captures answer `palette_choose` (release point -> value) alongside press/drag/release/cancel; `decoratePanelSweepTree` forwards the local release event to a control-declared `palette_choose` before closing the surface. No command, endpoint, durable schema or renderer API changed.

2026-10-06 Persistent profile wallpaper: navigation preserves the existing media URL, hidden video decoder, frame callbacks and GPU wallpaper entity. The canonical project colour is projected as RGBA `cover` above the wallpaper and below every Atome, transparent for Dashboard and foreground full-surface Dashboard Matrix. The existing surface-background event/export carries this cover; no DOM layer, additional player, registry or durable property is added. Cover-only updates keep resident image/video resources; resize updates the video mesh in place. External video queue ordering uses the extracted mesh transform, matching sprites and preserving the reserved background depths.

2026-10-06 Existing browser state-current/atome read responses now include capabilities for the verified local owner when no server projection exists, including per-property write/delete/share. Existing restrictive projections remain intact. No public command, endpoint, store or durable schema added; workspace_identity_mismatch rejects a record outside the session owner namespace, and the existing in-flight identity check remains mandatory.

2026-10-06 Project template commands: ui.project.templates.panel toggles the native project_templates surface; ui.project.templates.open requires template_project_id and opens an existing canonical template project; ui.project.templates.new creates/marks/opens an ordinary project-template. All UI actions call the existing tool gateway; project/template writes reuse canonical creation and commits.

2026-10-05 Matrix/Interaction internal contracts. Existing `ui.matrix.place` accepts `layout:"grid"`, rows, columns, gap, headers and optional cell/header Atome specifications with children; the previous Dashboard layout remains the default. `ui.matrix.configure` receives matrix_atome_id (or one selection_ids target) and layout parameters. `ui.matrix.settings.panel` exposes the native numeric settings surface. Existing `ui.panel.open` opens its native chooser when no surface is supplied, or executes {surface, mode:"open"|"close"|"toggle"}; Interaction uses the same options builder. Group schemas declare matrix_grid and matrix_cell. Runtime MCP calls these same registered commands through runtime.tools.call; no additional MCP registry or writable view state.

2026-10-05 Internal Bevy clipping contract extension: `bevy_projection_clip_contract.js#readBevyProjectionRoundedClips` validates inherited `[x,y,width,height,topLeft,topRight,bottomRight,bottomLeft]` boundaries. Spawn/transform payloads carry additive `clip_rounded_rects`; Rust `AtomeRenderNode` and `AtomeTransformPatch` default omitted lists to empty. Each original boundary survives nested intersections, motion and render scaling. This is disposable rendering geometry, with no business schema, command, transport or durable-state API change. Hierarchy bubbles and their reveal callback are removed; section commands/chevrons remain canonical.

2026-10-04 Optional panel presentation: shared UI builders accept `panelTokens` with the current panel preset as default; workspace consumers explicitly retain the workspace preset. No business APIs/events changed. Bevy shape payload/style accepts optional `surface_paint` with linear gradient stops, inset shadows and optional border edge colours. Omitted paint keeps the existing renderer; an explicit null style patch clears paint while retaining geometry, selection, opacity and resolved masks. Footer composition accepts existing-action children; badges invoke the existing projection reveal/scroll callback only.

2026-10-04 Boot/auth contract: failed desktop automatic recovery publishes the existing logged-out/auth-checked state via `clearSessionState`; user background startup precedes intuition bootstrap so login pixel readiness does not depend on deferred-module presentation. No new public API.

# Atome / eVe API Map

2026-10-15 `SyncEngine.getState()` exposes read-only `serverVersion: string|null` from the current peer's existing `/ws/sync` welcome `version`. Disconnected peers and welcomes without a version report null. Home Server preferences consume this metadata alongside kickstart's atome/eVe versions; no new request, transport, command or business mutation is introduced.

2026-10-04 readResolvedBevySurfaceBackgroundMedia accepts {waitForVideo:false} as its third argument for login presentation. Pending playback/metadata returns the canonical colour and video descriptor without blocking; decoder errors remain recorded by the existing background owner. Normal consumers keep awaited video resolution. Logout resets live background params immediately to the public default without writing the profile.

2026-10-04 DEFAULT_BACKGROUND_MEDIA_ASSET replaces the image-only default constant and points to assets/videos/eVe.mp4. defaultUserBackgroundParams sets backgroundMediaKind to video; existing saved image preferences without a media kind still resolve as images. No public action or wire contract changed.

2026-10-04 Video wallpaper import and selected-media application reuse the existing Background media selector/store and public apply_background_from_selection action. Native imports use the local uploader; browser imports use the browser vault. Protected media reads use buildUserHeaders and current in-memory local/cloud sessions from asset_box_auth, rather than obsolete localStorage tokens. Direct video sources are decoded according to their actual container instead of being gated on MP4 support. No endpoint or state owner added.

2026-10-07 Browser outbox: `guest_workspace_store.js` exports `parkRefusedWorkspaceEvent`, `requeueRefusedWorkspaceEvents`, `refusedWorkspaceEvents`; `browser_workspace.js` exports `requeueRefusedBrowserWorkspaceEvents`; window event `squirrel:workspace-sync-refused` `{ userId, refused: [{ id, atome_id, error }] }`.
2026-10-07 `guest_workspace_store.js` exports `oldestPendingWorkspaceEvent(ownerId)` (next outbox row via the `owner_created` index); `media_source.js` exports `isPassthroughMediaSource(source)`. Existing signatures and results are unchanged.
2026-10-07 `read_atome_bevy_web_diagnostics()` gains the additive `frame_requests` counter (animation frames requested by wakes; it replaced the same-day `paced_redraws`); existing fields are unchanged. A video wallpaper is paused under an opaque cover and resumed when uncovered.
2026-10-04 Wallpaper cover contract: `bevy_surface_background_runtime.js` sends `{signature, color, texture, video, cover}` to the existing Bevy surface-background export. Background-specific `fit`, `backdrop` and `tile_size` fields and fit-selection actions were removed. Rust deserialization ignores legacy fields; existing saved preferences remain readable. Images and videos use one centred cover crop, recalculated by the existing surface resize owner. Media-node object-fit APIs and procedural pattern generation are unchanged.

2026-10-03 Social sharing. Runtime/MCP methods `social.accounts`, `social.connect`, `social.disconnect`, `social.prepare`, `social.publish`, `social.status`, `social.cancel` share `atome/src/squirrel/social/contracts.js`; capabilities `social.read` / `social.write`; MCP confirmation for connect/publish/disconnect (`mcp_security_policy.js`, TV and social now resolved by one contract lookup). Wire: the existing authenticated `ai-provider` frame on `/ws/api` with `action: 'social.*'` (plus internal `social.connect.start|await|cancel`, `social.handoff`, `social.confirm`), relayed unchanged by Tauri/iOS hosts. Provider-imposed HTTP only: `GET /api/social/oauth/callback/:network` (plain text, no logging) and `GET /api/social/media/:token` (30 min, per job). Asset contract for producers (ZRecord Canvas): `{ text, media: { file, kind, name? } }` naming a stored asset of the principal. Errors are `social_*` codes with optional `detail`/`provider_code`. iOS native invoke adds `export_file_share`.

2026-10-03 YouTube/TV repair adds no public API. Existing tool entry points now open the shared Finder field. The WS client contract remains {ok,status,data}; YouTube reads data.results/data.nextPageToken, and the pre-existing TV data-envelope correction is retained and regression-tested. Search requests type=video, videoEmbeddable=true and videoSyndicated=true through the same server-only official API key. Catalog failure/invalid payload is returned as failure. Standard media play retries a blocked existing player without replacing it. Shared video registration accepts an optional abort signal; native HLS stays preferred, and Hls.js is packaged locally for MSE decoding.

2026-10-03 HealthKit authorization: Dashboard header entry and explicit association initialize read access centrally through the existing health owner/channel. iOS checkbox and tile actions never request HealthKit; Android and Motion retain their selected-type flow. Native capability discovery covers all 33 catalog monitors; authorization excludes Motion, checks request necessity, and reports unknown/error states. No native command was added. Late pre-authorization reads are discarded and re-read; failed requests no longer report success. Values remain memory-only and outside logs, DOM, history and sync.

2026-10-02 `contacts.import_vcf`, `contacts.export_vcf`, contact stop/status and calendar native/DAV/ICS import, ICS export, stop/status contracts share `atome/src/shared/personal_import_tools.js`. AI and MCP use the public canonical APIs with existing domain capabilities. DAV is a bounded read-only operation on the existing authenticated WebSocket, using existing credential-vault references. Details: `eVe/documentations/PERSONAL_IMPORT_VALIDATION_2026-10-02.md`.

2026-10-01 AtomeVoice.wake exposes start(), stop(), getState(), subscribe(listener), test() (30 seconds, no assistant), configure({accessKey,keywordPath,modelPath,modelVersion}), setEnabled(boolean), suspend(reason), resume(reason). Snapshot: {phase,error,enabled,armed,testing,detected,locale,phrase}; phases off/starting/listening/assistant/suspended/unavailable. The service wake owner additionally exposes dispose/connectAssistant. Profile preferences.assistant stores {voiceActivation:false by default,locale:'fr-FR'}, never the device arming bit or key. Native commands audio_wake_start({sampleRate:16000}), audio_wake_read(), audio_wake_stop() return bounded PCM/active/busy/overrun state. Hidden tools ui.ai.video.generate and ui.ai.audio.generate accept {prompt,project_id?} and return completed only after import with atome_id/project_id/job_id/provider. Secret provisioning uses the existing encrypted account-bound vault.

2026-10-08 Render kind `media_window` (geometry only) joins the Bevy adapter registry; wasm `run_atome_bevy_renderer` now starts the project canvas with premultiplied transparency.

2026-10-07 Television: public `/ws/api` frames `tv-catalog` `{country? | ids? | query?, preferCountry?}` -> `{ok, countries:[{code,name,flag,count}], channels:[{id,name,country,categories,logo,providers,streams:[{url,kind:hls|video|youtube|youtube_live,secure,provider,videoId?}], match?}]}` and `tv-resolve` `{url}` (YouTube channel `/live` address) -> `{ok, videoId}`, owned by `server/ws_tv_catalog.js` (Free-TV/IPTV + IPTV-org, blocklist/NSFW/closed removed, main feed first, cached 12 h). Tauri (`public_relay.rs`) and iOS (`FastifySyncClient.relayPublic`) relay `youtube-search`, `tv-catalog`, `tv-resolve` to Fastify without credentials. The authenticated operator route `type:'tv'` (`tvDistribution.js`, `ATOME_TV_DISTRIBUTION_CONFIG`) is removed. Commands: `tv.*` (contracts unchanged, descriptions rewritten) now act on the catalogue and the in-place player; `tv.open_channel` opens only an exact name (else CHANNEL_NOT_FOUND / AMBIGUOUS_CHANNEL with candidates). New `youtube.search|play|close|set_fullscreen` (`atome/src/squirrel/youtube/contracts.js`), registered like TV in the runtime bootstrap, MCP handlers and security policy. Default MCP actor capabilities gain `tv.read`, `tv.control`, `youtube.read`, `youtube.control` (the assistant's TV calls were previously denied). Assistant: `createConversationSession({ toolContext })` preloads `tv.open_channel`, `youtube.play` always and the commands of open tools plus one line each (`eVe/voice/assistant/assistant_tool_context.js`, providers registered by `tv.js` and `youtube_tool_runtime.js`). TV favourites: `preferences.tv.favorites` via the shared `profile_preference_list.js` (also used by the YouTube history).

2026-10-18 TV favourites: a never-written `preferences.tv.favorites` means BFM TV + Arte, stored once as `{id,name,country,logo}` by `loadTvFavorites()` (an emptied list stays empty). `createProfilePreferenceList` gains `written()` and `seed(entries)` (confirmed write, publishes what the profile holds). Finder intent `finder.row.favorite {key}` -> tool-context source `toggleFavorite(record, {refresh})`. Shared list entries accept `trailingTool` (one trailing control node). No command, MCP or server contract changes.

2026-10-01 YouTube search adds public `youtube-search` on `/ws/api` with `{requestId, query, pageToken?}` and `youtube-search-response` with `{ok, results:[{videoId,url,title,thumbnail,channel}], nextPageToken}` or an error code. Search occurs only after the Finder input is submitted. `YOUTUBE_DATA_API_KEY` exists only in Fastify. The saved video Atome uses `media_source`, `youtube_video_id`, `media_url`, `youtube_title`, `poster_source`, and `name` through normal create/set commits. The YouTube tool reuses the ordinary media reader action for the selected active player; its local runtime methods control the single IFrame instance. 2026-10-07: titles/channels arrive HTML-escaped from the Data API and are returned as plain text; each failure cause is written to the structured server log, never the key. The viewing history (last 20 videos that actually played, newest first) is the user preference `preferences.youtube.history` (`{videoId,url,title,channel,thumbnail,at}`), owned by `eVe/intuition/tools/youtube_history_preference.js` through the canonical profile API; the Finder lists it before a submitted query and again when the field is emptied.

Historical snapshot (retired owner; not current availability evidence): 2026-10-01 TV foundation (partial). `ui.tv` activates the standard ribbon input. `atome.tv` and ten `tv.*` runtime/MCP methods share `atome/src/squirrel/tv/contracts.js`: list_channels, find_channel, open_channel, close, set_fullscreen, get_state, now, next, get_epg, search_program. They use tv.read/tv.control policy, canonical IDs and public output schemas. `tv.next` means next programme; page default 50/max 200, EPG default 24h/max 7 days. Existing WS authentication routes the internal tv catalog/resolve/epg family to `retired:server/tvDistribution.js`; resolve is a private player path, absent from model-facing tools. Shared panel adds setBevyPanelFullscreen and optional hideFooterInFullscreen/bodyPaddingPx/requestClose; Finder accepts a temporary source/owner with releaseToolContext/hasToolContext. Standard input adds optional onFocus. Live remote-client arbitration and real provider SDK/territory/redirect acceptance remain incomplete.

2026-10-01 Health native contract (no new remote command). One family of native commands, all requiring the per-page channel token and a host-verified account: `health_channel_open` (one token per page load), `health_channel_close`, `health_context_reset`, `health_capabilities`, `health_link_status`, `health_link`, `health_request_access`, `health_read`, `health_observe`, `health_unobserve`. iOS: `nativeInvoke` → `AppNativeHealthController` (main frame of the bundled page only; AUv3 answers `health_host_unsupported`). Tauri: the single app command `health_invoke({ command, payload })` (permission set `health-bridge`, window `main`; desktop answers `health_host_unsupported`), forwarding to `tauri-plugin-health` which exposes no JavaScript command. Native → page: `atome:native-health-invalidated` with `{ monitors: [ids] }` only (no value). Removed: `atome:native-health-sample`, `atome:native-health-revoked`, `health_heart_rate_start/stop`. JS: `getHealthOwner()` / `sealHealthAccessForUntrustedCode()` from `#squirrel/health/index.js`; no window global. MCP Conditions handlers run behind `runWithoutHealthAccess`.

2026-09-29 Mystic constant list, Utilities palette and the project Play add no public API. `eVe/intuition/menu/context_menus.json` extends its existing taxonomy only: `menus.mystic.fixed` (the one list every long press or right click opens, `utilities` replacing `mode`, `activity` kept and reachable by Mystic) and `menus.mystic.modes` (consultation → `perform` + `mode_edit`; performance → `mode_edit` + `mode_consume`); `resolveContextMenu` and the new internal `resolveFixedMysticMenu` in `eVe/intuition/menu/context_menu_resolver.js` keep their call shape, and `withProjectPlaybackCapability` merely fills the `playback` capability when a raw `{ type: 'project' }` context arrives without one. `createMainMenuContentRuntime` keeps its surface and gains the `utilities` palette (`mode`, `validation`, `matrix`), `mode_consume` and `new_project`; `ui.capture.validation` and `tool.main.matrix` are existing tools, only re-homed. `mystic_context_items_runtime.js` keeps its exports and maps a project background without selection to the existing `ui.project.transport` (`operation: 'play' | 'stop'`). Dwell stays the internal `updateHover({ dwell })` option of `eVe/intuition/ribbon/bevy_ui_mystic_runtime.js`: a released press no longer starts a dwell, `releaseAt` still owns activation. The permanent bottom bar swaps `mode`/`activity` for the existing `help` tool and the `contact` panel command. No new global, event, method or option.

2026-09-28 (correction 4) No public API change: the two new ribbon thresholds are the whole tuning surface. `RIBBON_TOKENS.mysticCenterHoldMs` (3000 ms — the assistant's stationary hold on the Flower centre) and `RIBBON_TOKENS.mysticCenterHoldTolerancePx` (10 px — how far that finger may wander) join `RIBBON_TOKENS.mysticAutoOpenDwellMs` (750 ms — the palettes' and hoverActivate tools' stationary dwell) in `eVe/intuition/ribbon/tokens.js`; `MYSTIC_AUTO_OPEN_DWELL_MS` in `eVe/intuition/ribbon/bevy_ui_mystic_runtime.js` still re-exports the dwell token, while `MYSTIC_AUTO_OPEN_DWELL_TOLERANCE_PX` stays its own 6 px. `createMysticCenterHold` keeps its signature and its `{ startCentreHold, stopCentreHold, moveCentreHold, releaseCentreHold, pressCentre, activateCentre }` surface: only the arming verdict changed (a live point beyond `mysticCenterHoldTolerancePx` refuses to start the countdown), and `state.pointerPoint` is internal runtime state, not an option. `openAt`, `updateHover({ clientX, clientY, allowActivation, dwell })`, `releaseAt({ clientX, clientY, event, allowActivation })` and `activateDirectional` are unchanged, as is `eVe/domains/rendering/bevy_ui_pointer_runtime.js`, restored to its pre-correction-3 routing.

2026-09-28 Import source contract, and one new panel global. `eVe/intuition/runtime/project_media_import_runtime.js` now sends a source vocabulary to the native bridge instead of an empty list: `['photos']` for an image-only `accept`, `['*']` for a request that declares no type (empty `accept` or `*`), and the document vocabulary for everything else; the third argument of `AtomeFileSystem.loadFilesWithDocumentPicker(fileTypes, callback, multiple)` is honoured again by the host (`allowsMultipleSelection`). iOS answers `photos` with the Apple Photos picker and `*` with a Photos/Fichiers source choice, both through the existing `{files:[{name,base64}]}` response shape, so no Adole API changed. `eVe/intuition/tools/user.js` registers the extra `window.open_create_user_panel(payload)` global beside `open_home_panel` / `close_home_panel` / `toggle_home_panel` (through `panel_globals.js`'s `extra` map): it opens the phone step of the shared login sequence for the Contact panel, and the internal step it uses is `user_login_sequence.js#openCredentials` behind `user_home_panel_runtime.js#openCreateUser`. `server/wsPhoneLinkAuth.js` gains the internal `refreshDirectoryProfile` call after `update-user`, after a successful `session-delete-account` and after an auth action that emits a token; it is an internal projection refresh, not a new action.

2026-09-28 Mystic dwell token and the project-view Visual hand-over add no public API. `MYSTIC_AUTO_OPEN_DWELL_MS` (`eVe/intuition/ribbon/bevy_ui_mystic_runtime.js`) now reads `RIBBON_TOKENS.mysticAutoOpenDwellMs` (`eVe/intuition/ribbon/tokens.js`), which becomes the single owner of the duration at 750 ms instead of the runtime's own literal; the runtime method set, the automatic-opening sources (`bevy_mystic_dwell` / `bevy_mystic_release` / `bevy_mystic_fling`) and `context_menus.json` are unchanged. `eVe/domains/rendering/project_view_visual_interaction_runtime.js` gains the internal session flag `handedToMenu`: once the long press has opened the Flower, `drag` answers `cancelled` without emitting, `release` forces its cancel path so nothing behind the menu can commit, and the panel releases the BevyUI captured pointer through the existing `cancelPointerGesture()` — no new method, no new surface.

2026-09-28 (correction 2) The held press of a Flower opening belongs to the menu on every route: no public API changes, and no second lock. `eVe/intuition/mystic/context.js` keeps `runtimeState.primaryPresses` (every primary press, keyed by pointer, with its press point and bounded by the same 12 s TTL as the lock) and `runtimeState.menuHeldPointer`, and `openMysticContextMenu` calls the internal `claimHeldPointerForMenu(openingPointer)` — the session pointer in `holding`, else the press still down — which takes the existing `setMysticPointerLock(pointerId, { phase: 'long_press', sourceEvent: 'mystic.menu.held_press' })` exported by `eVe/intuition/mystic/context_pointer_lock.js` and dispatched as `eve:mystic-pointer-takeover`; the contract of `openMysticMenu({ x, y, items, holding, context, onClose })`, `updateHover({ clientX, clientY, allowActivation, dwell })` and `releaseAt({ clientX, clientY, event, allowActivation })` is unchanged. While the menu holds the press, `context.js` routes the hover to the menu and cancels the DOM move (`preventDefault` + `stopPropagation` + `stopImmediatePropagation`), cancels `dragstart`/`selectstart` for the same reason, and ends the gesture with a single `releaseAt` on the real `pointerup`/`pointercancel` — the canvas-session route included. No new global, event, method or option.
2026-09-28 (correction 3) A secondary press is refused by the surface gesture owner and held by the Mystic owner: no public API change and no new option. `createPressLedger()`, `heldMenuPress` and `runtimeState.secondaryPresses` stay internal to `eVe/intuition/mystic/context.js` (nothing new is exported), and the signatures of `installIntuitionXMysticContextRuntime`, `openMysticContextMenu`, `updateHover({ clientX, clientY, allowActivation, dwell })` and `releaseAt({ clientX, clientY, event, allowActivation })` are unchanged; the lock remains the one of `eVe/intuition/mystic/context_pointer_lock.js` (`setMysticPointerLock`/`clearMysticPointerLock`, `eve:mystic-pointer-takeover`), which `context.js` now also reads through `isMysticPointerLocked` so a lock already held is not announced twice. `eVe/domains/rendering/surface_interaction_runtime.js` adds only the internal `isPrimaryPointerButton(event)` guard on its own `pointerdown` route: a `button === 2` press no longer produces `drag.start`/`drag.move`/`resize.*`.

2026-09-27 Native bridge/command contract: iOS accepts internal, origin-gated `auth_local_request({ action, ...fields })` and returns the existing local-auth response shape; it adds no public Adole API. Desktop `auth_device_key` invocation always supplies `action`, `scope`, `message` and `signature`, with JavaScript null mapped to Rust `Option::None`. Weather boot no longer calls Geolocation for permission `prompt`/`unknown`; `locate()` remains the explicit permission-requesting API.

2026-09-27 Native restart contract: native local-auth accepts internal `local-session-describe` and returns either `localGrant: null` or the newest/requested unlocked descriptor (`phone`, `keyId`, exact `scope`, local user and grant generation). The descriptor is not a bearer and is followed by the existing `local-session-challenge` / signed `local-session-resume`. `createAuthDeviceStore` exposes internal `forScope(scope)` so an already-bound native key is reopened without recomputing its historical phone scope. Tauri's injected Fastify authority and its JavaScript no-injection fallback both default to `https://atome.one` in every build configuration; only an explicit native/persisted override may select loopback. Public `AdoleAPI.auth` is unchanged.

2026-09-27 Phone-link application contract (native send path accepted): `AdoleAPI.auth` exposes `startPhoneLogin`, `resumePhoneLogin`, `completePhoneLogin`, `cancelPhoneLogin`, `ensureLocalSession`, `changePhone` and `deleteAccount`. `/ws/api` authentication uses phone-link start/challenge/consume/approve/resume/cancel, session challenge/renew/local-bind/logout/logout-all/revoke-device, phone-change-start and delete-account. Tauri injects one validated Fastify authority (`SQUIRREL_FASTIFY_URL`, release default `https://atome.one`) before application code and its loader uses the same production default when injection is absent; the iOS custom scheme resolves that authority too. Native device storage uses the platform key API and a deterministic phone-record scope, never a persisted WebCrypto lookup key; macOS desktop owns one EC key in the login keychain. Unsupported password/OTP actions return `auth_protocol_upgrade_required`. `GET /auth/v/:attemptId` is non-consuming; the iOS association route declares that path. Production recorded `sms_provider_accepted` and carrier receipt was user-confirmed. Real consumption of a newly received link remains **To verify** with the connected-device console. See `todo/auth_phone_link_implementation.md`.

2026-09-27 Panel quick mode adds one resolver and no new public surface. `eVe/intuition/tools/core/panel_toggle_rule.js#resolveToolPanelSurface({ key, toolId, declaredSurface })` sits beside the existing `readCommandPanelSurface` and answers with one resolution every surface shares — the taxonomy key first, else the surface a virtual rail declares on its own case, else `PANEL_SURFACE_DEFINITIONS`, else `buildPanelRuntimeConfigByToolId()` — so the ribbon, the contextual rail, the armed tool rail and Mystic never grow a second table. Nothing else is exported: the ribbon's `invokeToolItem`, `panelSurfaceForItem`, `itemOpensPanel`, `panelRevealHandlers` and the panel runtime's `decoratePanelSweepTree` stay module-private, and the panel tree contract gains no field — a control that already declares `activate` also answers the declared `palette_choose` / `hover` / `hover_leave`, and the hovered control's ring rides the existing `style.shadow`. The quick-mode release is a one-shot: `palette_choose` applies the control, then closes the surface (guarded by the mount, so it never closes twice), exactly like a palette leaf — while a plain click inside an already-open panel answers `activate` alone and keeps it open. No new event and no new node kind: `palette_slide_open` keeps its idempotent reveal contract (it opens a surface, it never toggles one shut).

2026-09-27 Palette quick mode hit-testing adds no public API. `mountOrUpdate` accepts an internal optional `hitTree` beside `tree` — the mounted surface keeps the palette motion while `state.trees` carries the final-geometry tree the hit-test reads — and the motion update contract accepts an optional `hitPosition` beside `position`: `state.sourceTrees` and the projected records keep the animated position. No new event: `palette_slide_open` remains the declared handler and `palette_choose` still carries no drag-selection field.

2026-09-26 Assistant accessories add no public API. The four squares of the assistant dock are ordinary accessory nodes of the existing inline-content contract (`buildInlineSearchNodes`) and the level palette is the existing `radioGroupNode`, so no component was duplicated. The reasoning level is applied through the existing `api.selectLevel(level)` of `eVe/voice/assistant/assistant_runtime.js`, which leaves the voice lane (`focusText()`), blurs the dock and delegates to `conversation_session.js#setLevel`; a `conversation_busy` or `provider_level_invalid` refusal comes back as a notice line in the palette instead of a rejected promise, and the vocabulary already travels as codes: `assistantErrorMessage(error)` is exported by `eVe/voice/assistant/assistant_conversation_view.js` as the single reader of `eve.voice.assistant.error.<code>`. The dock also publishes no new command for the conversations column or the microphone: those squares call the existing `api.listen()` / `api.focusText()`. New i18n keys, French and English: `eve.voice.assistant.level_1..5`, `eve.voice.assistant.error.provider_level_invalid`.

2026-09-26 Assistant configuration errors and the Home landing are explicit surfaces. `eVe/voice/assistant/assistant_ai_settings.js` publishes the closed list `AI_SETTINGS_ERROR_CODES` and `isAiSettingsError()` — so a provider/key/vault answer is never confused with a transport failure — plus `openAssistantAiSettings()`, the one entry that opens the Home panel on the AI keys. The assistant runtime's public surface (`window.eveAssistantApi`) gains `openAiSettings()`, which never rejects: it reports `voice.assistant.open_ai_settings.failed` and resolves `null` when the panel cannot be opened; `open()` now resolves on those codes with `phase: 'error'` and the snapshot instead of rejecting — and a new activation while that error is carried without a session retries the connection, and `sendText()` resolves `{ ok: false, error }` instead of throwing. `open_home_panel(payload)` extends its accepted payload with `section`, `subsection`/`subsections` and `revealNodeId` (a request to land on a section, not a new command): `bevy_panel_home_state.js#readHomeSectionRequest` reads it, `bevy_panel_home_sections.js#openSections` opens it and `user_home_panel_runtime.js#openHomePanel` remounts an already-open panel when a section is named; the latched re-activation is unchanged for calls without one. No new event is published, and the assistant asks for the existing `{ section: 'settings', subsection: 'settings.passkeys', revealNodeId: 'home_ai_keys_accordion' }`. Evidence: `tests/eve/assistant_visual_contract.test.mjs`, `tests/eve/bevy_panel_home_contract.test.mjs`.

2026-09-26 Assistant dock and palette gestures add no public API. `resolveAssistantDockGeometry` keeps its `{ width, height }` input and drops the handedness input the corner never used: the dock is bottom-right for every gesture, and the accessory squares (submit, microphone) are ordinary accessory nodes of the existing inline-content contract (`createRibbonInlineSearchRuntime`), not new commands; `open()` now unfolds that row through the same runtime, so the entry point the user asked for is the row the contract already describes. The palette quick mode publishes nothing new either: `palette_open`, `palette_slide_open` and `palette_choose` are the events of the existing tree contract (`bevy_ui_pointer_runtime.js` emits them, `bevy_ui_tree_normalization.js#EVENT_NAMES` keeps their handlers), and `palette_choose` no longer carries the unread `palette_drag_selection` field. CMD/CTRL+C and CMD/CTRL+V keep their single registration in `eVe/default/shortcuts.js` (`ui.copy.action`, `ui.cut.action`, `ui.paste.action`). The lasso restoration adds no API either: `evePresets.lasso.css` keeps its shape, its producer simply lives again in `eVe/elements/look/tool_theme.js` as part of `eveAtomeStyles`. Evidence: `tests/eve/assistant_visual_contract.test.mjs`, `tests/eve/contextual_rail_active_zone.test.mjs`, `tests/eve/history_shortcuts.test.mjs`.
2026-09-25 Active-tool stop contract: a running rail entry supplies its original target and capture source through the existing invocation gateway, independently of current selection or virtual context. `ui.play` honors explicit stop instead of toggling; project transport uses `ui.project.transport` with `operation: stop`. Media-recording bootstrap retains session `group_id` and clears it after stop. Registry entries contain facts/residence/invocation; presentation belongs to the contextual model. Owners: `eVe/intuition/runtime/eve_intuition/atome_contextual_rail_definition_invocation_runtime.js`, `eVe/intuition/runtime/eve_intuition/media_reader_tool_runtime.js`, `eVe/intuition/tools/core/tool_runtime_bootstrap_transport_handlers.js`.

2026-09-22 Dashboard rail Settings removal: createDashboardActionRuntime exposes activateItemAction and openProjectItem only — openSettings, the openHomePanel injection and the internal home-module bridge are removed — and hitTestDashboardLayout has no settings kind. The Home panel API is unchanged and reachable from the main-toolbar Home tool. Evidence: eVe/documentations/FRAMEWORK_STATE.md.

2026-09-21 Mystic gesture reliability: Mystic opening revision helpers are internal only. closeMysticMenu invalidates pending access reads. updateHover cannot activate after initial release; explicit BevyUI activation remains unchanged. Removed the unused internal capturePointerSession API and blanket assistant canvas blocker. Evidence: eVe/documentations/MYSTIC_GESTURE_VALIDATION_2026-09-21.md.

2026-09-21 Mystic navigation follow-up: Internal Mystic releaseAt receives the captured initial gesture once; old tree handlers are generation-bound. Hover/release selects the normal canonical command action. tool_runtime_dispatch.js normalizes dashboard to desktop and surface_item to project before existing capability checks. Finder uses inlineSearchOpenWithPanel; Settings uses the existing Home panel. No public API added. Evidence: eVe/documentations/MYSTIC_NAVIGATION_VALIDATION_2026-09-21.md.

2026-09-21 follow-up: Internal assistant state separates connected from microphoneActive. The existing main-menu inline-content owner accepts a tool presentation while its external-width owner reserves layout space. ProviderRelay keeps the same authenticated account/server/environment across token rotation and sends subsequent requests with the latest configured token. Validation: eVe/documentations/MYSTIC_ASSISTANT_VALIDATION_2026-09-21.md.

Assistant cleanup: one Atom control, the existing animated/focused ribbon text field, and actual conversation content only; no separate mic glyph/control or empty status/model block. Dock teardown cancels field motion and hold suppression. No public API or renderer was added.

Current assistant gesture and provider activation evidence: eVe/documentations/MYSTIC_ASSISTANT_VALIDATION_2026-09-21.md.

### Mystic internal contracts — 2026-09-20

The procedural material uses surface_parameters/surface_style for shared procedural data and dedicated mystic_tiles/mystic_tile_motion/mystic_tile_colors plus a capture epoch for the two faces. The retired petal mode is removed. Menu entries retain canonical command identities; JSON adds composition, slots and label keys, not a new public command API. Assistant dock controls reuse the existing assistant runtime. The internal toggleInput intent toggles only the canonical input presentation; Mystic uses open rather than toggle. Realtime session snapshots publish microphoneActive from live, enabled input tracks, never from the opening intent. Home provider activation reuses home.key.active.set without reading or rewriting the secret. Acceptance: eVe/documentations/MYSTIC_VALIDATION_2026-09-20.md.


### Internal waveform crop projection — 2026-09-17

No API change is introduced by the crop-entry repair. The existing asynchronous `atome.edit.enter` intent is completed before the next surface gesture is routed, and the established `media.crop.*` intents remain the only gesture path.

Persisted recording kinds are unchanged. The contextual boundary derives `video` from `video_recording`, `audio` from `audio_recording`/`sound`/`audio_waveform`, and `image` from photo/picture aliases before selecting an existing edit owner. Inline SVG continues through the existing vector-edit API.

No public API or persisted-property addition. `source_in_seconds`, `source_out_seconds` and `media_duration_seconds` now derive an internal normalized horizontal `uv_rect` for `audio_waveform`, just as spatial media derives UVs from `source_rect`. Waveform payloads and resource patches accept that existing renderer field; full source peaks remain immutable projection input.

### Media crop properties and internal intents — 2026-09-17

Image and video accept canonical `source_rect: { x, y, width, height }` in source pixels plus `media_width`/`media_height`. Audio and waveform accept `source_in_seconds`, `source_out_seconds`, `duration_seconds` for the kept segment and `media_duration_seconds` for the complete source. Internal scene intents are `media.crop.start`, `media.crop.move`, `media.crop.end`, `media.crop.cancel` and `media.seek`; move/cancel are disposable projections and only end commits. Playback adds the source entry to the local cursor and limits voice duration to the source exit. These extend existing scene, commit, renderer and audio APIs; there is no parallel public crop service.

Crop entry reuses the existing image fit resolver: implicit image fit and explicit `contain` establish a bounded `cover` source window for editing, while explicit `fill` alone keeps the complete source. Group/Molecule double-click continues to emit the existing `atome.edit.enter` intent with the canonical structural kind; no new public intent or persisted edition flag is added.

### Canvas lasso Delete and empty Molecule lifecycle — 2026-09-16

No public API or schema addition. `ui.delete.selection` receives the complete canvas selection even when invoked from the Natural contextual rail; only records explicitly marked `structured_context` narrow Delete to one List/Matrix row. Molecule membership is defined by canonical `parent_id`, not stale derived timeline clips. Native iOS ingestion preserves that field, and the existing Molecule lifecycle removes the owner when its final canonical member is deleted. Historical empty owners remain explicitly deletable through the same action rather than being silently purged at startup.

### Direct Paste routing — 2026-09-15

No public API changes. Internally, `tool.main.copy` and `tool.main.paste` are real momentary proxies to `ui.copy.action` and `ui.paste.action`; they discard the ribbon button's DOM identity, forward canonical selection/project context, and `ui.paste.panel` remains separately registered for long-press history access. The mounted `project_view_<id>` projection is the last-resort current-project resolver when shell globals lag behind. Copy snapshots the complete Molecule subtree from canonical parentage and timeline/member references, while its clipboard group records the selected root IDs. Outside text editing, `pasteFromClipboard` matches the current host copy identity to an internal Atome group or imports the current typed host contents and delegates reconstruction, relative placement, parent/timeline remapping and the single Undo transaction to the existing duplicate owner; the returned source-to-clone map selects only the cloned roots. The existing `drop_position` is the project-space point captured at Mystic opening, including when the pointer visually hits a member of a closed Molecule.

### Transform/lasso/history integration — 2026-09-14

No public API or Atome schema addition. Resize inputs reuse existing scene resize intentions, canonical commit/commitBatch, and the Size action. The contextual rail uses existing `ui.undo.action` and `ui.redo` (there is no new `ui.redo.action`). Lasso deletion uses `ui.delete.selection` with its captured selection IDs and project; Text/Capture/Molecule/Shape callbacks retain the same rectangle context. Empty selections disable Molecule and Delete. Gesture completion and `source_tx_id`/`source_event_id` remain readable journal metadata under existing property authorization.

History commands now accept optional `atome_ids`, allowing one transaction to be undone or redone only for the current selection; omitted IDs retain project-wide transaction behavior. `ui.copy.action` consumes explicit `selection_ids`, and `ui.paste.action` consumes explicit `project_id` plus project-space `drop_position`. These extend the existing commands and clipboard entrypoints without another history or clipboard API.

Native inbound media transfer is owned by local_atome_sync_media and invoked by local_atome_ws_sync before event delivery. It downloads through authenticated Fastify asset-ID lookup, scopes local files by media ownership, and recovers missing previously projected assets on reconnect. Provider-generated images use the ordinary importer; rendering does not own synchronization. RenderAtom retains the explicit media owner through shared readMediaUserId rather than replacing it with local Atome ownership.

Assistant text and Realtime use the action instructions owned by conversation_session and the same authorized MCP schemas. ui.ai.image.generate and ui.draw.edit are available initially; other tools retain progressive discovery. No second tool registry or execution path is introduced.

Conversation persistence returns durable asset references after explicit Keep. The assistant reloads attachment bytes only for an explicit media operation, through existing asset availability/authentication. File upload transfers accept AbortSignal. The authenticated file-transfer temporary namespace is per user on Fastify and Tauri; the database-enabled flag is passed explicitly to the extracted Fastify file owner. Provider billing observations are recorded once at provider_broker, into the shared account-scoped aiQuotaTracker; missing usage does not imply zero cost or a reliable remaining percentage.


The private login/me/provisioning response uses auth_users.authenticatedUserSnapshot to retain the verified phone claim required by the client identity check. This allowlist excludes password hashes and does not change public-directory redaction. The model-catalog cache is account-scoped; first bootstrap discovers remote models through the authenticated provider transport. Media detach revokes local reference access without remote traffic.
### OpenAI authenticated capabilities — 2026-09-10 (acceptance in progress)

`ai-provider` runs on the existing authenticated socket: credential store/status/remove, Responses progress/cancel, models, audio/images and specialized service routes. Status returns only configured state. Realtime connect/send/close use server-created session IDs scoped to the application socket and principal; provider function calls arrive as `squirrel:ai-realtime-event`. Tool outputs require a pending provider call. These are transport APIs; route presence does not constitute product integration of every specialized service.
2026-10-18 Shared OpenAI test seats: with `OPENAI_SHARED_KEY_FILE` set on Fastify, a principal without its own key claims one of `OPENAI_SHARED_KEY_SEATS` (default 10) on its first OpenAI `ai-provider` call, so `credential.status` reports `configured: true` with no client change on Web, Tauri, iOS or Android. An own key always takes precedence. Per-seat daily caps (`OPENAI_SHARED_DAILY_OPS`, `_TOKENS`, `_REALTIME`; voice is metered at `realtime-connect`) answer `insufficient_quota`; a revoked or unseated principal gets `no_ai_key_configured`; `realtime-close` needs no key. The key is never returned, logged or stored in a vault. No public command is added; seats are operated by `scripts/ai_shared_key_admin.mjs` on the server.
2026-10-18 Billing (lot 1): `/ws/api` family `billing`, authenticated principal only. `status` → `{ plan: { productId, tier, source, periodEndMs, storageBytes } | null, credits: { included, purchased, total } }`; `offers` → `{ plans, packs }` from `atome/src/shared/billing_contract.js` (`one.atome.plan.<tier>.monthly`, `one.atome.credits.<n>`, 1 credit = 0.001 EUR of provider cost). Unknown actions answer `billing_operation_not_allowed`. Account creation now returns `payment.productId` and records a `simulated` base-plan period. Store proofs (`apple.verify`, `google.verify`, `stripe.checkout`) and AI/storage debits are not exposed yet.

2026-10-18 In-app purchase (iOS / Android). `billing` family adds `apple.verify` `{ proof: <StoreKit 2 transaction JWS> }` and `google.verify` `{ proof: { productId, purchaseToken } }` for the signed-in principal (restore, credit pack, renewal seen first by the app); both answer the updated `status`. The purchase must belong to the principal: its original transaction already holds the account, or its account token (`billingAccountToken(keyId)`, a UUID from the first 32 hex digits of one of the account's device key ids) names one of its keys; otherwise `billing_purchase_owned_elsewhere`. Account creation: `account-create` and the renamed `phone-link-payment` (challenge purpose `payment`, formerly `phone-link-simulate-payment` / `simulate-payment`) take `payment: { method }` (Web, simulated) or `payment: { store: 'apple'|'google', proof }`, which must be an active plan bought with the creating key; the reply's `payment.mode` is then `apple`/`google`. Store HTTP endpoints (imposed by the stores, like the social OAuth callback): `POST /api/billing/apple/notifications` (`{ signedPayload }`, App Store Server Notifications v2) and `POST /api/billing/google/rtdn` (Pub/Sub push); 200 `{ ok, handled }`, 400 refused, 503 store unavailable so the store retries. Client: `AdoleAPI.auth.paymentStore()` → `apple`/`google`/null, `AdoleAPI.auth.createAccount({ deviceClass, payment })`, `AdoleAPI.auth.payPhoneLogin(payment)` (replaces `simulatePhonePayment(method)`). Native command `billing_store_purchase` `{ productId, kind, accountToken }` → `{ ok, productId, jws }` (iOS, `__ATOME_IOS_NATIVE_INVOKE`, bundled page only) or `{ ok, productId, purchaseToken }` (Android, gated Tauri command `billing_invoke`); refusals `billing_purchase_cancelled`, `billing_purchase_pending`, `billing_store_unavailable`, `billing_product_unknown`. Public errors: `server/billing/store_purchases.js#BILLING_PUBLIC_ERRORS`.

Conversation tools are projected from `ai.tools.list` and `runtime.tools.list`. Runtime arguments preserve action/input/dry_run; each call carries actor/trace/intent/idempotence. Sensitive confirmation remains in existing MCP/AtomeAI owners, bound to reviewed arguments and actor. Temporary conversations become canonical `conversation` Atomes only on explicit Keep. Drawing retouch exposes begin/preview/append/undo/clear/exportSource/exportMask/close without modifying the source. Image Apply delegates to the existing project importer.


### Category drafts and capture presentation — 2026-09-10

Dashboard creation cells dispatch through `dashboard_creation_actions.js` (in a Matrix module, the `header_new` plate of `matrix_collections_runtime.js`). Calendar and Contact use the existing panel-opening context `{ createNew: true, projectId }`; Calendar no longer writes an event before validation. Store and Monitor expose no creation action. News opening and template persistence are preserved.

The capture preview exposes session-scoped `pushFrame` and `dispose` only. Frames must match the session and increase in sequence. Closing the standard panel discards its presentation state without invoking recording stop. Cancellation during an asynchronous panel/source opening releases late resources. There is no new persistence or camera-acquisition API.


### Context scope lifetime — 2026-09-09

`project_view_surface_context_runtime` retains project/navigation identity and context revision through owner resolution and invocation. Old navigation cannot create a container rail under a new project ID; late reads and retained closures become stale. Real Dashboard cross-project return and 15 context/readiness regressions verify this owner.

### Performance sample boundaries — 2026-09-09

`project_view_capture_to_timeline.clipOperation` quantizes measured start/end through existing `time_model` conversion and derives duration from their frame difference. `kernel/collisions` compares sample boundaries using the owning timeline sample rate, supplied by reducers, stretch and block loop. This prevents an artificial overlap between adjacent captured holds, including floating-second addition error. No tolerance, new timebase, clip displacement or alternate recording owner is added.

### Audio upload ownership — 2026-09-09

`createAudioStorage` in `eVe/domains/media/api/audio_core_storage.js` owns `uploadRecordingToFastify`. Recording finalization and durable queue replay consume it through the existing shared audio context. Failed queued upload propagates to the existing facade reporter and does not mark the job done. The write-only in-flight flag and duplicate upload ownership were removed; headers, credentials and upload bytes are preserved. Storage/flush regression: 15 tests passed; final M0/Molecule: 28 suites passed.

### Composition and media contracts — 2026-09-09

combineCanonicalMolecule accepts choice (before/after/front/behind/overwrite/insert), positionSeconds, spatial and optional transactionId. Cut, membership, order and geometry share one canonical transaction. planCanonicalRecordCopies remaps parentage, structural source references and timeline owner IDs. Group source_in_seconds/source_out_seconds restrict a derived recursive plan without mutating child sources. Media APIs export isLocalNativeBackendRuntime (the existing broadened native predicate); all media consumers use that name, including injected Genesis/audio contexts. The unrelated canonical isTauriRuntime predicate is unchanged.

### Current interaction contracts — 2026-09-09

The M/S palette now contains Mute, Solo, All and None; the selection/deletion actions described in the historical 2026-09-08 checkpoint below are superseded. All/None apply the chosen effect to all canonical children. The existing shared palette and horizontal slider own placement and held gestures.

Dashboard News adds fixed clock/weather projections ahead of scrolling News. Weather uses the existing Finder geocoder and shared panel editor/buttons; external readings have a disposable lifecycle. Guided creation uses the in-place Dashboard creation grid and canonical project/News creation. Project schema `project_intent` declares family, goal, draft status and intended audience; publication remains private. Shared button `wrapLabel` passes `wrap_width` through tree normalization/projection to the common text layout owner, preserving font size.

Local/footer timeline progress shares the authored container axis. Composite preview mix uses the same factor as transport; expanded row gaps inherit the parent branch color. Normal video activity is bounded by the decoded source window; Performance holds are explicit plan semantics. Current evidence and remaining acceptance are in `eVe/documentations/INTERACTION_VALIDATION_2026-09-09.md`.

### M/S factors and column gestures — 2026-09-08

`ATOME_MIX_PROPERTY_SCHEMA` extends the shared core visual/audio/container schemas with boolean `mute`/`solo` and 0–1 `mute_strength`/`solo_strength` (default 1). `project_view_mix_projection` derives inherited Mute and sibling Solo factors from canonical records. Source opacity/gain remain unchanged; the engine applies gain once. Fully muted sequential entries are skipped; Solo preserves order and duration. `transport.updateMix` consumes committed property changes.

`project_view_mix_controls` uses shared menu buttons, icon resolution, slider and Delete module loading. The existing selectable-list fixed row exposes M/S gestures. Web `mix_strength_v3` verifies long-press choices, multiple solos, both vertical paint directions and horizontal slider at 50 percent; inspected pixels show attenuation. Select All resolves the full container through the canonical loader. Delete All cold-start acceptance, off-screen/nested scope, media audio and single-item transport remain pending.


### Live Mute event and restoration — 2026-09-08

`project_view_surface_events` reads canonical `event.payload.props` for both Mute transitions. The recursive transport recompiles its input records at the current playhead instead of permanently filtering its leaves. The plan carries reusable random orders; entirely hidden containers stay empty. Web `mute_live_fixed_v4` verifies live mute/unmute with actual viewer pixels. Solo, strengths, audio and painting remain pending.


### Shared Performance capture — 2026-09-08

`project_view_capture_to_timeline.toggleProjectPerformanceRecording` owns arm/stop/persist for Natural, List and Matrix. The recorder retains its project/container scope; Natural selection uses the existing item trigger with a held lifetime. Contextual rails reuse `projectViewRecordToolDefinition` and the existing recording-state event/pulse. This is separate from media/property recording. Web `natural_performance_v1` verified initial silence, 10.31/2.07-second holds, two clips and persisted replay in List. Direct Natural replay and media-end frame holding remain open.


### Selection playback scope — 2026-09-08

`compileProjectViewTransportPlan` and transport.load accept optional selectionIds. The plan and transport snapshot expose the requested scope; childOrder remains the canonical pruned root order. `playProjectViewSelection(selectionIds)` delegates to the current surface context. Selecting an identical playing scope toggles it off. The former inferred prompter snapshot field was removed after its consumers were replaced by activeLeafRecords.

### Performance capture controls — 2026-09-08

`projectViewLevelRailDefinitions` exposes `recording: true` on the active capture tool. The contextual tool model uses the shared recording color token. 2026-10-09: `createRecordingIndicatorPulse`, `litToolIconIds()` and `resolveBevyMainMenuLitToolIconIds` are removed. `createLitToolGlowPulse({ patch, nodeIdsFor, now, setTimer, clearTimer, reducedMotion, tokens })` returns `{ glowFor(id, engaged) -> opacity|null, run(), clear() }`; one instance per tree (ribbon, rail), keeping at most one timer. `buildBevyMenuToolNode` accepts `lit` and `litOpacity`; `resolveBevyMenuToolGlowNodeIds(id)` and `resolveBevyMenuToolPaintMarginPx()` are exported by `bevy_ui_menu_surface.js`; `buildAtomeContextualEditTree` accepts `litGlowFor` and `isEngagedTool`. See `### 2026-09-24 — Lit tools: single residence and pinned rail zone`.

### Structured drop presentation contract — 2026-09-08

`armStationaryAbsorb` accepts `zone` and optional `onProgress` in addition to the existing target/callback/clock dependencies. A changed zone rearms the dwell. `clearStationaryAbsorb` resets progress and releases the timer. `hasStationaryAbsorbOverlap` gates both List and Matrix combination releases. `tileMediaCardNode` accepts an optional base `zIndex` (default zero) and preserves the relative order of its preview and label.


Vector/style checkpoint (2026-09-08): the contextual BevyUI tree owns SVG point handles; the detached SVG model and canonical gesture commits remain the source of editing behavior. Public hasContext/isEditing methods delegate to the same contextual owner. Shared color conversion provides RGBA handle colors. vector_handles_v4 verifies real handle movement and inspected pixels. Whole-object SVG Color no longer reads DOM hosts or an unselected legacy layer context; its targeted contract test passes, with later Web whole-object color acceptance in vector_structured_color_v1.

Interaction contracts (2026-09-08): contextual entries expose contextLevel selection/edition, hasContext(id) and edition-only isEditing(id). Shared BevyUI text style.rich_text carries canonical spans and active selection through normalization into overlay records; span font sizes are scaled with preview geometry. Canonical selection dispatch updates getCurrentSelectionIds before notification. ui.draw.brush.type selects round/flat and ui.draw.opacity.apply uses the shared percentage slider. Transient cumulative selection does not introduce a durable Atome field. Transport read returns its stopped snapshot without allocating a media session before first use.


Deletion hierarchy repair (2026-09-08): `delete.js` routes every selected
Atome through the existing Molecule lifecycle, regardless of selection size.
Selected descendants are consumed by selected ancestors only once. A deleted
parent is not an active Molecule owner; surviving children use the existing
BlackHole commit without reviving the parent. The shared
`isDeletedRuntimeState` predicate remains owned by
`tool_runtime_molecule_mutation.js`. Whole-Molecule deletion in
`tool_runtime_molecule_structure.js` builds one parent index, traverses all
live descendants, validates modifiability before its atomic commit and closes
all removed Molecule timelines. No renderer or alternate mutation owner.

History input consolidation (2026-09-07): default keyboard shortcuts dispatch canonical Undo/Redo commands and leave editable text to its own history. The legacy HTML panel no longer owns keyboard undo. Undo refreshes the persisted journal and excludes transactions already undone; depth transactions remain parent-preserving and reading-order-independent. Canonical failures propagate through tool results. See tests/eve/history_shortcuts.test.mjs and tests/eve/timeline_undo_source.test.mjs.

Transport and history continuity (2026-09-07): explicit state-current get/list operations always reach the selected adapter; transport availability no longer substitutes a successful empty result after a failure. Explicit tool selections share one alias resolver (selection_ids, selectionIds, ids, atome_ids, atomeIds). WebSocket request identifiers survive retries. Native history undo/redo uses the existing history/source_tx_id protocol and event commit batch, without a new public API. Unsupported historical transactions lacking authoritative preimages fail explicitly. Tauri profile persistence never waits for remote authentication. Project list presentation propagates its authoritative source error and does not merge stale secondary results.

Workspace order intent (2026-09-07): existing ui.zorder.up/down/front/back commands resolve an explicit selection before the active target and commit one parent-preserving Atome.commitBatch with history and realtime options. Internal persistLevelOrder/projectRecordsWithOrder accept orderKind: playback (hierarchy_order only) or depth (visual stack aliases only); visualStack coupling is removed. The contextual palette state remains transient and restores playback projection when cleared. No new public command, persisted field, cache or renderer is introduced. Dashboard activation errors restore a non-transitioning Dashboard and produce the shared localized error presentation.

Internal Capture provenance contract (2026-09-04): a Capture definition keeps
the caller's `presentation` and structured `source` through its nested gateway
invocation. Main-menu audio/video feedback therefore targets the canonical
BevyUI tool that initiated the session instead of a synthetic Capture layer.
No public command or persisted field changes.

Internal drag/realtime contract (2026-08-29): repeated scene
`applyGestureFrame()` calls for one gesture/Atome collapse to the latest visual
payload per animation frame; `flushGesture()` applies any remaining visual frame
before persistence/final mutation completes. Realtime metadata already marked
`realtime_dedup_checked: true, realtime_dedup_ignore: true` suppresses the paired
project-scene projection. Public Atome, gesture and realtime APIs are unchanged.

Contextual tools/text repair (2026-08-28): declarative menu entries consume their
dedicated registered command; only definitions with local interaction functions
publish a menu handler. Contextual invocation supplies `target_atome_id`.
Line Splitter commits the active draft, reads canonical project/parent metadata,
slices rich-text spans per line and uses `canonicalMoleculeCommit` for atomic
storage and projection refresh. Empty lines and the first cell's source id remain.
No public command changes. Internally, BevyUI `click` handlers defer text-creation
activation to the terminal browser click; scene text begin accepts an initial
buffer, and hidden-editor handoff carries native selection/composition state.

Internal animated image contract (2026-08-28): AtomeTexture accepts an optional animation descriptor { bytes, source_rect, destination_rect, corner_radius, tint?, opacity? }. Animated resources carry encoded PNG bytes and empty rgba; static resources retain their RGBA contract. PNG acTL is detected from contents, not the filename. WASM receives compact bytes; the existing native texture mapping serializes bytes as JSON arrays for Tauri/iOS. No public Atome property or command is added. Source and output limits are checked; corrupt animations fail explicitly.

Urgent campaign contracts (2026-08-28): the explicit Visualizer intention is
`visual_fullscreen`; the historical ambiguous view-fullscreen name is removed.
It toggles shared-canvas projection state only and never invokes browser or
WebView fullscreen APIs. `ui.play` and `ui.stop` route a selected MIDI Atome
through the canonical selected-media transport.
Line Splitter is the searchable/capturable `ui.text.line_splitter` command with
closed input `{ target_atome_id }` and returns the Molecule id plus ordered text
children. The nonvisual `midi_binding` Atome persists `input`, ordered `actions`,
optional `continuous`, `enabled`, and `order` beneath its contextual `parent_id`.
Its closed core Atome type rejects unknown persistent properties.
Closed Tool Gateway/MCP schemas expose `midi.binding.create/read/list/update/
reorder/enable/disable/delete/learn/remap/execute`. All execution returns through
the Tool Gateway; a failed ordered action returns its index and stops the chain.
`AtomeMidi.receive/route/learn/captureTool/ports/monitor/send` is the normalized
runtime boundary used by production bindings and the diagnostic panel.
`midi_output_runtime.js` is the byte/port/timestamp-only output boundary shared
by Web MIDI, the Tauri `midir` command and the iOS bridge; it also owns
`listMidiPorts()` (`AtomeMidi.ports`, re-exported by the service).
Native MIDI input ports (2026-10-13): Tauri and iOS/AUv3 answer the same
`start_native_midi` command (iOS through `__ATOME_IOS_NATIVE_INVOKE`) with
`{ ok, inputs: [{ id, name }] }`; iOS republishes the list as the window event
`eve:midi-native-ports { inputs }` on CoreMIDI setup changes, and every native
message reaches `AtomeMidi.receive(d1, d2, d3, ts, { id, name })` with its source port.

Initial refresh (2026-08-27): `ToolRegistryV2.refresh()` shares only an in-flight
read and releases it on success or failure; subsequent explicit refreshes reload.
Existing registry and renderer exports remain unchanged. Internal surface APIs
`prepareInitialRenderSurfacePresentation` / `presentInitialRenderSurface` stage
one initial reveal after the workspace's menu and Dashboard have projected.
No persisted property or new public command is introduced.

UI readiness contract (2026-08-27): internal BevyUI mount/update options accept
`refreshTree` to rebuild through the original owner when the surface changes
during preparation. Trees and handlers publish after successful projection;
failure retains the previous tree and rejects instead of clearing/retrying a
stale snapshot. Motion's internal `overlayPosition` is surface-space; ordinary
`position` remains parent-local. No public API or persisted particle is added.
Project activation retains its existing exports, including `syncActiveProjectFlag`,
through the extracted lifecycle owner; Dashboard actions delegate teardown to it.

Transport event consumption (2026-08-27): position-only recursive snapshots
update progress without forcing `refreshCurrentContext`/`enterVirtual`.
Status/active-path changes still refresh the rail, as do legacy object
announcements including refused starts. Repeated active decode-playback
requests do not increment frameVersion; decoded-frame callbacks do.
Public commands and persisted contracts are unchanged.

Shared preview contract (2026-08-27): `recordPreviewNode` accepts internal
`followPlayback` (default true), independently of `showPlaybackProgress`.
False clears the projected `playback_source_atome_id` even if the input record
already carries it; the source Atome is unchanged. Temporal List samples use
false, while live Visualizer/Matrix previews and audio waveforms keep true.
No public transport or persisted Atome property is added.

Status: Initial API map after the Atome open / eVe closed boundary validation.

Video source lookup contract (2026-08-27): the internal
`__EVE_BEVY_VIDEO_SOURCE_FOR_ID__` returns a presentable `HTMLVideoElement`,
the same decoder's retained `VideoFrame` during a pending seek, or null before
any decoded image exists. Presentability includes the retained frame. The
decoder owns its explicit close on replacement/removal; no public transport
command, persisted property, or clock is added.

Current structured playback/reorder API contract (2026-08-22):
`projectViewPlayback.readState()` exposes `armed`, `armedProjectId`, `playing`,
`playingIds`, `playingRecords`, and `scope`; `isItemPlaybackArmed` is the
List/Matrix rail presentation query while `playingIds` remains the only live
row/Visualizer signal. `project_view_reorder_runtime.js` retains the stable
entry point and delegates geometry/timing to
`project_view_drop_intent_runtime.js` and canonical order confirmation to
`project_view_order_runtime.js`. `persistLevelOrder` requires one batch writer
and supplies `project_id`, `tx_id`, `refreshState`, and `realtimeBroadcast`.
BevyUI hit results now expose their logical surface point alongside the hit box;
neither value is persistent state.

Canonical Molecule creation/absorb/extract/ungroup/delete remain public module
exports of `tool_runtime_atome_mutation.js`, including
`deleteCanonicalMoleculeMember({ projectId, moleculeId, memberId })`. The
internal `tool_runtime_molecule_mutation.js`,
`tool_runtime_molecule_timeline.js`, `tool_runtime_molecule_structure.js`,
`tool_runtime_atome_mutation_shared.js`, and
`tool_runtime_atome_duplicate.js` are cohesive implementation boundaries and
do not expose parallel mutation paths. Member Delete removes its clip and
reindexes survivors in one batch; deleting the final live member also deletes
the owner and closes its registered timeline. Structured List/Matrix readers
never expose `__deleted`/`deleted_at` tombstones as project items.

Visual text editing reuses `text.edit.begin`, `text.edit.commit`, the single
hidden editor and the existing Atome contextual rail. Its public contextual
state exposes `railOnly`; an outside hit in the `eve_bevy_ui_project_view` tree
commits unless the hit remains inside `project_view_visual`, while Mystic and
style-panel hits keep the edit session alive. `openProjectViewAtomeMenu` is the
Visual gesture adapter to the canonical Mystic context; List/Matrix item menus
retain `openProjectViewItemMenu` and their surface-item action set.

Project activation is an internal latest-wins operation owned by
`activateProjectWorkspace`. It starts the canonical persisted-mode prefetch
through `project_view_mode_state.js`, loads the authoritative project records
with the internal `viewModePrepared: true` option, then asks that same owner to
restore once after loading. The option suppresses only the loader's redundant
post-load restoration; it is not persistent state and does not create a second
view-mode API. The post-presentation authoritative refresh carries the same
marker because the activation has already consumed its one restoration. An
explicit user choice, including a same-mode Natural choice, persists through
the canonical commit owner and makes any older prefetched value inapplicable.
Project bootstrap uses that same mode owner. `loadProjectAtomes` does not expose
its local Natural projection as ready until the one prefetched persisted-mode
application has completed; this is a presentation barrier, not a second mode
state or an iOS-specific renderer branch. The internal `sourceRecords` argument
passes that load transaction's canonical snapshot through the restored surface,
page normalizer, and initial contextual playback-rule lookup. It is consumed
only for the first mount and prevents redundant native `listStateCurrent` and
`getStateCurrent` calls; subsequent view reads retain the normal canonical APIs.

Current native collaboration contract (2026-08-14): Tauri keeps Axum as its
primary local data API and exposes Fastify only as the configured collaboration
target. `TauriAdapter.sync.configureRemote({ remote_user_id, remote_token })`
binds one authenticated local principal to one authenticated Fastify principal;
`clearRemote()` removes that in-memory binding. The remote bearer is never
returned by the command, written to SQLite, or logged. A surviving WebView
cookie is insufficient after a native restart: `ensureFastifyToken()` obtains
an explicit per-user Fastify token and reconfigures the existing native worker.
Local and Fastify UUIDs may therefore differ without weakening either
authentication boundary. `AdoleAPI.projects.setCurrent` stores the preference
under the authenticated logical session even when an already-authorized native
project projection reports its mapped local owner UUID.

Current Conditions API contract (2026-08-14): the same frozen open service is
available as `window.atome.conditions` and `window.Squirrel.conditions`. It
exposes `properties.discover`, `sources.register/list`,
`computedProperties.save/list/remove`, `query.once/watch`,
`lists.create/get/list/resolve/watch/freeze/remove`, `sets.*`, `bindings.*`,
and the lower-level evaluation compatibility surface. Sets, computed criteria,
lists and bindings persist as canonical Atomes. Server queries and discovery
use `Atome.queryConditions` over the existing WebSocket authority, with ACL
filtering before evaluation/projection. Security bindings are revision-pinned
and require explicit reauthorization. MCP exposes the corresponding discovery,
query, computed, list, set, binding and evaluation operations under
`conditions.read`/`conditions.write`; mutations keep the existing confirmation,
proposal, audit, capability and idempotency policy. Full schema and examples:
`atome/documentations/conditions.md`.

Current project/global-state and playback API contract (2026-08-11): `Atome.commit({ scope: "global", ... })` explicitly persists an event outside every project. The marker is stored in the event payload and clears `state_current.project_id` in Fastify, Tauri, and iOS, so a rebuild reproduces the same global projection; omitting `scope` retains current-project inference. `readSelectedProjectMediaPlaybackState(atomeIds)` is the closed eVe playback reader and returns `playableIds`, `activeIds`, `anyPlaying`, and `allPlaying`. `SELECTED_PROJECT_MEDIA_PLAYBACK_STATE_EVENT` is the sole projection-refresh event for Mystic and the contextual footer. `stopProjectMediaPlaybackForProject(projectId)` is the media-reader-owned project transition entry and stops only media belonging to the outgoing project.

Current legacy-principal file API contract (2026-08-11): `reconcilePrincipalFilePath` accepts `data/users/<legacy-id>/...` only when `principal_identity_aliases` maps that exact legacy id to the authenticated owner. It atomically copies into the canonical principal home, retains the source, updates `file_path`, and records an idempotent `principal_file_migrations` journal. It never searches by basename or accepts a foreign alias.

Workspace entry API: `openWorkspaceDashboardWithProjectBootstrap({ source, ensureProjectReady, readBootstrapPresentation })` in `user_workspace_surface_runtime.js` is the internal canonical orchestration route for authenticated and anonymous boot. It resolves project readiness through `project_bootstrap.js`, then resumes a valid saved `current_project_id` directly when the existing `workspace.startup_view` is `project`. Both boot loads of the project — `project_bootstrap.js#ensureCurrentProject` and the resume reveal `showPreparedProject` — use the canonical `staleFirst` path, so publishing project readiness never awaits the authoritative read: the load transaction projects canonical local state, publishes readiness, and schedules its one forced remote refresh after `eve:boot-presentation-ready`. An unreachable server therefore cannot hold the native launch surface, and the resume reveal must never be handed a balanced load. First use, an invalid/forbidden project, or a failed reveal opens the Dashboard explicitly. No second session store or project state exists. Results expose `route: "project"|"dashboard"` and `resumed` for presentation telemetry.

Project activation API (2026-09-22): `activateProjectWorkspace(project, { force = true, staleFirst = true })` in `eVe/intuition/matrix/core/project_workspace_activation_runtime.js` is the single route every user-facing project open uses (Dashboard `dashboard_actions.js`, Finder `bevy_panel_finder_runtime.js`). It is local-first: the canonical local snapshot is projected and readiness is published without waiting for the authoritative read, which the load owner refreshes once after `eve:boot-presentation-ready`. A caller that genuinely needs the authoritative read first — and the empty-local recovery — still reaches the balanced route through an explicit `staleFirst: false`; an unreachable backend must never hold a user-initiated project open.

Workspace surface persistence contract (2026-09-22): the last presented surface is the user-profile value `preferences.workspace.startup_view`, owned solely by `eVe/domains/dashboard/workspace_surface_preference.js`. `dashboard_workspace_mode.js` calls `rememberWorkspaceSurface(surface)` at every real surface change (`dashboard` or `project`, never `transition`); the call publishes `window.__eveProfilePreferences.workspace.startup_view` synchronously and then persists through the canonical profile owner (`upsertUserProfile`, `eventSource: 'workspace_surface'`) on a serialized chain. Boot reads it via `readStartupView()`, bounded by `waitForWorkspaceSurfacePreference()`; `project_bootstrap.js` no longer defines a local reader. `window.__eveStartupView` stays the explicit focused-contract override, the default is `project`, and a guest session records nothing. Any consumer that rewrites profile preferences must preserve `preferences.workspace` or it clears the recorded surface.

iOS boot bridge (internal, version 1): `swiftBridge` accepts `bootPresentationReady` with `route`, optional `project_id`, `presentation_ms`, `interactive_ms`, and the presentation evidence of that route. The `project` route carries the verified Main Toolbar state (`main_menu.active` / `main_menu.tree_mounted`); the `dashboard` route carries `workspace.route_surface=dashboard` with `scene_project_id` and `mounted_nodes`, because the Dashboard entry suspends and unmounts the main menu on purpose and must never claim one. `readWorkspacePresentationEvidence()` in `user_workspace_surface_runtime.js` is the single owner of that Dashboard evidence and reuses the predicate already proven before `dashboard.presentation_ready`. `waitForBootPresentation` watches until the route evidence is satisfied, re-arming with a wider delay instead of expiring, and it tells the native watchdog nothing extra, so a workspace that never presents is still reported as stalled. `bootAuthenticationReady` is the unauthenticated login-shell counterpart; it releases the native overlay so credentials remain operable but does not claim workspace readiness. The native report augments the message with monotonic milestones and the aggregate `atome://` request/byte/missing summary. Boot failure is progress-based: the watchdog permits 20 seconds before navigation begins, then fails only after eight seconds without a native or JavaScript milestone; every milestone refreshes that active allowance. A WebContent termination remains terminal until explicit native Retry, which stops the prior load and starts exactly one new navigation; there is no automatic reload loop or absolute elapsed-time failure.

State-current boot reads preserve `atome_type` and `exclude_particle_keys` through the unified adapter, local retry, CoreDevice/AiS handler, and remote backend route. Broad reads are paginated with a hard 250-record page ceiling; tool catalogues request pages of 100 and identical concurrent reads are coalesced. Derived `tool_ui.activity.select.*` records are runtime projections and are excluded from durable tool-catalogue hydration without deleting historical state.

Current assistant API contract (2026-08-09): the long-press assistant uses `createVoiceAssistantSessionController` over the shared `Squirrel.voice` service and requires `executionTransport: "mcp"`. Session creation fails closed with `voice_mcp_bridge_unavailable` unless `handleAtomeMCPRequestAsync` resolved the MCP bridge. AI tool steps are executed only through `mcp.toolchains.execute -> ai.tools.call`; runtime creation and modification use `atome.create` or canonical `runtime.tools.call`/`runtime.tools.batch_call`. `resolveActiveAiProviderConfig` reads only the one profile provider explicitly marked `active` and resolves its secret from the encrypted token vault; missing, ambiguous, or unconfigured active providers are errors.

Current mobile performance API contract (2026-07-17; supersedes older preview/warmup details below wherever they conflict):

- `AdoleAPI.projects.list(options?, callback?)` omits the heavy `preview_url` particle by default and accepts `{ includePreviewSources: true }` only as an explicit compatibility opt-in. The unified list request carries `exclude_particle_keys`; Tauri SQLite, the iOS local SQLite server, and Fastify/PostgreSQL exclude those keys before record serialization.
- Dashboard adapters do not convert a missing preview into permission to capture every project. Only `forceCurrentProjectPreview:true` captures the active project and publishes the result after canonical persistence. Backend/list failures are observable rather than normalized to `[]`.
- The browser renderer surface DPR is capped at 1.5; preview DPR is capped at 1. Hidden decode video sources suspend on Dashboard workspace mode and resume only remembered requested playback. Reactive Winit redraw is strictly event-driven through explicit wake messages and has no idle cadence.
- iOS `FileSyncCoordinator.syncAll(force:)` remains the internal explicit propagation boundary. `FileSystemBridgeDeletion.swift` delegates to `FileSystemDeletionTransaction.swift`, which requires coordinator access, successful `removeItem`, and confirmed absence before it may report success, create a tombstone, or request one sync; partial multi-delete marks only confirmed removals. The periodic `startAutoSync`/`stopAutoSync` surface is removed; ordinary local HTTP GET delivery cannot invoke filesystem synchronization.

Current account-provisioning contract (2026-07-30): Fastify owns the sole remote account creation/link action, `auth/account-provision`, on `/ws/api`. It requires `account_provision` intent, a bounded-expiry idempotency operation id, Fastify credentials, and the configured server-identity fingerprint; it never accepts a local principal as remote authentication. `AdoleAPI.auth.provisionAccount` is the open adapter entry. `startGuest` and `leaveGuest` are local-runtime entries: a guest UUID v4 is local only and has no Fastify token. Confirmed `adoptGuestWorkspace` uses the `guest-adoption` WebSocket family (`prepare`, `import`, `stage-file`, `finalize`) with one UUID v4 operation, manifest and payload digests. Fastify persists the journal through `prepared`, `importing`, `committed`, and `completed`; file staging is explicit and collision-safe.

Current surface-registry contract (2026-08-15): `server/wsSurfaceOperations.js` owns the
`surface` family on `/ws/api` (`announce`, `list`, `ping`, `retire`) and the
`surface-presence` push; `server/wsApiState.js` owns the registry itself
(`wsApiSurfacesByUserId`, `attachWsApiSurface`, `detachWsApiSurface`,
`listWsApiSurfacesForUser`, `wsSendJsonToSurface`) alongside the connection registry it
refines. A surface is one renderable device seat identified by a client-persisted UUID v4
that survives reload and reconnection — `connection._wsApiConnectionId` is not that
identity and stays server-internal. A surface id is only ever interpreted inside the
announcing principal's namespace, never accepted as an identity of its own, so it cannot
address or impersonate another account's seat. The newest socket announcing a given id
owns it; a stale socket closing afterwards cannot evict the live entry. The registry is
in-memory and Fastify-only: local Tauri/iOS servers see a single device and cannot relay,
so `AdoleAPI.surfaces` (`atome/src/squirrel/apis/unified/adole_api/surfaces.js`) always
speaks to `FastifyAdapter`. It re-announces once per transport `connectionGeneration`,
on `squirrel:user-logged-in`, and on a 30 s generation-comparison heartbeat; anonymous and
guest sessions never announce.

Current teleport contract (2026-08-15): `atome/src/shared/teleport_state.js` is the sole
owner of teleport state semantics — 8 states, an explicit transition table that refuses
any unlisted jump, and pure patch builders. It is shared, not server-side, because the
server decides transitions while the renderer decides whether a surface paints the object
or a residual proxy; a second copy would let them disagree about where an object is.
`server/wsTeleportOperations.js` owns the `teleport` family and the pending-offer map;
`atome/src/squirrel/teleport/teleport_manager.js` is the renderer-side owner and never
mutates teleport properties itself. Teleport state is carried by `teleport_*` particles
committed in the owner's vault (`userVaultRouter.commit`, then the sync runtime's
`publish`; since 2026-10-20, the shared-database `commitAtomeEvent` held no user object),
so per-property ACL, history, undo and realtime broadcast are inherited rather than
reimplemented — no table and no transport is added. `ui.teleport.mode` (`{ active? }`,
toggles when omitted) is the lit teleport mode of the canvas and of the project List:
drags pushed past the visible edge are sent through `resolveEdgeIntent(atomeIds, edge,
projectId)` (one resolution per push: several destinations raise one
`squirrel:teleport-destination-choice` carrying `atomeIds`, and
`openDestinationPicker({ atomeIds })` sends every object on the one choice);
`active: false` returns what it sent.
Two-phase is mandatory: `offer` writes `TELEPORT_PREPARING` but must not touch
`teleport_surface_id`; only an ACK from the addressed surface moves it, and
`LOCAL → REMOTE` is not a legal transition. `cancel` is bound to the source surface and
`decline` to the target surface — a same-account teleport has one principal on both ends,
so principal-level checks are insufficient. Losing a surface rolls back offers addressed
to it and marks objects it hosted `DISCONNECTED`; it never returns them silently.
Cross-user teleport is refused with `teleport_cross_user_not_authorized` until the
permission model exists.

Current remote-control contract (2026-08-15): `server/wsRemoteControlOperations.js` owns
the `remote-control` family and its in-memory session map. Remote control is a separate
brick from teleport and must stay one: a surface can drive another with nothing
teleported, and the two meet only through the surface registry. A session id is not a
capability — every relayed input event re-checks that the sender's principal *and*
surface are the session's controller, so a captured envelope replayed from another
socket does nothing. Revocation is immediate with no grace period, the controlled
surface may always revoke, only granted capabilities are forwarded, sessions expire, and
no session survives the loss of either surface. Same-account sessions are granted on
request (§11.1) but the controlled surface is always notified; cross-user control is
refused with `remote_control_cross_user_not_authorized` until the permission model
exists. `atome/src/squirrel/teleport/remote_control_manager.js` owns the renderer side
and coalesces pointer deltas (summed, never dropped); `eVe/intuition/tools/trackpad.js`
is the toolbox tool and must never create a surface, open a panel, or request
fullscreen.
Remote preview is on-demand only: one `preview-request` yields exactly one still from
the controlled surface (`atome/src/squirrel/teleport/remote_preview.js`), bounded to
2 MB. There is no subscription and no cadence — repeating it is the caller's decision,
which is what keeps §30 ("not a screen-share clone") true by construction. Only the
target may send a frame; a controller cannot push an image onto the screen it drives.
Remote keyboard is applied to the focused element and is opt-in on the controlled
surface (`setRemoteKeyboardEnabled`, default off): a granted capability authorises the
sender, it does not force the receiver to accept synthetic keystrokes.

Current cross-user surface-grant contract (2026-08-15): `server/surfaceGrants.js` owns
the capability vocabulary and `hasSurfaceCapability`, the single authorization point for
every cross-account teleport or remote-control action; `server/wsSurfaceGrantOperations.js`
owns the `surface-grant` family. Grants live in their own `surface_grants` table, not in
`permissions`: that table is atome-scoped and its `conditions` column belongs to the
versioned Conditions schema, which would normalise capability payloads away. The eight
capabilities (`teleport_receive`, `teleport_display`, `teleport_manipulate`,
`teleport_persist`, `teleport_return`, `remote_pointer`, `remote_surface`,
`remote_command` — 2026-10-12) are checked
independently — accepting an object never confers control of the device. Only the surface
owner decides, may grant less than was requested but never more, and may revoke at any
time; a pending request authorizes nothing and a denial is recorded rather than
forgotten. `hasSurfaceCapability` must consider every live grant, not the most recent
one: concurrent grants carry different capabilities and reading only the latest silently
revokes the others.

Current property-privacy contract (2026-08-15): `database/adole_privacy_rules.js` owns
profile output rules (§12.5 of `todo/1- condition.md`) in the dedicated
`property_privacy_rules` table. `permissions` cannot express them: `principal_id` is NOT
NULL with a foreign key, so every row names one reader, while a profile rule applies to
whoever reads. The rule is consulted by `canRead` **after** a permission already allowed
the read and is **restrictive only** — it can narrow, never grant, or a privacy feature
would become a privilege-escalation path. Absence of a rule changes nothing; a corrupted
rule fails closed; the owner is never hidden from their own data; only the owner may set
or enumerate rules. Wire actions: `share/privacy-rule-set`, `share/privacy-rule-list`;
client entries `AdoleAPI.sharing.setPrivacyRule` / `listPrivacyRules`.

Current production identity API contract (2026-08-10): `ensureProductionSecureConfig` is the updater's only entry for JWT/cookie secrets and the persistent account-provision signing identity; `ensureServerIdentity` validates or creates that identity, and `backupServerIdentity` copies the validated pair into the update backup. These are deployment-internal APIs. Runtime and tooling reuse `createServerIdentityKeyPair`, `createServerIdentityId`, `computeServerIdentityFingerprint`, and `validateServerIdentityKeyPair` from `server/serverIdentity.js`; no updater or generator may implement a parallel key/fingerprint algorithm.

Purpose:

- Identify verified API families, ownership, and stable entry points.
- Make the Atome open / eVe closed boundary explicit before new implementation work.
- Provide an orientation map. The exhaustive public, semi-public, and internal API list is a separate execution task.

Mandatory Use:

- Before adding or changing an API, consult this file and `maps/CODEMAP.md`.
- Verify the referenced source module directly before relying on a method or route.
- Update this map when ownership, exposure, route shape, or boundary status changes.
- Do not promote an eVe closed API into Atome without an explicit open contract.

## Mandatory Pre-Implementation Gate

No API, route, runtime global, MCP capability, tool exposure, store contract, persistence path, service facade, or exported method may be added or changed until the relevant maps have been consulted:

- Use `maps/CODEMAP.md` first to locate the owning source area and verify that no reusable implementation already exists.
- Use this file to classify the surface as public open, semi-public closed, internal, or `Status: To verify`.
- Use `maps/DESIGN_MAP.md` when the API affects product UI, visual factories, panel behavior, tool visuals, generated styling, or design tokens.
- Use `maps/ARCHITECTURE_MAP.md` when the API affects dependency direction, command/history flow, effectful operations, lifecycle, sync, security, or cross-layer access.

Implementation may proceed only after the API owner, visibility, boundary status, effect model, and required map updates are known.

## Boundary Rules

Atome open APIs live under `atome/`, `server/`, and `database/` when they are product-neutral. They own core Squirrel APIs, authenticated storage, Atome object/event/state contracts, product-neutral communication services, security, AI/MCP, voice, audio, sync, server routes, and database adapters.

eVe closed APIs live under `eVe/`. They own product UI, private tools, product stores, Molecule/MTraX workflows, media editing runtimes, panels, branding, and product composition.

Atome must not contain eVe UI, private product workflows, or product-only tool composition. eVe must not duplicate generic Atome security, server, sync, or cross-platform contracts.

## Explicit Open / Closed API Contract

The renderer cadence (one animation-frame request per wake), page-scoped version-manifest refresh, and palette direct-motion batch are internal rendering contracts. They add no browser public API, DOM proxy, canvas, mutation authority, or alternate renderer; consumers continue through the existing BevyUI `updateTreeMotion` and shared project-scene projection APIs.

API classification is mandatory before an API is reused, exposed, moved, or extended:

- Public open APIs are product-neutral Atome, server, or database contracts intended for framework use, AI/MCP access, durable state mutation, synchronization, or platform runtime behavior.
- Semi-public closed APIs are eVe product runtime contracts that may be reused inside eVe and by approved Atome AI/MCP boundary calls only through capability checks, runtime registration, or explicit injection.
- Internal APIs are implementation details of their owning layer and must not be imported across the Atome/eVe boundary.
- `Status: To verify` means the source exists but its boundary stability is not established; new work must inspect the source module before depending on it.

Cross-boundary API rules:

- Atome may call eVe capabilities only through registered runtime tools, injected callbacks, or documented boundary modules.
- eVe may call Atome APIs directly when the Atome API is product-neutral and documented here.
- eVe product stores, panels, tools, Molecule/MTraX runtimes, and design factories must not become implicit Atome APIs because they are exported or attached to `window`.
- Product-named server routes are open infrastructure only after route ownership, security, naming, and replay semantics are reviewed; until then they remain boundary debt.
- Promotion from eVe closed to Atome open requires an explicit contract, deterministic mutation path, MCP compatibility when relevant, tests, and updates to `maps/CODEMAP.md`, this file, and `maps/ARCHITECTURE_MAP.md`.

## Verified API Families

### eVe Dashboard Runtime API

Ownership: eVe closed.

Primary sources:

- `eVe/domains/matrix/matrix_collections_runtime.js`
- `eVe/domains/dashboard/dashboard_actions.js`
- `eVe/domains/dashboard/dashboard_data_adapters.js`
- `eVe/domains/dashboard/dashboard_data_controller.js`
- `eVe/domains/dashboard/dashboard_data_controller.js`
- `eVe/domains/dashboard/dashboard_environment.js`
- `eVe/domains/dashboard/dashboard_glass_material.js`
- `eVe/domains/dashboard/dashboard_card_records.js`
- `eVe/domains/dashboard/dashboard_weather_card_records.js`
- `eVe/domains/dashboard/dashboard_weather_preferences.js`
- `eVe/domains/dashboard/dashboard_preferences.js`
- `eVe/domains/dashboard/dashboard_record_primitives.js`
- `eVe/domains/dashboard/dashboard_workspace_mode.js`
- `eVe/domains/rendering/project_preview_runtime.js`
- `eVe/domains/rendering/project_scene_runtime.js`
- `eVe/domains/rendering/surface_runtime.js`

Exposure:

- JavaScript module export: `createMatrixCollectionsRuntime({ atomeId, projectId, treeId, readBounds, normalized, interactive, onZone })` (`eVe/domains/matrix/matrix_collections_runtime.js`, used by `matrix_module_runtime.js` for non-template Matrix atoms) returns `{ state, treeId, open, render, close/destroy, toggleCategoryFilter, createDefault, activateCategory }`; `onZone({ zone, kind, category, item })` (zones `header_filter`, `header_new`, `item`) lets the project's Interactions answer before the Dashboard behaviour. `dashboard_bevy_ui_tree.js` exports only `frameRecord` and `dashboardNodeForRecord`. The full-screen Dashboard runtime, its exports and its runtime global were removed on 2026-10-24.
- Internal rendering constant: `DEFERRED_TEXTURE_BATCH_SIZE` is exported by `eVe/domains/rendering/bevy_media_resource_runtime.js` and consumed by `bevy_ui_image_runtime.js` so Bevy UI `ImageNode` texture hydration and deferred media texture resolution share the same per-frame upload budget.
- Surface interaction hook: `setRenderSurfaceInteractionInterceptor(zone, interceptor)` in `surface_runtime.js`.
- Project scene UI-intent hook: `setProjectSceneUiIntentHandler(handler)` in `project_scene_runtime.js`, registered by eVe boot for `atome.edit.enter`, `atome.edit.activate`, `atome.edit.exit`, and `atome.edit.fullscreen.toggle` across all project render/update paths.
- Tool ids: `tool.dashboard.news`, `tool.dashboard.monitor`, `tool.dashboard.goals`, and hidden future `tool.dashboard.store` (declared only; their handlers went with the full-screen Dashboard runtime on 2026-10-24).
- Entry points: the visible BevyUI main-menu Atome tool toggles the assistant, with long press for text. Its short press opens the eVe home through `openWorkspaceDashboardAndMainMenu`. Successful authenticated and anonymous workspace openings route through `eVe/intuition/tools/user_workspace_surface_runtime.js`, which awaits `closeAllPanels(...)`, attaches the shared canvas to the neutral Dashboard workspace, suspends the internally registered menu through `workspace_main_menu_visibility.js`, and opens the eVe home through `matrix_module_runtime.js#openWorkspaceHomeProjection` (no `creationCategory` route). No browser menu alias or private DOM ribbon handle participates in this route. An explicit project-to-Dashboard transition alone requests current-project preview refresh; boot/auth/anonymous entry never loads a user project. Direct `tool.main.home` remains the user/Home panel route.
- Atome contextual-edit bridge: the module registry in `atome_contextual_edit_registry.js` exposes the closed runtime methods `enter`, `activate`, `exit`, `toggleFullscreen`, and `readState`; `readState()` reports the session-only `suspended` flag and suppresses `menuVisible` outside project mode. There is no window-global footer API.

Boundary status: Semi-public closed eVe product runtime. Dashboard item lists are read-only projections; Calendar, Contacts, and Projects are reached through their existing APIs/adapters. Store is an explicit no-op until its domain is defined.

Effect model:

- The renderer-level `clip_rect` contract applies equally to sprite records and backdrop-glass `Mesh2d` records. `clip.rs` crops the resident backdrop mesh to the visible size and remaps its UVs to the original logical rectangle, so a clipped glass block neither retains an offscreen full-size quad nor stretches its rounded material. Repeated clip updates mutate the resident mesh asset instead of allocating another mesh.
- `dashboard_data_controller.js` owns per-`projectId` dashboard item cache, targeted category invalidation, visible-category hydration, and cache-first category activation. A missing focused-category cache loads that category before treating it as empty, while stale cached categories paint immediately and are refreshed only by explicit invalidation.
- `dashboard_preferences.js` owns only `preferences.dashboard.weather_location` normalization. The retired Home « Dashboard » accordion no longer writes `preferences.dashboard.categories`; the normalizer drops that key on the next profile save and the runtime always shows the five product rubriques.
- `dashboard_data_controller.js` is the single dynamic invalidation owner. Its single retained `CalendarAPI.on()` subscription handles only create/update/delete, invalidates `calendar` for the event's explicit project, reloads the active matching project, and leaves a suspended matching Dashboard dirty until pre-presentation hydration; another project's mutation never clears visible cards or cancels their hydration. The `contacts` category invalidates on the remote public-directory contract (`public_directory_events.js`, `squirrel:directory-invalidated`) and on the local contact population contract (`contact_change_events.js`: `eve:people-directory-updated` from `atome/src/squirrel/contacts/bootstrap.js` and `eve:user-profile-updated` from `profile_api.js`), both coalesced through one refresh closure that drops the cached `contacts` items even while the Dashboard is closed and limits the reload/repaint to an active Dashboard; canonical project Atome lifecycle events (create/update/delete/restore) and any non-Dashboard Atome mutation carrying a project id invalidate `projects` because project card miniatures depend on rendered project contents; and `source_domain: "eve.dashboard"` records invalidate their own `category_id`; unknown deletes invalidate the loaded dashboard categories.
- `dashboard_data_adapters.js` exposes read-only `list(category, { projectId, hydratePreviews, forceCurrentProjectPreview })` and `listMany(categories, { projectId, hydratePreviews, forceCurrentProjectPreview })` for grouped category reads. `generic_record` categories share one explicit-project `state_current(projectId)` read and are split by `source_domain: "eve.dashboard"` plus `category_id`. Calendar lists only dated, non-deleted, unique `CalendarAPI.listEvents({ projectId })` items through `calendar_api.js` so dashboard reads do not initialize the Calendar panel DOM or depend on the implicit current project. Projects are ordered by most recent modification date, creation date, and stable id without mutating Matrix stable order. Default Dashboard boot requests `hydratePreviews:false` and later neutral hydration keeps preview hydration disabled, so project/contact rows appear from persisted metadata only and no missing preview can trigger a background project load. Explicit non-boot preview refresh paths resolve the active id through the canonical `currentProjectId()`/`AdoleAPI.projects` contract, not only through the optional `__currentProject` mirror, and may derive disposable `metadata.project_preview_source`, `project_preview_width`, and `project_preview_height` from the shared WebGPU project preview runtime; when `forceCurrentProjectPreview` is true for the active project, persisted preview metadata is ignored, the shared renderer capture path is invoked again with `forceCapture:true`, and the resulting source is exposed only after `project_preview_runtime.js` persists `preview_url`, `preview_width`, `preview_height`, and `preview_updated_at` through `Atome.commit`; commit failure returns `project_preview_error` without a valid preview source. Project preview runtime must capture from renderer-owned records, prefer current Bevy scene state, merge loaded records only for explicit hydration, and propagate `bevy_project_preview_capture_empty`, pending-resource, or skipped-resource errors instead of substituting icons, DOM screenshots, or empty preview URLs. Contacts combine `collectPeopleDirectory()` with local `eve_contacts_local` payloads using only `id` or `source_contact_id` for card creation and reconciliation; phone, email, and display name remain presentation data. Local entries remain the only editable contacts, the Dashboard list is alphabetical, and the current user is pinned first when available. Contact cards may carry disposable `metadata.user_face` for Bevy projection.
- `dashboard_actions.js` owns the explicit Dashboard item routing table. Project cards keep the canonical workspace activation path, Calendar cards open the existing Calendar surface by stable event id, and Contact cards open the existing Contact surface by `id` or `source_contact_id`; phone, email, and display name are never identity fallbacks. News, Monitor, Store, and any category without a canonical item surface return an inert result and project no detail view. Focused entêtes no longer expose no-op, panel-opening, or project-creation `+` actions. Creation goes through `dashboard_creation_actions.js` (in a Matrix module, the `header_new` plate of `matrix_collections_runtime.js`); `projects` and `news` create through their existing owners, while the `calendar` and `contacts` cells only open the existing editor surface through `openPanelSurface`. That cell performs no Contacts API load, record creation, or category invalidation. Unsupported headers keep the normal activation behavior.
- `renderProjectScene(..., { preserveEphemeralRecords: true })` is an internal rendering extension for late project reconciliation; it preserves ephemeral Bevy overlay records (`mol:lane:`, `mol:clip:`, `mol:kf:`, `mol:playhead`) from the current runtime map and preserves Dashboard overlay records only while the workspace mode is `dashboard` on the neutral scene (`project_scene_record_preservation.js#shouldPreserveDashboardForeground`). Closed or other-project dashboard overlays are never preserved by project refresh, launch, or late reconciliation. Foreground project renders resolve the canonical `project_view_<projectId>` host when no explicit `host` is supplied, so the shared `eve_surface_project` canvas cannot remain attached to `#view` after project activation, reload, import, or project switch. Project media/import stack allocation is owned by `project_scene_stack_runtime.js`; it scans durable project records only, ignores ephemeral overlay records, detects visible Dashboard overlays as an active ceiling, and clamps explicit media/drop positions below that ceiling while preserving order-based stacking among durable project records. It also owns arrival placement: `resolveProjectSceneNextPlacement(projectId, { parentId, width, height })` puts any arrival WITHOUT an explicit position (genesis `createAtome`, media recordings, ribbon import `autoPlace`, menu Duplicate, paste without point = `placement_mode: 'auto_flow'`, pasted plain text) in the first free slot, filling rightwards then the next row, inside the visible project area (`registerProjectSceneFlowViewport`, wired by `project_view_camera_runtime.js` with `readProjectViewVisibleRect`/`revealProjectRect`) or inside the parent page frame; it never overlaps (24 px gutter, short-lived reservations for back-to-back arrivals) and pans the view down when the slot is below it. An explicit point (click, drop, Mystic/context paste or import, `preserve_relative`) always wins.
- Runtime layout, hit-testing, and dashboard render records stay in the same logical project coordinates used by active Atomes. `createRenderTarget()` derives physical offscreen dimensions from logical size times DPR, capped only by an explicit texture limit; project preview capture consumes those physical target limits plus `sourceViewport`, fits the full project viewport homothetically, and includes source viewport dimensions in its cache key. DPR/backing-buffer sizing must not pre-scale the Virtual Scene, dashboard records, or hit-test geometry.
- Dashboard cards have no generic fullscreen detail projection. Item activation must delegate to an existing canonical domain surface or remain inert.
- Generic News, Monitor, and Goals record creation is no longer owned by the dashboard `+` action.
- Calendar dashboard listing consumes the existing `CalendarAPI.listEvents()` item-list response (`items` or legacy `events`) and rejects invalid or explicit error responses instead of silently rendering an empty category.
- Calendar Dashboard reads resolve their data project through `dashboard_workspace_mode.js`; `__eve_dashboard_workspace__` is renderer context only and is rejected before `CalendarAPI.listEvents({ projectId })`. Calendar is not stored in the Dashboard item cache, so open, focus, mutation, and resume all reconcile against the canonical list.
- Generic News, Monitor, and Goals records use the open Atome `record` type with `source_domain: "eve.dashboard"` and a generic `category_id`; no product-specific Atome type is introduced for these domains in v1.
- Calendar and Contacts creation cells open the registered BevyUI `calendar` or `contact` panel surface with `createNew: true`; they create nothing themselves and must not open the legacy HTML panel from the Dashboard creation path.
- Project creation cells delegate to shared Matrix/Adole project helpers through `createProjectRecord()`; the Projects display refreshes from the canonical atome events (no explicit `invalidateCategories` refresh); it does not activate or load the new project. `createProjectRecord({ name })` may receive an explicit internal project name for tests/tools, otherwise `project_default_name.js` creates a localized, human-readable timestamp name and adds a deterministic suffix only for a same-second collision. On successful creation, `AdoleAPI.projects.create(...)` returns the generated project id on the top-level result (`id`, `atome_id`, and `project_id`) so Matrix activation can use the known canonical id even when backend commit acknowledgements do not echo it.

### eVe Workspace Scene Layer API

Ownership: Internal eVe rendering/accessibility contract over the shared project scene.

Primary source: `eVe/domains/rendering/workspace_scene_layers.js`.

Exposure: internal JavaScript exports for workspace layer ids, record normalization, BevyUI tree decoration, workspace accessibility graph generation, and scene diagnostics consumed by project rendering, Dashboard records, BevyUI menu/panels, and `window.__DEBUG__.getWorkspaceSceneState(...)`.

Boundary status: Internal closed eVe. This is not a public Atome API and does not introduce a new canvas, DOM state authority, or alternate renderer route.

Effect model: records are decorated with logical `parent_id`, normalized `properties.layer`, derived render-layer ordering, and `properties.accessibility` when interactive. The stable workspace roots are diagnostic/accessibility roots, not extra visual render records in the Bevy scene stream. BevyUI menu, Dashboard, and panel trees must be decorated before overlay projection so action handlers and focus metadata stay tied to the same tree that feeds the Virtual Scene.

### BevyUI Runtime API

Ownership: Internal eVe rendering target over the shared Atome Bevy renderer.

Exposure:

- Runtime global: `window.eveBevyUiRuntime`, installed by `eVe/domains/rendering/bevy_ui_runtime.js` during eVe boot.
- Public internal methods: `mountTree({ id, surface, tree })`, `updateTree({ id, patches })`, `updateTreeMotion({ id, updates })`, `prewarmTreeImages({ surface, tree })`, `unmountTree(id)`, `hitTestAtClientPoint({ surface, clientX, clientY })`, and `readDiagnostics()`. `prewarmTreeImages` hydrates through the shared bounded cache without mounting, projecting, or storing a second tree; the main menu invokes it outside the click path one palette per idle frame. `updateTreeMotion` keeps geometry and paint on the canonical direct WebGPU operation batch. A text patch regenerates only its affected overlay text resource through the existing incremental project-record projection; the opt-in native BevyUI route expresses the same change as `update_node_text`. The established structural overlay fallback remains available when a record cannot be patched incrementally.
- WASM exports: `apply_atome_bevy_ui_ops(...)`, `read_atome_bevy_ui_diagnostics()`, `drain_atome_bevy_ui_events()`, and the internal browser input bridge `queue_atome_bevy_ui_events(...)`. The JSON operation accepted by `apply_atome_bevy_ui_ops(...)` includes `update_node_text { id, text }` for in-place mutation of an existing Bevy `Text` component.

Boundary status: Squirrel UI definitions remain the canonical source of UI structure and handlers. BevyUI receives normalized disposable trees, hydrates standalone `icon` / `image` sources into WebGPU texture payloads through the shared browser texture resolver before renderer submission, while Dashboard card-media overlay nodes explicitly defer generic hydration so project previews cannot block the structural Dashboard mount and are resolved once by the shared WebGPU deferred-media path, stores the interaction tree in logical CSS pixels, versions and queues overlay renders per tree so only the latest requested render may update the shared project scene and failed operations remain caller-owned without orphan queue rejections, projects the visible product path through non-selectable WebGPU project overlay records under the centralized `__eve_bevy_ui_` prefix, and returns UI intentions such as `activate`, `change`, `input`, `focus`, `blur`, `open`, `close`, `select`, `hover`, `hover_leave`, `press`, `release`, `drag`, `double_click`, and `wheel`; any durable mutation must still route through existing handlers and then `window.Atome.commit` / `commitBatch` when canonical state changes. Browser canvas input is translated by `bevy_ui_runtime.js` through its normalized interaction tree and submitted to the WASM event queue with `queue_atome_bevy_ui_events(...)`, so `drain_atome_bevy_ui_events()` remains the single web drain surface for native BevyUI events. Native BevyUI WASM op submission is opt-in; the default product path must not call `apply_atome_bevy_ui_ops(...)` while the visible route is the project overlay. Prehydrated overlay textures must remain attached through Virtual Scene projection and must not be replaced by re-resolving the original source. BevyUI overlay records are ephemeral, excluded from project preview captures, and overlay updates must not clear existing Dashboard/project scene effects unless an explicit `effects` array is supplied. Overlay projection targets the current foreground workspace scene and removes that tree's stale overlay ids from inactive scenes, so a main-menu remount after a project switch cannot leave records attached to a previous project. The main menu tree is reconciled atomically by prefix so its icon/label records cannot be committed as a stable partial batch. After a geometry remount clears overlay records, bookkeeping is updated immediately and `bevy_ui_overlay_reconciliation.js` schedules one queued reconciliation from an empty overlay baseline if projection fails, while keeping the error observable in runtime diagnostics. Panel `pointer_capture` boundaries consume every canvas interaction phase before project hit-testing without making the full-screen tree root blocking. The runtime must not create a DOM node per component; hidden HTML text editing/accessibility bridges are allowed only for the one active text-entry session.

Viewport diagnostic contract: `read_atome_bevy_web_diagnostics().ui_viewport_width/height` and native UI diagnostics describe the physical viewport of the `IsDefaultUiCamera` used by BevyUI. Offscreen workspace-capture and blur targets are not valid UI viewports even when they were spawned first. The JavaScript render-scale consumer treats a zero pre-initialization value as neutral and may scale only from this canonical camera measurement.

### eVe BevyUI Panel API

Ownership: eVe closed panel projection over the shared BevyUI runtime.

Primary sources:

- `eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js`
- `eVe/intuition/runtime/bevy_panel/bevy_panel_geometry_gesture_runtime.js`
- `eVe/intuition/runtime/bevy_panel/bevy_panel_accordion.js`
- `eVe/intuition/runtime/bevy_panel/bevy_panel_select.js`
- `atome/src/squirrel/components/select_contract.js`
- `eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js`
- `eVe/intuition/runtime/bevy_panel/bevy_panel_layout.js`
- `eVe/intuition/runtime/bevy_panel/bevy_panel_surfaces.js`
- `eVe/intuition/runtime/eve_intuition/panel_surface_runtime.js`

Exposure: existing semi-public closed `openPanelSurface(surfaceKey, context)` and `closePanelSurface(surfaceKey, context)` route registered Bevy panel surfaces to `openBevyPanelSurface(...)` / `closeBevyPanelSurface(...)`. Migrated panels mount disposable BevyUI trees named `eve_bevy_panel_<surface>` on `eve_surface_project`; non-migrated panels remain on the existing registered surface path until they are migrated and verified.

`openPanelSurface` keeps its public signature. The internal Bevy context may carry
`anchor: { rect, edge }`, where `edge` is `bottom`, `left`, or `right`; the
shared layout owner uses it to glue and center the surface against the invoking
tool or rail. Normal openings use measured natural height; explicit resize and
opted-in expansion can use the entire available height. The canonical menu
measure().layout includes the rendered x/y/width/height and surface dimensions;
its getReservedHeight() reports the actual rendered bottom band or zero while
unmounted. The internal tree builder accepts footerTitle independently of the
accessible panel title and composes existing buildFooterContent injections.
Contact uses that injection for transfer and account-creation shortcuts;
contact.transfer.toggle discloses the existing import/export effects in-body.
These are internal presentation contracts; public panel and service signatures
remain unchanged. App safe-area publication is now implemented by the approved Expert Dashboard viewport extension; Contact/panel consumption remains To verify. Color, Font,
and Size are registered shared-canvas surfaces; their writes still re-enter the
existing `ui.couleur.apply`, `ui.font.apply`, and `ui.size.apply` commands.

The temporary development/test-only `ui.dev.panel_lab` tool is not a public or semi-public API. It is registered only when the internal Panel Lab gate is enabled, delegates to the same closed panel route, and must be removed after the shared component migration is complete. Its short activation toggles the Lab through that route; its 520 ms long press is a development-only `window.location.reload()` action and suppresses the matching toggle activation. Native iOS Debug configurations set the existing `window.__EVE_PANEL_LAB__` gate through the shared `WKUserScript` document-start bootstrap only when `-AtomePanelLab` or `ATOME_IOS_PANEL_LAB=1` is supplied; normal Debug launches and all Release configurations do not set it.

Panel Lab supports compact representative matrices for the active migration
packages and retains approved reusable specimens in chronological body flow;
its approved shared
specimens are static body text, a passive horizontal divider, the validated
icon action-button component, the validated passive list row, and the validated
accordion. The accordion is Lab-only: it emits a closed ephemeral intent, holds no
Atome state, and requests canonical post-rebuild scroll reveal through the
closed runtime bridge. The validated Select follows the same closed route:
`select_contract.js` owns renderer-neutral option/value normalization,
`bevy_panel_select.js` composes a fixed-height field and floating option rows
from the available native primitives, and the Lab runtime owns only reset-on-close
presentation state plus `panel_lab.select.*` intents. It exposes no public API,
DOM control, or durable mutation. The choice specimen follows the same
closed route: `toggleable_contract.js` owns the two-state normalization, radio
groups reuse `select_contract.js`, `bevy_panel_choice.js` composes the native
`checkbox`/`radio`/`toggle` kinds around the canonical
`EVE_BUTTON_SKIN_TOKENS.bevyButton` surface, and the Lab runtime owns only
reset-on-close presentation state plus `panel_lab.choice.*` intents. Each control declares
exactly one semantic — independent boolean, exclusive group, or single on/off
value — and the canonical state owner remains the future consuming surface.
The validated table specimen is the first
fluid panel component: `table_contract.js` owns renderer-neutral column/row
normalization plus fluid column-width resolution, `bevy_panel_table.js` composes
the passive native `table` root, and `bevy_panel_runtime.js` hands
`buildContent` the `bodyWidth` it already owns. The specimen declares no intent,
no Lab runtime, no handler, and no state at all; sorting and row selection stay
with a future consuming product panel. The validated
segmented-control specimen uses the closed `normalizeSegmentedControlPresentation`
contract for at least two unique options and a required selected value.
`bevy_panel_segmented_control.js` composes the supported native
`segmented_control` root with native button segments; the active runtime has no
specialized native segmented widget. Its Lab runtime owns only reset-on-close
presentation state and emits `panel_lab.segmented.*` intents. It exposes no
public API, DOM control, MCP command, or durable mutation; a future product
surface remains the canonical selected-value owner. The in-review selectable
list follows the same closed boundary: `selectable_list_contract.js` requires
an enabled selected option, `bevy_panel_selectable_list.js` composes interactive
native button rows because `row` has no interactive kind, and the Lab runtime
emits only `panel_lab.selectable_list.*` intents. It exposes no public API, DOM
control, MCP command, or durable mutation; a future product surface owns the
selection. `normalizeMultilineInputPresentation` is the closed renderer-neutral
newline-preserving draft contract; `bevy_panel_multiline_input.js` reuses the
shared editable text tree and the WebGPU layout's opt-in wrapping, while its Lab
runtime retains only close-reset ephemeral draft/caret/scroll state. The closed
`normalizeScopeChipPresentation` contract accepts caller-owned multi-selection;
`bevy_panel_scope_chips.js` composes native buttons with Select-derived paint and
its Lab runtime emits only `panel_lab.scope_chip.*` intents. Neither adds a
public API, DOM control, MCP command, durable mutation, or business-state owner.
`normalizePanelStatePresentation` is the closed renderer-neutral
Squirrel API for passive `empty`, `loading`, `error`, and `permission_denied`
presentation. It requires localized title/message text; `bevy_panel_state.js`
projects the supported non-interactive native `empty_state` kind. The static
Panel Lab matrix has no intent, local state, MCP route, DOM control, or durable
mutation; future product surfaces remain the canonical status owner.
`normalizeNumericInputPresentation` is the closed renderer-neutral Squirrel API
for a finite caller-owned numeric value, its inclusive range, positive step,
localized unit, and disabled presentation. `numericFieldNode` composes native
`button` and `number_input` nodes only; its Lab runtime emits closed numeric
field intents for direct edit, stepping, and scrub drag. It exposes no
public API, DOM control, MCP command, or durable mutation; product surfaces own
the business value and any command mapping.
The migrated Size and Font panels add no public API. `ui.size.panel`,
`ui.font.panel`, `ui.size.apply`, `ui.font.apply`, the existing input aliases,
and the `eveSizeApi` read/set bridge are preserved. Size direct/step/preset and
scrub intents converge on `applySizeToSelection`; Font converges on
`applyFontToSelection`. Bevy panel intentions invoke those existing public ids
through `invokeToolGateway`; the tool handlers then enter the selection-style
facade exactly once. The standard component runtimes expose presentation intent
only and do not add MCP or mutation routes. Internally, persisted
`rich_text.spans` may carry optional canonical `font_family` strings and numeric
pixel `font_size` values alongside `bold` and `color`. The existing apply APIs
also accept a structural Molecule selection: internal target resolution expands
canonical `parent_id` ancestry to live visual descendants at any depth, while
structural Molecule owners remain transparent and no new public API is exposed.
The superseded passive Family 9/17 prototype adds two further closed Squirrel
presentation APIs: `normalizeMediaCardPresentation` and
`normalizeSelectionSummaryPresentation`. Their Bevy builders are passive and
receive caller-owned status/content only; shared image hydration remains the
existing renderer owner. The Lab emits no intent for either component. They are
not active Panel APIs or a Timeline/Molecule substitute: a future owner must
first establish a concrete product occurrence and measured geometry. The
vertical tool-slider was removed from Panel Lab because it is a tool-context
pattern rather than a current panel need. Its momentary, hold, toggle, and radio
variants emit only closed `panel_lab.icon_button.*` intents and expose no public
API or durable state; all presentation state is ephemeral and resets on surface
close. `EVE_BUTTON_SKIN_TOKENS.bevyButton` is the closed shared presentation
interface for the standard BevyUI button material/depth, radius, focus ring,
pressed translation, disabled opacity, geometry, `labelGapPx`,
`specimenDividerMarginPx`, label vertical alignment, `restToneMix`,
hue-preserving rest-derived `pressedLuminanceLift`, `activeAccentMix`, and
neutral/success/warning/danger tones. Role-local state-shadow maps are not part
of the interface. Labeled panel actions and standard/palette menu tools consume
the same surface/radius contract; Mystic is the explicit circular-radius
override.
The validated `text_input` additionally emits the closed single-line
`validate`/submit callback on Return outside IME and then blurs. An empty,
unfocused field projects its localized placeholder; focus hides only that
presentation text, keeps the value empty, and projects the caret at `0`.
User-entered values are preserved on every later focus.
Project canvas text uses the internal `text.selection.all` intent for a
double-click on the already active text. That intent changes only the shared
selection snapshot and never emits `atome.edit.enter`, `text.edit.begin`, or a
durable mutation. The first double-click may synchronously create the text
session during its second pointerdown; surface state marks that gesture so the
following `dblclick` keeps the caret at the end instead of misclassifying it as
an already-active selection request. A project-background double-tap is
classified before lasso activation for its bounded second press and enters the
same single `132 × 24 px` point-text creation API. Its second accepted
`pointerdown` calls the closed `window.__eveTextTool.prepareProvisionalFocus`
bridge while WebKit still recognizes the user activation; the matching
`pointerup` creates exactly once, then the consumed derived `click` calls
`focusActiveTextEditor` on that same editor after WebKit's tap default action.
Drag/cancel calls `cancelProvisionalFocus`. The shared text session also
consumes native document `selectionchange` while its hidden textarea owns
focus; this updates only the runtime selection/caret snapshot used by WebGPU,
including iOS space-bar trackpad motion.
Product-surface
composition reviews start only after their required primitives are approved; it
is never a second Timeline API or state owner.

Boundary status: Semi-public closed eVe product runtime. The panel view emits UI intentions only; durable mutations stay in existing owners such as Timeline, Calendar, profile, Asset Box, Molecule session, or Atome commit APIs. The Bevy panel path must not create visible panel DOM, a `tools_dock`, a second canvas, or a fallback renderer.

Effect model: `PanelRoot -> (BodyViewport -> BodyContent) + FooterControls`. Body is the single vertical scroll surface and keeps only ephemeral per-tree offset, gesture velocity and animation-frame state; wheel/trackpad input resolves the nearest scroll ancestor and an 8 px vertical drag cancels a pressed child before scrolling. A released vertical drag decelerates through the panel-skin motion tokens, remains clamped to the current range, and is cancelled on unmount. Projection and hit-testing share the same layout and clip calculation. Offscreen body records retain stable ids, but projection carries a separate clipped-out state through all descendants and makes a fully disjoint composite subtree invisible; `null` as an empty nested intersection must never become an unclipped record. The footer remains a fixed sibling owning title, close, drag, and resize controls, reuses the backdrop-free stable panel background without copying another shadow or opening a nested capture, and never moves with body content. Unmount/close resets the offset. The scroll behavior contract was explicitly approved on 2026-07-24; stable capture-free panel paint supersedes its former footer-backdrop clause on 2026-09-30. Mobile layout occupies the shared canvas area above the toolbox-reserved band. Timeline is the first migrated surface and uses the existing `Atome.timeline` / `AtomeTimeline` API without creating the old HTML dialog.

### eVe BevyUI Main Menu API

Ownership: eVe closed Intuition/ribbon composition over the BevyUI runtime.

Primary sources:

- `eVe/intuition/ribbon/bevy_ui_main_menu_model.js`
- `eVe/intuition/ribbon/bevy_ui_main_menu_runtime.js`
- `eVe/intuition/ribbon/bevy_ui_product_registry.js`
- `eVe/intuition/ribbon/bevy_ui_product_runtime.js`
- `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js`
- `eVe/intuition/runtime/eve_intuition/main_menu_create_content_runtime.js`

Exposure:

- Internal runtime access: `getMainMenuRuntime()` from `eVe/intuition/ribbon/bevy_ui_product_registry.js`. The same lightweight registry owns reserved-height, viewport-top, and Atome-center geometry readers; `bevy_ui_product_runtime.js` composes and registers menu plus Mystic instances.
- Closed runtime methods cover visibility, content refresh, tool visual state, measurement, placement, and reserved-height operations. They are not installed on `window`.

Boundary status: Semi-public closed eVe product runtime. Content operations mutate only the Squirrel/toolbox-backed menu content held by the menu facade and then remount/update the disposable BevyUI tree. Tool activation reuses the normalized ribbon definitions and the existing `invokeIntuitionXMainRibbonToolDefinition(...)` path; no duplicated tool handlers or DOM per item are allowed.

Effect model: The menu renders on the shared `eve_surface_project` WebGPU canvas through `window.eveBevyUiRuntime`. From the handedness edge, the visible order is the interactive Atome dashboard tool followed by the canonical `toolbox.children` tools; no legacy projection item is rendered. The active runtime owns resize remounting, fixed-size horizontal overflow, handedness-aware wheel/drag input, activation suppression, hydrated SVG textures, palette state, and the Atome Dashboard toggle. Closed palette children are absent. Opening submits one complete opaque structural frame through the guarded direct-prefix owner, then applies the overshoot/settlement through direct motion: a single rAF sampler permits at most one renderer submission in flight and coalesces backpressure to the latest pending sample. Structure and motion share the scene direct-mutation queue so a full render or interrupted palette cannot overwrite them. Product consumers reach the menu only through the internal per-window registry; `new_menu_v2`, `new_menu`, and `eveGoeyMenuApi` are deleted aliases, not compatibility routes.

Profile preference boundary: `preferences.visual.navigationTaxonomy` is an internal closed value normalized to `legacy` or `modern`. `legacy` preserves the existing content model. `modern` only filters that same model according to the active Dashboard, edit, or performance owner; it does not add a menu renderer, a second writable menu store, or a public API.

Create tool internal entry points are `createMainMenuCreateContent(...)`, `createMainMenuCreateInvocationRuntime(...)`, `window.eveProjectViewCreationApi` (`setPageToolActive`, `prepareTool`, `finishTool`, Text/Draw/Page gesture and leave-level methods), and `window.__eveDrawTool` (`beginGesture`, `moveGesture`, `endGesture`). `project_view_create_draft_runtime.js` retains only the canonical draft id and lifecycle metadata; it never copies an editable record. Text creation still delegates to the single `window.__eveTextTool.createEditableTextAtome` owner and hidden text service. `recordPreviewNode({ interaction })` accepts an optional internal event map; omission is the passive default used by List/Matrix thumbnails. Visual coordinate conversion is `resolveVisualSourcePoint(...)`, and structured edit intents add only the internal `rail_only` context. All durable effects remain `toolBase.createAtome` followed by `Atome.commit`/`commitBatch`; none of these facades is persistent state.

### eVe BevyUI Mystic Runtime API

Ownership: eVe closed contextual Mystic interaction and visual tree.

Primary sources:

- `eVe/intuition/ribbon/bevy_ui_mystic_model.js`
- `eVe/intuition/ribbon/bevy_ui_mystic_runtime.js`
- `eVe/intuition/mystic/context.js`
- `eVe/intuition/runtime/eve_intuition/mystic_context_items_runtime.js`

Exposure: Internal `getMysticRuntime()` access through `bevy_ui_product_registry.js`, reached by the Mystic context facade. Runtime and pointer-session state are module-owned and never installed on `window`. The tree is mounted on the shared `eve_surface_project` canvas under the `mystic` workspace layer.

Boundary rules: held-pointer navigation, Bevy hit testing, palette/Back navigation, leaf preview, single release activation, the stationary auto-open dwell, the directional fling, and cancellation are owned here. Leaf callbacks receive no DOM button and must dispatch only through injected canonical tool invokers. The retired DOM Mystic factory is not an alternate implementation.

Runtime methods: `openAt`, `close`, `isOpen`, `resolveButtonFromPoint`, `clearHoveredButton`, `refreshItems`, `cancel`, `measure`, `releaseAt`, `activateDirectional`, and `updateHover({ clientX, clientY, allowActivation, dwell })`. `dwell` defaults to `false` and only arms the automatic opening, so a plain hover keeps its previous meaning; `context.js` passes `dwell: true` for the held navigation and for the released pointer that still owns the stationary hover.

`releaseAt({ clientX, clientY, event, allowActivation })` launches the tool or opens the palette under the finger and returns `true` when it consumed the release. The centre (assistant or root return), the `back` item and every `disabled` item are never activated by a mouse-up; the release lands while the menu is `open`, or while `opening` once the new geometry is mounted, and is ignored while `closing`. After a geometry replacement, `MYSTIC_POST_REPLACEMENT_MOVE_PX` (12 px) of fresh movement is required first.

Automatic openings carry their own source: `bevy_mystic_dwell` for the stationary dwell (`MYSTIC_AUTO_OPEN_DWELL_MS` = `RIBBON_TOKENS.mysticAutoOpenDwellMs`, 750 ms since 2026-09-28 — the value lives in `eVe/intuition/ribbon/tokens.js`; `MYSTIC_AUTO_OPEN_DWELL_TOLERANCE_PX` 6 px) that now replaces the immediate hover opening of the four `hoverActivate` tools, the palettes and the root return, `bevy_mystic_release` for the terminal event of a maintained press, and `bevy_mystic_fling` for `activateDirectional({ direction, event, source })` — the root-only cardinal fling (`MYSTIC_FLING_MIN_PX` 250 px, `MYSTIC_FLING_MAX_MS` 500 ms measured from the moment the hold owns the pointer, `MYSTIC_FLING_AXIS_TOLERANCE_DEG` 35°) that resolves the `north`/`east`/`south`/`west` slot of the configured cross and returns `false` for a closed menu, a submenu, a missing slot or an in-flight action. `measure()` exposes `autoOpenedKey` and `replacementPending` for the two latches.

### Bevy Shape Projection Style API

Ownership: Atome open, product-neutral rendering contract.

Primary sources:

- `eVe/domains/rendering/render_atom.js`
- `eVe/domains/rendering/virtual_scene_contract.js`
- `eVe/domains/rendering/bevy_projection_adapter.js`
- `eVe/domains/rendering/bevy_projection_style.js`
- `atome/renderers/bevy-core/src/types.rs`
- `atome/renderers/bevy-core/src/components.rs`
- `atome/renderers/bevy-core/src/render_ops.rs`
- `atome/renderers/bevy-core/src/texture.rs`
- `atome/renderers/bevy-core/src/shape_shadow_overlay.rs`
- `atome/renderers/bevy-core/src/spawn.rs`

Exposure: render records may set `corner_radius` / `cornerRadius` / `radius`; normalized virtual scene nodes expose `material.cornerRadius`; Bevy payloads expose `corner_radius`; Bevy core applies it to `shape` sprites by generating an alpha-mask texture. Render records and style patches may set `opacity`; Bevy core stores product-neutral base color and visual opacity separately through disposable `AtomeVisualColor` / `AtomeVisualOpacity` components, applies the effective alpha to `Sprite` output without cumulative multiplication, and propagates owner opacity to generated drop-shadow overlays. `material.shadow` is the canonical GPU exterior drop-shadow contract with `{ color, blur, offsetX, offsetY, spread }`: it follows the owner's rounded silhouette, has a transparent interior, is composited below that owner without sampling the backdrop, and reuses a cached texture until geometry or one of those style values changes. Normalized Bevy payloads expose `shadow` as `{ color, blur, offset_x, offset_y, spread }`; style patches may pass `material.shadow: null` to clear the shadow.

Boundary status: Open product-neutral rendering style. eVe may consume it through render records, but the contract must not encode dashboard-specific behavior.

### Bevy Text Texture Style API

Ownership: Atome open, product-neutral rendering contract.

Primary sources:

- `eVe/domains/rendering/render_atom.js`
- `eVe/domains/rendering/virtual_scene_contract.js`
- `eVe/domains/rendering/bevy_media_texture_resolver.js`
- `eVe/domains/rendering/bevy_media_texture_cache.js`
- `eVe/domains/rendering/bevy_text_texture_pixels.js`
- `atome/renderers/bevy-core/src/components.rs`
- `atome/renderers/bevy-core/src/render_ops.rs`
- `atome/renderers/bevy-core/src/spawn.rs`

Exposure: text render records may set `text_style` / `textStyle` with font size, font weight, alignment, baseline, padding, stroke color/width, and shadow color/blur/offset, and `rich_text` / `richText` for editable selection/caret projection. `RenderAtom` and Virtual Scene carry the style and rich-text state as disposable text texture metadata, and the browser Bevy resolver rasterizes fill plus optional stroke, diffuse shadow, caret, and selection into one RGBA texture payload without using Canvas `maxWidth` glyph scaling. Text render records and style patches may set `opacity`; Bevy core applies the effective alpha to both texture-backed text sprites and non-texture-backed `TextColor` while preserving base color separately from opacity.

Boundary status: Open product-neutral text rendering style. It must not create visible DOM text nodes, duplicate text shadow records, or a fallback renderer.

### Bevy Media Texture Density API

Ownership: Atome open, product-neutral rendering contract.

Primary sources:

- `eVe/domains/rendering/render_atom.js`
- `eVe/domains/rendering/virtual_scene_contract.js`
- `eVe/domains/rendering/bevy_media_texture_resolver.js`
- `eVe/domains/rendering/bevy_media_texture_cache.js`
- `eVe/domains/rendering/bevy_ui_image_runtime.js`
- `eVe/domains/rendering/bevy_media_texture_image_fit.js`

Exposure: image, video-poster, and audio/texture-capable render records may set `texture_scale` / `textureScale` / `media_texture_scale` / `mediaTextureScale`; `RenderAtom` carries the positive value into disposable media content as `textureScale` / `texture_scale`. The browser Bevy media texture resolver combines that per-node request with DPR and max texture bounds, includes the resolved requested scale in the media texture cache key, and rasterizes the shared RGBA texture at the higher physical density before handing it to the existing Bevy payload path. Oversized targets use one homothetic scale for both dimensions; independent axis clamping is forbidden because it changes `cover`/`contain` aspect ratios. Concurrent requests for the same key share one in-flight resolution. Cache clearing increments its generation so completions from the preceding generation cannot resurrect entries; diagnostics report current in-flight work. BevyUI image hydration retains the final tinted result in this shared bounded cache as typed RGBA bytes rather than expanding pixels into JavaScript number arrays or repeating unchanged tint work.

Boundary status: Open product-neutral media rendering density. eVe Dashboard may request higher density for small header SVG icons, project previews, and contact faces, but it must not create a Dashboard-only rasterizer, DOM image fallback, per-item canvas, or pre-scaled logical geometry.

### eVe Atome Drag Runtime API

Ownership: eVe closed.

Primary sources: `eVe/core/atome_events/drag_runtime.js`, `eVe/core/atome_events/drag_arm_runtime.js`, `eVe/core/atome_events/drag_finish_runtime.js`, `eVe/core/atome_events/drag_session_state.js`, `eVe/core/atome_events/drag_session_support.js`.

Exposure: internal JavaScript module exports consumed by `eVe/core/atome_events.js` and the canonical Atome event binding path.

Verified entry points: `createDragRuntime`, `armDragSession`, `finishDragSession`, `createDragSessionState`, `resetDragSessionState`, `collectDragItems`, `createDragShadowTracker`.

Boundary status: Internal eVe product runtime. It must preserve canonical drag commits through injected callbacks and must not expose DOM drag state as durable Atome state.

### Squirrel Utility API

Ownership: Atome open.

Primary sources: `atome/src/squirrel/apis.js`, `atome/src/squirrel/apis/essentials.js`, `atome/src/squirrel/apis/utils.js`, `atome/src/squirrel/apis/loader.js`, `atome/src/squirrel/apis/dragdrop.js`, `atome/src/squirrel/apis/loadServerConfig.js`, `atome/src/squirrel/apis/loadServerConfigDebug.js`, `atome/src/squirrel/apis/loadServerConfigDefaults.js`, `atome/src/squirrel/apis/loadServerConfigWs.js`.

Exposure: JavaScript module exports and default `Apis` object.

Verified entry points: `wait`, `current_platform`, `dataFetcher`, `render_svg`, `fetch_and_render_svg`, `resize`, `strokeColor`, `fillColor`, `sanitizeSVG`, `DragDrop.createDropZone`, `DragDrop.collectFilesFromDataTransfer`, `DragDrop.summarizeFiles`, `loadServerConfigOnce`.

Boundary status: Open framework helpers. Keep product-neutral.

### Squirrel Bootstrap and Component Registry API

Ownership: Atome open.

Primary sources (explicit retired entries are historical): `atome/src/squirrel/spark.js`, `atome/src/squirrel/components/button_builder.js`, `atome/src/squirrel/components/slider_builder.js`, `atome/src/squirrel/components/tool_slider_builder.js`, `atome/src/squirrel/components/input_builder.js`, `retired:atome/src/squirrel/components/console_builder.js`, `atome/src/squirrel/components/table_builder.js`, `atome/src/squirrel/components/table_visual_contract.js`.

Exposure: runtime bootstrap through the Squirrel component registry installed by `spark.js`.

Verified responsibilities:

- Load and register canonical Squirrel system controls.
- Expose the canonical registry to runtime consumers through the Squirrel bootstrap globals.
- Provide the current canonical Atome-owned control set for Button, Slider, ToolSlider, Input, and Console.
- Provide the generic Table builder and table visual contract for product-neutral tabular UI.

Boundary status: Open framework component contract. eVe wrappers may compose these controls but should not redefine their core system-control contract in parallel.

### Adole Browser API

Ownership: Atome open.

Primary sources: `atome/src/squirrel/apis/unified/adole_apis.js`, `atome/src/squirrel/apis/unified/adole.js`, `atome/src/squirrel/apis/unified/adole_api/`.

Exposure: `AdoleAPI` module export and browser/global use where bootstrap installs it.

Verified namespaces: `auth`, `projects`, `activities`, `atomes`, `sharing`, `sync`, `machine`, `security`.

Boundary status: Open application/data API. eVe tools may consume it, but must not replace its auth, project, object, or sync semantics with product-local fallbacks.

Known constraints: `atome/src/squirrel/apis/unified/adole.js` is a large legacy surface and requires targeted verification before mutation.

Authentication: AdoleAPI.auth.startPhoneLogin begins a device-bound SMS-link attempt. The existing session facade installs the proven remote identity and independent native/browser local authorization. The password bootstrap contract and its visual callbacks are retired.

Guest workspace entry: `AdoleAPI.security.startGuest({ force: true })` creates or resumes the persistent opaque local guest principal for this installation. It does not bootstrap a Fastify account, credential, or reusable password verifier. Dashboard boot, main-handle toggle, and Mystic access remain local until an authenticated account explicitly confirms adoption. Login passwords are no longer part of this contract.

Pre-auth account lookup is not exposed. Phone-link start returns the same public shape for new and existing accounts.

Pre-auth phone verification uses only the device-bound link protocol in `atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js`. Plain OTP exposure, enrollment display and bypass paths are retired.

Atome mutation rule: `AdoleAPI.atomes.create` and `AdoleAPI.atomes.alter` are public compatibility method names, but their framework implementation must emit canonical event commits through `adapter.atome.commit`. Direct adapter-level `atome.create` / `atome.alter` calls are legacy WebSocket protocol adapters only and must not be used as durable framework write paths.

Atome browser projection owner: `atome/src/squirrel/apis/unified/adole_api/atome_record_projection.js` owns browser-side normalization of Atome API records and state-current results into canonical `{ id, type, kind, renderer, meta, traits, properties }` records at network/runtime boundaries. Historical transport aliases may be read only at that boundary and must not be re-emitted as a public Atome format.

Current project restoration owner: `atome/src/squirrel/apis/unified/adole_api/session.js` persists `squirrel_current_project_v2` with an explicit `userId`, `projects.js` restores it only for that same authenticated user, and `auth_workspace.js` owns cached pre-auth/anonymous workspace migration through the canonical `transferOwner` adapter before clearing the cache. `auth.js` only orchestrates login flows that call that migration owner. Tauri reload/relogin must not fall back to a cross-user project cache or a DOM-derived project id.

### Server resource HTTP and application WebSocket APIs

Ownership: Atome open server layer.

Primary sources: `server/server.js`, `server/auth_users.js`, `server/atomeRoutes.orm.js`, `server/wsAtomeOperations.js`, `server/wsApiIdentity.js`, `server/wsSyncSecurity.js`, `server/atomeSyncRuntime.js`, `server/mailRoutes.js`, `server/sharing.js`, `server/userFiles.js`, `server/visio.js`, `server/wsApiState.js`, `server/wsSend.js`, `server/serverIdentity.js`.

Verified route families:

- Health and diagnostics: `/health`, `/healthz`, `/__whoami`, `/dev/state`, `/dev/client-log`, `/client-log`, `/dev/snapshot`.
- Application operations: typed `/ws/api` families for authentication, Atome CRUD/history, events, `state-current`, snapshots/restoration, sharing, synchronization, and user data.
- Authenticated delivery: `/ws/sync`, with principal binding before `welcome`,
  control messages limited to `auth|register|subscribe|unsubscribe|ack|ping`,
  sequence replay, ACK, and permission-scoped event delivery. `subscribe` also
  accepts `streams: [{ stream, cursor }]` (≤500, capability `subscribe-batch`),
  answered by one `replay-complete { streams }` for the replayed streams; the
  vault IPC gains the read-only `stream:heads` (≤1000 stream ids). Commits and
  offline `sync:push` remain `/ws/api` operations.
- Server identity and operational discovery: `/api/server/identity`, `/api/server/verify`, `/api/server/status`.
- Uploads and protected files: `/api/uploads`, `/api/uploads/chunk`, `/api/uploads/complete`, `/api/uploads/:file`, `/api/files/*`, `/api/recordings/:file`, `/api/extract-audio/:file`.
- Mail gateway: `/api/eve/mail/sync`, `/api/eve/mail/send`, `/api/eve/mail/mark-read`, `/api/eve/mail/archive`, `/api/eve/mail/delete`.
- Admin/database/visio: `/api/admin/users/export`, `/api/admin/users/import`, `/api/db/status`, `/api/db/stats`, `server/visio.js` routes, `/ws/visio`.
- WebSocket APIs: `/ws/api`, `/ws/sync`, `/ws/visio`; Tauri local development control uses `/ws/control`.

Boundary status: Open server infrastructure. Route names containing `eve` currently exist for product mail integration and must be reviewed before being treated as stable open API names.

Principal identity contract: `/ws/api` authentication returns only opaque `user.id` / `user.user_id` principals. `principal_phone_credentials` is the private, active-phone registry; `principal_identity_aliases` resolves legacy principals solely for immutable history; `principal_identity_migrations` is the resumable migration journal. Phone values are neither Atome particles nor public projections or JWT claims.

Phone verification WebSocket actions use the phone-link attempt protocol. A number change additionally requires fresh device proof tied to the exact new number and explicit confirmation, then consumption of its SMS link. Account deletion uses a separate fresh purpose-bound proof.

SMS infrastructure boundary: server/auth_sms_ovh.js is the only OVH EU delivery owner. It uses server-only AK/AS/CK configuration, persistent send limits and a twenty-send default daily budget. An uncertain outcome never triggers automatic resend. Auth attempts and proofs use dedicated transactional tables in the existing database owner, outside Atome history. No OTP is exposed or typed. Real provider delivery remains unverified.

Authentication throttling boundary: `/ws/api` authentication and OTP handlers apply
progressive, purpose-scoped limits across principal, protected phone identity, challenge,
device, network and global OVHcloud sending-cost dimensions. They must not expose the
triggered dimension or globally lock an account after a fixed failure count. Successful
strong authentication may clear active throttles but never immutable security evidence.

Authentication security-journal boundary: security telemetry is not an Atome, event-log
entry, synchronized payload or product-history record. The dedicated journal stores
typed event/result/purpose data, opaque principal/device references, narrowly required
correlation identifiers, a rotating keyed network fingerprint and normalized
application/browser, operating-system and broad device families. Raw IP addresses are
limited to active throttling state; complete user-agent strings, OTPs, complete phone
numbers, passwords, tokens and recovery/device secrets are forbidden. Access is
role-restricted and audited. Automatic retention is initially six months except for an
explicit narrowly scoped incident or legal hold.

Atome operation ownership: `server/wsAtomeOperations.js` owns typed `/ws/api` event, state, snapshot, history, user-data, and sync request/response operations; `server/wsApiIdentity.js` owns verified principal resolution; `server/atomeRoutes.orm.js` retains the canonical event commit helpers; `server/wsSyncSecurity.js` owns authenticated permission-scoped notification filtering. Historical HTTP route modules are not composed into the maintained server.

Tauri Axum parity: local media write endpoints in `platforms/desktop-tauri/src/server/mod.rs` that return uploaded media ownership must expose `owner`, `owner_id`, and `ownerId` together so browser-on-Axum and Tauri media URLs can preserve `media_user_id` for protected `/api/uploads/:file` and `/api/recordings/:file` reads.

Tauri Axum parity: `platforms/desktop-tauri/src/server/mod.rs` exposes authentication and Atome application operations through `/ws/api`; reload hydration and current-state reads use the same WebSocket contract with no HTTP alternate.

Tauri remote-control status: `platforms/desktop-tauri/src/server/remote_control_ws.rs` owns the typed `/ws/control` dispatcher. The `status` action and six audio actions reuse the existing authorization and native handlers; no HTTP command route is composed.

Tauri local ownership migration: `platforms/desktop-tauri/src/server/local_atome.rs` owns the server-side guard for `transfer-owner`. It permits authenticated migration only from explicit anonymous owners or local owners without login credentials (`phone` and `password_hash` absent), and rejects transfer from any credentialed user.

Sharing API ownership: `server/sharing.js` owns WebSocket message orchestration and route registration, `server/sharingPermissionService.js` owns permission creation/revocation/check/list APIs, and `server/sharingAtomeAccessors.js` owns canonical Atome field reads used by sharing code.

Known constraints: `server/server.js`, `server/auth_users.js`, and `server/sharing.js` are oversized legacy files. Do not expand them without reduction ownership.

### Database and Object Persistence API

Ownership: Atome open data layer.

Primary sources: `database/adole.js`, `database/adole_permissions.js`, `database/adole_schema_migrations.js`, `database/driver.js`.

Exposure: JavaScript module exports for database adapters and object persistence helpers.

Verified entry points:

- Driver lifecycle: `connect`, `getDatabase`, `getDriverType`, `isSqlite`, `isLibsql`, `closeDatabase`.
- Serialization: `serializeJson`, `deserializeJson`.
- Object aliases: `createObject`, `getObject`, `getObjectById`, `getObjectsByOwner`, `getObjectChildren`, `updateObject`, `deleteObject`.
- Property aliases: `setProperty`, `setProperties`, `getProperty`, `getProperties`, `deleteProperty`, `getPropertyHistory`, `restorePropertyVersion`.
- Data source access: `getDataSourceAdapter`.
- Deferred reference repair: `resolvePendingOwners` resolves pending owner and parent references in `atomes` and keeps the corresponding `state_current` projection metadata coherent.
- Schema migration owner: `database/adole_schema_migrations.js` owns additive ADOLE schema migrations invoked during `initDatabase`.
- Permission owner: `database/adole_permissions.js` owns ADOLE permission writes, condition evaluation, and permission flag checks consumed through `database/adole.js` exports.

Boundary status: Open persistence contract. eVe closed stores may use it through explicit adapters, not by duplicating persistence rules.

Known constraints: `database/adole.js` is a critical oversized legacy file and must be reduced before feature growth.

### Atome Contract Helper API

Ownership: Atome open shared layer.

Primary sources:

- `atome/src/shared/atome_contract.js`
- `atome/src/shared/atome_universal_contract.js`
- `atome/src/shared/atome_contract_errors.js`
- `atome/src/shared/atom_graph.js`
- `atome/src/shared/accessible_atom_node.js`
- `atome/src/shared/accessibility_graph.js`
- `atome/src/shared/accessibility_bridge_contract.js`
- `atome/src/shared/core_atome_types.js`
- `atome/src/shared/semantic_rename_contract.js`

Canonical shared module: `atome/src/shared/atome_contract.js` provides the contract for server and Node tests directly; the former re-export is retired.
Canonical shared module: `atome/src/shared/atom_graph.js` provides the graph contract for server and Node tests directly; the former re-export is retired.
Canonical shared module: `atome/src/shared/accessible_atom_node.js` provides the accessibility-node contract for server and Node tests directly; the former re-export is retired.
Canonical shared module: `atome/src/shared/accessibility_graph.js` provides the accessibility graph contract for server and Node tests directly; the former re-export is retired.
Canonical shared module: `atome/src/shared/accessibility_bridge_contract.js` provides the bridge projection contract for server and Node tests directly; the former re-export is retired.
Canonical shared module: `atome/src/shared/core_atome_types.js` provides the core type definitions for server and Node tests directly; the former re-export is retired.
Canonical shared module: `atome/src/shared/semantic_rename_contract.js` provides the rename contract for server and Node tests directly; the former re-export is retired.

Exposure: JavaScript module exports consumed by the ADOLE client API, Fastify Atome routes, and database persistence.

Verified entry points: `normalizeCanonicalAtome`, `sanitizeAtomeEnvelope`, `sanitizeAtomeProperties`, `assertCanonicalPropertyKey`, `resolveCanonicalProperties`, `formatCanonicalAtome`, `registerAtomeType`, `getAtomeType`, `listAtomeTypes`, `toolToUniversalAtome`, `AtomeContractError`, `ATOM_GRAPH_VERSION`, `normalizeAtomGraphRecord`, `buildAtomGraph`, `ACCESSIBLE_ATOM_NODE_VERSION`, `ACCESSIBLE_ATOM_ROLES`, `ACCESSIBLE_ATOM_ACTIONS`, `ACCESSIBLE_ATOM_RELATIONS`, `sanitizeAccessibleAtomNode`, `assertAccessibleAtomNode`, `ACCESSIBILITY_GRAPH_VERSION`, `buildAccessibilityGraph`, `ACCESSIBILITY_BRIDGE_CONTRACT_VERSION`, `buildAccessibilityBridgeProjection`, `CORE_ATOME_TYPE_VERSION`, `CORE_ATOME_TYPE_IDS`, `CORE_ATOME_TYPE_DEFINITIONS`, `listCoreAtomeTypeDefinitions`, `registerCoreAtomeTypes`, `SEMANTIC_RENAME_CANONICAL_PROPERTY`, `SEMANTIC_RENAME_EVENT_KIND`, `normalizeSemanticRenameValue`, `resolveSemanticLabel`, `buildSemanticRenamePatch`, `buildSemanticRenameEvent`, `applySemanticRenameToRecord`.

Boundary rules:

- `normalizeCanonicalAtome` is the strict contract entry point. Transitional aliases such as `atome_id`, `atome_type`, `particles`, and `data` are accepted only when called with an explicit boundary-adapter option.
- `normalizeCanonicalAtome(..., { universal: true })` emits the enriched Atome envelope with `schema_version`, `capabilities`, `interfaces`, `composition`, `policy`, and `lifecycle`.
- `formatCanonicalAtome` remains a tolerant server/database response formatter and emits only the canonical envelope.
- `buildAtomGraph` is a pure structural graph contract over canonical state rows and append-only event rows. It emits roots, nodes, `byId`, parent-child links, per-node `visual_order` / `semantic_order` / `focus_order`, top-level `orders.visual` / `orders.semantic` / `orders.focus`, and diagnostics (`omitted_deleted_ids`, `orphan_links`, `cycle_links`, `duplicate_ids`) without reading the DOM, renderer state, or product UI registries.
- AtomGraph visual order is derived from z/order paint hints. Semantic and focus orders may be derived from explicit `semantic_order`, `reading_order`, `focus_order`, `tab_index`, or equivalent `properties.accessibility` fields; absent explicit values, they fall back deterministically without becoming renderer-owned state.
- `sanitizeAccessibleAtomNode` is a pure schema sanitizer for Atome-derived accessibility semantics. It emits an `AccessibleAtomNode` with role, label, description, alt text, focusability, visibility, actions, relations, and diagnostics without reading visible DOM, browser accessibility APIs, renderer payloads, or product UI state.
- `assertAccessibleAtomNode` is the strict schema gate and throws `AtomeContractError` when required accessibility-node fields or enum values are invalid.
- `buildAccessibilityGraph` derives an accessibility graph from `AtomGraph` and Atome properties. It emits visible accessible nodes, reading/focus orders, structural relations, links, diagnostics, and promoted roots for children of inaccessible parents without reading visible DOM, browser accessibility APIs, renderer payloads, or product UI state.
- `buildAccessibilityBridgeProjection` derives a disposable semantic bridge payload from `AccessibilityGraph`. It mirrors ids, labels, roles, actions, relations, and reading/focus order for future Browser/WebView/native consumers without creating DOM nodes, ARIA attributes, selectors, renderer state, or product UI state.
- Accessible actions are declarative capabilities on `properties.accessibility.actions`; consumers may expose or route them through approved tool/runtime capability paths, but the graph and bridge do not execute actions, mutate Atomes, or imply a DOM event target.
- Accessibility focus restoration is runtime session metadata, currently represented by `InlineEditSession.focus_origin` and `selection_snapshot`; it may reference graph or bridge ids, but must remain pure data and must not carry DOM nodes, selectors, browser elements, or product panel instances.
- `registerCoreAtomeTypes` installs strict core type definitions into the shared Atome type registry for text, shape, image, video, audio, audio waveform, waveform, group, project, tool instance, and generic record Atomes. The record type uses the universal `data_model` kind. Registration is explicit and idempotent, and does not change renderer dispatch.
- `listCoreAtomeTypeDefinitions` returns clone-safe definition data for inspection and tests.
- `buildSemanticRenamePatch` is the canonical rename patch builder. It writes `properties.label` and synchronizes `properties.accessibility.label` while preserving existing accessibility metadata.
- `buildSemanticRenameEvent` emits a persistent `set` event for rename operations and requires an explicit `tx_id` so HistoryTransaction grouping, undo, and redo do not depend on runtime memory.
- `resolveSemanticLabel` defines deterministic label fallback for graph/accessibility consumers: `properties.label`, `properties.accessibility.label`, `meta.name`, `properties.name`, `properties.title`, `properties.text`, then id.
- AtomGraph deletion filtering is projection-only. Durable create, set, delete, restore, undo, or redo writes must still flow through the append-only event pipeline.
- No public `fromLegacy...` or `toLegacy...` adapter API is allowed. Historical input shapes may be normalized only at explicit boundaries; SQL serialization must be named as storage serialization, not as a legacy Atome format.
- Browser-served modules under `atome/src/` and `eVe/` must import `atome/src/shared/atome_contract.js`; browser, Node and server consumers use that same canonical module directly.
- Browser-served modules that need AtomGraph must import `atome/src/shared/atom_graph.js`; browser, Node and server consumers use that same canonical module directly.
- Browser-served modules that need AccessibleAtomNode must import `atome/src/shared/accessible_atom_node.js`; browser, Node and server consumers use that same canonical module directly.
- Browser-served modules that need AccessibilityGraph must import `atome/src/shared/accessibility_graph.js`; browser, Node and server consumers use that same canonical module directly.
- Browser-served modules that need the accessibility bridge contract must import `atome/src/shared/accessibility_bridge_contract.js`; browser, Node and server consumers use that same canonical module directly.
- Browser-served modules that need core Atome type definitions must import `atome/src/shared/core_atome_types.js`; browser, Node and server consumers use that same canonical module directly.
- Browser-served modules that need semantic rename behavior must import `atome/src/shared/semantic_rename_contract.js`; browser, Node and server consumers use that same canonical module directly.

Boundary status: Open framework contract helper. It owns reserved Atome envelope-field filtering and canonical envelope formatting so route, client, and database layers do not define competing schemas.

### ADOLE Storage Projection API

Ownership: Database storage boundary.

Primary source: `database/adole_storage_projection.js`.

Exposure: Internal JavaScript module consumed by `database/adole.js`.

Verified entry points: `projectStoredAtome`, `projectStoredStateCurrent`, `projectStoredEvent`.

Boundary rules:

- SQL column names such as `atome_id`, `atome_type`, `owner_id`, `parent_id`, and serialized `properties` are storage facts only.
- `getAtome`, `getStateCurrent`, and `listStateCurrent` must expose canonical Atome envelopes, not storage rows.
- This module is not a legacy adapter and must not expose public `fromLegacy...` or `toLegacy...` APIs.

### eVe Atome Commit Boundary

Ownership: eVe closed client mutation boundary over the open Atome event API.

Primary sources:

- `eVe/core/atome_commit.js`
- `eVe/core/atome_commit_gesture_trace.js`
- `atome/src/shared/atome_contract.js`

Exposure: `window.Atome.commit`, `window.Atome.commitBatch`, and the injected `__atomeCommitApi` test/runtime surface.

Boundary rules:

- Client mutations must enter through `commit` or `commitBatch`; direct durable Atome state mutation from tools, media helpers, Molecule, or MTraX runtimes is not a valid source of truth.
- Backend routing in `atome_commit.js` must reuse the canonical Squirrel runtime detector from `atome/src/squirrel/apis/unified/adole_api/runtime.js`; Tauri dev pages on `localhost:3000` keep `state_current` refreshes on local Axum instead of issuing secondary Fastify HTTP reads.
- Fastify 401 responses for bearer-backed commit or `state_current` requests invalidate the stored Fastify token through the same auth owner, so expired cloud tokens cannot be replayed on every refresh tick.
- Fastify `state_current` 404 reads are cached as missing for a bounded client window in `atome_commit.js`; the canonical result remains `null`, and repeated UI refreshes must not keep issuing the same absent-id GET.
- `window.eveToolBase.createAtome` is a product runtime creation API over this commit boundary. Its return contract includes `id`/`atomeId`, `canonicalState`, nullable `view`, `committed`, and `rendered`; callers that need model-only creation must pass `{ render: false }`, which keeps DOM projection disabled after the canonical commit.
- `scripts/check_mutation_ownership_guardrails.mjs` is the guardrail entry point for this API boundary. It rejects direct client/runtime mutation of `state_current` and direct event-commit transport calls outside canonical commit/server owners.
- `scripts/check_squirrel_dom_adapter_guardrails.mjs` is the guardrail entry point for the legacy Squirrel Atome DOM adapter boundary. `this.element` may remain a projection handle, but model/business state must stay on Atome instance data or canonical persistence surfaces.
- Database event projection APIs: `database/adole.js` exposes `appendEvent`, `appendEvents`, `getStateCurrent`, `listStateCurrent`, `rebuildStateCurrentFromEvents`, `restoreStateSnapshot`, and the contained legacy `restoreSnapshot` adapter. It also re-exports the pure `database/adole_history_transactions.js` contract (`buildHistoryTransactions`, `classifyHistoryEvent`, `normalizeHistoryEvent`, `resolveHistoryCursor`, `selectUndoTransaction`, and `selectRedoTransaction`). Event projection must clone incoming event patches before projection enrichment, sanitize reserved Atome envelope keys before writing `state_current.properties`, and keep `state_current` coherent with `particles`; controlled state snapshot restore must replay through `appendEvents`, legacy single-atome snapshot restore must append a `set` event through `appendEvent`, restart-safe interaction reconstruction must preserve text edit, drag, resize, and semantic rename transactions from append-only events, and redo semantics must be derived from append-only transactions after a durable cursor rather than in-memory snapshots.
- `rebuildStateCurrentFromEvents` currently performs the safe full scoped replay. No snapshot-tail rebuild API is public yet. The future accelerated path must validate a deterministic event cursor and snapshot integrity, replay only subsequent events, compare with full replay, and replace the projection atomically; it must not authorize event deletion by itself.
- No public historical-branch API exists yet. Branch creation, historical editing, forward recomputation, comparison, merge, abandonment, and archival must not be exposed until the model in `todo/ai_voice/time_machine_historical_branching.md` is validated. Future branch APIs must use `/ws/api`, immutable original events, canonical permissions, and the same append-only projection/history contract.

### eVe Atome DOM Projection Runtime

Ownership: eVe closed projection/runtime boundary.

Primary source: `eVe/core/atome_dom_id.js`.

Exposure: Browser-served JavaScript module exports consumed by eVe projection, interaction, selection, media, MTRAX, and diagnostic runtimes.

Verified entry points: `ATOME_DOM_PREFIX`, `toDomId`, `fromDomId`, `getAtomeElement`, `closestAtomeElement`, `getAtomeIdFromElement`, `getAtomeIdFromEventTarget`, `registerAtomeElement`, `updateAtomeRuntimeState`, `getAtomeRuntimeState`, `getAtomeKindFromElement`, `queryAtomeElements`, `escapeCssValue`.

Boundary rules:

- `toDomId` and `fromDomId` are the only canonical conversion points between Atome ids and final DOM host ids.
- `getAtomeElement` and nearest-host helpers are projection lookup helpers only; they must not make the DOM a source of truth.
- `registerAtomeElement` and `updateAtomeRuntimeState` store ephemeral projection/runtime metadata outside DOM attributes through the runtime registry/WeakMap contract.
- Matrix/project projection metadata is held by `eVe/intuition/matrix/core/project_dom_state.js` through `registerProjectElement` and `getProjectIdFromElement`; project runtime routing must not depend on `data-project-id`.
- Matrix project list loading, current-project persistence, active-project synchronization, and project rename commits are owned by `eVe/intuition/matrix/core/project_data.js`; stable Matrix project slot ordering and slot update serialization are owned by `eVe/intuition/matrix/core/project_order_runtime.js`. Dashboard project-list ordering may compute and expose deterministic local slots before authenticated persistence is available; a missing auth token during slot `commitBatch` must return an explicit failed persistence result without aborting Dashboard boot or Mystic access. Every `props` payload sent through `window.Atome.commit` or `window.Atome.commitBatch` from either owner must be built with `sanitizeAtomeProperties(...)`.
- Event routing must use the DOM id only to recover `atome_id`, then consult Atome/runtime/domain registries to decide behavior.
- This API must not be used to persist, replay, synchronize, serialize, or audit Atome facts.

Forbidden API pattern: adding new Atome `data-*` attributes or reading behavior decisions from Atome `data-*` attributes in final rendered Atome DOM. Legacy read-only fallbacks are temporary migration debt and must not become new contracts.

- `props`, `properties`, `patch`, and `delta` are normalized into `payload.props` before transport.
- `atome/src/shared/atome_contract.js` owns removal of reserved Atome envelope fields from durable property payloads; project Atome creation code and commit code must consume this shared contract rather than maintaining local sanitizer modules or parallel reserved-key lists.
- Reserved envelope fields such as `id`, `type`, `owner_id`, `project_id`, `parent_id`, timestamps, sync fields, selection fields, and media render aliases such as `media_type` or `visualType` must not be emitted as durable properties.
- Top-level event fields such as `atome_id`, `project_id`, `parent_id`, `actor`, transaction id, and gesture id remain event envelope fields.

Boundary status: Closed product adapter over an open Atome event contract. It mirrors the canonical server/database property boundary through the canonical `atome/src/shared/atome_contract.js` contract.

### eVe Unified Rendering Projection API

Ownership: eVe closed rendering projection boundary.

Primary sources (explicit retired entries are historical): `eVe/domains/rendering/render_atom.js`, `eVe/domains/rendering/render_value_compare.js`, `eVe/domains/rendering/virtual_scene_contract.js`, `eVe/domains/rendering/renderer_adapter_registry.js`, `eVe/domains/rendering/bevy_renderer_adapter_registry.js`, `eVe/domains/rendering/bevy_projection_adapter.js`, `eVe/domains/rendering/inline_edit_session.js`, `retired:eVe/domains/rendering/inline_edit_close_overlay.js`, `eVe/domains/rendering/bevy_pending_media_contract.js`, `eVe/domains/rendering/bevy_media_texture_resolver.js`, `eVe/domains/rendering/bevy_media_resource_runtime.js`, `eVe/domains/rendering/bevy_web_renderer_module_loader.js`, `eVe/domains/rendering/bevy_web_presentation_runtime.js`, `eVe/domains/rendering/bevy_surface_backing_sync.js`, `eVe/domains/rendering/bevy_surface_background_runtime.js`, `eVe/domains/rendering/user_background_pattern_renderer.js`, `eVe/domains/rendering/user_surface_background_texture_runtime.js`, `eVe/domains/rendering/bevy_web_renderer_runtime.js`, `eVe/domains/rendering/bevy_web_applied_scene_runtime.js`, `eVe/domains/rendering/scene_graph.js`, `eVe/domains/rendering/surface_size_runtime.js`, `eVe/domains/rendering/surface_runtime.js`, `eVe/domains/rendering/webgpu_compositor.js`, `eVe/domains/rendering/project_scene_runtime.js`, `eVe/domains/rendering/project_scene_direct_style_runtime.js`, `eVe/domains/rendering/project_scene_direct_transform_runtime.js`, `eVe/domains/rendering/project_scene_gesture_runtime.js`, `eVe/domains/rendering/project_scene_record_preservation.js`, `eVe/domains/rendering/matrix_preview_renderer.js`, `eVe/intuition/runtime/project_scene_render_bridge.js`, `eVe/intuition/runtime/atome_description_frame_runtime.js`, `eVe/intuition/runtime/media_integrity_runtime.js`, `eVe/intuition/runtime/shape_svg_runtime.js`, `eVe/intuition/runtime/group_visual_runtime.js`, `eVe/intuition/runtime/group_visual_preview_runtime.js`, `eVe/intuition/runtime/media_source_runtime.js`, `eVe/intuition/runtime/media_hydration_runtime.js`, `eVe/intuition/runtime/media_mount_runtime.js`, `eVe/intuition/runtime/tool_genesis_media_runtime.js`, `eVe/intuition/runtime/tool_genesis_group_runtime.js`, `eVe/intuition/runtime/tool_genesis_projection_support_runtime.js`, `eVe/intuition/runtime/tool_genesis_lifecycle_runtime.js`, `eVe/intuition/runtime/tool_genesis_host_lifecycle_runtime.js`, `eVe/intuition/runtime/tool_genesis_core_services_runtime.js`, `eVe/intuition/runtime/tool_genesis_public_runtime.js`, `eVe/intuition/runtime/atome_host_registry_runtime.js`, `eVe/intuition/runtime/project_atome_index_runtime.js`, `eVe/intuition/runtime/tool_genesis_project_load_runtime.js`, `eVe/intuition/runtime/realtime_atome_events_runtime.js`, `eVe/intuition/runtime/tool_genesis_realtime_patch_runtime.js`, `eVe/intuition/runtime/tool_genesis_mutation_runtime.js`, `eVe/intuition/runtime/tool_genesis_bootstrap_runtime.js`, `eVe/intuition/runtime/persistence_diag_runtime.js`.

Additional internal helpers: `eVe/domains/rendering/surface_hit_target_runtime.js` owns pure project-canvas hit-target acceptance when the active project layer sits above the shared Bevy canvas; `eVe/intuition/runtime/project_layer_geometry_runtime.js` owns fullscreen `project_view_<id>` geometry; `eVe/intuition/runtime/project_layer_visibility_runtime.js` owns foreground project-layer visibility after project switches without storing active state in DOM attributes; `eVe/intuition/runtime/tool_genesis_account_record_filter.js` owns filtering of account/current-user state records before project-scene projection.

Exposure: JavaScript module exports consumed by eVe project, Matrix, media, text, export, and compositor runtimes.

Viewport sizing note: `resolveRenderSurfaceSize({ preferViewport, previousSize, viewportSource })` keeps these fields internal to the shared structural resize scheduler. Initial and observer-only calls remain host-sized. Structural window, visual-viewport, orientation, and `eve:native-viewport-resize` signals select their measured source; Tauri publishes native inner size in logical CSS units while iOS keyboard contraction remains visual-viewport authoritative. `reconcileRenderSurfaceSize()` forces the existing scene projection after all resize consumers settle without creating another renderer path.

Verified entry points: `normalizeRenderAtom`, `normalizeRenderAtoms`, `sameRenderValue`, `buildTextureCacheKey`, `buildTextCacheKey`, `buildWaveformCacheKey`, `normalizeAtomeRenderNode`, `createVirtualSceneTree`, `diffVirtualSceneTrees`, `VIRTUAL_SCENE_DIFF_TYPES`, `VIRTUAL_SCENE_DIRTY_FLAGS`, `RENDERER_ADAPTER_REGISTRY_VERSION`, `normalizeRendererAdapterKind`, `createRendererAdapterRegistry`, `registerRendererAdapter`, `getRendererAdapter`, `assertRendererAdapterKind`, `BEVY_RENDERER_ADAPTER_DEFINITIONS`, `DEFAULT_BEVY_RENDERER_ADAPTER_REGISTRY`, `createDefaultBevyRendererAdapterRegistry`, `mapVirtualSceneNodeToBevyPayload`, `mapVirtualSceneTreeToBevyPayload`, `mapVirtualSceneTransformToBevyPatch`, `mapVirtualSceneStyleToBevyPatch`, `mapVirtualSceneLayerToBevyPatch`, `parseBevyProjectionColor`, `INLINE_EDIT_SESSION_VERSION`, `INLINE_EDIT_MODES`, `INLINE_EDIT_OPENED_BY`, `INLINE_EDIT_STATUS`, `createInlineEditSession`, `assertInlineEditSession`, `updateInlineEditDraft`, `updateInlineEditOverlayAnchor`, `commitInlineEditSession`, `cancelInlineEditSession`, `readInlineEditFocusRestoration`, `INLINE_EDIT_CLOSE_OVERLAY_VERSION`, `INLINE_EDIT_CLOSE_OVERLAY_ACTIONS`, `INLINE_EDIT_CLOSE_OVERLAY_SOURCES`, `createInlineEditCloseOverlay`, `resolveInlineEditCloseOverlayAction`, `applyInlineEditCloseOverlayAction`, `createBrowserBevyMediaTextureResolver`, `createBevyMediaResourceRuntime`, `installBevyWebGpuContextDiagnostics`, `registerBevySurfaceBackgroundRuntime`, `readLatestBevySurfaceBackground`, `createUserBackgroundPatternRenderer`, `createUserSurfaceBackgroundTextureRuntime`, `startBevyWebRenderer`, `applyBevyWebRendererDiffs`, `applyBevyWebRendererSurfaceResize`, `readBevyWebRendererState`, `createRenderScene`, `hitTestRenderScene`, `createSurfaceEventRouter`, `resolveRenderSurfaceSize`, `renderSurfaceSizesMatch`, `ensureRenderSurface`, `readRenderSurfaceSize`, `updateRenderSurfaceScene`, `getRenderSurfaceState`, `ensureProjectLayerElement`, `configureProjectLayerElement`, `getActiveProjectLayerId`, `ensureHiddenTextServiceRoot`, `mountActiveTextEditor`, `unmountActiveTextEditor`, `getTextServiceState`, `createTextEditingLayout`, `createTextEditingSession`, `getActiveTextEditingSession`, `TEXT_CARET_BLINK_MS`, `createUnifiedWebGPUCompositor`, `createMatrixPreviewRenderer`, `renderProjectScene`, `updateProjectSceneOverlay`, `updateProjectSceneRecordStyles`, `updateProjectSceneRecord`, `updateProjectSceneRecordByAtomeId`, `findProjectSceneByAtomeId`, `getProjectSceneState`, `hitTestProjectSceneAtClientPoint`, `collectProjectSceneAtomsInClientRect`, `beginProjectSceneTextEdit`, `commitProjectSceneTextEdit`, `cancelProjectSceneTextEdit`, `emitProjectSceneIntent`, `resizeProjectSceneRecord`, `clearProjectScene`, `clearAllProjectScenes`, `projectIdFromProjectLayer`, `isProjectSceneParent`, `renderProjectSceneRecord`, `rememberAtomeDescriptionFrame`, `resolveAtomeFrame`, `readAtomeFrameState`, `createMediaHostIntegrityRuntime`, `rememberMediaIntegrityKindHint`, `readMediaIntegrityKindHint`, `forgetMediaIntegrityKindHint`, `isMediaIntegrityKind`, `isMediaTextualPatchKey`, `logMediaIntegrityEvent`, `createShapeSvgRuntime`, `isSvgShapeSpec`, `createGroupVisualRuntime`, `computeGroupSize`, `readGroupStepsFromProperties`, `createMediaSourceRuntime`, `isProtectedMediaUrl`, `isDirectRenderableMediaUrl`, `inferMediaSourceFromProperties`, `createMediaHydrationRuntime`, `createMediaMountRuntime`, `createToolGenesisCoreServicesRuntime`, `createToolGenesisHostLifecycleRuntime`, `createToolGenesisLifecycleRuntime`, `createToolGenesisPublicRuntime`, `createAtomeHostRegistryRuntime`, `createProjectAtomeIndexRuntime`, `createRealtimeAtomeEventsRuntime`, `createPersistenceDiagRuntime`.

The shared text session exposes start/stop, select-all, explicit ranges, point-to-caret placement, drag-range extension, input and native-selection synchronization, and immutable snapshots; the layout exposes glyph lines, measured bounds, point-to-index lookup, caret rectangles, and line-clipped selection rectangles.

Boundary rules:

- The API consumes canonical Atome records and returns disposable render projections only.
- `virtual_scene_contract.js` is the Phase 1 bridge contract for future Bevy integration. It may describe hierarchy, diffs, dirty flags, and dense render-layer assignment derived from scene paint order, but it must remain renderer-agnostic and must not own canonical Atome state or duplicate Bevy ECS responsibilities. Durable project Atomes always receive unique dense render layers from canonical `(zIndex, order, id)` ordering; persisted explicit render layers are ignored for that project ordering and remain reserved for Dashboard, panel, menu, and Mystic system bands. Deep value comparisons for virtual-scene/style equality are owned by `render_value_compare.js` and must not reintroduce per-node `JSON.stringify` hot-path comparisons.
- `render_atom.js` normalizes media source projection through `eVe/domains/media/shared/media_source.js` before Virtual Scene and Bevy mapping, so upload and recording sources are explicit API routes instead of relative browser paths; it also projects persisted poster data, waveform peaks, and video timeline fields as disposable render inputs without making them renderer-owned state. A canonical SVG `shape` with an SVG source/MIME or inline markup maps to disposable `image` content for the shared SVG texture path, while an ordinary shape stays `shape`; inline markup wins for projection after a vector edit. Video timeline projection carries `start`, `duration`, `trimIn`, `trimOut`, `offset`, `speed`, and `loop` from canonical Atome properties into `content.timeline`.
- `bevy_projection_adapter.js` is the strict one-way bridge from Virtual Scene data into browser Bevy payloads. Missing ids, kinds, positions, sizes, layers, required media sources, required textures, invalid video timeline values, or invalid fill colors are explicit errors. Browser text, raster image, SVG, persisted video-poster, and audio-waveform projection data use explicit RGBA texture payloads instead of a legacy project renderer; browser canvas/image readback payloads that arrive as `Uint8ClampedArray` are normalized to `Uint8Array` before wasm-bindgen so Safari/Chromium Dashboard textures remain byte arrays without weakening validation. Source-backed live video without a poster is rejected by the media resolver before readback and is handled by the dedicated Bevy video resource path, video payloads may carry normalized timeline projection for browser decode ownership, audio-waveform textures may be generated from persisted peaks or from decoded source audio, project-audio `playback_progress` is a nullable style projection used only for the Bevy waveform playhead, and Bevy layers come from the Virtual Scene dense paint order when available, with direct CSS layer values clamped to the Rust `i32` boundary before wasm-bindgen deserialization only for non-tree payloads.
- `renderer_adapter_registry.js` exposes a closed rendering-domain registry for adapter metadata. It is explicit and immutable at read boundaries: adapter kinds are normalized, renderer names are normalized, capabilities are cloned/frozen, and unsupported kinds throw through the caller-supplied projection error code.
- `bevy_renderer_adapter_registry.js` declares the default Bevy adapter metadata and kind-specific node/resource mapping callbacks for `shape`, `text`, `image`, `video`, and `audio_waveform`. `bevy_projection_adapter.js` owns common base payload validation and delegates kind-specific fields to the registered adapter.
- `inline_edit_session.js` exposes a pure state-machine contract for inline editing. It requires explicit session/project/atom ids, mode, activation source, initial value, focus origin, overlay anchor, and `tx_id`; returns immutable session objects; supports draft/overlay updates plus commit/cancel transitions; and rejects DOM nodes, functions, symbols, undefined values, invalid numbers, and non-plain objects in session metadata. `project_scene_text_runtime.js` consumes this contract for active project text editing and passes the session `tx_id` into `text.commit`.
- `inline_edit_close_overlay.js` exposes a pure disposable close-overlay contract. It derives overlay metadata from an open InlineEditSession, maps close/Escape/Enter/touch/accessibility activation to commit, cancel, or none, and returns focus-restoration data without creating Atomes, DOM nodes, selectors, ARIA attributes, or visual style state.
- `bevy_pending_media_contract.js` owns the browser Bevy pending-media decision contract: images must resolve a disposable RGBA texture before Bevy spawn, persisted video posters and waveform peaks are consumed before initial spawn, and uncached source-backed video plus waveform nodes enter Bevy with transparent pending material until the serialized resource update installs the derived non-live texture metadata or waveform texture. Live source-backed video must not be routed through RGBA readback.
- `bevy_surface_background_runtime.js` listens to the internal `eve:surface-background-changed` surface event, decodes or reuses the selected/generated background as an RGBA texture payload, and sends the non-Atome `surface_background` patch through the generated WASM export `apply_atome_bevy_surface_background`. `user_background_pattern_renderer.js` owns generated background pixel production only, while `user_surface_background_texture_runtime.js` bridges user preferences from the explicitly started `eVe/user/background.js` runtime into this Bevy payload. `eVe/eVe.js` is the boot owner that calls `startUserBackgroundRuntime()` after the `eve.user_background` module imports; missing shell view dependencies must throw there instead of becoming a silent fallback. User random background quick actions expose the closed product runtime global `window.apply_random_generated_background`, which applies generated local parameters only and must not fetch or proxy external wallpaper URLs. The explicit wallpaper download global delegates to `downloadRemoteWallpaper` so remote image retrieval, upload registration, and protected media URL creation stay server-owned before the Bevy background route consumes the result. `/api/uploads/remote-wallpaper` is Fastify-owned and must be addressed through the resolved Fastify base; it must not be posted to the local Axum/Tauri uploads server. The route decides ownership BEFORE any outbound fetch: a caller with no provisioned principal is refused in one round trip with `inline_supported: true` instead of paying for a download and a disk write it will discard. That refusal is the browser guest's normal situation — a guest workspace is minted locally and never registered server-side — so the guest asks for `?inline=1` up front and receives the image as a data URL with `stored: false`, written nowhere and rate limited to one call per two seconds per caller. The upstream fetch carries a per-attempt deadline and retries; a stale bearer is cleared through `AdoleAPI.auth.clearFastifyToken`, re-minted and the post replayed once, and every failure returns a named reason rather than an exception carrying a bare HTTP status. A profile owner without a stored `preferences.background` resolves to the bundled `assets/images/Background/eVe.png`: `defaultUserBackgroundParams()` is the exported canonical resolution, `window.eveBackground.getParams()` and `window.eveBackground.defaults` expose the same image source, and that default is never written through `upsertUserProfile` — a stored background always wins. The existing `window.__eveSurfaceBackground` descriptor retains its media signature, colour, texture/source URL and adds RGBA `cover`. In ordinary project mode the cover is its canonical colour or the shared default; Dashboard, transition and foreground full-surface Dashboard Matrix set it to transparent `[0,0,0,0]`. The shared export consumes `{signature, color, texture, video, cover}` and preserves wallpaper assets for cover-only changes. That colour is read from the project Atome through the read-only `window.Atome.getStateCurrent()` when the shared `atome:changed` event fires (`background` first, then `backgroundColor`, then `bg`), and it is written only by the `couleur` tool of the project contextual rail through `applyColorToSelection` and the canonical commit pipeline, so no renderer ever mutates the project model. Selecting and deselecting the project background stays the toggle owned by `project_layer_routing.js`. No new global event exists: the surface scoping reuses `eve:workspace-mode-changed` and `eve:surface-background-changed`. The legacy DOM background layer is not part of this API.
- `bevy_web_renderer_runtime.js` starts the generated browser Bevy WASM renderer against the existing shared canvas, keeps one Bevy app per canvas, never adopts a started renderer state from a replaced canvas that only shares the same selector, registers the Bevy surface-background runtime only after the renderer state is stored with `started: true`, synchronizes canvas backing through `bevy_surface_backing_sync.js`, and applies Virtual Scene diffs through the generated Bevy WASM batch export `apply_atome_bevy_ops`. Direct exports remain only for explicit async/direct paths that cannot be folded into scene diff batches: surface patches, direct transform patches, direct opacity/style patches, resource/text texture updates, surface background updates, redraw requests, diagnostics, and video-frame notifications. Interactive and settled mutations request one coalesced presentation redraw; no backdrop inspection or delayed retry sequence exists. Browser Bevy startup and surface patches pass an explicit DPR-aware surface payload (`width`, `height`, `pixel_width`, `pixel_height`, `device_pixel_ratio`) while Virtual Scene nodes remain unscaled logical coordinates. The shared core atomically replaces the single-mip capture and mip-pyramid images on resize, recomputes each material's DPR-aware LOD and sampling footprint, and the shader maps physical fragments through `view.viewport`. `atome/renderers/bevy-core/src/render_math.rs` owns the fixed orthographic camera projection for those logical dimensions, and the web window uses the browser/winit scale factor instead of overriding it to `1.0`. `bevy_web_renderer_start_state.js` owns the browser event-loop ownership lock and startup state factories used to coalesce same-canvas concurrent starts while refusing a second canvas in the same page with `bevy_renderer_event_loop_already_owned`; once the native runner has been invoked, ownership is terminal even when presentation startup later fails, so a same-canvas retry returns `bevy_renderer_start_failed_terminal` without invoking Winit again. The Web Rust boundary independently rejects a second start with `bevy_renderer_event_loop_already_started` before Bevy plugins or the global logger are rebuilt. `bevy_web_applied_scene_runtime.js` reconciles the applied Virtual Scene baseline after skipped media mapping so skipped spawns stay absent, skipped resource updates keep the previous applied node, and later successful retries are diffed against visible renderer state. `bevy_media_resource_runtime.js` owns immediate texture resolution, transparent pending media material, serialized deferred media texture generation, bounded deferred video retry behavior, spawn/resource/text texture mapping, and post-resize media queue resumption. `bevy_web_renderer_module_loader.js` owns WASM import/instantiation and records Bevy panic-hook console errors before wasm-bindgen captures `console.error`; Dashboard readiness reads that fatal signal instead of treating a panicked WebGPU startup as presentable. `bevy_web_presentation_runtime.js` owns initial-presentation/stability gating, one-frame redraw coalescing, same-tick video-frame notification coalescing and WebGPU/canvas context diagnostics; it no longer detects active glass or schedules presentation primes. `bevy_wasm_diagnostics_runtime.js` attaches generated WASM diagnostics readers to that shared object. Video resolver readback and poster capture both use `eVe/domains/media/shared/video_decode_pool_runtime.js`; these owners keep redraws and deferred resources inside the same Bevy canvas path without an alternate renderer route.
- Effectful project drag, resize, and text mutations enter as scene intents and must pass through `window.Atome.commit` or `window.Atome.commitBatch`; move frames use `gesture_frame` for realtime sharing, final drag/resize/text commits persist durable `set` state, and live drag/resize visual feedback may update disposable scene records before the durable final commit. A pure translation stays on the direct-transform route: Bevy retains the video's `Mesh2d` and moves the existing selection entities without regenerating their texture; only dimensions or UV changes replace the video mesh, and a translation emits no layer operation. Web applies the display-frame transform batch through the resident WASM renderer; presentable Tauri/iOS surfaces send one transform-only native bridge batch and retain only the newest patch per entity while IPC is busy. A settled full projection waits for that bounded native queue. `surface_runtime.js` converts client coordinates into render-surface logical coordinates before hit-testing so scaled canvases do not shift drag targets. `surface_pointer_runtime.js` computes resize target props with a uniform scale so active project resizes preserve aspect ratio for single Atomes and selected groups; resize hit-testing includes 5 logical px of extra inward tolerance on the right and bottom edge band without adding DOM handles. `project_scene_gesture_runtime.js` coalesces move-frame scene updates, WebGPU rerenders, and realtime `gesture_frame` commits to animation-frame cadence without becoming canonical state.
- Render surfaces are bounded by zone (`project`, `matrix`) and must not create one canvas per Atome. `readRenderSurfaceSize` exposes logical host dimensions, drawing-buffer dimensions, raw device-pixel dimensions, DPR, and optional texture clamp status separately; compositor targets must not confuse device-pixel buffer dimensions with scene coordinates. `ResizeObserver.devicePixelContentBoxSize` is used only when it matches the page DPR, preventing stale or contradictory device boxes from scaling Bevy projection away from logical coordinates.
- Project selection is transient runtime state read from `SelectionAPI.selected()` / `window.__selectedAtomeIds` by `project_scene_runtime.js`, marked on disposable projection records, mapped as a `selected` flag plus dense paint-order layer by the Virtual Scene and Bevy projection adapter, and sent through Bevy style diffs on the same project canvas. It must not be serialized into Atome properties or projected as per-Atome DOM.
- Text DOM is limited to one hidden service root and one active editor. Project text editing is exposed through project-scene text APIs and runtime state that includes the active `inline_edit_session`, not `.eve-atome-text` hosts.
- Project media diagnostics may resolve project-visible media through canonical Atome state plus `project_scene_runtime` records when the cleaned project route intentionally has no per-Atome DOM host. `media_diagnostics.js` owns the runtime report shape, `media_diagnostics_url.js` owns diagnostic URL/redaction helpers, and `media_diagnostics_probe.js` owns HTTP/probe-element checks. They must validate HTTP access plus project projection/playback only, and must not reopen the deleted MTrack editor or inspect `window.eveMtrackApi`.
- T24 cleanup boundary: inline edit, close overlay, AtomGraph, AccessibilityGraph, and AccessibilityBridgeProjection are not footer, dock, or MTraX APIs. Panel footer chrome, tool docks, and Molecule/MTraX docked runtimes must not expose or store project edit state, accessibility truth, bridge focus restoration, or graph-derived labels. Future footer/dock changes must consume canonical project scene APIs or explicit MTraX/Molecule APIs only.

Boundary status: Semi-public closed product API. It is not an Atome open framework contract until a product-neutral renderer contract is explicitly promoted.

### Native Bevy Backend Renderer API

Ownership: Tauri native platform renderer boundary.

Primary sources: `atome/renderers/bevy-core/`, `atome/src/shared/render_visual_tokens.js`, `platforms/desktop-tauri/Cargo.toml`, `platforms/desktop-tauri/src/bevy_backend/mod.rs`, `platforms/desktop-tauri/src/bevy_backend/bridge.rs`, `platforms/desktop-tauri/permissions/bevy-native-renderer.toml`, `platforms/ios/bevy-renderer/`, `platforms/ios/atome-auv3/Common/AtomeIosBevyRendererBridge.h`, `platforms/web/bevy-renderer/src/lib.rs`, `eVe/domains/rendering/bevy_native_renderer_runtime.js`.

Exposure: Rust library module exported when Cargo feature `bevy_backend` is enabled; Tauri `bevy_renderer_core` exposes the native Bevy scene/ops command bridge and includes the Linux `x11`/`wayland` Winit backends required by `bevy_winit`, but that embedded bridge reports `presentable:false` until a real native presenter is wired to the project surface. The JavaScript runtime therefore uses the visible Bevy/WebGPU canvas path in Tauri WebView unless the host explicitly declares `window.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true`. iOS/AUv3 exposes `bevy_native_start(surface_id, width, height, scene)`, `bevy_native_apply_ops(surface_id, ops)`, and `bevy_native_resize(surface_id, width, height)` through `window.__ATOME_IOS_NATIVE_INVOKE`; the WebView remains the application shell and host surface, but project Bevy dispatch stays native on iOS when that bridge exists. Xcode builds and links the `platforms/ios/bevy-renderer` Rust staticlib before Swift compilation; Swift calls `atome_ios_bevy_renderer_status(...)` and `atome_ios_bevy_scene_probe(...)` so the Xcode console distinguishes `rust_linked=1` from `presentable=0`. A successful iOS scene probe is not enough to claim visual rendering: while the Metal/Bevy presenter is absent, Swift returns `ios_bevy_native_not_presentable` with `renderer_mode=linked_no_presenter`, and the JavaScript projection records a non-visible native render result without selecting a Web/WASM fallback. Standalone native window presentation belongs to `bevy_renderer_native` and `run_atome_bevy_native(...)`; `bevy_renderer_native` extends `bevy_renderer_core` with standalone native-window extras such as `bevy/multi_threaded` instead of redefining the Linux Winit backend set. Tauri exposes the same native Bevy command endpoints through the `bevy-native-renderer` capability permission set; the JavaScript IPC payload uses Tauri camelCase keys (`surfaceId`) for those Rust `surface_id` parameters. Native IPC scenes carry media sources, text, and waveform peaks without browser-side RGBA texture decoding, so Swift/Rust receives the scene before platform media loading is attempted. Browser exposure is the `squirrel-bevy-renderer` WASM module and its `run_atome_bevy_renderer(canvas_selector, width, height, initial_scene)`, `request_atome_bevy_redraw()`, `notify_atome_bevy_video_frame(id, frame_version)`, `read_atome_bevy_web_diagnostics()`, and diagnostics reset/capability exports.

Verified entry points: `AtomeRenderScene`, `AtomeRenderNode`, `AtomeRenderOp`, `AtomeEntityId`, `AtomeLogicalSize`, `AtomeLogicalPosition`, `AtomeLayer`, `AtomeRenderKind`, `AtomeMediaSource`, `AtomeSelected`, `AtomeSelectionOverlay`, `AtomeEntityTable`, `AtomeRendererDiagnostics`, `SelectionVisualStyle`, `AtomeBevyRendererConfig`, `AtomeBevyRendererPlugin`, `apply_render_ops`, `atome_ios_bevy_renderer_status`, `atome_ios_bevy_scene_probe`, `bevy_native_start`, `bevy_native_apply_ops`, `bevy_native_resize`, `startBevyNativeRenderer`, `applyBevyNativeRendererDiffs`, `applyBevyNativeRendererSurfaceResize`, `shouldUseNativeBevyRenderer`, `AtomePowerProfile`, `AtomeRenderActivity`, `AtomeWinitSettings`, `AtomeUpdateMode`, `AtomePresentMode`, `AtomeRedrawRequest`, `AtomeFrameCounter`, `AtomeBevyPowerState`, `parse_atome_power_profile`, `atome_power_profile_from_env`, `atome_winit_settings_for_profile`, `atome_winit_settings_for_activity`, `atome_present_mode_for_profile`, `bevy_winit_settings_for_profile`, `bevy_present_mode_for_profile`, `apply_atome_power_activity`, `request_atome_redraw`, `should_write_transform`, `trace_is_idle_mutation`, `expected_updates_per_minute`, `AtomeNativeBevyRendererConfig`, `build_atome_bevy_embedded_app`, `build_atome_bevy_app`, `run_atome_bevy_native`, `ATOME_RENDER_VISUAL_TOKENS`, `getAtomeRenderSelectionVisualStyle`.

Boundary rules:

- The API consumes explicit projection data derived from canonical Atome records.
- It may map logical position to Bevy `Transform` and logical size/layer to disposable Bevy ECS components.
- It may expose low-power Bevy policy values for `ATOME_POWER_PROFILE=eco|balanced|performance`; eco is the default, balanced mirrors desktop-app behavior, and performance/continuous behavior is opt-in.
- Renderer features may create a Bevy window/surface as the active native rendering surface. That surface must consume projection data from canonical Atome records and must not run alongside another renderer for the same Atomes.
- Bevy audio features remain disabled; Atome Kira remains the single audio engine and may be exposed later through an explicit resource/event bridge instead of a second playback engine.
- WASM/browser Bevy APIs live in `platforms/web/bevy-renderer/` rather than the desktop Tauri crate, because the desktop crate includes native server/runtime dependencies that are not valid for `wasm32-unknown-unknown`.
- Browser Bevy projection currently supports shape, text, raster image, SVG, persisted video-poster, source-backed live video, audio waveform projection data, video timeline projection, selected-state style patches, and nullable audio waveform playback-progress style patches. Browser text/media payloads may include explicit RGBA texture data for non-live resources; source-backed live video bypasses the RGBA resolver and is represented in Bevy as an external-texture mesh path instead of a Bevy `Image` upload. The hidden browser decode source runtime keeps its decode root and `HTMLVideoElement` resources fully transparent under `#eve_bevy_video_decode_root`, applies video timeline projection to the source element before external-texture import, uses `requestVideoFrameCallback` as the active-playback frame pump when available, and keeps RAF only as fallback: trim seek, trim-end enforcement, offset, playback speed, and loop inside the trimmed source window. The WASM renderer turns accepted RGBA payloads into Bevy `Image` assets for non-live media, while selected-state and audio-progress patches rebuild disposable Bevy overlay entities inside the same canvas. Browser/WASM progress-only style ops are coalesced per Atome before the Bevy update drain so live audio playback cannot build an obsolete playhead queue. Browser/WASM Winit policy is reactive desktop-app mode with explicit EventLoopProxy wakeups and `RequestRedraw` messages; continuous update mode is not the default web route.
- Live project video is part of the browser/WASM Bevy API through the Virtual Scene render-node, transform, style, resource, hidden decode-source, and external-texture path. The old direct `AtomeVideoTrack` / `AtomeVideoTransform` / `VideoTrack*` mutation API and the WASM exports `apply_atome_bevy_video_track(...)`, `remove_atome_bevy_video_track(...)`, and `update_atome_bevy_video_transform(...)` are deleted and must not be reintroduced. `AtomeRenderNode` and `AtomeTransformPatch` carry local transform fields with serde defaults, `AtomeRenderNode` carries optional initial `uv_rect`, and `AtomeResourcePatch` carries tri-state `uv_rect` so resource updates can set, preserve, or clear crop rectangles. Browser projection accepts normalized `uvRect` / `uv_rect` and pixel `sourceRect` / `source_rect` / `cropRect` / `crop_rect` values, converting pixel crop rectangles through natural media size before sending Bevy `uv_rect`; it also forwards Virtual Scene `localTransform.scaleX`, `scaleY`, `rotation`, `originX`, and `originY` through standard Bevy payloads and transform patches. Video timeline fields are normalized and validated on the JavaScript projection/browser decode boundary, then applied to the hidden `HTMLVideoElement` source before the Bevy external-texture import. `AtomeStylePatch` carries opacity, filters, transitions, and playback progress for Virtual Scene style diffs so browser runtime mutations reach the same WASM style export. Browser Bevy projection accepts only normal/source-over blending; unsupported advanced modes such as `add`, `multiply`, and `screen` fail with `bevy_projection_blend_mode_unsupported:<id>:<mode>` instead of silently falling back to normal. `atome/renderers/bevy-core/src/video_external_texture.rs`, `atome/renderers/bevy-core/src/video_external_web.rs`, and `atome/renderers/bevy-core/assets/shaders/video_external.wgsl` own the current product video import/draw/sampling path. The external-texture component carries the current compositor layer, current per-track opacity, normalized crop `uv_rect`, color filters, and transition parameters; source-backed video meshes opt out of automatic 2D batching and rebuild UV coordinates from the canonical crop rectangle, while `render_math.rs` and `render_ops.rs` apply local scale/rotation/origin to the Bevy `Transform` without mutating canonical Atome state. The web RenderApp queues external-video phase items by the extracted layer and binds one material uniform so z-index, transform, crop, opacity, filters, and transitions are represented in the same Bevy canvas route. `atome/renderers/wgpu-web-external-texture/` owns the maintained Web `wgpu` backend fork that adds browser media source descriptors, `GPUDevice.importExternalTexture`, and external-texture bind-group resource mapping for the web renderer Cargo graph. The pure JavaScript `GPUExternalTexture` preview/probe path is a diagnostic reference only and must not be promoted into an eVe project-rendering API or side compositor. `read_atome_bevy_video_backend_capabilities()` is diagnostics-only; schema `atome.bevy.web.video_backend.v7` reports target and live backend `gpu_external_texture_texture_external`, `current_backend_final:true`, browser `GPUDevice.importExternalTexture` availability, true Web `wgpu` create/source/resource support from the maintained fork, blocker `none`, true product external-texture import and `texture_external` sampling, and false live RGBA and visible DOM overlay capabilities. `read_atome_bevy_video_copy_diagnostics()` and `reset_atome_bevy_video_copy_diagnostics()` are diagnostics-only counters for legacy copy pressure and skip-reason tracking; they do not describe the active source-backed live video route and do not add a second video-track API.
- Internal browser stream-source API: `registerBevyVideoStreamSource({ id, stream, surface })` binds an already-owned video `MediaStream` to the existing Bevy external-texture lookup for that overlay id and returns a session-local `dispose()` handle. Disposal cancels the frame callback, detaches and removes the hidden video, and deliberately does not stop any stream track because the capture controller remains the track owner. `unregisterBevyVideoStreamSource(...)` and `getBevyVideoStreamSourceStatus(...)` are internal lifecycle/diagnostic helpers, not durable media or recorder APIs.
- Redraw requests must be explicit and transform writes must be gated by dirty interaction, animation, resize, video-frame notification, or external state causes rather than idle timers. Browser video-frame notifications are coalesced before crossing the WASM boundary, and the web renderer applies video-frame redraw requests without an extra wake after the queued notification already woke the reactive loop. Web diagnostics expose wake calls, redraw request/apply counts, and accepted/applied video-frame redraw counts so probes can separate idle loop cost from playback pressure. `window.__EVE_BEVY_PERF__` is an internal diagnostics object, not a product rendering API; it is disabled by default and enabled only by `?perf=1` or explicit debug flags. `externalRenderEvents`/`external_render_events` and `videoFrameEvents`/`video_frame_events` keep high-frequency external render and video-frame event logging opt-in so normal probes measure the production-default path.
- It must not own canonical Atome state, mutation ordering, persistence, replay, sync, or renderer selection.
- Browser/WASM bridging must consume `eVe/domains/rendering/virtual_scene_contract.js` projection data wrapped as an `AtomeRenderScene` with shared Atome visual tokens rather than duplicating a second virtual scene owner.

Boundary status: Internal feature-gated Rust renderer API.

### eVe Clipboard Tool APIs

Ownership: eVe closed product tools over the Atome commit boundary.

Primary sources: `eVe/intuition/tools/copy.js`, `eVe/intuition/tools/paste.js`, `eVe/intuition/tools/clipboard/`, and `eVe/intuition/tools/shared/atome_record_utils.js`.

Exposure: registered UI actions `ui.copy.action` and `ui.paste.action`, plus existing runtime globals `window.eve_copy_selection`, `window.eve_paste_selection`, and `window.eveClipboardStore`.

Verified responsibilities: clipboard group state, persisted clipboard Atome payloads, shared eVe tool-side Atome record normalization through `tools/shared/atome_record_utils.js`, optional system clipboard writes for user-owned Atomes, canonical creator dispatch, and paste panel selection/drag-drop integration. Copy no longer reads selection through deleted `window.eveMtrackApi.getSelectedClipAtomeIds`; paste no longer routes through deleted `window.eveMtrackApi.pasteFromClipboard`; `window.eve_copy_selection` and `window.eve_paste_selection` remain the product clipboard entrypoints.

Boundary rules:

- Durable clipboard persistence must use `window.Atome.commit`.
- Shared record helpers must stay outside `clipboard/` so delete, copy, paste, and future tool surfaces do not keep parallel Atome record projection code.
- Pasted Atome creation must use `window.Atome.commitBatch`.
- Clipboard payloads must keep project, parent, type, owner, selection, and media render aliases out of durable `props`.

Boundary status: Closed product tool API. It consumes the eVe Atome commit boundary and must not duplicate open server/database persistence contracts.

### eVe Project Media Import Runtime API

Ownership: eVe closed product runtime over the project drop and Atome commit boundaries.

Primary source: `eVe/intuition/runtime/project_media_import_runtime.js`.

Exposure: JavaScript module exports consumed by eVeIntuition mystic-menu import and the capture import tool.

Verified entry points: `invokeProjectMediaImport`, `requestProjectImportFiles`, `resolveCurrentProjectImportTarget`, `buildProjectImportAnchorEvent`.

Boundary rules:

- File selection is UI intent collection only; durable media creation is delegated to `eVe/intuition/tools/project_drop.js` through `importFilesToProjectViaCreator`, implemented by `project_drop_external_runtime.js` through the canonical `ui.creator` gateway. During RF-02, project-drop internals are split into closed focused runtimes: media/drop normalization (`project_drop_media_runtime.js`), Finder payload resolution (`project_drop_finder_payload_runtime.js`), drop-event/project-layer resolution (`project_drop_event_runtime.js`), drop-zone attach/destroy/reset (`project_drop_zone_runtime.js`), main-ribbon trash/drop session state (`project_drop_main_toolbox_session_runtime.js`), projected tool catalog/type/palette resolution (`project_drop_tool_catalog_runtime.js`), projection palette child hydration/expand/collapse/visibility sync (`project_drop_projection_palette_runtime.js`), projection slider relayout/value apply routing (`project_drop_projection_slider_runtime.js`), projection drag ghost-image creation/cleanup (`project_drop_projection_drag_preview_runtime.js`), tool-projection instance drag/move/delete/toolbox-reinsert persistence (`project_drop_projection_move_runtime.js`, which imports the canonical Mystic pointer-interaction predicate), the projection dynamic toolbox handle gesture (`project_drop_toolbox_handle_drag_runtime.js`), the projection dynamic toolbox proximity rebalancer/container builder (`project_drop_toolbox_rebalance_runtime.js`), the grouped toolbox container chrome build/refresh + cap stepping (`project_drop_toolbox_chrome_runtime.js`), projection tool visual mounting (`project_drop_tool_visual_mount_runtime.js`), Finder/tool record drop handling (`project_drop_finder_record_drop_runtime.js`), projected tool button latch/icon/payload state (`project_drop_tool_button_state_runtime.js`), projection global event delegation (`project_drop_delegation_runtime.js`), and projection host geometry/clustering leaf helpers (`project_drop_projection_host_geometry_runtime.js`). RF-02 closed 2026-07-01: `project_drop.js` itself is now a 39-line composition root, with the remaining body split into 9 more focused runtimes (constants, projection-host foundation, toolbox row/insertion, toolbox scroll, toolbox chrome-layout, toolbox grouped-layout-guard, projection drag/rebalance, tool-projection interaction, bootstrap) — see `maps/CODEMAP.md` for the full list. These modules are internal eVe implementation owners, not new open APIs.
- The runtime may use the native iOS/AUv3 document picker, browser file picker, or hidden input picker only as file-selection surfaces. The runtime declares the source and never picks a library itself: an image-only request is answered by the host's Apple Photos picker, an undeclared request by the host's Photos/Fichiers source choice, and the returned files keep the single `{name, base64}` shape (or a `User cancelled` error, which stays a cancellation).
- Temporary iOS/AUv3 import diagnosis logs were removed after the import and Bevy projection path was validated; this runtime now exposes the same import entry points without Xcode-console spam.
- It must not persist Atome state, upload files, or render media directly.
- The delegated media creation path must preserve the selected project id through the canonical commit envelope and project scene records, not DOM parent inference.

Boundary status: Closed product runtime API. It centralizes project media import intent collection for eVe UI tools and preserves the canonical project drop creation path.

### eVe Capture Tool Runtime API

Ownership: eVe closed capture tool runtime boundaries.

Primary sources: `eVe/intuition/tools/capture.js`, `eVe/intuition/tools/core/tool_runtime_recording_handlers.js`, `eVe/intuition/tools/capture_source_runtime.js`, `eVe/intuition/tools/capture_recording_feedback_runtime.js`, `eVe/intuition/tools/capture_video_recording_runtime.js`, `eVe/intuition/tools/capture_reveal_runtime.js`, `eVe/domains/media/api/audio_api.js`, and `eVe/domains/media/api/video_recording_controller.js`.

Exposure: JavaScript module exports consumed by the capture tool facade and Intuition runtime registration.

Verified entry points: `invokeCaptureToolHandler`, `createBootstrapCaptureHandler`, `createMoleculeRecordToggleHandler`, `createDetailRecordHandler`, `createCaptureSourceRuntime`, `createCaptureRecordingFeedbackRuntime`, `createCaptureVideoRecordingRuntime`, `createPendingCaptureExportOptions`, and `landCaptureAtome`.

Recording visual entry points on the mounted main-menu runtime are `setToolRecordingVisual({ toolId, sessionId, kind, phase, sourceId })`, `pushToolAudioScope({ toolId, sessionId, sequence, sampleRate, channels, pairs, rms, peak })` (a live camera, browser or native, reaches its preview record through `registerBevyVideoStreamSource({ id, stream, maxFps })`, never as pushed frames), `readToolRecordingVisualBounds({ toolId, sessionId })`, and `clearToolRecordingVisual({ toolId, sessionId })`. They are closed ephemeral projection APIs; the `sessionId` and monotonic sequence reject stale cleanup or frames, and none of their payload is canonical Atome state.

Boundary rules:

- BevyUI-rendered audio/video/detail-record tools emit tool actions; they do not simulate recording through latch state. The tool runtime reaches the registered `capture.js` handler, then the real `startAudioRecording` / `stopAudioRecording` or `startVideoRecordingSession` / `stopVideoRecordingSession` controller boundary. Repeated explicit on/off actions are idempotent.
- When a Molecule timeline is active, the media-record detail tool delegates audio recording to `window.eveMoleculeTimelineApi`; non-Molecule key/live detail modes keep their registered detail handler.
- Generic audio/video recording remains supported according to each controller/runtime capability. The exact-overdub restrictions documented by the Atome sample-accurate contract are additive and must never be inferred from a successful generic capture.
- The connected generic video controller has no recording-owned visible DOM renderer or native overlay. Browser preview feedback registers the controller-owned stream with the existing Bevy external-texture route; disposal removes only that hidden renderer consumer and never stops controller-owned tracks.
- Browser recording scope is derived from the PCM already written by its recorder worklet. Tauri's `audio-engine` permission set authorizes polling `audio_get_scope` at no more than 30 Hz; strictly newer frames enter the internal session registry, while only the first IPC failure is retained as a session diagnostic. iOS/AUv3 consume `record_scope` frames published from fixed native buffers. Internal subscribers and diagnostics are removed with the session; `native_audio_scope` is compatibility-only. None of these routes opens a second microphone or audio context.
- Capture actions are owned by BevyUI tool dispatch. The deleted fullscreen/expanded DOM runtime and the deleted document-level pointer/click interception are not alternate capture entry points and must not be restored.

Boundary status: Closed product tool runtime API. Capture selection, controller dispatch, Bevy recording feedback, and reveal owners collect UI intent; durable media Atome creation remains delegated to the existing media/import/recording commit paths. Video recording does not own a parallel preview projection.

### eVe Panel Tool Registration Runtime API

Ownership: eVe closed Intuition panel tool registration boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/panel_tool_registration_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` during boot registration.

Verified entry point: `registerPanelUiToolsRuntime`.

Boundary rules:

- The runtime registers existing panel surface tools only and keeps actual panel open/close behavior in injected panel callbacks.
- It may read `PANEL_SURFACE_DEFINITIONS` for canonical tool IDs and surface IDs but must not create duplicate panel definitions or alternate panel state.
- It must preserve the boot registration order before basic UI tools so existing runtime lookup remains deterministic.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral panel registration contract.

### eVe Main Tool Latched State Runtime API

Ownership: eVe closed Intuition main-tool visual/latched state resolution boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/main_tool_latched_state_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` when resolving main tool activation state.

Verified entry point: `createMainToolLatchedStateRuntime`.

Boundary rules:

- The runtime may read runtime tool APIs, cached latch state, menu alias families, visible panel surfaces, and disposable tool button DOM state.
- It must not invoke tools, open panels, mutate durable Atome state, or create alternate latch caches.
- Canonical latch writes remain owned by `tool_latched_state_runtime.js`; this runtime is read-only state resolution.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral tool-state contract.

### eVe Main Tool Selection Guard Runtime API

Ownership: eVe closed Intuition selection-required tool policy boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/main_tool_selection_guard_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` when blocking selection-required main tool activation without a target.

Verified entry point: `createMainToolSelectionGuardRuntime`.

Boundary rules:

- The runtime may read the canonical selection snapshot and may un-latch a blocked tool through the injected latch sync.
- It owns the selection-required key/tool-id policy for vector and record-action style tools; consumers must ask this runtime instead of duplicating the required-key set.
- It must not invoke tools, synthesize selection, or create fallback activation behavior when no target exists.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral selection capability contract.

### eVe Main Menu Runtime APIs

Ownership: eVe closed Intuition main-menu composition, content declaration, auth, catalog, and registration boundary.

Primary sources: `eVe/intuition/runtime/eve_intuition/main_menu_runtime.js`, `main_menu_content_runtime.js`, `main_menu_auth_runtime.js`, `main_tool_interaction_runtime.js`, `main_tool_latched_state_runtime.js`, `main_tool_selection_guard_runtime.js`, and `main_tool_registration_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` during boot menu construction.

Verified entry points: `createMainMenuRuntime`, `createMainMenuContentRuntime`, `createMainMenuAuthRuntime`, `createMainToolCatalogRuntime`, `createMainToolInteractionRuntime`, `createMainToolLatchedStateRuntime`, `createMainToolSelectionGuardRuntime`, and `createMainToolRegistrationRuntime`.

Boundary rules:

- The composite runtime owns the closed main-menu wiring and receives product callbacks by injection.
- The content runtime owns the content object for the main Intuition menu.
- The visible main sequence is `home`, `find`, `capture`, `time`, `communicate`, `mode`, and `view`; `ai` remains an inline IA prompt route but is not exposed in the visible toolbox, and unimplemented no-op/demo tools must not be exposed.
- It must not create fallback handlers, alternate tool buses, or non-Bevy atom renderers.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral menu declaration contract.

### eVe Main Tool Interaction Runtime API

Ownership: eVe closed Intuition main-tool interaction and catalog policy boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js`.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js` and main tool registration.

Verified entry points: `createMainToolCatalogRuntime`, `createMainToolInteractionRuntime`.

Boundary rules:

- The runtime owns main tool id resolution, dedicated declaration ids, base Atome-tool filtering, and canonical `triggerMainToolInteraction` dispatch.
- It may synchronize latch state only through injected canonical latch APIs and may block selection-required tools only through the injected selection guard.
- It must not reintroduce hidden diagnostic tools, fallback activation, or duplicate main-tool handler tables.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral tool interaction contract.

### eVe Inline Tool Runtime APIs

Ownership: eVe closed Intuition inline tool and Finder panel bridge boundary.

Primary sources: `eVe/intuition/runtime/eve_intuition/finder_inline_runtime.js`, `eVe/intuition/runtime/eve_intuition/finder_tool_identity_runtime.js`, `eVe/intuition/runtime/eve_intuition/finder_inline_visual_runtime.js`, `eVe/voice/assistant/assistant_runtime.js`, and `atome/src/squirrel/ai/conversation_session.js`.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js`, `tool_window_bridge_runtime.js`, panel tool registration, main tool definitions, and atome edit footer tool invocation.

Verified entry points: `createFinderInlineRuntime`, `createFinderToolIdentityRuntime`, `createFinderInlineVisualRuntime`, `createInlineToolVisualRuntime`, `bootstrapEveAssistant`, and `requestConversationResponse`.

Boundary rules:

- Finder identity normalization and projection-instance recovery live only in `finder_tool_identity_runtime.js`.
- Disposable inline input styling lives only in `finder_inline_visual_runtime.js`.
- Finder inline open/close/search and panel wrapper behavior live only in `finder_inline_runtime.js`; callers must use returned functions instead of duplicating Finder DOM searches.
- AI input uses the shared Bevy editor and assistant runtime. The hidden legacy AI menu entry delegates to the same assistant toggle. Conversation dispatch uses the provider client and canonical MCP policies; no separate JSON-action executor remains.
- The runtime may project transient inline input DOM but must not create canonical Atome state, alternate Finder stores, or non-Bevy atom rendering paths.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral inline-tool bridge contract.

### eVe Atome Contextual Edit Runtime APIs

Ownership: eVe closed Intuition runtime for multi-Atome edit state, Bevy footer/outline projection, fixed contextual rail, canonical gestures, fullscreen, and tool invocation.

Primary sources: `atome_contextual_edit_runtime.js`, `atome_contextual_edit_model.js`, `atome_contextual_edit_registry.js`, `atome_contextual_rail_runtime.js`, `atome_contextual_rail_model_runtime.js`, and the existing tool definition/invocation owners.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js`; these are closed product runtime seams, not public Atome APIs.

Verified entry points: `createAtomeContextualEditRuntime`, `buildAtomeContextualEditTree`, `setAtomeContextualEditApi`, `getAtomeContextualEditApi`, and the composite `createAtomeEditFooterRuntime` migration facade.

Boundary rules:

- `atome_contextual_edit_runtime.js` owns the ephemeral editing registry and exposes `enter`, `activate`, `exit`, `toggleFullscreen`, and `readState`.
- When `rail_only` identifies a selected List/Matrix source, `record_action` is a single standard toggle backed by the existing live action-recorder definition and `{ mode: "live" }`; the capture palette children for key, audio, and video are not part of this internal projection.
- The visible footer, outlines, rail, palette expansion and vertical slider expansion are one BevyUI tree on the shared canvas; no DOM footer lifecycle, second canvas, or window-global state is allowed.
- A tool that remains lit declares its residence once in `eVe/intuition/tools/core/active_tool_registry.js` (`rail` | `menu`), never in the rail or the ribbon. `buildAtomeContextualEditTree({ activeSlots })` reads that list: the moved entries leave the ordinary level, one case per lit tool is pinned against `layout.bottom` (above the Atome handle, dominant-handed edge, never scrolling with the rail viewport), and the ordinary stack is pushed up by exactly the reserved height. The pinned case keeps the level node id `atome_contextual_tool_<key>` (`…_icon`), so handler, tool identity and pulse are shared. Stopping is the slot's own invocation path (`previousLatched`); a menu-resident lit tool never enters the rail.
- Footer move/resize uses canonical `drag.*` / `resize.*` intents and commits once at gesture end. Tool actions continue through the injected canonical tool invokers and selection guards.
- `tool_slider_builder.js` accepts horizontal or vertical orientation and owns the shared `collapsed`/`pressed`/`pinned`/`dragging` session contract with a 4 px threshold. Motion is relative and no-jump: a compact click pins open, a second compact icon/label click closes, a direct compact drag closes on release/cancel, and a rail drag from pinned state remains open.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral footer/tool-surface contract.

### eVe Basic UI Tool Registration Runtime API

Ownership: eVe closed Intuition runtime tool registration boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/basic_ui_tools_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` during boot registration.

Verified entry point: `registerBasicUiToolsRuntime`.

Boundary rules:

- The runtime registers basic UI/catalog tools only; it receives existing menu, panel, selection, text creation, matrix, orientation, and item-state callbacks by injection instead of creating alternate owners.
- Media transport registration remains delegated to `media_reader_tool_runtime.js`; this runtime only preserves the existing boot registration order.
- It must not mutate durable Atome state except through the injected existing creation/update callbacks already owned by the Intuition runtime and tool base.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral tool-registration contract.

### eVe Text Tool Runtime APIs

Ownership: eVe closed Intuition text Atome editing, creation, and background input boundaries.

Primary sources: `eVe/intuition/runtime/eve_intuition/text_tool_runtime.js`, `text_tool_editing_runtime.js`, `text_tool_create_runtime.js`, and `text_tool_background_runtime.js`.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js` during boot registration.

Verified entry points: `createTextToolRuntime`, `createTextToolEditingRuntime`, `createTextToolCreateRuntime`, `createTextToolBackgroundRuntime`.

Boundary rules:

- The composite runtime owns shared text-tool coordinator state and project-id resolution.
- Text editing owns focus, caret, provisional adoption, cleanup, buffered insert, and immediate commit helpers for text Atomes.
- Text creation owns text-tool mode state, menu toggle handling, drag create sessions, exact-frame creation, and project-scene text-edit entry.
- Background runtime owns project-background click and keyboard text creation routing through canonical `invokeTool` and text session APIs.
- These runtimes must not create fallback DOM renderers, bypass Atome commit/update APIs, or render atoms outside the Bevy/WebGPU canvas route.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral text editing/creation contract.

### eVe Panel Actions Runtime API

Ownership: eVe closed Intuition panel/action orchestration boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/panel_actions_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js`, main-menu composition, and boot registration.

Verified entry point: `createPanelActionsRuntime`.

Boundary rules:

- The runtime owns standard panel open routing, generated panel operation binding, canonical Home/Matrix/Delete/Undo/Orientation actions, and Intuition item enabled-state updates.
- It must use the injected panel surface/open-settle APIs and must not create alternate panel registries or tool buses.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral panel action contract.

### eVe Mystic Context Items Runtime API

Ownership: eVe closed Mystic/context menu item resolution boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/mystic_context_items_runtime.js`.

Exposure: JavaScript module exports consumed by `eVe/intuition/eVeIntuition.js` during Mystic context runtime installation and footer invocation wiring.

Verified entry points: `createMysticContextItemsRuntime`, `CONTEXT_BOUND_TRANSPORT_TOOL_IDS`, `resolveAtomeEditFooterDefinitionToolId`.

Boundary rules:

- The runtime owns Mystic item construction, mixed-selection/media/text/project context routing, and strict transport-bound extra input construction.
- It may dispatch through injected canonical delete/import/context-tool invokers only; it must not create a second tool bus or fallback transport route.
- The shared context-bound transport id set must stay here so footer and Mystic payload policies remain identical.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral context-menu contract.

### eVe Atome Edit Footer Selection Runtime API

Ownership: eVe closed Atome-edit footer selection and invocation payload boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/atome_contextual_rail_selection_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` and injected into footer row/child/definition runtimes.

Verified entry point: `createAtomeEditFooterSelectionRuntime`.

Boundary rules:

- The runtime owns footer selection normalization, publication, and `extraInput` selection/atome id payload construction.
- It may publish selection only through the existing SelectionAPI/eveToolBase/event surfaces; it must not create alternate canonical selection state.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral selection payload contract.

### eVe Context Tool Invocation Runtime API

Ownership: eVe closed footer/Mystic/main-ribbon context invocation boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/context_tool_invocation_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` and injected into footer/Mystic/main-ribbon handlers.

Verified entry point: `createContextToolInvocationRuntime`.

Boundary rules:

- The runtime owns unified context invocation normalization and main-ribbon definition invocation.
- It must delegate through the injected canonical `invokeToolFromUiButton`; no alternate tool bus, shim, or fallback invocation path is allowed.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral context invocation contract.

### eVe Intuition Boot Runtime API

Ownership: eVe closed Intuition boot, warmup, registration, and debug exposure boundary.

Primary source: `eVe/intuition/runtime/eve_intuition/boot_runtime.js`.

Exposure: JavaScript module export consumed by `eVe/intuition/eVeIntuition.js` at module boot.

Verified entry point: `installEveIntuitionBootRuntime`.

Boundary rules:

- The runtime owns boot-time window menu exposure, auth sync, panel surface registration, Mystic/contextual-edit/vector/draw installation, non-critical module warmup, UI tool registration, the closed contextual-edit module registry, and debug runtime installation.
- It opens the default Dashboard workspace only after the closed `ensureProjectBootstrapReady` contract has restored, loaded, and rendered the authenticated current project. The Dashboard remains the initial view but is projected over that resident project surface.
- It must receive all product callbacks by injection and must not own Bevy/WebGPU rendering, durable Atome state, or tool implementation behavior.
- A terminal renderer failure is painted by the closed boot failure surface owned by `eVe/intuition/runtime/eve_intuition/boot_failure_surface.js` (`presentBootFailureSurface`, idempotent by id, silent on recoverable failures). It is an internal module export consumed by the boot runtime only, not a public API.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral boot registration contract.

### eVe Selected Project Media Playback Runtime API

Ownership: eVe closed product runtime over the project scene and Atome audio boundaries.

Primary sources: `eVe/domains/media/selected_project_media_playback_runtime.js`, `eVe/intuition/runtime/eve_intuition/media_reader_tool_runtime.js`.

Exposure: JavaScript module exports consumed by the eVeIntuition media reader tool runtime; registered tool IDs `ui.media.reader`, `ui.animation.reader`, `ui.play`, `ui.pause`, and `ui.stop`.

Verified entry points: `runSelectedProjectMediaPlaybackAction`, `stopAllSelectedProjectMediaPlayback`, `registerMediaReaderToolRuntime`.

Boundary rules:

- The runtime resolves selected media from `project_scene_runtime` records because the cleaned project canvas route intentionally has no per-Atome media DOM host.
- Audio playback and extracted video-audio playback must go through `Squirrel.av.audio` and the Kira playback facade. Browser play actions must first call its ephemeral `unlockPlayback()` capability while the real user gesture remains active; it initializes the existing Kira/WASM output and is not an Atome mutation. Declared native/Tauri Kira runtimes skip this browser-only step. The route must not instantiate a second audio engine or enable Bevy audio.
- Project Audio Atome playback and extracted video-audio playback use Kira `play_instance`/`stop_instance` when available so pressing the play tool while media is active pauses the current voice and preserves a runtime-only position; the next play/toggle resumes from that position with `startSeconds`. For video Atomes, that position is read from the project timeline playback result so Bevy video decode and extracted audio resume from the same playhead. Explicit `stop` still clears the project playback runtime and resets progress.
- Browser video presentation uses the shared video decode pool plus disposable project-scene record updates so Bevy/WebGPU remains the visible route. The decode element is an implementation resource, not a visible Atome host or canonical media state.
- `media_reader_tool_runtime.js` is the closed eVeIntuition registration owner for the media/animation reader tools. It may call `setBevyVideoDecodePlayback(...)` for selected project video targets; `selected_project_media_playback_runtime.js` must not call that Bevy decode control directly.
- eVeIntuition must not route play/pause/stop/toggle through deleted `window.eveMtrackApi` transport methods, `scope=mtrack` forced transport, selected-group timeline loading, selected-group DOM video/audio sequence transport, or selected-Atome DOM `video/audio` transport. Active media transport must use selected project media or project automation; selected-group montage transport stays closed until the Bevy/WebGPU editor owns it.
- It must not persist playback frame data, mutate durable Atome properties, or use DOM media nodes as canonical selection/project state.

Boundary status: Closed product runtime API. Public promotion would require a product-neutral AV transport contract plus native presenter capability tests.

### Security and Sync APIs

Ownership: Atome open.

Primary sources: `atome/security/trusted_keys.js`, `atome/security/serverVerification.js`, `atome/security/serverVerificationCrypto.js`, `atome/security/serverVerificationState.js`, `atome/security/syncQueue.js`, `atome/security/sync_queue_constants.js`, `atome/security/sync_queue_storage.js`, `atome/security/sync_queue_items.js`, `atome/security/sync_queue_credentials.js`, `atome/src/squirrel/security/bootstrap.js`, `atome/src/squirrel/security/token_vault.js`, `atome/src/squirrel/apis/unified/sync_engine.js`, `server/wsSyncRuntime.js`, `server/userVaultRouter.js`, and `server/syncSharingService.js`.

Contract responsibilities: trusted server metadata, fingerprint lookup, server
verification, isolated sync queues/cursors, token vault bootstrap, authenticated
`/ws/sync` replay, and directory invalidation. The retired HTTP `cloudSync.js`
API is unavailable. Runtime validation status is recorded in `FRAMEWORK_STATE.md`.

Verified runtime surface: `SyncEngine.install`, `retry`, `disconnect`,
`requestSync`, `observeEvents`, `subscribe`, `getSource`, and `getState`.
`/ws/api` exposes `sync:push`, `sync:get-pending`, commits, batches, sharing, and
directory commands. `/ws/sync` is server-driven delivery/replay and has no pull
or mutation action. Incoming control frames are processed serially per
connection, preserving their arrival order and bounding vault replay admission;
an internal processing rejection closes only the affected connection with
`sync_processing_failed`. `UserVaultProvider` starts workers without inheriting
the orchestrator's Node execution flags, waits for their graceful exit, and
force-stops only an owned unresponsive child after the bounded timeout.
`userVaultProcess.js` treats IPC disconnection as server-owner termination.

Boundary status: Open framework security. eVe may call these contracts but must not own product-specific bypasses.

### Communication Service APIs

Ownership: Atome open services with eVe closed UI consumers.

Primary sources: `atome/src/squirrel/mail/bootstrap.js`, `atome/src/squirrel/mail/service.js`, `atome/src/squirrel/mail/icloud_connector.js`, `atome/src/squirrel/mail/icloud_connector_normalization.js`, `atome/src/squirrel/contacts/bootstrap.js`, `atome/src/squirrel/contacts/service.js`, `atome/src/squirrel/contacts/service_contact_utils.js`, `atome/src/squirrel/calendar/bootstrap.js`, `atome/src/squirrel/calendar/service.js`, `atome/src/squirrel/bank/bootstrap.js`, `atome/src/squirrel/bank/service.js`.

Exposure: `createGlobalMailApi`, `bootstrapGlobalMail`, `createGlobalContactsApi`, `bootstrapGlobalContacts`, `createGlobalCalendarApi`, `bootstrapGlobalCalendar`, `createGlobalBankApi`, `bootstrapGlobalBank`, plus runtime globals installed on the provided environment.

Verified mail methods: `ingest`, `list`, `read`, `markRead`, `markUnread`, `search`, `nextUnread`, `summarize`, `replyDraft`, `composeDraft`, `getDraft`, `configureIcloudConnector`, `connectorStatus`, `archive`, `delete`, `send`, `syncApply`, `syncInitial`, `syncIncremental`, `syncPull`, `ensureReady`, `syncStatus`, `buildReadout`, `voiceReadout`.

Verified contacts methods: `registerSource`, `unregisterSource`, `sources`, `configureMacosSource`, `ensureMacosSource`, `importSource`, `importMacosContacts`, `configureIcloudConnector`, `importIcloudContacts`, `pushContactToIcloud`, `ensureReady`, `list`, `createLocalContact`, `updateLocalContact`, `deleteLocalContact`, `search`, `read`, `syncInitial`, `syncIncremental`, `syncPull`, `syncStatus`, `openPanel`, `closePanel`.

Contacts persistence contract: `createGlobalContactsApi({ env })` binds the local `eve_contacts_local` primary source to `env.localStorage` when available. `list({ source_id: 'eve_contacts_local' })` rehydrates from that local source synchronously on a recreated service so dashboard/contact-panel reload paths can read persisted local contacts before an async sync call. Local contacts are exposed as `source_writable: true` and `read_only: false`; remote/directory contacts must not be rewritten through local aliases.

Verified calendar methods: `registerSource`, `unregisterSource`, `sources`, `sync`, `syncInitial`, `syncIncremental`, `syncPull`, `syncStatus`, `search`, `today`, `next`, `read`, `create`, `update`, `delete`, `openPanel`, `closePanel`.

Calendar panel contract: the Bevy Calendar surface loads through the unified service, subscribes to `CalendarAPI.on`, and rebuilds only disposable projection state. Dashboard-side event title/date commits appear while open and after close/reopen; no panel cache is canonical.

Verified bank methods: `ingestAccounts`, `ingestTransactions`, `accounts`, `balance`, `transactions`, `summary`, `searchTransactions`, `findPayer`, `spendingByPeriod`, `topMerchants`, `recurringPayments`.

Boundary status: Open service contracts. eVe panels are closed consumers and should stay replaceable.

Authenticated account messaging uses `AdoleAPI.communication.send({ targetUserId?, targetPhone?, message })`.
It prepares the Fastify identity, sends one `/ws/api` `direct-message`, and has no
REST or legacy command fallback. Fastify persists the parsed message once in the
recipient `message_stack` / `notification_stack` before realtime delivery or offline
queueing. eVe Communication uses the internal `eve-comm-share` envelope so an empty
subject, attachment request references, and an optional generic Dashboard News record
survive offline reconnect. Recipient-side realtime dispatch is `adole-new-message`;
the durable stack remains authoritative and deduplicates by message id.
`AdoleAPI.communication.removeNotification({ notificationId })` sends `notification-stack`
`action:'remove'`: it removes the item from the caller's own stack only (other recipients
and the sender keep theirs); there is no "delete for everyone" route. The patch whitelist
is `unread`, `archived`, `status`, `todo`, `urgent` (booleans except `status`). In eVe,
`window.dispatchEvent(new CustomEvent('eve-comm-send', { detail: { draft, settle } }))`
sends a self-contained draft (`{ message, recipients, reply }`) through the same chain
without touching the Communication compose state; `settle({ ok, error })` reports it.
Read/archive state is persisted by the authenticated self-only
`AdoleAPI.communication.updateNotification({ notificationId, patch })` action over
`/ws/api`; Fastify accepts only `unread`, `archived`, and `status`, then returns the
updated authoritative notification stack. Generic Atome commits are not a substitute
for this legacy account-stack owner.

### AI and MCP APIs

Ownership: Atome open.

Primary sources: `atome/src/squirrel/ai/agent_gateway.js`, `atome/src/squirrel/ai/default_tools.js`, `atome/src/squirrel/ai/default_tools_adole.js`, `atome/src/squirrel/ai/default_tools_bank.js`, `atome/src/squirrel/ai/default_tools_calendar.js`, `atome/src/squirrel/ai/default_tools_contacts.js`, `atome/src/squirrel/ai/default_tools_mail.js`, `atome/src/squirrel/ai/default_tools_share.js`, `atome/src/squirrel/ai/model_catalog_registry.js`, `atome/src/squirrel/ai/model_catalog_refresh.js`, `atome/src/squirrel/ai/provider_client.js`, `atome/src/squirrel/ai/trace_store.js`, `atome/src/squirrel/atome/mcp.js`, the internal `mcp_*` helper/handler modules, and `atome/src/squirrel/atome/runtime_tool_resolution.js`.

Exposure: `AtomeAI` tool registration, MCP protocol runtime, model catalog, provider client, trace store, and the default tools coordinator plus domain registration modules that bridge to Adole, communication services, and eVe runtime tools. The MCP public surface remains the global `handleAtomeMCPRequest` and `handleAtomeMCPRequestAsync`; the `mcp_*` modules are internal implementation owners for core state, security policy, platform bridges, resources/prompts, runtime invocation, communication helpers, and handler groups.

Verified responsibilities: tool registry, audit log, proposals, idempotency, risk tiers, toolchain limits, output schemas, parameter validation, MCP events, operations, confirmations, proposals, rate limits, sandbox profiles, security journal, and provider-owned AI model catalog refresh. The latter uses each configured provider's official list endpoint hourly, on foreground return, whenever Home reopens with a stored key, and when the non-empty Home API-key field loses focus; a successful remote response is authoritative rather than combined with embedded suggestions.

Boundary status: Open orchestration contract. Calls into eVe tool runtime must go through registered runtime capability boundaries.

### Voice APIs

Ownership: Atome open voice runtime.

Primary sources (explicit retired entries are historical): `atome/src/squirrel/voice/bootstrap.js`, `atome/src/squirrel/voice/service.js`, `atome/src/squirrel/voice/assistant_session_controller.js`, `atome/src/squirrel/voice/tts_runtime.js`, the internal voice helper/runtime modules, `atome/src/squirrel/voice/orchestrator.js`, `atome/src/squirrel/voice/tool_router.js`, `atome/src/squirrel/voice/ai_planner.js`, and `retired:atome/src/squirrel/voice/home_surface.js`.

Exposure: voice bootstrap modules, runtime services, tool router, communication surfaces, AI planner, orchestrator facade, home surface contract, local TTS preload, and ephemeral voice-frame subscriptions. `subscribeTtsFrames(listener)` publishes session/sample/RMS/peak/phoneme/vowel/confidence/progress and `subscribeInputFrames(listener)` publishes only session-scoped microphone RMS/activity; neither writes durable journal state. Native STT exposes `prepare(language)`, `onAudioLevel(listener)`, and `onDiagnostic(listener)` through `stt_api.js`: preparation loads the configured model without opening the microphone, audio level forwards the RMS of the already-open recognizer stream, and diagnostics forward native model/audio stages into centralized voice telemetry. Native final recognition results preserve ranked `alternatives` with their real confidence values. `writeVoiceDiagnostic` emits one secret-redacted structured record to the WebView console and the existing iOS/Tauri native log bridges. The removed main-handle DOM bridge is not public API.

Verified turn and planning contract: the assistant is half-duplex because the native CPAL input has no acoustic echo cancellation. Local TTS completes first, `voice.duplex.guard` records a bounded 320 ms acoustic drain, and only then does exactly one `user_turn` STT capture open. `voice.endpointing.decision` records the provider reason, silence duration, text-stability duration, and final transcript status. French Vosk scores remain monotonic across their native scale; lexical hints match complete words, deduplicate case variants, and include at most 64 compact visible user Atomes. An explicit non-negated pixel-relative move is planned locally as `runtime_v2 -> ui.move/move.relative`, while execution still uses the canonical MCP/runtime route. Targeting accepts explicit selection, exact type/text, normalized unique match, or one bounded fuzzy visible label; missing or ambiguous targets produce a clarification and no mutation. All other requests receive one compact scene copy and an utterance-ranked bounded tool catalog.

Boundary status: Open voice orchestration with closed eVe surfaces injected where product UI is required. The eVe-owned `__eveLoadUserProfile` bridge supplies the authenticated profile to provider resolution and re-establishes access to the existing device-scoped Home vault before each lookup; it remains a read-only profile lookup, not a second profile or secret store. Voice mutations must route through tool/runtime contracts, not direct state mutation.

### Audio and AV Runtime APIs

Ownership: Atome open.

Primary sources: `atome/src/application/audio_runtime/audio.facade.js`, `atome/src/application/audio_runtime/audio_playback_api.js`, `atome/src/application/audio_runtime/audio_recording_api.js`, `atome/src/application/audio_runtime/av_contracts.js`, `atome/src/application/audio_runtime/play_record_contract.js`, `atome/src/application/audio_runtime/play_record_core.js`, `atome/src/application/audio_runtime/play_record_media_source.js`, `atome/src/application/audio_runtime/record_audio_api.js`, `atome/src/application/audio_runtime/sample_accurate_recording.js`, `atome/src/application/audio_runtime/runtime_audio_backend.js`, `atome/src/application/audio_runtime/auv3_host_playback.js`, `atome/src/application/audio_runtime/stt_api.js`.

Exposure: `Squirrel.av.audio`, `Squirrel.av.devices`, `Squirrel.av.codec`, `Squirrel.av.graph`, the `window.record_start` / `window.record_stop` bridge, and the typed sample-accurate capability/validation helpers.

Verified facade methods: `on`, `off`, `set_backend`, `get_backend`, `get_runtime`, `detect_and_set_backend`, `create_clip`, `destroy_clip`, `play`, `play_instance`, `stop`, `stop_instance`, `stop_clip`, `jump`, `set_param`, `map_midi`, `add_marker`, `remove_marker`, `set_marker_follow_actions`, `clear_marker_follow_actions`, `query_clip`, `createRecordingSession`, `prepareRecordingSession`, `armRecordingSession`, `startRecordingSession`, `stopRecordingSession`, `listAudioInputs`, `listAudioOutputs`, `selectAudioInput`, `selectAudioOutput`, `createAudioProfile`, `createAudioNode`.

Verified AUv3 host playback methods: `shouldUseAuv3HostPlayback`, `auv3PlayMedia`, `auv3StopMedia`, `auv3StopSlot`, `auv3ClearAuxSlots`, `auv3StopNode`.

Verified sample-accurate recording contract: `AUV3_RECORD_START_CLOCK_REFERENCE`, `AUV3_RECORDING_TIMELINE_CLOCK_ID`, `AUV3_RECORDING_SOURCE`, `SAMPLE_ACCURATE_RECORDING_ERROR_CODES`, `SampleAccurateRecordingError`, `resolveSampleAccurateRecordingCapability`, `validateSampleAccurateRecordingRequest`, and `normalizeSampleAccurateRecordingResult`. Exact overdub is opt-in only: the public exact flag is normalized to an explicit native `requireSampleAccurate: true` and is never inferred from source or result metadata. The sole supported exact source is AUv3 `plugin_input`, captured on `clock_id: "auv3.render"` / `clock_reference: "record_start_render_quantum"`, while timeline placement is anchored on `timeline_clock_id: "auv3.host_transport"`; `plugin` remains generic plugin-output/mix capture. The native `record_started` event supplies the non-empty `clock_epoch` and `timeline_origin_frame`; stop must return that same epoch/origin plus integer `recording_start_frame`, real earlier `playback_start_frame`, equal `playback_observed_frame`, frame count, strictly positive `input_latency_frames`, `output_latency_frames`, `roundtrip_latency_frames`, and `record_offset_frames_applied`, with zero overrun/discontinuity counts. Exact normalization requires `playback_start_frame < recording_start_frame`, `playback_observed_frame == recording_start_frame`, `roundtrip_latency_frames == input_latency_frames + output_latency_frames`, and `record_offset_frames_applied == roundtrip_latency_frames`. Canonical placement is `timeline_origin_frame - roundtrip_latency_frames`, clamped with matching `source_in_frame`; playback-start deltas are evidence, not an extra placement offset. Browser, desktop/Tauri, ordinary iOS app, microphone/plugin-output capture, and exact video capture return the typed `av_sample_accurate_overdub_unsupported` capability error until a measured common duplex clock or audio-sample PTS mapping exists. Their generic recording routes remain available and must not be described as sample-accurate overdub.

Native audio stop validation failures that already produced a terminal file/result carry `recordingTerminal`, relative/absolute paths, `discarded`, and `discard_error`, and keep explicit discard recovery available. `audio_core_storage.js` uses the existing `AtomeFileSystem.deleteFile` boundary to remove that physical file; timeout or deletion failure is returned as a typed retryable error, never a false discard acknowledgement or a second native `recordStop`. `audio_api.js` creates one `audio_recording_*` project Atome ID before start, exposes and reuses it through stop/persistence retries, and rejects stop-only substitution with `audio_recording_project_identity_mismatch`. The native recorder core closes producer admission, waits for active pushes, drains its ring writer, then finalizes the WAV header so the final accepted quantum is included in the contractual frame total.

Boundary status: Open media runtime contract. eVe media and MTraX code should consume this facade for product playback/recording instead of owning engine semantics.

Known constraints: `play_record_core.js` must stay focused on runtime orchestration; public contract constants and source canonicalization are owned by dedicated modules.

### eVe Tool Runtime APIs

Ownership: eVe closed.

Primary sources (explicit retired entries are historical): `eVe/intuition/tools/core/tool_registry.js`, `eVe/intuition/tools/core/tool_runtime.js`, `eVe/intuition/tools/core/tool_instances.js`, `eVe/intuition/tools/core/tool_definition_ssot.js`, `eVe/intuition/tools/core/tool_interaction.js`, `retired:eVe/intuition/tools/index.js`, `eVe/intuition/runtime/shared_project_override_runtime.js`, `eVe/intuition/runtime/implicit_gesture_commit_runtime.js`, `atome/src/squirrel/components/tool_slider_builder.js`, `eVe/intuition/shared/slider_tool_content.js`, `eVe/intuition/shared/slider_tool_dom.js`, `eVe/intuition/shared/tool_drag.js`, `eVe/intuition/projection/button.js`, `eVe/intuition/tools/ui/tool_button_factory.js`, `eVe/intuition/tools/ui/tool_button_params.js`.

Exposure: closed product runtime installed under `window.atome.tools`, plus tool registry/runtime module exports.

Verified responsibilities: tool definition registration/update, protected system-tool contract reconciliation, tool invocation, action routing, tool instance creation, persistence flows, Finder/tool projection helpers, latch, selection propagation, interaction routing, main view-mode intention routing through `tool.main.view` plus `ui.view.mode.list`, `ui.view.mode.table`, and `ui.view.mode.natural`, main mode-palette intention routing through `tool.main.mode` plus `tool.main.perform`, `ui.mode.edit`, and `ui.mode.consume`, the visible time-palette calendar route through `tool.main.time` plus `ui.calendar.panel`, and consumption of the canonical Atome-owned product-tool slider runtime. `tool_runtime_registered_handler.js`, `tool_runtime_atome_ops.js`, `tool_runtime_creator_media.js`, and `tool_runtime_context.js` own registered-handler bridge state, bootstrap Atome operations, creator media sizing, and runtime context construction consumed by `tool_runtime.js`; they remain internal eVe implementation modules, not new open APIs. `tool_button_params.js` owns normalized/serialized tool-button parameter payloads consumed by `tool_button_factory.js` and `menu/core/toolbox_runtime.js`. `shared/tool_drag.js` owns the canonical `application/x-eve-finder-record` MIME constant and active tool-drag session payload writes. Finder/tool drag payloads between `finder.js` and `project_drop.js`, main toolbox drags, Mystic drags, projection strip drags, ribbon drags, and Atome-editor footer tool drags in `eVeIntuition.js` use only that MIME contract plus the active tool drag session, not a `text/plain` / `eve-tool:` mirror payload. Deleted MTraX tool IDs (`tool.main.mtrack`, `ui.mtrack.panel`, `ui.mtrax.open`, `ui.mtrack.clip_selection`, `ui.automation`, `ui.split`, `ui.join`, `ui.timeline_split`, `ui.crop`, `ui.mute`, `ui.solo`) are not registered by `tool_runtime.js`, `eVeIntuition.js`, or tool-latch alias groups. `ui.move` is not an MTraX clip API; it is owned by `tool_runtime.js` as the generic `v2_move` Finder/arrange route and must persist position plus parent/project metadata through Atome commit props. `ui.delete.selection` is the project delete/black-hole action and must not call deleted MTraX timeline or SVG-layer delete APIs; `delete.js` owns the action/drop wiring, `delete/blackhole_runtime.js` owns sanitized delete/restore commits plus Bevy project-scene cleanup/update, and `delete/panel_view.js` owns row rendering. Delete-panel row restore controls use the shared eVe button component, may not expose deleted Atome ids through row `data-*` metadata, and use only the canonical `application/x-eve-atome` drag payload rather than text MIME restore fallbacks; delete cleanup must resolve DOM removal through canonical `getAtomeElement(...)` rather than raw legacy DOM ids. `window.eveSvgLayerApi` is project-SVG-layer only; the layer panel must not read, select, add, or delete MTrack preview SVG layers through deleted `window.eveMtrackApi` routes. Tool buttons and UI interaction dispatch must not intercept play/pause/stop into deleted `window.eveMtrackApi` transport methods.

`runtime.tools.list` exposes each runtime tool's identifier, description, declared actions, and cloned input schema. The canonical `ui.move` definition includes `move.relative` with required `atome_id`, numeric `delta_x`, and numeric `delta_y` pixel inputs. Runtime bootstrap reconciliation upgrades persisted definitions when those source contracts change. Execution reads canonical position, rejects missing, hidden, locked, or invalid targets, and performs exactly one `window.Atome.commit` with the resulting `left` and `top`; it never mutates an ambiguous target.

Verified shared slider runtime responsibilities:

- `atome/src/squirrel/components/tool_slider_builder.js` exports the canonical slider DOM/data-role selector contract, shared direct-drag controller, 4 px click/drag threshold, pinned/transient state, and expanding-square slider-tool runtime behavior.
- `eVe/intuition/shared/slider_tool_content.js` is the product wrapper that injects ribbon text tokens into the Atome-owned tool-slider runtime.
- `eVe/intuition/shared/slider_tool_dom.js` is a compatibility re-export surface for existing eVe imports; the unused `slider_direct_drag.js` re-export shim was removed.
- `eVe/intuition/shared/bevy_ui_tool_slider.js` is the canvas presentation adapter over the same canonical session transitions; it does not own a second slider behavior.

Verified shared project override entry points: `createSharedProjectOverrideRuntime`, `fetchSharedOverrideAtomes`, `setSharedProjectOverride`, `getSharedProjectOverride`, `removeSharedProjectOverride`, `listSharedOverrideIdsForProject`, `resetSharedOverrides`.

Verified implicit gesture commit entry points: `createImplicitGestureCommitRuntime`, `emitCommitBatch`, `resolveImplicitGestureDispatch`, `shouldSkipImplicitGesturePhase`.

Boundary status: Closed product API. Atome AI/MCP may invoke it only through explicit runtime tool resolution and capability checks.

Known constraints: `tool_runtime.js` is a critical oversized legacy file. Do not expand it without reduction ownership.

### eVe Molecule APIs and Removed MTraX APIs

Ownership: eVe closed.

Primary sources: `eVe/core/media_engine/`, `eVe/intuition/tools/molecule/`, `eVe/intuition/tools/molecule/runtime.js`, `eVe/domains/media/api/audio_api.js`, and `eVe/domains/media/shared/extracted_video_audio_source.js`.

Exposure: `window.Molecule`, `window.eveMediaApi`, and JavaScript module exports for internal runtimes. The MTraX window APIs (`window.eveMtrackApi`, `window.open_mtrack_panel`, `window.close_mtrack_panel`) are deleted and must not be used as active integration surfaces.

Atome-to-Molecule open requests are routed through a source-layered request path (`atome_mtrack_open_request`) rather than being semantically bound to the originating double-click event. The current UI trigger may still be double-click, but downstream MTraX/Molecule open handling must key on the request source layer so the trigger can be moved later without changing panel/runtime semantics. This route must not auto-create MTraX group Atomes; until the Bevy/WebGPU editor rewrite lands, it may only resolve existing group/timeline context or fail explicitly.

Verified entry points:

- Molecule engine/API: `createMoleculeEngine`, `ensureMoleculeEngine`, `getMoleculeCommandCatalog`, `createMoleculeApi`, `ensureMoleculeApi`, `ensureMoleculeMediaRuntime`.
- Molecule tool modules: track-type registry, timeline schemas, reducers, session registry, persistence controller, media resolver, panel runtime, gestures, recording, nesting, and multi-instance controllers.
- Molecule track-type registry: `DEFAULT_MOLECULE_TRACK_TYPE_REGISTRY`, `createMoleculeTrackTypeRegistry`, `MOLECULE_TRACK_TYPE_IDS`, `MOLECULE_CLIP_TYPE_IDS`, `isMoleculeTrackKind`, and `isMoleculeClipKindAllowedOnTrack` are internal kernel exports. They own built-in video/audio/image/text/automation track definitions and clip compatibility for Molecule; they are not public Atome APIs.
- Molecule time model: `DEFAULT_MOLECULE_SAMPLE_RATE`, `DEFAULT_MOLECULE_TEMPO`, `normalizeTimelineSampleRate`, `frameToSeconds`, `secondsToFrame`, `normalizeTempoMap`, `createTimeReference`, `secondsToMusical`, `musicalToSeconds`, and `normalizeTimelineTimeModel` are internal kernel exports. Molecule snapshots carry safe-integer frame projections at the timeline sample rate alongside seconds/musical editing projections. The recording path accepts and validates integer frames and derives its seconds fields from those frames; it does not recover precision from wall-clock timestamps or a guessed duration.
- Molecule timeline operation API: `window.eveMoleculeTimelineApi` exposes the active group timeline bridge (`readGroupTimeline`, `applyGroupTimelineOperation`, `applyGroupTimelineBatch`, `listOpenGroupTimelines`) plus `readGroupTimelineRecording`, `startGroupTimelineRecording`, `stopGroupTimelineRecording`, and `cancelGroupTimelineRecording`, all backed by the active Molecule session. `eve.timeline.*` AI tools and `ui.timeline.*` runtime tools delegate to this bridge; MCP policy gates them through `timeline.read` and `timeline.write`.
- Molecule recording API: `createMoleculeRecordingSession` owns arm/track validation, start/stop/cancel/dispose, common-clock validation, frame-exact clip construction, and the sole `session.apply("molecule.clip.add", clip)` commit. `createMoleculeRecordingCaptureAdapter` / `installMoleculeRecordingCaptureAdapter` in `eVe/domains/media/api/audio_api.js` reuse the existing product audio controller and persisted audio Atome path. The adapter explicitly requests exact mode, locks the native AUv3 epoch and host-transport origin returned by `plugin_input` start, then validates both clocks, the real playback-start/same-quantum observation proof, strictly positive duplex latency, and `timeline_origin_frame - roundtrip_latency_frames` placement at stop. It refuses exact video and every non-AUv3-`plugin_input` exact request with `av_sample_accurate_overdub_unsupported`; generic capture, including `plugin` output/mix recording, continues through the normal audio/video facades.
- Molecule timeline render API retired 2026-10-14 (`renderTimelineScene`, `clearTimelineScene`, `setGroupTimelineSceneVisibility`, `openGroupTimeline({ render_scene })`): the Timeline view builds its own BevyUI tree. Timeline transport (2026-10-14): `playGroupTimelineTransport({ group_id, start_frame, record_armed?, open_ended?, count_in_end_frame? })` (open-ended = a take on the fly, runs until Stop; armed Record regions extend the playback; the metronome track clicks when `settings.metronome_enabled`, and over the count-in either way); `readGroupTimelineTransport` adds `sample_accurate`. 2026-10-15: `busy_record_sources?: string[]` (a take on the fly passes its input; armed regions of those sources stay armed instead of failing busy); the Timeline view's Play is open-ended unless the loop ribbon bounds it. Kernel placement helpers `nearestFreeStart(clips, candidate, ignoreId, rate, { direction })` and `freeGapAround(...)` (`kernel/collisions.js`, re-exported by `kernel/index.js`) answer where a block fits without overlap; the refusal policy is unchanged. `startGroupTimelineGenericRecording` accepts `timeline_end_frame` (the take is cut to the window) and returns `sample_accurate`; its result carries `placement` and `timing_guarantee: 'engine_render_clock'` when the take was placed on the engine clock.
- Audio engine sample-accurate API (2026-10-14): facade/backend methods `render_clock()` (Web: `{frames_rendered, base_context_frame, base_segments, sample_rate, discontinuities, block_frames}`; native: promise of `{host_clock, frames_rendered, anchor_frame, anchor_host_ns, played_frame_now, …}`), `shared_context()` (Web AudioContext), `schedule_instance(voice)` and `schedule_instances(voices)` (start on an exact rendered frame; resolve with the frames). WASM exports `audio_schedule_instance`, `audio_render_clock`, `audio_shared_context`; Tauri commands `audio_schedule_instance`, `audio_schedule_instances`, `audio_render_clock`; `audio_record_start` accepts `input_device_name`, `audio_record_stop` returns `capture_clock`. Executor: `MediaPlaybackAudioExecutor.scheduleVoices`, async `readRenderClock`; `record_audio(…, { audio_context })` opens the Web recorder on the playback context. Input: `media_input_devices.js` `listMediaInputs`, `selectMediaInput`, `mediaInputConstraint`, `mediaInputDeviceName`, `readInputCalibrationSeconds`.
- Molecule Track updates accept canonical `gain` in `[0,2]` and `pan` in `[-1,1]`. `PlayRecordCore.setVoicePan` and `AudioPlaybackAPI.setVoiceParam({ paramId: "pan" })` expose the ephemeral playback parameter through `audio_set_pan`; play-instance payloads carry their initial `pan` alongside gain/rate.
- Molecule session stores (V1.8): `window.Atome.moleculeStores = { projectStore, eventStore }` is installed at boot by `eVe/intuition/runtime/molecule_stores.js`. A Molecule timeline persists canonically inside the Atome model — the owner group atome carries the snapshot in its `molecule_timeline` property, written through `window.Atome.commit`, so each timeline edit is one deterministic Time Machine entry (D6). `openGroupTimeline`/`applyGroupTimelineOperation`/`applyGroupTimelineBatch` now run the real session backed by these stores, persisting + re-rendering the canvas on every committed edit; there is no parallel timeline store.
- Removed MTraX window API: the deleted `createMtrackWindowApiRuntime` / `createWindowApiBridgeRuntime` family no longer owns transport, recording, clip editing, SVG-layer, preview, or visual style routing.
- MTraX ruler rendering helpers: `ruler_canvas_runtime.js` exposes internal major-step and visible tick-window helpers for canvas-backed ruler rendering. This is a rendering implementation boundary, not a public timeline API.
- DOM projection guardrails: `npm run check:dom-projection-guardrails` scans maintained DOM fixtures under `tests/fixtures/dom` by default; pass `--paths` to audit explicit legacy/debug captures.
- Media projection helpers: `eVe/domains/media/shared/media_projection_state.js` exposes internal host-local media source and identifier readers/writers for renderer binding. This is not a durable media API and must not replace Atome properties, media stores, or persistence services.
- Media API shared helpers: `eVe/domains/media/api/media_api_shared.js` remains the import facade for media capture/playback API helpers; `media_api_auth.js` owns auth/backend URL/protected streaming query helpers, and `media_api_local_availability.js` owns local media synchronization and availability checks. These helpers expose `/api/uploads`, `/api/recordings`, and `/api/extract-audio` handling only through the maintained media API route contracts and must not reintroduce MTraX media naming or fallback media routes.
- Asset-box upload facade: `eVe/domains/media/asset_box.js` keeps the internal product imports used by project-drop/background/contact tools (`inferUploadAtomeType`, `looksLikeSvgUploadShape`, `createUploadAtome`, `sendFileToServer`) while delegating runtime/auth resolution to `asset_box_auth.js`, upload/download transport to `asset_box_upload_transport.js`, Atome persistence/listing to `asset_box_atome_store.js`, media type/dimension inference to `asset_box_media.js`, and disposable upload-panel UI to `asset_box_panel_dom.js` / `asset_box_panel_render.js`. These APIs write plain media Atomes through the canonical commit path and must not introduce MTraX grouping or fallback media routes.
- Media Atome integrity helpers: `eVe/domains/media/shared/media_atom_integrity.js` exposes internal validation and normalization for project media Atomes before persistence/rendering. It enforces stable source, audio/video duration, visual refs, and pending visual status while preserving the separation between Atome `kind` and renderable `media_kind`.
- Historical snapshot (retired owner; not current availability evidence): Preview registry helpers: `retired:eVe/domains/mtrax/preview/preview_registry_runtime.js` exposes the internal derived-cache API used by clip preview renderers (`register`, `get`, `release`, `has`, `rebuildFromState`). The API returns opaque `preview_*` identifiers for DOM projection and must not be treated as canonical media state.
- Group projection state helpers: `eVe/intuition/shared/group_state_runtime.js` exposes host-local group steps, timeline, and preview readers/writers for renderers. These helpers are an internal projection boundary only; durable group data must still come from Atome properties and timeline persistence APIs.
- Historical snapshot (retired owner; not current availability evidence): MTraX karaoke detail: `detail_runtime.js` owns domain detail state and mutation application; `detail_record_schedule_state.js` owns the selection-only record-schedule detail projection. The Intuition detail panel keeps its closed UI action registration in `retired:eVe/intuition/tools/detail_actions.js` for `ui.detail.karaoke.apply`, `ui.detail.record.toggle`, and `ui.detail.timecodes.toggle`; those actions remain UI/tool-gateway surfaces and must not bypass the karaoke host API or canonical tool runtime.
- MTraX dropped-video import: `addClipFromEntry` keeps the public drop entry point and delegates linked audio creation to the existing descriptor media resolver with `audio_source_role: video_audio`.
- Recording persistence and dropped/recorded clip imports must forward the active project id into media Atome creation when they create or reuse a source Atome, so audio/video recordings appear on the current project through the canonical commit/render path. Direct audio/video recording facades must also project the committed recording Atome through `project_media_atome_renderer.js`; pending source-less recording Atomes are not Bevy-projected until a renderable source exists. Browser and Tauri WAV recording store canonical waveform peaks on `audio_recording` Atome properties before Bevy texture generation; imported audio can derive waveform peaks by decoding its normalized source.

Transport contract: Molecule `play()` resumes from the current transport position when no explicit `startSeconds` value is supplied. MTraX `playTimeline()` starts from the current playhead and must not rewind at play start. Same-group timeline reloads triggered as part of play preserve the current playhead and must not issue an internal stop before play. `startSeconds: 0` remains an explicit Molecule rewind request, while user-visible `stop()` is the transport command that resets position to zero.

Boundary status: Closed product media workflow. Public promotion requires a deliberate Atome media contract and tests.

Known constraints: MTraX/Molecule naming remains transitional and is tracked in later execution tasks.

## Public, Semi-Public, and Internal API Inventory

Classification rules:

- Public: intended runtime, server, framework, MCP, or product-facing entry point. These APIs may be called across ownership boundaries when their boundary status allows it.
- Semi-public: exported or globally installed for a specific subsystem, integration, test harness, or product runtime. These APIs are reusable only inside the documented owner and must not be treated as stable framework contracts without promotion.
- Internal: helpers, adapters, implementation classes, test utilities, debug probes, generated diagnostics, or feature-local runtimes. These APIs must be used only through their owning public or semi-public facade.
- Status: To verify: visible surface exists, but stability, ownership, or intended callers require targeted review before use.

### Public APIs

#### Atome Squirrel Module API

Visibility: Public.

Evidence: module exports in `atome/src/squirrel/apis.js`.

Public entry points:

- `wait`
- `current_platform`
- `dataFetcher`
- `render_svg`
- `fetch_and_render_svg`
- `resize`
- `strokeColor`
- `fillColor`
- `sanitizeSVG`
- default `Apis` object containing the same entries.

Owner: Atome open.

Use before creating: product-neutral framework utility helpers.

Do not duplicate in: eVe product helpers or local tool utility modules.

#### Selection Runtime API

Visibility: Public runtime surface.

Evidence: `window.SelectionAPI` is created by `atome/src/squirrel/apis/essentials.js`; eVe reads it through `eVe/intuition/runtime/selection.js` and `eVe/intuition/runtime/selection_snapshot.js`.

Verified entry points: `select`, `clear`, `selected`, `last`, `isSelected`, and selectable object helpers installed by `enhanceSelectable`.

Owner: Atome open runtime surface with eVe closed consumers.

Use before creating: selection state readers or writers for UI/tool flows.

Status: To verify before mutation because selection is shared by product UI and runtime tools.

#### Public Adole Browser API Details

Visibility: Public runtime API.

Evidence: `AdoleAPI` module/global use in `atome/src/squirrel/apis/unified/adole_apis.js` and eVe consumers.

Public namespaces:

- `auth`
- `projects`
- `activities`
- `atomes`
- `sharing`
- `sync`
- `machine`
- `security`

Runtime rule: in Tauri, Adole `atomes` project-state reads use the active local `/ws/api` connection. They must not issue a secondary HTTP state read or silently switch to loopback Fastify.

Owner: Atome open.

Use before creating: authenticated user, project, activity, atome, sharing, sync, machine, or security browser calls.

Do not duplicate in: eVe tool modules or product stores.

Status: Public, with route details and legacy breadth to verify before mutation.

#### Atome Commit and Current-State Runtime API

Visibility: Public runtime API.

Evidence: `eVe/core/atome_commit.js` attaches methods to `window.Atome` and `window.__atomeCommitApi`; `atome/src/shared/atome_contract.js` owns property payload sanitization.

Public entry points:

- `window.Atome.commit`
- `window.Atome.commitBatch`
- `window.Atome.snapshot`
- `window.Atome.getStateCurrent`
- `window.Atome.listStateCurrent`
- `window.Atome.listEvents`
- `window.Atome.eventBus`
- `window.__atomeCommitApi` mirrors the same commit/state/event methods for bootstrap access.

Owner: Canonical Atome mutation boundary installed from the eVe closed runtime bootstrap.

Use before creating: any durable Atome mutation, snapshot, current-state read, or event-list read from product runtime code.

Runtime rule: Tauri/local-Axum commit, history, snapshot, synchronization, and current-state requests use the local `/ws/api` endpoint. Cross-origin loopback Fastify HTTP requests and transport rewriting are forbidden.

Adole rule: detached WebSocket adapters expose `adapter.atome.commit` and `adapter.atome.commitBatch` for event writes. Profile, sharing, and Atome API synchronization code must use those event methods instead of direct `create` / `alter` adapter writes.

Do not duplicate in: UI components, panels, tools, import handlers, media runtimes, or product stores.

Status: Public runtime boundary; implementation ownership should be revisited during open/closed boundary cleanup because the installer currently lives under eVe.

#### Server resource HTTP and application WebSocket API

Visibility: Public server API for runtime clients and infrastructure, except product-named route families marked to verify.

Evidence: Fastify route declarations and dispatch in `server/server.js`, `server/wsAtomeOperations.js`, `server/wsSyncSecurity.js`, `server/mailRoutes.js`, and `server/visio.js`.

Public route families:

- Health and config: `GET /health`, `GET /healthz`, `GET /__whoami`, `GET /server_config.json`, `GET /api/server-info`.
- Server identity and verification: `/api/server/identity`, `/api/server/verify`, `/api/server/status`.
- File and upload routes: `/api/uploads`, `/api/uploads/chunk`, `/api/uploads/complete`, `/api/uploads/:file`, `/api/files/my-files`, `/api/files/accessible`, `/api/files/share`, `/api/files/unshare`, `/api/files/visibility`, `/api/files/stats`, `/api/recordings/:file`, `/api/extract-audio/:file`.
- Admin binary archive and database diagnostics: `/api/admin/users/export`, `/api/admin/users/import`, `/api/admin/apply-update`, `/api/admin/batch-update`, `/api/admin/sync-from-zip`, `/api/admin/sync-clients`, `/api/db/status`, `/api/db/stats`. Export/import endpoints are explicit archive-byte transfer boundaries and must not become general Atome query/mutation APIs.
- WebSocket routes: `/ws/api`, `/ws/sync`, `/ws/visio`; Tauri also exposes local-only `/ws/control`.
- WebSocket `/ws/api` action families: auth/account, Atome CRUD/history, events, `state-current`, snapshot/restore, sharing/permissions, sync request/response, user-data, and `surface`.
- WebSocket auth actions on `/ws/api`: `request-phone-verification`, `verify-phone-verification`.
- WebSocket `surface` actions on `/ws/api`: `announce`, `list`, `ping`, `retire`; reply type `surface-response`, server push `surface-presence`.
- WebSocket `teleport` actions on `/ws/api`: `offer`, `accept`, `decline`, `cancel`, `return`, `persist`, `state`; reply type `teleport-response`, server pushes `teleport-offer`, `teleport-arrived`, `teleport-cancelled`.
- WebSocket `remote-control` actions on `/ws/api`: `request`, `revoke`, `deny`, `list`, `pointer`, `gesture`, `key`, `preview-request`, `preview-frame`, `preview-stop`, `command`, `command-result`; reply type `remote-control-response`, server pushes `remote-control-started`, `remote-control-input`, `remote-control-ended`, `remote-control-preview-request`, `remote-control-preview-frame`, `remote-control-preview-stopped`, `remote-control-command`.
- WebSocket `surface-grant` actions on `/ws/api`: `request`, `accept`, `deny`, `revoke`, `list`; reply type `surface-grant-response`, server pushes `surface-grant-request`, `surface-grant-granted`, `surface-grant-denied`, `surface-grant-revoked`.
- Visio room commands and signaling use authenticated `/ws/api` messages of type `visio`, returning `visio-response` and pushing `visio-event`. `createVisioService` no longer registers its former room HTTP routes or private signaling socket. Native and two-account acceptance of this migration remain To verify (2026-10-11).

Owner: Atome open server infrastructure when product-neutral.

Status: Public server surface. `/ws/api` is the exclusive maintained application-operation transport and `/ws/sync` is the authenticated permission-scoped notification transport. HTTP is restricted to operational discovery and explicit resource/file/archive transfer. `/api/eve/mail/*` and route families with product naming remain `Status: To verify` before being declared stable open API names.

#### Database and Persistence API

Visibility: Public server/database module API.

Evidence: exports in `database/adole.js` and `database/driver.js`.

Public entry points:

- Lifecycle and driver: `initDatabase`, `withTransaction`, `getDatabase`, `closeDatabase`, `connectDriver`, `getDriverDatabase`, `isDriverSqlite`, `isDriverLibsql`.
- Atome objects: `createAtome`, `getAtomeById`, `getAtome`, `getAtomesByOwner`, `getAtomesAccessibleToUser`, `getAtomeChildren`, `updateAtomeMetadata`, `updateAtome`, `deleteAtome`, `listAtomes`.
- Particles/properties: `setParticle`, `setParticles`, `getParticle`, `getParticles`, `deleteParticle`, `getParticleHistory`, `restoreParticleVersion`.
- History and projection: `appendEvent`, `appendEvents`, `listEvents`, `getEvent`, `getStateCurrent`, `listStateCurrent`, `rebuildStateCurrentFromEvents`, `buildHistoryTransactions`, `classifyHistoryEvent`, `normalizeHistoryEvent`, `resolveHistoryCursor`, `selectUndoTransaction`, `selectRedoTransaction`, `createStateSnapshot`, `listStateSnapshots`, `getStateSnapshot`.
- Snapshots: `createSnapshot`, `getSnapshots`, `restoreSnapshot` (legacy single-atome adapter that appends a `set` event).
- Permissions: `setPermission`, `canRead`, `canWrite`, `canDelete`, `canShare`, `canCreate`.
- Sync: `getSyncState`, `updateSyncState`, `enqueueSyncOperation`, `listSyncQueue`, `markSyncQueueSyncing`, `markSyncQueueError`, `markSyncQueueDone`, `getPendingForSync`, `markAsSynced`.
- Compatibility aliases: `createObject`, `getObject`, `getObjectById`, `getObjectsByOwner`, `getObjectChildren`, `updateObject`, `deleteObject`, `setProperty`, `setProperties`, `getProperty`, `getProperties`, `deleteProperty`, `getPropertyHistory`, `restorePropertyVersion`.
- Diagnostics: `getTableNames`, `getTableCounts`.

Owner: Atome open data layer.

Use before creating: any server-side Atome persistence behavior.

Do not duplicate in: route modules, eVe stores, or UI/product code.

Status: Public server/database module API; direct UI use is forbidden.

#### Atome Security and Sync APIs

Visibility: Public framework APIs.

Evidence: exports in `atome/security/trusted_keys.js`, `atome/security/serverVerification.js`, and `atome/security/syncQueue.js`.

Public entry points:

- Trusted server lookup: `TRUSTED_SERVERS`, `VERIFICATION_SETTINGS`, `getTrustedServer`, `findServerByFingerprint`, `findServerByUrl`, `getServersByEnvironment`, `isDevelopmentMode`.
- Verification: `verifyServer`, `getVerificationStatus`, `clearVerificationCache`, `requiresVerification`, `getStatusMessage`, `getStatusIcon`.
- Sync queue: `SyncAction`, `ActionStatus`, `getQueue`, `addToQueue`, `removeFromQueue`, `updateActionStatus`, `getPendingActionsForUser`, `getAllPendingActions`, `cleanupOldActions`, `storeCredentialsForSync`, `getCredentialsForUser`, `removeCredentials`, `isAutoSyncEnabled`, `getSyncConfig`, `saveSyncConfig`, `isCloudServerAvailable`, `processAction`, `processAllPendingActions`, `startAutoSync`, `stopAutoSync`, `initSyncQueue`.

Owner: Atome open security/sync layer.

Use before creating: trusted server, sync queue, or verification behavior. Cross-runtime account provisioning must use its dedicated `/ws/api` task and must not recreate the removed API.

Status: Public framework surface; security phase must audit credentials, storage, and bridge assumptions before expansion.

#### Public Communication Service API Details

Visibility: Public framework service APIs.

Evidence: exports in `atome/src/squirrel/{mail,contacts,calendar,bank}/index.js`, `bootstrap.js`, and `service.js`.

Public entry points:

- Mail: `createGlobalMailApi`, `bootstrapGlobalMail`, `createMailService`, `createMailIndex`, `createMailSyncState`, `createMailConnectorContract`, `createIcloudMailConnector`, `normalizeIcloudMailConnectorConfig`, `createNodeIcloudImapClient`, `createNodeIcloudSmtpClient`.
- Contacts: `createGlobalContactsApi`, `bootstrapGlobalContacts`, `createContactsService`, `createContactsConnectorContract`, `createLocalContactsSource`, `createMacosContactsSource`, `createIcloudContactsConnector`, `createNodeCarddavClient`.
- Calendar: `createGlobalCalendarApi`, `bootstrapGlobalCalendar`, `createCalendarService`, `createCalendarConnectorContract`, `createCalendarApiSource`, `createCalendarSyncState`, `createNodeCaldavClient`, `parseCalendarData`.
- Bank: `createGlobalBankApi`, `bootstrapGlobalBank`, `createBankService`, `createBankIndex`.

Runtime globals consumed by MCP/AI where installed:

- `globalThis.atome.mail` or `window.atome.mail`
- `globalThis.atome.contacts` or `window.atome.contacts`
- `globalThis.atome.calendar` or `window.atome.calendar`
- `globalThis.atome.bank` or `window.atome.bank`
- `Squirrel.mail`, `Squirrel.contacts`, `Squirrel.calendar`, `Squirrel.bank` where bootstrap exposes them.

Owner: Atome open communication services.

Use before creating: mail, contacts, calendar, or bank service behavior.

Status: Public service contracts; provider/client internals remain semi-public or internal as listed below.

#### Atome AI and MCP APIs

Visibility: Public framework and MCP-facing APIs.

Evidence: exports and globals in `atome/src/squirrel/ai/agent_gateway.js`, `atome/src/squirrel/ai/default_tools.js`, the `atome/src/squirrel/ai/default_tools_*.js` domain registration modules, and `atome/src/squirrel/atome/mcp.js`. The `mcp_*` modules are imported by `mcp.js` / `mcp_handlers.js` and do not add public MCP API entry points.

Public entry points:

- `AgentGateway`
- `TOOL_STATUS`
- `POLICY_DECISION`
- `RISK_TIERS`
- `globalThis.AtomeAI`
- `AtomeAI.registerTool`
- `AtomeAI.unregisterTool`
- `AtomeAI.getTool`
- `AtomeAI.listTools`
- `AtomeAI.validateToolchain`
- `AtomeAI.callTool`
- `AtomeAI.executeToolchain`
- `AtomeAI.setPolicyEngine`
- `AtomeAI.proposal.create`
- `AtomeAI.proposal.get`
- `AtomeAI.proposal.approve`
- `AtomeAI.proposal.reject`
- `AtomeAI.proposal.execute`
- `AtomeAI.audit.list`
- MCP runtime operations in `atome/src/squirrel/atome/mcp.js`.

Owner: Atome open AI/MCP layer.

Use before creating: AI-callable tool registration, policy, proposal, audit, toolchain, or MCP bridge behavior.

Do not duplicate in: eVe product tool modules. eVe capabilities must register through runtime tools or capability boundaries.

Status: Public orchestration surface; individual default tool names should be regenerated from `default_tools.js` plus `default_tools_*.js` before building a formal registry.

#### Public Voice API Details

Visibility: Public framework service APIs.

Historical snapshot (retired owner; not current availability evidence): Evidence: exports in `retired:atome/src/squirrel/voice/index.js`, `bootstrap.js`, `service.js`, `orchestrator.js`, `tool_router.js`, `ai_planner.js`, `ai_planner_runtime_context.js`, `session_runtime.js`, `working_memory.js`, `semantic_contract.js`, `telemetry.js`, `vad.js`, and the home-surface public mount entry in `home_surface.js`. The `service_*` and `orchestrator_*` modules are imported by their facades and do not add public voice API entry points.

Public entry points:

- `createGlobalVoiceApi`
- `bootstrapGlobalVoice`
- `createVoiceService`
- `createVoiceOrchestrator`
- `VoiceOrchestrator`
- `createToolRouter`
- `createVoiceAiPlanner`
- `createVoiceSessionRuntime`
- `VoiceSessionRuntime`
- `createWorkingMemory`
- `createStructuredRequest`
- `createMailRequest`
- `createContactsRequest`
- `createCalendarRequest`
- `createStructuredResult`
- `createVoiceAssistantSessionController`
- `preloadLocalTts`
- `subscribeTtsFrames`
- `subscribeInputFrames`
- `createVoiceLatencyTelemetry`
- `writeVoiceDiagnostic`
- `createVoiceActivityDetector`

Owner: Atome open voice runtime.

Use before creating: voice orchestration, semantic contracts, session memory, latency telemetry, or VAD behavior.

Status: Public framework surface, with closed eVe panels injected only through product boundary modules.

#### eVe Assistant Product API

Public singleton: `window.eveAssistantApi`

- `open(options)`
- `close(options)`
- `toggle(options)`
- `getState()`
- `subscribe(listener)`
- `respond()` — a touch on the shown assistant: she says `eve.voice.assistant.touch_response` and listens on (writing or paused: back to the voice; inactive, leaving or in error: no-op)

Open/close/toggle trace the declared `voice.assistant.toggle` command. `getState()` and subscriptions may expose `ejecting`; `bursting` and the internal `cut_path` contract are removed. Pointer movement updates only organic deformation. On `pointerup`, a position inside the shell cancels ejection and responds, while a position outside after shell entry ejects along the normalized start-to-release direction. The Atome hold bridge bootstraps this API on demand and calls its sole `toggle()`: closed opens and active closes. While active, the assistant yields canonical main-toolbox pointer sequences without changing this API. The single undimmed assistant projection follows the foreground WebGPU scene and clears every stale occupied scene on teardown. Open greets before listening, touch release responds before listening, and every user close speaks farewell in parallel with visual exit. Visual teardown marks the assistant closed without awaiting native farewell completion, so voice latency cannot block the next opening.

#### Public Audio and AV Runtime API Details

Visibility: Public framework runtime API.

Evidence: exports in `atome/src/application/audio_runtime/*` and `window.Squirrel.av` installation in `audio.facade.js`.

Public entry points:

- `AudioPlaybackAPI`
- `AudioRecordingAPI`
- `AUV3_RECORD_START_CLOCK_REFERENCE`
- `AUV3_RECORDING_TIMELINE_CLOCK_ID`
- `AUV3_RECORDING_SOURCE`
- `SAMPLE_ACCURATE_RECORDING_ERROR_CODES`
- `SampleAccurateRecordingError`
- `resolveSampleAccurateRecordingCapability`
- `validateSampleAccurateRecordingRequest`
- `normalizeSampleAccurateRecordingResult`
- `PlayRecordCore`
- `PLAY_RECORD_API_VERSION`
- `PLAY_RECORD_API_CONTRACT`
- `canonicalizePlayRecordMediaSource`
- `getPlayRecordCore`
- `KIRA_AUDIO_COMMANDS`
- `normalizeKiraPlayInstancePayload`
- `normalizeKiraStopInstancePayload`
- `buildTauriKiraAudioPayload`
- `buildFacadeKiraAudioPayload`
- `AV_API_SCHEMA_VERSION`
- `AVTypedError`
- `AVClock`
- `AVClockRegistry`
- `createUnsupportedCapabilityError`
- `createAVLifecycleObject`
- `AVMemoryObjectStore`
- `AVAtomeObjectStore`
- `AVMonitoringStore`
- `AVDeviceRegistry`
- `AVLatencyRegistry`
- `AVCodecRegistry`
- `AVGraphRegistry`
- `AVVideoMetricsStore`
- `AVExportAPI`
- `installSharedAVContracts`
- `Squirrel.av.audio`, `Squirrel.av.devices`, `Squirrel.av.codec`, and `Squirrel.av.graph` runtime namespaces.

Owner: Atome open audio/AV runtime.

Use before creating: playback, recording, device, codec, graph, AV store, or backend bridge behavior.

Status: Public framework API; `play_record_core.js` owns orchestration while `play_record_contract.js` and `play_record_media_source.js` own extracted public helpers.

### Semi-Public APIs

#### Server Module APIs

Visibility: Semi-public infrastructure modules.

Evidence: module exports in server files.

Entry points:

- `handleWsAtomeOperation` in `server/wsAtomeOperations.js`.
- `resolveWsApiPrincipal` in `server/wsApiIdentity.js`.
- `authenticateWsSyncRequest`, `authenticateWsSyncMessage`, `filterWsSyncEventForPrincipal` in `server/wsSyncSecurity.js`.
- `commitAtomeEvent`, `commitAtomeEvents`, `syncAtomeViaWebSocket` in `server/atomeRoutes.orm.js`.
- `registerSharingWebSocket` in `server/sharing.js`.
- `registerFileUpload`, `getFileMetadata`, `getUserFiles`, `getAccessibleFiles`, `canAccessFile`, `setFilePublic`, `deleteFile`, `getFileStats`, `handleFileMessage`, `registerFileWebSocket`, `initUserFiles`, `shareFile`, `unshareFile` in `server/userFiles.js`.
- `normalizeUserRelativePath`, `sanitizeFileName`, `ensureUserDownloadsDir`, `resolveUserUploadPath`, `resolveUserAssetPath`, `resolveUserFilePath`, `ensureSharedFileLink`, `removeSharedFileLink` in `server/fileStorage.js`.
- `buildUserExportZip`, `inspectUserExportZip`, `importUserExportZip` in `server/userExportImport.js`.
- `createVisioService` in `server/visio.js`.
- `initServerIdentity`, `signChallenge`, `getServerIdentity`, `verifySignature`, `isConfigured`, `createServerIdentityKeyPair`, `createServerIdentityId`, `computeServerIdentityFingerprint`, `validateServerIdentityKeyPair` in `server/serverIdentity.js`.
- `ensureProductionSecureConfig`, `ensureServerIdentity`, `backupServerIdentity` in `scripts/server_secure_config.js` for production updater infrastructure only.
- `startFileSyncWatcher`, `getSyncEventBus` in `server/sync/fileSyncWatcher.js`.
- Historical API, unavailable in this checkout: `normalizeWsApiRequest` from `retired:server/ws_api_schema.js`. It must not be cited as a callable current API; request dispatch is in `server/wsAtomeOperations.js`.

Owner: Atome open server infrastructure.

Use only from: server bootstrap, route modules, tests, or explicitly documented infrastructure integrations.

Status: Semi-public because these are module APIs, not browser/product APIs.

#### Semi-Public eVe Tool Runtime APIs

Visibility: Semi-public closed product runtime APIs.

Historical snapshot (retired owner; not current availability evidence): Evidence: exports and global installs in `eVe/intuition/runtime/tool.js`, `retired:eVe/intuition/tools/index.js`, `eVe/intuition/tools/core/tool_registry.js`, `tool_instances.js`, and `tool_runtime.js`.

Entry points:

- `registerTool`
- `registerUiAction`
- `registerAtomeTool`
- `registerToolHandler`
- `ToolRegistryV2`
- `toolRegistryV2`
- `ToolProjectionStoreV2`
- `toolProjectionStoreV2`
- `ToolRuntimeV2`
- `toolRuntimeV2`
- `bootstrapV2Tools`
- `window.atome.tools.registry`
- `window.atome.tools.handlers`
- `window.atome.tools.v2Registry`
- `window.atome.tools.v2Runtime`
- `window.atome.tools.v2ProjectionStore`
- `window.registerTool`
- `window.registerUiAction`
- `window.registerAtomeTool`
- `window.registerToolHandler`
- `CANONICAL_SLIDER_TOOL_SHELL_SELECTOR`
- `CANONICAL_SLIDER_TOOL_HITZONE_SELECTOR`
- `CANONICAL_SLIDER_TOOL_INPUT_SELECTOR`
- `CANONICAL_SLIDER_TOOL_VALUE_SELECTOR`
- `CANONICAL_SLIDER_TOOL_VALUE_INPUT_SELECTOR`
- `mountIntuitionXSliderToolContent`

Panel runtime contract:

- `eVe/intuition/panel_definitions.js` owns `PANEL_SURFACE_DEFINITIONS` and exports `buildPanelRuntimeConfigByToolId()`.
- `eVe/intuition/tools/core/tool_runtime.js` must derive panel open/close routing from that exported config rather than declaring a parallel `tool_id -> panel` table.
- Runtime panel open/close calls continue through `eVe/intuition/runtime/panel_api.js`, which delegates to `panelCreatorV2` after product bootstrap registers the API.

Owner: eVe closed.

Use only from: eVe product tools, runtime tool resolution, MCP bridge through approved capability checks, and targeted tests.

Status: Semi-public closed product API. It is not an Atome open API.

#### eVe Command, Selection, Panel, and Layer Runtime APIs

Visibility: Semi-public closed product runtime APIs.

Evidence: exports in `eVe/intuition/runtime/index.js`, `command_bus.js`, `panel_api.js`, `layer_contract.js`, `selection.js`, `selection_snapshot.js`, `tool_gateway.js`, `history_policy.js`, `in_flight_lock.js`, `group_timeline_api.js`, and related runtime modules.

Entry point families:

- Command bus: `commandBusV2` and command-bus exports from `command_bus.js`.
- Tool gateway: `invokeToolGateway`, `readExplicitLatched`, `resolveStranglerFlags`, `warmupToolGatewayRuntime`.
- Panel API: `openPanelSurface`, `closePanelSurface`, and panel surface exports from `panel_api.js`; eVeIntuition-specific surface registration and PanelCreatorV2 bridging live in `runtime/eve_intuition/panel_surface_runtime.js`. The deleted MTraX docked-panel preservation path (`preserveDockedMount` / `isDockedMtrackPanelElement`) and MTraX-only panel close/latch diagnostics are not active API behavior.
- Diagnostics: `window.__DEBUG__` is installed by `runtime/eve_intuition/debug_runtime.js` and remains an internal eVe diagnostic facade for app snapshots, footer state, selection state, project-layer state, persistence diagnostics, and deterministic test mode.
- Workspace scene diagnostics: `window.__DEBUG__.getWorkspaceSceneState(projectId)` is an internal diagnostic facade over `workspace_scene_layers.js` and `project_scene_runtime.js`. It reports workspace root/layer presence, record counts by layer, missing logical parents, accessibility graph entries, focus order, action ids, foreground project id, and canvas owner state; it must not become a public scripting API or business-state source.
- Closed window bridges: `window.__eveTextTool` and `window.__eveFinderUiRuntime` are installed by `runtime/eve_intuition/tool_window_bridge_runtime.js`. They expose text-tool creation/background-editing hooks and Finder inline/panel control only inside the eVe product runtime; they are not Atome open APIs, persistent state owners, or rendering routes.
- Workspace main menu: `workspace_main_menu_visibility.js` is an internal eVe runtime helper, not a public API. It reaches the registered runtime through `getMainMenuRuntime()` after auth/workspace entry to reassert menu visibility for Dashboard, project activation, Bevy panel opening, and Dashboard/project restoration. Visibility requires both mounted main-menu overlay diagnostics and matching `__eve_bevy_ui_eve_bevy_ui_main_menu_*` records in the current foreground scene. Admission waits for the existing render queue's latest menu projection when catalog registration supersedes the initial mount; no new public command or expertise rule is introduced.
- Layer contracts: exported layer ids, layer ownership helpers, z-index constants, and panel layer contracts.
- Selection: selection prefix constants, selection readers, snapshot normalization, and selection application helpers.
- History policy: history and recording mode resolution.
- Group timeline: group timeline API exports.
- Locks: `createInFlightLock`.

Owner: eVe closed.

Use only from: eVe UI, tools, panels, Matrix, Molecule/MTraX, and approved runtime bridge points.

Status: Semi-public inside eVe closed. Verify exact exports in the owning module before use.

#### eVe UI and Design Factory APIs

Visibility: Semi-public closed product design APIs.

Historical snapshot (retired owner; not current availability evidence): Evidence: exports in `eVe/elements/design.js`, the `eVe/elements/eVe_look.js` facade over `eVe/elements/look/*`, `eVe/elements/system_ui_tokens.js`, `retired:eVe/elements/design/panel_chrome.js`, `panel_chrome_tokens.js`, and the `dialog_runtime.js` facade over dialog drag, geometry, reveal, and viewport runtimes; `window.eveUI` install in `design.js`.

Entry point families:

- Dialog and panel factories: `createEveDialog`, `revealEveDialog`, `createEveCloseControl`, panel chrome helpers, bounds helpers, fullscreen helpers with viewport resize tracking only while fullscreen is active, and chrome-scoped fullscreen double-click handles.
- UI primitives: rows, buttons, inputs, editable text, text helpers, and `eveUI` namespace. `createEveButton(...)` accepts `truncateText: false` only for composed visual buttons that own child layers instead of plain text clamping.
- Tokens and presets: system UI tokens, eVe tokens, CSS variable application, base style installation, panel chrome tokens and metrics.
- i18n binding helpers for visible text.

Owner: eVe closed design layer.

Use only from: eVe product UI and closed panels/tools.

Status: Semi-public product design API. Exact function names must be verified in `design.js` before use because the file is large and exports many helpers.

#### Molecule Runtime APIs and Deleted MTraX Runtime APIs

Visibility: Semi-public closed product APIs.

Evidence: module exports and globals in `eVe/core/media_engine/`, plus the removed-domain cleanup recorded in `todo/full_bevy_renderer.md`.

Entry points:

- Molecule engine/API: `createMoleculeEngine`, `ensureMoleculeEngine`, `getMoleculeCommandCatalog`, `createMoleculeApi`, `ensureMoleculeApi`, `ensureMoleculeMediaRuntime`.
- Molecule globals: `window.Molecule.engine`, `window.Molecule.api`, `window.Molecule.media`, `window.Molecule.createSession`, `window.Molecule.getSession`, `window.Molecule.disposeSession`, `window.Molecule.describeApi`, `window.Molecule.execute`, `window.Molecule.listCommands`, `window.eveMediaApi`, and `window.eveMoleculeTimelineApi`.
- Molecule timeline recording bridge: `readGroupTimelineRecording`, `startGroupTimelineRecording`, `stopGroupTimelineRecording`, and `cancelGroupTimelineRecording`; these require an armed compatible track and the installed audio capture adapter, and expose typed refusal instead of an approximate exact-recording fallback.
- Molecule session history/API: `createMoleculeSession` exposes `apply`, `applyBatch`, `applyTimelineOperation`, `copyClips`, `cutClips`, `pasteClips`, `duplicateClips`, `undo`, `redo`, `canUndo`, `canRedo`, and `getHistory`; persistence and multi-instance controllers expose timeline-scoped undo/redo helpers so molecule edits do not depend on global Atome selection.
- Timeline tools: `eve.timeline.read`, `eve.timeline.operation`, `eve.timeline.batch`, named `eve.timeline.*` verbs, `ui.timeline.read`, `ui.timeline.batch`, and named `ui.timeline.*` verbs are the active programmable timeline surfaces. Mixer verbs (2026-10-14) carry typed command schemas: `mix.module.{add,update,move,remove,bypass}`, `mix.output.set`, `mix.input.set`, `mix.group.{create,join,leave,dissolve}` (strip ids `<track_id>:<lane>`); `track.group` and track `gain`/`pan` fields are retired. Runtime mixer reads: `readGroupTimelineMixProgram`, `readGroupTimelineMixLevels`, `readGroupTimelineMixModuleState`, `cutGroupTimelineMixTail`, `previewGroupTimelineMix` (non-durable gesture preview). Audio facade: `Squirrel.av.audio.mix_{apply,levels,cut_tail,module_state,output_devices,live_push}`; Tauri commands `audio_mix_{apply,levels,devices,cut_tail,module_state}`; voices accept `stripId`. `ui.timeline.*` definitions are registered by `eVe/intuition/tools/timeline_actions.js`; Molecule runtime files only provide the timeline session bridge. Both surfaces take their verb list and input schemas from `atome/src/shared/timeline_tool_contract.js`.
- Deleted MTraX window API creators: `createMtrackWindowApiRuntime` and `createWindowApiBridgeRuntime` were removed with the MTraX domain.
- Deleted MTraX globals: `window.open_mtrack_panel`, `window.close_mtrack_panel`, and `window.eveMtrackApi` are not active API surfaces.
- Deleted MTraX bridge routing: Intuition tool invocation and selection-style application no longer route visual tools through `eveMtrackApi.applyClipVisualTool`.
- Removed MTraX clip-edit APIs: clip split/join/crop, clip selection, track mute/solo, hidden timeline split, timeline automation APIs, deleted-editor footer controls (`ui.mtrack.footer_control`, `ui.mtrack.loop_cells`, `ui.mtrack.clone`, `ui.mtrack.delete`, `ui.mtrack.follow*`, `ui.mtrack.loop`, `ui.mtrack.hzoom`, `ui.mtrack.vzoom`, `ui.mtrack.snap`, `ui.mtrack.tempo`), deleted panel/open actions (`ui.mtrax.open`, `ui.mtrack.panel`), deleted public tool id `tool.main.mtrack`, old `ensureMtrackPanelModule` loading/export, `window.eveMtrackApi` optional routes, MTrax preview metadata events, MTrax group timeline payload builders, `mtrax_timeline*` fallback aliases, deleted docked-panel preservation (`preserveDockedMount`, `isDockedMtrackPanelElement`, MTraX close/latch diagnostics), deleted Atome-editor MTrack footer embedding (`mtrackHost`, `mtrackExpanded`, `MTRACK_FOOTER_ANCHOR_UPDATE_EVENT`, `mtrack-host`, `data-mtrack-open`), deleted legacy DOM footer socket/placement APIs (`ensureAtomeEditFooterRoot`, `setAtomeEditFooterVisibility`, layout locks, resize observers, socket close button), deleted eVeIntuition Mystic/footer/default/warmup `mtrack` exposure, deleted `mtracks`/`mtrax` footer-kind aliases, deleted mtrack preview-text creation, stale `tool_ui.mtrack.*` boot cleanup, deleted `tool_runtime.js` bootstrap mtrack diagnostics, deleted `mtrack_preview_text_*` text-create behavior, deleted `project_drop.js` native file routing to `window.eveMtrackApi` plus MTrack projection latch special cases, deleted clipboard selection through `window.eveMtrackApi.getSelectedClipAtomeIds`, deleted `resolveMtrackToolScope` routing, deleted MTrack delete routing through `window.eveMtrackApi.deleteSelection` / `deleteSvgLayer`, deleted MTrack SVG-layer manifest/select/add routing through the layer panel and vector layer listeners, deleted media diagnostics that reopened MTrack or read `window.eveMtrackApi`, deleted MTrack transport interception through tool buttons / UI interaction dispatch, deleted selected-group DOM media transport (`groupPlaybackState`, `playGroupTransport`, `pauseGroupTransport`), and deleted `window.__DEBUG__` MTrack timeline/GPU readers are no longer callable/runtime API behavior until the editor is rebuilt on the Bevy/WebGPU path. The old MTraX `ui.move` shim was removed; `ui.move` remains only as the generic Finder/arrange `v2_move` tool. `eVeIntuition.js` must not register `group_timeline_api`; that API is owned by the Molecule runtime.

Owner: eVe closed product media workflow.

Use only from: Molecule product UI, product tools, runtime bridge, and targeted diagnostics.

Status: Molecule remains a semi-public closed product API. MTraX APIs are removed and residual stale callers are cleanup targets, not supported surfaces.

#### eVe Media Domain APIs

Visibility: Semi-public closed product APIs.

Evidence: exports in `eVe/domains/media/api/` and `eVe/domains/media/media_diagnostics.js`.

Entry point families:

- Media API shared helpers and media source normalization.
- Shared media source normalization is the required route canonicalization contract for MTraX/WebGPU media playback before any browser media element receives a source, including timestamped recording names that arrive as bare, root-relative, or loopback Fastify API paths in Tauri.
- Legacy Atome product-bootstrap renderers that still mount media atomes must also call this contract before assigning `src` attributes; they must not synthesize `/assets/shared` media paths for persisted recordings.
- Video recording atome creation must persist owner metadata (`owner_id` / `media_user_id`) and resolve `/api/recordings/:file` URLs with that owner before the first browser media request.
- Existing recording Atome reuse is still effectful: the media persistence API must issue the canonical Atome `set` commit with the active `project_id` before rendering so `AdoleAPI.atomes.list({ projectId })`, `state_current`, and project scene reload agree.
- Client Atome projection APIs must preserve `meta.project_id` from `state_current`; dropping it makes persisted media look projectless after refresh.
- Media persistence must preserve lightweight render cache fields that are part of the media Atome contract, including video poster data/refs, waveform peaks/refs, and explicit image/video natural size aliases (`media_width`/`media_height`, `naturalWidth`/`naturalHeight`, `sourceWidth`/`sourceHeight`) when the upload/recording result provides them, so project reload can reuse generated visuals without expensive regeneration or Bevy video metadata stalls. These fields are cache inputs for RenderAtom/Bevy, not a public GPU texture persistence API.
- Audio API and video API product facades.
- `createMoleculeRecordingCaptureAdapter` and `installMoleculeRecordingCaptureAdapter` in `audio_api.js`; this is the closed Molecule-to-existing-audio-controller adapter, not another recorder. It is exact only for the capability-approved AUv3 `plugin_input` render-quantum route and preserves typed rejection elsewhere.
- `VideoRecordingAPI` and `VideoPlaybackAPI` from `video_facade.js`.
- Internal generic-video recording owners: `video_api_record.js` exposes `record_video`, `startVideoRecording`, `stopVideoRecording`, `toggleVideoRecording`, and recording state; `video_api_record_options.js` owns `requiresExactVideo`, `exactVideoUnsupportedError`, `buildVideoFileName`, and `buildVideoOptions`; `video_api_record_finalize.js` owns `buildBrowserVideoTerminalCapture`; and `video_api_record_native.js` owns the bounded native iOS controller. These are focused parts of one closed recording API, not independently supported entry points.
- Browser finalization rejects empty, zero-duration, or audio-only terminal payloads. Once MediaRecorder has stopped, persistence/project association remains retryable with the same recording Atome id and upload id; the controller is released only after a confirmed discard or durable project association.
- The iOS bridge commands `media_video_record_state`, `media_video_record_stop`, `media_video_record_cancel`, and `media_video_record_ack` form a recovery protocol around `media_video_record_start`. Native state/result caching survives WebView reload, start/stop are bounded by watchdogs, concurrent stops coalesce, cleanup failure remains retryable, and successful output is acknowledged only after project-Atome association succeeds.
- Those commands still traverse the single `WebViewManager` native-invoke API. `WebViewManagerScriptMessages.swift`, `WebViewManagerAudioTransport.swift`, `WebViewManagerNavigation.swift`, and `WebViewManagerIPC.swift` are responsibility extensions of that same manager, not additional public bridges or transports.
- Media persistence service exports.
- `createMediaDiagnosticsRuntime`.
- Generic video recording sessions use the existing browser/native capture backend and persist their result through the media Atome boundary. They do not create a recording-owned DOM `<video>`/`<img>` preview, native overlay, or fake WebGPU frame. A future live viewfinder requires an implemented camera-frame texture route into the shared Bevy/WebGPU compositor; it is not synthesized by the controller today.

Owner: eVe closed media domain.

Use only from: eVe media tools, MTraX, product import/preview flows, and targeted diagnostics.

Status: Semi-public closed product API. Generic playback/recording belongs to Atome AV runtime first.

### eVe User Profile Preferences API

Ownership: eVe closed user/profile domain.

Primary sources:

- `eVe/intuition/tools/user_accessibility_preferences_model.js`
- `eVe/intuition/tools/user_visual_preferences_model.js`
- `eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js`
- `eVe/domains/user/profile_api.js`
- `eVe/domains/user/profile_api_support.js`
- `eVe/domains/user/profile_events.js`

Exposure: durable profile payload stored under `eve_profile.preferences`. `preferences.accessibility` is normalized as `{ auditory: boolean, visual: boolean }`; missing values default to `false`. Internal event `eve:user-profile-updated` has detail `{ userId, profile, properties, source, ts }` and is emitted only after a successful durable profile create/update.

Boundary status: Semi-public closed eVe product profile contract. It is edited
by Home and persisted through `upsertUserProfile`, which writes through the
existing `window.Atome.commit` path.

Effect model: Home keeps edits in disposable runtime state, publishes the
existing `eve:profile-preferences-updated` event when applying preferences, and
persists the sanitized complete profile through the existing profile API.
Profile save success also publishes `eve:user-profile-updated` with the
committed projection so Dashboard contacts can invalidate without rereading DOM
state. Home must not write DOM state as preference authority, create a separate
persistence route, swallow durable write failures, or bypass the canonical
Atome commit path.

### Internal APIs

#### Internal Atome Framework Helpers

Visibility: Internal or implementation-specific.

Examples verified by exports:

- `createOfflineMutationQueue`
- `createAiQuotaTracker`
- `createPersistentMemoryStore`
- `createAiTraceStore`
- `createProactiveStateStore`
- `buildStartupBriefing`
- `evaluateProactiveNotifications`
- `coalesceProactiveNotifications`
- `loadRuntimeUserProfile`
- connector internals and local indexes below their service facades when used outside the owning communication service.

Owner: Atome open implementation modules.

Use through: public AI, MCP, communication, voice, or service facades.

Status: Internal unless a future registry promotes a specific helper.

#### Internal eVe Product Helpers

Visibility: Internal closed product implementation.

Examples verified by exports:

- Tool core implementation helpers such as SVG draw model functions, SVG draw DOM/commit helpers, SVG vector edit DOM/refresh/mutation helpers, latch aliases, palette behavior, finder projection helpers, record action state helpers, and canonical tool invocation helpers.
- `__moleculeTestUtils`, and other `__*TestUtils` exports.
- Removed MTraX helper families are not valid internal dependencies; use Bevy/WebGPU project rendering and media-domain helpers instead.

Owner: eVe closed implementation modules.

Use through: eVe semi-public runtime APIs, Molecule API, or tests.

Status: Internal. Do not treat these as stable API contracts.

#### Generated, Vendored, Test, and Example APIs

Visibility: Internal or out of active API contract.

Examples:

- APIs in `atome/src/application/examples/`.
- Test-only exports and probe utilities.
- Vendored browser libraries under `atome/src/js/`.
- Generated distribution artifacts under `dist/`.
- Temporary diagnostics under `temp/`.

Owner: their owning test/example/vendor/build context.

Status: Not part of the maintained public/semi-public API inventory.

## Required Follow-Up Work

The next execution tasks must refine this map by:

- Making map consultation mandatory before future implementation.
- Adding automated validation for map/source consistency where practical.
# Resident Dashboard internal contracts (2026-07-17, authoritative)

- `eveBevyUiRuntime.setTreeSuspended({ id, suspended })` is an internal runtime operation. Suspension preserves the source tree and overlay ids, projects opacity `0`, clears captured/hovered pointers, removes the tree from hit-testing and event dispatch, and exposes `suspended` through diagnostics. Resume restores opacity and interaction without remounting.
- The removed fade controller, `dashboardFadeMs`, and `restoreProjectWorkspaceAfterDashboardClose()` are not valid contracts.

# Dashboard/palette performance contracts (2026-07-18, authoritative)

- Main-menu palette controls are absent while closed. A real opening atomically projects every opaque child, icon, label, accent, and displaced tool at the expansion origin through the internal direct-prefix route, then uses direct motion for the complete 180 ms expansion, bounded 6–14 px / 70 ms outward overshoot, and exact 120 ms settlement. Prefix and motion share one direct-mutation queue; the rAF producer allows one renderer submission in flight and retains only the latest pending sample. No hidden resident subtree, browser API, persisted Atome state, RGBA re-hash, or full Dashboard/toolbox rebuild is created by the motion path.
- Dashboard post-open hydration failure is observable through runtime diagnostics and cannot self-schedule an unbounded retry loop.
- Dashboard header wheel/drag input is vertical-only. Lane horizontal offsets cannot change from an event targeted at the header column.
# Contact panel migration update — 2026-08-02

2026-10-11 Partial extension: the existing tool registry exposes `contact.favorite.set { contactId, favorite }`, `communication.conversation.read { contactId, cursor?, limit? }`, and `communication.conversation.send { contactId, messageId, text?, mediaId? }` from `atome/src/shared/communication_contract.js` through the canonical gateway. UI/MCP share `contact_conversation.js`. History pages return `items` and `nextCursor`, newest first with stable timestamp/id cursors. The planned call-start command is not registered until its central panel and account-media reader composition are available. `CALL_RING_TIMEOUT_MS = 15_000` and modes `audio|visio` are shared; Capture accepts an explicit global conversation destination and an optional registered panel presentation surface. Product acceptance remains To verify.
2026-10-11 Quick contact (supersedes the partial entry above): `communication.conversation.send` also accepts `attachmentIds: string[]` (≤ 10 owned Atomes, a project or a library media; `eve-comm-send` still rejects what the account cannot share). `CALL_RING_TIMEOUT_MS = 10_000` (server ring and receiver ring). New panel surface `contact_conversation` (`eVe/intuition/tools/contact_conversation_panel.js`, `window.eveContactConversation.open({ contactId, call? })`) composes `createCommunicationCallSession`, `ui.capture.audio|video` through the tool gateway (global conversation destination, `presentationSurface: 'contact_conversation'`, `cameraPosition` front/back) and declares a `recordingVisualRuntime` built from `createMainMenuRecordingVisualRuntime`. `setConversationMediaSendStatus(mediaId, 'draft'|'sent')` (`media_persistence_service.js`) is the call session's `saveDraft`. Incoming invitations keep `callMode` and announce audio calls. Dashboard contact tiles and the Com tool's Audio/Video rail open it. Contacts: `canonical_import` gains `update`/`remove`, `suppressed_reason`, `meta.restore_suppressed`; `createImportLifecycle({ recoveryVersion })`; `importSource` results carry `permission` (`limited` on iOS 18); native command `contacts_open_settings` (iOS app target). Native calendars report `type` per calendar and `calendarType` per event, stored as `calendar_source_type`. `/ws/api` `visio` signaling replies (`joinRoom`, `leaveRoom`, transports…) no longer carry the inner `requestId`/`type`; the inner type is exposed as `signal`. Share requests addressed by `targetPhone` resolve through `findUserByPhone(contactBookPhone(phone))`. Call invitations keep `call_mode`/`expires_at` through the client notification normalizers.
2026-10-13 Quick contact takes: panel intents `contact.conversation.memo.hold|drag|release|stop|play|show|retake|switch_camera|remove|send` and `contact.conversation.take.remove`; `memo.send` and `text.send` share one grouped send (each take = `communication.conversation.send { mediaId, messageId }` with its capture message id, then text + `attachmentIds`). `setBevyVideoDecodePlayback(ids, active, { presentation: true })` plays during Dashboard suspension. New shared assembly `createRecordPreviewPlayback({ onEnded })` → `{ play({ record, previewRecordIds }), stop(), playingId() }` (`eVe/domains/media/record_preview_playback.js`).

2026-10-12 Personal imports: `canonical_import.capture().check` and `readMediaAssetBytes` check account identity (mode + `user.id`), not `session.updatedAt` (local token renewals no longer abort). `collect(items, { legacy_source_prefix })` and `resolveIds(items, source, { legacy_source_prefix })` adopt origins of former keys by external identity. Native contacts key is `macos_contacts` (was `macos_contacts/<surface_id>`); `import_lifecycle.resume` moves former-key checkpoints. Contacts `importContacts` meta gains `full_snapshot`; result gains `duplicates_removed` (origins `suppressed_reason: 'import_duplicate'`). Schema: `import_origin.suppressed_reason`, `import_source_state.recovery`.
2026-10-12 Import identity: `createCanonicalImport({ identityKeys(props) → string[], mergeIntoExisting(current, incoming, { recordId }) })` merges an observation without origin into the live record sharing a key (default merge exported as `preferExistingImportValues`: filled values win, lists united); results gain `merged_into_existing`. Contacts: `contactPhoneKeys` (E.164 via `contactBookPhone`), imported cards take the source photo fields, hand-made cards keep theirs. Native events: `series:<native_series_id>|<start>`; native calendar key is `native_calendar` (former `native_calendar/<surface>` adopted). `guest_workspace_store.importWorkspaceStates` accepts the canonical projected `state-current` shape (`id`, `type`, `meta.owner_id/project_id/parent_id`, `__deleted`).
2026-10-12 Dashboard/calendar: `calendar.next({ overlap: true, filter(event) })` (service `calendarNext`): occurrences still running at `reference` are kept and `filter` applies before `limit`. `contact.favorite.set` accepts `phone` (stored E.164 beside the id); `contact_favorites_preference.js` exports `isContactFavorite(contactOrId)` (ticked id only), `favoritePhonesWithoutCard(contacts)`, `contactPhones`. `squirrel:import-updated` detail gains `changed` and is dispatched only for pages that wrote something (or failed); contacts `importSource` results carry `changed`. Native `native_calendar_snapshot` with cursor `{ completed: true }` reads last year → horizon and stays completed. Calendar Import/export window: `calendar.transfer.device` → `calendar.import_native`.

- Contact effects reuse `createLocalContact`, `updateLocalContact`,
  `deleteLocalContact`, and `importSource`; the authenticated stable id alone
  may call `upsertUserProfile`. A draft calls `createLocalContact` only after
  its first meaningful edit. Group deletion invokes local deletes sequentially
  in projection order and returns explicit `deleted` and `failed` lists.
- `createContactsConnectorContract` now exposes `interactive_import:boolean`
  and `label_key:string`; `sources()` projects both fields through
  `cloneSourceInfo`. Contact shows only import-role sources with
  `interactive_import:true`. Zero sources disables Importer, one starts
  directly, and several open a WebGPU source chooser.
- `createMacosContactsSource` opts into interactive import and propagates
  `permission` through sync status and source results. The existing
  `macos_contacts_snapshot` command name and contact payload remain stable,
  while the Tauri implementation uses `CNContactStore` and returns
  `not_determined`, `authorized`, `denied`, or `restricted`. Permission is
  requested only after `importSource` reaches the native snapshot command.
- `contacts.import_icloud` and `contacts.push_icloud` remain unchanged headless
  API/MCP operations. No Contact-panel event invokes them, and iCloud has no
  `interactive_import` capability.
- Directory normalization requires an explicit stable `id` or
  `source_contact_id`. Phone, email, and name equality never produce identity,
  authorization, profile writes, or deletion rights.

# Home panel API update — 2026-08-02

- Review status: Contact and Home are product-owner `validated` panels
  (**2/16**). Calendar is technically migrated and awaits native/product-owner
  acceptance before the count changes; Timeline remains final.
- `tool.main.home` resolves `ui.home.panel`; `runtime.tools.call` and
  `runtime.audit.list` remain the existing MCP invocation/audit surfaces for
  Home open/close. `runtime_owner: 'window'` makes the established
  `open_home_panel` session gate authoritative before the Bevy surface opens.
  Its internal Runtime V2 configuration retains `module_key: 'home'`; the
  registered-handler owner calls the existing `ensureToolModule('home')`
  loader before invoking the window function and reports the shared typed
  import failure when loading fails.
- Profile read/write uses only `loadUserProfile` / `upsertUserProfile` and the
  existing sanitized `Atome.commit` path. Visibility is part of that same
  canonical profile commit; visual, handedness, locale, accessibility,
  Dashboard and Mail preferences keep their existing owners and update event.
- Background opening uses the existing `ui.background.panel` Runtime V2 tool.
  Home's selection, import, and download intents delegate to the existing
  Background owner globals; no Home media API or persistence is introduced.
  Dashboard preference events force the existing data controller to refilter
  an active dashboard even when its geometry signature is unchanged.
- The `Mot de passe et clés` section owns generic credential metadata and the
  five AI-provider entries. Provider/model metadata is normalized into
  `profile.passkeys.keys` without key material.
  `resolveConfiguredAiProviderCredentials` asynchronously reads each provider
  key through the existing security API; `aiProviderVaultEntryId` scopes
  entries by authenticated stable user id and provider. Generic credentials and
  Mail authentication use separate opaque entries in the same vault. Home reuses
  `storeToken`, `readToken`, and `removeToken`; `ensureHomeVault` establishes
  the device-local encryption key internally. These are internal extensions of
  existing owners, not a public API.
- Server selection reuses `loadServerConfig.js` normalization and the existing
  Sync/RemoteCommands owners. Home persists only the selected URL and known URL
  list in the existing user preferences, then clears availability caches and
  reconnects; no new server API is exposed.
- Password change, logout, Guest exit and account deletion use the existing
  `AdoleAPI.auth` / `AdoleAPI.security` methods. They intentionally add no MCP
  or public API: credentials/secrets remain UI-session scoped and authorization
  stays with the authenticated session owner.
- `normalizeHomeProfile`, profile persistence sanitization, and Mail runtime
  persistence remove password/key material. No visible DOM value, display
  identity, phone, or email is an API authority input.

# Shared Bevy panel lifecycle/performance update — 2026-08-03

- No public API was added. Home, Contact, and Panel Lab are no longer imported
  by the common surface registry; their canonical tool/feature loader imports
  and registers each surface only on first demand. The loaded JavaScript module
  may remain cached, but a closed surface owns no mounted tree or active UI
  component.
- `eve:surface-state` is an existing-boundary internal lifecycle notification
  emitted by the shared Bevy panel runtime after an actual open or close. Tool
  latch consumers use the real surface state; `tool.main.home` and
  `ui.home.panel` are one alias family. This is internal synchronization, not a
  state store, command, MCP surface, or authorization input.
- Shared motion/text operations remain closed renderer operations. Scroll,
  drag, resize preview, caret opacity, and targeted text updates reuse the
  existing BevyUI/project-overlay patch paths with a one-in-flight plus
  latest-pending queue. Resize performs one structural reflow on release.
- Media-frame drop is a transient BevyUI intent. A native `File` is delivered
  directly to the authenticated/editable media owner and never enters a tree,
  projected event payload, profile, persistence record, log, or public API.
  The existing hidden file-input service is created only for an active click
  and is destroyed after selection or cancellation.

# Calendar API update — 2026-08-03

- Canonical direct API: `CalendarAPI` in `eVe/intuition/tools/calendar_api.js`, including event/calendar CRUD, todo fields through existing CRUD, share, ICS/Webcal, recurrence, alarms, and subscriptions. Creates identify Atomes with `type: calendar_event`; `kind: event|todo` remains business data.
- Calendar creation passes `type` only as trusted Atome commit-envelope metadata. The commit boundary sanitizes ordinary properties, then projects the trusted type into reserved event metadata for ADOLE; `state_current` list projection restores `atomes.atome_type` so business `kind` cannot hide events after save or reload. The built-in source normalizes a failed optional `default` calendar ensure and continues through the existing event owner. No method or schema was added.
- Unified facade: existing `Squirrel.calendar` / `atome.calendar` source, query, CRUD, and panel methods. No second store or persistence API was introduced.
- Runtime V2 ledger: `calendar.list_events`, `calendar.get_event`, `calendar.create_event`, `calendar.update_event`, `calendar.delete_event`, `calendar.ensure_calendar`, `calendar.share`, `calendar.export_webcal`.
- MCP ledger: `calendar.sources`, `calendar.search`, `calendar.today`, `calendar.next`, `calendar.create`, `calendar.update`, `calendar.delete`, `calendar.share`, `calendar.export_webcal`. Share requires confirmation plus `calendar.write` and `share.write`; export remains read-only.

# Infos API/MCP update — 2026-08-04

- No public API, persistence method, renderer API, or panel-local command was
  added. The visible bridge continues to expose only the established
  `open_info_panel` / `close_info_panel` compatibility names.
- Panel lifecycle maps to existing Runtime V2 `ui.info.panel` through
  `runtime.tools.call` actions `open` and `close` (`ui.read`, LOW).
- Canonical reads map to existing `adole.atomes.get { id }` and
  `adole.atomes.list { projectId? }` through `ai.tools.call` (`atome.read`).
  Hierarchy row selection maps to existing Runtime V2 `ui.select` with
  `{ atome_id, target_id, selection_intent: "replace" }`.
- Existing scalar-property edits use the established Atome `commitBatch`
  boundary; AI parity is existing `adole.atomes.alter { id, properties }`
  (`atome.write`, MEDIUM). Infos exposes no envelope relationship mutation or
  unknown-property creator.
- Project-Atome drag reuses the closed Runtime V2 `ui.duplicate` route with
  action `drag.end`. Its internal input is `selection_ids`, `project_id`,
  `left`, `top`, and `placement_mode: "preserve_relative"`; success returns
  `duplicate_ids` plus `source_to_duplicate`. The owner preflights every source,
  then emits one typed `Atome.commitBatch` carrying each new UUID, `type`,
  `project_id`, `parent_id`, and sanitized copied properties. This is not a new
  public API, persistence method, renderer API, or HTML drag contract.
- Copy JSON is a local OS-clipboard output and preview/accordion/detail display
  is passive rendering, so both are explicitly MCP `not_applicable`; AI reads
  the same canonical records through the existing get/list tools.

# Infos virtual loading and contextual tool placement — 2026-08-05

- Infos reuses `listStateCurrent(projectId, { limit: 200, offset })` and
  `listStateCurrent(null, { limit: 200, offset })`; active window, loading,
  total, error and revision are private runtime state. `includeTotal` and the
  project-only `excludeSystem` flag stay inside the existing list boundary;
  returned arrays carry non-enumerable `totalCount` metadata. No pagination API
  or panel store is added.
- `bevy_panel_selectable_list.js` is the lower-level reusable UI contract for
  scroll-driven 200-row virtual windows and list drag sessions. It emits window
  and drag intents only; each consumer remains owner of canonical reads and
  mutations.
- `preserveNodeId` is an internal BevyUI refresh option only. It changes no MCP,
  Runtime V2, `ui.duplicate`, Atome persistence, or public panel contract.
- A successful internal duplicate operation reloads the current project through
  the existing `eveToolBase.loadProjectAtomes` projection owner after the single
  atomic commit; no renderer or mutation API is added.
- Finder tool placement reuses the existing internal drag payload and the
  registered contextual-edit API. It accepts only canonical Tool Registry keys
  and persists the complete order through the existing `footer_tools` owner.
- The contextual API additions are internal UI-runtime methods
  (`previewToolDrop`, `commitToolDrop`, `cancelToolDrop`), not public or MCP
  commands. No MIME, `DataTransfer`, renderer, persistence field or fallback
  API is introduced.

# Molecule timeline v2 API delta — 2026-08-12

- Named `eve.timeline.*` and `ui.timeline.*` write surfaces now cover `section.add|update|remove`, `track.add|remove|update|reorder|mute|solo|group|loop|quantization`, `clip.move|trim|crop|split|cut|copy|paste|erase|duplicate`, `record_region.add|update|remove`, global `quantization.set`, `metronome.set`, transport, view and automation. All delegate to the active Molecule session and remain batchable/undoable through the existing bridge.
- Marker and `transport.snap` named tools are removed. Quantization is canonical snapshot state, not a transport alias.
- Exact recording finalization commits `molecule.clip.record_replace`, which preserves the portions outside the captured interval and optionally consumes its persistent Record region. AUv3 `plugin_input` retains exact guarantees; generic capture must not claim sample accuracy.
- Persistence accepts schema v2 only. `migrateMoleculeTimelineSnapshot` is deleted; historical snapshots fail validation explicitly.
- `window.eveMoleculeTimelineApi.toggleGroupTimelineListTransport` / `stopGroupTimelineListTransport` and `ui.timeline.transport.list.toggle|stop` expose ordered List playback through the same Molecule transport runtime and Kira engine. The projection is ephemeral; each Molecule keeps its own canonical snapshot and armed Record scheduler.
- `getAtomeContextualEditApi().enterVirtual(...)` is an internal UI-only extension of the established Bevy contextual rail. It accepts a disposable record, functional definitions and an injected canonical invoker; it exposes no public mutation authority and renders no Atome editor footer chrome.

## iOS waveform and performance-record API delta — 2026-08-21

- Native audio stop payloads accept `waveform_peaks` as the canonical finite, normalized array (maximum 256 entries); `peaks` is a compatibility alias. The JavaScript recorder adapter preserves both names before the existing canonical media persistence call.
- `ui.timeline.batch` accepts the internal `owner_properties` batch metadata only through the existing Molecule runtime. The runtime folds it into the owner timeline `Atome.commitBatch` event, preserving the established ACL, history and synchronization route rather than exposing a second persistence API.
- `ui.timeline.performance.delete` is the minimal closed timeline command for clearing a performance. It deletes owner clips and sets `playback_mode` to `sequential` in the same canonical batch. A `performance` rule lacking usable timeline clips returns `project_view_performance_clips_required`; it never silently changes to sequential playback.
- Acceptance does not add a product API. `tests/probes/molecule_eve_ui_acceptance_probe.mjs` installs fixtures and reads diagnostics through existing canonical surfaces only; every product mutation in the journey is still triggered by a real canvas click, touch, drag or keyboard action. Its optional 30-minute mode also drives Lecture and consumes an armed Record region through the same public UI path.

# Canonical Molecule parentage delta — 2026-08-21

- `createCanonicalMolecule`, `absorbCanonicalMolecule`,
  `ungroupCanonicalMolecule`, `deleteCanonicalMolecule`, and
  `transformCanonicalMolecule` remain closed product commands in
  `tool_runtime_atome_mutation.js`. Each preflights the existing ACL/command
  route and commits direct `parent_id` changes through the existing atomic
  `commitRuntimeSetBatch` boundary; no public grouping API or alternate
  membership payload was added.
- List, Matrix, Natural, lasso, Mystics Ungroup, and Delete are UI intent
  callers of those existing commands. `group_visual_runtime.js` is preview-only
  and exposes neither a membership reader/writer nor a compatibility command.

# List transport and occurrence-edit API delta — 2026-08-27

- Shared single/composite record previews accept `showPlaybackProgress` (default true). Visual passes false, producing only the derived overlay property `playback_progress_visible: false`; initial waveform projection and incremental audio-progress updates honor it. It does not remove video playback mirrors or mutate the source Atome.
- `updateTreeMotion({ updates: [{ nodeId, position }] })` uses parent-local node positions. The motion owner converts these to projected-record deltas before applying screen-space updates; native style and hit-tree positions remain local. This keeps nested footer/row heads inside their layout containers.
- Shared audio execution: `MediaPlaybackAudioExecutor.loadAsset({ assetId, source, payload })` treats its explicit `assetId` as the registration identity on both the core and facade routes. Source/payload identity fields cannot override it. This is the same identity consumed by `playVoice`, not a new public API or persisted field.
- `projectViewTransport` is an internal UI runtime exposing `load`, `play`, `pause`, `resume`, `stop`, `seek`, `scrub`, `seekNode`, `scrubNode`, `mute`, `read`, and `subscribe`. `scrub`/`scrubNode` run through one ordered queue (only the latest pending `move` survives; `start`/`end` are kept); `scrubNode(id, local, { phase, prepare })` runs `prepare` inside that queue to load the owning plan first. Its snapshots are ephemeral and never enter Atome history or synchronization. `rootRecord` and `activeLeafRecords` identify the Visual composition; `activePathIds` identify active hierarchy rows. The surface consumes this snapshot through `resolveProjectViewVisualSubject({ transportSnapshot })`, without selecting an active leaf.
- `setBevyVideoDecodePlayback(ids, active, { playheads, seek })` retains requested positions before decoder creation. Explicit `seek: true` bypasses the continuous-playback drift tolerance; paused placement redraws on `seeked`. Decoder status uses the canonical normalized timeline fields `trim_in`/`trim_out` (camel-case inputs remain accepted by the media contract).
- Persistent membership, ordering, mode, loop, mute, source window, simultaneous offset, and stretch parameters continue to use the existing `Atome.commit` or `Atome.commitBatch` boundary. No public Timeline, media, renderer, DOM, or MCP mutation API was added.
- The legacy toggle remains a compatibility caller only. List level playback compiles the canonical tree before delegating leaf commands to the existing shared media engine.
- Split, Duplicate, Join, and Stretch are internal contextual-action definitions. Crop, Move, and Scrub remain direct preview gestures. Rubber Band unavailability returns an explicit failure without persisting a simulated stretch.

# Public directory projection — 2026-08-30

- `AdoleAPI.directory.list({ limit, offset })` and `AdoleAPI.directory.search(query, { limit, offset })` are the only public account-discovery APIs. Entries are exactly `{ principal_id, display_name, user_face, revision, updated_at }`; `user_face` is null when its property privacy rule refuses the authenticated reader.
- `display_name` is resolved server-side from Home `display_name_source`, then `name`, `first_name`, and `nickname`; an empty result is rendered as localized `Unknown`. Phone, email, login identity, and complete profile never cross this boundary.
- The former `AdoleAPI.auth.list()` aggregate and generic cross-owner `atome.list({ type: "user" })` directory behavior are removed. Ordinary Atome lists remain owner/permission scoped.

# Current-user identity update — 2026-08-30

- `updateUserProfileIdentity` is removed (2026-09-22): the Contact panel no longer edits the current user. The current user's card is the Home panel, which saves the whole normalized profile (including `custom_fields` and `sharing.fields`) through `upsertUserProfile`.
- `eve:user-profile-updated.detail.profile` is a confirmed canonical profile snapshot. Home merges it directly; `loadHomeProfile` also overlays the latest same-user event over a potentially stale `state_current` read.
- The retired `auth.setVisibility` API is not a profile mutation path. Access remains part of the single canonical Home profile commit.
# Tauri/Fastify public-directory repair — 2026-08-30

- `sync.configure-remote` now returns `profile_republished` after idempotently queuing the current local Home profile for the remote principal. This does not rewrite identifiers on non-profile Atomes.
- Directory requests exclude the authenticated requester. Directory invalidations remain redacted to `{ principal_id, action, revision }`; public list entries remain exactly `{ principal_id, display_name, user_face, revision, updated_at }`.
- `subscribePublicDirectoryInvalidation(listener)` is the shared renderer-neutral subscription helper for `upsert`, `revoke`, and `delete`. It returns the lifecycle unsubscribe function and stores no directory cache.
- `resolveProfileIdentity` and `readProfileState` are internal profile-API support boundaries. They pair the configured profile backend with that backend's authenticated opaque principal and raw `state_current` reader; they expose no product API and create no fallback profile store.
- `repairLegacyRemoteProfile` is a private, one-shot compatibility operation for profiles previously written under the wrong remote principal. It requires an authenticated self-profile with a remote photo/custom identity and a local photo-less bootstrap identity, then persists the complete sanitized profile through the canonical Tauri commit; it is not a continuing read fallback.
- `provisionFastifyCounterpart({ phone, password, username })` verifies `/api/server/verify` locally with Web Crypto, then calls the existing idempotent `auth.account-provision` operation. `AdoleAPI.directory.list/search` prepare `auth.ensureFastifyToken()` first, so a local-only authenticated account cannot silently receive an empty public directory.


### 2026-09-07 — Dashboard cancellation and recursive playback input

Workspace opening propagates cancelled results before projection validation and
bootstrap-ready publication (the Dashboard lifecycle runtime was removed on 2026-10-24).

`project_view_surface_context_runtime.js` reads the playback root once, shares
that record with rule resolution, and includes its canonical properties/timeline
in the recursive transport input even when visible rows exclude the project.
It removes the empty synthetic root and does not replace invalid Performance mode
with a sequential rail icon. State persistence and WebGPU ownership are unchanged.

### Structured presentation campaign — 2026-09-08

Project schema exposes project_view_split (object keyed by list/table). Context runtime prepareLevel loads the current container without starting it; footer gesture ratios are resolved against that prepared transport duration. Presentation changes use existing surface intent dispatch and Atome.commit.

### Structured selection transport convergence — 2026-09-08

project_view_surface_context_runtime.playSelection owns both single and multiple structured Play. project_view_playback_follow retargets that same transport; the footer no longer starts a second item clock. project_view_contextual_rail owns the shared project/Molecule Play Mode palette, with canonical playback_rules writes and immediate icon refresh. The recursive compiler skips full Mute only in sequential/random parents; simultaneous silence retains its timeline duration. Web selection_recursive_v2 and single_mix_recursive_v9 validate these paths.

### Live structured draft projection — 2026-09-08

project_view_create_draft_runtime extends the existing visual-changed event with record/project_id. project_view_surface_events updates the content projection before rendering, preventing its older record from replacing the current drawn SVG. Draw drafts use #ffffff00 until canonical geometry sets neutral #ffffff; SVG stroke paint owns brush color. Web draw_live_projection_fixed_v5 verifies held-pointer live pixels in List/Matrix.

### Text style focus contract — 2026-09-08

The existing text_editing_session accepts retainOnBlur (default false); text_bridge enables it for scene objects. Losing keyboard focus to a style tool stops the caret but retains the active projected range. Tab/explicit commit ends the scene edit. project_scene_text_edit_state invalidates ranges by lifecycle and collapse rather than a timer. Web partial_text_color_commit_v3 verifies partial color in both structured viewers and persistence after commit.

### Interaction campaign convergence — 2026-09-08

List/Matrix controllers apply canonical selection before project_view_playback_follow receives selectionIds; an empty set stops the recursive transport. svg_draw_runtime routes inactive-brush opacity to applySelectionStyleMutation; active-brush opacity remains a brush setting. project_view_list_view retains the shared virtualizer's computed window and uses it for transport updates, preventing bottom rows from disappearing after scrub. No new state authority or renderer.

The real-pointer harness remains molecule_eve_ui_acceptance_probe; molecule_ui_acceptance_support owns input geometry, molecule_ui_image_evidence owns pixel comparisons, molecule_ui_list_acceptance owns the List journey, molecule_ui_timeline_acceptance and molecule_ui_timeline_gestures own Timeline checks, and molecule_ui_media_fixture/hierarchy_gestures/media_playback_evidence own the respective layered-media responsibilities. Existing top-level entrypoints are retained.

### Structural history and Matrix input — 2026-09-08

The canonical event mutation owner records before_identity alongside property preimages. A new identity has a null preimage; undo deletes that identity and redo restores it through the existing commit engine. Parent preimages come from atomes metadata rather than the particles table. The Web history handler uses UserVaultRouter.applyHistory for the authenticated principal and publishes committed results through existing sync. No alternate history API or bus exists. Matrix content exposes transportRecords using loadProjectViewRecordsForPlayback; tileMediaCardNode optionally accepts previewRecords for the shared composite preview.

Choice-palette contract (2026-09-24, superseding the 2026-09-18 icon/label borrowing): a palette slot PRESENTS the palette. shared/tool_presentation.resolveToolPresentation({ key, definition, label, icon }) resolves the slot's own label (an already-resolved label stays authoritative, so state-dependent labels such as Play -> Stop survive) and its own icon (explicit icon, then definition.icon, then the key); it takes no children and no activeToolIds. tool_definition_ssot.resolveToolActiveChild still resolves the locked descendant alone — that child replaces its palette's other choices in the level and is switched off from that same slot, so the click that shows and the click that turns off stay on one child. View, Mode, Activity, record action and page format no longer publish selectedChildKey: those owners keep their state and the level reads it (projectViewPlaybackModeDefinition sets active: true on the child in force). Locked tool ids stay with their owners and reach both renderers as published state (setToolLatchedState / eve:tool-state-changed); bevy_ui_main_menu_runtime no longer subscribes to PROJECT_VIEW_MODE_CHANGED_EVENT and keeps only the lock channel. No renderer-owned choice state is introduced.

### Web interaction checkpoint 2026-09-09 — scrub and hydrated preferences

`projectViewTransport.read()` exposes one shared position for every scrub scope. Superseded 2026-10-07: a List row scrub first loads that row's own playback plan (`contextRuntime.prepareLevel([rowId])`, the plan its Play loads), then `scrubNode` maps the row-local time onto it; the footer keeps the level plan. A paused row selection resumes on Play (`playSelection`). `project_view_list_view` patches the visible row cursor from `activePathIds` and the shared local positions. No persisted M/S changes are used during a scrub.

`bevy_ui_main_menu_resize_runtime` observes `INTUITION_X_STATE_EVENT` while mounted and reconciles late profile handedness through the existing geometry updater. Teardown removes the subscription. `bevy_ui_tree_motion_runtime` keeps local child geometry structural and propagates translated parent deltas to flat projected child records.

`projectViewTransport.releaseOutsideProject(projectId)` preserves a plan owned by that project and otherwise stops/releases it, clears its plan/records/root and submits an empty engine timeline. Workspace activation awaits this boundary. Superseded `load()` calls return `{ ok: true, superseded: true }` and cannot install an older prepared plan. Occurrence crop/move/split/duplicate/join/stretch transactions now use unique gesture identities even when repeatedly targeting one record.

Clip input contract (2026-09-09): project_view_list_preview_gesture owns edit-level dispatch; the playhead is inert (2026-10-07): a press on it reaches the preview beneath, and transport motion patches place it with `fixedRowPlayheadPosition`, the build's own geometry. A gesture retains the initial client X and uses physical displacement across preview rebuilds. Crop minimum endpoints are inclusive.

OpenAI lifecycle checkpoint (2026-09-10 18:13): `realtime_session.js` scopes asynchronous failures, playback completion, tool preparation and SDP to their owning generation; disposed sessions cannot close or configure replacements. `conversation_session.js` delegates voice usage to the shared quota owner. `assistant_media_session.js` adds Batch output/error preview through existing `batches.read` / `files.content` and canonical Apply; JSONL is inert data and textual preview is bounded to 8 KiB. `model_catalog_registry.js` owns corpus file list/read/detach schemas and server route projection; no parallel corpus registry. Controlled coverage is not live provider acceptance.

OpenAI integration checkpoint (2026-09-10 18:42): voice/bootstrap.js loads the shared audio.facade.js then backend.kira.js before browser voice service use, including cold Dashboard speech. No new audio engine. Main-menu inline controls cancel hold on slider acquisition and reset only transient gesture state so all five levels remain reachable inward. Text previews and mask limits use the existing localized Bevy text surface. Real Web masks/source export preserve canonical source state; tests/probes/openai_local_voice_acceptance.mjs covers local playback. See eVe/documentations/openai_integration.md for validation limits.

Realtime metering (2026-09-10): realtime_session.js reports input-transcription usage separately from response usage. model_catalog_registry.js owns standard modality tariffs; quota_tracker.js computes only complete, internally consistent token estimates. No balance or total invoice is inferred. openai_modality_metering.test.mjs and lifecycle tests cover separate billing and unknown components.

OpenAI credential correction (2026-09-10): Home vault/view owners project configured, missing or unavailable status. Stored secrets use a fixed bullet placeholder, never a repopulated editor value. Server vault remains the single OpenAI authority; native provider relay uses the same configured authenticated server, with no credential in Atome sync. Local legacy cleanup cannot convert a server-save receipt into a local-unlock failure; removal clears migration material before deleting the server key. See openai_home_vault_contract.test.mjs and openai_key_ui_acceptance.mjs.

OpenAI live repair (2026-09-10 20:15): eVe.js owns installation of the existing profile bridge; assistant_runtime.js loads canonical optional integrations. SVG Draw commit reuses createProjectDraw in svg_draw_commit_runtime.js. mcp_runtime.js projects tool envelopes without scene/view/surface; local results remain intact. Generic recording owns optional duration_ms and cancellation. Full-slot assistant icon and text/voice status reuse the ribbon and Bevy components. Live acceptance and pending lanes: eVe/documentations/openai_integration.md; maintained probes openai_live_ui_campaign.mjs and openai_live_voice_acceptance.mjs.

2026-09-10 20:55 OpenAI live acceptance: real text (750/940 chars), SVG, PNG generation/edit/import and synthetic-microphone Realtime tool calls pass. SyncEngine restore now projects full winning properties (real SVG Undo/Redo verified); AI list results are bounded metadata and search ranks relevance. Protected built-in contract validation belongs to tool_runtime_builtin_resolver.js. 178 consolidated tests and subsequent 23 focused tests pass, overlapping counts. Project playback failed, project-open exposure missing, timed recording denied by MCP permissions; broad default timeline grant rejected by automatic approval review and not applied. No full native or exhaustive API acceptance. See eVe/documentations/openai_integration.md live checkpoint and temp/openai-fixture-cleanup.json.

2026-09-10 Agenda alarm extension: calendar_api.js remains the persistent alarm/timer owner; calendar.alarm.set/read/cancel and calendar.time.read use existing AI/Runtime V2 registration and MCP dispatch. The Time palette Alarm entry and countdown reuse the Bevy calendar panel. ui.project.open uses project workspace activation; ui.project.transport uses project_view_surface_context_runtime.js and canonical project records. Default timeline rights explicitly authorized; no restricted actor widening. Controlled smoke acceptance only; suspended/closed-app and multi-device delivery remain unvalidated. See eVe/documentations/calendar_v1_architecture.md.

2026-09-10: Runtime V2 listTools projects canonical built-ins through tool_runtime_builtin_resolver.js alongside custom persisted records, preserving explicit disabling. MCP discovery and direct built-in resolution share the same definitions. Failed AI provider resolution is rejected by assistant_session_controller.js instead of silently selecting local speech. Controlled regression evidence and unvalidated Safari/Tauri/iOS lanes are recorded in FRAMEWORK_STATE.md.

2026-09-10 Direct image application: user supersedes mandatory image preview/Apply. assistant_media_session.generate now imports generated/edited PNGs immediately through the existing canonical importer by default, preserving originals and undo. Explicit internal previewOnly remains available for callers requesting a preview; the assistant tool no longer advertises mandatory approval. Regression checks cover one immediate import and refusal of a second Apply. Safari text failure remains unresolved; this change does not claim Safari acceptance.

2026-09-22 Generated media identity: `assistant_media_session.js` names every generated image and synthesized speech from its own request through `deriveGeneratedFileName` (`eVe/intuition/tools/ai_generators/media_import.js`), never from one shared constant. A media URL is immutable: the three storage owners (`server/fileStorage.js#resolveUserUploadPath`, `platforms/desktop-tauri/src/server/mod.rs#resolve_user_upload_path`, `platforms/ios/atome-auv3/Common/LocalHTTPServer.swift#availableUploadName`) suffix `stem_1.ext` instead of overwriting an existing name, otherwise `bevy_media_texture_cache.js` (keyed by source) and the HTTP cache keep serving the first bytes of that URL. Evidence: `tests/probes/media_asset_identity_contract.probe.mjs`, `tests/eve/assistant_image_identity.test.mjs`. Not a provider-side generation cache: `LocalAiProxy.swift` reloads ignoring local cache. Rebuilding the iOS app is required for the source change to reach the device.

2026-09-11 Native account-link verification: only POST /api/server/verify and its explicit OPTIONS preflight allow credential-free cross-origin access (including opaque WKWebView origins). The endpoint returns a signed public challenge; no account secret or cookie is used. Other routes retain their restricted CORS policy. auth_fastify_token preserves a failed provisioning error as link reason instead of replacing it with cache_login_failed.

- Native availability: public `GET /health` permits credential-free CORS (including opaque WKWebView origins); account routes retain restricted CORS. `adole_connection.js` uses this route before opening the Fastify WebSocket, so an unreadable health response prevents account linking.

OpenAI credential migration (2026-09-11): `provider_client.resolveOpenAiCredentialStatus` is the shared Home/assistant/catalog owner for migrating the authenticated account's legacy local token into the server vault. Existing server credentials are authoritative; successful storage precedes local removal. `provider_broker` enforces the expected principal before dispatch and on retries. No server secret is returned to clients. Regression evidence: `tests/eve/openai_credential_migration.test.mjs`.

### iOS event journal latency and atomic projection (2026-09-11)

`platforms/ios/atome-auv3/Common/AiSRuntimeEvents.swift` owns event normalization, journal append and projection as an extension of the existing AiSRuntime, extracted from LocalHTTPServer. Each event uses a SQLite savepoint so journal, particles and state-current commit or roll back together; enclosing remote-sync transactions retain ownership. Sequential batches retain per-event semantics. Sequence allocation includes `sequence IS NOT NULL`, matching the existing partial stream/sequence index rather than scanning the journal. The executable Swift probe covers rollback, duplicate IDs, nested transactions and index selection. Physical iPhone startup: 453 events / 1379 ms cumulative handler time, p50 3 ms, p95 4 ms, zero observed local request timeouts; assistant network and Mystic acceptance remain open.

### Mystic layer band, iOS provider relay and voice bridge (2026-09-11)

`bevy_ui_mystic_model.js` owns the Mystic's absolute stacking: the renderer puts every node on one flat scale (`GlobalZIndex(style.z_index ?? 0)`), so the tile grid carries `workspaceSceneLayerOrder('mystic')` down its whole subtree, the way `bevy_panel_tree.js` carries its own. A node left without a `z_index` is painted at 0, underneath every panel. `bevy_ui_mystic_runtime.js` owns dismissal on the native surface, where the document-level owner never sees the press: the presentation root closes on a press outside the tile grid and ignores only the reprojection of the still-held opening pointer (not released, and within `RIBBON_TOKENS.mysticOriginPressTolerancePx` of the opening point). Regression owner: `tests/eve/bevy_ui_mystic_contract.probe.mjs`.

`FastifySyncClient.reloadConfiguration` (iOS) is idempotent: the application re-publishes the same remote configuration before every authenticated request, and disconnecting on each one closed the provider channels carrying the in-flight assistant request (`provider_connection_closed`). Only a changed configuration disconnects.

`atome/src/squirrel/voice/bootstrap.js` loads its bridge modules as `{ id, path }` descriptors through `loadModulesSequentially`, so the packaged runtime resolves them by id from `__ATOME_PACKAGED_MODULES__`. The packaged bundle has no file at those paths; importing them directly failed the whole voice bridge on iOS. Regression owners: `tests/eve/voice_playback_bootstrap.test.mjs`, `tests/atome/src/squirrel/voice/bootstrap.probe.mjs`.

### Panel input sessions under the Mystic menu (2026-09-11)

The touch target follows the focus (2026-09-22): a retained session keeps its
hidden editor mounted, so `hidden_text_service_runtime.js` owns
`setActiveTextEditorHitTest(enabled)` and `text_editing_session.js` applies it —
`auto` on focus and on `start()`, `none` after a retained blur that does not
reclaim the focus (scene text), and `none` while a session is conserved for the
next owner. An unfocused, still-hittable field is opened natively by iOS on the
first tap that reaches it, so the tool band under it raised the keyboard instead
of acting. `text_bridge.js` re-focuses its already-active session with
`focusActiveTextEditor()` when the tap comes from the rendered scene.

`text_editing_session.js` owns whether a blur ends a session: `retainOnBlur` (stay
active, look unfocused — scene text) and `reclaimFocusOnBlur` (take the DOM focus back
— an input box with its own menu over it) are values or predicates resolved at blur
time. `bevy_panel_text_editing.js` holds its session while the Mystic it opened really
stands — the recorded field and `isMysticMenuOpen()` at blur time — released by that
menu's `onClose` or by the first blur after it is gone, including a refused opening, and
its `paste()` replaces the whole value.
`bevy_ui_pointer_runtime.js` refuses the focus to a press landing on the `mystic` layer,
which the hit result now carries from `bevy_ui_runtime.js`. `bevy_ui_mystic_runtime.js`
owns its geometry across surface changes through `subscribeRenderSurfaceSize`,
re-deriving the centre from the stored opening point, and never interrupts a close.
Root cause, evidence and rejected hypotheses:
`known-bug-solutions/ios-panel-input-fast-tap-blur/README.md`.

### 2026-09-16 — Dashboard API interne plein écran (état courant)

- `createDashboardLayout()` expose `surface_rect`, cinq `projection_lanes`, des cartes unitaires et les offsets/snap points ; il n’expose plus `create_rect` et n’utilise plus la hauteur du menu.
- `normalizeDashboardPreferences()` conserve `categories` pour les éditeurs de profil existants et valide `weather_location: { lat, lon, label, source }`. Le runtime montre toujours les cinq rubriques produit ; Store reste un outil séparé.
- `createDashboardNewsModules()` injecte météo, permission/géolocalisation, géocodage inverse, lecture/persistance, horloge et intervalle. `reverseGeocodePlace()` étend Finder. `persistDashboardWeatherLocation()` passe par `loadUserProfile`/`upsertUserProfile`, sans stockage parallèle.
- `setWorkspaceMainMenuDashboardSuspended(boolean)` est l’opération interne unique de suspension/réactivation du menu Dashboard ; elle démonte/remonte sa projection BevyUI et retire sa surface liquide sans modifier son contenu canonique.
- `buildDashboardRecords()` projette une base opaque, l’image profil `cover`, le verre canonique et les médias directs. Aucun nouvel API public, MCP, renderer, canvas ou chemin de mutation n’est introduit.
- `dashboardContentGlassStyle(categoryColor, tokens)` construit le support obligatoire de chaque cellule hors en-tête à partir de `tokens.contentGlass` et retourne seulement son remplissage transparent et son matériau backdrop teinté/flouté. Les builders météo et carte partagent cette opération ; les images de projet/contact sont des couches internes distinctes à opacité `1` et ne remplacent jamais la surface vitrée.

- `preferences.visual` holds only `handedness`, `masteryLevel` and `activityLevels` (2026-09-22). `renderStyle`, `liquidTheme`, `navigationTaxonomy`, `mysticRoundness`, `mysticTileGap` and `mysticOpeningMs` are retired: the menu renders flat, the main menu uses the legacy composition, and the Mystic tiles use the fixed `MYSTIC_TILE_GAP_PX = 3`, `MYSTIC_TILE_ROUNDNESS = 0.5` and `MYSTIC_OPENING_MS = 500` of `eVe/intuition/mystic/mystic_layout.js`. `normalizeVisualPreferences()` drops the retired keys on the next save.
- `buildMysticSurfaceUniforms({ tiles, width, height, holeDose })` packs one material per menu surface: `mystic_tiles` (centre X, centre Y in bottom origin, half side, corner radius), `mystic_tile_motion` (flip, axis, direction), `mystic_tile_colors` (family RGB and its dose), `mystic_count` (`[tile count, hole dose, shadow blur, -]`) and `mystic_style` (`[perspective in tiles, rim thickness, rim dose, edge softness]`). `normalizeProceduralSdf()` validates every array under its own code `bevy_projection_procedural_sdf_mystic_*_invalid:<id>` and pads them to twenty-four. No new public API, MCP tool, renderer, canvas or mutation path is introduced.

### 2026-09-20 — Mystic access, execution placeholders and narrow placement

Internal context inputs include canonical records/projectRecord, capabilities, explicit activity and mastery. `loadContextMenuAccess` reads the existing Atome state API; missing access projections are errors. `isContextMenuCommandPermitted` is shared by composition and nested Mystic entries. Mode changes await text/recording preservation; failed preservation retains the mode. No public API is introduced. Execution text placeholders clear their placeholder metadata in the canonical text commit.

Evidence and limits: `eVe/documentations/MYSTIC_VALIDATION_2026-09-20.md`.

Execution acceptance: the browser text-placeholder fill survived reload, then Mystic Delete removed it and closed the menu. Non-edit mode return does not read editorial ACL records; project background clicks do not select or create text. See `eVe/documentations/MYSTIC_VALIDATION_2026-09-20.md`.


## Home as the single person card — 2026-09-22

- The Home panel is the current user's card only (`open_home_panel()`, no subject). The Contact panel unfolds the card of any person in place: `contact.accordion.toggle { id }` expands that row and its body is the Home card built by `createHomeCardRuntime()` (`bevy_panel_home_card.js`) with the same view builders (`bevy_panel_home_view.js`). Card intents (`home.accordion.toggle`, `home.subaccordion.toggle`, `home.field.*`, `home.list.add|remove`, `home.photo.pick|drop`) reach the Contact surface and are delegated to the open card. `contact.add` creates a generic local contact and unfolds it; `openPanel('contact', { contactId })` (Dashboard) unfolds that row; `{ createNew: true }` adds one.
- `bevy_panel_home_subject.js`: `loadHomeSubject(id)` reads the person from `collectPeopleDirectory()` (refuses the current user with `home_subject_is_current_user`: their row mounts the Home card itself through `mountHomeCard()` / `buildHomeCard()` / `handleHomeCardEvent()` of `bevy_panel_home_runtime.js`, so it shows strictly what the Home panel shows, settings and session action included); `persistHomeSubject()` saves only a local address-book contact through `Squirrel.contacts.updateLocalContact` (identity + `custom_fields`); `homeSubjectAllows(subject, intentType)` refuses every writing intent on a read-only card with `home_subject_read_only`.
- Profile field `sharing.fields` (contract `atome/src/shared/profile_sharing.js`): never set → `name`, `first_name`, `nickname`, `user_face`; otherwise any subset of `SHAREABLE_PROFILE_FIELDS`. Home intent `home.sharing.toggle { key, checked }` writes it.
- `directory.list` entries now carry, beyond `principal_id`, `display_name`, `user_face`, `revision`, `updated_at`, each shared field that holds a value (`name`, `first_name`, `nickname`, `phone`, `email`, `custom_fields`, `bio`, `competences`, `passions`, `experiences`). `display_name` is built from the shared name fields only. `user_face`, `phone`, `email`, `bio` and `competences` still pass `allowsPropertyRead(..., 'directory')` for the requester.

### 2026-09-24 — Lit tools: single residence and pinned rail zone

- `eVe/intuition/tools/core/active_tool_registry.js` is the single owner of the tools that remain lit once started. It publishes `ACTIVE_TOOL_SURFACE` (`rail` | `menu`), `ACTIVE_TOOL_ENTRIES`, `isActiveToolId(toolId)` (ribbon side: a lit tool, never an open panel or palette), `isActiveRailToolKey(key)` (rail side), `readActiveToolEntries({ keepToolId })` and `stopActiveToolEntries({ keepToolId })`. `readActiveToolEntries()` returns the lit MENU-resident entries `{ key, kind, toolId, surface }` in catalogue order; for rail-resident keys the lit state and the lit presentation stay on the rail definition itself (`active: true`, label/icon — Play becomes Stop), so no second lit-state table is created and no presentation is duplicated.
- `stopActiveToolEntries({ keepToolId })` stops each lit tool through the method its own runtime already publishes (`__eveTextTool.deactivate`, `__eveDrawTool.deactivate`, `eveCodeToolApi.close`, `eveProjectViewCreationApi.setPageToolActive`, `evePlaceholderCreationApi.setActive`, `eveTemplateCreationApi.setActive`, `eveGeneratorApi.setActive`), publishes `setToolLatchedState({ tool_id, latched: false })` for each, and awaits `eveProjectViewCreationApi.finishTool(kind)`. The drawing family keeps its neighbours (`tool.main.draw`, `ui.draw.*`, `ui.couleur.*`, `tool.main.size`, `tool.main.couleur`) alive. `tool_runtime_circle_tool_state.stopOperativeCreationTools` is a thin historical alias of this entry point.
- Rail presentation: `buildAtomeContextualEditTree({ ..., activeSlots })` filters the moved keys out of the ordinary level (through `withoutMovedTools`, roots only) and pins one case per lit rail tool with `position: [layout.x, layout.bottom - (index + 1) * itemSize]`, where `layout.bottom = height - reservedMainMenuHeight`; `activeSlots[0]` — the oldest activation — is the closest to the Atome handle. The scrolling viewport keeps `availableRailHeight - pinnedHeight`, so the reserved zone never scrolls and the ordinary stack is pushed up by exactly its height; the shared rail shadow covers the union of both. Pinned cases carry `active: true` and `interactionFeedback: true` and reuse the level node ids `atome_contextual_tool_<safeId(key)>` (`…_icon`), hence the same handlers and the same tool identity. The options a pinned tool opens on a long press stay anchored to that case (same rule as its ordinary place) and carry its palette accent when open; the case's own face is read from the level definition when it is still published, so a reduced slot only needs its key, label and icon.
- Rail order: `atome_contextual_edit_runtime.js` keeps the activation order in `state.activeSlotOrder`, pruned to the keys still lit; after a cold render the order falls back to the catalogue order the level is published in. (Superseded 2026-10-23: one canonical order, `atome_contextual_rail_order.js`; the base is pinned, a lit level tool stays in place.)
- Ribbon presentation: `resolveBevyMainMenuLitToolIconIds({ items, latchedByToolId, isStayLitTool })` returns `${item.id}_icon` for the slots that DISPLAY a tool that stays lit — an expandable slot reads its `activeChild?.toolId` (the locked palette child, R3), and an open panel/palette is never returned.
- Glow (2026-10-09, replaces the icon pulse): each surface asks `createLitToolGlowPulse().glowFor(id, engaged)` while building and calls `run()` after the mount, `clear()` at unmount. Engaged excludes a case that only displays a value. See ARCHITECTURE_MAP `### 2026-10-09 — Engaged tools glow`.
- Non-goals: no second command system, no mirrored lit-state table, no per-case animation or timer, no DOM proxy, and no change to the persisted rail tool set or to the tool catalogue.
- Evidence: `tests/eve/contextual_rail_active_zone.test.mjs` (pinned zone geometry and handedness, non-scrolling zone, non-duplication, menu-resident tools absent from the rail, stable ids, pulse sync/clear) alongside `contextual_rail_scroll`, `bevy_ui_main_menu_contract`, `bevy_ui_main_menu_animation_lifecycle`, `bevy_ui_main_menu_palette_motion` and `npm run check:syntax`. Real-runtime pixel acceptance (Web 3001 / Tauri) is required for the visible pulse and the one-press stop; it is not claimed by this document.

### 2026-09-24 — Pinned rail case without a rail, plus the stop that no selection may block

- `readActiveRailToolEntries()` (same registry) is the reader of the lit FACTS of the rail family that can run with no level at all: a record reads `readRecordActionState()` (key/live) and, when that owner is silent, the capture owner's own action state (`BOOTSTRAP_RECORD_ACTION_RUNTIME_STATE`, `mode: 'media'`); a playback reads `selectedProjectMediaPlaybackEntries().playing` first and the project transport second. Each entry carries `{ key, kind, toolId, surface: 'rail', label, icon: 'stop', latch: true, actionMode: 'toggle', active: true, extraInput }`, and `extraInput` hands the stop its running target (`selection_ids` for a playback) or its running source (`mode`, `record_source` for a record).
- `atome_contextual_edit_runtime.activeSlots()` merges that registry with the level definitions (the level wins a key it publishes) and `pinnedOnlyDefinitions()` lists the lit keys the level does not publish; `buildAtomeContextualEditTree({ activeSlots })` therefore receives a moved key whether or not the rail exists. `renderOnce()` computes the lit slots BEFORE its early returns and `mountPinnedZoneOnly()` mounts an empty-definition tree (`activeAtomeId: ''`, no scroll viewport, `…_pinned_shadow` for the rail exterior depth) as soon as something is lit and no object is selected or editable; the ordinary path is unchanged.
- `createAtomeContextualEditHandlers` answers a pinned-only case through the SAME canonical invocation (`runActiveDefinition`, `previousLatched: true`, `sourceLayer: 'atome_contextual_menu'`), and a lit rail palette that no longer publishes a locked child turns its own tool off instead of opening.
- `invokeActiveDefinition` keeps its pre-check for a mounted level, but a pinned-only case has no editing entry: it delegates to the canonical invocation with no target of its own and lets the tool gateway stay the owner of the authorization decision.
- `atome_contextual_rail_definition_invocation_runtime.js` now passes the definition's own latched state to `maybeBlockSelectionRequiredToolActivation({ active })` instead of a hard-coded `false`: a press on an ALREADY LIT tool is a stop, which the "selection required" guard must never swallow as `no_selection_target`. Arming with no target is still refused.
- `atome_contextual_rail_runtime.js` no longer installs its own playback listener: `atome_contextual_edit_runtime.install()` listens to `eve:tool-state-changed`, `SELECTED_PROJECT_MEDIA_PLAYBACK_STATE_EVENT`, `PROJECT_VIEW_TRANSPORT_STATUS_EVENT` and `eve:video-recording-state` itself, so the pinned zone repaints while the rail is closed. 2026-10-15: `project_view_transport_runtime.js` publishes `PROJECT_VIEW_TRANSPORT_STATE_EVENT` each tick (position) and `PROJECT_VIEW_TRANSPORT_STATUS_EVENT` (`eve:project-view-transport-status`) only when status, root, selection or active leaves change; the rail listens to the latter (85 → 1 re-render per 3 s while playing). `PROJECT_VIEW_TRANSPORT_SESSION_ID` names the one engine session of structured and Natural-structured play.
- Evidence: `tests/eve/contextual_rail_active_zone.test.mjs` (16/16: media record and running playback keep their case above the Atome handle with no rail, live stop payload, one occurrence, survival across an object change, lit definition wins over an empty selection) plus `contextual_rail_scroll`, `bevy_ui_main_menu_contract`, `bevy_ui_main_menu_animation_lifecycle`, `bevy_ui_main_menu_palette_motion`, `atome_edit_footer_delete_cold_start`, `capture_recording_lifecycle`, `selected_project_media_playback_runtime`, `project_view_list_transport_ui`, the manifest guard and `npm run check:syntax`. Real-runtime pixel acceptance (Web 3001 / Tauri) and iOS remain to verify.

### 2026-09-25 — Armed creation tools: taxonomy residence, rail options, `eveGeneratorApi`

- `eVe/intuition/menu/context_menus.json` gains `vocabulary.tools` = `text, draw, code, page, placeholder, generator, template` and `menus.sidebar.tools.<tool>` = `{ inherits, pinned: true, options }`; the option commands (`page_format_*`, `placeholder_*`, `placeholder_duration`, `placeholder_max_chars`) are `option: true` commands of the existing `shape` kind (the two limits are `write`, the rest `create`), so `resolveContextMenu({ menu: 'sidebar', context: { type: 'tool', tool } })` is the rail's option list and the editor's table. No new `vocabulary.kinds` entry and no new i18n key.
- `eVe/intuition/tools/core/active_tool_registry.js` publishes `isCreationToolPinned(key)`, `readCreationToolResidence(key)` (`rail` when pinned, `menu` otherwise), `readCreationToolContentKey(key)` and `readCreationToolResidences()`. `MENU_ENTRIES` gains the Generator line (`eveGeneratorApi`, read `isActive`, stop `setActive`) and `PINNED_CREATION_RAIL_KEY.generator = 'generator'`; `readCreationToolResidences()` and the pinned cases now cover code, page, placeholder, generator and template without per-tool code.
- `window.eveGeneratorApi` (`eVe/intuition/tools/generator/runtime.js`) publishes `run`, `runCase(generatorId)`, `isActive()`, `setActive(active)`, `readChoice()` and `list`. `setActive(true)` stops the other operative creation tools with `stopOperativeCreationTools({ keepToolId: 'ui.generator.create' })`; both transitions publish `eve:tool-state-changed` (`route: 'generator_runtime'`) through the single `dispatchGeneratorEvent(name, detail)` helper, which also carries `eve:generator-generated`. Running a generator arms the tool and records the lit case; the run itself still goes through `eveToolBase.createAtome`.
- `buildArmedToolRailDefinitions({ tool, projectId, win, content })` reads the declared options from the taxonomy, and — for a pinned tool whose content declares its list — from `readCreationToolContentKey(tool)` + `catalog[contentKey].option_keys` (a declared family is replaced by its own generators; the ribbon's palette `children` are never read as rail cases). Each case carries `active` read from its owner, `generatorId` for the Generator, and the slider fields for the two Placeholder limits; `invokeArmedToolOption(tool, definition, { payload }, win)` routes the press to that owner (`eveProjectViewCreationApi.setActive(true, format)`, `evePlaceholderCreationApi.setActive(true, kind)`, `ui.placeholder.*.apply` through the tool gateway, `eveGeneratorApi.runCase(generatorId)`).
- Evidence: `tests/eve/armed_tool_rail_definitions.test.mjs`, `tests/eve/context_menus_characterisation.test.mjs`, `tests/eve/create_tools_modes_contract.test.mjs`, `tests/eve/contextual_rail_active_zone.test.mjs`, `temp/tool_taxonomy_probe.mjs` (44 checks), `npm run check:syntax`, `npm run check:m0`. Web 3001 / Tauri pixel acceptance and iOS remain to verify.
### 2026-10-14 — Prompteur: generator, commands, panel, AUv3 host bridge

- `registerGenerator` (`eVe/intuition/tools/generator/registry.js`) accepts `temporal: true` (creates at the level read from `readCurrentInsertionTarget`; inside a Molecule the result becomes a clip through `eveMoleculeTimelineApi.wrapAtomeInGroupTimeline`) and `longPressToolId` (rail case `long_press_tool_id` + `longPressAction: 'hold'`). A spec may carry `props`, written right after `createAtome` with `window.Atome.commit({ kind: 'set' })`. `ui.generator.run` passes the rest of its input to the generator as context (`source_atome_id`).
- `invokeArmedToolOption` (`armed_tool_rail_runtime.js`) opens a case's declared tool on long press (`source: 'bevy_ui.long_press'`, gateway `action: 'open'`).
- Commands (`prompter_tools.js`, `registerUiAction`): `prompter.edit` {atome_id, operation: set_cue|toggle_keypoint|toggle_lock|clear_cue|clear_all|record|set_mode|set_between|set_clock|set_offset|set_weight|set_duration|stretch|sync_source, line?, at_seconds?, value?, cascade?, taps?, replace?, from_seconds?} — one history step each; `prompter.transport` {atome_id, operation: play|pause|stop|seek, at_seconds?} (play/pause/stop through `ui.project.transport`, seek through `projectViewTransport.seekNode`); `prompter.export` {atome_id, format: srt|vtt, download?}; `ui.prompter.panel` {atome_id?} (toggle/open/close; a plain text offers « make a prompter »). Rail command `prompter` (`context_menus.json`, kinds text, panel `prompter`).
- `atome/src/application/audio_runtime/auv3_host_bridge.js`: `window.AUv3API._receiveFromSwift` (dispatch by `action`), `subscribeAuv3HostMessages(action, fn)`, `sendAuv3HostAction(action, body)` (swiftBridge `postMessage`), `subscribeAuv3HostClock(fn)` (starts/stops `startHostTimeStream` + `startHostStateStream`), `isAuv3HostClockAvailable()`.
- Shared: `formatTimecode`, `parseTimecode`, `formatMusicalPosition`, `quantizeSecondsToBeat` (`#squirrel/shared/timecode.js`); `evaluateAutomationKeyframes(keyframes, t)` (Molecule kernel); `setVisualPreferences(patch, { source })` (`user_visual_preference_writer.js`).
- Generator commands, one owner each (2026-10-14): `ui.generator.create` arms/disarms the Generator tool (`{ active? }`, toggle; V2 bootstrap definition `generator_create` + `invokeDirectCreateToolState` → `eveGeneratorApi.setActive`; it is the Create palette entry's `tool_id`, the `eve:tool-state-changed` `tool_id` and the `MENU_ENTRIES` id); `ui.generator.run` runs one generator (`{ generator_id, seed?, source_atome_id? }` → `runGenerator`, registered only by `installGeneratorRuntime`) and does not arm the tool. Rail run cases keep `tool_id: 'ui.generator.run'` + `extra_input.generator_id` and are pressed through `eveGeneratorApi.runCase` (arm + run). Family sub-palettes are `ui.generator.create.<family>`. The prompteur panel's `prompter.create_from` calls `ui.generator.run` through the tool gateway. Guard: `tests/eve/finder_import_context.test.mjs` (the bootstrap never resolves `ui.generator.run`).
- Evidence: `tests/eve/prompter_timing.test.mjs` (7), real-app probes `temp/prompter/prompter_lot1.probe.mjs` (13), `prompter_full.probe.mjs` (24), `prompter_host_clock.probe.mjs` (1).

2026-09-27 native authentication intake: iOS `SceneDelegate` routes `connectionOptions.userActivities`, `connectionOptions.urlContexts`, continued browsing activities and open URL contexts through the existing `AuthLinkInbox.receive` API. Only `https://atome.one/auth/v/<43>#t=<43>` is retained for five minutes; logs expose acceptance state only, never the proof URL. Guest workspace entry returns `{ ok: false, error }` when the canonical Dashboard/project handoff fails and remounts the login choices; it no longer reports success over an empty canvas.

2026-09-27 cross-device phone link: `phone-link-confirm { attemptId, token }` is the non-session-bearing SMS-opener action. It verifies the fragment secret and publishes `phone-link-ready` to the requester socket registered by its earlier signed `phone-link-resume`; only a subsequent resume proof from the attempt's original key may return a token/session. `phone-link-consume` remains the same-device path. Opening a Tauri-requested link on iOS therefore never authenticates iOS or requires an iOS session.

## Project programme commands (2026-10-01)

2026-10-13, ATM-2017 shared activity extension: existing `project.program.read` accepts `operation: activity_read` without a project. Existing `project.program.commit` additionally accepts `activity_create`, `activity_link`, `activity_bind`, `activity_complete`, `activity_correct`. These operations are account-global and retain captured-actor checks while permitting workspace changes. Existing project-local operations still require `project_id` at the runtime boundary; preview retains its schema requirement. New nested activity/execution inputs reuse the canonical `record` schema through `ACTIVITY_INPUT_PROPERTIES` in the Programme model.

The existing `ui.panel.open` surface `program` accepts `tab: activities` to consult this library through the same registered read command. Its native Programme tab chips also select the library from a loaded programme. It provides no alternate write API; user creation/link/execution controls remain pending. Integrated isolated Web guest selection/Refresh and persistence pass; human final acceptance and native/cloud verification remain open.

Creation takes `activity_id`, `activity { brick_id, title, involvement }` and `recorded_at`. Linking takes `activity_id`, `objective_id`, `recorded_at`; one immutable domain-qualified identity represents each pair. Binding takes `activity_id`, `calendar_event_id`, `recorded_at`; the event must be an owned personal, nonrecurring calendar event. It returns `occurrence_id: program_occurrence:<calendar ID>` and `execution_id: program_execution:<calendar ID>`. Calendar creation/movement/status/alarms retain their current owner. Completion takes `activity_id`, `occurrence_id`, `execution { start, end, provenance, use_in_followup, note }`, `recorded_at`. Correction additionally takes caller-stable `correction_id`, nonempty `supersedes_ids` and `reason`. It appends a record, never changes the original execution. Competing correction leaves are exposed with `conflict`, `candidate_ids` and unavailable totals until an explicit correction supersedes them. Read projects activity/objective references onto one realized count and duration; objective totals must not be summed as independent time. Stable event/transaction IDs use the existing replay contract, not property compare-and-swap. Real isolated Web guest persistence/reload is verified; authenticated cloud, Tauri/iOS and the proposed new screen remain unaccepted. The paragraph below describes the previous project-local contract.

`project.program.read`, `project.program.preview`, `project.program.commit` are hidden registered native tool definitions in `eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js`. The existing bootstrap routes them to `eVe/domains/programs/project_program_runtime.js`. Project-local operations take explicit `project_id`. Project-local commit operations: accept, observe, pause, resume, restore, reconcile, configure. Acceptance requires request identity, current base revision and the verified preview signature. Resume/restore produce proposals. Actor/project context and owner checks guard asynchronous writes. The registered-handler result is nested in the normal gateway envelope; panel consumers unwrap both levels, including domain validation errors. Multi-device plan compare-and-swap is unverified; the account-global immutable activity contract is described above.

Programme confidentiality reuses `eVe/domains/news/news_publish_api.js` and `server/news_broadcast.js` (canonical vault ancestor checks) before mutation/broadcast; `server/server.js` injects the existing vault provider. Native guest projection in `atome/src/squirrel/apis/unified/adole_api/guest_workspace_store.js` preserves canonical type before considering business `kind`. These are owner extensions, not separate storage or rights systems.

### 2026-10-02 — awaited panel opening and prepared opacity

Panel definitions may await onOpen and request reveal(nodeId); the runtime mounts the resulting tree before revealing the requested card/editor. Contact opening passes context.contactId and disables toggle-close for exact reopening. Calendar opening passes context.eventId and performs a canonical point read independent of search pagination. BevyUI setTreeOpacity remembers a prepared value before a tree exists; subsequent mounts/updates retain it unless explicitly overridden. Main-menu suspension accepts initialOpacity for project arrival. Contacts imports retain their public API and notify the shared directory after VCF import. Health capability discovery uses read-only authorization status and never requests permission; iOS header entry now owns the centralized HealthKit request; account association remains explicit and capability discovery never prompts.

2026-10-05 internal Bevy paint contract: optional normalized style `content_z_index` selects the content paint level; absence retains `z_index + 2`. Floating-panel projection uses it to compact sparse levels while keeping each whole window in its own range. Preview `overlayRecord` layers are scoped when this field is present. Public panel/business APIs are unchanged. See `eVe/documentations/panel_stack_validation_2026-10-05.md`.
2026-10-06 Telephone input uses the existing hidden text owner: `mountActiveTextEditor` and `createTextEditingSession.start` accept optional `inputType: 'tel'` (default `'text'`). `createPanelTextEditingRuntime.registerField` relays it; Matrix `template_control.input_type: 'tel'` selects it declaratively. Native type/inputmode/autocomplete are set before synchronous focus; unsupported modes throw. No new endpoint, command or durable preference.

2026-10-07 Matrix Template groups reuse ordinary group Atomes with `matrix_grid` and `parent_id`; `template_control.kind: group` composes their children, and `surface: content` selects the existing Dashboard material. `kind: notice` projects the current localized notice inside the composition. No new tool/API transport, schema property, style preset or business write owner; installed/linked templates use the same declarations.

2026-10-07 Matrix slider controls compose the existing expanded horizontal tool slider, including its quantized drag handlers. Sleep v2 retains the declared hours 7–11 (step 0.5), effort 0–100 (step 1) and preparationMinutes 10–300 (step 5), defaults 8/50/10. Gestures update the existing draft; Validate invokes the existing configure_sleep → project.program.commit route. No new command, business property or transport. The existing scroll area owns natural-content offsets; shared flow alignment replaces a fixed-position content child.

2026-10-13: optional `template_control.compact: true` composes the native horizontal ToolSlider in a closed square, opening onto 2–3 Matrix columns with reversible neighbour displacement. `sliderOptions.lengthPx` selects the required span within those bounds; compact controls require a single declared cell and at least two columns. Custom `layoutCell` expansion is explicitly unsupported. Existing declarations without `compact` retain their expanded presentation. Draft frames do not persist; gesture end calls the existing injected `commitValue`, while cancellation, blur during manipulation, resize and disposal restore the start value without a commit. Embedded modules still bind this callback to the existing `ui.matrix.value`; the authorized work-mode exception permits declared text/number/slider controls with a value key beneath a live Matrix template of the active project. Canonical hierarchy reads reject foreign/deleted/missing/cyclic targets and changed contexts. The existing handler retains lock/value checks and Atome commits; backend permissions remain authoritative. Actual Web save/reload is verified in Consultation and Performance. No new tool, transport or schema registry.

2026-10-07 Dashboard composed card content may select `layout: label_band`; Matrix relays the optional `template_control.content_layout`. This assembles the existing bottom label-band geometry/material/clip, full-label fitter and image record with a centered icon. Absence retains the approved detailed Access/Billing composition. No new component registry, skin token, public command, transport or business property.

2026-10-07 Matrix `template_control.kind: identity_photo` composes the existing `identityMediaFrameNode`; `value_key` selects the supplied profile image, with the native placeholder and accessibility label. First-launch `ui.first_launch.commit` accepts `operation: photo` only at the authenticated Profile step. The existing Home profile editor requests one image from the standard Media selector and commits only `user_face` through the existing profile owner; cancellation is successful cancellation, and account/generation changes reject the write. No new endpoint, picker, schema property or upload API.
2026-10-07 — Optional framework slider contract (supersedes Sleep v2 bounds below). Existing `Slider(config)`, `ToolSlider.mountIntuitionXSliderToolContent`, `buildBevyToolSliderNode` and ordinary tool/Matrix definitions accept `sliderOptions: { showBounds, lengthPx, valueInsetPx }`. Defaults are false/null/0. Bounds derive from the real min/max/unit; length is a positive number or `fill`, resolved against an explicit `availableLength` supplied by the owning layout. That measurement stays ephemeral; serialized tool declarations retain sliderOptions and zero minima/values, not viewport measurements. `atome/src/squirrel/components/slider_contract.js` is the common pure owner for normalization, quantization and formatting; existing Spark registrations remain the access path. Generic Slider supports horizontal/vertical/circular, ToolSlider horizontal/vertical. No new tool ID, registry or durable writer. Sleep v4 uses 1–11 h/default 8, 0–100 %/default 50, 10–300 min/default 10; weight/height use the existing profile bio owner and first-launch save/resume pipeline.
2026-10-08 Internal creation shortcut contracts: `armed_tool_state.js` exports `rememberLastCreationTool(tool: string)` and `readLastCreationTool(): string`; `readArmedToolState()` retains its `{ tool, projectId }` shape. `active_tool_registry.js#readLastCreationRailToolEntry()` returns a normalized existing pinned Create definition with native `active`, `creationTool` and unchanged `extraInput`, or null when no compatible catalog entry exists. The contextual unified invocation delegates `extraInput.create_family === true` to the existing Create invocation; native stop and command/policy/mutation routes remain in their owners. Session UI state only: no public command, schema, persistent history or MCP transport is added. Six regressions cover the internal extension; real Web gestures remain blocked at renderer startup.

### 2026-10-09 — Internal User/List composition changes

No tool id, public command, schema, persistence API or dependency is added. ui.capture.audio and ui.capture.video retain native start/stop and persistence; the existing rail invocation routes Stop with state.off. The internal capture feedback factory chooses a projectVisualResolver destination once per session and retains it through transitions/disposal. projectViewVisualPanel composes setToolRecordingVisual/clearToolRecordingVisual/pushToolAudioScope/pushToolVideoFrame from createMainMenuRecordingVisualRuntime and exposes readCaptureVisual to the existing active-tool registry. The shared visual runtime accepts treeId (main-menu default); the existing builder accepts rectangular bounds (square default). These are disposable presentation contracts, not writable business state. Native audio/video owners remain recording truth. Visual capture forces the existing preview visible only while needed, preserves the normal enabled/selection owners, and masks frames outside the captured project. listHierarchy.edgeGapPx carries existing layout spacing into the canonical hierarchy painter. Contacts removes obsolete Conditions state/handlers; Finder and personal privacy contracts remain intact.

ui.capture.audio/ui.capture.video handler admission reuses the native active/pending readers and the existing operation queue. Opposite recording conflicts return the existing audio_recording_in_progress/video_recording_in_progress errors before any feedback or hardware start. Stop and a subsequent opposite start keep the same public command contract.

2026-10-09 — Shared project default and wallpaper reconciliation. The existing background API (`eveBackground.getParams/setParams/applyPreferences/defaults`) is preserved. The private default owner exposes `DEFAULT_SURFACE_BACKGROUND_HEX/RGB/RGBA`; creation consumers now use the common HEX rather than a second new-project constant. Unused `readDefaultSurfaceBackgroundCssValue` and panel signature helper are removed. Background save results retain explicit failure status, including `background_owner_changed`; saves capture owner/selection and serialize through the existing profile API.

2026-10-10 Internal iOS sync contract: `AiSRuntime.persistRemoteSyncEnvelope` accepts the configured local principal and verifies its unlocked remote binding; journal envelope identity stays unchanged and only the projection localizes own-account IDs. `prepareRemoteSync/pendingRemoteSync/finishRemoteSync` operate the existing fastify outbox with account-scoped event receipts and bounded batches/backoff. Canonical `events:commit/commit-batch` now enqueue atomically; `/ws/api sync:push` remains the existing remote mutation interface. FastifySyncClient publishes `sync:projection-ready { stream, replay }` only after durable replay/live persistence; the existing message dispatcher emits `squirrel:sync:projection-ready` with that non-authoritative detail. No public endpoint, business field, tool, setting or additional transport is introduced.

2026-10-10 Assistant voice recovery changes no public API. Runtime V2 listTools keeps its existing custom/disabled filtering contract but no longer waits for bootstrap writes. The existing iOS provider relay preserves in-flight calls through sync recovery and identical configuration reloads; logout still closes voice. Realtime presents provider_connection_closed distinctly from provider errors even when remote cleanup also fails.

2026-10-10 iOS provider transport also sends bounded WebSocket heartbeats while Realtime media bypasses its control socket. Same verified local/remote account, server and environment identity survives token renewal; new requests still use the current token, and scope changes/logout close the old channel. Native recovery probes cover renewal, idle liveness and environment invalidation.

2026-10-10 Voice argument recovery: `atome/src/squirrel/ai/conversation_session.js` rejects malformed/non-object voice function arguments as a canonical `conversation_tool_arguments_invalid` tool result before any MCP execution; it delivers that result through the existing voice tool owner so the connection remains usable. Tool permissions, context instructions and normal valid-call routing are unchanged. Regression: `tests/eve/realtime_link_recovery.test.mjs`.

### 2026-10-11 — Calendar next and Dashboard detail

The existing `calendar.next({ reference, limit, projectId })` now limits chronological future occurrences after recurrence/exception expansion; no arbitrary future date window is introduced. It returns canonical `id`, derived `occurrenceId`, and derived `seriesId` for master-directed recurring mutations. A null business project is accepted for personal/account Calendar reads; the neutral Dashboard renderer identity is excluded. `CalendarAPI.listEvents` enumerates complete 1,000-row canonical pages and reports invalid/superseded/session-changed reads. Primary-source failures propagate. Existing `openPanelSurface("calendar", { eventId, occurrenceStart, source: { type: "dashboard_calendar_item" } })` invokes the exact canonical read and composes the existing editor alone. Save/delete still invoke Calendar CRUD and Atome.commit; source writability and canonical rights apply. Success closes the detail. No new command, registry, storage or cache is added. Source/contracts verified; real Web/Tauri/physical-iOS interaction acceptance remains pending.
### 2026-10-11 — Assistant status and explicit recovery

`buildInlineSearchNodes` accepts optional `status` with text/action; ordinary editors retain their existing contract. `eveAssistantApi.openErrorPanel(error)` starts one explicit navigation attempt through the canonical prerequisite owner; startup errors no longer navigate automatically. `refreshVisual()` requests the existing scene update after ribbon resize. `openAiFailure` in `atome/src/squirrel/ai/openai_stream.js` normalizes HTTP, Realtime and Responses failures to safe provider_code/http_status categories, discarding raw provider text. No automatic paid-operation replay is added.

2026-10-13 hidden registered `ui.matrix.navigation`: required operation save|restore|enter|back; optional project_id, atome_id and context using `ATOME_MATRIX_NAVIGATION_SCHEMA`. Action read is ephemeral and restricted to restore; commit persists the other operations through Atome.commit on the account/project-owned global record. Version-1 state contains project_id/path and per-level selected_ids/scroll_y, without business content. Restore rereads canonical hierarchy, prunes deleted levels and rejects foreign/deleted state or unavailable/incomplete reads. Writes require the active project; read-only restoration also accepts its existing arrival transition. Native consumers use project_view_navigation.requestProjectViewNavigation; no MCP transport or registry is added.

2026-10-13 BevyUI keyboard/semantics: The authorized BevyUI runtime exposes internal ephemeral `focusTreeNode({ id, nodeId })` for real normalized nodes; it does not write Atome state. The existing event-name normalization accepts key_down. Native accessibility metadata configures default_action and navigation_group; a group has one Tab stop. Matrix uses Enter for native double_click/open, Space for activate/selection, and native key_down for arrows/Home/End/Page movement, virtual-window reveal and Back. Semantic controls reread current handlers; detached controls cannot activate replacements. The existing ui.matrix.navigation command remains the durable navigation owner.

2026-10-13 official objective entry: the existing ui.new_project command accepts optional objective_id (OBJ-01 through OBJ-13), family, goal and name. Guided and empty Dashboard cells use the same gateway/registered handler and canonical creator; invalid/inconsistent identities are refused. Optional project_intent.objective_id uses shared ATOME_OBJECTIVE_IDS; legacy family/goal records remain valid. Free expression is the canonical project name; ui.project.open reopens without recreating the programme. Matrix readState exposes ephemeral navigationError, cleared by successful navigation, without a durable error field.

2026-10-13 MIDI capture: hidden registered `ui.capture.midi` (toggle; actions pointer.click/state.on/state.off start or stop the take, pointer.long/hold opens the input chooser) and `ui.midi.input.panel` (toggle panel surface `midi_input`; pointer.click/open/close), both declared in `tool_runtime_bootstrap_midi_schemas.js`. The rec. palette children become audio, video, photo, screen, midi (`tool.main.capture` and the ribbon); `ui.record.actions` is unchanged and stays on the project rail. The rec. ribbon entry carries `longPressAction: 'hold'` and `long_press_tool_id: 'ui.midi.input.panel'` for the rail and Mystic. Internal exports: `encodeSmfFromEvents({ events: [{ at_ms, bytes }], division?, microsecondsPerQuarter? })` (format 0, channel messages only, system status rejected) in `domains/midi/smf.js`; `importMidiMedia({ file, projectId, properties, origin })` in `audio_to_midi/result_media.js` (`createMidiMedia` keeps its signature and delegates); `listMidiCaptureInputs`, `readMidiCaptureInput`, `selectMidiCaptureInput`, `startMidiCapture`, `stopMidiCapture`, `getMidiCaptureState` and the `eve:midi-capture-input-changed` window event in `midi_capture_runtime.js`. `AtomeMidi.monitor` messages now also carry the raw `data` bytes. The selected input is device-local runtime state, never persisted or synchronized. A take creates one `midi` media Atome (label `<Take HHhMM> - MIDI`, `note_count`, `duration_sec`) through the canonical importer; an empty take returns `{ ok: true, status: 'discarded', reason: 'midi_capture_empty' }`.

2026-10-13 ATM-2017 Effort: existing ui.matrix.value validates the declared step and named values before template_value commits. Optional sliderOptions.valueLabels maps numeric values to presentation captions; Matrix control.value_label_keys resolves through eveT. sliderValueCaption and isSliderValueValid belong to atome/src/squirrel/components/slider_contract.js. Guided ui.new_project health creation composes objectiveEngagementAtoms via ensureObjectiveEngagement in the existing template owners; no additional command, transport, registry or durable preference. Older projects are not silently migrated; capacity-aware proposal remains unavailable.

2026-10-13 ATM-2017 P006/V02 (explicitly authorized): The existing project.program.preview declaration/handler accepts operation engagement_preview plus engagement_atome_id, optional capacity_atome_id and explicit available_minutes. project_program_runtime reads canonical private active-project controls; buildEngagementPreview returns editable UX seeds, proposed/remaining minutes and preparation_only without writes or dates. Existing ui.matrix.value validates choice through select_contract, rejects unknown/disabled/non-canonical values and allows null only when optional. No new registry or transport.

2026-10-13 ATM-2017 P007: existing ui.matrix.value accepts declared time_budget controls with exactly {minutes,basis,days}. Existing project.program.preview supports operation budget_preview with time_budget_atome_id, explicit period/timeZone and typed occurrence_id/time_breakdown/counted_parts entries; canonical reads determine Calendar identity and placement, deduplicate once and return occupancy/load plus reduce/defer proposals without writes. engagement_preview may use the same budget reference instead of legacy explicit available_minutes, never both. Existing project.program.read returns the derived unique Matrix budget; ordinary preview/accept consumes it and detects stale signatures. No new command registry or transport.

2026-10-13 ATM-2017 native objective projection: matrix_module_runtime.prepareMatrixTemplateProjection composes existing objective_engagement instances through setEmbeddedProjection/readEmbeddedProjection; these are internal lifecycle methods, not new command registries. List now invokes existing ui.matrix.navigation for enter/Back/reload restoration. Session-only List selection/expansion/window memory remains explicit.
2026-10-14 ATM-2017 health collection: existing project.program.read/commit expose collection_read, collection_answer and collection_permission; typed inputs select a health project or owned global activity, a real brick, optional explicit manual answer/uncertainty/review date, or preferences/journal purpose consent. Responses identify the optional current question, original source IDs/date/provenance/uncertainty/freshness, permissions and unavailable connections. A source is never read before purpose consent; journal additionally requires useInFollowup. Shared manual preferences and per-purpose permission are canonical global record Atomes written together through Atome.commitBatch; no separate API registry or store. Standalone activity journal is unavailable. No clinical interpretation or external connection is provided. Existing hidden-editor hit-test API remains unchanged; enabled targets apply only to iOS, with desktop pointer transparency.

2026-10-14 ATM-2017 independent health configuration: program_activity_configuration_control composes native editor/buttons/chips/measured text in the existing Programme activities tab, with explicit choices and exact immutable retry. Native health links reuse one global activity identity across two objectives. Nutrition composes the same optional standalone collection owner. ui.panel.open declares its existing tab option. No Dashboard source or attachment. Persistent program_activity_configuration suite plus six affected suites: 119/119; syntax 2659. Actual isolated Web three groups, real gestures/reload/390×844/844×390, final pixels inspected, one visible canvas/zero .eve-atome/no browser warnings or errors. Canonical commits prepare fictitious goal fixtures; Dashboard creation, sport/category Matrix/execution and native/cloud/human acceptance remain unverified.

2026-10-14 ATM-2017 common health sessions: shared program_session_contract declares immutable plans and ordered transition facts inside the existing record type and Programme command family. program_session_model deterministically derives prepared/running/paused/completed/stopped, explicit step confirmation/skip/correction/undo, separate planned/actual units and unknown quantities, and clock time excluding pauses. program_session_runtime reuses canonical owned global records and immutableActivity/event-ID replay: one deterministic identity per revision rejects competing intents without a guessed CAS/version contract or second store. Final completion reconciles one session-referenced occurrence/execution without fabricating Calendar placement; direct activity_complete cannot bypass this owner. program_session_control composes real native editors/buttons/chips/measured text and the existing outer scroll in the activities tab. Distinct confirmation protects the primary gesture; exact pending retries and account/close guards remain disposable. Existing numeric formatting limits presentation precision without rounding stored time. No Dashboard modification/attachment or new renderer/registry/transport. Tests: program_session_contract plus Programme/configuration/collection/time, 79/79; syntax 2664, mutation guard pass. M0 retains two existing Porcupine paths after its earlier stages pass. Actual isolated Web session-report.json: ok:true, three groups, real preparation/step/pause/reload/resume/skip/undo/finish, quantity correction planned 5 / declared 3, portrait/landscape native scrolling and partial stop; final pixels inspected, one visible canvas/zero .eve-atome/no browser errors/warnings. Initial probe capture API/readiness mismatches and large-wheel oscillation were corrected in the temporary harness, without a product pointer workaround; multiline preparation explicitly enables the existing block editor. The final replay contains no temporary command/performance instrumentation. To verify: finished-session step corrections, composed specialized sports/meal routines and multi-metric steps, native/cloud/physical-reader and human acceptance; Dashboard and external alarms/sensors excluded. No full P015 or health-scope completion.

### 2026-10-14 — Health activity revision and Nutrition

Nutrition presentation read contract: createProgramNutritionControl's existing
createPresentation/readValues hook includes stage, mode, mealType, group, unit,
editingId, cloned components, committing/pending/busy and notice. This internal
disposable snapshot adds no public command, durable schema or writer. writeDraft
continues to own editable fields and clears obsolete validation notice only for
an active principal and non-pending draft. The isolated named-food presentation
uses existing activate operations and project.program.commit activity_revise;
public Programme presentation integration awaits P031/V01 acceptance. The user
now explicitly accepts the food-name/edit surface. Internal
createProgramNutritionPresentation(options) is a reusable assembly of those
same controller/Matrix contracts, consumed by the isolated native review panel.
It adds no command, mutation path or registry. The populated meal/Save surface
is the next visual review, not an inferred whole-P031 acceptance.

The populated meal has since been accepted. The same internal presentation now
composes the proposed Action screen using the existing habit value_key and Save
operation. Its output remains a disposable Matrix/native-panel projection; all
durable changes still use the existing activity_revise command and typed
nutrition property. Panel style/template ownership stays in the shared native
factory/skin chain; no style database, new registry or theme-editing API is added.

After explicit Action acceptance, createProgramNutritionControl's default
createPresentation is createProgramNutritionPresentation. Existing ui.panel.open
{surface:'program',tab:'activities'} and the native selected-activity Composer
Nutrition button now reach the accepted Meal/Action assembly without an injected
QA factory. Actual Save/reload/reopen/Close pass through the same activity_revise
and activity_read commands (nutrition-integrated-report.json). The larger native
Programme host and footer are accepted for Meal and Action; the user subsequently
waives further P031 visual gates. No new public
operation, schema, registry or Dashboard entry is introduced.

2026-10-14 P031 continuation: existing project.program.commit adds
nutrition_consume {consumption_id,activity_id,base_activity_version,consumed_at,
recorded_at}; existing activity_read projects immutable declarations and
objective reference IDs. PROGRAM_NUTRITION_SCHEMA optionally distinguishes
proposed/planned; program_activity preserves nutrition_declined. The typed
record property program_nutrition_consumption pins the saved meal/version/date,
without inferred execution time or Calendar placement. Existing collection_*
operations accept Nutrition's optional question keys with separate purpose grants.
The user waives subsequent visual gates; no new registry/transport or Dashboard
API is added. Administration of researcher-supplied lists/scenarios is deferred.

The canonical commitBatch contract now invalidates remembered absence for all
successfully written IDs before optional read refresh, including refreshState:false.
This matches commit and repairs immediate read-after-create for the existing
preference/grant batch; failures retain their explicit outcome. No API signature,
new backend or mutation route. Guest-profile regression and actual Web Nutrition
replay are recorded in the batch-write-retains-missing-state known-bug entry.

The existing project.program.commit family declares activity_revise with activity_id, base_activity_version, recorded_at and the existing typed activity input. Revisions update that same account-global Atome; the deterministic next-version event ID is the canonical conflict/idempotency boundary. Existing activity_read returns the current configuration. Optional activity.nutrition uses PROGRAM_NUTRITION_SCHEMA (habit or meal, explicit food components/optional portions/preparation/shopping/source), with strict domain validation and no consumption field. Generic configuration edits preserve it. Session preparation pins the actual activity version. Internal loadProjectListRaw({includePreviewSources:false}) exports the existing owner-checked metadata read without invoking project-order reconciliation; its no-argument preview behavior remains unchanged. No new command registry, transport, Dashboard attachment or clinical API. Evidence: the ATM audit and manifest-listed Nutrition/configuration/session/Programme suites.

2026-10-14 terminal health correction: Existing session_transition now accepts correct/undo after completed or stopped state; all other terminal actions remain refused. No new operation or mutable result route.

2026-10-14 capture/preview contracts. Native iOS media bridge adds `media_camera_preview_start` (returns `source_id`, `preview_command`), `media_camera_preview_frame` (same JPEG frame payload as `media_video_preview_frame`) and `media_camera_preview_stop`; a video take stops an open camera preview. `ui.capture.photo` is a toggled camera session (`active`/`latched` in its result) and `input.shot: true` takes one still from the open session; `projectAtomeId`/`ownerProjectId` keep the single-shot contract. Shared panel definitions accept `belowMainMenu` (stack band between the panel and main-menu layers). `refreshProjectPreview` (`eVe/domains/rendering/project_preview_runtime.js`) is the single capture-and-persist owner of a project thumbnail and dispatches `eve:project-preview-updated`, consumed by `subscribeCanonicalProjectChanges`. `#squirrel/security/media_capability_client.js` adds `readMediaCapability` / `adoptDelegatedMediaCapability` (a sessionless preview capture frame borrows the page's media token); Bevy image textures fetch protected media with that capability (`appendStreamingMediaAuthQuery`, awaited token).
2026-10-15 Apple Music visibility/consent correction: the existing runtime's `isSupportedHost()` exposes its native capability predicate to Fun. Unsupported hosts omit the tile before invoking a command; direct MCP commands keep their explicit unsupported result. Palette replies use the existing `unwrapToolGatewayResult` contract across both Runtime V2 and registered-handler envelopes, preserving the native authorization and result fields.

2026-10-15 Personal library: apple_music.list_library accepts kind song/playlist and bounded limit/offset. It reuses the existing native library/controller, read capability and automatic command/MCP registration. Ma bibliothèque composes personal song and playlist lists with scoped search; returned native library IDs feed the same playback commands. UI initial lists contain25 entries; MCP/API supports further pages. No library mirror is persisted.
