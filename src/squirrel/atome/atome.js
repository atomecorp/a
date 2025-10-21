const atomeDefaultsParams = {
    left: '0',
    top: '0',
    width: '69',
    height: '69',
    content: '',
    text: '',
    tag: 'default',
    background: '#272727',
    color: 'lightgray',
    units: { left: 'px', top: 'px', width: 'px', height: 'px' }
};
const hasOwn = Object.prototype.hasOwnProperty;
const DEFAULT_UNIT_PROPS = new Set([
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'minWidth',
    'minHeight',
    'maxWidth',
    'maxHeight',
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderRadius',
    'borderWidth',
    'fontSize',
    'lineHeight',
    'letterSpacing',
    'gap'
]);

const GLOBAL_STYLE_ALIASES = {
    align: 'alignItems',
    alignItems: 'alignItems',
    alignment: 'alignItems',
    justify: 'justifyContent',
    justifyContent: 'justifyContent',
    justification: 'justifyContent',
    justif: 'justifyContent',
    smooth: 'borderRadius',
    smmooth: 'borderRadius',
    radius: 'borderRadius',
    round: 'borderRadius',
    backgroundColor: 'background',
    bg: 'background',
    shadow: 'boxShadow',
    boxShadow: 'boxShadow',
    glow: 'boxShadow',
    color: 'background'
};

const SECTION_DEFINITIONS = {
    geometry: {
        alias: {
            width: 'width',
            height: 'height',
            depth: 'depth',
            minWidth: 'minWidth',
            minHeight: 'minHeight',
            maxWidth: 'maxWidth',
            maxHeight: 'maxHeight'
        },
        styleKeys: new Set(['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'])
    },
    spatial: {
        alias: {
            left: 'left',
            top: 'top',
            right: 'right',
            bottom: 'bottom',
            x: 'left',
            y: 'top',
            z: 'zIndex',
            zIndex: 'zIndex'
        },
        styleKeys: new Set(['left', 'top', 'right', 'bottom', 'zIndex'])
    },
    visual: {
        alias: {
            background: 'background',
            backgroundColor: 'background',
            color: 'background',
            fg: 'color',
            foreground: 'color',
            fontColor: 'color',
            textColor: 'color',
            fill: 'background',
            smooth: 'borderRadius',
            smmooth: 'borderRadius',
            borderRadius: 'borderRadius',
            border: 'border',
            borderColor: 'borderColor',
            borderWidth: 'borderWidth',
            borderStyle: 'borderStyle',
            opacity: 'opacity',
            shadow: 'boxShadow',
            boxShadow: 'boxShadow'
        },
        styleKeys: new Set([
            'background',
            'color',
            'borderRadius',
            'border',
            'borderColor',
            'borderWidth',
            'borderStyle',
            'opacity',
            'boxShadow'
        ])
    },
    layout: {
        alias: {
            display: 'display',
            position: 'position',
            align: 'alignItems',
            alignItems: 'alignItems',
            alignment: 'alignItems',
            justify: 'justifyContent',
            justifyContent: 'justifyContent',
            justif: 'justifyContent',
            justification: 'justifyContent',
            direction: 'flexDirection',
            flexDirection: 'flexDirection',
            wrap: 'flexWrap',
            flexWrap: 'flexWrap',
            gap: 'gap'
        },
        styleKeys: new Set([
            'display',
            'position',
            'alignItems',
            'justifyContent',
            'flexDirection',
            'flexWrap',
            'gap'
        ])
    },
    typography: {
        alias: {
            color: 'color',
            textColor: 'color',
            size: 'fontSize',
            fontSize: 'fontSize',
            weight: 'fontWeight',
            fontWeight: 'fontWeight',
            align: 'textAlign',
            textAlign: 'textAlign',
            line: 'lineHeight',
            lineHeight: 'lineHeight',
            spacing: 'letterSpacing',
            letterSpacing: 'letterSpacing'
        },
        styleKeys: new Set([
            'color',
            'fontSize',
            'fontWeight',
            'textAlign',
            'lineHeight',
            'letterSpacing'
        ])
    }
};

