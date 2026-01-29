import { readJson, writeJson, removeStorage } from './storage.js';
import { nowIso } from './runtime.js';

const SESSION_KEY = 'squirrel_session_v2';
const ANON_KEY = 'squirrel_anonymous_v2';
const CURRENT_PROJECT_KEY = 'squirrel_current_project_v2';

let sessionState = {
    mode: 'logged_out', // 'logged_out' | 'anonymous' | 'authenticated'
    user: null, // { id, name, phone }
    backend: null, // 'tauri' | 'fastify'
    updatedAt: null
};

let authCheckComplete = false;
const authWaiters = new Set();

const dispatchEvent = (name, detail) => {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) { }
};

const syncWindowAuthState = (state) => {
    if (typeof window === 'undefined') return;
    if (!state || state.mode === 'logged_out' || !state.user?.id) {
        delete window.__currentUser;
        window.__authCheckResult = { authenticated: false, userId: null, anonymous: false };
        window.__authCheckComplete = true;
        return;
    }
    window.__currentUser = {
        id: state.user.id,
        name: state.user.name || null,
        phone: state.user.phone || null
    };
    window.__authCheckResult = {
        authenticated: state.mode === 'authenticated' || state.mode === 'anonymous',
        userId: state.user.id,
        anonymous: state.mode === 'anonymous'
    };
    window.__authCheckComplete = true;
};

const notifyAuthCheckComplete = (state) => {
    authCheckComplete = true;
    syncWindowAuthState(state);
    const result = window?.__authCheckResult || {
        authenticated: false,
        userId: null,
        anonymous: false
    };
    authWaiters.forEach((resolve) => {
        try { resolve(result); } catch (_) { }
    });
    authWaiters.clear();
    dispatchEvent('squirrel:auth-checked', result);
};

export const getSessionState = () => sessionState;

export const loadSessionState = () => {
    const stored = readJson(SESSION_KEY);
    if (!stored || !stored.mode) {
        return { mode: 'logged_out', user: null, backend: null, updatedAt: null };
    }
    return {
        mode: stored.mode,
        user: stored.user || null,
        backend: stored.backend || null,
        updatedAt: stored.updatedAt || null
    };
};

export const persistSessionState = (state) => {
    if (!state || state.mode === 'logged_out') {
        removeStorage(SESSION_KEY);
        return;
    }
    writeJson(SESSION_KEY, state);
};

export const setSessionState = (next, { persist = true, silent = false } = {}) => {
    const prev = sessionState;
    sessionState = {
        mode: next?.mode || 'logged_out',
        user: next?.user || null,
        backend: next?.backend || null,
        updatedAt: nowIso()
    };

    if (persist) {
        persistSessionState(sessionState);
    }

    if (!silent) {
        const prevUserId = prev?.user?.id || null;
        const nextUserId = sessionState?.user?.id || null;
        const prevMode = prev?.mode || 'logged_out';
        const nextMode = sessionState?.mode || 'logged_out';

        if (prevMode !== 'logged_out' && nextMode === 'logged_out') {
            dispatchEvent('squirrel:user-logged-out', {
                reason: 'logout',
                previousUserId: prevUserId,
                timestamp: Date.now()
            });
        } else if (prevUserId && nextUserId && prevUserId !== nextUserId) {
            dispatchEvent('squirrel:user-logged-out', {
                reason: 'switch',
                previousUserId: prevUserId,
                nextUserId,
                timestamp: Date.now()
            });
        }

        if (nextMode !== 'logged_out' && nextUserId) {
            dispatchEvent('squirrel:user-logged-in', {
                userId: nextUserId,
                user_id: nextUserId,
                userName: sessionState.user?.name || null,
                userPhone: sessionState.user?.phone || null,
                anonymous: nextMode === 'anonymous',
                timestamp: Date.now()
            });
        }
    }

    notifyAuthCheckComplete(sessionState);
};

export const clearSessionState = () => {
    setSessionState({ mode: 'logged_out', user: null, backend: null }, { persist: true });
};

export const waitForAuthCheck = () => {
    if (authCheckComplete) {
        return Promise.resolve(window?.__authCheckResult || {
            authenticated: false,
            userId: null,
            anonymous: false
        });
    }
    return new Promise((resolve) => {
        authWaiters.add(resolve);
    });
};

export const markAuthUnchecked = () => {
    authCheckComplete = false;
};

export const getAnonymousCredentials = () => readJson(ANON_KEY);

export const setAnonymousCredentials = (creds) => {
    if (!creds) {
        removeStorage(ANON_KEY);
        return;
    }
    writeJson(ANON_KEY, creds);
};

export const clearAnonymousCredentials = () => {
    removeStorage(ANON_KEY);
};

let currentProjectCache = null;

export const getCurrentProjectCache = () => currentProjectCache;

export const setCurrentProjectCache = (payload) => {
    if (!payload) {
        currentProjectCache = null;
        return;
    }
    currentProjectCache = payload;
};

export const clearCurrentProjectCache = () => {
    currentProjectCache = null;
    try { removeStorage(CURRENT_PROJECT_KEY); } catch (_) { }
};

export const updateWindowProject = (project) => {
    if (typeof window === 'undefined') return;
    if (!project) {
        delete window.__currentProject;
        return;
    }
    window.__currentProject = project;
};
