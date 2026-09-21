import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeMediaCardPresentation } from '../../atome/src/squirrel/components/media_card_contract.js';
import { normalizeSelectionSummaryPresentation } from '../../atome/src/squirrel/components/selection_summary_contract.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { INTERACTIVE_KINDS, SUPPORTED_KINDS } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import { mediaCardNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_media_card.js';
import { selectionSummaryNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_selection_summary.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

const passiveTree = (node) => !node || (node.on === undefined && (node.children || []).every(passiveTree));

test('canonical passive-batch contracts validate media presentation and selection context independently', () => {
    assert.deepEqual(normalizeMediaCardPresentation({
        status: 'ready', title: 'Media card', message: 'Shared renderer thumbnail', source: './assets/images/icons/photo.svg', accessibilityLabel: 'Media card preview'
    }), {
        status: 'ready', title: 'Media card', message: 'Shared renderer thumbnail', source: './assets/images/icons/photo.svg', accessibilityLabel: 'Media card preview'
    });
    assert.throws(() => normalizeMediaCardPresentation({ status: 'ready', title: 'Title', message: 'Message', accessibilityLabel: 'Label' }), /squirrel_media_card_source_required/);
    assert.throws(() => normalizeMediaCardPresentation({ status: 'unknown', title: 'Title', message: 'Message', accessibilityLabel: 'Label' }), /squirrel_media_card_status_unsupported:unknown/);
    assert.deepEqual(normalizeSelectionSummaryPresentation({ title: 'Selection', summary: 'Three items selected', count: 3 }), { title: 'Selection', summary: 'Three items selected', count: 3 });
    assert.throws(() => normalizeSelectionSummaryPresentation({ title: 'Selection', summary: 'Summary', count: -1 }), /squirrel_selection_summary_count_nonnegative_integer_required/);
});

test('media card and selection summary compose passive native trees from shared panel tokens', () => {
    const media = mediaCardNode({
        id: 'media', status: 'ready', title: 'Media card', message: 'Shared renderer thumbnail', source: './assets/images/icons/photo.svg', accessibilityLabel: 'Media card preview'
    });
    const loading = mediaCardNode({ id: 'loading', status: 'loading', title: 'Loading media', message: 'Media is loading.', accessibilityLabel: 'Media card loading' });
    const summary = selectionSummaryNode({ id: 'summary', title: 'Selection', summary: 'Three items selected', count: 3 });

    [media, loading, summary].forEach((component) => {
        assert.equal(component.kind, 'panel');
        assert.equal(SUPPORTED_KINDS.has(component.kind), true);
        assert.equal(INTERACTIVE_KINDS.has(component.kind), false);
        assert.equal(passiveTree(component), true);
    });
    assert.deepEqual(media.style.size, [358, 128]);
    assert.deepEqual(findNode(media, 'media_thumbnail').style.size, [108, 108]);
    assert.equal(findNode(media, 'media_thumbnail').image.fit, 'cover');
    assert.equal(findNode(loading, 'loading_state').kind, 'empty_state');
    assert.deepEqual(findNode(loading, 'loading_state').style.position, [0, 28]);
    assert.deepEqual(summary.style.size, [358, 64]);
    assert.equal(findNode(summary, 'summary_count').text, '3');
    assert.deepEqual(media.style.background, BEVY_PANEL_TOKENS.mediaCard.background);
    assert.deepEqual(summary.style.background, BEVY_PANEL_TOKENS.selectionSummary.background);
});
