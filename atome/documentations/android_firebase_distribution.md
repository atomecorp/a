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
  "projectNumber": "441048652113",
  "appId": "1:441048652113:android:580ff1fe45686f50509b70",
  "serviceAccountFile": "/Users/<user>/.atome/android/firebase-app-distribution.json",
  "groups": ["testeurs"],
  "testers": [],
  "releaseNotes": ""
}
```

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
