// Extracted from auth.js: Fastify token management — login cache persistence + relogin throttling + ensureFastifyToken(Local).
import { TauriAdapter, FastifyAdapter } from '../adole.js';
import { isTauriRuntime } from './runtime.js';
import { getSessionState } from './session.js';
import { normalizePhone } from './auth_core.js';
import { loginBackend, meBackend } from './auth_backends.js';

const loadFastifyLoginCache = () => {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem('fastify_login_cache_v1');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const phone = normalizePhone(parsed.phone || '');
        const password = String(parsed.password || '');
        if (!phone || !password) return null;
        if (password.trim().toLowerCase() === 'anonymous') return null;
        return { phone, password };
    } catch (_) {
        return null;
    }
};

const isAnonymousLikePhone = (phone) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;
    if (normalized === '0000000000' || normalized === '0000000001') return true;
    if (normalized.startsWith('999')) return true;
    return false;
};

const persistFastifyLoginCache = ({ phone, password } = {}) => {
    if (typeof localStorage === 'undefined') return;
    const normalizedPhone = normalizePhone(phone || '');
    const plainPassword = String(password || '');
    if (!normalizedPhone || !plainPassword) return;
    if (isAnonymousLikePhone(normalizedPhone)) return;
    
        localStorage.setItem('fastify_login_cache_v1', JSON.stringify({
            phone: normalizedPhone,
            password: plainPassword,
            updated_at: new Date().toISOString()
        }));
    
};

const FASTIFY_RELOGIN_RETRY_MS = 60000;
const FASTIFY_RELOGIN_FAILURE_MS = 10000;
let fastifyTokenEnsurePromise = null;
let fastifyReloginBlockedUntil = 0;
let fastifyReloginBlockedReason = null;

const readNow = () => Date.now();

const blockFastifyRelogin = (reason, durationMs) => {
    const delay = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : FASTIFY_RELOGIN_FAILURE_MS;
    fastifyReloginBlockedUntil = readNow() + delay;
    fastifyReloginBlockedReason = reason || 'login_failed';
};

const readFastifyReloginBlock = () => {
    if (!fastifyReloginBlockedUntil) return null;
    const remainingMs = fastifyReloginBlockedUntil - readNow();
    if (remainingMs <= 0) {
        fastifyReloginBlockedUntil = 0;
        fastifyReloginBlockedReason = null;
        return null;
    }
    return {
        ok: false,
        reason: fastifyReloginBlockedReason || 'login_retry_delayed',
        retry_after_ms: remainingMs
    };
};

const ensureFastifyTokenLocal = async () => {
    const existing = FastifyAdapter?.getToken?.();
    if (existing) return { ok: true, reason: 'token_present' };

    const state = getSessionState();
    if (state?.mode !== 'authenticated') {
        return { ok: false, reason: 'not_authenticated' };
    }

    try {
        const cookieSession = await meBackend('fastify');
        const expectedUserId = state?.user?.id ? String(state.user.id) : null;
        const resolvedUserId = cookieSession?.user?.id ? String(cookieSession.user.id) : null;
        if (cookieSession?.ok && resolvedUserId && (!expectedUserId || resolvedUserId === expectedUserId)) {
            if (typeof window !== 'undefined') window.__SQUIRREL_FASTIFY_AUTH_INVALID__ = false;
            return { ok: true, reason: 'cookie_session' };
        }
    } catch (_) {
        // Continue with token bridge or cached credentials.
    }

    // In dev/local Tauri setups, Fastify and Tauri can share JWT secret.
    // If local token is accepted by Fastify, reuse it immediately.
    if (isTauriRuntime()) {
        const tauriToken = TauriAdapter?.getToken?.();
        if (tauriToken) {
            try {
                FastifyAdapter?.setToken?.(tauriToken);
                const me = await meBackend('fastify');
                const expectedUserId = state?.user?.id ? String(state.user.id) : null;
                const resolvedUserId = me?.user?.id ? String(me.user.id) : null;
                if (me?.ok && resolvedUserId && (!expectedUserId || resolvedUserId === expectedUserId)) {
                    
                        if (typeof window !== 'undefined') window.__SQUIRREL_FASTIFY_AUTH_INVALID__ = false;
                    
                    return { ok: true, reason: 'tauri_token_bridge' };
                }
            } catch (_) {
                // Ignore and continue with credential cache fallback.
            }
            FastifyAdapter?.clearToken?.();
        }
    }

    const blocked = readFastifyReloginBlock();
    if (blocked) return blocked;

    const cached = loadFastifyLoginCache();
    if (!cached?.phone || !cached?.password) {
        return { ok: false, reason: 'missing_login_cache' };
    }

    if (state?.user?.phone) {
        const statePhone = normalizePhone(state.user.phone);
        if (statePhone && statePhone !== cached.phone) {
            return { ok: false, reason: 'cache_phone_mismatch' };
        }
    }

    const loginResult = await loginBackend('fastify', {
        phone: cached.phone,
        password: cached.password
    });
    if (!loginResult.ok) {
        const status = Number(loginResult?.raw?.status || 0);
        blockFastifyRelogin(
            status === 429 ? 'login_rate_limited' : 'cache_login_failed',
            status === 429 ? FASTIFY_RELOGIN_RETRY_MS : FASTIFY_RELOGIN_FAILURE_MS
        );
        return {
            ok: false,
            reason: status === 429 ? 'login_rate_limited' : 'cache_login_failed',
            error: loginResult.error || null
        };
    }
    fastifyReloginBlockedUntil = 0;
    fastifyReloginBlockedReason = null;
    
        if (typeof window !== 'undefined') window.__SQUIRREL_FASTIFY_AUTH_INVALID__ = false;
    
    return { ok: true, reason: 'cache_login_success' };
};

const ensureFastifyToken = async () => {
    if (fastifyTokenEnsurePromise) return fastifyTokenEnsurePromise;
    fastifyTokenEnsurePromise = (async () => {
        const token = FastifyAdapter?.getToken?.();
        if (token) {
            const me = await meBackend('fastify');
            if (me?.ok) {
                if (typeof window !== 'undefined') window.__SQUIRREL_FASTIFY_AUTH_INVALID__ = false;
                return { ok: true, reason: 'token_valid' };
            }
            FastifyAdapter?.clearToken?.();
            if (typeof window !== 'undefined') window.__SQUIRREL_FASTIFY_AUTH_INVALID__ = true;
        }
        try {
            const result = await ensureFastifyTokenLocal();
            if (result?.ok) {
                return { ok: true, reason: result?.reason || 'token_obtained' };
            }
            return {
                ok: false,
                reason: result?.reason || 'missing_token',
                error: result?.error || null
            };
        } catch (error) {
            return { ok: false, reason: 'ensure_failed', error: error?.message || String(error) };
        }
    })();
    try {
        return await fastifyTokenEnsurePromise;
    } finally {
        fastifyTokenEnsurePromise = null;
    }
};


export { loadFastifyLoginCache, persistFastifyLoginCache, ensureFastifyTokenLocal, ensureFastifyToken };
