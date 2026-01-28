import { editModeState, POINTER_TOUCH_ID_OFFSET } from './state.js';

export function resolvePointerDetails(event) {
    if (!event) return null;
    if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        const inferredType = event.pointerType
            || (typeof event.type === 'string' && event.type.indexOf('mouse') !== -1 ? 'mouse' : undefined);
        return {
            clientX: event.clientX,
            clientY: event.clientY,
            pointerId: event.pointerId,
            pointerType: inferredType,
            originalEvent: event
        };
    }
    const touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]) || null;
    if (!touch) return null;
    return {
        clientX: touch.clientX,
        clientY: touch.clientY,
        pointerId: touch.identifier != null ? touch.identifier + POINTER_TOUCH_ID_OFFSET : 'touch',
        pointerType: 'touch',
        originalEvent: event
    };
}

export function ensurePointerMatchesContext(ctx, pointerMeta, event) {
    if (!ctx) return true;
    const nextPointerId = pointerMeta && pointerMeta.pointerId != null
        ? pointerMeta.pointerId
        : (event && event.pointerId != null ? event.pointerId : null);
    if (ctx.pointerId == null) {
        ctx.pointerId = nextPointerId != null ? nextPointerId : ctx.pointerId;
        const pType = (pointerMeta && pointerMeta.pointerType) || (event && event.pointerType);
        if (pType && !ctx.pointerType) ctx.pointerType = pType;
        return true;
    }
    if (nextPointerId == null) return true;
    if (ctx.pointerId === nextPointerId) return true;
    const metaType = (pointerMeta && pointerMeta.pointerType) || (event && event.pointerType);
    if (!ctx.pointerType && metaType) {
        ctx.pointerType = metaType;
    }
    const sameType = ctx.pointerType && metaType && ctx.pointerType === metaType;
    if (sameType || !ctx.pointerType || !ctx.dragActivated) {
        ctx.pointerId = nextPointerId;
        if (ctx.kind === 'floating-move' && ctx.capturePointerId != null) {
            ctx.capturePointerId = nextPointerId;
        }
        return true;
    }
    return false;
}

export function attachRobustGlobalDragListeners(ctx) {
    if (!ctx || typeof document === 'undefined') return;
    const doc = document;
    doc.addEventListener('pointermove', ctx.moveHandler, true);
    doc.addEventListener('pointerup', ctx.upHandler, true);
    doc.addEventListener('pointercancel', ctx.upHandler, true);
    const fallbackMove = (ev) => ctx.moveHandler(ev);
    const fallbackUp = (ev) => ctx.upHandler(ev);
    doc.addEventListener('mousemove', fallbackMove, true);
    doc.addEventListener('mouseup', fallbackUp, true);
    doc.addEventListener('touchmove', fallbackMove, { passive: false, capture: true });
    doc.addEventListener('touchend', fallbackUp, true);
    doc.addEventListener('touchcancel', fallbackUp, true);
    const onVisibilityChange = () => {
        if (!document || document.visibilityState !== 'hidden') return;
        const cancelEvent = {
            type: 'pointercancel',
            pointerId: ctx.pointerId,
            clientX: ctx.lastClientX,
            clientY: ctx.lastClientY,
            preventDefault: () => { },
            stopPropagation: () => { }
        };
        ctx.upHandler(cancelEvent);
    };
    doc.addEventListener('visibilitychange', onVisibilityChange, true);
    const onWindowBlur = () => {
        const cancelEvent = {
            type: 'pointercancel',
            pointerId: ctx.pointerId,
            clientX: ctx.lastClientX,
            clientY: ctx.lastClientY,
            preventDefault: () => { },
            stopPropagation: () => { }
        };
        ctx.upHandler(cancelEvent);
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('blur', onWindowBlur, true);
    }
    ctx.fallbackMoveHandler = fallbackMove;
    ctx.fallbackUpHandler = fallbackUp;
    ctx.visibilityChangeHandler = onVisibilityChange;
    ctx.windowBlurHandler = onWindowBlur;
    if (ctx.originEl && typeof ctx.originEl.addEventListener === 'function' && ctx.capturePointerId != null) {
        const onLostCapture = () => {
            if (ctx.dragFinished) return;
            if (editModeState.dragContext !== ctx) return;
            requestAnimationFrame(() => {
                if (ctx.dragFinished) return;
                if (editModeState.dragContext !== ctx) return;
                try { ctx.originEl.setPointerCapture(ctx.capturePointerId); } catch (_) { }
            });
        };
        ctx.lostPointerCaptureHandler = onLostCapture;
        ctx.originEl.addEventListener('lostpointercapture', onLostCapture);
    }
}

export function detachRobustGlobalDragListeners(ctx) {
    if (!ctx || typeof document === 'undefined') return;
    const doc = document;
    if (ctx.moveHandler) {
        doc.removeEventListener('pointermove', ctx.moveHandler, true);
        doc.removeEventListener('pointerup', ctx.upHandler, true);
        doc.removeEventListener('pointercancel', ctx.upHandler, true);
    }
    if (ctx.fallbackMoveHandler) {
        doc.removeEventListener('mousemove', ctx.fallbackMoveHandler, true);
        doc.removeEventListener('touchmove', ctx.fallbackMoveHandler, true);
    }
    if (ctx.fallbackUpHandler) {
        doc.removeEventListener('mouseup', ctx.fallbackUpHandler, true);
        doc.removeEventListener('touchend', ctx.fallbackUpHandler, true);
        doc.removeEventListener('touchcancel', ctx.fallbackUpHandler, true);
    }
    if (ctx.visibilityChangeHandler) {
        doc.removeEventListener('visibilitychange', ctx.visibilityChangeHandler, true);
        ctx.visibilityChangeHandler = null;
    }
    if (typeof window !== 'undefined' && ctx.windowBlurHandler) {
        window.removeEventListener('blur', ctx.windowBlurHandler, true);
        ctx.windowBlurHandler = null;
    }
    if (ctx.originEl && ctx.lostPointerCaptureHandler) {
        try { ctx.originEl.removeEventListener('lostpointercapture', ctx.lostPointerCaptureHandler); } catch (_) { }
        ctx.lostPointerCaptureHandler = null;
    }
    ctx.fallbackMoveHandler = null;
    ctx.fallbackUpHandler = null;
}
