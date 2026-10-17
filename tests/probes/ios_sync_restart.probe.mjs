import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildAiSFixture } from './ios_runtime_probe_support.mjs';

test('fresh and legacy SQLite checkpoints survive process termination before replay completion', { skip: process.platform !== 'darwin' }, () => {
    const build = buildAiSFixture('tests/probes/ios_sync_restart_fixture.swift');
    try {
        const run = (dir, mode) => execFileSync(build.binary, [dir, mode], { encoding: 'utf8' }).trim();
        for (const initial of ['fresh', 'legacy']) {
            const dir = join(build.directory, initial); mkdirSync(dir);
            assert.match(run(dir, initial), initial === 'fresh' ? /cursor=1 version=1 stored=1/ : /cursor=1 version=0 stored=12/);
            assert.match(run(dir, 'reopen'), /cursor=1/);
            assert.match(run(dir, 'advance'), /cursor=2/);
            assert.match(run(dir, 'reopen'), /cursor=2/);
            assert.match(run(dir, 'complete'), /cursor=2 version=1/);
        }
    } finally { build.dispose(); }
});
