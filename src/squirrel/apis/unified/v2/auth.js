import { TauriAdapter, FastifyAdapter, checkBackends } from '../adole.js';
import { isTauriRuntime } from './runtime.js';
import { syncLocalProjectsToFastify } from './atomes.js';
import {
    getSessionState,
    setSessionState,
    clearSessionState,
    loadSessionState,
    getAnonymousCredentials,
    setAnonymousCredentials,
    clearCurrentProjectCache,
    waitForAuthCheck
} from './session.js';

const adapters = {
    tauri: TauriAdapter,
    fastify: FastifyAdapter
};

const normalizePhone = (phone) => String(phone || '').trim();
const normalizeUsername = (name) => String(name || '').trim();

const extractUser = (result) => {
    return result?.user
        || result?.data?.user
        || result?.data?.data?.user
        || result?.result?.user
        || null;
};

const extractToken = (result) => {
    return result?.token
        || result?.data?.token
        || result?.data?.data?.token
        || result?.result?.token
        || null;
};

const normalizeUser = (user) => {
    if (!user) return null;
    const id = user.user_id || user.userId || user.id || user.atome_id || null;
    if (!id) return null;
    return {
        id: String(id),
        name: user.username || user.name || null,
        phone: user.phone || null
    };
};

const getPrimaryBackend = () => (isTauriRuntime() ? 'tauri' : 'fastify');
const getSecondaryBackend = () => (isTauriRuntime() ? 'fastify' : 'tauri');

const hasToken = (backend) => !!adapters[backend]?.getToken?.();

const loginBackend = async (backend, { phone, password }) => {
    const adapter = adapters[backend];
    if (!adapter?.auth?.login) return { ok: false, error: 'auth_unavailable' };
    const result = await adapter.auth.login({ phone, password });
    const ok = !!(result?.ok || result?.success);
    return {
        ok,
        user: normalizeUser(extractUser(result)),
        token: extractToken(result),
        raw: result,
        error: ok ? null : (result?.error || 'login_failed')
    };
};

