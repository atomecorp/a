# Visio: the user sees themselves upside down (or sideways) on iOS/WebKit

## Symptom

In a Visio call on the iPad, the user's own tile shows their head at the bottom.
A WebKit correspondent (iPad, Tauri on macOS) receives the same upside-down picture.

## Confirmed root cause

WebKit keeps a camera's rotation as **frame metadata**, and its WebGPU
`importExternalTexture` ignores it — the Bevy video quad samples the raw sensor
orientation. Measured on 2026-10-23 on the iPad Pro A12Z, landscape-primary,
front camera, by sampling the external texture into 24×24 and correlating with a
2D-canvas draw of the same `<video>` (the canvas applies the rotation):

- raw camera import ≡ upright picture turned 180° (correlation 1.0), same through `new VideoFrame(video)`;
- WebKit exposes the rotation nowhere: no `VideoFrame.rotation`/`flip`, unchanged track settings and sizes;
- WebRTC loopback with `urn:3gpp:video-orientation` (CVO) negotiated: the received frame is rotated 180°;
  without CVO the sender turns its pixels before encoding and the received frame is upright.

mediasoup advertises CVO by default, so every Visio stream carried its rotation as metadata only.

## Durable correction

- `eVe/domains/visio/visio_call_runtime.js#withoutRotationMetadata` removes CVO from the router
  capabilities before `device.load`: every sender bakes rotation into its pixels, every receiver
  (Chrome or WebKit) gets an upright picture.
- The own tile is fed by `eVe/domains/media/api/video_upright_stream.js#createUprightVideoStream`
  (camera → one canvas per frame → `captureStream(0)`), exposed as `local.preview` by the call
  runtime; the producers keep the raw camera track.

## Regression check

`temp/visio_upside_down_2026-10-23/orient3.js` (upright stream) and `orient4.js` (CVO loopback),
run in the iPad WebView with `ipad_eval.mjs` (app launched with `-AtomeWebInspector`):
expect `uprightIdentity: 1` and `noCvoIdentity: 1`.

## Rejected hypotheses

- Not the Bevy quad: `video_quad_uvs` and the polygon clip keep top = v 0; project videos, the
  capture preview and remote Chrome streams are upright through the same path.
- Never flip the quad for "camera" sources: the rotation depends on device, camera and orientation
  (0°, 90°, 180°, 270°), and nothing in WebKit reports it.
