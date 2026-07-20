# State Graph - media-recording

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> capability_check: exact requested
  capability_check --> exact_starting: explicit AUv3 plugin_input + dual clocks supported
  capability_check --> rejected: av_sample_accurate_overdub_unsupported
  rejected --> idle: generic recording may be requested explicitly
  idle --> generic_starting: exact not requested
  generic_starting --> recording: backend started
  exact_starting --> recording: record_started clock/epoch validated
  generic_starting --> failed: permission/API/init failure
  exact_starting --> failed: clock/rate/start failure
  recording --> flushing: browser audio stop
  flushing --> validating: tail then flush_ack
  flushing --> failed: typed flush/protocol failure
  recording --> native_stopping: native stop
  native_stopping --> validating: record_done result
  validating --> failed: health/dual-clock/playback-proof/positive-latency failure
  validating --> finalization_failed: terminal result requires explicit cleanup
  validating --> persisting: valid generic or exact result
  persisting --> persisting: durable write/project association retry
  persisting --> ready: canonical media result committed
  finalization_failed --> finalization_failed: physical cleanup retry failed
  finalization_failed --> cleaned: discard physically confirmed
  failed --> cleaned: resources released or cleanup confirmed
  ready --> [*]
  cleaned --> [*]
```

Native iOS video adds a serialized host-owned lifecycle around these states. A WebView
reload first calls `media_video_record_state`; `starting`, `recording`, `stopping`, and an
unacknowledged successful terminal result are recoverable. Start and stop delegate waits
are bounded by watchdogs, concurrent stops share one completion, and a successful result
remains cached until durable project association is followed by `media_video_record_ack`.
A cleanup failure reports `terminal: false` and blocks a new start until cancel/cleanup
succeeds.
