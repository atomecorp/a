import { adapters, extractUser, normalizeUser } from './auth_core.js';

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

export { meBackend };
