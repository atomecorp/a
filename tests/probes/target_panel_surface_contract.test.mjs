import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PANEL_SURFACE_DEFINITIONS } from '../../eVe/intuition/panel_definitions.js';

const TARGET_PANEL_FILES = Object.freeze({
    home: 'eVe/intuition/tools/user.js',
    finder: 'eVe/intuition/tools/finder.js',
    communicate: 'eVe/intuition/tools/communication.js',
    calendar: 'eVe/intuition/tools/calendar.js'
});

const TARGET_PANEL_KEYS = Object.freeze([
    'home',
    'finder',
    'communicate',
    'calendar'
]);

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sourceCreatesSurfaceId = (source, surfaceId) => {
    if (source.includes(`id: '${surfaceId}'`) || source.includes(`id: "${surfaceId}"`)) return true;
    const constPattern = new RegExp(`const\\s+([A-Z0-9_]+)\\s*=\\s*['"]${escapeRegExp(surfaceId)}['"]`);
    const match = source.match(constPattern);
    return !!(match && source.includes(`id: ${match[1]}`));
};

const assertSourceCreatesCanonicalDialog = (key) => {
    const def = PANEL_SURFACE_DEFINITIONS[key];
    assert.ok(def, `${key} must have a panel surface definition`);
    const file = TARGET_PANEL_FILES[key];
    assert.ok(file, `${key} must have a target panel module file`);
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes('createEveDialog'), true, `${key} must depend on createEveDialog`);
    assert.equal(sourceCreatesSurfaceId(source, def.surface_id), true, `${key} must create ${def.surface_id}`);
};

for (const key of TARGET_PANEL_KEYS) {
    assert.ok(PANEL_SURFACE_DEFINITIONS[key], `${key} must exist in the panel surface registry`);
}

assertSourceCreatesCanonicalDialog('home');
assertSourceCreatesCanonicalDialog('finder');
assertSourceCreatesCanonicalDialog('communicate');
assertSourceCreatesCanonicalDialog('calendar');