for (const sectionName in SECTION_DEFINITIONS) {
    if (!hasOwn.call(SECTION_DEFINITIONS, sectionName)) continue;
    const aliasMap = SECTION_DEFINITIONS[sectionName].alias;
    const identityKeys = new Set(Object.values(aliasMap));
    identityKeys.forEach((canonicalKey) => {
        if (!hasOwn.call(aliasMap, canonicalKey)) aliasMap[canonicalKey] = canonicalKey;
    });
}

const SECTION_NAMES = Object.keys(SECTION_DEFINITIONS);

const STYLE_TO_SECTION = {
    width: 'geometry',
    height: 'geometry',
    minWidth: 'geometry',
    minHeight: 'geometry',
    maxWidth: 'geometry',
    maxHeight: 'geometry',
    left: 'spatial',
    top: 'spatial',
    right: 'spatial',
    bottom: 'spatial',
    zIndex: 'spatial',
    background: 'visual',
    color: 'visual',
    borderRadius: 'visual',
    border: 'visual',
    borderColor: 'visual',
    borderWidth: 'visual',
    borderStyle: 'visual',
    opacity: 'visual',
    boxShadow: 'visual',
    display: 'layout',
    position: 'layout',
    alignItems: 'layout',
    justifyContent: 'layout',
    flexDirection: 'layout',
    flexWrap: 'layout',
    gap: 'layout',
    fontSize: 'typography',
    fontWeight: 'typography',
    textAlign: 'typography',
    lineHeight: 'typography',
    letterSpacing: 'typography'
};

const KNOWN_CONFIG_KEYS = new Set(['id', 'parent', 'tag', 'text', 'content', 'type', 'name', 'data', 'meta', 'role']);
const STYLE_KEY_CACHE = new Map();
let atomeIdCounter = 0;

function resolveStyleKey(sectionName, rawKey) {
    if (rawKey === null || rawKey === undefined) return null;
    let key = rawKey;
    let cacheToken = null;

    if (typeof rawKey === 'string') {
        key = rawKey.trim();
        if (key === '') return null;
        cacheToken = `${sectionName || ''}|${key}`;
        if (STYLE_KEY_CACHE.has(cacheToken)) return STYLE_KEY_CACHE.get(cacheToken);
    }

    if (sectionName && hasOwn.call(SECTION_DEFINITIONS, sectionName)) {
        const aliasMap = SECTION_DEFINITIONS[sectionName].alias;
        if (hasOwn.call(aliasMap, key)) {
            const canonical = aliasMap[key];
            if (cacheToken) STYLE_KEY_CACHE.set(cacheToken, canonical);
            return canonical;
        }
    }
    if (hasOwn.call(GLOBAL_STYLE_ALIASES, key)) {
        const canonical = GLOBAL_STYLE_ALIASES[key];
        if (cacheToken) STYLE_KEY_CACHE.set(cacheToken, canonical);
        return canonical;
    }
    if (cacheToken) STYLE_KEY_CACHE.set(cacheToken, key);
    return key;
}

function trimUnitValue(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }
    return value;
}

function mergeUnitsInto(target, source) {
    if (!source) return;
    for (const key in source) {
        if (!hasOwn.call(source, key)) continue;
        const value = source[key];
        const trimmed = trimUnitValue(value);
        if (trimmed === undefined) {
            delete target[key];
        } else {
            target[key] = trimmed;
        }
    }
}

function mergeUnitsFromSection(sectionName, unitsSource, target) {
    if (!unitsSource || typeof unitsSource !== 'object') return;
    const mapped = {};
    for (const unitKey in unitsSource) {
        if (!hasOwn.call(unitsSource, unitKey)) continue;
        const canonical = resolveStyleKey(sectionName, unitKey);
        if (!canonical) continue;
        const trimmed = trimUnitValue(unitsSource[unitKey]);
        if (trimmed !== undefined) mapped[canonical] = trimmed;
    }
    mergeUnitsInto(target, mapped);
}

