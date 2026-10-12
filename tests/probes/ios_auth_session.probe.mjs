import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAiSFixture } from './ios_runtime_probe_support.mjs';
test('native iOS session descriptor: migration, restart, signatures, logout and account isolation', { skip: process.platform !== 'darwin' }, () => {
 const output = runAiSFixture('tests/probes/ios_auth_session_fixture.swift', { authentication: true });
 assert.match(output, /Native descriptor: schema migration, restart, signed clear, logout and account isolation passed/);
});
