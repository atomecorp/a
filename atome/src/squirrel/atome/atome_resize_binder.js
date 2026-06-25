// Extracted from atome.js: resizable event binder.
import {
    hasOwn
} from './atome_const.js';
import {
    parseEventModifiers,
    combineBindings,
    queueRealtimePatch
} from './atome_events.js';
import {
    bindGenericEventGroup
} from './atome_drag_binder.js';

function bindResizableEvents(instance, groupName, config) {
    if (!instance || !instance.element || !config || typeof config !== 'object') return null;

    const element = instance.element;
    const options = parseEventModifiers(config.modifiers) || {};
    const handlerSource = config.on && typeof config.on === 'object' ? config.on : config;
    const handlers = handlerSource && typeof handlerSource === 'object' ? handlerSource : {};

    const resizeHandler = typeof handlers.resize === 'function' ? handlers.resize : null;
    const changeHandler = typeof handlers.change === 'function' ? handlers.change : null;
    const observedHandler = typeof handlers.observed === 'function' ? handlers.observed : null;
    const startHandler = typeof handlers.start === 'function' ? handlers.start : null;
    const endHandler = typeof handlers.end === 'function' ? handlers.end : null;
    const cancelHandler = typeof handlers.cancel === 'function' ? handlers.cancel : null;

    const minWidth = Number.isFinite(config.minWidth) ? config.minWidth : 10;
    const minHeight = Number.isFinite(config.minHeight) ? config.minHeight : 10;
    const maxWidth = Number.isFinite(config.maxWidth) ? config.maxWidth : Infinity;
    const maxHeight = Number.isFinite(config.maxHeight) ? config.maxHeight : Infinity;
    const axis = typeof config.axis === 'string' ? config.axis.toLowerCase() : 'both';
    const allowWidth = axis !== 'y';
    const allowHeight = axis !== 'x';
    const keepRatio = !!config.lockAspect;
    const manualThreshold = Number.isFinite(config.threshold) ? Math.max(0, config.threshold) : 16;
    const handleMode = typeof config.handle === 'string' ? config.handle.toLowerCase() : 'auto';
    const handleSize = Number.isFinite(config.handleSize) ? Math.max(4, config.handleSize) : 16;
    const cursorStyle = typeof config.cursor === 'string' && config.cursor.trim() ? config.cursor.trim() : 'se-resize';
    const observerAvailable = typeof ResizeObserver !== 'undefined';

    const startListenerOptions = {
        capture: !!options.capture,
        passive: !!options.passive,
        once: !!options.once
    };
    const moveListenerOptions = {
        capture: !!options.capture,
        passive: !!options.passive
    };
    const endListenerOptions = {
        capture: !!options.capture,
        passive: !!options.passive
    };

    const cleanupStack = [];
    const registerCleanup = (fn) => {
        if (typeof fn === 'function') cleanupStack.push(fn);
    };

    const supportsPointer = typeof window !== 'undefined' && (window.PointerEvent || ('ontouchstart' in window) || ('onmousedown' in window));
    if (supportsPointer) {
        const startEvents = window.PointerEvent ? ['pointerdown'] : ['mousedown', 'touchstart'];
        const moveEvents = window.PointerEvent ? ['pointermove'] : ['mousemove', 'touchmove'];
        const endEvents = window.PointerEvent ? ['pointerup', 'pointercancel'] : ['mouseup', 'touchend', 'touchcancel'];

        const computedPosition = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(element).position : null;
        if (computedPosition === 'static') element.style.position = 'relative';

        let resizeTarget = null;
        let createdHandle = null;

        if (handleMode === 'self' || handleMode === 'element') {
            resizeTarget = element;
        } else if (config.handleSelector && typeof config.handleSelector === 'string') {
            resizeTarget = element.querySelector(config.handleSelector);
        } else if (config.handleElement && typeof config.handleElement === 'object' && config.handleElement !== null) {
            resizeTarget = config.handleElement;
        }

        if (!resizeTarget) {
            if (typeof document !== 'undefined' && document.createElement) {
                const handle = document.createElement('div');
                handle.dataset.atomeResizeHandle = 'true';
                handle.style.position = 'absolute';
                handle.style.right = '0px';
                handle.style.bottom = '0px';
                handle.style.width = `${handleSize}px`;
                handle.style.height = `${handleSize}px`;
                handle.style.cursor = cursorStyle;
                handle.style.touchAction = 'none';
                handle.style.userSelect = 'none';
                handle.style.background = 'transparent';
                handle.style.zIndex = config.handleZIndex !== undefined ? String(config.handleZIndex) : '10';
                if (config.handleStyle && typeof config.handleStyle === 'object') {
                    for (const key in config.handleStyle) {
                        if (!hasOwn.call(config.handleStyle, key)) continue;
                        const value = config.handleStyle[key];
                        if (value === undefined || value === null) continue;
                        try {
                            handle.style[key] = value;
                        } catch (error) {
                        }
                    }
                }
                element.appendChild(handle);
                resizeTarget = handle;
                createdHandle = handle;
            } else {
                resizeTarget = element;
            }
        }

        const targetElement = resizeTarget || element;
        if (targetElement) {
            let active = false;
            let pointerId = null;
            let startX = 0;
            let startY = 0;
            let baseWidth = 0;
            let baseHeight = 0;
            let aspectRatio = 1;
            let savedCursor = null;

            const clampValue = (value, min, max) => {
                if (!Number.isFinite(value)) return value;
                const lower = Number.isFinite(min) ? min : value;
                const upper = Number.isFinite(max) ? max : value;
                return Math.min(Math.max(value, lower), upper);
            };

            const getCoords = (event) => {
                if (!event) return null;
                if (event.touches && event.touches.length) {
                    const touch = event.touches[0];
                    return { x: touch.clientX, y: touch.clientY, id: touch.identifier, type: 'touch' };
                }
                if (event.changedTouches && event.changedTouches.length) {
                    const touch = event.changedTouches[0];
                    return { x: touch.clientX, y: touch.clientY, id: touch.identifier, type: 'touch' };
                }
                const x = event.clientX != null ? event.clientX : (event.pageX != null ? event.pageX : null);
                const y = event.clientY != null ? event.clientY : (event.pageY != null ? event.pageY : null);
                if (x == null || y == null) return null;
                const id = event.pointerId != null ? event.pointerId : event.identifier != null ? event.identifier : 'mouse';
                const type = event.pointerType || (event.type && event.type.indexOf('mouse') !== -1 ? 'mouse' : 'touch');
                return { x, y, id, type };
            };

            const getDimensions = () => {
                if (typeof window === 'undefined' || !window.getComputedStyle) {
                    return { width: element.offsetWidth || 0, height: element.offsetHeight || 0 };
                }
                const computed = window.getComputedStyle(element);
                const parsedWidth = parseFloat(computed.width);
                const parsedHeight = parseFloat(computed.height);
                return {
                    width: Number.isFinite(parsedWidth) ? parsedWidth : element.offsetWidth || 0,
                    height: Number.isFinite(parsedHeight) ? parsedHeight : element.offsetHeight || 0
                };
            };

            const applySize = (width, height) => {
                let changed = false;
                if (allowWidth && Number.isFinite(width)) {
                    element.style.width = `${width}px`;
                    if (!instance.units) instance.units = {};
                    instance.units.width = 'px';
                    if (!instance._sections) instance._sections = {};
                    if (!instance._sections.geometry) instance._sections.geometry = {};
                    instance._sections.geometry.width = width;
                    if (instance._styles) instance._styles.width = width;
                    instance.width = width;
                    changed = true;
                }
                if (allowHeight && Number.isFinite(height)) {
                    element.style.height = `${height}px`;
                    if (!instance.units) instance.units = {};
                    instance.units.height = 'px';
                    if (!instance._sections) instance._sections = {};
                    if (!instance._sections.geometry) instance._sections.geometry = {};
                    instance._sections.geometry.height = height;
                    if (instance._styles) instance._styles.height = height;
                    instance.height = height;
                    changed = true;
                }

                if (changed && config.realtime !== false) {
                    const patch = {};
                    if (allowWidth && Number.isFinite(width)) patch.width = width;
                    if (allowHeight && Number.isFinite(height)) patch.height = height;
                    queueRealtimePatch(instance, patch);
                }
                return changed;
            };

            const isTargetZone = (coords, eventTarget) => {
                if (!coords) return false;
                if (targetElement !== element) {
                    return targetElement === eventTarget || targetElement.contains(eventTarget);
                }
                if (manualThreshold <= 0) return true;
                const rect = element.getBoundingClientRect();
                const offsetX = rect.right - coords.x;
                const offsetY = rect.bottom - coords.y;
                return offsetX >= 0 && offsetY >= 0 && offsetX <= manualThreshold && offsetY <= manualThreshold;
            };

            const notifyManual = () => {
                if (observerAvailable) return;
                if (!resizeHandler && !changeHandler) return;
                const width = element.offsetWidth || 0;
                const height = element.offsetHeight || 0;
                const entry = {
                    target: element,
                    contentRect: {
                        x: 0,
                        y: 0,
                        top: 0,
                        left: 0,
                        right: width,
                        bottom: height,
                        width,
                        height
                    }
                };
                if (resizeHandler) resizeHandler(entry, instance);
                if (changeHandler) changeHandler(entry, instance);
            };

            const handleMove = (event) => {
                if (!active) return;
                const coords = getCoords(event);
                if (!coords) return;
                if (pointerId !== null && coords.id !== pointerId) return;

                const deltaX = coords.x - startX;
                const deltaY = coords.y - startY;
                let nextWidth = allowWidth ? clampValue(baseWidth + deltaX, minWidth, maxWidth) : baseWidth;
                let nextHeight = allowHeight ? clampValue(baseHeight + deltaY, minHeight, maxHeight) : baseHeight;

                if (keepRatio && allowWidth && allowHeight && baseHeight > 0) {
                    const constrainedWidth = clampValue(baseWidth + deltaX, minWidth, maxWidth);
                    nextWidth = constrainedWidth;
                    nextHeight = clampValue(constrainedWidth / aspectRatio, minHeight, maxHeight);
                }

                const changed = applySize(nextWidth, nextHeight);
                if (changed) notifyManual();

                if (!moveListenerOptions.passive && typeof event.preventDefault === 'function') event.preventDefault();
            };

            const stopResizing = (event, isCancel = false) => {
                if (!active) return;
                active = false;
                pointerId = null;
                moveEvents.forEach((type) => window.removeEventListener(type, handleMove, moveListenerOptions));
                endEvents.forEach((type) => window.removeEventListener(type, endListener, endListenerOptions));
                if (targetElement === element) element.style.cursor = savedCursor || '';
                notifyManual();
                if (isCancel) {
                    if (cancelHandler) cancelHandler(event, instance);
                } else if (endHandler) {
                    endHandler(event, instance);
                }
            };

            const endListener = (event) => {
                if (!active) return;
                if (event && pointerId !== null) {
                    const coords = getCoords(event);
                    if (coords && coords.id !== pointerId) return;
                }
                const isCancel = event && (event.type === 'pointercancel' || event.type === 'touchcancel');
                stopResizing(event, isCancel);
            };

            const startListener = (event) => {
                const coords = getCoords(event);
                if (!coords) return;
                if (!isTargetZone(coords, event.target)) return;

                active = true;
                pointerId = coords.id;
                const dimensions = getDimensions();
                baseWidth = dimensions.width;
                baseHeight = dimensions.height;
                startX = coords.x;
                startY = coords.y;
                aspectRatio = baseHeight > 0 ? baseWidth / baseHeight : 1;

                if (targetElement === element) {
                    savedCursor = element.style.cursor;
                    element.style.cursor = cursorStyle;
                }

                if (!startListenerOptions.passive && typeof event.preventDefault === 'function') event.preventDefault();
                if (typeof event.stopPropagation === 'function') event.stopPropagation();

                moveEvents.forEach((type) => window.addEventListener(type, handleMove, moveListenerOptions));
                endEvents.forEach((type) => window.addEventListener(type, endListener, endListenerOptions));

                if (startHandler) startHandler(event, instance);
            };

            startEvents.forEach((type) => targetElement.addEventListener(type, startListener, startListenerOptions));

            const pointerCleanup = () => {
                stopResizing(null, true);
                startEvents.forEach((type) => targetElement.removeEventListener(type, startListener, startListenerOptions));
                moveEvents.forEach((type) => window.removeEventListener(type, handleMove, moveListenerOptions));
                endEvents.forEach((type) => window.removeEventListener(type, endListener, endListenerOptions));
                if (createdHandle && createdHandle.parentNode) createdHandle.parentNode.removeChild(createdHandle);
            };

            registerCleanup(pointerCleanup);
        }
    }

    if (observerAvailable && (resizeHandler || changeHandler || observedHandler)) {
        const callbacks = [resizeHandler, changeHandler, observedHandler].filter(Boolean);
        if (callbacks.length) {
            const observer = new ResizeObserver((entries) => {
                entries.forEach((entry) => {
                    callbacks.forEach((callback) => callback(entry, instance));
                });
            });
            observer.observe(element);
            registerCleanup(() => observer.disconnect());
        }
    }

    let resizeBinding = null;
    if (cleanupStack.length) {
        resizeBinding = {
            cleanup() {
                while (cleanupStack.length) {
                    const fn = cleanupStack.pop();
                    try {
                        fn();
                    } catch (error) {
                    }
                }
            }
        };
    }

    const genericConfig = { modifiers: config.modifiers };
    let hasGenericHandlers = false;
    if (handlerSource && typeof handlerSource === 'object') {
        for (const key in handlerSource) {
            if (!hasOwn.call(handlerSource, key)) continue;
            if (['resize', 'change', 'observed', 'start', 'end', 'cancel'].includes(key)) continue;
            if (typeof handlerSource[key] !== 'function') continue;
            if (!genericConfig.on) genericConfig.on = {};
            genericConfig.on[key] = handlerSource[key];
            hasGenericHandlers = true;
        }
    }

    if (hasGenericHandlers) {
        const genericBinding = bindGenericEventGroup(instance, groupName, genericConfig);
        resizeBinding = combineBindings(resizeBinding, genericBinding);
    }

    return resizeBinding;
}


export {
    bindResizableEvents
};
