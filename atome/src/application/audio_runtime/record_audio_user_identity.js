const extractUserId = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed && trimmed !== 'anonymous' ? trimmed : null;
    }
    if (typeof value !== 'object') return null;
    const user = value.logged && value.user ? value.user : value;
    const nested = user.user || user.currentUser || user.current_user || null;
    return extractUserId(user.user_id)
        || extractUserId(user.userId)
        || extractUserId(user.atome_id)
        || extractUserId(user.atomeId)
        || extractUserId(user.id)
        || extractUserId(nested);
};

const readStoredUserId = (storage) => {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const keys = ['current_user', 'currentUser', 'adole_current_user', 'auth_user', 'user', 'user_id', 'userId'];
    for (const key of keys) {
        let raw = null;
        try { raw = storage.getItem(key); } catch (_) { raw = null; }
        if (!raw) continue;
        const trimmed = String(raw).trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const parsedId = extractUserId(JSON.parse(trimmed));
                if (parsedId) return parsedId;
            } catch (_) { }
        } else {
            const direct = extractUserId(trimmed);
            if (direct) return direct;
        }
    }
    return null;
};

const callUserIdProvider = (provider) => {
    if (typeof provider !== 'function') return null;
    try { return provider(); } catch (_) { return null; }
};

const resolveUserIdSync = (env) => {
    const api = env.AdoleAPI || null;
    return extractUserId(env.__currentUser)
        || extractUserId(env.__CURRENT_USER__)
        || extractUserId(env.currentUser)
        || extractUserId(callUserIdProvider(api?.auth?.getCurrentInfo?.bind(api.auth)))
        || extractUserId(api?.auth?.currentUser)
        || extractUserId(api?.auth?.user)
        || extractUserId(callUserIdProvider(api?.security?.getAnonymousUserId?.bind(api.security)))
        || readStoredUserId(env.localStorage)
        || readStoredUserId(env.sessionStorage)
        || null;
};

const withTimeout = (promise, ms) => new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(null);
    }, ms);
    Promise.resolve(promise).then((value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
    }).catch(() => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(null);
    });
});

export const resolveRecordingUserId = async (env = globalThis) => {
    const syncUserId = resolveUserIdSync(env);
    if (syncUserId) return syncUserId;
    try {
        const auth = env.AdoleAPI?.auth;
        if (!auth) return null;
        if (typeof auth.getCurrentUser === 'function') {
            const userId = extractUserId(await withTimeout(auth.getCurrentUser(), 1500));
            if (userId) return userId;
        }
        if (typeof auth.current === 'function') {
            return extractUserId(await withTimeout(auth.current(), 1500));
        }
        return null;
    } catch (_) {
        return null;
    }
};
