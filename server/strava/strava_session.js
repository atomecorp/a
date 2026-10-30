import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startSocialAuthorization, awaitSocialAuthorization, cancelSocialAuthorization } from '../social/social_oauth.js';
import { SocialError } from '../social/social_http.js';
import { loadLocalSocialConfig, loadLocalStravaConfig } from '../auth_secret_config.js';
import { StravaFailure, STRAVA_SCOPES, stravaError } from '../../atome/src/squirrel/strava/contracts.js';

// The person's Strava session (register R-016 lot F). The atome application is registered at Strava by the atome
// operator, never by a user: its Client ID and Client Secret are the server's configuration (`STRAVA_CLIENT_ID`,
// `STRAVA_CLIENT_SECRET`; in development also `Private/strava.env`), the public origin the OAuth owner's
// (`SOCIAL_PUBLIC_BASE_URL`). Without them nothing is attempted: NOT_CONFIGURED. The tokens live only in the person's
// encrypted server vault (`health.strava`); the device only ever gets the public view built here.
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const localConfigRead = new WeakSet();
export const STRAVA_RECORD = 'health.strava';
const TOKEN_URL = 'https://www.strava.com/oauth/token';

export const readStravaConfig = (env = process.env) => {
    if (!localConfigRead.has(env)) { loadLocalStravaConfig(PROJECT_ROOT, env); loadLocalSocialConfig(PROJECT_ROOT, env); localConfigRead.add(env); }
    return { clientId: String(env.STRAVA_CLIENT_ID || '').trim(), clientSecret: String(env.STRAVA_CLIENT_SECRET || '').trim(),
        publicBase: String(env.SOCIAL_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '') };
};
export const stravaConfigured = config => {
    try {
        const url = new URL(config.publicBase);
        return /^[0-9]{1,12}$/.test(config.clientId) && /^\S{8,200}$/.test(config.clientSecret) && url.protocol === 'https:'
            && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
    } catch { return false; }
};

// Every Strava URL is built here, never taken from a caller. A Strava message is never passed on (it may quote a token).
export async function stravaFetch(fetchImpl, url, init = {}) {
    let response;
    try { response = await fetchImpl(url, { ...init, redirect: 'error' }); }
    catch { throw new StravaFailure('PROVIDER_UNAVAILABLE'); }
    if (!response.ok) throw new StravaFailure(response.status === 401 ? 'AUTHORIZATION_REQUIRED' : response.status === 403 ? 'PERMISSION_DENIED'
        : response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED');
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch { throw new StravaFailure('PROVIDER_UNAVAILABLE'); }
}

const form = (ctx, fields) => stravaFetch(ctx.fetchImpl, TOKEN_URL, { method: 'POST', signal: ctx.signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: ctx.config.clientId, client_secret: ctx.config.clientSecret, ...fields }) });
// Strava answers `expires_at` in seconds and a new refresh token at every request (the previous one stops working).
const tokenRecord = (token, previous = {}, now = Date.now()) => {
    if (!token?.access_token || !token.refresh_token || String(token.token_type || '').toLowerCase() !== 'bearer' || !(Number(token.expires_at) > 0))
        throw new StravaFailure('PROVIDER_REJECTED');
    return { ...previous, access_token: token.access_token, refresh_token: token.refresh_token, expires_at: Number(token.expires_at) * 1000,
        authorization_id: previous.authorization_id || randomBytes(16).toString('hex'), authorized_at: previous.authorized_at || now,
        scopes: typeof token.scope === 'string' ? token.scope.split(/[\s,]+/).filter(Boolean) : previous.scopes || [] };
};
export const stravaPublicState = record => ({ state: record ? 'connected' : 'disconnected', ...(record?.identity ? { identity: record.identity } : {}) });

// One write of a person's session at a time; a refresh shared by the calls that need it at once.
const refreshing = new Map(), writes = new Map();
async function changeSession(ctx, change) {
    const preceding = writes.get(ctx.principal);
    const pending = (async () => { if (preceding) await Promise.allSettled([preceding]); ctx.check(); return change(); })();
    writes.set(ctx.principal, pending);
    try { return await pending; } finally { if (writes.get(ctx.principal) === pending) writes.delete(ctx.principal); }
}

