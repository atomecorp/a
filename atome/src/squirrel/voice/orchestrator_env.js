export const defaultEnv = () => (typeof window !== 'undefined' ? window : globalThis);

export const resolveHostEnv = (env = null) => {
    if (env?.window && typeof env.window === 'object') return env.window;
    if (
        env
        && typeof env === 'object'
        && (
            typeof env.handleAtomeMCPRequestAsync === 'function'
            || typeof env.handleAtomeMCPRequest === 'function'
        )
    ) {
        return env;
    }
    const hasExplicitBusinessApis = !!(
        env?.Squirrel?.mail
        || env?.Squirrel?.contacts
        || env?.Squirrel?.calendar
        || env?.atome?.mail
        || env?.atome?.contacts
        || env?.atome?.calendar
        || env?.AtomeMail
        || env?.AtomeContacts
        || env?.AtomeCalendar
    );
    if (
        env
        && typeof env === 'object'
        && hasExplicitBusinessApis
    ) {
        return env;
    }
    if (
        env
        && typeof env === 'object'
        && (
            env.location
            || env.fetch
            || env.document
            || env.navigator
            || env.__TAURI__
            || env.__TAURI_INTERNALS__
        )
    ) {
        return env;
    }
    return defaultEnv();
};

export const hasExplicitBusinessConnectorHost = (env = null) => {
    const hostEnv = resolveHostEnv(env);
    return !!(
        hostEnv?.Squirrel?.mail
        || hostEnv?.Squirrel?.contacts
        || hostEnv?.Squirrel?.calendar
        || hostEnv?.Squirrel?.messages
        || hostEnv?.atome?.mail
        || hostEnv?.atome?.contacts
        || hostEnv?.atome?.calendar
        || hostEnv?.atome?.messages
        || env?.Squirrel?.mail
        || env?.Squirrel?.contacts
        || env?.Squirrel?.calendar
        || env?.Squirrel?.messages
        || env?.atome?.mail
        || env?.atome?.contacts
        || env?.atome?.calendar
        || env?.atome?.messages
    );
};

export const cloneValue = (value) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

export const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

export const dispatchWindowEvent = (env, name, detail) => {
    if (!env || typeof env.dispatchEvent !== 'function') return;
    if (!name || typeof env.CustomEvent !== 'function') return;
    try {
        env.dispatchEvent(new env.CustomEvent(name, { detail }));
    } catch (_) {
        // Ignore non-browser hosts.
    }
};
