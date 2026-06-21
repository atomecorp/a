import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Node-runnable Molecule suites. Browser-driven visual probes that need a live
// app server stay manual.
const SUITES = [
    'tests/probes/molecule_automation.test.mjs',
    'tests/probes/molecule_dual_time_model.test.mjs',
    'tests/probes/molecule_mount_visual_transaction.test.mjs',
    'tests/probes/molecule_nested.test.mjs',
    'tests/probes/molecule_multitrack_timeline_probe.test.mjs',
    'tests/probes/molecule_session_history.test.mjs',
    'tests/probes/molecule_stores.test.mjs',
    'tests/probes/molecule_timeline_scene.test.mjs',
    'tests/probes/molecule_timeline_scene_bridge.test.mjs',
    'tests/probes/molecule_track_type_registry.test.mjs'
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
