import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

test('asset box uses the shared Atome property sanitizer', () => {
    const source = fs.readFileSync('eVe/domains/media/asset_box.js', 'utf8');
    assert.match(source, /from '\.\.\/\.\.\/\.\.\/atome\/src\/shared\/atome_contract\.js'/);
    assert.doesNotMatch(source, /RESERVED_ATOME_PROPERTY_KEYS/);
    assert.doesNotMatch(source, /const sanitizeAtomeProperties = \(/);
});

test('asset box media runtime detection does not treat localhost:3000 alone as native', () => {
    const source = fs.readFileSync('eVe/domains/media/asset_box.js', 'utf8');
    assert.match(source, /function isNativeMediaRuntime\(\)/);
    assert.doesNotMatch(source, /from '\.\.\/\.\.\/\.\.\/atome\/src\/squirrel\/apis\/unified\/adole_api\/runtime\.js'/);
    assert.doesNotMatch(source, /localhost['"]\s*\|\|\s*host === ['"]127\.0\.0\.1['"]\)\s*&&\s*port === ['"]3000['"]/);
    assert.match(source, /__TAURI_INTERNALS__\?\.\s*invoke/);
    assert.match(source, /__AUV3_MODE__/);
});
