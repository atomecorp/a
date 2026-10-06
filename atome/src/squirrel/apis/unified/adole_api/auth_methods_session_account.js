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
import { ensureFastifyToken } from './auth_fastify_token.js';
import { restoreLocalAuthorization, recoverDesktopAuthorization, lockLocalAuthorization, phoneLinkClient, initializePhoneLinks, setBrowserWorkspaceIdentity, flushBrowserWorkspace } from './auth_methods_login.js';
import { transferGuestWorkspace } from './auth_workspace.js';
import { requireAuth, normalizeSessionUser } from './auth_state.js';
import { auth } from './auth.js';
import { isTauriRuntime } from './runtime.js';

const LOGOUT_WORKSPACE_FLUSH_BUDGET_MS = 3000;

export const sessionAccountMethods = {
    async logout() {
        if (isTauriRuntime()) {
            const stopped = await TauriAdapter.sync.clearRemote();
            if (!stopped?.ok && !stopped?.success) throw new Error(stopped?.error || 'local_sync_stop_failed');
        } else if (getSessionState().mode === 'authenticated') {
            // Pousser les dernieres ecritures du compte sortant pendant que sa session est encore
            // valide. Hors ligne ou trop lent : elles restent dans SON magasin local et partiront
            // a sa prochaine connexion (jamais sous l'identite du compte suivant).
            await Promise.race([
                flushBrowserWorkspace().catch(() => null),
                new Promise((resolve) => setTimeout(resolve, LOGOUT_WORKSPACE_FLUSH_BUDGET_MS))
            ]);
        }
        await lockLocalAuthorization();
        const revoked = await phoneLinkClient().revoke();
        TauriAdapter.clearToken();
        FastifyAdapter.clearToken();
        clearSessionState();
        clearCurrentProjectCache();
        resetWorkspaceForNextUser({ clearStorage: false, reason: 'logout' });
        return { ok: true, revocationPending: revoked.revocationPending === true,
            tauri: { success: true }, fastify: { success: revoked.revocationPending !== true } };
    },

    async changePhone({ phone, confirmed = false } = {}) {
        return phoneLinkClient().changePhone(normalizePhone(phone), confirmed);
    },

    async deleteAccount({ confirmed = false } = {}) {
        const result = await phoneLinkClient().deleteAccount(confirmed);
        await auth.logout();
        return result;
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
                    username: state.user.username,
                    phone: state.user.phone
                },
                source: state.backend || getPrimaryBackend(),
                anonymous: state.mode === 'anonymous'
            };
        }
        return { logged: false, user: null, source: null, anonymous: false };
    },

    async tryAutoLogin() {
        // Plaintext credentials from previous releases are removed, never reused.
        for (const key of ['fastify_login_cache_v1', 'auth_token', 'local_auth_token', 'cloud_auth_token']) {
            globalThis.localStorage?.removeItem(key);
            globalThis.sessionStorage?.removeItem(key);
        }
        const stored = loadSessionState();
        let restored = { authenticated: false };
        let localError;
        try { restored = await restoreLocalAuthorization(); }
        catch (error) {
            clearSessionState();
            localError = error?.message || 'local_authorization_unavailable';
        }
        // A missing or unusable old grant must not prevent a fresh SMS login.
        try { await initializePhoneLinks(); }
        catch (error) {
            globalThis.window?.dispatchEvent(new CustomEvent('squirrel:phone-login-error', { detail: { code: error.message } }));
        }
        if (!restored.authenticated && !localError) {
            const recovered = await recoverDesktopAuthorization();
            if (recovered.authenticated) {
                void ensureFastifyToken();
                return { authenticated: true, user: recovered.user };
            }
            if (recovered.attempted && recovered.error) localError = recovered.error;
        }
        if (restored.authenticated || getSessionState().mode === 'authenticated') {
            void ensureFastifyToken();
            return { authenticated: true, user: getSessionState().user };
        }
        if (localError) {
            // Recovery can fail after a readable but revoked desktop session.
            // Publish the logged-out state so the auth gate can present login.
            clearSessionState();
            return { authenticated: false, error: localError };
        }
        if (stored?.mode === 'anonymous') {
            const guest = await auth.startGuest({ force: true });
            if (guest?.ok === true || guest?.success === true) return guest;

            // A persisted guest is a convenience, never a boot gate. The local
            // native backend may be temporarily unavailable or may reject a
            // record written by an older build. Leaving sessionState untouched
            // here meant no `squirrel:auth-checked` event was ever emitted, so
            // the native launch cover stayed over a completely loaded page.
            // Keep the guest workspace itself for a later retry, but settle the
            // auth contract as logged out so the login choices are presented.
            clearSessionState();
            return {
                authenticated: false,
                user: null,
                error: guest?.reason || guest?.error || 'local_guest_restore_failed'
            };
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
            guest = { user: { id: principalId, username: 'Guest', phone: null }, createdAt: new Date().toISOString() };
            setGuestWorkspace(guest);
        }
        const user = normalizeSessionUser(guest.user);
        if (isTauriRuntime() && adapters.tauri?.auth?.startGuest) {
            const native = await adapters.tauri.auth.startGuest({ guestId: user.id });
            if (!native?.ok && !native?.success) return { ok: false, reason: native?.error || 'local_guest_start_failed', user: null };
        }
        await setBrowserWorkspaceIdentity(user);
        setSessionState({ mode: 'anonymous', user, backend: 'local_guest' });
        return { ok: true, user, source: 'local_guest' };
    },

    async leaveGuest({ discard = false } = {}) {
        if (getSessionState().mode !== 'anonymous') return { ok: false, error: 'guest_not_active' };
        if (isTauriRuntime() && adapters.tauri?.auth?.leaveGuest) await adapters.tauri.auth.leaveGuest();
        clearSessionState();
        await setBrowserWorkspaceIdentity(null);
        if (discard) clearGuestWorkspace();
        return { ok: true, retained: !discard };
    },

    guestAdoptionStatus() {
        const guest = getGuestWorkspace();
        const account = getSessionState();
        if (account.mode !== 'authenticated' || !guest?.user?.id || guest.adoptionDecision === 'declined') return null;
        if (guest.adoptionAccountId && guest.adoptionAccountId !== account.user.id) return null;
        return { pending: guest.adoptionDecision === 'accepted', prompt: !guest.adoptionDecision };
    },

    declineGuestAdoption() {
        const guest = getGuestWorkspace();
        if (guest?.adoptionDecision === 'accepted') return { ok: false, error: 'guest_adoption_in_progress' };
        if (guest) setGuestWorkspace({ ...guest, adoptionDecision: 'declined' });
        return { ok: true, retained: true };
    },

    async adoptGuestWorkspace({ confirmed = false, operationId = null } = {}) {
        const state = getSessionState();
        const guest = getGuestWorkspace();
        if (!confirmed) return { ok: false, error: 'guest_adoption_confirmation_required' };
        if (state.mode !== 'authenticated' || !state.user?.id || !guest?.user?.id) {
            return { ok: false, error: 'authenticated_account_required' };
        }
        if (guest.adoptionAccountId && guest.adoptionAccountId !== state.user.id) return { ok: false, error: 'guest_adoption_account_mismatch' };
        const persistedOperationId = guest.adoptionOperationId || null;
        const resolvedOperationId = operationId || persistedOperationId || globalThis.crypto?.randomUUID?.();
        if (!resolvedOperationId) return { ok: false, error: 'secure_random_unavailable' };
        setGuestWorkspace({ ...guest, adoptionOperationId: resolvedOperationId, adoptionDecision: 'accepted', adoptionAccountId: state.user.id });
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

    getCurrentInfo() {
        const state = getSessionState();
        return {
            id: state.user?.id || null,
            user_id: state.user?.id || null,
            username: state.user?.username || null,
            phone: state.user?.phone || null,
            first_launch_version: state.user?.first_launch_version || null
        };
    },

    setCurrentState(userId, userName = null, userPhone = null) {
        if (!userId) return false;
        setSessionState({
            mode: 'authenticated',
            user: { id: String(userId), username: userName, phone: userPhone },
            backend: getPrimaryBackend()
        });
        return true;
    },

    requireAuth,

    async refreshToken() {
        return ensureFastifyToken();
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