// A usable session, refreshed when its access token ends within the minute.
export async function stravaSession(ctx) {
    ctx.check();
    const record = await ctx.vault.readRecord(STRAVA_RECORD); ctx.check();
    if (!record) throw new StravaFailure('AUTHORIZATION_REQUIRED');
    if (Date.now() < record.expires_at - 60_000) return record;
    if (refreshing.has(ctx.principal)) { await refreshing.get(ctx.principal); ctx.check(); return stravaSession(ctx); }
    const pending = (async () => {
        let updated;
        try { updated = tokenRecord(await form(ctx, { grant_type: 'refresh_token', refresh_token: record.refresh_token }), record); }
        catch (error) { throw new StravaFailure(['PROVIDER_REJECTED', 'AUTHORIZATION_REQUIRED'].includes(error.code) ? 'AUTHORIZATION_REQUIRED' : error.code); }
        await changeSession(ctx, async () => {
            const current = await ctx.vault.readRecord(STRAVA_RECORD); ctx.check();
            if (current?.authorization_id !== record.authorization_id) throw new StravaFailure('CONTEXT_CHANGED');
            await ctx.vault.storeRecord(STRAVA_RECORD, updated);
        });
        return updated;
    })();
    refreshing.set(ctx.principal, pending);
    try { return await pending; } finally { refreshing.delete(ctx.principal); }
}

export function startStravaConnection(ctx) {
    if (!stravaConfigured(ctx.config)) throw new StravaFailure('NOT_CONFIGURED');
    ctx.check();
    return startSocialAuthorization({ principal: ctx.principal, network: 'strava', config: { SOCIAL_PUBLIC_BASE_URL: ctx.config.publicBase },
        adapter: { authorizeUrl({ state, redirectUri }) {
            const url = new URL('https://www.strava.com/oauth/authorize');
            url.search = new URLSearchParams({ client_id: ctx.config.clientId, redirect_uri: redirectUri, response_type: 'code',
                approval_prompt: 'auto', scope: STRAVA_SCOPES.join(','), state }).toString();
            return url.toString();
        } },
        // Runs in the OAuth callback, bound to the person who started it.
        complete: async (code, redirectUri, isCurrent) => {
            const check = () => { if (!isCurrent()) throw new SocialError('social_cancelled'); };
            const authorization = { ...ctx, signal: AbortSignal.timeout(20000), check };
            try {
                const token = await form(authorization, { grant_type: 'authorization_code', code });
                const record = tokenRecord(token); check();
                // Unticked on Strava's page, the activities cannot be read: nothing is kept.
                if (!record.scopes.some(scope => scope === 'activity:read' || scope === 'activity:read_all')) throw new StravaFailure('PERMISSION_DENIED');
                const athlete = token.athlete || {};
                if (!/^[0-9]{1,20}$/.test(String(athlete.id ?? ''))) throw new StravaFailure('PROVIDER_REJECTED');
                record.identity = { id: String(athlete.id), name: [athlete.firstname, athlete.lastname].map(part => String(part || '').trim()).filter(Boolean).join(' ') };
                await changeSession(authorization, async () => { check(); await ctx.vault.storeRecord(STRAVA_RECORD, record); check(); });
                return stravaPublicState(record);
            } catch (error) {
                // The shared callback only emits its safe, typed errors.
                throw new SocialError(error instanceof SocialError ? error.code : stravaError(error));
            }
        } });
}
export const awaitStravaConnection = ctx => awaitSocialAuthorization({ principal: ctx.principal, attemptId: ctx.input.attempt_id, network: 'strava', signal: ctx.signal });
export const cancelStravaConnection = ctx => cancelSocialAuthorization({ principal: ctx.principal, attemptId: ctx.input.attempt_id, network: 'strava' });

// The tokens are removed from atome in every case; Strava's revocation is asked and its outcome said, never assumed.
export async function disconnectStrava(ctx) {
    ctx.check(); cancelSocialAuthorization({ principal: ctx.principal, network: 'strava' });
    const record = await ctx.vault.readRecord(STRAVA_RECORD); ctx.check();
    let revoked = false;
    if (record && stravaConfigured(ctx.config)) {
        const basic = Buffer.from(`${ctx.config.clientId}:${ctx.config.clientSecret}`).toString('base64');
        revoked = await stravaFetch(ctx.fetchImpl, 'https://www.strava.com/oauth/revoke', { method: 'POST', signal: ctx.signal,
            headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: record.refresh_token, token_type_hint: 'refresh_token' }) }).then(() => true, () => false);
    }
    await changeSession(ctx, () => ctx.vault.removeRecord(STRAVA_RECORD));
    ctx.check();
    return { state: 'disconnected', provider_revoked: revoked };
}
