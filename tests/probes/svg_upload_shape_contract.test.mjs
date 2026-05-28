import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
    inferUploadAtomeType,
    looksLikeSvgUploadShape
} from '../../eVe/domains/media/asset_box.js';

test('svg uploads stay editable shape atomes before media timeline conversion', () => {
    assert.equal(inferUploadAtomeType('icon.svg', ''), 'shape');
    assert.equal(inferUploadAtomeType('uploaded.bin', 'image/svg+xml'), 'shape');
    assert.equal(looksLikeSvgUploadShape({
        atomeType: 'shape',
        fileName: 'icon.svg',
        mimeType: 'image/svg+xml',
        svgMarkup: '<svg viewBox="0 0 10 10"></svg>'
    }), true);
    assert.equal(looksLikeSvgUploadShape({
        atomeType: 'image',
        fileName: 'icon.svg',
        mimeType: 'image/svg+xml'
    }), false);
});

test('project creation keeps imported svg shape specs out of mtrax groups', async () => {
    const source = await readFile(new URL('../../eVe/intuition/runtime/tool_genesis.js', import.meta.url), 'utf8');
    const start = source.indexOf('const shouldConvertImportedMediaToMtrax =');
    assert.notEqual(start, -1, 'shouldConvertImportedMediaToMtrax must exist');
    const end = source.indexOf('\nconst ', start + 1);
    assert.notEqual(end, -1, 'shouldConvertImportedMediaToMtrax boundary must be explicit');
    const body = source.slice(start, end);

    assert.ok(body.includes('if (isSvgShapeSpec(spec)) return false;'), 'svg shape imports must remain editable shapes');
    assert.ok(
        body.indexOf('if (isSvgShapeSpec(spec)) return false;') < body.indexOf('return !!normalizeImportedMtraxClipKind(spec);'),
        'svg shape guard must run before generic media timeline conversion'
    );
});
