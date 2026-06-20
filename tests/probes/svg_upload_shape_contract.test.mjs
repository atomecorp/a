import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const storageStub = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
};

Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storageStub
});
Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: storageStub
});
Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
        localStorage: storageStub,
        sessionStorage: storageStub,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true
    }
});

const {
    inferUploadAtomeType,
    looksLikeSvgUploadShape
} = await import('../../eVe/domains/media/asset_box.js');

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

test('project creation has no imported media timeline conversion branch', async () => {
    const source = await readFile(new URL('../../eVe/intuition/runtime/tool_genesis.js', import.meta.url), 'utf8');
    assert.equal(source.includes('shouldConvertImportedMediaToMtrax'), false);
    assert.equal(source.includes('normalizeImportedMtraxClipKind'), false);
    assert.equal(source.includes('buildImportedMtraxTimeline'), false);
});
