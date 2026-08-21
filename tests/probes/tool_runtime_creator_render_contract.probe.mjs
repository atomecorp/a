import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../../eVe/intuition/tools/core/tool_runtime.js', import.meta.url), 'utf8');

test('creator gateway returns bounded render diagnostics on success', () => {
    assert.ok(
        source.includes('const summarizeCreatorResult ='),
        'creator gateway must summarize createAtome results without cloning DOM render objects'
    );
    assert.ok(
        source.includes('rendered: created?.rendered === true'),
        'creator gateway must expose rendered status'
    );
    assert.ok(
        source.includes('render_ok: created?.view?.ok ?? null'),
        'creator gateway must expose render result status'
    );
    assert.ok(
        source.includes('create_result: summarizeCreatorResult(created)'),
        'creator gateway must return the bounded create result summary'
    );
});
