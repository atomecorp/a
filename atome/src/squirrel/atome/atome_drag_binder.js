// Extracted from atome.js: generic/draggable/touchable event binders.
import {
    hasOwn
} from './atome_const.js';
import {
    parseEventModifiers,
    combineBindings,
    queueRealtimePatch
} from './atome_events.js';

function bindGenericEventGroup(instance, groupName, config) {
    if (!instance || !instance.element) return null;
    if (!config || typeof config !== 'object') return null;

    const element = instance.element;
    const options = parseEventModifiers(config.modifiers);
    const source = config.on && typeof config.on === 'object' ? config.on : config;
    const listeners = [];

    for (const eventName in source) {
        if (!hasOwn.call(source, eventName)) continue;
        if (eventName === 'modifiers') continue;
        const handler = source[eventName];
        if (typeof handler !== 'function') continue;
        const wrapped = (event) => handler(event, instance);
        element.addEventListener(eventName, wrapped, options);
        listeners.push({ target: element, eventName, wrapped, options });
    }

    if (!listeners.length) return null;

    return {
        cleanup() {
            listeners.forEach(({ target, eventName, wrapped, options: opts }) => {
                target.removeEventListener(eventName, wrapped, opts);
            });
        }
    };
}

function bindDraggableEvents(instance, groupName, config) {
    if (!instance || !instance.element || !config || typeof config !== 'object') return null;

    const element = instance.element;
    const options = parseEventModifiers(config.modifiers) || {};
    const handlerSource = config.on && typeof config.on === 'object' ? config.on : config;
    const handlers = handlerSource && typeof handlerSource === 'object' ? handlerSource : {};
    const startHandler = typeof handlers.start === 'function' ? handlers.start : null;
    const dragHandler = typeof handlers.drag === 'function' ? handlers.drag : null;
    const endHandler = typeof handlers.end === 'function' ? handlers.end : null;
    const cancelHandler = typeof handlers.cancel === 'function' ? handlers.cancel : null;

    const supportsPointer = typeof window !== 'undefined' && window.PointerEvent;
    const startEvents = supportsPointer ? ['pointerdown'] : ['mousedown', 'touchstart'];
    const moveEvents = supportsPointer ? ['pointermove'] : ['mousemove', 'touchmove'];
    const endEvents = supportsPointer ? ['pointerup', 'pointercancel'] : ['mouseup', 'touchend', 'touchcancel'];

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

    let active = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let baseLeft = 0;
    let baseTop = 0;

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

    const applyPosition = (left, top) => {
        if (!Number.isFinite(left) || !Number.isFinite(top)) return;
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        if (!instance.units) instance.units = {};
        instance.units.left = instance.units.left || 'px';
        instance.units.top = instance.units.top || 'px';
        if (instance._sections) {
            if (!instance._sections.spatial) instance._sections.spatial = {};
            instance._sections.spatial.left = left;
            instance._sections.spatial.top = top;
        }
        if (instance._styles) {
            instance._styles.left = left;
            instance._styles.top = top;
        }
        instance.left = left;
        instance.top = top;

        if (config.realtime !== false) {
            queueRealtimePatch(instance, { left, top });
        }
    };

    const handleMove = (event) => {
        if (!active) return;
        const coords = getCoords(event);
        if (!coords) return;
        if (pointerId !== null && coords.id !== pointerId) return;

        const deltaX = coords.x - startX;
        const deltaY = coords.y - startY;
        const nextLeft = baseLeft + deltaX;
        const nextTop = baseTop + deltaY;
        applyPosition(nextLeft, nextTop);

        if (dragHandler) dragHandler(event, instance);
        if (!moveListenerOptions.passive && typeof event.preventDefault === 'function') event.preventDefault();
    };

    const stopDragging = (event, isCancel = false) => {
        if (!active) return;
        active = false;
        pointerId = null;
        moveEvents.forEach((type) => window.removeEventListener(type, handleMove, moveListenerOptions));
        endEvents.forEach((type) => window.removeEventListener(type, endListener, endListenerOptions));
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
        stopDragging(event, isCancel);
    };

    const startListener = (event) => {
        const coords = getCoords(event);
        if (!coords) return;
        active = true;
        pointerId = coords.id;

        const computed = window.getComputedStyle(element);
        const parsedLeft = parseFloat(computed.left);
        const parsedTop = parseFloat(computed.top);
        baseLeft = Number.isFinite(parsedLeft) ? parsedLeft : element.offsetLeft || 0;
        baseTop = Number.isFinite(parsedTop) ? parsedTop : element.offsetTop || 0;
        startX = coords.x;
        startY = coords.y;

        if (!startListenerOptions.passive && typeof event.preventDefault === 'function') event.preventDefault();

        moveEvents.forEach((type) => window.addEventListener(type, handleMove, moveListenerOptions));
        endEvents.forEach((type) => window.addEventListener(type, endListener, endListenerOptions));

        if (startHandler) startHandler(event, instance);
    };

    startEvents.forEach((type) => element.addEventListener(type, startListener, startListenerOptions));

    const binding = {
        cleanup() {
            startEvents.forEach((type) => element.removeEventListener(type, startListener, startListenerOptions));
            moveEvents.forEach((type) => window.removeEventListener(type, handleMove, moveListenerOptions));
            endEvents.forEach((type) => window.removeEventListener(type, endListener, endListenerOptions));
            active = false;
            pointerId = null;
        }
    };

    const genericConfig = { modifiers: config.modifiers };
    let hasGenericHandlers = false;
    if (handlerSource && typeof handlerSource === 'object') {
        for (const key in handlerSource) {
            if (!hasOwn.call(handlerSource, key)) continue;
            if (['start', 'drag', 'end', 'cancel'].includes(key)) continue;
            if (typeof handlerSource[key] !== 'function') continue;
            if (!genericConfig.on) genericConfig.on = {};
            genericConfig.on[key] = handlerSource[key];
            hasGenericHandlers = true;
        }
    }

    if (!hasGenericHandlers) return binding;

    const genericBinding = bindGenericEventGroup(instance, groupName, genericConfig);
    return combineBindings(binding, genericBinding);
}

