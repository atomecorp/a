import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    COMPLEX_PANEL_SURFACE_KEYS,
    PANEL_SURFACE_DEFINITIONS,
    SIMPLE_PANEL_SURFACE_KEYS
} from '../../eve/application/intuition/panel_definitions.js';

const SIMPLE_PANEL_MODULE_FILES = Object.freeze({
    home: 'eve/application/intuition/tools/user.js',
    contact: 'eve/application/intuition/tools/contact.js',
    info: 'eve/application/intuition/tools/infos.js',
    ai: 'eve/application/intuition/tools/AI.js',
    delete: 'eve/application/intuition/tools/delete.js',
    undo: 'eve/application/intuition/tools/undo.js',
    paste: 'eve/application/intuition/tools/paste.js',
    timeline: 'eve/application/intuition/tools/timeline.js',
    background: 'eve/application/intuition/tools/background.js',
    couleur: 'eve/application/intuition/tools/couleur.js',
    size: 'eve/application/intuition/tools/size.js',
    font: 'eve/application/intuition/tools/font.js',
    detail: 'eve/application/intuition/tools/detail.js',
    layer: 'eve/application/intuition/tools/layer.js'
});

const allGroupedKeys = new Set([
    ...SIMPLE_PANEL_SURFACE_KEYS,
    ...COMPLEX_PANEL_SURFACE_KEYS
]);

const escapesRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sourceCreatesSurfaceId = (source, surfaceId) => {
    if (source.includes(`id: '${surfaceId}'`) || source.includes(`id: "${surfaceId}"`)) return true;
    const constPattern = new RegExp(`const\\s+([A-Z0-9_]+)\\s*=\\s*['"]${escapesRegExp(surfaceId)}['"]`);
    const match = source.match(constPattern);
    return !!(match && source.includes(`id: ${match[1]}`));
};

assert.equal(
    allGroupedKeys.size,
    SIMPLE_PANEL_SURFACE_KEYS.length + COMPLEX_PANEL_SURFACE_KEYS.length,
    'panel migration groups must not overlap'
);

for (const key of Object.keys(PANEL_SURFACE_DEFINITIONS)) {
    assert.equal(allGroupedKeys.has(key), true, `${key} must belong to exactly one panel migration group`);
}

for (const key of SIMPLE_PANEL_SURFACE_KEYS) {
    const def = PANEL_SURFACE_DEFINITIONS[key];
    assert.ok(def, `${key} must have a panel definition`);
    assert.equal(def.custom, undefined, `${key} must use standard panel operations`);

    const file = SIMPLE_PANEL_MODULE_FILES[key];
    assert.ok(file, `${key} must have a simple panel module file`);
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes('createEveDialog({'), true, `${key} must use createEveDialog`);
    assert.equal(sourceCreatesSurfaceId(source, def.surface_id), true, `${key} must create ${def.surface_id}`);
}
