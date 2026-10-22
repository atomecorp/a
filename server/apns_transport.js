import http2 from 'node:http2';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';

/** APNs is an OS delivery transport, never an application command endpoint. */
export function createApnsTransport({ environment = process.env, connect = http2.connect, readKey = readFile } = {}) {
    const configured = () => ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY_PATH', 'APNS_TOPIC'].every(key => !!environment[key]);
    async function send(installation, payload, { voip = false, quiet = false, expiresAt, collapseId } = {}) {
        if (!configured()) return { ok: false, error: 'apns_configuration_required' };
        if (!/^[a-f0-9]{64,200}$/.test(installation.token) || !['sandbox', 'production'].includes(installation.environment)) {
            throw new Error('apns_installation_invalid');
        }
        const bytes = Buffer.from(JSON.stringify(payload));
        if (bytes.length > (voip ? 5120 : 4096)) throw new Error('apns_payload_too_large');
        let key;
        try { key = await readKey(environment.APNS_KEY_PATH); } catch { return { ok: false, error: 'apns_configuration_required' }; }
        const bearer = jwt.sign({ iss: environment.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }, key,
            { algorithm: 'ES256', keyid: environment.APNS_KEY_ID });
        const host = installation.environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
        return new Promise(resolve => {
            const session = connect(`https://${host}`);
            let settled = false;
            const finish = result => { if (settled) return; settled = true; clearTimeout(timer); session.destroy(); resolve(result); };
            const timer = setTimeout(() => finish({ ok: false, error: 'apns_transport_uncertain' }), 10000);
            session.on('error', () => finish({ ok: false, error: 'apns_transport_uncertain' }));
            let request;
            try { request = session.request({ ':method': 'POST', ':path': `/3/device/${installation.token}`,
                authorization: `bearer ${bearer}`, 'apns-topic': environment.APNS_TOPIC + (voip ? '.voip' : ''),
                'apns-push-type': voip ? 'voip' : 'alert', 'apns-priority': quiet ? '5' : '10',
                'apns-expiration': String(Math.floor(expiresAt / 1000)), 'apns-collapse-id': collapseId }); }
            catch { finish({ ok: false, error: 'apns_transport_uncertain' }); return; }
            let status = 0, body = '';
            request.on('response', headers => { status = Number(headers[':status']); });
            request.on('data', chunk => { if (body.length < 1024) body += chunk.toString(); });
            request.on('error', () => finish({ ok: false, error: 'apns_transport_uncertain' }));
            request.on('end', () => {
                let reason;
                try { reason = JSON.parse(body).reason; } catch { reason = ''; }
                finish({ ok: status === 200, status, invalidToken: status === 410 || ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(reason),
                    ...status === 200 ? {} : { error: 'apns_rejected' } });
            });
            request.end(bytes);
        });
    }
    return { send, configured };
}
