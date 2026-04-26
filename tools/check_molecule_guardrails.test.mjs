import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkMoleculeGuardrails } from './check_molecule_guardrails.mjs';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'molecule-guardrails-'));
const moleculeDir = path.join(tmpRoot, 'src/application/eVe/intuition/tools/molecule');
fs.mkdirSync(moleculeDir, { recursive: true });

fs.writeFileSync(path.join(moleculeDir, 'safe.js'), [
    'export const createMoleculeState = () => ({ tracks: [], clips: [] });',
    ''
].join('\n'));

let result = checkMoleculeGuardrails({ rootDir: tmpRoot });
assert.equal(result.ok, true, 'safe Molecule source should pass guardrails');

fs.writeFileSync(path.join(moleculeDir, 'bad.js'), [
    "import '../../../../domains/mtrax/timeline/play_runtime.js';",
    'export const run = () => {',
    `  try { return window.__MTRACK || null; } ${'catch'} (error) {}`,
    '};',
    ''
].join('\n'));

result = checkMoleculeGuardrails({ rootDir: tmpRoot });
assert.equal(result.ok, false, 'forbidden Molecule source should fail guardrails');
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_dependency_forbidden'));
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_global_forbidden'));
assert.ok(result.violations.some((violation) => violation.code === 'silent_catch_forbidden'));

console.log('check_molecule_guardrails.test: PASS');