function ensureSectionEntry(context, sectionName) {
    if (!sectionName) return null;
    if (!context.sections[sectionName]) {
        context.sections[sectionName] = { values: {}, meta: {} };
    }
    return context.sections[sectionName];
}

function recordAppliedEntry(context, originalKey, canonicalKey, sectionName, value) {
    context.applied.push({ originalKey, canonicalKey, sectionName, value });
}

function applyStyleEntry(context, key, value, sectionHint) {
    const canonicalKey = resolveStyleKey(sectionHint, key);
    if (!canonicalKey) return;
    const sectionName = sectionHint || STYLE_TO_SECTION[canonicalKey] || null;
    const isStyle = sectionName !== null && (
        (STYLE_TO_SECTION[canonicalKey] !== undefined) ||
        (sectionHint && SECTION_DEFINITIONS[sectionHint]?.styleKeys?.has(canonicalKey))
    );

    if (!isStyle) {
        const sectionEntry = ensureSectionEntry(context, sectionName || sectionHint);
        if (sectionEntry) sectionEntry.meta[canonicalKey] = value;
        else context.config[canonicalKey] = value;
        return;
    }

    context.styles[canonicalKey] = value;
    recordAppliedEntry(context, key, canonicalKey, sectionName, value);

    if (sectionName) {
        const sectionEntry = ensureSectionEntry(context, sectionName);
        sectionEntry.values[canonicalKey] = value;
    }
}

function parseSection(sectionName, sectionValue, context) {
    if (!sectionValue || typeof sectionValue !== 'object') return;
    for (const key in sectionValue) {
        if (!hasOwn.call(sectionValue, key)) continue;
        if (key === 'units') {
            mergeUnitsFromSection(sectionName, sectionValue.units, context.units);
            continue;
        }
        if (key === 'children' && Array.isArray(sectionValue.children)) {
            context.children.push(...sectionValue.children);
            continue;
        }
        const value = sectionValue[key];
        applyStyleEntry(context, key, value, sectionName);
    }
}

function parseAtomeInput(rawParams = {}, { forUpdate = false } = {}) {
    const context = {
        config: {},
        styles: {},
        units: {},
        sections: {},
        children: [],
        applied: [],
        meta: {}
    };

    if (!rawParams || typeof rawParams !== 'object') return context;

    for (const key in rawParams) {
        if (!hasOwn.call(rawParams, key)) continue;
        const value = rawParams[key];
        if (value === undefined) continue;

        if (key === 'children' && Array.isArray(value)) {
            context.children.push(...value);
            continue;
        }

        if (key === 'units' && value && typeof value === 'object') {
            mergeUnitsFromSection(null, value, context.units);
            continue;
        }

        if (hasOwn.call(SECTION_DEFINITIONS, key) && value && typeof value === 'object') {
            parseSection(key, value, context);
            continue;
        }

        if (KNOWN_CONFIG_KEYS.has(key)) {
            context.config[key] = value;
            continue;
        }

        if (key === 'mergeDefaults') continue;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            context.config[key] = value;
            continue;
        }

        applyStyleEntry(context, key, value, null);
    }

    return context;
}

function normalizeUnitsMap(units = {}) {
    const trimmed = {};
    mergeUnitsInto(trimmed, units);
    return trimmed;
}

function initializeSectionState(sections = {}) {
    const state = {};
    const meta = {};
    SECTION_NAMES.forEach((name) => {
        const entry = sections[name];
        state[name] = entry && entry.values ? { ...entry.values } : {};
        meta[name] = entry && entry.meta ? { ...entry.meta } : {};
    });
    return { state, meta };
}

function createUnitsProxy(instance, sectionName) {
    return new Proxy({}, {
        get(_, key) {
            const canonical = resolveStyleKey(sectionName, key);
            if (!canonical) return undefined;
            return instance.units[canonical];
        },
        set(_, key, value) {
            const canonical = resolveStyleKey(sectionName, key);
            if (!canonical) return false;
            const trimmed = trimUnitValue(value);
            if (trimmed === undefined) {
                delete instance.units[canonical];
            } else {
                instance.units[canonical] = trimmed;
            }
            const sectionState = instance._sections?.[sectionName];
            if (sectionState && hasOwn.call(sectionState, canonical)) {
                instance.set({ [sectionName]: { [key]: sectionState[canonical] } });
            }
            return true;
        },
        ownKeys() {
            return Object.keys(instance._sections?.[sectionName] || {});
        },
        getOwnPropertyDescriptor() {
            return { enumerable: true, configurable: true };
        }
    });
}

