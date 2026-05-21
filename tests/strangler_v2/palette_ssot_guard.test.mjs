import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LEGACY_MENU_ENTRYPOINTS = Object.freeze([
    'atome/src/application/examples/tools.js',
    'atome/src/application/examples/user.js',
    'atome/src/application/vie/menu.js',
    'atome/src/application/lyrix/src/intuition/menu.js',
    'atome/src/application/jeezs/demo.js'
]);

const FORBIDDEN_PATTERNS = Object.freeze([
    'new_menu_v2.updateContent',
    'new_menu_v2.updateTheme',
    'window.new_menu_v2.open?.('
]);

for (const file of LEGACY_MENU_ENTRYPOINTS) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
        assert.equal(
            source.includes(pattern),
            false,
            `${file} must not mutate the canonical eVe menu through ${pattern}`
        );
    }
}

console.log('palette_ssot_guard.test: PASS');
