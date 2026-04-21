import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkMtrackRetired } from './check_retired_timeline_guard.mjs';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mtrack-retired-'));

fs.mkdirSync(path.join(tmpRoot, 'src/application/eVe'), { recursive: true });
fs.mkdirSync(path.join(tmpRoot, 'src/application/eVe/intuition'), { recursive: true });
fs.mkdirSync(path.join(tmpRoot, 'src/application/eVe/tests'), { recursive: true });
fs.mkdirSync(path.join(tmpRoot, 'tools'), { recursive: true });

fs.writeFileSync(path.join(tmpRoot, 'src/application/eVe/eVe.js'), [
    "const modules = [{ id: 'eve.molecule_panel', path: './intuition/tools/molecule/index.js' }];",
    ''
].join('\n'));
fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({
    scripts: {
        'check:molecule': 'node src/application/eVe/tests/molecule/run_molecule_tests.mjs'
    }
}, null, 2));
fs.writeFileSync(path.join(tmpRoot, 'src/application/eVe/intuition/panel_definitions.js'), [
    "const modules = { mtrack: () => import('./tools/molecule/index.js') };",
    ''
].join('\n'));

let result = checkMtrackRetired({ rootDir: tmpRoot });
assert.equal(result.ok, true, 'clean tree should pass retirement guard');

fs.mkdirSync(path.join(tmpRoot, 'src/application/eVe/intuition/tools/mtrack'), { recursive: true });
result = checkMtrackRetired({ rootDir: tmpRoot });
assert.equal(result.ok, false, 'retired runtime directory should fail');
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_runtime_path_forbidden'));

fs.rmSync(path.join(tmpRoot, 'src/application/eVe/intuition/tools/mtrack'), { recursive: true, force: true });
fs.writeFileSync(path.join(tmpRoot, 'src/application/eVe/tests/mtrack_old.test.mjs'), '');
fs.writeFileSync(path.join(tmpRoot, 'tools/headless_mtrack_probe.mjs'), '');
result = checkMtrackRetired({ rootDir: tmpRoot });
assert.equal(result.ok, false, 'retired tests and probes should fail');
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_test_file_forbidden'));
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_probe_file_forbidden'));

fs.rmSync(path.join(tmpRoot, 'src/application/eVe/tests/mtrack_old.test.mjs'), { force: true });
fs.rmSync(path.join(tmpRoot, 'tools/headless_mtrack_probe.mjs'), { force: true });
fs.writeFileSync(path.join(tmpRoot, 'src/application/eVe/eVe.js'), "import './intuition/tools/mtrack.js';\n");
result = checkMtrackRetired({ rootDir: tmpRoot });
assert.equal(result.ok, false, 'active bootstrap reference should fail');
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_bootstrap_reference_forbidden'));
fs.writeFileSync(path.join(tmpRoot, 'src/application/eVe/eVe.js'), [
    "const modules = [{ id: 'eve.molecule_panel', path: './intuition/tools/molecule/index.js' }];",
    ''
].join('\n'));

fs.writeFileSync(path.join(tmpRoot, 'src/application/eVe/intuition/panel_definitions.js'), [
    "const modules = { mtrack: () => import('./tools/mtrack.js') };",
    ''
].join('\n'));
result = checkMtrackRetired({ rootDir: tmpRoot });
assert.equal(result.ok, false, 'active panel module reference should fail');
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_panel_module_reference_forbidden'));

console.log('check_mtrack_retired.test: PASS');
