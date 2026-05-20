import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PANEL_SURFACE_DEFINITIONS } from '../../eve/application/intuition/panel_definitions.js';

const TARGET_PANEL_FILES = Object.freeze({
    home: 'eve/application/intuition/tools/user.js',
    finder: 'eve/application/intuition/tools/finder.js',
    communicate: 'eve/application/intuition/tools/communication.js',
    calendar: 'eve/application/intuition/tools/calendar.js'
});

const TARGET_PANEL_KEYS = Object.freeze([
    'home',
    'finder',
    'communicate',
    'calendar',
    'mtrack'
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

const mtrackDef = PANEL_SURFACE_DEFINITIONS.mtrack;
const mtrackDialogRuntime = readFileSync('eve/application/domains/mtrax/ui/panel_dialog_runtime.js', 'utf8');
const mtrackEmbedRuntime = readFileSync('eve/application/domains/mtrax/ui/panel_embed_bootstrap_runtime.js', 'utf8');
const mtrackToolSource = readFileSync('eve/application/intuition/tools/mtrack.js', 'utf8');

assert.equal(mtrackDef.custom, true, 'mtrack must remain a custom complex panel in the registry');
assert.equal(mtrackDialogRuntime.includes('createEveDialog({'), true, 'mtrack dialog runtime must create the panel through createEveDialog');
assert.equal(mtrackDialogRuntime.includes('id: mtrackDialogId'), true, 'mtrack dialog runtime must bind the injected canonical surface id');
assert.equal(mtrackEmbedRuntime.includes('createPanelDialogRuntime({'), true, 'mtrack embed runtime must own the panel dialog runtime');
assert.equal(mtrackToolSource.includes('mtrackDialogId: MTRACK_DIALOG_ID'), true, 'mtrack tool must pass the canonical MTrack dialog id');
assert.equal(mtrackDef.surface_id, 'eve_mtrack_dialog', 'mtrack registry surface id must match the canonical dialog id');
