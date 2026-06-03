import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../../eVe/intuition/tools/project_drop.js', import.meta.url), 'utf8');

test('project drop diagnostics are visible in native runtimes', () => {
    assert.ok(
        source.includes("String(window.location?.protocol || '').toLowerCase() === 'tauri:'"),
        'project drop diagnostics must auto-enable in Tauri'
    );
    assert.ok(
        source.includes('!!window.__TAURI__') && source.includes('!!window.__TAURI_INTERNALS__'),
        'project drop diagnostics must detect Tauri bridge globals'
    );
    assert.ok(
        source.includes('JSON.stringify(detail)') && source.includes('[ProjectDrop]'),
        'project drop diagnostics must write visible JSON console entries'
    );
    assert.ok(
        source.includes('window[PROJECT_DROP_DEBUG_LOG_KEY] = current'),
        'project drop diagnostics must keep the in-window ring buffer'
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
        source.includes("logProjectDropDebug(`media:${entry.step || 'event'}`, entry)"),
        'temporary media diagnostics must flow into the project drop logger'
    );
    assert.ok(
        source.includes('return entry'),
        'temporary media diagnostics must return the normalized entry'
    );
});
