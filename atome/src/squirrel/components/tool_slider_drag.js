// Canonical slider-tool interaction semantics (shared by the Bevy tool slider).
const TOOL_SLIDER_DRAG_THRESHOLD_PX = 4;
import { normalizeSliderRange, quantizeSliderValue as quantize } from './slider_contract.js';
import { isNaturalNumber } from '../../shared/natural_numbers.js';
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// The value a finger gives `travel` px from its press (from `start`), the whole range lying along `length` px: the gauge
// follows the finger whatever the number of values (user, 2026-10-30, Q10). Every tool slider is a value slider: a natural
// value (a Fibonacci number or a multiple of 3, AGENTS.md rule 19) holds the finger a little, its place along the length
// twice an ordinary value's, one step's extra travel to pass it, the whole range still lying along `length`. A range
// with no natural value follows the finger evenly.
const travelledSliderValue = (start, travel, length, config = {}) => {
    const { min, max, step } = normalizeSliderRange(config), span = Math.max(1, finite(length, 1));
    const count = Math.round((max - min) / step) + 1, indexOf = value => Math.round((value - min) / step);
    const stops = [];
    for (let value = Math.max(1, Math.ceil(min)); value <= max; value += 1) {
        if (isNaturalNumber(value) && Math.abs((value - min) / step - indexOf(value)) < 1e-6) stops.push(indexOf(value));
    }
    if (!stops.length) return quantize(finite(start, min) + (finite(travel) / span) * (max - min), config);
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

// Natural values hold the finger a little (#travelledSliderValue).
const dragToolSliderSession = (session = {}, delta = 0, travelPx = 1, config = {}) => {
    if (session.state !== 'pressed' && session.state !== 'dragging') return session;
    const nextDelta = finite(session.delta, 0) + finite(delta, 0);
    const dragged = session.dragged === true || Math.abs(nextDelta) >= TOOL_SLIDER_DRAG_THRESHOLD_PX;
    if (!dragged) return { ...session, delta: nextDelta };
    return {
        ...session, state: 'dragging', delta: nextDelta, dragged: true,
        value: travelledSliderValue(finite(session.startValue, finite(config.min, 0)), nextDelta, travelPx, config)
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

export {
    TOOL_SLIDER_DRAG_THRESHOLD_PX,
    beginToolSliderSession,
    dragToolSliderSession,
    releaseToolSliderSession,
    travelledSliderValue
};
