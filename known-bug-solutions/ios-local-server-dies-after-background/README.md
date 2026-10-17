# iOS: nothing loads after the app comes back from background

## Symptom

On a physical iPad/iPhone, after the app spent some time in background (or the
device slept), opening a project or the user card shows « certaines données n'ont
pas pu être chargées ». The account is still signed in; a cold launch works.

## Root cause

The page's offline backend is the native local server
(`platforms/ios/atome-auv3/Common/LocalHTTPServer.swift`, `NWListener`). iOS
cancels the listener while the app is suspended; nothing reopened it, so every
local request failed after the return.

## Fix (2026-10-14)

`AppDelegate` notes `.background` (`noteBackgrounded()`) and, on the next
`.active`, calls `resumeFromBackground()`, which reopens the listener through
`ensureListening(reopen:)` (same port first, any port after two failures; a new
port is announced to the page by `WebViewManager.announceLocalHTTPPort`).

## Pitfall

Do not reopen on every `.active`: at launch iOS goes `.inactive` → `.active`
while the first listener is starting, and a second open fails the bootstrap with
« Address already in use ». Only a real `.background` arms the reopen.

## Regression check

Physical device: cold launch, then 90 s in background, back to the app, open a
project and the user card — data loads and the session is kept. The page's local
port can be read through the Web Inspector (`window.__ATOME_LOCAL_HTTP_PORT__`).
