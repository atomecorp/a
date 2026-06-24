// Extracted from auth.js: account creation / login flows (bootstrap, register, login).
import { TauriAdapter, FastifyAdapter } from '../adole.js';
import { syncLocalProjectsToFastify } from './atomes.js';
import {
    getSessionState,
    setSessionState,
    clearSessionState,
    getCurrentProjectCache
} from './session.js';
import { normalizePhone, normalizeUsername, getPrimaryBackend, getSecondaryBackend, hasAuthenticatedToken } from './auth_core.js';
import { loginBackend, registerBackend, bootstrapBackend, ensureBackendAvailability } from './auth_backends.js';
import { persistFastifyLoginCache } from './auth_fastify_token.js';
import { migratePreviousWorkspace } from './auth_workspace.js';

export const loginMethods = {
    async bootstrap(phone, password, username, visibility = 'public') {
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
        const prevProjectCache = getCurrentProjectCache();

        TauriAdapter?.clearToken?.();
        FastifyAdapter?.clearToken?.();
        clearSessionState();

        const response = {
            tauri: { success: false, data: null, error: null },
            fastify: { success: false, data: null, error: null }
        };

        const primaryResult = await bootstrapBackend(primary, {
            phone: cleanPhone,
            password,
            username: cleanName,
            visibility
        });
        let activeBackend = primary;
        let activeResult = primaryResult;

        response[primary] = {
            success: primaryResult.ok,
            data: primaryResult.raw,
            error: primaryResult.ok ? null : primaryResult.error
        };

        let secondaryResult = null;
        if (!primaryResult.ok && availability[secondary]) {
            secondaryResult = await bootstrapBackend(secondary, {
                phone: cleanPhone,
                password,
                username: cleanName,
                visibility
            });
            response[secondary] = {
                success: secondaryResult.ok,
                data: secondaryResult.raw,
                error: secondaryResult.ok ? null : secondaryResult.error
            };
            if (secondaryResult.ok) {
                activeBackend = secondary;
                activeResult = secondaryResult;
            }
        } else if (primaryResult.ok && availability[secondary]) {
            secondaryResult = await bootstrapBackend(secondary, {
                phone: cleanPhone,
                password,
                username: cleanName,
                visibility
            });
            response[secondary] = {
                success: secondaryResult.ok,
                data: secondaryResult.raw,
                error: secondaryResult.ok ? null : secondaryResult.error
            };
        }

        const authenticated = !!(activeResult?.ok && activeResult.user?.id && hasAuthenticatedToken(activeBackend, activeResult));
        if (!authenticated) {
            response[activeBackend] = {
                success: false,
                data: activeResult?.raw || null,
                error: activeResult?.error || 'missing_authenticated_session'
            };
            response.ok = false;
            response.error = response[activeBackend].error;
            response.backend = activeBackend;
            return response;
        }

        persistFastifyLoginCache({ phone: cleanPhone, password });
        setSessionState({
            mode: 'authenticated',
            user: activeResult.user,
            backend: activeBackend
        });
        await migratePreviousWorkspace(prevSession, prevProjectCache, activeResult.user.id);

        syncLocalProjectsToFastify({ reason: 'bootstrap' }).catch(() => { });

        response.ok = true;
        response.user = activeResult.user;
        response.token = activeResult.token || null;
        response.backend = activeBackend;
        return response;
    },

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
        const prevProjectCache = getCurrentProjectCache();

        TauriAdapter?.clearToken?.();
        FastifyAdapter?.clearToken?.();
        clearSessionState();

        let primaryResult = await registerBackend(primary, {
            phone: cleanPhone,
            password,
            username: cleanName,
            visibility
        });

        let fallbackResult = null;
        let activeBackend = primary;

        const response = {
            tauri: { success: false, data: null, error: null },
            fastify: { success: false, data: null, error: null }
        };
        // If register succeeded but did not return a token, try immediate login
        if (primaryResult.ok && !primaryResult.token) {
            const loginResult = await loginBackend(primary, { phone: cleanPhone, password });
            if (loginResult.ok) {
                primaryResult = {
                    ...primaryResult,
                    user: loginResult.user || primaryResult.user,
                    token: loginResult.token || primaryResult.token
                };
            }
        }

        if (!primaryResult.ok && availability[secondary]) {
            fallbackResult = await registerBackend(secondary, {
                phone: cleanPhone,
                password,
                username: cleanName,
                visibility
            });
            response[secondary] = {
                success: fallbackResult.ok,
                data: fallbackResult.raw,
                error: fallbackResult.ok ? null : fallbackResult.error
            };
            if (fallbackResult.ok) activeBackend = secondary;
        }

        const activeResult = activeBackend === primary ? primaryResult : fallbackResult;

        response[primary] = {
            success: primaryResult.ok,
            data: primaryResult.raw,
            error: primaryResult.ok ? null : primaryResult.error
        };

        if (activeBackend === primary && primaryResult.ok && availability[secondary] && !fallbackResult) {
            const secondaryResult = await registerBackend(secondary, {
                phone: cleanPhone,
                password,
                username: cleanName,
                visibility
            });
            response[secondary] = {
                success: secondaryResult.ok,
                data: secondaryResult.raw,
                error: secondaryResult.ok ? null : secondaryResult.error
            };
        }

        const authenticated = !!(activeResult?.ok && activeResult.user && hasAuthenticatedToken(activeBackend, activeResult));
        if (authenticated) {
            persistFastifyLoginCache({ phone: cleanPhone, password });
            setSessionState({
                mode: 'authenticated',
                user: activeResult.user,
                backend: activeBackend
            });
            await migratePreviousWorkspace(prevSession, prevProjectCache, activeResult.user.id);

            syncLocalProjectsToFastify({ reason: 'register' }).catch(() => { });
        } else if (activeResult?.ok) {
            response[activeBackend] = {
                success: false,
                data: activeResult.raw,
                error: 'missing_authenticated_session'
            };
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
        const prevProjectCache = getCurrentProjectCache();

        // Security: clear any stale auth state before attempting a new login
        TauriAdapter?.clearToken?.();
        FastifyAdapter?.clearToken?.();
        clearSessionState();

        const primaryResult = await loginBackend(primary, {
            phone: cleanPhone,
            password
        });
        let activeBackend = primary;
        let activeResult = primaryResult;

        const response = {
            tauri: { success: false, data: null, error: null },
            fastify: { success: false, data: null, error: null }
        };
        response[primary] = {
            success: primaryResult.ok,
            data: primaryResult.raw,
            error: primaryResult.ok ? null : primaryResult.error
        };

        let secondaryResult = null;
        let loggedUser = primaryResult.user;

        if (primaryResult.ok && availability[secondary]) {
            secondaryResult = await loginBackend(secondary, {
                phone: cleanPhone,
                password
            });
            response[secondary] = {
                success: secondaryResult.ok,
                data: secondaryResult.raw,
                error: secondaryResult.ok ? null : secondaryResult.error
            };
            if (!loggedUser && secondaryResult.user) loggedUser = secondaryResult.user;
        } else if (!primaryResult.ok && availability[secondary]) {
            secondaryResult = await loginBackend(secondary, {
                phone: cleanPhone,
                password
            });
            response[secondary] = {
                success: secondaryResult.ok,
                data: secondaryResult.raw,
                error: secondaryResult.ok ? null : secondaryResult.error
            };
            if (secondaryResult.ok) {
                activeBackend = secondary;
                activeResult = secondaryResult;
                loggedUser = secondaryResult.user || loggedUser;
            }
        }

        if (activeResult.ok && loggedUser?.id) {
            persistFastifyLoginCache({ phone: cleanPhone, password });
            setSessionState({
                mode: 'authenticated',
                user: loggedUser,
                backend: activeBackend
            });
            await migratePreviousWorkspace(prevSession, prevProjectCache, loggedUser.id);

            syncLocalProjectsToFastify({ reason: 'login' }).catch(() => { });
        }

        return response;
    }
};
