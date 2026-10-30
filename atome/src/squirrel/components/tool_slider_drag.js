// Canonical slider-tool interaction semantics (shared by the Bevy tool slider).
const TOOL_SLIDER_DRAG_THRESHOLD_PX = 4;
import { normalizeSliderRange, quantizeSliderValue as quantize } from './slider_contract.js';
import { isNaturalNumber } from '../../shared/natural_numbers.js';
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// The value a finger gives `travel` px from its press (from `start`), the whole range lying along `length` px: the gauge
// follows the finger whatever the number of values (user, 2026-10-30, Q10). With `natural`, a natural value (a Fibonacci
// number or a multiple of 3, AGENTS.md rule 19) holds the finger a little: its place along the length is twice an
// ordinary value's, one step's extra travel to pass it, the whole range still lying along `length`.
const travelledSliderValue = (start, travel, length, config = {}, natural = false) => {
    const { min, max, step } = normalizeSliderRange(config), span = Math.max(1, finite(length, 1));
    if (!natural) return quantize(finite(start, min) + (finite(travel) / span) * (max - min), config);
    const count = Math.round((max - min) / step) + 1, indexOf = value => Math.round((value - min) / step);
    const stops = [];
    for (let value = Math.max(1, Math.ceil(min)); value <= max; value += 1) {
        if (isNaturalNumber(value) && Math.abs((value - min) / step - indexOf(value)) < 1e-6) stops.push(indexOf(value));
    }
    // The shares of the length before the value of `index`: one a value, two a natural one.
    const before = index => index + stops.filter(stop => stop < index).length, total = count + stops.length;
    const from = indexOf(quantize(start, config)), held = stops.includes(from) ? 2 : 1;
    const at = Math.min(total - 1e-9, Math.max(0, before(from) + held / 2 + finite(travel) * total / span));
    let low = 0, high = count - 1;
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (before(middle) <= at) low = middle; else high = middle - 1; }
    return quantize(min + low * step, config);
};

// The one gesture of every tool slider (user rule): a press opens it; a drag past the threshold
// sets the value relatively and, on release, closes it again unless it was pinned; a click
// (no drag) on a closed slider pins it open, a click anywhere on a pinned one closes it.
// Cancel restores the starting value and the open state the press found.
const beginToolSliderSession = (value, config = {}, options = {}) => {
    const startValue = quantize(value, config);
    const pinned = options.pinned === true && options.expanded === true;
    return { state: 'pressed', expanded: true, pinned, wasPinned: pinned, value: startValue, startValue, delta: 0, dragged: false };
};

// `natural`: natural values hold the finger a little (#travelledSliderValue).
const dragToolSliderSession = (session = {}, delta = 0, travelPx = 1, config = {}, { natural = false } = {}) => {
    if (session.state !== 'pressed' && session.state !== 'dragging') return session;
    const nextDelta = finite(session.delta, 0) + finite(delta, 0);
    const dragged = session.dragged === true || Math.abs(nextDelta) >= TOOL_SLIDER_DRAG_THRESHOLD_PX;
    if (!dragged) return { ...session, delta: nextDelta };
    return {
        ...session, state: 'dragging', delta: nextDelta, dragged: true,
        value: travelledSliderValue(finite(session.startValue, finite(config.min, 0)), nextDelta, travelPx, config, natural)
    };
};

const releaseToolSliderSession = (session = {}, { cancelled = false } = {}) => {
    const wasPinned = session.wasPinned === true;
    // A drag (or a cancel) gives back the open state the press found; a click toggles it.
    const pinned = cancelled || session.dragged === true ? wasPinned : !wasPinned;
    return {
        ...session, state: pinned ? 'pinned' : 'collapsed', expanded: pinned, pinned,
        ...(cancelled ? { value: finite(session.startValue, session.value), dragged: false } : {})
    };
};

