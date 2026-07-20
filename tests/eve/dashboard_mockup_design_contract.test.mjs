import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';
import { DASHBOARD_VISUAL_TOKENS } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { readDashboardDefaults } from '../../eVe/domains/dashboard/dashboard_defaults.js';
import { normalizeDashboardCategories } from '../../eVe/domains/dashboard/dashboard_model.js';

const mockupSource = async () => readFile(new URL('../../eVe/R&D/dashboard_design.html', import.meta.url), 'utf8');
const defaultCategories = async () => {
    const raw = await readFile(new URL('../../eVe/default_values/constants.json', import.meta.url), 'utf8');
    return normalizeDashboardCategories(readDashboardDefaults(JSON.parse(raw)).categories);
};

test('dashboard Bevy defaults keep the approved square-cell override over the stable R&D reference', async () => {
    const source = await mockupSource();
    assert.match(source, /let selectedCategory\s*=\s*-1;/);
    assert.match(source, /const HEADER_WIDTH_RATIO\s*=\s*1\.5;/);
    assert.doesNotMatch(source, /HEADER_ADD_RATIO/);
    assert.match(source, /const CELL_EXPAND_DURATION\s*=\s*300;/);
    assert.match(source, /const CONTENT_RADIUS\s*=\s*10;/);
    assert.equal(DASHBOARD_VISUAL_TOKENS.transitions.fullscreenMs, 0);
    assert.equal(DASHBOARD_VISUAL_TOKENS.metrics.contentRadius, 0);
});

test('dashboard JSON palette mirrors the R&D mockup category palette', async () => {
    const source = await mockupSource();
    const categories = await defaultCategories();
    for (const category of categories) {
        assert.equal(source.includes(`color: "${category.color}"`), true, `mockup palette missing ${category.id}:${category.color}`);
    }
});

test('dashboard R&D mockup does not reserve a plus strip on focused header', async () => {
    const source = await mockupSource();
    assert.doesNotMatch(source, /addStripW|drawHeaderPlus|plusCategoryFromPointer|headerAddW/);
});