const registerBackend = async (backend, { phone, password, username, visibility }) => {
    const adapter = adapters[backend];
    if (!adapter?.auth?.register) return { ok: false, error: 'auth_unavailable' };
    const result = await adapter.auth.register({ phone, password, username, visibility });
    const ok = !!(result?.ok || result?.success);
    return {
        ok,
        user: normalizeUser(extractUser(result)),
        token: extractToken(result),
        raw: result,
        error: ok ? null : (result?.error || 'register_failed')
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

const migrateAnonymousWorkspace = async (fromUserId, toUserId) => {
    if (!fromUserId || !toUserId || String(fromUserId) === String(toUserId)) {
        return { ok: false, reason: 'invalid_ids' };
    }
    const backend = getPrimaryBackend();
    const adapter = adapters[backend];
    if (!adapter?.atome?.transferOwner) {
        return { ok: false, reason: 'transfer_unavailable' };
    }
    try {
        const res = await adapter.atome.transferOwner({
            fromOwnerId: fromUserId,
            toOwnerId: toUserId,
            includeCreator: true
        });
        const ok = !!(res?.ok || res?.success);
        if (ok) {
            try {
                syncLocalProjectsToFastify({ reason: 'anonymous-migration' }).catch(() => { });
            } catch (_) { }
        }
        return { ok, raw: res };
    } catch (e) {
        return { ok: false, reason: 'transfer_failed', error: e?.message || String(e) };
    }
};

const resolveAuthState = () => {
    const state = getSessionState();
    if (!state || state.mode === 'logged_out') return { authenticated: false, anonymous: false, user: null };
    return {
        authenticated: true,
        anonymous: state.mode === 'anonymous',
        user: state.user || null
    };
};

const requireAuth = (reason = 'auth_required') => {
    const state = resolveAuthState();
    if (!state.authenticated || !state.user?.id) {
        return { authenticated: false, error: reason, user: null };
    }
    if (state.anonymous) {
        return { authenticated: false, error: 'anonymous_not_allowed', user: state.user };
    }
    return { authenticated: true, error: null, user: state.user };
};

const normalizeSessionUser = (user) => {
    if (!user) return null;
    const id = user.id || user.user_id || user.userId || user.atome_id || null;
    if (!id) return null;
    return {
        id: String(id),
        name: user.name || user.username || null,
        phone: user.phone || null
    };
};

export const auth = {
    async register(phone, password, username, visibility = 'public') {
        const cleanPhone = normalizePhone(phone);
        const cleanName = normalizeUsername(username) || cleanPhone;
        if (!cleanPhone || !password || password.length < 8) {
            return {
                tauri: { success: false, error: 'invalid_credentials' },
                fastify: { success: false, error: 'invalid_credentials' }
            };
        }

        const availability = await ensureBackendAvailability();
        const primary = getPrimaryBackend();
        const secondary = getSecondaryBackend();

        const prevSession = getSessionState();
        const prevAnonymousId = prevSession?.mode === 'anonymous' ? prevSession.user?.id : null;

        const primaryResult = await registerBackend(primary, {
            phone: cleanPhone,
            password,
            username: cleanName,
            visibility
        });

        const response = {
            tauri: { success: false, data: null, error: null },
            fastify: { success: false, data: null, error: null }
        };
        response[primary] = {
            success: primaryResult.ok,
            data: primaryResult.raw,
            error: primaryResult.ok ? null : primaryResult.error
        };

        if (primaryResult.ok && availability[secondary]) {
            const secondaryResult = await registerBackend(secondary, {
                phone: cleanPhone,
                password,
                username: cleanName,
                visibility
            });
            response[secondary] = {
                success: secondaryResult.ok || secondaryResult.error === 'user_exists',
                data: secondaryResult.raw,
                error: secondaryResult.ok ? null : secondaryResult.error
            };
        }

        if (primaryResult.ok && primaryResult.user) {
            setSessionState({
                mode: 'authenticated',
                user: primaryResult.user,
                backend: primary
            });
            clearCurrentProjectCache();

            if (prevAnonymousId && String(prevAnonymousId) !== String(primaryResult.user.id)) {
                try { await migrateAnonymousWorkspace(prevAnonymousId, primaryResult.user.id); } catch (_) { }
            }

            try {
                syncLocalProjectsToFastify({ reason: 'register' }).catch(() => { });
            } catch (_) { }
        }

        return response;
    },

    async login(phone, password, username = '') {
        const cleanPhone = normalizePhone(phone);
        if (!cleanPhone || !password) {
            return {
                tauri: { success: false, error: 'missing_credentials' },
                fastify: { success: false, error: 'missing_credentials' }
            };
        }

        const availability = await ensureBackendAvailability();
        const primary = getPrimaryBackend();
        const secondary = getSecondaryBackend();

        const prevSession = getSessionState();
        const prevAnonymousId = prevSession?.mode === 'anonymous' ? prevSession.user?.id : null;

        const primaryResult = await loginBackend(primary, {
            phone: cleanPhone,
            password
        });

        const response = {
            tauri: { success: false, data: null, error: null },
            fastify: { success: false, data: null, error: null }
        };
        response[primary] = {
            success: primaryResult.ok,
            data: primaryResult.raw,
            error: primaryResult.ok ? null : primaryResult.error
        };

        let loggedUser = primaryResult.user;

        if (primaryResult.ok && availability[secondary]) {
            const secondaryResult = await loginBackend(secondary, {
                phone: cleanPhone,
                password
            });
            response[secondary] = {
                success: secondaryResult.ok,
                data: secondaryResult.raw,
                error: secondaryResult.ok ? null : secondaryResult.error
            };
            if (!loggedUser && secondaryResult.user) loggedUser = secondaryResult.user;
        }

        if (primaryResult.ok && loggedUser?.id) {
            setSessionState({
                mode: 'authenticated',
                user: loggedUser,
                backend: primary
            });
            clearCurrentProjectCache();

            if (prevAnonymousId && String(prevAnonymousId) !== String(loggedUser.id)) {
                try { await migrateAnonymousWorkspace(prevAnonymousId, loggedUser.id); } catch (_) { }
            }

            try {
                syncLocalProjectsToFastify({ reason: 'login' }).catch(() => { });
            } catch (_) { }
        }

        return response;
    },

    async logout() {
        try { await TauriAdapter?.auth?.logout?.(); } catch (_) { }
        try { await FastifyAdapter?.auth?.logout?.(); } catch (_) { }
        try { TauriAdapter?.clearToken?.(); } catch (_) { }
        try { FastifyAdapter?.clearToken?.(); } catch (_) { }
        clearSessionState();
        clearCurrentProjectCache();
        return {
            tauri: { success: true },
            fastify: { success: true }
        };
    },

    async current() {
        let state = getSessionState();

        if (state.mode === 'logged_out') {
            const stored = loadSessionState();
            if (stored && stored.mode && stored.mode !== 'logged_out') {
                try { await auth.tryAutoLogin(); } catch (_) { }
                state = getSessionState();
            }
        }

        if ((state.mode === 'authenticated' || state.mode === 'anonymous') && state.user?.id) {
            return {
                logged: true,
                user: {
                    user_id: state.user.id,
                    id: state.user.id,
                    username: state.user.name,
                    name: state.user.name,
                    phone: state.user.phone
                },
                source: state.backend || getPrimaryBackend(),
                anonymous: state.mode === 'anonymous'
            };
        }
        return { logged: false, user: null, source: null, anonymous: false };
    },

    async tryAutoLogin() {
        const stored = loadSessionState();
        if (!stored || stored.mode === 'logged_out') {
            clearSessionState();
            return { authenticated: false, user: null };
        }

        const primary = stored.backend || getPrimaryBackend();
        if (stored.mode === 'authenticated') {
            if (!hasToken(primary)) {
                clearSessionState();
                return { authenticated: false, user: null };
            }

            // Optimistically restore session to avoid spurious logout on startup.
            const restoredUser = normalizeSessionUser(stored.user);
            if (!restoredUser) {
                clearSessionState();
                return { authenticated: false, user: null };
            }
            setSessionState({
                mode: 'authenticated',
                user: restoredUser,
                backend: primary
            }, { silent: true });

            try {
                const me = await meBackend(primary);
                if (me.ok && me.user) {
                    setSessionState({
                        mode: 'authenticated',
                        user: me.user,
                        backend: primary
                    });
                    return { authenticated: true, user: me.user };
                }
                // If backend refuses auth explicitly, clear. Otherwise keep optimistic session.
                if (me.error === 'unauthenticated') {
                    clearSessionState();
                    return { authenticated: false, user: null };
                }
            } catch (_) { }

            return { authenticated: true, user: getSessionState().user };
        }

        if (stored.mode === 'anonymous') {
            // Restore anonymous session if possible without forcing login unless needed.
            const anonUser = normalizeSessionUser(stored.user);
            if (hasToken(primary) && anonUser?.id) {
                setSessionState({
                    mode: 'anonymous',
                    user: anonUser,
                    backend: primary
                });
                return { authenticated: true, user: anonUser, anonymous: true };
            }
            const anonResult = await auth.ensureAnonymousUser({ force: true });
            return {
                authenticated: !!anonResult?.ok,
                user: anonResult?.user || null,
                anonymous: true
            };
        }

        clearSessionState();
        return { authenticated: false, user: null };
    },

    async ensureAnonymousUser({ force = false } = {}) {
        const state = getSessionState();
        if (state.mode === 'authenticated') {
            return { ok: false, reason: 'authenticated', user: null };
        }
        if (state.mode === 'logged_out' && !force) {
            return { ok: false, reason: 'logged_out', user: null };
        }

        let creds = getAnonymousCredentials();
        if (!creds) {
            creds = createAnonymousCredentials();
            setAnonymousCredentials(creds);
        }

        const backend = getPrimaryBackend();
        const adapter = adapters[backend];

        if (adapter?.getToken?.()) {
            const me = await meBackend(backend);
            if (me.ok && me.user) {
                setSessionState({
                    mode: 'anonymous',
                    user: me.user,
                    backend
                });
                return { ok: true, user: me.user, source: backend };
            }
        }

        // Try login first
        const loginResult = await loginBackend(backend, {
            phone: creds.phone,
            password: creds.password
        });
        if (loginResult.ok && loginResult.user) {
            setSessionState({
                mode: 'anonymous',
                user: loginResult.user,
                backend
            });
            return { ok: true, user: loginResult.user, source: backend };
        }

        // Register then login
        const registerResult = await registerBackend(backend, {
            phone: creds.phone,
            password: creds.password,
            username: creds.username,
            visibility: 'private'
        });
        if (registerResult.ok && registerResult.user) {
            setSessionState({
                mode: 'anonymous',
                user: registerResult.user,
                backend
            });
            return { ok: true, user: registerResult.user, source: backend };
        }

        return { ok: false, reason: registerResult.error || 'anonymous_failed', user: null };
    },

    async ensureFastifyToken() {
        const token = FastifyAdapter?.getToken?.();
        if (token) return { ok: true, reason: 'token_present' };
        return { ok: false, reason: 'missing_token' };
    },

    async lookupPhone(phone) {
        const cleanPhone = normalizePhone(phone);
        if (!cleanPhone) return null;
        if (!FastifyAdapter?.auth?.lookupPhone) return null;
        return FastifyAdapter.auth.lookupPhone({ phone: cleanPhone });
    },

    getCurrentInfo() {
        const state = getSessionState();
        return {
            id: state.user?.id || null,
            user_id: state.user?.id || null,
            username: state.user?.name || null,
            name: state.user?.name || null,
            phone: state.user?.phone || null
        };
    },

    setCurrentState(userId, userName = null, userPhone = null) {
        if (!userId) return false;
        setSessionState({
            mode: 'authenticated',
            user: { id: String(userId), name: userName, phone: userPhone },
            backend: getPrimaryBackend()
        });
        return true;
    },

    requireAuth,

    async changePassword({ currentPassword, newPassword }) {
        const authCheck = requireAuth('change_password');
        if (!authCheck.authenticated) return { ok: false, error: authCheck.error };
        const primary = getPrimaryBackend();
        const adapter = adapters[primary];
        if (!adapter?.auth?.changePassword) return { ok: false, error: 'change_password_unavailable' };
        return adapter.auth.changePassword({ currentPassword, newPassword });
    },

    async deleteAccount({ password }) {
        const authCheck = requireAuth('delete_account');
        const results = {
            tauri: { success: false, data: null, error: null },
            fastify: { success: false, data: null, error: null }
        };
        if (!authCheck.authenticated) {
            results.tauri.error = authCheck.error;
            results.fastify.error = authCheck.error;
            return results;
        }

        const availability = await ensureBackendAvailability();
        const primary = getPrimaryBackend();
        const secondary = getSecondaryBackend();

        const primaryAdapter = adapters[primary];
        if (!primaryAdapter?.auth?.deleteAccount) {
            results[primary] = { success: false, data: null, error: 'delete_account_unavailable' };
        } else {
            const res = await primaryAdapter.auth.deleteAccount({ password });
            const ok = !!(res?.ok || res?.success);
            results[primary] = { success: ok, data: res, error: ok ? null : (res?.error || 'delete_failed') };
        }

        if (availability[secondary]) {
            const secondaryAdapter = adapters[secondary];
            if (secondaryAdapter?.auth?.deleteAccount) {
                const res = await secondaryAdapter.auth.deleteAccount({ password });
                const ok = !!(res?.ok || res?.success);
                results[secondary] = { success: ok, data: res, error: ok ? null : (res?.error || 'delete_failed') };
            } else {
                results[secondary] = { success: false, data: null, error: 'delete_account_unavailable' };
            }
        } else {
            results[secondary] = { success: false, data: null, error: 'secondary_unavailable' };
        }

        if (results.tauri.success || results.fastify.success) {
            await auth.logout();
        }

        return results;
    },

    // Legacy alias used by some UI flows
    async delete(phone, password) {
        if (!password) {
            return {
                tauri: { success: false, data: null, error: 'missing_password' },
                fastify: { success: false, data: null, error: 'missing_password' }
            };
        }
        return auth.deleteAccount({ password });
    },

    async refreshToken() {
        return { ok: true, success: true };
    },

    async list() {
        const results = {
            tauri: { users: [], error: null },
            fastify: { users: [], error: null },
            directory: []
        };

        try {
            const tauriRes = await TauriAdapter.atome.list({ type: 'user', limit: 500, offset: 0, skipOwner: true, ownerId: '*' });
            if (tauriRes?.ok || tauriRes?.success) {
                results.tauri.users = tauriRes.atomes || tauriRes.data || [];
            } else {
                results.tauri.error = tauriRes?.error || 'list_failed';
            }
        } catch (e) {
            results.tauri.error = e?.message || 'list_failed';
        }

        try {
            const fastifyRes = await FastifyAdapter.atome.list({ type: 'user', limit: 500, offset: 0, skipOwner: true, ownerId: '*' });
            if (fastifyRes?.ok || fastifyRes?.success) {
                results.fastify.users = fastifyRes.atomes || fastifyRes.data || [];
            } else {
                results.fastify.error = fastifyRes?.error || 'list_failed';
            }
        } catch (e) {
            results.fastify.error = e?.message || 'list_failed';
        }

        results.directory = [...results.tauri.users, ...results.fastify.users];
        return results;
    },

    async setVisibility(visibility) {
        const authCheck = requireAuth('set_visibility');
        if (!authCheck.authenticated) return { ok: false, error: authCheck.error };
        const userId = authCheck.user.id;
        const primary = getPrimaryBackend();
        const adapter = adapters[primary];
        if (!adapter?.atome?.alter) return { ok: false, error: 'alter_unavailable' };
        return adapter.atome.alter(userId, { visibility: visibility || 'public' });
    },

    // Compatibility stubs for legacy sync/machine APIs.
    async sync() {
        if (typeof window !== 'undefined' && window.Squirrel?.SyncEngine?.requestSync) {
            try { return await window.Squirrel.SyncEngine.requestSync(); } catch (_) { }
        }
        return { ok: false, error: 'sync_unavailable' };
    },

    async maybeSync() {
        return auth.sync();
    },

    async listUnsynced() {
        return { ok: true, onlyOnTauri: [], onlyOnFastify: [], modifiedOnTauri: [], modifiedOnFastify: [], deletedOnTauri: [], deletedOnFastify: [], conflicts: [], synced: [] };
    },

    async getCurrentMachine() {
        return null;
    },

    async registerMachine() {
        return { ok: false, error: 'machine_unavailable' };
    },

    async getMachineLastUser() {
        return null;
    },

    clearView() {
        if (typeof window === 'undefined') return;
        try { window.dispatchEvent(new CustomEvent('squirrel:view-cleared', { detail: { timestamp: Date.now() } })); } catch (_) { }
    },

    signalAuthComplete() {
        // Ensure auth check waiters are released.
        return waitForAuthCheck();
    },

    migrateAnonymousWorkspace
};

export default auth;
