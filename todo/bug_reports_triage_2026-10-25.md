# Bug reports — triage and fixed-report lifecycle (2026-10-25)

User request, 2026-10-25: the bug reports filed by the assistant (or by hand) and listed in
Réglages › Avancé › Debug must be (1) read and fixed, and (2) once fixed, noted as fixed in the
server logs and removed from the list of the people who filed them.

Owners: contract `atome/src/shared/bug_report_contract.js`, client `eVe/domains/diagnostics/bug_reports.js`,
rubric `eVe/intuition/runtime/bevy_panel/bevy_panel_advanced_runtime.js`, server `server/ws_bug_reports.js`
(files `logs/bug_reports/<YYYY-MM-DD>/<created_iso>_<id>.json` on atome.one), relays
`platforms/desktop-tauri/src/server/public_relay.rs`, `platforms/ios/atome-auv3/Common/FastifySyncPublicRelay.swift`.

## Task A — fixed-report lifecycle (done 2026-10-25, see FRAMEWORK_STATE §5)

- [x] Contract: `BUG_REPORT_STATUS = 'bug-report-status'` + `normalizeBugReportRefs` (≤ 50 `{ id, created_iso }`).
- [x] Server: the report file is the log; a fixed report carries `resolution { resolved_at, note, fixed_in }`.
      `bug-report-status` answers which of the asked reports are resolved (public, unguessable ids, own rate limit).
- [x] Operator tool `scripts/bug_reports_admin.mjs` (run on atome.one from `/opt/a`):
      `list [--open|--resolved] [--since YYYY-MM-DD]`, `show <id>`, `resolve <id…> --note "…" [--fixed-in <version>]`.
- [x] Client: when Avancé opens, after the unsent reports are sent again, the sent reports are asked; each resolved
      one is deleted through the canonical commit pipeline (`kind: 'delete'`, `scope: 'global'`) and leaves the list.
- [x] Relays: Tauri and iOS forward `bug-report-status` to atome.one.
- [x] Probes: `temp/bug_reports/status.probe.mjs` 9/9, `temp/bug_reports/resolve_ui.probe.mjs` (real Web app), `server.probe.mjs` 13/13.
- [ ] Deploy: the server must run the new `ws_bug_reports.js`; Tauri and iOS need a rebuild for the relay entry.

## Task A2 — fixed stays visible, the user deletes it (user request 2026-10-26, done Web)

- [x] A fixed report is no longer deleted on the device: `bug_reports.js#markResolvedBugReports` writes `resolved_at` +
      `resolution_note` on its record; the row says « Résolu », the detail adds the day and the team's note.
      On the server it leaves `list --open` (its file stays, it is the log — user decision 2026-10-26:
      fixed reports are kept in the logs, purged later only if needed).
- [x] The user deletes reports with the standard list gesture: the row's box (press, drag along the rail), then
      Suppr. in the band, confirmed by a second Suppr. (Back cancels) — `bug_reports.js#deleteBugReports`.
- [x] Voice/MCP: `debug.reports.delete { ids }`; `debug.reports.list` says `resolved` and the note.
- [x] Probe `temp/bug_reports/resolved_delete_ui.probe.mjs` 18/18 (real Web app, canvas taps, reload).

## Task B — fix the reported bugs

Production read 2026-10-26 (`list`): 3 open reports, all fixed in this checkout (Web verified), to resolve AFTER deploy:
- `74c9268c-2b9e-43e0-938f-3b5c99a1ef37` (Tauri) « mets ce morceau » → Apple Music offered on every host (see below).
- `17435448-4b11-40f7-94fd-fe383af4668f`, `539241c6-af20-4ec1-8607-eeab7f4caddc` (iOS) « Mettre la chaîne BFM TV » on the eVe home →
  `tv.open_channel` → `NO_ACTIVE_CLIENT`: `tv.js#openChannel` only knew a TV Atome in an open project. Fix: while the home shows
  (`isDashboardWorkspacePresented`) it plays on the home's TV list (`films_runtime.js#readDashboardVideoPresentation` →
  `dashboard_video.js#present({ kind: 'tv', title })`, `tvSource().entryOf`), fullscreen through `control`. Probe
  `temp/bug_reports/tv_home.probe.mjs` red then green, headed pixels. Not verified on the iPhone. Side note: in 17435448 the model
  said « je lance BFM TV » after the failure despite the playback rule (model behaviour, not changed).
- After deploy: `node scripts/bug_reports_admin.mjs resolve 74c9268c-2b9e-43e0-938f-3b5c99a1ef37 --note "Apple Music offered on every host → only where isSupportedHost()"`
  and `node scripts/bug_reports_admin.mjs resolve 17435448-4b11-40f7-94fd-fe383af4668f 539241c6-af20-4ec1-8607-eeab7f4caddc --note "tv.open_channel on the home needed a project → plays on the home's TV list"`.

- [ ] Read every report on atome.one: `node scripts/bug_reports_admin.mjs list --open` (needs the production read
      the session could not do: either the user allows SSH read of `/opt/a/logs/bug_reports`, or copies that folder
      into `temp/bug_reports/prod/` locally).
- [ ] Group by symptom, check `known-bug-solutions/README.md`, fix each root cause, validate with a probe.
- [ ] For each fixed report: `node scripts/bug_reports_admin.mjs resolve <id> --note "<cause → fix>"`.

Reports found on this Mac (local stores, 2026-10-25):
- `bfd895c8…` (Web dev vault, 11 Oct) « mets la boule en rouge » — reason `probe: no color tool found`: a probe
  artifact of the 11 Oct assistant work, not a user bug. Never sent (pre-contract record).
- `74c9268c…` (Tauri, 16 Oct) « mets ce morceau » — `apple_music.play` → `HOST_UNSUPPORTED` on desktop Tauri.
  Cause: `atome/src/squirrel/ai/conversation_session.js` preloads `apple_music.play` / `apple_music.search` and always
  adds `APPLE_MUSIC_ASSISTANT_INSTRUCTIONS` (« music listening requests use apple_music.play »), on every host, while
  Apple Music exists only in the iPhone/iPad app (`apple_music_runtime.js#isSupportedHost`). Proposed root fix: drop both
  from the static preload and instructions; the Apple Music owner registers an eager assistant context provider
  (`registerAssistantToolContext`) that gives them only when `isSupportedHost()`; elsewhere the generic `music.*`
  (Spotify/Deezer, `MUSIC_ASSISTANT_INSTRUCTIONS`) answers. Needs an iPhone check that « mets ce morceau » still plays.
  **Fixed 2026-10-26 (Web verified):** `apple_music_runtime.js#appleMusicAssistantContext` (registered from
  `tool_runtime_service_commands.js#serviceCommandHandlers`) gives play/search + the rules only when `isSupportedHost()`;
  `assistant_tool_context.js` carries provider `instructions`; `conversation_session.js` no longer preloads them statically.
  Probe `temp/bug_reports/apple_music_host.probe.mjs` 6/6, `tests/apple_music/contracts.test.mjs` 8/8.
  To do: iPhone check of « mets ce morceau », then on atome.one once deployed:
  `node scripts/bug_reports_admin.mjs resolve 74c9268c… --note "Apple Music offered on every host → only on iPhone/iPad"`
  (only if the report reached the server: it was filed on 16 Oct, before the contract — check `show`).
