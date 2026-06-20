export function ensureAIAgent() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for MCP bridge');
    }
    if (!globalThis.AtomeAI || typeof globalThis.AtomeAI.listTools !== 'function') {
        throw new Error('AtomeAI is not available');
    }
    return globalThis.AtomeAI;
}

export function ensureRuntimeToolApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for MCP bridge');
    }
    const runtime = globalThis.atome?.tools?.v2Runtime || globalThis.window?.atome?.tools?.v2Runtime || null;
    if (!runtime || typeof runtime.invokeById !== 'function') {
        throw new Error('Runtime V2 MCP bridge is not available');
    }
    return runtime;
}

export function ensureRuntimeCommandBus() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for runtime command bus');
    }
    const bus = globalThis.atome?.tools?.v2CommandBus || globalThis.window?.atome?.tools?.v2CommandBus || null;
    if (!bus || typeof bus.listEvents !== 'function') {
        throw new Error('Runtime V2 command bus is not available');
    }
    return bus;
}

export function ensureMailApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for mail bridge');
    }
    const api = globalThis.atome?.mail || globalThis.window?.atome?.mail || globalThis.Squirrel?.mail || globalThis.window?.Squirrel?.mail || null;
    if (!api || typeof api.list !== 'function') {
        throw new Error('Mail API is not available');
    }
    return api;
}

export function ensureContactsApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for contacts bridge');
    }
    const api = globalThis.atome?.contacts || globalThis.window?.atome?.contacts || globalThis.Squirrel?.contacts || globalThis.window?.Squirrel?.contacts || null;
    if (!api || typeof api.list !== 'function') {
        throw new Error('Contacts API is not available');
    }
    return api;
}

export function getOptionalMessagesApi() {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.atome?.messages
        || globalThis.window?.atome?.messages
        || globalThis.Squirrel?.messages
        || globalThis.window?.Squirrel?.messages
        || null;
}

export function ensureMessagesApi() {
    const api = getOptionalMessagesApi();
    if (!api || typeof api.list !== 'function') {
        throw new Error('Messages API is not available');
    }
    return api;
}

export function ensureCalendarApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for calendar bridge');
    }
    const api = globalThis.atome?.calendar || globalThis.window?.atome?.calendar || globalThis.Squirrel?.calendar || globalThis.window?.Squirrel?.calendar || null;
    if (!api || typeof api.today !== 'function') {
        throw new Error('Calendar API is not available');
    }
    return api;
}

export async function prepareContactsApi(options = {}) {
    const api = ensureContactsApi();
    if (typeof api.ensureReady === 'function') {
        const ready = await Promise.race([
            Promise.resolve().then(() => api.ensureReady({
                ...options
            })),
            new Promise((resolve) => {
                setTimeout(() => resolve({
                    ok: false,
                    error: 'contacts_sync_timeout'
                }), 1500);
            })
        ]);
        if (ready?.ok !== false) return api;
        const cached = typeof api.list === 'function' ? api.list({ limit: 1 }) : null;
        if (Array.isArray(cached?.items) && cached.items.length) {
            return api;
        }
        return api;
    }
    if (typeof api.configureMacosSource === 'function') {
        api.configureMacosSource(options);
    }
    if (typeof api.syncPull === 'function') {
        const syncResult = await api.syncPull({});
        if (syncResult?.ok !== true) {
            const cached = typeof api.list === 'function' ? api.list({ limit: 1 }) : null;
            if (!Array.isArray(cached?.items) || !cached.items.length) {
                throw new Error(syncResult?.error || 'contacts_sync_failed');
            }
        }
    }
    return api;
}

export function ensureBankApi() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for bank bridge');
    }
    const api = globalThis.atome?.bank || globalThis.window?.atome?.bank || globalThis.Squirrel?.bank || globalThis.window?.Squirrel?.bank || null;
    if (!api || typeof api.accounts !== 'function') {
        throw new Error('Bank API is not available');
    }
    return api;
}

export function getOptionalVoiceApi() {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.atome?.voice || globalThis.window?.atome?.voice || globalThis.Squirrel?.voice || globalThis.window?.Squirrel?.voice || null;
}
