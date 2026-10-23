# Android release generator — Firebase App Distribution

`./scripts/Android_testflight_generator --firebase` (or `./run.sh apk --firebase`)
distributes test builds to a few invited testers without a Google Play developer
account or an Android device on the publisher side. It is the Firebase lane of the
same generator as [Google Play internal testing](android_play_internal_distribution.md):
version reservation (`release_state.mjs`), the canonical build owner (`apk.sh --prod`)
and the service-account OAuth (`createPlayAuthorization` in `play_api.mjs`, Firebase
scope `cloud-platform`) are shared. The owner is `scripts/android/firebase_distribution.mjs`.

## Commands

```sh
./scripts/Android_testflight_generator --firebase --help
./scripts/Android_testflight_generator --firebase --dry-run
./scripts/Android_testflight_generator --firebase
./scripts/Android_testflight_generator --firebase --notes "Ce qui change dans cette version"
./scripts/Android_testflight_generator --firebase --reports 10      # latest boot-failure reports
./scripts/Android_testflight_generator --firebase --test-lab        # latest build on Test Lab phones
```

A live run reserves a build code above `tauri.android.conf.json`'s high-water mark,
builds and verifies one signed release APK (apksigner, native runtime), copies it
into `temp/android-release-*/application.apk`, uploads it, waits until Firebase has
processed it, checks that Firebase read the reserved build code, sets the release
notes and notifies the configured groups/addresses by e-mail.

## One-time setup (done 2026-10-20 for `admin@atome.one`)

- Firebase project `atome` (`atome-ccb07`, number `441048652113`), Analytics and
  Gemini disabled. Android app `one.atome.app`, nickname `atome`,
  app ID `1:441048652113:android:580ff1fe45686f50509b70`. No `google-services.json`
  is needed: App Distribution works without the Firebase SDK in the app.
- App Distribution enabled; tester group alias `testeurs`. Add testers in
  **Firebase console → App Distribution → Testeurs et groupes → testeurs →
  Ajouter un testeur**, or list addresses in the configuration `testers` field.
- Service account `app-distribution-uploader@atome-ccb07.iam.gserviceaccount.com`.
  The project owner grants it the role **Firebase App Distribution Admin**
  (Google Cloud → IAM → Grant access) and creates its JSON key (Service accounts →
  Keys → Add key → JSON). Store the key at
  `~/.atome/android/firebase-app-distribution.json` with mode `600`; never in the
  checkout, never in chat.

## Local configuration

`Private/android-firebase.json` (ignored, strictly validated):

```json
{
  "packageName": "one.atome.app",
  "projectId": "atome-ccb07",
  "projectNumber": "441048652113",
  "appId": "1:441048652113:android:580ff1fe45686f50509b70",
  "serviceAccountFile": "/Users/<user>/.atome/android/firebase-app-distribution.json",
  "groups": ["testeurs"],
  "testers": [],
  "releaseNotes": ""
}
```

## Automatic boot-failure reports

`eVe/intuition/runtime/eve_intuition/boot_failure_report.js` runs when the boot
settles on its terminal failure surface (`boot_runtime.js`), only in the Android
app (Android user agent + Tauri). It sends once per launch, without user action:
device model, Android and WebView versions (user agent), screen, memory, the
WebGPU adapter matrix (default, high-performance, low-power, `compatibility`
feature level, with adapter info, features and key limits), the GPU named by
WebGL (`WEBGL_debug_renderer_info`), the failure, the last Bevy WASM panic and the
boot trace; `appVersion` is `atome <v> eVe <v>`, the versions the kickstart read
from `/api/server-info` (the Android web root serves no `version.txt`). Destination: Firestore `boot_reports` in project `atome-ccb07`
(database `(default)`, location `eur3`). No account, name or content is sent.

Security rules (published 2026-10-22): clients may only **create** a
`boot_reports` document whose keys are exactly `createdAt` (timestamp), `model`
(≤200), `android` (≤40), `webview` (≤40), `appVersion` (≤40), `error` (≤2000),
`details` (JSON text ≤60000); every other read or write is denied. Reports are
read with the service account (role **Cloud Datastore Viewer**) through
`--reports`, or in Firebase console → Firestore → `boot_reports`.

## Firebase Test Lab

`--test-lab [apk]` (`scripts/android/firebase_test_lab.mjs`) uploads the APK to
the Test Lab default bucket, picks physical phones from the live catalog (two
Samsung, one Google, one Xiaomi when available, newest Android ≥ 12), runs a Robo
test (5 min) and downloads each device's logcat, screenshots and video into
`temp/test-lab-<time>/`. APIs: Cloud Testing, Cloud Tool Results.

Measured 2026-10-22: the Test Lab default bucket (`test-lab-9uv8xv243p5ms-yb4vk4mxkr3q2`,
returned as a plain string by `initializeSettings`) is Google-managed; its IAM tab
is disabled even for the project owner and it only accepts writes from basic
project Editors/Owners. With the service account's roles (Firebase Test Lab Admin,
App Distribution Admin, Cloud Datastore Viewer) the APK upload fails with 403
`storage.objects.create`; a bucket of our own requires the Blaze plan. Decision:
no Editor role for the service account; Test Lab runs are started by the owner in
Firebase console → Test Lab → Test Robo (drop the APK). `--test-lab` works only if
the account is later given the Editor role. Google announced Test Lab's shutdown
on 2027-09-30 (successor: Developer Device Platform).

## Testers

Each tester receives an e-mail invitation, accepts it with a Google account, then
installs through the Firebase App Tester app or the link. Android asks once to allow
installation from that source. Updates arrive as new e-mails/App Tester entries.
Google Play Billing purchases do not work in builds installed outside Play.

## Limits and recovery

The APK targets `aarch64` (the generator default). A reserved build code stays
consumed after a failure; the report records the step and message. Firebase upload
processing is polled for up to ten minutes. A rejected upload or distribution
prints Google's error message; no step is retried blindly.