function bindTouchableEvents(instance, groupName, config) {
    if (!instance || !instance.element || !config || typeof config !== 'object') return null;

    const element = instance.element;
    const options = parseEventModifiers(config.modifiers) || {};
    const handlerSource = config.on && typeof config.on === 'object' ? config.on : config;
    const handlers = handlerSource && typeof handlerSource === 'object' ? handlerSource : {};
    const supportsPointer = typeof window !== 'undefined' && window.PointerEvent;

    const startEvents = supportsPointer ? ['pointerdown'] : ['mousedown', 'touchstart'];
    const moveEvents = supportsPointer ? ['pointermove'] : ['mousemove', 'touchmove'];
    const endEvents = supportsPointer ? ['pointerup'] : ['mouseup', 'touchend'];
    const cancelEvents = supportsPointer ? ['pointercancel'] : ['touchcancel'];

    const listenerOptions = {
        capture: !!options.capture,
        passive: !!options.passive,
        once: !!options.once
    };

    const listeners = [];

    const attach = (eventNames, handler) => {
        if (typeof handler !== 'function') return;
        eventNames.forEach((name) => {
            const wrapped = (event) => handler(event, instance);
            element.addEventListener(name, wrapped, listenerOptions);
            listeners.push({ target: element, name, wrapped, options: listenerOptions });
        });
    };

    attach(startEvents, handlers.start);
    attach(moveEvents, handlers.move);
    attach(endEvents, handlers.end);
    attach(cancelEvents, handlers.cancel);

    let binding = null;
    if (listeners.length) {
        binding = {
            cleanup() {
                listeners.forEach(({ target, name, wrapped, options: opts }) => {
                    target.removeEventListener(name, wrapped, opts);
                });
            }
        };
    }

    const genericConfig = { modifiers: config.modifiers };
    let hasGenericHandlers = false;
    if (handlerSource && typeof handlerSource === 'object') {
        for (const key in handlerSource) {
            if (!hasOwn.call(handlerSource, key)) continue;
            if (['start', 'move', 'end', 'cancel'].includes(key)) continue;
            if (typeof handlerSource[key] !== 'function') continue;
            if (!genericConfig.on) genericConfig.on = {};
            genericConfig.on[key] = handlerSource[key];
            hasGenericHandlers = true;
        }
    }

    if (hasGenericHandlers) {
        const genericBinding = bindGenericEventGroup(instance, groupName, genericConfig);
        binding = combineBindings(binding, genericBinding);
    }

    return binding;
}


export {
    bindGenericEventGroup, bindDraggableEvents, bindTouchableEvents
};
