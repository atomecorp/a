import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizePanelStatePresentation } from '../../atome/src/squirrel/components/panel_state_contract.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { INTERACTIVE_KINDS, SUPPORTED_KINDS } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';
import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';
import { panelStateNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_state.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';

const findNode = (node, id) => {
    if (Array.isArray(node)) return node.map((child) => findNode(child, id)).find(Boolean) || null;
    if (!node) return null;
    if (node.id === id) return node;
    return (node.children || []).map((child) => findNode(child, id)).find(Boolean) || null;
};

const everyNode = (node, predicate) => {
    if (!node) return true;
    if (!predicate(node)) return false;
    return (node.children || []).every((child) => everyNode(child, predicate));
};

test('canonical Squirrel panel-state contract requires a supported status and localized display text', () => {
    const presentation = normalizePanelStatePresentation({ status: 'error', title: 'Unable to load', message: 'Please try again later.' });

    assert.deepEqual(presentation, { status: 'error', title: 'Unable to load', message: 'Please try again later.' });
    assert.throws(() => normalizePanelStatePresentation({ status: 'unknown', title: 'Title', message: 'Message' }), /squirrel_panel_state_status_unsupported:unknown/);
    assert.throws(() => normalizePanelStatePresentation({ status: 'empty', title: '', message: 'Message' }), /squirrel_panel_state_title_required/);
    assert.throws(() => normalizePanelStatePresentation({ status: 'empty', title: 'Title', message: '' }), /squirrel_panel_state_message_required/);
});

test('shared panel-state builder uses the passive native empty_state kind and token-owned semantic tones', () => {
    const state = panelStateNode({ id: 'permission', status: 'permission_denied', title: 'Access denied', message: 'You are not allowed to view this content.' });
    const title = findNode(state, 'permission_title');
    const message = findNode(state, 'permission_message');

    assert.equal(state.kind, 'empty_state');
    assert.equal(SUPPORTED_KINDS.has(state.kind), true);
    assert.equal(INTERACTIVE_KINDS.has(state.kind), false);
    assert.deepEqual(state.style.size, [358, 72]);
    assert.equal(state.on, undefined);
    assert.equal(title.text, 'Access denied');
    assert.equal(message.text, 'You are not allowed to view this content.');
    assert.deepEqual(title.style.color, BEVY_PANEL_TOKENS.state.tones.permission_denied.title);
    assert.deepEqual(message.style.color, BEVY_PANEL_TOKENS.state.tones.permission_denied.message);
    assert.equal(everyNode(state, (node) => node.on === undefined), true);
});
