import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import fastify from 'fastify';
import { startSpotifyConnection, awaitSpotifyConnection, disconnectSpotify, spotifySession } from '../../server/music/spotify_session.js';
import { completeSocialAuthorization, registerSocialRoutes, startSocialAuthorization } from '../../server/social/social_oauth.js';
import { createProviderCredentialVault } from '../../server/providerCredentialVault.js';
import { context, providerDouble, response, session, vaultWith } from './helpers.mjs';

const roots = [];
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
const diskVault = () => {
    mkdirSync('temp', { recursive: true });
    const root = mkdtempSync(resolve('temp/music-vault-')); roots.push(root);
    return { root, vault: createProviderCredentialVault({ root, secret: 'a'.repeat(64) }) };
};
function authorizationProvider({ onToken = null } = {}) {
    return providerDouble([
        ['POST', '/api/token', async ({ init }) => {
            onToken?.(new URLSearchParams(init.body));
            return { access_token: 'sensitive-spotify-access', refresh_token: 'sensitive-spotify-refresh', token_type: 'Bearer', expires_in: 3600,
                scope: 'user-library-read user-library-modify playlist-read-private playlist-read-collaborative playlist-modify-private user-read-playback-state user-modify-playback-state' };
        }], ['GET', '/v1/me', () => ({ id: 'alice-spotify', account_id: 'stable-account', display_name: 'Alice' })]
    ]);
}
test('PKCE, official redirect and encrypted per-account storage work through the real callback, including a late waiter', async () => {
    let authUrl;
    const provider = authorizationProvider({ onToken: body => {
        expect(body.get('client_secret')).toBeNull(); expect(body.get('grant_type')).toBe('authorization_code');
        expect(createHash('sha256').update(body.get('code_verifier')).digest('base64url')).toBe(authUrl.searchParams.get('code_challenge'));
        expect(body.get('redirect_uri')).toBe('https://atome.example/api/social/oauth/callback/spotify');
    } });
    const { root, vault } = diskVault(), ctx = context({ vault, fetchImpl: provider.fetchImpl });
    const start = startSpotifyConnection(ctx); authUrl = new URL(start.authorization_url);
    expect(authUrl.origin).toBe('https://accounts.spotify.com'); expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    const app = fastify(); registerSocialRoutes(app, { projectRoot: root });
    const query = new URLSearchParams({ state: authUrl.searchParams.get('state'), code: 'one-use-code' });
    const result = await app.inject({ method: 'GET', url: '/api/social/oauth/callback/spotify?' + query });
    expect(result.statusCode).toBe(200); expect(result.body).toContain('the account is connected'); expect(result.body).not.toContain('one-use-code');
    const done = await awaitSpotifyConnection({ ...ctx, input: { attempt_id: start.attempt_id } });
    expect(done).toMatchObject({ ok: true, account: { state: 'connected', identity: { id: 'stable-account' } } });
    expect(JSON.stringify(done)).not.toContain('sensitive-spotify');
    expect(readdirSync(root).map(file => readFileSync(resolve(root, file), 'utf8')).join('')).not.toContain('sensitive-spotify');
    const reopened = createProviderCredentialVault({ root, secret: 'a'.repeat(64) });
    expect((await reopened.readRecord('music.spotify')).access_token).toBe('sensitive-spotify-access');
    expect((await completeSocialAuthorization({ network: 'spotify', query: Object.fromEntries(query) })).ok).toBe(false);
    expect(provider.calls.filter(entry => entry.url.pathname === '/api/token')).toHaveLength(1);
    await app.close();
});
test('another principal or provider cannot wait for the music authorization', async () => {
    const ctx = context({ vault: vaultWith(null), fetchImpl: authorizationProvider().fetchImpl }), start = startSpotifyConnection(ctx);
    expect(await awaitSpotifyConnection({ ...ctx, principal: 'bob', input: { attempt_id: start.attempt_id } })).toMatchObject({ ok: false });
    await disconnectSpotify(ctx);
    const state = new URL(start.authorization_url).searchParams.get('state');
    expect(await completeSocialAuthorization({ network: 'spotify', query: { state, code: 'cancelled' } })).toMatchObject({ ok: false });
    expect(ctx.vault.storeRecord).not.toHaveBeenCalled();
    const social = startSocialAuthorization({ principal: 'alice', network: 'facebook', config: { SOCIAL_PUBLIC_BASE_URL: 'https://atome.example' },
        adapter: { authorizeUrl: () => 'https://www.facebook.com' }, complete: async () => ({}) });
    expect(await awaitSpotifyConnection({ ...ctx, input: { attempt_id: social.attempt_id } })).toMatchObject({ ok: false });
});
test('disconnect during a token exchange cannot resurrect a cancelled connection', async () => {
    let finish;
    const gate = new Promise(resolve => { finish = resolve; });
    const provider = providerDouble([
        ['POST', '/api/token', async () => { await gate; return { access_token: 'late', refresh_token: 'refresh', expires_in: 3600, token_type: 'Bearer', scope: '' }; }]
    ]), ctx = context({ vault: vaultWith(null), fetchImpl: provider.fetchImpl });
    const start = startSpotifyConnection(ctx), state = new URL(start.authorization_url).searchParams.get('state');
    const callback = completeSocialAuthorization({ network: 'spotify', query: { state, code: 'late' } });
    await disconnectSpotify(ctx); finish();
    expect(await callback).toMatchObject({ ok: false, error: 'social_cancelled' });
    expect(await ctx.vault.readRecord('music.spotify')).toBeNull(); expect(ctx.vault.storeRecord).not.toHaveBeenCalled();
});
test('refresh rotates protected tokens without extending the original authorization date', async () => {
    const old = session({ expires_at: 1, authorized_at: 123, scopes: ['user-library-read'] });
    const provider = providerDouble([['POST', '/api/token', ({ init }) => {
        expect(new URLSearchParams(init.body).get('grant_type')).toBe('refresh_token');
        return { access_token: 'new-access', refresh_token: 'new-refresh', token_type: 'Bearer', expires_in: 3600 };
    }]]), ctx = context({ vault: vaultWith(old), fetchImpl: provider.fetchImpl });
    const result = await spotifySession(ctx);
    expect(result).toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh', authorized_at: 123, identity: old.identity, scopes: old.scopes });
    expect((await ctx.vault.readRecord('music.spotify')).refresh_token).toBe('new-refresh');
});
test('invalid refresh grant requires consent and is never retried in a loop', async () => {
    const provider = providerDouble([['POST', '/api/token', () => response({ error: 'invalid_grant' }, 400)]]);
    await expect(spotifySession(context({ vault: vaultWith(session({ expires_at: 1 })), fetchImpl: provider.fetchImpl }))).rejects.toThrow('AUTHORIZATION_REQUIRED');
    expect(provider.calls).toHaveLength(1);
});
test('provider rate limits and interruption never expose provider messages or secrets', async () => {
    const provider = providerDouble([['POST', '/api/token', () => response({ message: 'private-access' }, 429, { 'retry-after': '30' })]]);
    await expect(spotifySession(context({ vault: vaultWith(session({ expires_at: 1 })), fetchImpl: provider.fetchImpl }))).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: '30' });
});
