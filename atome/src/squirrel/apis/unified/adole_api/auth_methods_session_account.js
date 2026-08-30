// Extracted from auth.js: session lifecycle, account management, directory, and legacy sync/machine stubs.
// `auth` is imported from the entry (circular, read at call-time) so detached re-exports
// (AdoleAPI.auth.*) keep resolving cross-method calls against the composed facade.
import { TauriAdapter, FastifyAdapter } from '../adole.js';
import {
    getSessionState,
    setSessionState,
    clearSessionState,
    loadSessionState,
    getGuestWorkspace,
    setGuestWorkspace,
    clearGuestWorkspace,
    getCurrentProjectCache,
    clearCurrentProjectCache,
    resetWorkspaceForNextUser,
    waitForAuthCheck
} from './session.js';
import { adapters, normalizePhone, getPrimaryBackend, getSecondaryBackend, hasToken, hasAuthenticatedToken } from './auth_core.js';
import { loginBackend, meBackend, ensureBackendAvailability } from './auth_backends.js';
import {
    loadFastifyLoginCache,
    ensureFastifyToken,
    markFastifyAuthValid,
    configureTauriRemoteSync
} from './auth_fastify_token.js';
import { transferGuestWorkspace } from './auth_workspace.js';
import { requireAuth, normalizeSessionUser } from './auth_state.js';
import { auth } from './auth.js';
import { isTauriRuntime } from './runtime.js';

const isAuthoritativeFastifySessionRefusal = (result) => {
    const error = String(result?.error || result?.raw?.error || '').trim().toLowerCase();
    return result?.raw?.authenticated === false
        || result?.raw?.status === 401
        || error === 'remote_account_not_provisioned';
};

export const sessionAccountMethods = {
    async logout() {
        if (isTauriRuntime()) {
            try { await TauriAdapter?.sync?.clearRemote?.(); } catch (_) { }
        }
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
                await configureTauriRemoteSync();
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
            const primaryRefusedAuth = isAuthoritativeFastifySessionRefusal(me);
            if (primary === 'fastify' && primaryRefusedAuth) {
                FastifyAdapter?.clearToken?.();
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
            const guest = getGuestWorkspace();
            const anonUser = normalizeSessionUser(guest?.user || stored.user);
            if (anonUser?.id) {
                setSessionState({
                    mode: 'anonymous',
                    user: anonUser,
                    backend: 'local_guest'
                });
                return { authenticated: true, user: anonUser, anonymous: true };
            }
            clearSessionState();
            return { authenticated: false, user: null, anonymous: false };
        }

        clearSessionState();
        return { authenticated: false, user: null };
    },

    async startGuest({ force = false } = {}) {
        const state = getSessionState();
        if (state.mode === 'authenticated') {
            return { ok: false, reason: 'authenticated', user: null };
        }
        if (state.mode === 'logged_out' && !force) {
            return { ok: false, reason: 'logged_out', user: null };
        }

        let guest = getGuestWorkspace();
        if (!guest?.user?.id) {
            const principalId = globalThis.crypto?.randomUUID?.();
            if (!principalId) return { ok: false, reason: 'secure_random_unavailable', user: null };
            guest = { user: { id: principalId, name: 'Guest', phone: null }, createdAt: new Date().toISOString() };
            setGuestWorkspace(guest);
        }
        const user = normalizeSessionUser(guest.user);
        if (isTauriRuntime() && adapters.tauri?.auth?.startGuest) {
            const native = await adapters.tauri.auth.startGuest({ guestId: user.id });
            if (!native?.ok && !native?.success) return { ok: false, reason: native?.error || 'local_guest_start_failed', user: null };
        }
        setSessionState({ mode: 'anonymous', user, backend: 'local_guest' });
        return { ok: true, user, source: 'local_guest' };
    },

    async provisionAccount({ operationId, expiresAt, verifiedServerFingerprint, username, phone, password } = {}) {
        if (!operationId || !expiresAt || !verifiedServerFingerprint) {
            return { ok: false, error: 'remote_identity_unverified' };
        }
        const adapter = adapters.fastify;
        if (!adapter?.auth?.provisionAccount) return { ok: false, error: 'provisioning_unavailable' };
        const result = await adapter.auth.provisionAccount({
            operationId,
            expiresAt,
            verifiedServerFingerprint,
            username,
            phone,
            password
        });
        const ok = Boolean(result?.ok || result?.success);
        return { ok, success: ok, ...result };
    },

    async leaveGuest({ discard = false } = {}) {
        if (getSessionState().mode !== 'anonymous') return { ok: false, error: 'guest_not_active' };
        if (isTauriRuntime() && adapters.tauri?.auth?.leaveGuest) await adapters.tauri.auth.leaveGuest();
        clearSessionState();
        if (discard) clearGuestWorkspace();
        return { ok: true, retained: !discard };
    },

    async adoptGuestWorkspace({ confirmed = false, operationId = null } = {}) {
        const state = getSessionState();
        const guest = getGuestWorkspace();
        if (!confirmed) return { ok: false, error: 'guest_adoption_confirmation_required' };
        if (state.mode !== 'authenticated' || !state.user?.id || !guest?.user?.id) {
            return { ok: false, error: 'authenticated_account_required' };
        }
        const persistedOperationId = guest.adoptionOperationId || null;
        const resolvedOperationId = operationId || persistedOperationId || globalThis.crypto?.randomUUID?.();
        if (!resolvedOperationId) return { ok: false, error: 'secure_random_unavailable' };
        setGuestWorkspace({ ...guest, adoptionOperationId: resolvedOperationId });
        const result = await transferGuestWorkspace(guest.user.id, state.user.id, {
            operationId: resolvedOperationId
        });
        if (result.ok) clearGuestWorkspace();
        return result;
    },

    async ensureFastifyToken() {
        return ensureFastifyToken();
    },

    // A caller that just saw the server refuse the stored bearer needs the dead
    // credential gone from every layer — localStorage, sessionStorage AND the
    // in-memory cache — before asking for a new one. Removing the storage keys
    // by hand leaves the memory copy behind, and the next getToken() hands the
    // refused token straight back.
    clearFastifyToken() {
        FastifyAdapter?.clearToken?.();
        return { ok: true };
    },

    async lookupPhone(phone) {
        const cleanPhone = normalizePhone(phone);
        if (!cleanPhone) return { ok: false, success: false, error: 'missing_phone' };
        const backend = getPrimaryBackend();
        const adapter = adapters[backend];
        if (!adapter?.auth?.lookupPhone) return { ok: false, success: false, error: 'phone_lookup_unavailable', backend };
        return adapter.auth.lookupPhone({ phone: cleanPhone });
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

    transferGuestWorkspace
};
