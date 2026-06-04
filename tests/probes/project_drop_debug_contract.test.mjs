import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../../eVe/intuition/tools/project_drop.js', import.meta.url), 'utf8');
const diagnosticsSource = await readFile(
    new URL('../../eVe/intuition/tools/project_drop_diagnostics.js', import.meta.url),
    'utf8'
);

test('project drop diagnostics stay behind an explicit debug flag', () => {
    assert.ok(
        diagnosticsSource.includes('window[PROJECT_DROP_DEBUG_LOG_KEY] = current'),
        'project drop diagnostics must keep the in-window ring buffer'
    );
    assert.ok(
        diagnosticsSource.includes('window[PROJECT_DROP_DEBUG_FLAG_KEY] === true'),
        'project drop diagnostics must require the explicit project drop debug flag'
    );
    assert.equal(
        source.includes('[iOSDrop]'),
        false,
        'project drop must not emit permanent iOS console diagnostics'
    );
});

test('project drop creator diagnostics expose render status', () => {
    assert.ok(
        source.includes('rendered: created?.invokeResult?.result?.rendered === true'),
        'creator diagnostics must expose whether createAtome rendered'
    );
    assert.ok(
        source.includes('create_result: created?.invokeResult?.result?.create_result || null'),
        'creator diagnostics must include the bounded create result summary'
    );
});

test('temporary media diagnostics are not silently discarded', () => {
    assert.ok(
        diagnosticsSource.includes("logProjectDropDebug(`media:${entry.step || 'event'}`, entry)"),
        'temporary media diagnostics must flow into the project drop logger'
    );
    assert.ok(
        diagnosticsSource.includes('return entry'),
        'temporary media diagnostics must return the normalized entry'
    );
});
