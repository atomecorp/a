// Extracted from tool_slider_builder.js: direct pointer-drag controller for the slider tool.
const createDirectSliderDragController = ({
    input,
    hitzone,
    expandedWidth,
    step,
    min,
    max,
    initialValue,
    quantizeSliderValue,
    syncInputValue,
    commitInputValue,
    isPinned,
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
        try {
            if (Number.isFinite(dragSession.pointerId)) {
                input.releasePointerCapture?.(dragSession.pointerId);
            }
        } catch (_) { }
        dragSession = null;
    };

    const resolveTrackWidth = () => {
        const inputRect = input.getBoundingClientRect?.();
        const hitzoneRect = hitzone.getBoundingClientRect?.();
        return Math.max(
            1,
            Number(inputRect?.width) || 0,
            Number(hitzoneRect?.width) || 0,
            expandedWidth
        );
    };

    const readValue = (clientX) => {
        if (!dragSession) return null;
        const dx = Number(clientX) - Number(dragSession.startX || 0);
        const range = Math.max(step, max - min);
        const deltaRatio = dx / Math.max(1, dragSession.trackWidth || expandedWidth);
        return quantizeSliderValue(Number(dragSession.startValue || initialValue) + (deltaRatio * range));
    };

    const begin = (event) => {
        if (Number(event?.button || 0) !== 0 || dragSession) return;
        stopAndPrevent(event);
        openForTransientDrag();
        dragSession = {
            pointerId: Number.isFinite(Number(event?.pointerId)) ? Number(event.pointerId) : null,
            startX: Number(event?.clientX) || 0,
            startValue: quantizeSliderValue(input.value),
            trackWidth: resolveTrackWidth(),
            moved: false
        };
        if (typeof onStart === 'function') {
            onStart({
                value: dragSession.startValue,
                pointerType: String(event?.pointerType || '').trim() || 'unknown'
            });
        }
        try {
            if (Number.isFinite(dragSession.pointerId)) {
                input.setPointerCapture?.(dragSession.pointerId);
            }
        } catch (_) { }
        if (typeof window !== 'undefined') {
            window.addEventListener('pointermove', onPointerMove, true);
            window.addEventListener('pointerup', onPointerUp, true);
            window.addEventListener('pointercancel', onPointerCancel, true);
        }
    };

    function onPointerMove(event) {
        if (!dragSession) return;
        if (Number.isFinite(dragSession.pointerId) && Number(event?.pointerId) !== dragSession.pointerId) return;
        const nextValue = readValue(event?.clientX);
        if (!Number.isFinite(nextValue)) return;
        dragSession.moved = true;
        stopAndPrevent(event);
        syncInputValue(nextValue, 'slider.direct.drag');
    }

    function onPointerUp(event) {
        if (!dragSession) return;
        if (Number.isFinite(dragSession.pointerId) && Number(event?.pointerId) !== dragSession.pointerId) return;
        const moved = dragSession.moved === true;
        let finalValue = quantizeSliderValue(input.value);
        if (moved) {
            stopAndPrevent(event);
            const nextValue = readValue(event?.clientX);
            finalValue = commitInputValue(Number.isFinite(nextValue) ? nextValue : input.value, 'slider.direct.drag');
        }
        clear();
        if (typeof onEnd === 'function') {
            onEnd({
                value: finalValue,
                cancelled: false,
                moved,
                pointerType: String(event?.pointerType || '').trim() || 'unknown'
            });
        }
        if (isPinned() !== true) collapseAfterTransientDrag();
    }

    function onPointerCancel(event) {
        if (!dragSession) return;
        if (Number.isFinite(dragSession.pointerId) && Number(event?.pointerId) !== dragSession.pointerId) return;
        stopAndPrevent(event);
        const moved = dragSession.moved === true;
        const finalValue = quantizeSliderValue(input.value);
        clear();
        if (typeof onEnd === 'function') {
            onEnd({
                value: finalValue,
                cancelled: true,
                moved,
                pointerType: String(event?.pointerType || '').trim() || 'unknown'
            });
        }
        if (isPinned() !== true) collapseAfterTransientDrag();
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


export { createDirectSliderDragController };
