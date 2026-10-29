# Audio and MIDI qualification

Audio/MIDI compose with display or headless recipes through the same builder.
The audio stack declares optional JACK/libraries; USB audio/MIDI drivers stay with
the official FreeBSD kernel. No arbitrary latency tuning or JACK daemon is forced.

Actual framework owners remain the Kira WASM browser runtime and the native
engine for its already-supported hosts, plus eVe's Web MIDI/native MIDI ports.
Fastify alone serves assets and commands; it is not a native device audio engine.
Autonomous headless audio/MIDI is explicitly blocked until that real execution
path is available and tested on FreeBSD. A remote browser plays on the client.

Record actual audio/MIDI device models/firmware, FreeBSD/kernel version, runtime,
sample rate, buffer size, channel counts, capture/playback stability, reconnect,
load, xruns and measured loopback latency. A theoretical buffer duration is not
round-trip latency. USB class compliance is not a tested compatibility promise.
No measurements or strict real-time/deadline guarantees exist for these images.
