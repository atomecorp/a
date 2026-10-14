import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';

/** Google FCM is an OS wake-up transport; application traffic stays on /ws/api. */
export function createFcmTransport({ environment = process.env, request = fetch, readKey = readFile, now = Date.now } = {}) {
    let access = null, authorizing = null;
    const configured = () => Boolean(environment.FCM_PROJECT_ID && environment.FCM_SERVICE_ACCOUNT_PATH);
    async function authorize() {
        if (access?.expires > now() + 60000) return access.token;
        if (!authorizing) authorizing = (async () => {
            let key;
            try { key = JSON.parse(await readKey(environment.FCM_SERVICE_ACCOUNT_PATH, 'utf8')); }
            catch { throw new Error('fcm_configuration_required'); }
            if (key.project_id !== environment.FCM_PROJECT_ID || typeof key.private_key !== 'string'
                || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(key.client_email)) throw new Error('fcm_configuration_required');
            const assertion = jwt.sign({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
                aud: 'https://oauth2.googleapis.com/token', iat: Math.floor(now() / 1000), exp: Math.floor(now() / 1000) + 3600 },
            key.private_key, { algorithm: 'RS256' });
            const response = await request('https://oauth2.googleapis.com/token', { method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
                signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error('fcm_authorization_unavailable');
            const body = await response.json();
            if (typeof body.access_token !== 'string' || !Number.isFinite(body.expires_in)
                || body.expires_in <= 60) throw new Error('fcm_authorization_unavailable');
            access = { token: body.access_token, expires: now() + Math.min(body.expires_in, 3600) * 1000 };
            return access.token;
        })().finally(() => { authorizing = null; });
        return authorizing;
    }
    async function send(installation, payload, { voip = false, expiresAt, collapseId } = {}) {
        if (!configured()) return { ok: false, error: 'fcm_configuration_required' };
        if (!/^[a-z0-9-]{6,63}$/.test(environment.FCM_PROJECT_ID) || !/^[A-Za-z0-9_:.-]{32,4096}$/.test(installation.token))
            return { ok: false, error: 'fcm_installation_invalid' };
        const ttl = Math.max(0, Math.min(86400, Math.floor((expiresAt - now()) / 1000)));
        if (voip && ttl === 0) return { ok: false, error: 'push_call_expired' };
        let bearer;
        try { bearer = await authorize(); } catch { return { ok: false, error: 'fcm_authorization_unavailable' }; }
        const body = JSON.stringify({ message: { token: installation.token,
            data: { atome: JSON.stringify(payload.atome), notification_kind: voip ? 'call' : 'alert' },
            android: { priority: 'HIGH', ttl: `${ttl}s`, ...(voip ? { collapse_key: collapseId } : {}) } } });
        if (Buffer.byteLength(body, 'utf8') > 4096) return { ok: false, error: 'fcm_payload_too_large' };
        let response;
        try { response = await request(`https://fcm.googleapis.com/v1/projects/${environment.FCM_PROJECT_ID}/messages:send`,
            { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
                body, signal: AbortSignal.timeout(10000) }); }
        catch { return { ok: false, error: 'fcm_transport_uncertain' }; }
        if (response.ok) return { ok: true, status: response.status };
        if (response.status === 401) access = null;
        let reason;
        try { const body = await response.json(); reason = body.error?.details?.find(detail => detail.errorCode)?.errorCode; }
        catch { reason = ''; }
        return { ok: false, status: response.status, invalidToken: reason === 'UNREGISTERED', error: 'fcm_rejected' };
    }
    return { configured, send };
}
