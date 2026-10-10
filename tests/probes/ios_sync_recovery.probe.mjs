import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAiSFixture } from './ios_runtime_probe_support.mjs';

test('iOS restores the verified account and retains a durable, isolated retry outbox', { skip: process.platform !== 'darwin' }, () => {
    const output = runAiSFixture('tests/probes/ios_sync_recovery_fixture.swift');
    assert.match(output, /AiS sync recovery checks passed/);
});
