// Extracted from tool_slider_builder.js: canonical slider-tool interaction semantics.
const TOOL_SLIDER_DRAG_THRESHOLD_PX = 4;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const quantize = (value, config = {}) => {
    const min = finite(config.min, 0);
    const max = Math.max(min, finite(config.max, 100));
    const step = Math.max(0.0001, finite(config.step, 1));
    return clamp(min + (Math.round((clamp(finite(value, min), min, max) - min) / step) * step), min, max);
};

const beginToolSliderSession = (value, config = {}, options = {}) => {
    const startValue = quantize(value, config);
    const pinned = options.pinned === true && options.expanded === true;
    return {
        state: 'pressed', expanded: true, pinned, wasPinned: pinned,
        compactAnchor: options.compactAnchor !== false,
        value: startValue, startValue, delta: 0, dragged: false
    };
};

const dragToolSliderSession = (session = {}, delta = 0, travelPx = 1, config = {}) => {
    if (session.state !== 'pressed' && session.state !== 'dragging') return session;
    const nextDelta = finite(session.delta, 0) + finite(delta, 0);
    const dragged = session.dragged === true || Math.abs(nextDelta) >= TOOL_SLIDER_DRAG_THRESHOLD_PX;
    if (!dragged) return { ...session, delta: nextDelta };
    const min = finite(config.min, 0);
    const max = Math.max(min, finite(config.max, 100));
    const range = max - min;
    return {
        ...session,
        state: 'dragging',
        delta: nextDelta,
        dragged: true,
        value: quantize(finite(session.startValue, min) + ((nextDelta / Math.max(1, finite(travelPx, 1))) * range), config)
    };
};

const releaseToolSliderSession = (session = {}, options = {}) => {
    const cancelled = options.cancelled === true;
    const wasPinned = session.wasPinned === true;
    if (cancelled) {
        return {
            ...session, state: wasPinned ? 'pinned' : 'collapsed', expanded: wasPinned,
            pinned: wasPinned, value: finite(session.startValue, session.value), dragged: false
        };
    }
    if (session.dragged === true) {
        return { ...session, state: wasPinned ? 'pinned' : 'collapsed', expanded: wasPinned, pinned: wasPinned };
    }
    const compactAnchor = options.compactAnchor ?? session.compactAnchor;
    if (wasPinned && compactAnchor === true) {
        return { ...session, state: 'collapsed', expanded: false, pinned: false };
    }
    return { ...session, state: 'pinned', expanded: true, pinned: true };
};

const createDirectSliderDragController = ({
    input,
    hitzone,
    expandedLength,
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
    releaseToolSliderSession
};
