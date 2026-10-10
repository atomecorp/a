import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAiSFixture } from './ios_runtime_probe_support.mjs';

test('AiS state_current read responses carry the shared capability projection', { skip: process.platform !== 'darwin' }, () => {
    const output = runAiSFixture('tests/probes/ios_state_current_capabilities_fixture.swift');
    assert.ok(output.includes('AiS state_current capability checks passed'));
});
