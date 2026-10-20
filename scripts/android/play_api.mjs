import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import jwt from 'jsonwebtoken';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export class PlayError extends Error {
    constructor(operation, status, uncertain = false) {
        const hint = status === 403 ? 'Check application access and testing-track permissions.'
            : status === 401 ? 'Check service account authorization.'
                : status === 404 ? 'Check the initial Console upload, application and edit.'
                    : 'Inspect the application in Play Console before retrying.';
        super(`Google Play ${operation} failed (${status || 'network'}). ${hint}`);
        this.status = status; this.uncertain = uncertain;
    }
}

// Service-account OAuth for Google APIs: the Android Publisher scope for the release
// client below and the server's purchase verification (`server/billing/`), another
// scope for Firebase App Distribution (`firebase_distribution.mjs`).
export function createPlayAuthorization({ account, scope = PUBLISHER_SCOPE, request = fetch, now = Date.now }) {
    let access;
    return async function authorize() {
        if (access?.expires > now() + 60000) return access.token;
        let assertion;
        try {
            assertion = jwt.sign({ iss: account.client_email, scope, aud: TOKEN_URL,
                iat: Math.floor(now() / 1000), exp: Math.floor(now() / 1000) + 3600 }, account.private_key, { algorithm: 'RS256' });
        } catch { throw new Error('Google service account signing key is invalid'); }
        let response;
        try { response = await request(TOKEN_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) }); }
        catch { throw new PlayError('authorization', 0); }
        if (!response.ok) throw new PlayError('authorization', response.status);
        let body;
        try { body = await response.json(); } catch { throw new PlayError('authorization response', response.status); }
        if (typeof body.access_token !== 'string' || !Number.isFinite(body.expires_in) || body.expires_in <= 60) throw new PlayError('authorization response', response.status);
        access = { token: body.access_token, expires: now() + Math.min(body.expires_in, 3600) * 1000 };
        return access.token;
    };
}

/** Local release-service boundary, independent of FCM's project-bound OS wake-up transport. */
export function createPlayClient({ packageName, account, request = fetch, now = Date.now,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    if (!/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/.test(packageName) || packageName.endsWith('.debug')) throw new Error('Invalid Play release package');
    const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits`;
    const authorize = createPlayAuthorization({ account, request, now });
    async function send(method, url, { body, upload = false, operation } = {}) {
        const bearer = await authorize();
        for (let attempt = 0; attempt < 3; attempt++) {
            let response;
            try { response = await request(url, { method, redirect: 'error', signal: AbortSignal.timeout(upload ? 600000 : 30000),
                headers: { authorization: `Bearer ${bearer}`, ...(body !== undefined && !upload ? { 'content-type': 'application/json' } : {}),
                    ...(upload ? { 'content-type': 'application/octet-stream', 'content-length': String((await stat(body)).size) } : {}) },
                ...(upload ? { body: createReadStream(body), duplex: 'half' } : body === undefined ? {} : { body: JSON.stringify(body) }) }); }
            catch {
                // Only reads are retried. Upload and commit may already have reached Google.
                if (method === 'GET' && attempt < 2) { await sleep(1000 * 2 ** attempt); continue; }
                throw new PlayError(operation, 0, method !== 'GET');
            }
            if (method === 'GET' && [429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
                const delay = Math.min(20000, Math.max(1000 * 2 ** attempt, Number(response.headers?.get('retry-after')) * 1000 || 0));
                await response.body?.cancel(); await sleep(delay); continue;
            }
            if (!response.ok) { await response.body?.cancel(); throw new PlayError(operation, response.status, method !== 'GET' && response.status >= 500); }
            if (response.status === 204) return {};
            try { return await response.json(); } catch { throw new PlayError(`${operation} response`, response.status, method !== 'GET'); }
        }
    }
    const editPath = id => {
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('Invalid Google Play edit identifier');
        return `${base}/${id}`;
    };
    return {
        createEdit: () => send('POST', base, { body: {}, operation: 'edit creation' }),
        getEdit: id => send('GET', editPath(id), { operation: 'edit inspection' }),
        deleteEdit: id => send('DELETE', editPath(id), { operation: 'edit cleanup' }),
        async state(id) {
            const [tracks, bundles, apks] = await Promise.all([
                send('GET', `${editPath(id)}/tracks`, { operation: 'track inspection' }),
                send('GET', `${editPath(id)}/bundles`, { operation: 'bundle inspection' }),
                send('GET', `${editPath(id)}/apks`, { operation: 'APK inspection' })]);
            if (!Array.isArray(tracks.tracks) || (bundles.bundles !== undefined && !Array.isArray(bundles.bundles))
                || (apks.apks !== undefined && !Array.isArray(apks.apks))) throw new Error('Invalid Play version inventory');
            return { tracks: tracks.tracks, bundles: bundles.bundles || [], apks: apks.apks || [] };
        },
        upload: (id, file) => send('POST', editPath(id).replace('/androidpublisher/', '/upload/androidpublisher/') + '/bundles?uploadType=media',
            { body: file, upload: true, operation: 'bundle upload' }),
        updateInternal: (id, release) => send('PUT', `${editPath(id)}/tracks/internal`, {
            body: { track: 'internal', releases: [{ name: `${release.versionName} (${release.versionCode})`,
                versionCodes: [String(release.versionCode)], status: 'completed', ...(release.releaseNotes?.length ? { releaseNotes: release.releaseNotes } : {}) }] },
            operation: 'internal track update' }),
        validate: id => send('POST', `${editPath(id)}:validate`, { operation: 'edit validation' }),
        commit: id => send('POST', `${editPath(id)}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, { operation: 'internal release commit' })
    };
}
