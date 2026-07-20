import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

const cases = [
    {
        path: 'eVe/intuition/matrix/core/project_data.js',
        importPattern: /from '\.\.\/\.\.\/\.\.\/\.\.\/atome\/src\/shared\/atome_contract\.js'/
    },
    {
        path: 'eVe/intuition/matrix/core/project_order_runtime.js',
        importPattern: /from '\.\.\/\.\.\/\.\.\/\.\.\/atome\/src\/shared\/atome_contract\.js'/
    },
    {
        path: 'eVe/intuition/tools/clipboard/paste_events.js',
        importPattern: /from '\.\.\/\.\.\/\.\.\/\.\.\/atome\/src\/shared\/atome_contract\.js'/
    },
    {
        path: 'eVe/intuition/tools/selection_style_atome.js',
        importPattern: /from '\.\.\/\.\.\/\.\.\/atome\/src\/shared\/atome_contract\.js'/
    }
];

test('active eVe Atome mutation surfaces use the shared property sanitizer', () => {
    cases.forEach(({ path, importPattern }) => {
        const source = fs.readFileSync(path, 'utf8');
        assert.match(source, importPattern, path);
        assert.doesNotMatch(source, /RESERVED_ATOME_PROPERTY_KEYS/, path);
        assert.doesNotMatch(source, /const sanitizeAtomeProperties = \(/, path);
        assert.doesNotMatch(source, /const sanitizeAtomePropertyPatch = \(/, path);
        assert.doesNotMatch(source, /const sanitizePastedAtomeProperties = \(/, path);
    });
});
