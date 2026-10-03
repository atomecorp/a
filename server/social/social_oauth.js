import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { resolvePublicMedia } from './social_media.js';
import { SocialError } from './social_http.js';
import { loadLocalSocialConfig } from '../auth_secret_config.js';

// The official authorization round trip. atome never sees a social password:
// the browser goes to the provider's own page, which redirects to this server
// with a one-time code bound to the attempt that started it.
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const attempts = new Map();

export const socialRedirectUri = (config, network) => {
    const base = String(config.SOCIAL_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    if (!/^https:\/\//.test(base)) throw new SocialError('social_not_configured');
    return `${base}/api/social/oauth/callback/${network}`;
};

const prune = (now) => {
    for (const [state, attempt] of attempts) {
        if (now > attempt.expiresAt) settle(state, { ok: false, error: 'social_authorization_expired' });
    }
};

function settle(state, result) {
    const attempt = attempts.get(state);
    if (!attempt) return;
    attempts.delete(state);
    clearTimeout(attempt.timer);
    attempt.result = result;
    attempt.waiters.forEach((resolve) => resolve(result));
}

// `complete(code)` exchanges the code and stores the session in the principal's
// vault; it is captured here so the callback never has to trust the request.
export function startSocialAuthorization({ principal, network, adapter, config, complete, now = Date.now() }) {
    prune(now);
    for (const [state, attempt] of attempts) {
        if (attempt.principal === principal && attempt.network === network) settle(state, { ok: false, error: 'social_cancelled' });
    }
    const state = randomBytes(24).toString('hex');
    const attemptId = randomBytes(16).toString('hex');
    const redirectUri = socialRedirectUri(config, network);
    const attempt = { state, attemptId, principal, network, complete, redirectUri, waiters: [], expiresAt: now + ATTEMPT_TTL_MS };
    attempt.timer = setTimeout(() => settle(state, { ok: false, error: 'social_authorization_expired' }), ATTEMPT_TTL_MS);
    attempt.timer.unref?.();
    attempts.set(state, attempt);
    return { attempt_id: attemptId, authorization_url: adapter.authorizeUrl({ config, state, redirectUri }), expires_at: attempt.expiresAt };
}

const findAttempt = (principal, attemptId) => [...attempts.values()]
    .find((attempt) => attempt.principal === principal && attempt.attemptId === attemptId) || null;

// Resolves when the provider redirected back (or the attempt expired / was
// cancelled). Carried by the authenticated socket, so no polling is needed.
export function awaitSocialAuthorization({ principal, attemptId, signal }) {
    const attempt = findAttempt(principal, attemptId);
    if (!attempt) return Promise.resolve({ ok: false, error: 'social_authorization_expired' });
    return new Promise((resolve) => {
        attempt.waiters.push(resolve);
        signal?.addEventListener('abort', () => resolve({ ok: false, error: 'social_cancelled' }), { once: true });
    });
}

export function cancelSocialAuthorization({ principal, attemptId }) {
    const attempt = findAttempt(principal, attemptId);
    if (attempt) settle(attempt.state, { ok: false, error: 'social_cancelled' });
    return Boolean(attempt);
}

const sameState = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function completeSocialAuthorization({ network, query }) {
    const state = String(query?.state || '');
    const attempt = /^[a-f0-9]{48}$/.test(state) ? attempts.get(state) : null;
    if (!attempt || attempt.network !== network || !sameState(attempt.state, state)) return { ok: false, error: 'social_authorization_expired' };
    if (query.error || !query.code) {
        const result = { ok: false, error: 'social_authorization_denied' };
        settle(state, result);
        return result;
    }
    let result;
    try {
        result = { ok: true, account: await attempt.complete(String(query.code), attempt.redirectUri) };
    } catch (error) {
        result = { ok: false, error: error instanceof SocialError ? error.code : 'social_provider_unavailable' };
    }
    settle(state, result);
    return result;
}

// The only two HTTP surfaces of this feature, both imposed by the providers:
// the registered OAuth redirect, and the pull URL of Instagram/TikTok photos.
export function registerSocialRoutes(fastify, { projectRoot }) {
    loadLocalSocialConfig(projectRoot);
    fastify.get('/api/social/oauth/callback/:network', async (request, reply) => {
        const network = String(request.params.network || '');
        const result = await completeSocialAuthorization({ network, query: request.query || {} });
        reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer').type('text/plain; charset=utf-8');
        return result.ok
            ? 'atome: the account is connected. You can close this page and return to atome.'
            : `atome: the connection did not complete (${result.error}). You can close this page and return to atome.`;
    });
    fastify.get('/api/social/media/:name', async (request, reply) => {
        const entry = resolvePublicMedia(request.params.name);
        if (!entry) return reply.code(404).type('text/plain').send('not found');
        reply.header('Cache-Control', 'no-store').type(entry.mime);
        return reply.send(createReadStream(entry.filePath));
    });
}
