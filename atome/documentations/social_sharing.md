# Social sharing (ten networks)

Update (2026-11-16, register R-190, universal publishing): the live server is the Rust **atome-server**
(`atome/servers/atome-server/src/providers/social/`), reached on every platform through the `ai-provider` frame of
`/ws/api`; the JavaScript `server/social/` is the reference implementation kept for its tests (TikTok, Instagram,
Facebook only). The sections below the next one describe the first version (2026-10-03, three networks) and stay
true for those three, except where this section says otherwise.

## Ten networks and the R-190 operations

Networks (`SOCIAL_NETWORKS`, `atome/src/squirrel/social/contracts.js`), with what each takes
(`SOCIAL_NETWORK_CONTENT`) and how it is linked once (`SOCIAL_NETWORK_SETUP`):

| Network | Text | Image | Video | Linked by |
| --- | --- | --- | --- | --- |
| TikTok | no | yes | yes | official page (OAuth) |
| Instagram | no | yes | yes | official page |
| Facebook (Pages; profile by copy/share) | yes | yes | yes | official page |
| Threads | yes (≤ 500) | yes | yes | official page |
| YouTube | no | no | yes | official page (accounts.google.com) |
| LinkedIn | yes | yes | yes | official page |
| Bluesky | yes (≤ 300) | yes | yes | official page, after the person's handle |
| Mastodon | yes (≤ 500) | yes | yes | official page of the person's instance |
| Telegram | yes | yes | yes | a robot's token and a chat id typed once in Settings |
| Discord | yes | yes | yes | a channel's webhook link (bot token, channel id optional) typed once in Settings |

A content a network does not take is skipped and named (`social_text_only_unsupported`,
`social_media_type_unsupported`), never sent degraded. Text limits: `socialTextLimit(network, kind)` in
`capabilities.js`.

Destinations name an account: `<network>[:<account>]` (`SOCIAL_DESTINATION_PATTERN`, shared with `publish.*` and
`events.share`); the bare network is its first enabled account; Facebook keeps `facebook:page:<id>` and
`facebook:profile`. Route planning (`planSocialDestination({ destination, networks, kind, handoff })`,
`listSocialDestinations(networks)`) reads the `social.accounts` view; the atome-server's `providers/social/plan.rs`
follows the same rules.

Operations (`SOCIAL_COMMANDS`; MCP list `SOCIAL_MCP_COMMANDS`; confirmed: connect, publish, disconnect,
account.enable, delete, reply):

- `social.accounts {}` → `{ networks: [{ network, configured, accounts: [{ account, label, identity, state, scopes, pages? }] }] }`, never a token.
- `social.connect { network, instance?, handle? }` (Mastodon's instance, Bluesky's handle).
- `social.disconnect { network, account? }`; `social.account.enable { network, account, enabled }`.
- `social.credentials.save { network: telegram|discord, fields }`: typed in Settings only, never on MCP.
- `social.prepare`, `social.publish` (options: TikTok's fields, `youtube { title, visibility, made_for_kids }`,
  `bluesky { text }`, `threads { text }`), `social.status`, `social.cancel`, `social.delete { job_id, destination }`.
- `social.reply { notification_id | origin, text, attachment_ids?, private? }` and
  `social.thread.read { network, account, thread, cursor? }`: messages and comments received from a network.

Client functions: `atome/src/squirrel/social/client.js` (`socialAccounts`, `connectSocialAccount`,
`socialCredentialsSave`, `socialAccountEnable`, `socialDisconnect`, `socialReply`, `socialThreadRead`, …).

What the user sees now: Settings › Préférences › Communication › Réseaux sociaux (mockup M1,
`bevy_panel_home_social.js`), one row per network the server offers, each unfolding its accounts (a Facebook
account its Pages) and what they allow; Ajouter, Reconnex., Déconn. and Lier in the foot band. The Communication
panel's « Publier sur les réseaux » accordion described below was removed (R-190); publishing goes through the
universal Publier flow.

Status (2026-10-03): implemented and covered by local tests, plus an end-to-end
run on an isolated real `server.js` where only the TikTok and Meta hosts were
simulated. **No real publication has been made yet.** No TikTok or Meta developer
application is configured on this machine (see "Real publication: blocked").

## What the user sees

- **Préférences › Communication › Réseaux sociaux** (own card, Home and Contacts
  panels). For each network: connect / reconnect / disconnect, the provider
  identity (`display_name`, `@username`, account type, Facebook Pages), the
  connection state (`not_configured`, `disconnected`, `connected`, `expired`) and
  what the account allows.
