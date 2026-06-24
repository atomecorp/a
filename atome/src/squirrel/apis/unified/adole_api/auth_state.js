// Extracted from auth.js: shared session-state resolvers used by the auth facade and method groups.
import { getSessionState } from './session.js';

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

export { resolveAuthState, requireAuth, normalizeSessionUser };
