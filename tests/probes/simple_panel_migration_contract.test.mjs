import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    COMPLEX_PANEL_SURFACE_KEYS,
    PANEL_SURFACE_DEFINITIONS,
    SIMPLE_PANEL_SURFACE_KEYS
} from '../../eVe/intuition/panel_definitions.js';

const SIMPLE_PANEL_MODULE_FILES = Object.freeze({
    home: 'eVe/intuition/tools/user.js',
    contact: 'eVe/intuition/tools/contact.js',
    info: 'eVe/intuition/tools/infos.js',
    ai: 'eVe/intuition/tools/AI.js',
    delete: 'eVe/intuition/tools/delete/panel_view.js',
    undo: 'eVe/intuition/tools/undo.js',
    paste: 'eVe/intuition/tools/paste.js',
    timeline: 'eVe/intuition/tools/timeline.js',
    background: 'eVe/intuition/tools/background.js',
    couleur: 'eVe/intuition/tools/couleur.js',
    size: 'eVe/intuition/tools/size.js',
    font: 'eVe/intuition/tools/font.js',
    detail: 'eVe/intuition/tools/detail_view.js',
    layer: 'eVe/intuition/tools/layer.js'
});

const allGroupedKeys = new Set([
    ...SIMPLE_PANEL_SURFACE_KEYS,
    ...COMPLEX_PANEL_SURFACE_KEYS
]);

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
    const owningSource = key === 'home'
        ? `${source}\n${readFileSync('eVe/intuition/tools/user_dialogs_runtime.js', 'utf8')}`
        : source;
    const usesStandardPanelPath = owningSource.includes('createEveDialog({')
        || source.includes('openPanelSurface(');
    assert.equal(usesStandardPanelPath, true, `${key} must use the standard dialog or panel API`);
    assert.ok(def.surface_id, `${key} must keep one canonical surface id`);
}
