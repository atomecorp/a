# Tauri Import Rendering Failure And iOS Risk Report

## Context

Imported media Atomes were successfully created after a project import on Tauri/Axum, but they were not visible on the project surface.

The import logs proved that the drop pipeline was not the first failing boundary:

- the project drop bridge received and routed the drop;
- media upload completed;
- the creator returned an Atome id;
- the project scene projection started;
- the rendered Atome was expected to appear on the project canvas.

The failure was therefore in the rendering/presentation path after canonical Atome creation, not in the initial file drop handler.

## Root Cause On Tauri

The Tauri runtime was selecting the native Bevy command path for the visible project surface whenever the app was running in a Tauri WebView.

That selection was too broad.

The Rust command bridge behind `bevy_native_start`, `bevy_native_apply_ops`, and `bevy_native_resize` currently starts an embedded Bevy App and applies the shared Atome Bevy scene contract. This validates scene decoding and ECS projection, but it does not own a visible native presentation surface inside the Tauri WebView.

In other words:

```text
canonical Atome record
  -> RenderAtom / Virtual Scene
    -> Tauri native Bevy command bridge
      -> embedded Bevy scene updates
        -> no presentable project surface
```

The bridge correctly reported that state as `presentable:false`, with renderer mode `embedded_scene`. The JavaScript renderer treated the Tauri environment itself as enough evidence to use that native path for the visible project canvas. As a result, the import pipeline could create valid Atomes while the selected renderer had no visible surface to present them.

The symptom was:

```text
Atome exists in canonical/project state
media URL exists
project projection starts
native bridge receives scene
visible project canvas does not show the imported Atome
```

The important distinction is that a native command bridge is not the same thing as a presentable native renderer.

## Related Axum Boundary

There was also an Axum parity risk around media ownership metadata.

Imported media URLs need the owner identity to remain attached so protected local media routes can resolve the file:

```text
/api/uploads/<file>?media_user_id=<owner_id>
```

The Tauri/Axum upload responses must expose all canonical owner aliases used by the existing client-side media normalization path:

```text
owner
owner_id
ownerId
```

Without that, a created Atome can contain an incomplete or unauthorizable media source. That can produce a similar visible symptom: the Atome exists, but the media texture cannot be resolved by the project renderer.

## Fix Direction Applied

The rendering selection rule was tightened.

Tauri WebView alone must not activate the native Bevy renderer for the visible project surface. The native path is only selected for Tauri when the host explicitly declares that a presentable native Bevy renderer is available:

```text
window.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true
```

Until that exists, Tauri WebView project surfaces use the visible Bevy/WebGPU canvas path for presentation.

This is not a runtime fallback after failure. It is a capability selection rule before rendering starts:

```text
if native renderer is presentable:
    use native Bevy presentation
else:
    use the visible WebGPU project canvas owned by the WebView
```

The embedded Rust Bevy bridge remains useful and valid for native command validation, but it must not be treated as a visible presentation backend.

## Why iOS Could Have The Same Or A Similar Problem

iOS and AUv3 have the same architectural risk: a native bridge can exist before a real presentable native renderer is wired into the app surface.

The dangerous condition is:

```text
iOS host exposes native Bevy commands
JavaScript selects native rendering for the project surface
native side accepts scene commands
native side has no linked/presentable Metal/Bevy surface
Atomes are created but nothing appears visually
```

That is the same class of bug as Tauri:

- canonical Atome state is valid;
- media upload or local media resolution may be valid;
- scene projection may be valid;
- the selected native renderer is not actually presentable.

On iOS the problem could also appear as a similar media-resolution issue if `/api/uploads/...` or `/api/recordings/...` URLs are not normalized to the local HTTP server with the correct owner identity. In that case the renderer may be presentable, but the texture source cannot be fetched or authorized.

So there are two iOS risks to keep separate:

1. Native presentation risk:
   The Swift/Rust/Metal Bevy bridge exists, but no visible native project surface is actually connected.

2. Protected media source risk:
   The imported Atome exists, but its media URL lacks the owner/auth context required by the local iOS HTTP media route.

Both can produce the same user-visible symptom: imported Atomes do not appear after import.

## Required iOS Checks

On iOS, visible project rendering uses the Bevy WASM/WebGPU canvas unless the host explicitly declares a presentable native Bevy renderer. The Swift/Rust command boundary remains callable for diagnostics and future native presentation. Before claiming native Bevy presentation is visible on iOS, verify all of these conditions:

- the Swift bridge command boundary exists and is callable;
- the Rust/Bevy native library is actually linked into the iOS targets;
- the native renderer owns a visible Metal/Bevy presentation surface;
- failed or non-presentable native renderer states return explicit errors;
- imported media URLs keep owner identity through `owner`, `owner_id`, and `ownerId`;
- `/api/uploads/...` and `/api/recordings/...` resolve through the local iOS HTTP server;
- the project surface contains one visible rendering surface, not one DOM node or canvas per Atome;
- imported Atomes are validated by canvas pixels, scene state, and hit-testing.

## Validation Evidence From The Tauri Investigation

The Axum/Tauri validation on `http://127.0.0.1:3000` confirmed:

- media upload succeeded;
- the creator returned one imported Atome;
- the record contained `/api/uploads/...?...media_user_id=...`;
- the project hit-test found the imported Atome;
- pointer drag updated `left/top`;
- no project intent error was recorded.

The Bevy/Tauri checks confirmed:

- the embedded Rust Bevy bridge starts without requiring `WindowPlugin`;
- the embedded bridge is explicitly non-presentable;
- Tauri native command permissions exist;
- Tauri WebView rendering does not select the non-presentable native bridge for the visible project canvas;
- iOS/AUv3 keep the native command boundary for diagnostics, but visible project rendering uses the Bevy WASM/WebGPU canvas until the native host declares a presentable Bevy renderer.
- iOS now links a Rust staticlib wrapper around the shared Atome Bevy core, probes native scenes in Rust, and returns `ios_bevy_native_not_presentable` with `renderer_mode=linked_no_presenter`, `rust_linked=1`, `bevy_core_linked=1`, and `presentable=0` until the real Metal/Bevy presenter is connected.

## Conclusion

The Tauri import visibility bug was caused by confusing native command availability with native visual presentation availability.

The Atome creation path worked. The selected renderer path was wrong for a visible Tauri WebView project surface because the Rust Bevy bridge was embedded and non-presentable.

iOS can suffer from the same bug if its native bridge is treated as presentable before a real Metal/Bevy surface is wired. It can also suffer from a similar symptom if protected media URLs lose owner/auth metadata during upload or reload.

The safe rule is:

```text
native command bridge available != native renderer presentable
```

For iOS, the Bevy WASM/WebGPU canvas is the selected visible project rendering path until a real native Bevy presenter is declared through `window.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true`. The Swift/Rust native boundary remains linked and diagnostic-only while it reports `presentable=0`.