function createSectionProxy(instance, sectionName) {
    const target = instance._sections[sectionName];
    const metaTarget = instance._sectionMeta[sectionName];
    const unitsProxy = createUnitsProxy(instance, sectionName);
    return new Proxy(target, {
        get(obj, key) {
            if (key === 'units') return unitsProxy;
            const canonical = resolveStyleKey(sectionName, key);
            if (!canonical) return undefined;
            if (hasOwn.call(obj, canonical)) return obj[canonical];
            if (metaTarget && hasOwn.call(metaTarget, canonical)) return metaTarget[canonical];
            return undefined;
        },
        set(_, key, value) {
            if (key === 'units') {
                if (value && typeof value === 'object') {
                    Object.keys(value).forEach((unitKey) => {
                        unitsProxy[unitKey] = value[unitKey];
                    });
                }
                return true;
            }
            instance.set({ [sectionName]: { [key]: value } });
            return true;
        },
        deleteProperty(_, key) {
            instance.set({ [sectionName]: { [key]: null } });
            return true;
        },
        ownKeys(obj) {
            const styleKeys = Reflect.ownKeys(obj);
            const metaKeys = metaTarget ? Reflect.ownKeys(metaTarget) : [];
            return Array.from(new Set([...styleKeys, ...metaKeys]));
        },
        getOwnPropertyDescriptor() {
            return { enumerable: true, configurable: true };
        }
    });
}

function mergeDeep(base = {}, extension = {}) {
    const output = Array.isArray(base) ? [...base] : { ...base };
    for (const key in extension) {
        if (!hasOwn.call(extension, key)) continue;
        const value = extension[key];
        if (
            value && typeof value === 'object' && !Array.isArray(value) &&
            hasOwn.call(output, key) && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])
        ) {
            output[key] = mergeDeep(output[key], value);
        } else {
            output[key] = value;
        }
    }
    return output;
}

function parseEventModifiers(modifiers) {
    if (!modifiers) return undefined;
    if (typeof modifiers === 'object' && !Array.isArray(modifiers)) {
        const options = {};
        let hasOption = false;
        ['capture', 'once', 'passive'].forEach((flag) => {
            if (modifiers[flag] !== undefined) {
                options[flag] = !!modifiers[flag];
                hasOption = true;
            }
        });
        return hasOption ? options : undefined;
    }
    const list = Array.isArray(modifiers) ? modifiers : [modifiers];
    const options = {};
    let hasOption = false;
    list.forEach((entry) => {
        if (typeof entry !== 'string') return;
        const token = entry.trim().toLowerCase();
        if (!token) return;
        if (token === 'capture' || token === 'cap') {
            options.capture = true;
            hasOption = true;
            return;
        }
        if (token === 'once') {
            options.once = true;
            hasOption = true;
            return;
        }
        if (token === 'passive') {
            options.passive = true;
            hasOption = true;
            return;
        }
        if (token === 'active') {
            options.passive = false;
            hasOption = true;
        }
    });
    return hasOption ? options : undefined;
}

function teardownEventBinding(binding) {
    if (!binding || typeof binding.cleanup !== 'function') return;
    binding.cleanup();
}

function clearAllEvents(instance) {
    if (!instance || !instance._eventBindings) {
        if (instance) instance.events = {};
        return;
    }
    Object.keys(instance._eventBindings).forEach((key) => {
        teardownEventBinding(instance._eventBindings[key]);
    });
    instance._eventBindings = {};
    instance.events = {};
}

