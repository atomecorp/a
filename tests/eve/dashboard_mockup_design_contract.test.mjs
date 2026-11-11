import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { DASHBOARD_VISUAL_TOKENS } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { EVE_COMMON_SKIN_TOKENS } from '../../eVe/elements/skin/tokens.js';
import { readDashboardDefaults } from '../../eVe/domains/dashboard/dashboard_defaults.js';
import { normalizeDashboardCategories } from '../../eVe/domains/dashboard/dashboard_model.js';
import { SYSTEM_UI_METRICS } from '../../eVe/elements/system_ui_tokens.js';
import { DASHBOARD_TILE_LABEL_MAX, dashboardLabelBandText } from '../../eVe/domains/dashboard/dashboard_creation_records.js';

const mockupSource = async () => readFile(new URL('../../eVe/R&D/dashboard_design.html', import.meta.url), 'utf8');
const defaultCategories = async () => {
    const raw = await readFile(new URL('../../eVe/default_values/constants.json', import.meta.url), 'utf8');
    return normalizeDashboardCategories(readDashboardDefaults(JSON.parse(raw)).categories);
};

test('dashboard Bevy defaults keep the approved glass-grid override over the historical R&D reference', async () => {
    const source = await mockupSource();
    assert.match(source, /let selectedCategory\s*=\s*-1;/);
    assert.match(source, /const HEADER_WIDTH_RATIO\s*=\s*1\.5;/);
    assert.doesNotMatch(source, /HEADER_ADD_RATIO/);
    assert.match(source, /const CELL_EXPAND_DURATION\s*=\s*300;/);
    assert.match(source, /const CONTENT_RADIUS\s*=\s*10;/);
    assert.equal(DASHBOARD_VISUAL_TOKENS.transitions, undefined);
    // The charter's one radius (3 px) and its gap, a twelfth of a tool (5 px, AGENTS.md rule 14); lanes keep no gap of their own.
    assert.equal(DASHBOARD_VISUAL_TOKENS.metrics.contentRadius, SYSTEM_UI_METRICS.radiusPx);
    assert.equal(DASHBOARD_VISUAL_TOKENS.metrics.contentRadius, 3);
    assert.equal(DASHBOARD_VISUAL_TOKENS.metrics.gap, SYSTEM_UI_METRICS.unitPx / 12);
    assert.equal(DASHBOARD_VISUAL_TOKENS.metrics.gap, 5);
    assert.equal(DASHBOARD_VISUAL_TOKENS.metrics.laneGap, undefined);
    assert.equal(DASHBOARD_VISUAL_TOKENS.contentGlass, undefined);
    assert.deepEqual(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.backdrop,{blurPx:16,tint:[4/255,9/255,26/255,.69]});
});

test('dashboard JSON palette mirrors the R&D mockup category palette', async () => {
    const source = await mockupSource();
    const categories = await defaultCategories();
    for (const category of categories) {
        assert.equal(source.includes(`color: "${category.color}"`), true, `mockup palette missing ${category.id}:${category.color}`);
    }
});

test('dashboard defaults expose the canonical bottom-anchored order and ordinary label contract', async () => {
    const categories = await defaultCategories();
    assert.deepEqual(categories.map((category) => category.id),
        ['calendar', 'news', 'contacts', 'monitor', 'projects']);
    // A card's short text: one step over the base size (12 x 1.3), never fitted; the cut belongs to the one tile
    // label (9 characters, then « … », EVE_COMMON_SKIN_TOKENS.tileLabel).
    assert.equal(DASHBOARD_VISUAL_TOKENS.labelText.font_size, SYSTEM_UI_METRICS.textStepPx(1));
    assert.equal(DASHBOARD_VISUAL_TOKENS.labelText.font_size, 15.6);
    assert.deepEqual(Object.keys(DASHBOARD_VISUAL_TOKENS.labelText), ['font_size']);
    assert.equal(EVE_COMMON_SKIN_TOKENS.tileLabel.max_characters, 9);
    assert.equal(DASHBOARD_TILE_LABEL_MAX, 9);
    const size = DASHBOARD_VISUAL_TOKENS.labelText.font_size;
    assert.equal(dashboardLabelBandText('Synchronisation', 1000, 0, { size, max: DASHBOARD_TILE_LABEL_MAX }), 'Synchroni…');
    assert.equal(dashboardLabelBandText('Agenda', 1000, 0, { size, max: DASHBOARD_TILE_LABEL_MAX }), 'Agenda');
});

test('dashboard R&D mockup does not reserve a plus strip on focused header', async () => {
    const source = await mockupSource();
    assert.doesNotMatch(source, /addStripW|drawHeaderPlus|plusCategoryFromPointer|headerAddW/);
});
