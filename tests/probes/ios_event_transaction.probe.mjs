import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAiSFixture } from './ios_runtime_probe_support.mjs';

test('AiS events commit journal and projection together, including nested sync rollback', { skip: process.platform !== 'darwin' }, () => {
    const output = runAiSFixture('tests/probes/ios_event_transaction_fixture.swift');
    assert.ok(output.includes('AiS transaction checks passed'));
});