function combineBindings(...bindings) {
    const active = bindings.filter((binding) => binding && typeof binding.cleanup === 'function');
    if (!active.length) return null;
    return {
        cleanup() {
            active.forEach((binding) => {
                try {
                    binding.cleanup();
                } catch (error) {
                    console.error('[Atome] event cleanup failed:', error);
                }
            });
        }
    };
}

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
                            console.warn('[Atome] unsupported resize handle style key:', key, error);
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
                        console.error('[Atome] resizable cleanup failed:', error);
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

const EVENT_BINDERS = {
    draggable: bindDraggableEvents,
    touchable: bindTouchableEvents,
    resizable: bindResizableEvents
};

function applyEvents(instance, eventsConfig) {
    if (!instance) return;
    if (eventsConfig === null) {
        clearAllEvents(instance);
        return;
    }
    if (!eventsConfig || typeof eventsConfig !== 'object') return;

    if (!instance._eventBindings) instance._eventBindings = {};
    if (!instance.events) instance.events = {};

    const nextEvents = mergeDeep({}, instance.events || {});

    for (const groupName in eventsConfig) {
        if (!hasOwn.call(eventsConfig, groupName)) continue;
        const groupConfig = eventsConfig[groupName];
        if (instance._eventBindings[groupName]) {
            teardownEventBinding(instance._eventBindings[groupName]);
            delete instance._eventBindings[groupName];
        }

        if (groupConfig === null || groupConfig === false) {
            delete nextEvents[groupName];
            continue;
        }

        if (!groupConfig || typeof groupConfig !== 'object') continue;

        const clonedConfig = mergeDeep({}, groupConfig);
        const binder = EVENT_BINDERS[groupName] || bindGenericEventGroup;
        const binding = binder(instance, groupName, clonedConfig);

        if (!binding) {
            delete nextEvents[groupName];
            continue;
        }

        instance._eventBindings[groupName] = binding;
        nextEvents[groupName] = clonedConfig;
    }

    instance.events = nextEvents;
}

function coerceNumeric(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length) {
            const numeric = Number(trimmed);
            if (!Number.isNaN(numeric)) return numeric;
        }
    }
    return value;
}

function convertDefaultsToAODL(defaults = {}) {
    const result = {};
    const geometry = {};
    const geometryUnits = {};
    const spatial = {};
    const spatialUnits = {};
    const visual = {};

    if (defaults.width !== undefined) geometry.width = coerceNumeric(defaults.width);
    if (defaults.height !== undefined) geometry.height = coerceNumeric(defaults.height);

    if (defaults.units && typeof defaults.units === 'object') {
        if (defaults.units.width) geometryUnits.width = defaults.units.width;
        if (defaults.units.height) geometryUnits.height = defaults.units.height;
        if (defaults.units.left) spatialUnits.left = defaults.units.left;
        if (defaults.units.top) spatialUnits.top = defaults.units.top;
    }

    if (defaults.left !== undefined) spatial.left = coerceNumeric(defaults.left);
    if (defaults.top !== undefined) spatial.top = coerceNumeric(defaults.top);

    if (defaults.background !== undefined) visual.background = defaults.background;
    if (defaults.color !== undefined) visual.textColor = defaults.color;

    if (Object.keys(geometry).length) {
        if (Object.keys(geometryUnits).length) geometry.units = geometryUnits;
        result.geometry = geometry;
    }

    if (Object.keys(spatial).length) {
        if (Object.keys(spatialUnits).length) spatial.units = spatialUnits;
        result.spatial = spatial;
    }

    if (Object.keys(visual).length) {
        result.visual = visual;
    }

    const nonSectionKeys = ['content', 'text', 'tag', 'type'];
    nonSectionKeys.forEach((key) => {
        if (defaults[key] !== undefined) result[key] = defaults[key];
    });

    return result;
}

function resolveParent(candidate) {
    const selector = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : '#view';
    if (typeof document !== 'undefined' && document.querySelector(selector)) return selector;
    return 'body';
}

