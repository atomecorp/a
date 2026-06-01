import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

test('asset box uses the shared Atome property sanitizer', () => {
    const source = fs.readFileSync('eVe/domains/media/asset_box.js', 'utf8');
    assert.match(source, /from '\.\.\/\.\.\/\.\.\/atome\/src\/shared\/atome_contract\.js'/);
    assert.doesNotMatch(source, /RESERVED_ATOME_PROPERTY_KEYS/);
    assert.doesNotMatch(source, /const sanitizeAtomeProperties = \(/);
});
