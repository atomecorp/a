# Recording loses its Stop command after a row trigger

Confirmed in Web performance_hold_diagnosis_v4: the recorder still held two
measured events, but its container_record node had disappeared. The selected
text's tools replaced the container rail after the second row trigger.

project_view_surface_context_runtime.sync ignored row refreshes during capture
except when force=true. Playback state events called refreshCurrentContext with
force=true, defeating that guard. A forced refresh now projects the recording
container; starting Record also invalidates an older async row request.

Regression test calls the real context runtime with a selected row during
recording and invokes its retained Stop command. Web performance_hold_fixed_v1
and performance_hold_matrix_v1 pass initial wait, 10-second then 2-second holds,
exactly two persisted clips, reload, Performance selection and recursive replay.

The contextual renderer marks recording definitions red and uses the shared
recording visual module's disposable pulse through updateTreeMotion. Pulse tests
verify bounded updates and timer release. Definition failure reporting was moved
unchanged to the existing contextual handler module, keeping the main context
runtime below 500 lines.

The UI probe now rejects missing targets instead of clicking a default canvas
point. Earlier diagnostic runs with a null Stop target generated an extra canvas
selection; those reports are diagnosis evidence, not functional acceptance.

Natural Performance and real audio/video end-frame behavior remain open.