function normalizeStyleValue(key, value, units) {
    if (value === null || value === undefined) return undefined;

    const resolveUnit = () => {
        if (units && hasOwn.call(units, key)) {
            const unit = units[key];
            if (typeof unit === 'string') {
                const trimmed = unit.trim();
                if (trimmed.length) return trimmed;
            }
        }
        return DEFAULT_UNIT_PROPS.has(key) ? 'px' : '';
    };

    if (typeof value === 'number') {
        const unit = resolveUnit();
        return unit ? `${value}${unit}` : `${value}`;
    }

    if (typeof value === 'string') {
        const trimmedValue = value.trim();
        if (!trimmedValue.length) return undefined;
        if (DEFAULT_UNIT_PROPS.has(key)) {
            const numeric = Number(trimmedValue);
            if (!Number.isNaN(numeric)) {
                const unit = resolveUnit();
                return unit ? `${numeric}${unit}` : `${numeric}`;
            }
        }
        return trimmedValue;
    }

    return value;
}

function Atome(params = {}) {
    if (!(this instanceof Atome)) return new Atome(params);

    const parsed = parseAtomeInput(params);
    const eventsConfig = parsed.config.events;
    if (eventsConfig !== undefined) delete parsed.config.events;
    const trimmedUnits = normalizeUnitsMap(parsed.units);
    const incomingId = parsed.config.id;
    const elementId = incomingId !== undefined ? String(incomingId) : `atome_${++atomeIdCounter}`;
    const parentSelector = resolveParent(parsed.config.parent);
    const displayText = parsed.config.text ?? parsed.config.content ?? '';

    const cssStyles = {};
    for (const key in parsed.styles) {
        if (!hasOwn.call(parsed.styles, key)) continue;
        const normalized = normalizeStyleValue(key, parsed.styles[key], trimmedUnits);
        if (normalized !== undefined) cssStyles[key] = normalized;
    }

    const element = $('div', {
        id: elementId,
        parent: parentSelector,
        css: cssStyles,
        text: displayText
    });

    if (element && element.dataset && parsed.config.tag !== undefined) {
        element.dataset.tag = parsed.config.tag;
    }

    this.element = element;
    this.units = { ...trimmedUnits };
    this._styles = { ...parsed.styles };
    this.styles = this._styles;

    Object.assign(this, parsed.config);
    this.id = elementId;
    this.parent = parsed.config.parent !== undefined ? parsed.config.parent : parentSelector;
    this.text = parsed.config.text;
    this.content = parsed.config.content;
    this.tag = parsed.config.tag;
    this.type = parsed.config.type;

    parsed.applied.forEach(({ canonicalKey, originalKey, value }) => {
        if (value === undefined || value === null) {
            delete this[canonicalKey];
            if (originalKey !== canonicalKey) delete this[originalKey];
        } else {
            this[canonicalKey] = value;
            if (originalKey !== canonicalKey) this[originalKey] = value;
        }
    });

    const sectionState = initializeSectionState(parsed.sections);
    this._sections = sectionState.state;
    this._sectionMeta = sectionState.meta;
    SECTION_NAMES.forEach((sectionName) => {
        if (!this._sections[sectionName]) this._sections[sectionName] = {};
        this[sectionName] = createSectionProxy(this, sectionName);
    });

    if (parsed.children.length) {
        this.children = parsed.children.map((childParams) => {
            const childConfig = { ...childParams };
            if (!childConfig.parent) childConfig.parent = `#${elementId}`;
            return new Atome(childConfig);
        });
    } else {
        this.children = [];
    }

    this._eventBindings = {};
    this.events = {};
    applyEvents(this, eventsConfig);

    return this;
}

