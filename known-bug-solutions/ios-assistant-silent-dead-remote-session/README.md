# iOS assistant: no answer, no message (dead atome.one session)

## Symptom

On iPhone, tapping the assistant shows nothing readable and says nothing; the app
otherwise looks signed in. `eveAssistantApi.getState()` reads `phase: 'error'`
(before 2026-10-12: `provider_principal_unavailable`; now `auth_session_required`).

## Reproduction (physical device, WebView inspector)

1. Launch with `-AtomeWebInspector`, evaluate through `temp/carplay_2026-10-12/rwi.mjs`.
2. `window.AdoleAPI.auth.ensureFastifyToken()` → `{ ok:false, reason:'auth_session_required' }`.
3. `__ATOME_IOS_NATIVE_INVOKE('auth_local_request', { action:'local-session-describe', includeLocked:true })`
   → `localGrant.remoteSessionKnown: true`, `remoteSession: null`.

The bundle is esbuild-packaged: module paths cannot be `import()`ed; use the globals.

## Confirmed owner

- iOS relays every OpenAI call through atome.one with the account's server-vault key
  (`atome/src/squirrel/ai/provider_broker.js`). No remote session ⇒ no assistant.
- The remote descriptor is erased by `devices.remove('session')`; outside logout/delete
  only `renew()` receiving `auth_session_stale`/`auth_session_reused` does it
  (`atome/src/squirrel/security/auth_phone_link_client.js`). Only a new phone
  confirmation repairs it.

## Rejected hypotheses

`server_config.json` (unchanged), today's auth code (no diff), local session (valid).

## Correction (2026-10-12)

- `assistant_provider_config.js` reports the relay `link_reason`.
- `assistant_ai_settings.js` routes `auth_session_required`/`auth_remote_relogin_required` to sign-in.
- `assistant_runtime.js` speaks every startup error with the system voice.
- `panel_tool_registration_runtime.js` / `panel_actions_runtime.js`: the registered
  `ui.home.panel` handler opens on click with the caller's `input`; before, every
  `openRequiredPanel('ui.home.panel')` returned `ignored` → `required_panel_open_failed`.

## Regression checks

- Device: open → sentence spoken once; error link → `eve:login-choice-mounted`
  `{ template: 'first_launch_phone' }`.
- `runtime.tools.call` `{ tool_id:'ui.home.panel', action:'pointer.click', input:{ requireAuthentication:true } }`
  must not answer `ignored`.

## Root cause of the dead session (2026-10-20)

- `server/auth_sessions.js#renew` moves `generation` forward on every renew. A renew that
  reaches the server but whose answer never arrives (app killed or suspended by iOS,
  socket dropped) left the client on N while the server holds N+1. The next
  `session-challenge(N)` answered `auth_session_stale` and the client erased its own
  session (above). Measured on the real `server.js` + real client, real Web app.
- Fix in the owner `auth_phone_link_client.js#renew`: before `session-renew(G)` the
  record durably carries `renewing: G`; a `stale` verdict for G with `renewing === G`
  asks the challenge for G+1 (the server rotated) and renews from there. A stale copy
  without its own in-flight renew is still refused. No server change, no deploy.
- Sessions already erased stay dead: a new phone confirmation is still required once.

Regression probes (isolated server): `temp/remote_session_loss_2026-10-20/renew_lost_response.probe.mjs`
(13/13: phone and scoped records, one or two lost answers, request never sent, stale
copy refused) and `renew_lost_response_real_app.probe.mjs` (Web app, `routeWebSocket`
drops the launch renew answer, page reloaded: 5/5; `BASELINE=1` on HEAD: no session, no bearer).

## Open

The message is still written in the input field only (user rule), which is 70 px wide
on a 402 pt iPhone: unreadable until the accessory squares are tightened or removed.
