import { MusicFailure } from '../../atome/src/squirrel/music/contracts.js';

// All URLs are assembled inside the provider owner, never from tool-supplied endpoints.
export async function spotifyFetch(fetchImpl, url, init = {}, effect = false) {
    let response;
    try { response = await fetchImpl(url, { ...init, redirect: 'error' }); }
    catch { throw new MusicFailure('PROVIDER_UNAVAILABLE', { uncertain: effect }); }
    if (!response.ok) {
        const code = response.status === 401 ? 'AUTHORIZATION_REQUIRED' : response.status === 403 ? 'PERMISSION_DENIED'
            : response.status === 404 ? 'ITEM_NOT_FOUND' : response.status === 429 ? 'RATE_LIMITED'
                : response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED';
        throw new MusicFailure(code, { uncertain: effect && response.status >= 500,
            retryAfter: response.status === 429 ? response.headers.get('retry-after') : null });
    }
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch { throw new MusicFailure('PROVIDER_UNAVAILABLE', { uncertain: effect }); }
}

export const spotifyApi = async (ctx, record, path, { method = 'GET', body, effect = false } = {}) => {
    const checkSession = async () => {
        ctx.check();
        if (!ctx.authorizationPending) {
            const current = await ctx.vault.readRecord('music.spotify'); ctx.check();
            if (!record.authorization_id || current?.authorization_id !== record.authorization_id) throw new MusicFailure('CONTEXT_CHANGED');
        }
    };
    await checkSession();
    const result = await spotifyFetch(ctx.fetchImpl, 'https://api.spotify.com/v1' + path, {
        method, signal: ctx.signal, headers: { Authorization: 'Bearer ' + record.access_token, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }, effect);
    if (effect) ctx.effectAccepted?.();
    await checkSession(); return result;
};
