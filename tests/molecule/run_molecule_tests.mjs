import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Node-runnable Molecule suites. Browser-driven visual probes that need a live
// app server stay manual.
const SUITES = [
    'tests/probes/media_playback_command.probe.mjs',
    'tests/probes/molecule_automation.probe.mjs',
    'tests/probes/molecule_dual_time_model.probe.mjs',
    'tests/probes/molecule_mount_visual_transaction.probe.mjs',
    'tests/probes/molecule_audio_mix_transport.probe.mjs',
    'tests/probes/molecule_scene_stack_commit.probe.mjs',
    'tests/probes/molecule_nested.probe.mjs',
    'tests/probes/molecule_multitrack_timeline_probe.probe.mjs',
    'tests/probes/molecule_session_history.probe.mjs',
    'tests/probes/molecule_session_durability_atomicity.probe.mjs',
    'tests/probes/molecule_snapshot_invariants.probe.mjs',
    'tests/probes/molecule_mutation_property.probe.mjs',
    'tests/probes/molecule_ui_mcp_parity.probe.mjs',
    'tests/probes/molecule_audio_capture_adapter.probe.mjs',
    'tests/probes/molecule_recording_session.probe.mjs',
    'tests/probes/molecule_recording_runtime.probe.mjs',
    'tests/probes/molecule_generic_recording.probe.mjs',
    'tests/probes/molecule_contextual_creation.probe.mjs',
    'tests/probes/molecule_record_scheduler.probe.mjs',
    'tests/probes/molecule_transport_runtime.probe.mjs',
    'tests/probes/molecule_stores.probe.mjs',
    'tests/probes/molecule_v2_structure.probe.mjs',
    'tests/probes/molecule_list_projection.probe.mjs',
    'tests/probes/molecule_mix_projection.probe.mjs',
    'tests/probes/molecule_timeline_activity.probe.mjs',
    'tests/probes/molecule_timeline_scene.probe.mjs',
    'tests/probes/molecule_timeline_scene_bridge.probe.mjs',
    'tests/probes/molecule_track_type_registry.probe.mjs'
];

let failed = 0;
for (const suite of SUITES) {
    const result = spawnSync(process.execPath, [path.join(repoRoot, suite)], { stdio: 'inherit' });
    if (result.status !== 0) {
        failed += 1;
        console.error(`FAIL: ${suite}`);
    }
}

if (failed > 0) {
    console.error(`molecule tests: ${failed} suite(s) failed`);
    process.exit(1);
}
console.log(`molecule tests OK (${SUITES.length} suite(s))`);
