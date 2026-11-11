// Swipe-up navigation of the Dashboard (user request of 2 Nov. 2026): the gesture is read from where it starts.
// - a field's swipe (`panelTextFieldSwipe`): its press waits, a vertical travel grows or folds it and never moves its caret;
// - the ground's swipe (`bevyPanelSwipeHandlers` with `vertical`): told only when asked;
// - a rubric's ground (the Mystic grid's root): a swipe up goes home, a still lift is Back, a lift elsewhere chooses as before.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { panelTextFieldSwipe } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_editable_text.js';
import { bevyPanelSwipeHandlers, createBevyPanelTileGesture, TILE_SWIPE_MIN_PX } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tile_gesture.js';
import { bevyUiMysticItemHandlers } from '../../eVe/intuition/ribbon/bevy_ui_mystic_item_handlers.js';
import { BEVY_MYSTIC_ROOT_ID } from '../../eVe/intuition/ribbon/bevy_ui_mystic_model.js';
import { MYSTIC_PHASE } from '../../eVe/intuition/ribbon/bevy_ui_mystic_motion.js';
import { slidesUp } from '../../eVe/domains/dashboard/dashboard_footer_navigation.js';

const at = (x, y) => ({ client_x: x, client_y: y });
const field = () => {
    const emitted = [], swipes = [];
    const emit = panelTextFieldSwipe((intent) => { emitted.push(intent.type); return { ok: true }; }, direction => swipes.push(direction));
    return { emit, emitted, swipes };
};

test('a field swiped up grows once; its press and drags never reach the field (the caret stays)', () => {
    const { emit, emitted, swipes } = field();
    emit({ type: 'home.field.press', event: at(100, 500) });
    emit({ type: 'home.field.drag', event: at(101, 495) });
    emit({ type: 'home.field.drag', event: at(102, 500 - TILE_SWIPE_MIN_PX - 20) });
    emit({ type: 'home.field.drag', event: at(102, 300) });
    assert.deepEqual(swipes, ['up']);
    assert.deepEqual(emitted, []);
});

test('a field swiped down folds; a tap still presses then focuses; a sideways travel is the field\'s own', () => {
    const down = field();
    down.emit({ type: 'f.field.press', event: at(50, 100) });
    down.emit({ type: 'f.field.drag', event: at(52, 100 + TILE_SWIPE_MIN_PX + 5) });
    assert.deepEqual(down.swipes, ['down']);
    const tap = field();
    tap.emit({ type: 'f.field.press', event: at(50, 100) });
    tap.emit({ type: 'f.field.focus', event: at(50, 100) });
    assert.deepEqual(tap.emitted, ['f.field.press', 'f.field.focus']);
    assert.deepEqual(tap.swipes, []);
    const sideways = field();
    sideways.emit({ type: 'f.field.press', event: at(50, 100) });
    sideways.emit({ type: 'f.field.drag', event: at(50 + TILE_SWIPE_MIN_PX + 10, 104) });
    assert.deepEqual(sideways.emitted, ['f.field.press', 'f.field.drag']);
    assert.deepEqual(sideways.swipes, []);
});

test('the ground tells a vertical swipe only when asked, a sideways one as before', () => {
    const told = [], plain = [];
    const vertical = bevyPanelSwipeHandlers(createBevyPanelTileGesture(), 'ground', d => told.push(d), { vertical: true });
    const sideways = bevyPanelSwipeHandlers(createBevyPanelTileGesture(), 'ground', d => plain.push(d));
    for (const handlers of [vertical, sideways]) {
        handlers.press(at(200, 600));
        handlers.release(at(204, 400));
        handlers.press(at(200, 600));
        handlers.release(at(203, 598));
    }
    assert.deepEqual(told, ['up']);
    assert.deepEqual(plain, []);
});

test('a band tool slides up only when the first travel goes up', () => {
    assert.equal(slidesUp({ dx: 3, dy: -12 }), true);
    assert.equal(slidesUp({ dx: 15, dy: -12 }), false);
    assert.equal(slidesUp({ dx: 0, dy: 12 }), false);
});

const groundHandlers = ({ turning = false } = {}) => {
    const calls = [];
    const state = { grid: {}, phase: MYSTIC_PHASE.open, stack: [], surfaceEpoch: 1 };
    const grid = {
        pressPersistent: () => false, dragPersistent: () => false, releasePersistent: () => false, cancelPersistent: () => {},
        navigate: direction => calls.push(`navigate:${direction}`), home: () => { calls.push('home'); return true; },
        swipeHandlers: { press: () => calls.push('swipe:press'), drag: () => {}, release: () => calls.push('swipe:release'), cancel: () => {},
            turning: () => turning },
        cancelSwipe: () => calls.push('swipe:cancel')
    };
    const handlers = bevyUiMysticItemHandlers({ state, grid, close: () => calls.push('close'), isOriginatingHoldPress: () => false,
        updateHover: () => null, releaseAt: () => calls.push('releaseAt'), releaseCentreHold: () => {}, pressCentre: () => {},
        activateCentre: () => {}, activateItem: () => {}, returnToRoot: () => {}, activateLongPress: () => {} }).itemHandlers([]);
    return { root: handlers[BEVY_MYSTIC_ROOT_ID], calls };
};

// The ground's lift where it began is the band's Back (user, 28 Oct. 2026); a drag from the ground is navigation on its
// one axis, the pages (rule 20): never a plate chosen where it lifts, never the menu closed (bevy_ui_mystic_item_handlers.js).
test('on a rubric\'s ground a still lift is Back, a page turn is the swipe\'s, and no drag chooses where it lands', () => {
    const still = groundHandlers();
    still.root.press(at(100, 500)); still.root.release(at(102, 503));
    assert.deepEqual(still.calls, ['swipe:press', 'swipe:cancel', 'navigate:back']);
    const turn = groundHandlers({ turning: true });
    turn.root.press(at(300, 500)); turn.root.release(at(120, 504));
    assert.deepEqual(turn.calls, ['swipe:press', 'swipe:release']);
    for (const [from, to] of [[at(100, 500), at(104, 380)], [at(100, 300), at(104, 420)]]) {
        const drag = groundHandlers();
        drag.root.press(from); drag.root.release(to);
        assert.deepEqual(drag.calls, ['swipe:press', 'swipe:cancel']);
    }
});
