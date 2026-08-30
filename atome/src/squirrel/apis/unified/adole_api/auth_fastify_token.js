// Extracted from auth.js: Fastify token management — login cache persistence + relogin throttling + ensureFastifyToken(Local).
import { TauriAdapter, FastifyAdapter } from '../adole.js';
import { getFastifyHttpBaseUrl } from '../adole_backend.js';
import { isTauriRuntime } from './runtime.js';
import { getSessionState } from './session.js';
import { createTechnicalUsername, normalizePhone } from './auth_core.js';
import { loginBackend, meBackend } from './auth_backends.js';
import { provisionFastifyCounterpart } from './auth_remote_provisioning.js';

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

const markFastifyAuthValid = () => {
    if (typeof window !== 'undefined') window.__SQUIRREL_FASTIFY_AUTH_INVALID__ = false;
};

const configureTauriRemoteSync = async () => {
    if (!isTauriRuntime()) return { ok: true, reason: 'not_tauri_runtime' };
    const remoteToken = FastifyAdapter?.getToken?.();
    const localToken = TauriAdapter?.getToken?.();
    if (!remoteToken || !localToken) {
        return { ok: false, reason: 'sync_identity_token_missing' };
    }
    const [localSession, remoteSession] = await Promise.all([
        meBackend('tauri'),
        meBackend('fastify')
    ]);
    const localUserId = localSession?.user?.id ? String(localSession.user.id) : null;
    const remoteUserId = remoteSession?.user?.id ? String(remoteSession.user.id) : null;
    if (!localSession?.ok || !remoteSession?.ok || !localUserId || !remoteUserId) {
        return { ok: false, reason: 'sync_identity_principal_missing' };
    }
    const remoteUrl = String(getFastifyHttpBaseUrl() || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(remoteUrl)) {
        return { ok: false, reason: 'sync_remote_url_missing' };
    }
    const configuredFingerprint = typeof window !== 'undefined'
        ? String(window.__SQUIRREL_ENVIRONMENT_FINGERPRINT__ || '').trim()
        : '';
    const environmentFingerprint = configuredFingerprint || `${remoteUrl}|${remoteUserId}`;
    const configured = await TauriAdapter?.sync?.configureRemote?.({
        remote_user_id: remoteUserId,
        remote_token: remoteToken,
        remote_url: remoteUrl,
        environment_fingerprint: environmentFingerprint
    });
    if (!configured || configured.ok === false || configured.success === false) {
        return {
            ok: false,
            reason: configured?.error || 'sync_identity_configuration_failed'
        };
    }
    return {
        ok: true,
        reason: 'sync_identity_configured',
        local_user_id: localUserId,
        remote_user_id: remoteUserId
    };
};

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
            markFastifyAuthValid();
            // A browser can keep using the authenticated cookie, but the
            // native sync worker cannot: it needs the per-user bearer token
            // passed through the existing configure-remote authority. After a
            // Tauri restart the WebView cookie may survive while adapter
            // memory does not, so continue to the credential-backed login and
            // rebuild that in-memory bridge.
            if (!isTauriRuntime()) return { ok: true, reason: 'cookie_session' };
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
                    markFastifyAuthValid();
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
        const localSession = isTauriRuntime() ? await meBackend('tauri') : null;
        if (localSession?.ok && localSession.user?.id) {
            const provisioned = await provisionFastifyCounterpart({
                phone: cached.phone,
                password: cached.password,
                username: createTechnicalUsername(
                    state.user?.username || localSession.user.username || '',
                    cached.phone
                )
            });
            if (provisioned.ok) {
                fastifyReloginBlockedUntil = 0;
                fastifyReloginBlockedReason = null;
                markFastifyAuthValid();
                return { ok: true, reason: 'remote_counterpart_provisioned' };
            }
        }
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
    markFastifyAuthValid();
    return { ok: true, reason: 'cache_login_success' };
};

// `me` travels over the WebSocket, so an unreachable socket and a request that
// timed out both come back as `ok:false` — exactly like a refused token. The
// old code read that as "the token is dead", cleared it, and (with no cached
// password to re-login with) left the session credential-less until the next
// manual login. That is why a working feature kept turning itself off: a single
// transport hiccup destroyed a perfectly valid credential. Only a verdict that
// actually comes FROM the server may clear it now.
const isTransportFailure = (result) => {
    if (!result || result.ok) return false;
    const raw = result.raw || {};
    if (raw.offline === true) return true;
    if (raw.status === 0) return true;
    const error = String(result.error || raw.error || '').trim().toLowerCase();
    return error === 'request timeout'
        || error === 'server unreachable'
        || error === 'auth_unavailable'
        || error.includes('unreachable')
        || error.includes('timeout')
        || error.includes('not configured')
        || error.includes('not available');
};

const ensureFastifyToken = async () => {
    if (fastifyTokenEnsurePromise) return fastifyTokenEnsurePromise;
    fastifyTokenEnsurePromise = (async () => {
        const token = FastifyAdapter?.getToken?.();
        if (token) {
            const me = await meBackend('fastify');
            if (me?.ok) {
                markFastifyAuthValid();
                const sync = await configureTauriRemoteSync();
                return {
                    ok: true,
                    reason: 'token_valid',
                    ...(isTauriRuntime() ? { sync } : {})
                };
            }
            if (isTransportFailure(me)) {
                // Unproven, not invalid: keep the credential and let the actual
                // request be the judge — it answers 401 if the token is dead,
                // and that path re-mints it.
                return { ok: true, reason: 'token_validation_unavailable', unverified: true };
            }
            FastifyAdapter?.clearToken?.();
            if (typeof window !== 'undefined') window.__SQUIRREL_FASTIFY_AUTH_INVALID__ = true;
        }
        try {
            const result = await ensureFastifyTokenLocal();
            if (result?.ok) {
                const sync = await configureTauriRemoteSync();
                return {
                    ok: true,
                    reason: result?.reason || 'token_obtained',
                    ...(isTauriRuntime() ? { sync } : {})
                };
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


export {
    isTransportFailure,
    loadFastifyLoginCache,
    persistFastifyLoginCache,
    ensureFastifyTokenLocal,
    ensureFastifyToken,
    markFastifyAuthValid,
    configureTauriRemoteSync
};
