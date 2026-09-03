# iOS WebContent boot crash and black-screen recovery

## Symptom

An Xcode-installed Debug app could issue roughly 1,143 `atome://` requests,
terminate its WebContent process, automatically reload the entire graph, and
finish on a black WKWebView after the retry limit. The raw Debug bundle also
contained concurrent source-tree copies in both the app and AUv3.

## Owners and correction

- `platforms/ios/package_ios_runtime.mjs` builds the one distributed ESM runtime
  root used by both Xcode targets. Do not restore raw `src` or eVe resource-copy
  phases.
- `AudioSchemeHandler.swift` resolves from `atome_runtime`, streams large
  responses, retains compatible `/src`, `/eVe`, `/wasm`, and `/vendor` URLs,
  and reports only aggregate boot metrics.
- `WebViewManager` records monotonic milestones and treats WebContent
  termination as terminal. Only the native Retry button may start another page
  load.
- `boot_runtime.js` publishes versioned presentation readiness after the
  canonical WebGPU workspace and Main Toolbar are presented. An unauthenticated
  login mount has a separate readiness message and makes no workspace claim.
- `project_bootstrap.js` and `user_workspace_surface_runtime.js` reuse the
  existing startup preference and current project; valid saved state loads
  `staleFirst`, otherwise Dashboard is the explicit fallback.

## Validation

Run the focused Node/Vitest boot contracts, then build both iOS targets through
the `atome` scheme. Inspect `runtime-manifest.json` in each product and verify
there is one `atome_runtime` root and no raw `src`/eVe copy beside it. Device
acceptance requires 20 cold and 20 warm launches with periodic screenshots,
native/JS chronology, request/byte counts, memory, and crash/Jetsam reports.
Verify real pixels, final viewport containment, Main Toolbar `active` and
`treeMounted`, project-object visibility, touch interaction, offline resume,
invalid-project Dashboard fallback, and recoverable simulated termination.

Simulator or browser captures never replace the physical-iPhone campaign. If
the device or WebDriverAgent signing is unavailable, record that lane as
**To verify** rather than extrapolating a pass.

## Physical-device finding (2026-09-02)

The transport/resource storm is fixed but the device acceptance is not. The
generated runtime has 481 files and 23 factorized critical chunks; instrumented
iPhone launches fell from about 1,143 to about 47 `atome://` requests before
termination. The local saved project reaches a one-record WebGPU scene with a
402x778 CSS surface, DPR capped at 1.5, and a 3,908,088-byte decoded image
texture. WebContent then dies during the physically tested 13,054,388-byte
combined Bevy scene/UI WASM initialization, before `bevy.run_ready`. The
current rebuilt candidate is 13,037,439 bytes and still needs the device rerun.

The matching iPhone Jetsam report is conclusive: both WebContent victims have
`reason: per-process-limit`, `rpages: 131072`, and 16 KiB pages, which is exactly
2 GiB resident. Do not diagnose this remaining failure as a URL-handler retry,
large project, texture-size, canvas-size, or per-resource logging problem.

The linked iOS Rust library currently reports `linked_no_presenter` and
`presentable: 0`; it is a scene probe, not a native renderer. Never set
`__ATOME_NATIVE_BEVY_PRESENTABLE__` to bypass that contract. The remaining
architectural choices are to implement a real native iOS Bevy presenter backed
by the shared core, or materially reduce/split the browser WASM so its WebKit
compile/runtime peak stays below the device limit. Until then, do not run or
report the 20+20 campaign as a pass and do not remove the native recovery UI.

Current executable evidence: focused boot and project-resume contracts pass;
the signed Debug device build for app plus AUv3 succeeds; the standalone AUv3
product is 201 MiB and the complete app product is 402 MiB including its
embedded AUv3. Physical pixels,
touches, repeatable timing budgets, and zero WebContent crashes remain failed or
unverified as applicable.

