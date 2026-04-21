import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkMoleculeGuardrails } from './check_molecule_guardrails.mjs';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'molecule-guardrails-'));
const moleculeDir = path.join(tmpRoot, 'src/application/eVe/intuition/tools/molecule');
const projectStoreDir = path.join(tmpRoot, 'src/application/eVe/core/project_store');
fs.mkdirSync(moleculeDir, { recursive: true });
fs.mkdirSync(projectStoreDir, { recursive: true });

fs.writeFileSync(path.join(moleculeDir, 'safe.js'), [
    'export const createMoleculeState = () => ({ tracks: [], clips: [] });',
    ''
].join('\n'));

let result = checkMoleculeGuardrails({ rootDir: tmpRoot });
assert.equal(result.ok, true, 'safe Molecule source should pass guardrails');

fs.writeFileSync(path.join(moleculeDir, 'bad.js'), [
    "import '../mtrack/timeline_play_runtime.js';",
    'export const run = () => {',
    '  try { return window.__MTRACK || null; } catch (_) {}',
    '};',
    ''
].join('\n'));

result = checkMoleculeGuardrails({ rootDir: tmpRoot });
assert.equal(result.ok, false, 'forbidden Molecule source should fail guardrails');
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_dependency_forbidden'));
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_reference_forbidden'));
assert.ok(result.violations.some((violation) => violation.code === 'mtrack_global_forbidden'));
assert.ok(result.violations.some((violation) => violation.code === 'silent_catch_forbidden'));

fs.writeFileSync(path.join(projectStoreDir, 'bad_commit.js'), [
    'export const save = (payload) => window.__atomeCommitApi.commit(payload);',
    'export const saveOptional = (payload) => window.Atome?.commit(payload);',
    "export const endpoint = '/api/events/commit';",
    ''
].join('\n'));

result = checkMoleculeGuardrails({ rootDir: tmpRoot });
assert.equal(result.ok, false, 'Molecule store source must not call atome_commit');
assert.ok(result.violations.some((violation) => violation.code === 'atome_commit_dependency_forbidden'));

fs.writeFileSync(path.join(moleculeDir, 'bad_tools.js'), [
    "export const make = (document) => document.createElement('button');",
    "export const className = 'eve-toolbox-v2-tool';",
    ''
].join('\n'));

result = checkMoleculeGuardrails({ rootDir: tmpRoot });
assert.equal(result.ok, false, 'Molecule must not create or style tool buttons locally');
assert.ok(result.violations.some((violation) => violation.code === 'hardcoded_tool_button_forbidden'));
assert.ok(result.violations.some((violation) => violation.code === 'tool_design_copy_forbidden'));

console.log('check_molecule_guardrails.test: PASS');
