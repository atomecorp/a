import { resolveHostEnv } from './orchestrator_env.js';

export const resolveMailApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    const existing = hostEnv?.Squirrel?.mail || hostEnv?.atome?.mail || hostEnv?.AtomeMail || env?.Squirrel?.mail || env?.atome?.mail || env?.AtomeMail || null;
    if (existing) return existing;
    const autoBootstrapAllowed = !!(
        hostEnv?.location
        || hostEnv?.document
        || hostEnv?.navigator
        || hostEnv?.fetch
        || hostEnv?.__TAURI__
        || hostEnv?.__TAURI_INTERNALS__
        || typeof window !== 'undefined'
    );
    if (!autoBootstrapAllowed) return null;
    const mod = await import('../mail/bootstrap.js');
    if (typeof mod?.createGlobalMailApi === 'function') {
        return mod.createGlobalMailApi({ env: hostEnv });
    }
    return null;
};

export const readExistingMailApi = (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.mail || hostEnv?.atome?.mail || hostEnv?.AtomeMail || env?.Squirrel?.mail || env?.atome?.mail || env?.AtomeMail || null;
};

export const resolveMessagesApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.messages
        || hostEnv?.atome?.messages
        || hostEnv?.AtomeMessages
        || env?.Squirrel?.messages
        || env?.atome?.messages
        || env?.AtomeMessages
        || null;
};

export const readExistingMessagesApi = (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.messages
        || hostEnv?.atome?.messages
        || hostEnv?.AtomeMessages
        || env?.Squirrel?.messages
        || env?.atome?.messages
        || env?.AtomeMessages
        || null;
};

export const resolveContactsApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    const existing = hostEnv?.Squirrel?.contacts || hostEnv?.atome?.contacts || hostEnv?.AtomeContacts || env?.Squirrel?.contacts || env?.atome?.contacts || env?.AtomeContacts || null;
    if (existing) return existing;
    const autoBootstrapAllowed = !!(
        hostEnv?.location
        || hostEnv?.document
        || hostEnv?.navigator
        || hostEnv?.fetch
        || hostEnv?.__TAURI__
        || hostEnv?.__TAURI_INTERNALS__
        || typeof window !== 'undefined'
    );
    if (!autoBootstrapAllowed) return null;
    const mod = await import('../contacts/bootstrap.js');
    if (typeof mod?.createGlobalContactsApi === 'function') {
        return mod.createGlobalContactsApi({ env: hostEnv });
    }
    return null;
};

export const readExistingContactsApi = (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.contacts || hostEnv?.atome?.contacts || hostEnv?.AtomeContacts || env?.Squirrel?.contacts || env?.atome?.contacts || env?.AtomeContacts || null;
};

export const resolveCalendarApi = async (env) => {
    const hostEnv = resolveHostEnv(env);
    const existing = hostEnv?.Squirrel?.calendar || hostEnv?.atome?.calendar || hostEnv?.AtomeCalendar || env?.Squirrel?.calendar || env?.atome?.calendar || env?.AtomeCalendar || null;
    if (existing) return existing;
    const autoBootstrapAllowed = !!(
        hostEnv?.location
        || hostEnv?.document
        || hostEnv?.navigator
        || hostEnv?.fetch
        || hostEnv?.__TAURI__
        || hostEnv?.__TAURI_INTERNALS__
        || typeof window !== 'undefined'
    );
    if (!autoBootstrapAllowed) return null;
    const mod = await import('../calendar/bootstrap.js');
    if (typeof mod?.createGlobalCalendarApi === 'function') {
        return mod.createGlobalCalendarApi({ env: hostEnv });
    }
    return null;
};

export const readExistingCalendarApi = (env) => {
    const hostEnv = resolveHostEnv(env);
    return hostEnv?.Squirrel?.calendar || hostEnv?.atome?.calendar || hostEnv?.AtomeCalendar || env?.Squirrel?.calendar || env?.atome?.calendar || env?.AtomeCalendar || null;
};
