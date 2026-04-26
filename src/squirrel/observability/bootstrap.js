import '../dev/logging.js';

const OBSERVABILITY_KEY = '__SQUIRREL_OBSERVABILITY_API__';
const STORE_KEY = '__SQUIRREL_OBSERVABILITY_STORE__';
const UNBIND_KEY = '__SQUIRREL_OBSERVABILITY_UNBIND__';
const LIMIT = 300;

const cloneValue = (value) => {
    if (value === undefined) return undefined;
    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(value);
        }
    } catch (_) {
        // Fall through to JSON clone below.
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return null;
    }
};

const nowIso = () => new Date().toISOString();

const trim = (store) => {
    if (!Array.isArray(store)) return;
    if (store.length > LIMIT) {
        store.splice(0, store.length - LIMIT);
    }
};

const classifyLevel = (channel, type, payload = {}) => {
    const normalizedType = String(type || '').toLowerCase();
    if (channel === 'runtime' && payload?.kind && String(payload.kind).toLowerCase().includes('error')) {
        return 'error';
    }
    if (normalizedType.includes('failed') || normalizedType.includes('denied') || normalizedType.includes('rate_limit')) {
        return 'error';
    }
    if (payload?.error || payload?.ok === false) {
        return 'error';
    }
    if (normalizedType.includes('cancelled') || normalizedType.includes('interruption')) {
        return 'warn';
    }
    return 'info';
};

const installGlobals = (env, api) => {
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.observability = api;

    env.atome = env.atome || {};
    env.atome.observability = api;
    env.atome.tools = env.atome.tools || {};
    env.atome.tools.observability = api;

    env.AtomeObservability = api;
    return api;
};

const getStore = (env) => {
    if (env[STORE_KEY]) return env[STORE_KEY];
    env[STORE_KEY] = [];
    return env[STORE_KEY];
};

const pushEntry = (env, channel, type, payload = {}) => {
    const store = getStore(env);
    const entry = {
        seq: store.length + 1,
        at: nowIso(),
        channel: String(channel || 'unknown'),
        type: String(type || 'event'),
        level: classifyLevel(channel, type, payload),
        payload: cloneValue(payload) || {}
    };
    store.push(entry);
    trim(store);
    return entry;
};

const bindBrowserEvent = (env, name, channel) => {
    if (!env || typeof env.addEventListener !== 'function') {
        return () => { };
    }
    const handler = (event) => {
        const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
        pushEntry(env, channel, detail.type || name, detail.payload || detail);
    };
    env.addEventListener(name, handler);
    return () => {
        if (typeof env.removeEventListener === 'function') {
            env.removeEventListener(name, handler);
        }
    };
};

const bindRuntimeBus = (env) => {
    const bus = env?.atome?.tools?.v2CommandBus || env?.window?.atome?.tools?.v2CommandBus || null;
    if (!bus || typeof bus.subscribe !== 'function') {
        return () => { };
    }
    const unsubscribe = bus.subscribe((event = {}) => {
        pushEntry(env, 'runtime', event.kind || 'runtime.event', event);
    });
    return typeof unsubscribe === 'function' ? unsubscribe : () => { };
};

const bindSources = (env) => {
    const unbind = [
        bindBrowserEvent(env, 'squirrel:mcp', 'mcp'),
        bindBrowserEvent(env, 'squirrel:voice', 'voice'),
        bindBrowserEvent(env, 'squirrel:voice:mcp', 'voice_mcp'),
        bindBrowserEvent(env, 'squirrel:voice:orchestrator', 'voice_orchestrator'),
        bindRuntimeBus(env)
    ];
    return () => {
        unbind.forEach((stop) => {
            if (typeof stop === 'function') stop();
        });
    };
};

export const createGlobalObservabilityApi = ({
    env = globalThis
} = {}) => {
    if (!env || typeof env !== 'object') {
        throw new Error('Global observability bootstrap requires an object-like environment');
    }
    if (env[OBSERVABILITY_KEY]) return env[OBSERVABILITY_KEY];

    env[UNBIND_KEY] = bindSources(env);

    const api = {
        list(options = {}) {
            const channel = String(options.channel || '').trim() || null;
            const level = String(options.level || '').trim() || null;
            const limit = Number.isFinite(Number(options.limit))
                ? Math.max(1, Math.round(Number(options.limit)))
                : 50;
            return {
                ok: true,
                items: getStore(env)
                    .filter((entry) => (!channel || entry.channel === channel) && (!level || entry.level === level))
                    .slice(-limit)
                    .map((entry) => cloneValue(entry))
            };
        },
        summary() {
            const items = getStore(env);
            return {
                ok: true,
                total: items.length,
                errors: items.filter((entry) => entry.level === 'error').length,
                warnings: items.filter((entry) => entry.level === 'warn').length,
                channels: Array.from(new Set(items.map((entry) => entry.channel)))
            };
        },
        clear() {
            getStore(env).splice(0, getStore(env).length);
            return { ok: true };
        }
    };

    env[OBSERVABILITY_KEY] = installGlobals(env, api);
    return env[OBSERVABILITY_KEY];
};

export const bootstrapGlobalObservability = ({
    env = (typeof window !== 'undefined' ? window : globalThis)
} = {}) => createGlobalObservabilityApi({ env });

if (typeof window !== 'undefined') {
    bootstrapGlobalObservability({ env: window });
}
