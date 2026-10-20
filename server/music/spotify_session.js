import { randomBytes, createHash } from 'node:crypto';
import { startSocialAuthorization, awaitSocialAuthorization, cancelSocialAuthorization } from '../social/social_oauth.js';
import { SocialError } from '../social/social_http.js';
import { spotifyApi, spotifyFetch } from './spotify_http.js';
import { musicError, MusicFailure } from '../../atome/src/squirrel/music/contracts.js';

// The user enters the Spotify Client ID and the Deezer profile in Passwords & keys;
// the public base is the operator's server origin.
export const readMusicConfig = async (vault, env = process.env) => ({ clientId: await vault.read('spotify') || '',
    deezerProfile: await vault.read('deezer') || '', publicBase: String(env.MUSIC_PUBLIC_BASE_URL || '').replace(/\/+$/, '') });
export const spotifyConfigured = config => {
    try { const url = new URL(config.publicBase); return !!config.clientId && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'; }
    catch { return false; }
};
const SCOPES = ['user-library-read', 'user-library-modify', 'playlist-read-private', 'playlist-read-collaborative',
    'playlist-modify-private', 'user-read-playback-state', 'user-modify-playback-state'];
const refreshing = new Map();
const sessionWrites = new Map();
async function changeSession(ctx, change) {
    const key = ctx.principal;
    const preceding = sessionWrites.get(key);
    const pending = (async () => {
        if (preceding) await Promise.allSettled([preceding]);
        ctx.check(); return change();
    })();
    sessionWrites.set(key, pending);
    try { return await pending; } finally { if (sessionWrites.get(key) === pending) sessionWrites.delete(key); }
}
const tokenRecord = (token, previous = {}, now = Date.now()) => {
    if (!token?.access_token || token.token_type?.toLowerCase() !== 'bearer' || !(Number(token.expires_in) > 0)) throw new MusicFailure('PROVIDER_REJECTED');
    return { ...previous, access_token: token.access_token, refresh_token: token.refresh_token || previous.refresh_token,
        authorization_id: previous.authorization_id || randomBytes(16).toString('hex'),
        expires_at: now + Number(token.expires_in) * 1000, authorized_at: previous.authorized_at || now,
        scopes: typeof token.scope === 'string' ? token.scope.split(' ').filter(Boolean) : previous.scopes || [] };
};
const token = (ctx, fields) => spotifyFetch(ctx.fetchImpl, 'https://accounts.spotify.com/api/token', {
    method: 'POST', signal: ctx.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: ctx.config.clientId, ...fields })
});
const publicSession = record => ({ state: record ? 'connected' : 'disconnected', identity: record?.identity || null });

export async function spotifySession(ctx) {
    ctx.check();
    const record = await ctx.vault.readRecord('music.spotify'); ctx.check();
    if (!record) throw new MusicFailure('AUTHORIZATION_REQUIRED');
    if (Date.now() < record.expires_at - 30_000) return record;
    if (!record.refresh_token) throw new MusicFailure('AUTHORIZATION_REQUIRED');
    const key = ctx.principal;
    if (refreshing.has(key)) { await refreshing.get(key); ctx.check(); return spotifySession(ctx); }
    const pending = (async () => {
        let updated;
        try { updated = tokenRecord(await token(ctx, { grant_type: 'refresh_token', refresh_token: record.refresh_token }), record); }
        catch (error) {
            if (['PROVIDER_REJECTED', 'AUTHORIZATION_REQUIRED'].includes(error.code)) throw new MusicFailure('AUTHORIZATION_REQUIRED');
            throw error;
        }
        ctx.check();
        await changeSession(ctx, async () => {
            const current = await ctx.vault.readRecord('music.spotify'); ctx.check();
            if (!current || current.access_token !== record.access_token) throw new MusicFailure('CONTEXT_CHANGED');
            await ctx.vault.storeRecord('music.spotify', updated); ctx.check();
        });
        return updated;
    })();
    refreshing.set(key, pending);
    try { return await pending; } finally { refreshing.delete(key); }
}

export function startSpotifyConnection(ctx) {
    if (!spotifyConfigured(ctx.config)) throw new MusicFailure('NOT_CONFIGURED');
    ctx.check();
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return startSocialAuthorization({ principal: ctx.principal, network: 'spotify', config: { SOCIAL_PUBLIC_BASE_URL: ctx.config.publicBase },
        adapter: { authorizeUrl({ state, redirectUri }) {
            const url = new URL('https://accounts.spotify.com/authorize');
            url.search = new URLSearchParams({ client_id: ctx.config.clientId, response_type: 'code', redirect_uri: redirectUri,
                state, code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES.join(' ') }).toString();
            return url.toString();
        } }, complete: async (code, redirectUri, isCurrent) => {
            const check = () => { if (!isCurrent()) throw new SocialError('social_cancelled'); };
            const authorization = { ...ctx, signal: AbortSignal.timeout(20000), check, authorizationPending: true };
            try {
                const record = tokenRecord(await token(authorization, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier }));
                check();
                if (!record.refresh_token || SCOPES.some(scope => !record.scopes.includes(scope))) throw new MusicFailure('PERMISSION_DENIED');
                const profile = await spotifyApi(authorization, record, '/me');
                if (!profile?.id || !profile.account_id) throw new MusicFailure('PROVIDER_REJECTED');
                record.identity = { id: profile.account_id, name: String(profile.display_name || '') };
                record.spotify_user_id = profile.id;
                await changeSession(authorization, async () => { check(); await ctx.vault.storeRecord('music.spotify', record); check(); });
                return publicSession(record);
            } catch (error) {
                // The shared callback only emits its safe, typed errors.
                throw new SocialError(error instanceof SocialError ? error.code : musicError(error));
            }
        } });
}
export const awaitSpotifyConnection = ctx => awaitSocialAuthorization({ principal: ctx.principal, attemptId: ctx.input.attempt_id, network: 'spotify', signal: ctx.signal });
export const cancelSpotifyConnection = ctx => cancelSocialAuthorization({ principal: ctx.principal, attemptId: ctx.input.attempt_id, network: 'spotify' });
export async function disconnectSpotify(ctx) {
    ctx.check(); cancelSocialAuthorization({ principal: ctx.principal, network: 'spotify' });
    await changeSession(ctx, () => ctx.vault.removeRecord('music.spotify'));
    ctx.check(); return { state: 'disconnected', provider_revoked: false };
}
