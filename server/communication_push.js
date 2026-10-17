import crypto from 'node:crypto';
import db from '../database/adole.js';
import { createApnsTransport } from './apns_transport.js';
import { createFcmTransport } from './fcm_transport.js';

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createCommunicationPush({ query, transport = createApnsTransport(), androidTransport = createFcmTransport(), now = Date.now } = {}) {
    async function register(claims, input) {
        if (!claims?.sub || !claims.sid || !claims.cnf?.kid) throw new Error('auth_session_invalid');
        const provider = input.provider || 'apns';
        const validToken = provider === 'apns' ? /^[a-f0-9]{64,200}$/.test(input.deviceToken)
            : /^[A-Za-z0-9_-]{22}$/.test(input.deviceToken) && input.environment === 'production';
        if (!['apns', 'fcm'].includes(provider) || !validToken || !/^[a-f0-9-]{36}$/.test(input.installationId)
            || !['alert', 'voip'].includes(input.kind) || !['sandbox', 'production'].includes(input.environment)) throw new Error('push_registration_invalid');
        const row = await query('get', 'SELECT key_id,provider FROM auth_push_installations WHERE installation_id = ? AND kind = ?', [input.installationId, input.kind]);
        // An installation cannot be reassigned by a foreign device key.
        if (row && (row.key_id !== claims.cnf.kid || row.provider !== provider)) throw new Error('push_registration_invalid');
        if (!row) {
            const count = await query('get', 'SELECT count(*) AS total FROM auth_push_installations WHERE principal_id=? AND kind=?', [claims.sub, input.kind]);
            if (count.total >= 20) throw new Error('push_installation_limit');
        }
        await query('run', 'DELETE FROM auth_push_installations WHERE token = ? AND kind = ? AND environment = ? AND key_id = ? AND provider = ?',
            [input.deviceToken, input.kind, input.environment, claims.cnf.kid, provider]);
        await query('run', `INSERT INTO auth_push_installations
            (installation_id,kind,principal_id,key_id,session_id,token,environment,updated_ms,provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(installation_id, kind) DO UPDATE SET principal_id=excluded.principal_id, session_id=excluded.session_id,
            token=excluded.token, environment=excluded.environment, updated_ms=excluded.updated_ms`,
        [input.installationId, input.kind, claims.sub, claims.cnf.kid, claims.sid, input.deviceToken, input.environment, now(), provider]);
        return { ok: true };
    }
    async function prune(claims, input) {
        if (!claims?.sub || !claims.cnf?.kid || !/^[a-f0-9-]{36}$/.test(input.installationId)
            || !Array.isArray(input.kinds) || input.kinds.some(kind => !['alert', 'voip'].includes(kind))) throw new Error('push_registration_invalid');
        for (const kind of ['alert', 'voip'].filter(kind => !input.kinds.includes(kind))) await query('run',
            'DELETE FROM auth_push_installations WHERE installation_id=? AND principal_id=? AND key_id=? AND kind=?',
            [input.installationId, claims.sub, claims.cnf.kid, kind]);
        return { ok: true };
    }
    async function deliver(principal, item) {
        if (!transport.configured() && !androidTransport.configured()) return { ok: false, error: 'push_configuration_required' };
        const control = item.kind === 'call-state' && /^[a-f0-9-]{36}$/.test(item.room_id);
        const call = item.kind === 'call-invitation' && /^[a-f0-9-]{36}$/.test(item.room_id)
            && Number(item.expires_at) > now();
        const kind = call || control ? 'voip' : 'alert';
        if (item.kind === 'call-invitation' && !call) return { ok: true, expired: true };
        const expiresAt = call ? Number(item.expires_at) : now() + (control ? 60000 : 86400000);
        const installations = await query('all', `SELECT i.* FROM auth_push_installations i
            JOIN auth_device_sessions s ON s.session_id=i.session_id
            JOIN auth_device_keys k ON k.key_id=i.key_id
            WHERE i.principal_id=? AND i.kind=? AND s.principal_id=i.principal_id AND s.key_id=i.key_id
            AND k.principal_id=i.principal_id AND s.revoked_ms IS NULL AND k.revoked_ms IS NULL
            AND s.expires_ms>? AND s.idle_expires_ms>?`, [principal, kind, now(), now()]);
        const results = [];
        await query('run', 'DELETE FROM auth_push_deliveries WHERE expires_ms <= ?', [now()]);
        for (let offset = 0; offset < installations.length; offset += 4) await Promise.all(installations.slice(offset, offset + 4).map(async installation => {
            const deliveryTransport = installation.provider === 'fcm' ? androidTransport : transport;
            // Apple VoIP pushes are exclusively new calls; Android controls
            // only stop an existing system projection via the same transport.
            if (control && installation.provider !== 'fcm') return;
            if (!deliveryTransport.configured()) { results.push({ ok: false, error: 'push_configuration_required' }); return; }
            if (call && now() >= expiresAt) { results.push({ ok: false, error: 'push_call_expired' }); return; }
            const id = digest([principal, installation.installation_id, kind, item.id]);
            let reserved = await query('run', `INSERT INTO auth_push_deliveries VALUES (?, ?, ?, 'sending', ?)
                ON CONFLICT(delivery_id) DO NOTHING`, [id, installation.installation_id, kind, expiresAt]);
            if (!reserved.changes) reserved = await query('run', "UPDATE auth_push_deliveries SET state='sending' WHERE delivery_id=? AND state='retry'", [id]);
            if (!reserved.changes) return;
            // No message, phone, bearer, photo or caller name is exposed on the lock screen.
            const payload = { aps: call ? {} : { alert: { title: 'Atome', 'loc-key': 'ATOME_NOTIFICATION' }, sound: 'default' },
                atome: { principal_id: principal, notification_id: item.id, peer_id: item.from_id,
                    ...(call || control ? { room_id: item.room_id, call_mode: item.call_mode, expires_at: expiresAt } : {}),
                    ...(control ? { status: item.status, accepted_principal_id: item.acceptedPrincipalId,
                        accepted_key_id: item.acceptedKeyId } : {}) } };
            let result;
            try { result = await deliveryTransport.send(installation, payload, { voip: call, control, expiresAt, collapseId: id }); }
            catch { result = { ok: false, error: 'push_transport_uncertain' }; }
            const state = result.ok ? 'accepted' : result.status === 429 || result.status >= 500 ? 'retry' : 'failed';
            await query('run', 'UPDATE auth_push_deliveries SET state=? WHERE delivery_id=?', [state, id]);
            if (result.invalidToken) await query('run', 'DELETE FROM auth_push_installations WHERE installation_id=? AND kind=? AND token=? AND updated_ms=?',
                [installation.installation_id, kind, installation.token, installation.updated_ms]);
            results.push(result);
        }));
        return { ok: results.every(result => result.ok), installations: installations.length, results };
    }
    async function available(principal) {
        const rows = await query('all', `SELECT i.provider FROM auth_push_installations i
            JOIN auth_device_sessions s ON s.session_id=i.session_id JOIN auth_device_keys k ON k.key_id=i.key_id
            WHERE i.principal_id=? AND i.kind='voip' AND s.principal_id=i.principal_id AND s.key_id=i.key_id
            AND k.principal_id=i.principal_id AND s.revoked_ms IS NULL AND k.revoked_ms IS NULL
            AND s.expires_ms>? AND s.idle_expires_ms>?`, [principal, now(), now()]);
        return rows.some(row => (row.provider === 'fcm' ? androidTransport : transport).configured());
    }
    return { register, prune, deliver, available };
}
export const communicationPush = createCommunicationPush({ query: (...args) => db.query(...args) });
