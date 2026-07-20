# Source-of-Truth Graph - media-recording

```mermaid
flowchart TD
  Request["canonical recording request"] --> Capability["sample-accurate capability decision"]
  Capability --> Generic["generic backend session"]
  Capability --> Exact["explicit AUv3 plugin_input session\nrender + host-transport clocks / epoch"]

  Generic --> GenericResult["recording result\nsample_rate + frame_count + health"]
  Exact --> NativeResult["record_done measured render frames"]
  NativeResult --> ExactResult["actual playback start + same-quantum observation\nstrict positive-latency placement contract"]

  GenericResult --> File["persisted media file / AudioFileAtome"]
  ExactResult --> File
  ExactResult --> Placement["timeline_origin - roundtrip\nstart/source_in/duration_frames"]
  File --> Clip["canonical clip Atome"]
  Placement --> Clip
  Clip --> Timeline["canonical timeline state"]

  BrowserClock["web_audio_context currentFrame"] --> GenericResult
  KiraClock["Kira playback clock"] -.-> NoWebMap["no proven shared-clock mapping"]
  NoWebMap -.-> BrowserClock
  Auv3RenderClock["auv3.render capture + matching epoch"] --> Exact
  HostTransportClock["auv3.host_transport timeline origin"] --> Exact

  Timeline -.-> UI["derived UI / waveform / Bevy media projection"]

  NativeRing["native recorder ring + active producer count"] --> WrittenFrames["producer-drained writer total"]
  WrittenFrames --> GenericResult

  NativeVideoState["native video lifecycle + cached terminal file"] --> VideoResult["validated generic video result"]
  VideoResult --> VideoAtome["durable project video Atome"]
  VideoAtome --> NativeAck["acknowledge terminal host result"]
  NativeVideoState -.->|reload recovery only| VideoResult
```

The native terminal cache is recoverable runtime state, not canonical project truth. The
persisted media Atome becomes the durable owner; acknowledgement is permitted only after
that commit succeeds. Browser retry similarly reuses one stable recording Atome/upload
identity instead of producing a second durable object.