Atome.prototype.set = function setAtome(next = {}) {
    if (!next || typeof next !== 'object') return this;
    if (!this.element) return this;

    const parsed = parseAtomeInput(next, { forUpdate: true });
    const eventsConfig = parsed.config.events;
    if (eventsConfig !== undefined) delete parsed.config.events;

    mergeUnitsInto(this.units, parsed.units);

    for (const key in parsed.styles) {
        if (!hasOwn.call(parsed.styles, key)) continue;
        const normalized = normalizeStyleValue(key, parsed.styles[key], this.units);
        if (normalized !== undefined) {
            this.element.style[key] = normalized;
            this._styles[key] = parsed.styles[key];
            this[key] = parsed.styles[key];
        } else {
            this.element.style[key] = '';
            delete this._styles[key];
            delete this[key];
        }
    }

    parsed.applied.forEach(({ canonicalKey, originalKey, value }) => {
        if (value === undefined || value === null) {
            delete this[canonicalKey];
            if (originalKey !== canonicalKey) delete this[originalKey];
        } else {
            this[canonicalKey] = value;
            if (originalKey !== canonicalKey) this[originalKey] = value;
        }
    });

    if (parsed.config.text !== undefined || parsed.config.content !== undefined) {
        const displayText = parsed.config.text ?? parsed.config.content ?? '';
        this.element.textContent = displayText;
        if (parsed.config.text !== undefined) this.text = parsed.config.text;
        if (parsed.config.content !== undefined) this.content = parsed.config.content;
    }

    if (parsed.config.tag !== undefined) {
        this.tag = parsed.config.tag;
        if (this.element.dataset) {
            if (parsed.config.tag === null || parsed.config.tag === '') {
                delete this.element.dataset.tag;
            } else {
                this.element.dataset.tag = parsed.config.tag;
            }
        }
    }

    if (parsed.config.type !== undefined) this.type = parsed.config.type;
    if (parsed.config.parent !== undefined) this.parent = parsed.config.parent;

    for (const configKey in parsed.config) {
        if (!hasOwn.call(parsed.config, configKey)) continue;
        if (configKey === 'text' || configKey === 'content' || configKey === 'tag' || configKey === 'type' || configKey === 'parent' || configKey === 'id' || configKey === 'events') continue;
        this[configKey] = parsed.config[configKey];
    }

    for (const sectionName in parsed.sections) {
        if (!hasOwn.call(parsed.sections, sectionName)) continue;
        const entry = parsed.sections[sectionName];
        if (!entry) continue;
        if (entry.values && typeof entry.values === 'object') {
            const valuesTarget = this._sections[sectionName] || (this._sections[sectionName] = {});
            for (const cssKey in entry.values) {
                if (!hasOwn.call(entry.values, cssKey)) continue;
                const incoming = entry.values[cssKey];
                if (incoming === undefined || incoming === null) delete valuesTarget[cssKey];
                else valuesTarget[cssKey] = incoming;
            }
        }
        if (entry.meta && typeof entry.meta === 'object') {
            const metaTarget = this._sectionMeta[sectionName] || (this._sectionMeta[sectionName] = {});
            for (const metaKey in entry.meta) {
                if (!hasOwn.call(entry.meta, metaKey)) continue;
                const incomingMeta = entry.meta[metaKey];
                if (incomingMeta === undefined || incomingMeta === null) delete metaTarget[metaKey];
                else metaTarget[metaKey] = incomingMeta;
            }
        }
    }

    if (parsed.children.length) {
        if (!Array.isArray(this.children)) this.children = [];
        parsed.children.forEach((childParams) => {
            const childConfig = { ...childParams };
            if (!childConfig.parent) childConfig.parent = `#${this.id}`;
            const child = new Atome(childConfig);
            this.children.push(child);
        });
    }

    if (eventsConfig !== undefined) {
        if (!this._eventBindings) this._eventBindings = {};
        if (!this.events) this.events = {};
        applyEvents(this, eventsConfig);
    }

    return this;
};

Atome.box = function box(params = {}) {
    const { mergeDefaults = true, ...rest } = params || {};
    if (!mergeDefaults) return new Atome(rest);
    const defaultsSource = (typeof globalThis !== 'undefined' && globalThis.atomeDefaultsParams)
        ? globalThis.atomeDefaultsParams
        : atomeDefaultsParams;
    const mergedPayload = mergeDeep(convertDefaultsToAODL(defaultsSource), rest);
    return new Atome(mergedPayload);
};

if (typeof globalThis !== 'undefined') {
    globalThis.Atome = Atome;
    globalThis.atomeDefaultsParams = atomeDefaultsParams;
    globalThis.Atome.box = Atome.box;
}
