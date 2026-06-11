import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Node-runnable Molecule suites. Browser-driven probes that need a live app
// server stay manual: run molecule_panel_contract_probe.test.mjs and
// molecule_webgpu_visual_probe.test.mjs with node against a running app.
const SUITES = [
    'eVe/core/media_engine/molecule.test.mjs',
    'tests/probes/molecule_global_diagnostics_contract.test.mjs',
    'tests/probes/molecule_global_diagnostics_probe.test.mjs',
    'tests/probes/molecule_mount_visual_transaction.test.mjs',
    'tests/probes/molecule_multitrack_timeline_probe.test.mjs',
    'tests/probes/molecule_open_raw_media_request_probe.test.mjs',
    'tests/probes/molecule_panel_record_tools_contract.test.mjs',
    'tests/probes/molecule_record_action_camera_contract.test.mjs',
    'tests/probes/molecule_session_history.test.mjs'
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