- **Communication › Publier sur les réseaux** (an accordion under the composer).
  The flow is: content (the composer text, plus an image or a video already in
  the media, picked through the Media panel) → destinations → server preview →
  Publish. Assisted routes get *Partager vers l'app*, *Exporter le fichier* or
  *Copier et ouvrir Facebook*. Each destination keeps its own result.

## Official routes only

Read on the providers' documentation on 2026-10-03:

- TikTok Login Kit for Web and Content Posting API v2.
- Instagram API with Instagram Login, v25.0.
- Facebook Login (manual flow), Pages API and Video API (resumable upload), v25.0.

| Destination | Text only | Image | Video |
| --- | --- | --- | --- |
| TikTok, `video.publish` | refused (no text post) | Direct Post via PULL_FROM_URL, only if the domain is verified (`TIKTOK_PULL_FROM_URL_VERIFIED=1`); otherwise share sheet / export | Direct Post, FILE_UPLOAD |
| TikTok, `video.upload` only | refused | inbox (MEDIA_UPLOAD), same domain condition | inbox upload, finished in the TikTok app → `handed_off` |
| Instagram professional (Business / Media_Creator), `instagram_business_content_publish` | refused | direct, JPEG from a public URL (`SOCIAL_PUBLIC_BASE_URL`) | direct, Reels by resumable upload |
| Instagram personal / not connected | refused | system share sheet (iOS, Web Share L2) or export | same |
| Facebook Page (`pages_manage_posts` + CREATE_CONTENT task) | direct `/feed` | direct `/photos` (multipart) | direct, resumable upload + `/videos` |
| Facebook personal profile | copy the text + open facebook.com (`handed_off`, never `published`) | share sheet or export | share sheet or export |

What atome never does: scraping, session cookies, automation of the network's own
interface, password forms, automatic conversion to a professional account, or
messaging permissions. Receiving private messages or comments is out of scope.

TikTok's mandatory Direct Post interface is implemented: the creator's nickname,
a privacy level with **no default** (taken from `creator_info.privacy_level_options`;
an unaudited client may only use `SELF_ONLY`), opt-in Comment/Duet/Stitch (greyed
out when the creator disabled them), commercial disclosure toggles, the consent
sentence, and a preview.

## Architecture (single owners)

- `atome/src/squirrel/social/contracts.js`: networks, routes, statuses, error
  codes, the documented media limits, and the `social.*` command contract shared
  by the runtime tools, MCP and the server.
- `atome/src/squirrel/social/capabilities.js`: pure route planning from the public
  account view, and the media signature sniffer.
- `atome/src/squirrel/social/client.js`: requests on the authenticated provider
  socket (`requestProviderService('social.*')`). It also covers the device side:
  opening the official page (iOS `squirrel.openURL`, Tauri `plugin:opener|open_url`,
  or a browser window reserved during the gesture), the share sheet (iOS
  `export_file_share`, Web Share L2) and export (`saveExportFile`).
- Server, `server/social/`: `social_sessions.js` handles accounts, refresh,
  connect and disconnect. `social_oauth.js` holds the attempt bound to the
  principal, the `state`, and the two HTTP routes the providers impose.
  `social_media.js` runs ffprobe/ffmpeg, builds the variants and issues public
  pull URLs. `social_jobs.js` keeps the per-principal persisted jobs, the
  per-destination lock and idempotency. `social_operations.js` is the dispatcher.
  `social_tiktok.js`, `social_instagram.js` and `social_facebook.js` are the
  adapters, and `social_http.js` makes the provider calls.
- Transport: the `ai-provider` frame on `/ws/api`, the same authenticated channel
  that the Tauri (`provider_relay.rs`) and iOS (`FastifySyncClient.sendProvider`)
  hosts already relay to the remote server unchanged. No new application
  transport, relay or native code was needed for it. (Since R-190 the server answering this frame is the Rust
  atome-server on every platform.) The only HTTP surfaces are
  imposed by the providers:
  - `GET /api/social/oauth/callback/:network` — the registered OAuth redirect.
    It answers in plain text and is excluded from request logs.
  - `GET /api/social/media/:token` — an unguessable, 30-minute, per-job URL. It
    serves prepared files to providers that pull them (Instagram images, TikTok
    photos).

### Secrets and isolation

- The developer configuration belongs to the atome operator and is never asked
  of users. It lives in the server environment (or, in development only,
  `Private/social.env`, mode 600, whitelisted keys):
  `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_AUDITED`, `TIKTOK_DIRECT_POST`,
  `TIKTOK_PULL_FROM_URL_VERIFIED`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`,
  `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `SOCIAL_PUBLIC_BASE_URL` (public https
  origin; redirect URIs are `<base>/api/social/oauth/callback/{tiktok|instagram|facebook}`).
