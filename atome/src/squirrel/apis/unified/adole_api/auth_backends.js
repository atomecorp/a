// Extracted from auth.js: per-backend operations (login/register/bootstrap/me) + anonymous creds + availability.
import { checkBackends } from '../adole.js';
import { adapters, extractUser, extractToken, extractAlreadyExists, normalizeUser, isPhoneMatch } from './auth_core.js';

const loginBackend = async (backend, { phone, password }) => {
    const adapter = adapters[backend];
    if (!adapter?.auth?.login) return { ok: false, error: 'auth_unavailable' };
    const result = await adapter.auth.login({ phone, password });
    let ok = !!(result?.ok || result?.success);
    let user = normalizeUser(extractUser(result));
    if (ok && !user) {
        
            const me = await meBackend(backend);
            if (me.ok && me.user) user = me.user;
        
    }
    let error = ok ? null : (result?.error || 'login_failed');
    if (ok && !user) {
        ok = false;
        error = 'missing_user';
    }
    if (ok && !isPhoneMatch(user, phone)) {
        ok = false;
        user = null;
        adapter?.clearToken?.();
        error = 'phone_mismatch';
    }
    return {
        ok,
        user,
        token: extractToken(result),
        raw: result,
        error: ok ? null : error
    };
};

const registerBackend = async (backend, { phone, password, username, visibility }) => {
    const adapter = adapters[backend];
    if (!adapter?.auth?.register) return { ok: false, error: 'auth_unavailable' };
    const result = await adapter.auth.register({ phone, password, username, visibility });
    const alreadyExists = extractAlreadyExists(result);
    const token = extractToken(result);
    let ok = !!(result?.ok || result?.success);
    if (alreadyExists && !token) ok = false;
    let user = normalizeUser(extractUser(result));
    if (ok && !user) {
        
            const me = await meBackend(backend);
            if (me.ok && me.user) user = me.user;
        
    }
    let error = ok ? null : (result?.error || (alreadyExists ? 'user_exists' : 'register_failed'));
    if (ok && !user) {
        ok = false;
        error = 'missing_user';
    }
    if (ok && !isPhoneMatch(user, phone)) {
        ok = false;
        user = null;
        adapter?.clearToken?.();
        error = 'phone_mismatch';
    }
    return {
        ok,
        user,
        token,
        raw: result,
        error
    };
};

const bootstrapBackend = async (backend, { phone, password, username, visibility }) => {
    const adapter = adapters[backend];
    if (!adapter?.auth?.bootstrap) return { ok: false, error: 'auth_unavailable' };
    const result = await adapter.auth.bootstrap({ phone, password, username, visibility });
    let ok = !!(result?.ok || result?.success);
    let user = normalizeUser(extractUser(result));
    if (ok && !user) {
        
            const me = await meBackend(backend);
            if (me.ok && me.user) user = me.user;
        
    }
    let error = ok ? null : (result?.error || 'bootstrap_failed');
    if (ok && !user) {
        ok = false;
        error = 'missing_user';
    }
    if (ok && !isPhoneMatch(user, phone)) {
        ok = false;
        user = null;
        adapter?.clearToken?.();
        error = 'phone_mismatch';
    }
    return {
        ok,
        user,
        token: extractToken(result),
        raw: result,
        error
    };
};

const meBackend = async (backend) => {
    const adapter = adapters[backend];
    if (!adapter?.auth?.me) return { ok: false, error: 'auth_unavailable' };
    const result = await adapter.auth.me();
    const ok = !!(result?.ok || result?.success);
    return {
        ok,
        user: normalizeUser(extractUser(result)),
        raw: result,
        error: ok ? null : (result?.error || 'unauthenticated')
    };
};

const createAnonymousCredentials = () => {
    const randomSeed = Math.floor(100000000 + Math.random() * 900000000);
    const phone = `999${randomSeed}`;
    const password = `anon_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    return {
        phone,
        password,
        username: 'anonymous'
    };
};

const ensureBackendAvailability = async () => {
    try {
        return await checkBackends(true);
    } catch (_) {
        return { tauri: false, fastify: false };
    }
};


export { loginBackend, registerBackend, bootstrapBackend, meBackend, createAnonymousCredentials, ensureBackendAvailability };