The final signed build can use the development profiles for both targets. If
`devicectl` reports `CoreDeviceService ... connection was invalidated` and then
times out even on `list devices`, treat that attempt as an unavailable device
lane, not as an application launch result; do not include it in timing data.

## Installed Debug hygiene (2026-09-03)

The branded “Le moteur d’affichage s’est arrêté” surface is the intentional
native recovery UI and must not be removed: it proves that WebContent
terminated instead of leaving an unexplained black frame. The installed path
did, however, still contain unrelated historical diagnostics. Normal Debug
launches no longer enable Panel Lab, Web Inspector, or verbose text tracing;
each requires its documented argument/environment opt-in. The obsolete
`creerDivRouge` post-navigation IPC, the `atome://` AUv3 audio-test page, and
the delayed MIDI smoke-test log are removed. The scheme root now resolves to
the real packaged `src/index.html` entry.

The iOS Rust probe archive is optimized by default in both Debug and Release.
Use `ATOME_IOS_RUST_DEV=1` only for a deliberate native Rust debugging session;
JavaScript/Xcode debugging does not require the much larger dev archive. This
changes native binary/loader pressure without changing the canonical WebGPU
renderer or hiding a WebContent failure.
In the signed Debug product this reduced each native debug dylib from about
180 MiB to 17 MiB, the standalone AUv3 from 364 MiB to 201 MiB, and the app
including its embedded AUv3 from 728 MiB to 402 MiB.

Focused source, bootstrap, offline-resume, authentication-order, packaging,
voice-memory, Cargo, and signed app+AUv3 build checks pass. A physical rerun is
still mandatory after the iPhone is unlocked: a device reported as passcode
protected cannot supply launch logs, screenshots, taps, memory, or a valid
20+20 campaign sample.

An `opt-level=s` WASM experiment was measured and rejected rather than shipped.
It reduced the optimized function count from 74,999 to 65,357, but increased
the file from 13,037,439 to 15,528,000 bytes and its code section from
10,247,078 to 12,797,185 bytes. Three isolated Node compilation runs also ended
at 95.1 MiB RSS instead of 89.5 MiB and were slower after warm-up. This is not
WebKit/iPhone evidence, but it is sufficient to reject that candidate; it does
not replace the required physical campaign.

## Physical iPad recovery verification (2026-09-03)

The later virtual-function-elimination WASM experiment was also rejected. It
could compile but panicked during renderer startup on the physical device. The
packager now rejects that build mode and ships the normal release WASM
(`12,958,254` bytes, version `142f2b4618250f20`). Renderer startup no longer
resolves its promise before `run()` and two presented frames; a captured panic
always wins over the generic WebAssembly `unreachable` compatibility case.
Failed project projection therefore cannot emit `projection.bevy_ready` or
release the native launch surface.

Two consecutive launches of the signed Debug application on the connected
11-inch iPad Pro (M5), iPadOS 26.6.1, presented the saved project
`ea2cd0cb-5273-4094-ba2f-4bd57fd5fad5` with its real tracks/media and the final
Main Toolbar visible, active, tree-mounted, and contained in the viewport. The
second measured launch reported `interactive_ms: 1030`,
`native_elapsed_ms: 1249`, a 132 MiB observed peak, no missing packaged
resource, and no WebContent termination. The device screenshot, rather than
the renderer-ready state alone, is the acceptance evidence for these two warm
samples.

This is a verified recovery, not completion of the whole performance campaign:
the second sample used 146 `atome://` requests, above the agreed 100-resource
budget, and the required 20 cold plus 20 warm P95 series and physical touch
journey have not yet been run. The iOS 26.4 simulator currently fails because
its Bevy adapter finds no GPU; the iOS 18.5 simulator remained `about:blank`
until the native timeout. Neither simulator result is a product-success proof,
and neither invalidates the positive physical-iPad pixels.

The app and AUv3 Xcode phases now share the same Cargo target directory for a
given configuration. They still link their own static-library copy, but no
longer compile the identical Bevy dependency graph twice during one scheme
build.
