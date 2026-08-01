import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../atome/src/squirrel/apis/unified/adole_api/auth_workspace.js', import.meta.url), 'utf8');
assert.match(source, /guest_adoption_operation_required/, 'Guest adoption must require an idempotency operation');
assert.match(source, /adoption_confirmed: true/, 'Guest transfer must require explicit confirmation at the local boundary');
assert.doesNotMatch(source, /recoverSingleLocalWorkspaceCandidate/, 'Automatic workspace recovery must not guess a guest source');

console.log('auth_workspace_cache_contract.test: PASS');
