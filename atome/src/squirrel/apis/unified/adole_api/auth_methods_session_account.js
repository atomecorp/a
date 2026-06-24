// Extracted from auth.js: session lifecycle, account management, directory, and legacy sync/machine stubs.
// `auth` is imported from the entry (circular, read at call-time) so detached re-exports
// (AdoleAPI.auth.*) keep resolving cross-method calls against the composed facade.
import { TauriAdapter, FastifyAdapter } from '../adole.js';
import {
    getSessionState,
    setSessionState,
    clearSessionState,
    loadSessionState,
    getAnonymousCredentials,
    setAnonymousCredentials,
    getCurrentProjectCache,
    clearCurrentProjectCache,
    resetWorkspaceForNextUser,
    waitForAuthCheck
} from './session.js';
import { adapters, normalizePhone, getPrimaryBackend, getSecondaryBackend, hasToken } from './auth_core.js';
import { loginBackend, registerBackend, meBackend, createAnonymousCredentials, ensureBackendAvailability } from './auth_backends.js';
import { loadFastifyLoginCache, ensureFastifyToken } from './auth_fastify_token.js';
import { migratePreviousWorkspace, migrateAnonymousWorkspace } from './auth_workspace.js';
import { requireAuth, normalizeSessionUser } from './auth_state.js';
import { auth } from './auth.js';

export const sessionAccountMethods = {
    async logout() {
        await TauriAdapter?.auth?.logout?.();
        await FastifyAdapter?.auth?.logout?.();
        TauriAdapter?.clearToken?.();
        FastifyAdapter?.clearToken?.();
        clearSessionState();
        clearCurrentProjectCache();
        resetWorkspaceForNextUser({ clearStorage: true, reason: 'logout' });
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
                await auth.tryAutoLogin();
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
            const restoredUser = normalizeSessionUser(stored.user);
            if (!restoredUser) {
                clearSessionState();
                return { authenticated: false, user: null };
            }
            const prevSession = getSessionState();
            const prevProjectCache = getCurrentProjectCache();
            const restoreSession = async (user, backend = primary) => {
                setSessionState({
                    mode: 'authenticated',
                    user,
                    backend
                });
                await migratePreviousWorkspace(prevSession, prevProjectCache, user.id);
                return { authenticated: true, user };
            };

            // Optimistically restore session to avoid spurious logout on startup.
            setSessionState({
                mode: 'authenticated',
                user: restoredUser,
                backend: primary
            }, { silent: true });

            const me = await meBackend(primary);
            if (me.ok && me.user) {
                return await restoreSession(me.user, primary);
            }

            const secondary = getSecondaryBackend();
            if (secondary !== primary) {
                const secondaryMe = await meBackend(secondary);
                if (secondaryMe.ok && secondaryMe.user) {
                    return await restoreSession(secondaryMe.user, secondary);
                }
            }

            const cached = loadFastifyLoginCache();
            const cachedMatchesStored = cached?.phone && (!restoredUser.phone || normalizePhone(restoredUser.phone) === cached.phone);
            if (cachedMatchesStored) {
                const relogin = await loginBackend(primary, {
                    phone: cached.phone,
                    password: cached.password
                });
                if (relogin.ok && relogin.user) {
                    return await restoreSession(relogin.user, primary);
                }
                if (secondary !== primary) {
                    const secondaryRelogin = await loginBackend(secondary, {
                        phone: cached.phone,
                        password: cached.password
                    });
                    if (secondaryRelogin.ok && secondaryRelogin.user) {
                        return await restoreSession(secondaryRelogin.user, secondary);
                    }
                }
            }

            // Fastify cookie auth is authoritative for browser refreshes. Clear
            // only when the server explicitly refuses the restored session.
            const primaryRefusedAuth = me?.raw?.authenticated === false || me?.raw?.status === 401;
            if (primary === 'fastify' && primaryRefusedAuth) {
                clearSessionState();
                return { authenticated: false, user: null };
            }
            if (primary !== 'fastify' && !hasToken(primary)) {
                clearSessionState();
                return { authenticated: false, user: null };
            }

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
        return ensureFastifyToken();
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
            const tauriRes = await TauriAdapter.atome.list({ type: 'user', limit: 500, offset: 0, skipOwner: true, owner_id: '*' });
            if (tauriRes?.ok || tauriRes?.success) {
                results.tauri.users = tauriRes.atomes || tauriRes.data || [];
            } else {
                results.tauri.error = tauriRes?.error || 'list_failed';
            }
        } catch (e) {
            results.tauri.error = e?.message || 'list_failed';
        }

        try {
            const fastifyRes = await FastifyAdapter.atome.list({ type: 'user', limit: 500, offset: 0, skipOwner: true, owner_id: '*' });
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
        if (!adapter?.atome?.commit) return { ok: false, error: 'commit_unavailable' };
        return adapter.atome.commit({
            kind: 'set',
            atome_id: userId,
            props: { visibility: visibility || 'public' },
            actor: { type: 'user', id: String(userId) }
        });
    },

    // Compatibility stubs for legacy sync/machine APIs.
    async sync() {
        if (typeof window !== 'undefined' && window.Squirrel?.SyncEngine?.requestSync) {
            return await window.Squirrel.SyncEngine.requestSync();
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
        window.dispatchEvent(new CustomEvent('squirrel:view-cleared', { detail: { timestamp: Date.now() } }));
    },

    signalAuthComplete() {
        // Ensure auth check waiters are released.
        return waitForAuthCheck();
    },

    migrateAnonymousWorkspace
};