const createDirectSliderDragController = ({
    input,
    hitzone,
    expandedLength, useTrackLength = false,
    orientation = 'horizontal',
    step,
    min,
    max,
    initialValue,
    quantizeSliderValue,
    syncInputValue,
    commitInputValue,
    isPinned,
    pinAfterClick,
    openForTransientDrag,
    collapseAfterTransientDrag,
    stopAndPrevent,
    onStart,
    onEnd
} = {}) => {
    let dragSession = null;

    const clear = () => {
        if (!dragSession || typeof window === 'undefined') {
            dragSession = null;
            return;
        }
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('pointerup', onPointerUp, true);
        window.removeEventListener('pointercancel', onPointerCancel, true);
        input.removeEventListener('lostpointercapture', onPointerCancel, true);
        try {
            if (Number.isFinite(dragSession.pointerId)) {
                input.releasePointerCapture?.(dragSession.pointerId);
            }
        } catch (_) { }
        dragSession = null;
    };

    const vertical = orientation === 'vertical';
    const resolveTrackLength = () => {
        const inputRect = input.getBoundingClientRect?.();
        const hitzoneRect = hitzone.getBoundingClientRect?.();
        if (useTrackLength) return Math.max(1, Number(vertical ? inputRect?.height : inputRect?.width) || expandedLength);
        return Math.max(
            1,
            Number(vertical ? inputRect?.height : inputRect?.width) || 0,
            Number(vertical ? hitzoneRect?.height : hitzoneRect?.width) || 0,
            expandedLength
        );
    };

    const readValue = (clientX, clientY) => {
        if (!dragSession) return null;
        const delta = vertical
            ? Number(dragSession.startY || 0) - Number(clientY)
            : Number(clientX) - Number(dragSession.startX || 0);
        const range = Math.max(step, max - min);
        const deltaRatio = delta / Math.max(1, dragSession.trackLength || expandedLength);
        return quantizeSliderValue(Number(dragSession.startValue || initialValue) + (deltaRatio * range));
    };

    const begin = (event) => {
        if (Number(event?.button || 0) !== 0 || dragSession) return;
        stopAndPrevent(event);
        openForTransientDrag();
        dragSession = {
            pointerId: Number.isFinite(Number(event?.pointerId)) ? Number(event.pointerId) : null,
            startX: Number(event?.clientX) || 0,
            startY: Number(event?.clientY) || 0,
            startValue: quantizeSliderValue(input.value),
            trackLength: resolveTrackLength(),
            moved: false,
            startNotified: false,
            wasPinned: isPinned() === true
        };
        try {
            if (Number.isFinite(dragSession.pointerId)) {
                input.setPointerCapture?.(dragSession.pointerId);
            }
        } catch (_) { }
        if (typeof window !== 'undefined') {
            window.addEventListener('pointermove', onPointerMove, true);
            window.addEventListener('pointerup', onPointerUp, true);
            window.addEventListener('pointercancel', onPointerCancel, true);
            input.addEventListener('lostpointercapture', onPointerCancel, true);
        }
    };

    function onPointerMove(event) {
        if (!dragSession) return;
        if (Number.isFinite(dragSession.pointerId) && Number(event?.pointerId) !== dragSession.pointerId) return;
        const dx = Number(event?.clientX) - Number(dragSession.startX || 0);
        const dy = Number(event?.clientY) - Number(dragSession.startY || 0);
        if (!dragSession.moved && Math.hypot(dx, dy) < TOOL_SLIDER_DRAG_THRESHOLD_PX) return;
        if (!dragSession.startNotified && typeof onStart === 'function') {
            dragSession.startNotified = true;
            onStart({
                value: dragSession.startValue,
                pointerType: String(event?.pointerType || '').trim() || 'unknown'
            });
        }
        const nextValue = readValue(event?.clientX, event?.clientY);
        if (!Number.isFinite(nextValue)) return;
        dragSession.moved = true;
        stopAndPrevent(event);
        syncInputValue(nextValue, 'slider.direct.drag');
    }

    function onPointerUp(event) {
        if (!dragSession) return;
        if (Number.isFinite(dragSession.pointerId) && Number(event?.pointerId) !== dragSession.pointerId) return;
        const moved = dragSession.moved === true;
        const wasPinned = dragSession.wasPinned === true;
        let finalValue = quantizeSliderValue(input.value);
        if (moved) {
            stopAndPrevent(event);
            const nextValue = readValue(event?.clientX, event?.clientY);
            finalValue = commitInputValue(Number.isFinite(nextValue) ? nextValue : input.value, 'slider.direct.drag');
        }
        clear();
        if (!moved) {
            if (!wasPinned) pinAfterClick?.();
            return;
        }
        if (typeof onEnd === 'function') {
            onEnd({
                value: finalValue,
                cancelled: false,
                moved,
                pointerType: String(event?.pointerType || '').trim() || 'unknown',
                pinned: wasPinned
            });
        }
        if (!wasPinned) collapseAfterTransientDrag();
    }

    function onPointerCancel(event) {
        if (!dragSession) return;
        if (Number.isFinite(dragSession.pointerId) && Number(event?.pointerId) !== dragSession.pointerId) return;
        stopAndPrevent(event);
        const moved = dragSession.moved === true;
        const finalValue = quantizeSliderValue(dragSession.startValue);
        syncInputValue(finalValue, 'slider.direct.cancel');
        const wasPinned = dragSession.wasPinned === true;
        clear();
        if (typeof onEnd === 'function') {
            onEnd({
                value: finalValue,
                cancelled: true,
                moved,
                pointerType: String(event?.pointerType || '').trim() || 'unknown',
                pinned: wasPinned
            });
        }
        if (!wasPinned) collapseAfterTransientDrag();
    }

    const bind = () => {
        hitzone.addEventListener('pointerdown', begin, true);
        input.addEventListener('pointerdown', begin, true);
    };

    return {
        bind,
        clear
    };
};


export {
    TOOL_SLIDER_DRAG_THRESHOLD_PX,
    beginToolSliderSession,
    createDirectSliderDragController,
    dragToolSliderSession,
    releaseToolSliderSession,
    travelledSliderValue
};
