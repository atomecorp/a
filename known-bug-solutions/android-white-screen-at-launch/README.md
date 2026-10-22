# Android: white screen at launch, then nothing

## Symptom

A tester installs the Firebase App Distribution build (1.19.0 (7)) and sees a
white screen that never turns into the application. Firebase App Distribution
gives no log: it only distributes the APK (no SDK in the app, no Crashlytics).

## How to see what happens (no device needed)

The release WebView is inspectable. On the local emulator
(`temp/android-sdk`, AVD `atome-api36`, arm64, WebView 133):

```sh
A=temp/android-sdk/platform-tools/adb
$A install -r temp/android-release-<id>/application.apk
$A shell am start -n one.atome.app/.MainActivity
$A forward tcp:9333 localabstract:webview_devtools_remote_$($A shell pidof one.atome.app | tr -d '\r')
curl -s http://127.0.0.1:9333/json        # page URL + webSocketDebuggerUrl (CDP)
$A logcat -d | grep -E 'RustStdoutStderr|Tauri/Console'
```

On a tester's phone: USB debugging + `adb logcat`, or `chrome://inspect` on a
desktop Chrome — the same DevTools socket is exposed.

## Root causes (confirmed 2026-10-21)

Three independent defects, all measured on the emulator with the published APK.

1. **The window loaded the whole application from `tauri.localhost` while the
   native setup prepared the real one.** Android has no file system path for
   bundled resources, so `setup` first hashes the ~290 MB embedded web root
   (`android_assets.rs`, every launch) and, on the first launch, extracts its
   2 683 files, then starts Axum and navigates to `http://127.0.0.1:3000/`.
   Meanwhile the default window URL booted the full app from the embedded
   assets: a white page whose module boot competed with the extraction for the
   CPU. Measured: splash for 3 s, then white for 35 s (warm launch) and up to
   3 min (first launch: extraction 12 s alone, 2 min 55 s under contention).
2. **The extraction blocked the Android main thread.** Tauri runs `setup` on
   the main thread; hashing + extracting there held it for more than 5 s on
   first launch: `Input dispatching timed out … Waited 5003ms for FocusEvent`,
   i.e. a frozen white window and the « atome isn't responding » dialog.
3. **A renderer that dies on the first-launch login card leaves a blank page.**
   With no usable WebGPU adapter Bevy panics (`Unable to find a GPU!`). The boot
   failure surface was only reached from the workspace open, which needs a
   signed-in user; the login card (`first_launch_runtime.js`) does not await
   the renderer start, so the panic stayed in the console
   (`window.__eveBevyLastWasmPanic`) and nothing was painted.
   `eve:workspace-open-failed` had no listener either. The present wait also
   ignored the recorded panic and ran to its 10 s timeout, naming the wrong cause.

## Correction

- `platforms/desktop-tauri/android-boot/index.html` (staged by
  `scripts/android/payload.sh` as `android-boot/`) is the Android window URL
  (`tauri.android.conf.json` → `app.windows[0].url`): it only extends the system
  splash (same glyph, 131 dp, centred) and loads nothing until the native
  navigation to Axum.
- `android_assets.rs` + `lib.rs`: `setup` only resolves (and creates) the
  web root directory (`project_static_dir`); `materialize_project_root` runs
  on the server thread before Axum starts. A failed extraction no longer
  panics the app: the server never answers and the navigation thread paints
  the local-server failure page.
- `bevy_web_renderer_start_state.js`: `announceTerminalBevyRendererStartFailure`
  dispatches `eve:bevy-renderer-terminal-failure` (`BEVY_RENDERER_TERMINAL_FAILURE_EVENT`)
  when a start fails after the event loop was invoked, or without
  `navigator.gpu`; called once from the starter's `.catch`
  (`bevy_web_renderer_startup.js`).
- `boot_runtime.js` listens to it and settles the boot terminally
  (`settleTerminalWorkspaceBoot` → `presentBootFailureSurface`).
- `bevy_web_presentation_runtime.js`: `waitForInitialPresentation` throws
  `bevy_renderer_wasm_panic:` as soon as a panic is recorded.

## Regression / acceptance

- `temp/boot_failure_probe/probe.mjs` (Web, fresh profile, Playwright):
  with `GPU.prototype.requestAdapter` returning `null` the surface shows
  « Cet appareil n'expose aucun GPU utilisable » within seconds; with the real
  adapter the login card (« Démarrer » / « Connecter ») renders and no surface.
- Emulator, rebuilt APK: the launch page shows the logo until the navigation to
  `127.0.0.1:3000`, then the boot failure surface (the emulator has no WebGPU
  adapter). A real phone with a WebGPU adapter shows the login card.

## Emulator and WebGPU (measured 2026-10-21)

- Guest Vulkan is real: gfxstream → MoltenVK exposes a Vulkan 1.3 device
  (`adb shell cmd gpu vkjson`: « Apple M1 » / « Goldfish GFXStream (Apple M1) »).
- `/data/local/tmp/webview-command-line` drops its **first token** (program
  name): write `_ --enable-unsafe-webgpu`. The September lane wrote the flag
  first, so it was ignored. `--use-webgpu-adapter=swiftshader` forces a null
  adapter (the Android WebView ships no SwiftShader Vulkan).
- API 36 image (WebView 133): adapter `apple` obtained, then Chrome's GPU
  thread dies in `vulkan.ranchu.so` `vk_common_SetDebugUtilsObjectNameEXT`
  (guest Mesa bug; `--disable-dawn-features=use_user_defined_labels_in_backend`
  does not avoid it). Image removed; the lane now defaults to
  `system-images;android-37.0;google_apis;arm64-v8a` (AVD `atome-api37`).
- API 37.0 (WebView 145): the emulator's GLES stops at 3.0 on macOS
  (`-feature GLESDynamicVersion` does not change it) and Chrome needs ES 3.1:
  `EGL_BAD_CONFIG: no ES 3.1 support` → `FATAL … VERSION = `. Fix: ANGLE for
  the app (`settings put global angle_gl_driver_selection_pkgs one.atome.app`,
  `angle_gl_driver_selection_values angle`), done by the lane before `am start`.
- With ANGLE + the flag, Bevy gets its WebGPU device but cannot present:
  « Required texture memory size … is larger than the AHardwareBuffer
  allocation size (0) » on `ImportSharedTextureMemory` — the emulator's
  gralloc reports empty AHardwareBuffers. The renderer then stops after its
  first frame (`redraw_applied: 1`, `wake_send_failures` climbing) on a grey
  canvas. **Rendering acceptance still needs a physical phone.** Without the
  flag, the emulator validates boot, timings and the failure surface.
