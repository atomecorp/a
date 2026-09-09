# Live Mute ignored canonical property events

Confirmed Web evidence: `mute_live_baseline_v3` showed `mute: true` persisted while both simultaneous text leaves remained active and visible. The surface event owner read `event.props`; canonical commit emits `event.payload.props`.

`project_view_surface_events` consumes the canonical payload and both boolean transitions. `project_view_transport_runtime.mute` recompiles its input records rather than destructively dropping branches, allowing unmute at the existing playhead. Random container orders remain stable through recompilation. Empty containers no longer become synthetic leaves.

Web `mute_live_fixed_v4`: real mute/unmute clicks, visible control layer, hidden muted layer, restored active leaf, clean console/page errors. Screenshot inspected. Audio, Solo, strengths and gesture painting remain separate acceptance work.

The simultaneous compiler must retain muted leaf durations. Dropping every muted child reduced an all-muted simultaneous group to zero seconds and ended its clock. Only sequential/random parents skip explicit full Mute. Web single_mix_recursive_v9 verifies all-muted/unmuted continuity and single-selection M/S after transport convergence.
