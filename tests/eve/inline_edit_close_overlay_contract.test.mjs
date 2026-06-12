import assert from 'node:assert/strict';
import test from 'node:test';

import {
    INLINE_EDIT_MODES,
    INLINE_EDIT_OPENED_BY,
    INLINE_EDIT_STATUS,
    createInlineEditSession
} from '../../eVe/domains/rendering/inline_edit_session.js';
import {
    INLINE_EDIT_CLOSE_OVERLAY_ACTIONS,
    INLINE_EDIT_CLOSE_OVERLAY_VERSION,
    applyInlineEditCloseOverlayAction,
    createInlineEditCloseOverlay,
    resolveInlineEditCloseOverlayAction
} from '../../eVe/domains/rendering/inline_edit_close_overlay.js';

const createSession = (overrides = {}) => createInlineEditSession({
    session_id: 'inline_close_session',
    project_id: 'project_close_overlay',
    atom_id: 'text_close_overlay',
    mode: INLINE_EDIT_MODES.rename,
    opened_by: INLINE_EDIT_OPENED_BY.keyboard,
    initial_value: { label: 'Before' },
    draft_value: { label: 'After' },
    focus_origin: {
        bridge_id: 'bridge_close_overlay',
        bridge_node_id: 'text_close_overlay',
        focus_order_index: 2
    },
    overlay_anchor: {
        x: 10,
        y: 20,
        width: 180,
        height: 34,
        coordinate_space: 'project'
    },
    tx_id: 'tx_inline_close_overlay',
    selection_snapshot: {
        selected_atom_ids: ['text_close_overlay']
    },
    ...overrides
});

test('InlineEditCloseOverlay is disposable session metadata, not an Atome or DOM projection', () => {
    const session = createSession();
    const overlay = createInlineEditCloseOverlay(session);
    const serialized = JSON.stringify(overlay);

    assert.equal(overlay.version, INLINE_EDIT_CLOSE_OVERLAY_VERSION);
    assert.equal(overlay.kind, 'inline_edit_close_overlay');
    assert.equal(overlay.disposable, true);
    assert.equal(overlay.persistent, false);
    assert.equal(overlay.session_id, session.session_id);
    assert.equal(overlay.atom_id, session.atom_id);
    assert.deepEqual(overlay.anchor, session.overlay_anchor);
    assert.equal(overlay.type, undefined);
    assert.equal(overlay.properties, undefined);
    assert.equal(serialized.includes('data-atome-id'), false);
    assert.equal(serialized.includes('selector'), false);
    assert.equal(serialized.includes('element'), false);
});

test('InlineEditCloseOverlay maps close activation and Escape to cancel with focus restoration', () => {
    const session = createSession();
    const pointer = applyInlineEditCloseOverlayAction(session, {
        source: INLINE_EDIT_OPENED_BY.pointer,
        action: 'close'
    });
    const keyboard = applyInlineEditCloseOverlayAction(session, {
        source: INLINE_EDIT_OPENED_BY.keyboard,
        key: 'Escape'
    });

    assert.equal(pointer.action, INLINE_EDIT_CLOSE_OVERLAY_ACTIONS.cancel);
    assert.equal(pointer.session.status, INLINE_EDIT_STATUS.cancelled);
    assert.deepEqual(pointer.focus_restoration, {
        project_id: 'project_close_overlay',
        atom_id: 'text_close_overlay',
        focus_origin: {
            bridge_id: 'bridge_close_overlay',
            bridge_node_id: 'text_close_overlay',
            focus_order_index: 2
        },
        selection_snapshot: {
            selected_atom_ids: ['text_close_overlay']
        }
    });
    assert.equal(keyboard.action, INLINE_EDIT_CLOSE_OVERLAY_ACTIONS.cancel);
    assert.equal(keyboard.reason, 'keyboard_escape');
});

test('InlineEditCloseOverlay maps Enter, touch, and accessibility activation deterministically', () => {
    const renameSession = createSession();
    const textSession = createSession({
        mode: INLINE_EDIT_MODES.text,
        initial_value: 'Before',
        draft_value: 'After'
    });

    const renameEnter = applyInlineEditCloseOverlayAction(renameSession, {
        source: INLINE_EDIT_OPENED_BY.keyboard,
        key: 'Enter'
    });
    const textEnter = resolveInlineEditCloseOverlayAction(textSession, {
        source: INLINE_EDIT_OPENED_BY.keyboard,
        key: 'Enter'
    });
    const textSubmitEnter = applyInlineEditCloseOverlayAction(textSession, {
        source: INLINE_EDIT_OPENED_BY.keyboard,
        key: 'Enter',
        ctrlKey: true
    });
    const touchClose = applyInlineEditCloseOverlayAction(renameSession, {
        source: INLINE_EDIT_OPENED_BY.touch,
        gesture: 'tap_close'
    });
    const accessibilityCommit = applyInlineEditCloseOverlayAction(renameSession, {
        source: INLINE_EDIT_OPENED_BY.accessibilityAction,
        action: 'activate'
    });

    assert.equal(renameEnter.action, INLINE_EDIT_CLOSE_OVERLAY_ACTIONS.commit);
    assert.equal(renameEnter.session.status, INLINE_EDIT_STATUS.committed);
    assert.equal(textEnter.action, INLINE_EDIT_CLOSE_OVERLAY_ACTIONS.none);
    assert.equal(textEnter.reason, 'keyboard_noop');
    assert.equal(textSubmitEnter.action, INLINE_EDIT_CLOSE_OVERLAY_ACTIONS.commit);
    assert.equal(touchClose.action, INLINE_EDIT_CLOSE_OVERLAY_ACTIONS.cancel);
    assert.equal(touchClose.reason, 'touch_cancel');
    assert.equal(accessibilityCommit.action, INLINE_EDIT_CLOSE_OVERLAY_ACTIONS.commit);
    assert.equal(accessibilityCommit.reason, 'accessibility_action_commit');
});

test('InlineEditCloseOverlay rejects closed sessions', () => {
    const closed = applyInlineEditCloseOverlayAction(createSession(), {
        source: INLINE_EDIT_OPENED_BY.keyboard,
        key: 'Escape'
    }).session;

    assert.throws(
        () => createInlineEditCloseOverlay(closed),
        /inline_edit_close_overlay_session_closed:cancelled/
    );
});
