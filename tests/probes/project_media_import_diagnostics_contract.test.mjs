import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const importSource = await readFile(
    new URL('../../eVe/intuition/runtime/project_media_import_runtime.js', import.meta.url),
    'utf8'
);
const projectDropSource = await readFile(
    new URL('../../eVe/intuition/tools/project_drop.js', import.meta.url),
    'utf8'
);

test('iOS project import diagnostics are owned by project_media_import_runtime', () => {
    assert.ok(
        importSource.includes('[ProjectImport]'),
        'project media import must emit the narrow Xcode-visible import trace'
    );
    assert.ok(
        importSource.includes("logImportDiag('import:creator_result'"),
        'project media import must log the delegated creator result'
    );
    assert.equal(
        projectDropSource.includes('[iOSDrop]'),
        false,
        'project drop must not keep the temporary iOS drop logger'
    );
});
