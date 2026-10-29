# Android: video (and every capture with sound) records nothing

## Symptom

Reported on Android (Galaxy A23) on 2026-10-27: Capture › Vidéo shows an empty
preview and the take produces no video. Same for Audio and dictated text.

## Root cause (confirmed 2026-10-27, on the device)

In the app's WebView, `getUserMedia({ video: true })` works but any request with
`audio` fails with `NotAllowedError: Permission denied`, although the app holds
CAMERA and RECORD_AUDIO. The Tauri/wry WebChromeClient
(`platforms/desktop-tauri/gen/android/app/src/main/java/one/atome/app/generated/RustWebChromeClient.kt#androidPermissionsForResources`)
asks for RECORD_AUDIO **and** MODIFY_AUDIO_SETTINGS before granting a page's
microphone, and denies the whole request when one is not granted.
MODIFY_AUDIO_SETTINGS was not declared in the app manifest (CAMERA and
RECORD_AUDIO only came from plugin manifests), so it could never be granted.

## Fix

`platforms/desktop-tauri/gen/android/app/src/main/AndroidManifest.xml` declares
CAMERA, RECORD_AUDIO and MODIFY_AUDIO_SETTINGS (normal permission, granted at
install), camera and microphone features not required (Android TV). Needs a new APK.

## Regression

On the device, in the page (CDP):
`navigator.mediaDevices.getUserMedia({ audio: true })` must resolve; then
Capture › Vidéo: the preview shows the camera, a take joins the list and plays.

## Acceptance

Video, Audio and dictated text record on Android as on the Web.
