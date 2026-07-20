# Open Questions - Molecule Recording

## OPEN-001 - Exact video clock mapping

Question:

Which backend-owned mapping will translate every video/container PTS into an integer audio-sample position in the same identified and locked epoch?

Why it matters:

Nominal frame rate, file duration, and encoded frame count do not prove exact A/V placement. The mapping must account for variable frame rate, encoder reordering, dropped/duplicated frames, capture latency, and discontinuities.

Current decision:

Exact video returns `av_sample_accurate_overdub_unsupported` with reason
`video_pts_audio_sample_mapping_unavailable`. Generic browser/native video recording remains
available without a synthesized live viewfinder.

Exit evidence:

- a documented PTS-to-audio-frame contract;
- one clock id/reference/epoch across start and stop;
- deterministic integer clip ranges;
- long-duration hardware tests with zero unreported drift/discontinuity.

## OPEN-002 - AUv3 hardware calibration envelope

Question:

What device/sample-rate/buffer-size matrix is required to certify AUv3 `plugin_input` exact overdub in production?

Why it matters:

The software contract rejects mismatched epochs, sample rates, overruns, and discontinuities, but production certification still needs long-running hardware evidence across supported configurations.

Current decision:

Exact capability remains limited to explicitly requested `plugin_input`, captured inside
the same AUv3 render quantum with `auv3.render`, placed from the `auv3.host_transport`
timeline origin, and locked to one `clock_epoch`.

Exit evidence:

- loopback/overdub measurements over long takes;
- verified actual playback start and `playback_observed_frame == recording_start_frame`;
- verified strictly positive latency compensation;
- verified `input_latency_frames + output_latency_frames = roundtrip_latency_frames = record_offset_frames_applied` and `timeline_origin_frame - roundtrip_latency_frames` placement on every certified configuration;
- zero accumulated sample drift;
- explicit coverage of supported sample rates and render quantum sizes.

## Locked, not open

- Browser, desktop/Tauri, iOS app, AUv3 microphone, and AUv3 plug-in output/mix exact requests stay rejected.
- Their supported generic recording paths remain usable.
- Media Atome persistence precedes clip commit.
- Molecule recording exposes `read/start/stop/cancel/dispose`.
- The product has one Bevy/WebGPU renderer and no parallel product DOM/native preview surface; no static/fake WebGPU frame stands in for an unavailable camera viewfinder.
