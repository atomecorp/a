import assert from 'node:assert/strict';
import { test } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    INLINE_EDIT_MODES,
    INLINE_EDIT_OPENED_BY,
    INLINE_EDIT_STATUS,
    cancelInlineEditSession,
    commitInlineEditSession,
    createInlineEditSession,
    readInlineEditFocusRestoration,
    updateInlineEditDraft,
    updateInlineEditOverlayAnchor
} from '../../eVe/domains/rendering/inline_edit_session.js';

const baseSessionInput = () => ({
    session_id: 'inline_session_1',
    project_id: 'project_inline',
    atom_id: 'text_atom',
    mode: INLINE_EDIT_MODES.text,
    opened_by: INLINE_EDIT_OPENED_BY.keyboard,
    initial_value: 'Initial text',
    focus_origin: {
        surface_id: 'project_surface',
        focus_order: 2
    },
    overlay_anchor: {
        x: 12,
        y: 24,
        width: 160,
        height: 40,
        coordinate_space: 'project'
    },
    tx_id: 'tx_inline_edit_1',
    gesture_id: 'gesture_inline_edit_1',
    selection_snapshot: {
        selected_atom_ids: ['text_atom'],
        caret: 7
    }
});

test('InlineEditSession opens as immutable pure state with explicit ownership fields', () => {
    const session = createInlineEditSession(baseSessionInput());

    assert.equal(session.status, INLINE_EDIT_STATUS.open);
    assert.equal(session.project_id, 'project_inline');
    assert.equal(session.atom_id, 'text_atom');
    assert.equal(session.draft_value, 'Initial text');
    assert.equal(session.changed, false);
    assert.equal(Object.isFrozen(session), true);
    assert.equal(Object.isFrozen(session.focus_origin), true);
    assert.equal(Object.isFrozen(session.overlay_anchor), true);
    assert.throws(() => {
        session.draft_value = 'mutated';
    }, /read only property|object is not extensible/);
});

test('InlineEditSession updates draft and overlay anchor without mutating the prior session', () => {
    const session = createInlineEditSession(baseSessionInput());
    const drafted = updateInlineEditDraft(session, 'Edited text');
    const moved = updateInlineEditOverlayAnchor(drafted, {
        x: 40,
        y: 80,
        width: 200,
        height: 48,
        coordinate_space: 'project'
    });

    assert.equal(session.draft_value, 'Initial text');
    assert.equal(drafted.draft_value, 'Edited text');
    assert.equal(drafted.changed, true);
    assert.equal(moved.overlay_anchor.x, 40);
    assert.equal(moved.draft_value, 'Edited text');
    assert.equal(Object.isFrozen(moved.overlay_anchor), true);
});

test('InlineEditSession commits and exposes focus restoration without side effects', () => {
    const session = updateInlineEditDraft(createInlineEditSession(baseSessionInput()), 'Committed text');
    const committed = commitInlineEditSession(session);
    const restoration = readInlineEditFocusRestoration(committed);

    assert.equal(committed.status, INLINE_EDIT_STATUS.committed);
    assert.equal(committed.changed, true);
    assert.equal(committed.draft_value, 'Committed text');
    assert.equal(committed.tx_id, 'tx_inline_edit_1');
    assert.deepEqual(restoration, {
        project_id: 'project_inline',
        atom_id: 'text_atom',
        focus_origin: {
            surface_id: 'project_surface',
            focus_order: 2
        },
        selection_snapshot: {
            selected_atom_ids: ['text_atom'],
            caret: 7
        }
    });
    assert.throws(() => updateInlineEditDraft(committed, 'late edit'), /inline_edit_session_closed:committed/);
});

test('InlineEditSession cancels while preserving draft, initial value, and selection snapshot', () => {
    const session = updateInlineEditDraft(createInlineEditSession({
        ...baseSessionInput(),
        mode: INLINE_EDIT_MODES.rename,
        opened_by: INLINE_EDIT_OPENED_BY.pointer,
        initial_value: { label: 'Before' },
        draft_value: { label: 'During' }
    }), { label: 'Cancelled draft' });
    const cancelled = cancelInlineEditSession(session);

    assert.equal(cancelled.status, INLINE_EDIT_STATUS.cancelled);
    assert.deepEqual(cancelled.initial_value, { label: 'Before' });
    assert.deepEqual(cancelled.draft_value, { label: 'Cancelled draft' });
    assert.equal(cancelled.changed, true);
    assert.throws(() => commitInlineEditSession(cancelled), /inline_edit_session_closed:cancelled/);
});

test('InlineEditSession rejects missing ids, unsupported modes, and DOM-owned state', () => {
    const dom = new JSDOM('<!doctype html><main id="project"></main>');
    assert.throws(() => createInlineEditSession({
        ...baseSessionInput(),
        tx_id: ''
    }), /inline_edit_tx_id_required/);
    assert.throws(() => createInlineEditSession({
        ...baseSessionInput(),
        mode: 'draw'
    }), /inline_edit_mode_invalid:draw/);
    assert.throws(() => createInlineEditSession({
        ...baseSessionInput(),
        opened_by: 'double_click'
    }), /inline_edit_opened_by_invalid:double_click/);
    assert.throws(() => createInlineEditSession({
        ...baseSessionInput(),
        focus_origin: {
            element: dom.window.document.getElementById('project')
        }
    }), /inline_edit_data_dom_forbidden:focus_origin.element/);
    assert.throws(() => createInlineEditSession({
        ...baseSessionInput(),
        overlay_anchor: {
            read: () => ({ x: 0, y: 0 })
        }
    }), /inline_edit_data_invalid:overlay_anchor.read/);
});
