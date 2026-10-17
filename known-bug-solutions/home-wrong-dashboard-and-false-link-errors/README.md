# Home: wrong Dashboard, false « server link failed », dead lift, TV without picture

## Symptoms (iPhone, 16 Oct. 2026)

- After closing and reopening the session, the home is another Dashboard than
  the chosen one (e.g. eVe Pro), often with « Certaines données n'ont pas pu
  être chargées ».
- The assistant shows « La liaison avec le serveur a échoué » while the server
  is up; returning from another app reloads everything.
- In Divertissement, TV needs two touches; lifting the finger on a channel does
  not launch it; a channel plays its sound without its picture.
- The reduced assistant keeps listening.

## Root causes

1. **Home chosen before the profile.** The startup no longer awaited the
   profile, so `dashboardStyle` read `'auto'` → the Pro Dashboard (the only one
   showing `eve.dashboard.load_failed`). Logout also deletes the published
   preferences. Fix: `visual_level_cache.js` keeps the style per principal;
   `workspace_surface_preference.js#waitForHomePreferences` reads the profile
   (bounded) when nothing is known; a style published while a home is still
   opening is applied once it lands (`user_workspace_surface_runtime.js`).
2. **Socket health check killed live sockets.** `websocket_health.js` dropped
   the socket (and failed every pending request with `Connection lost`) after
   3 s without a pong — routine on the busy iOS local server. Now any inbound
   frame proves the link, the deadline is 10 s everywhere, recent traffic skips
   the ping. `squirrel:local-connection-ready` fires on REconnection only and
   the Pro Dashboard retries only its failed categories. The provider broker
   replays a never-sent frame, and `realtime-connect` once.
3. **Profile re-reads on every sync event** republished identical preferences,
   reloading the homes. `background.js` publishes only a changed profile.
4. **The home is no longer a project** (`__eve_dashboard_workspace__`, mode
   `dashboard`): the in-place media overlay only showed pictures in mode
   `project`, and the players read `currentProjectId()`. The overlay now shows
   the scene presented (project, or the home's own), the stage passes its
   `projectId`.
5. **The Dashboard opens the Mystic grid directly**, without handing it the
   finger still down: `context.js#claimHeldPressForMysticMenu` is called by
   `openRubric`, so the lift reaches `releaseAt`.
6. **Lazy TV level** started empty (no dwell, a second touch dropped while
   loading). TV is read with the Fun providers; a lazy level opens on what it
   holds and refreshes behind; a touch during the read joins it.
7. **Workspace home destroyed during a closing transition**: the Matrix sync
   kept homes only in mode `dashboard`, not in a transition towards it.

## Regression check

`HEADLESS=0 node temp/home_regressions/home.probe.mjs` (isolated server, real
pointer): eVe presented at boot without the Pro Dashboard, reduced assistant not
listening, central tool proposals alone / 10 s / touch elsewhere, TV in one
touch with a visible picture, Pause | Fermer | Stop, back to the channel list,
docked square Atom, lift launches, own name shown, last project leaves and
returns into its tile. `ONLY=boot,fun,...` runs a part.

Physical iPhone (Web Inspector): 10 app switches without
`eve.dashboard.load_failed` nor `eve.sync.recovery_failed`.
