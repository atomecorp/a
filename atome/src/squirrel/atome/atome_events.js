// Extracted from atome.js: event helpers (modifiers, teardown, realtime patch queue).


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
                }
            });
        }
    };
}

const _realtimePatchStateByInstance = new WeakMap();
const REALTIME_MIN_INTERVAL_MS = 33;

function getAtomeIdFromInstance(instance) {
    if (!instance) return null;
    const direct = instance.atomeId || instance.atome_id || instance.id || instance.uuid || instance.uid;
    if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct);
    const elId = instance.element && instance.element.id ? String(instance.element.id) : '';
    if (!elId) return null;
    if (elId.startsWith('atome_')) return elId.slice('atome_'.length);
    return elId;
}

function queueRealtimePatch(instance, properties) {
    if (!instance || !properties || typeof properties !== 'object') return;

    const api = globalThis.AdoleAPI;
    if (!api || !api.atomes || typeof api.atomes.realtimePatch !== 'function') return;

    const atomeId = getAtomeIdFromInstance(instance);
    if (!atomeId) return;

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const state = _realtimePatchStateByInstance.get(instance) || { lastAt: 0, timer: null, pending: null };

    state.pending = state.pending ? { ...state.pending, ...properties } : { ...properties };

    const flush = () => {
        state.timer = null;
        const payload = state.pending;
        state.pending = null;
        state.lastAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        
            api.atomes.realtimePatch(atomeId, payload);
        
    };

    const elapsed = now - state.lastAt;
    if (elapsed >= REALTIME_MIN_INTERVAL_MS && !state.timer) {
        flush();
    } else if (!state.timer) {
        const delay = Math.max(0, REALTIME_MIN_INTERVAL_MS - elapsed);
        state.timer = setTimeout(flush, delay);
    }

    _realtimePatchStateByInstance.set(instance, state);
}


export {
    parseEventModifiers, teardownEventBinding, clearAllEvents, combineBindings, _realtimePatchStateByInstance, REALTIME_MIN_INTERVAL_MS, getAtomeIdFromInstance, queueRealtimePatch
};