- User tokens are `social.<network>` records in the principal's encrypted server
  vault (`providerCredentialVault.js`). They never reach the client, Atome
  events, projects, exports or logs.
- Jobs and temporary variants live under the principal's own vault directory
  (`socialRoot`).
- Assets are resolved with `resolveDownloadTarget(file, principal)`, so the
  existing access check applies: another account's asset answers
  `social_media_missing`.

## Delivery model

Statuses: `ready`, `transferring`, `remote_processing`, `published`, `handed_off`
(given to the network's app), `exported`, `unconfirmed`, `cancelled`, `failed`.

- A destination is sent at most once. Published, handed-off, in-flight and
  unconfirmed deliveries are never resent. Only `failed` and `cancelled` can be
  retried, and a double click is absorbed by a per-destination lock.
- `unconfirmed` means the request that publishes may have run (lost answer,
  provider 5xx, cancellation in flight). The status refresh verifies it at the
  provider where that is possible (TikTok status, Instagram container). The
  person can also confirm "published" or "not published"; only the latter makes
  it retryable.
- Preparation probes the real file with ffprobe and its signature, never with
  the file name.
  - Images: PNG becomes a JPEG where JPEG is required, with transparency
    composited on white, explicitly. Resizing happens only down to a documented
    maximum.
  - Videos: a compatible file is reused unchanged. Otherwise it is really
    transcoded with the existing `transcodeVideoToMp4` (H.264/AAC).
  - A violation that would need a crop, a trim or a speed change refuses the
    destination.
  - Every change is listed in the preview, which shows a thumbnail of the exact
    prepared file. The original asset is only ever read.
- Variants are deleted once every delivery is settled, or after 24 h, or on
  cancel.

## Contract for producers (ZRecord Canvas)

A producer hands over a stored asset and text, nothing else. It does not depend
on the Communication panel:

```js
// content
{ text: 'caption or text post', media: { file: '<file_name or Atome id>', kind: 'image' | 'video', name: 'Display name.png' } }
// runtime / MCP / client
await socialRequest('prepare', { content, destinations: ['tiktok', 'instagram', 'facebook:page:<id>', 'facebook:profile'],
    handoff: { system_share: systemShareAvailable() } });   // → { job_id, deliveries[...] with route, variant, preview }
await socialRequest('publish', { job_id, deliveries: [{ id: 'tiktok', options: { privacy_level: 'SELF_ONLY' } }] });
await socialRequest('status', { job_id });
```

The export only has to exist as a stored asset of the principal: the same
`file_name` the Media panel lists. Its upload stays with the existing file
pipeline (`sendFileToServer`, WS `upload-chunk`/`upload-complete`).

Runtime and MCP commands: `social.accounts`, `social.connect`, `social.disconnect`,
`social.prepare`, `social.publish`, `social.status`, `social.cancel`. `connect`,
`publish` and `disconnect` require MCP confirmation.

## Verification

- `tests/social/*.test.mjs` (vitest): contract/planning, media preparation with
  real ffmpeg, connection/refresh/expiry/disconnect/isolation, delivery logic
  against provider doubles, the real `/ws/api` provider handler, client and panel
  runtimes. These do not prove publication.
- `temp/social/social_e2e.probe.mjs`: an isolated real server with real auth,
  vaults, WS upload, asset resolution and ffmpeg; provider hosts are simulated.
- `temp/social/social_browser.probe.mjs`: the real eVe app in Chromium. It covers
  Preferences connect through the official page (redirect simulated) and
  Communication preview/publish with a Media panel pick.

## Real publication: blocked

To lift the block:

1. Register the atome apps: TikTok (Login Kit + Content Posting API, Direct Post
   requires TikTok approval and an audit for public visibility), Meta (Instagram
   API with Instagram Login + Facebook Login for Business/Pages permissions, App
   Review for `pages_manage_posts`, `instagram_business_content_publish`).
2. Register the redirect URIs on a public https origin; set `SOCIAL_PUBLIC_BASE_URL`.
3. Use test accounts the providers allow (TikTok sandbox/target users, Meta app
   roles / test Pages, a professional Instagram account). Unaudited TikTok posts
   are private (`SELF_ONLY`).

iOS: `export_file_share` (UIActivityViewController) was added next to
`export_file_save`; the app builds for the simulator, but the share sheet has not been run on a simulator or device. Tauri/macOS:
the opener plugin is now initialised (`cargo check` passes); there is no share
target for these networks on macOS, so the route there is export.
