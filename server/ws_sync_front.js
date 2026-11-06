// Fastify's half of a /ws/sync connection: the runtime is the Rust front's
// (atome/servers/atome-server/src/ws_sync), which opens one Fastify connection
// per device connection with the client's own headers and its header
// `x-atome-front` (the secret it handed Fastify, ATOME_FRONT_SECRET). On it the
// front asks what still lives here: the device session, the connection proof and
// the principal (wsSyncSecurity.js), provisioning, the version, and the live part of `/dev/state`
// (atome-server src/dev/: the /ws/api connections, their accounts, the recent errors). Without the
// front's header the connection is refused: Fastify keeps no sync runtime of its own.
import crypto from 'node:crypto';
import { wsSendJson } from './wsSend.js';
import { wsApiClientsByUserId, wsApiConnections } from './wsApiState.js';
import { recentErrors } from './server_dedup.js';

const FRONT_SECRET = Buffer.from(String(process.env.ATOME_FRONT_SECRET || ''));

function fromFront(value) {
    const secret = Buffer.from(String(value || ''));
    return FRONT_SECRET.length > 0 && secret.length === FRONT_SECRET.length && crypto.timingSafeEqual(secret, FRONT_SECRET);
}

export function createWsSyncFront({ authenticateRequest, authenticateMessage, issueChallenge, validatePrincipal, isProvisioned,
    getVersion }) {
    const answers = {
        'front-sync-request': async (connection, request) => ({ principal: await authenticateRequest(connection, request) || null }),
        'front-sync-challenge': async (connection, _request, data) => ({ challenge: await issueChallenge(connection, data.message || {}) }),
        'front-sync-message': async (connection, _request, data) => ({ principal: await authenticateMessage(connection, data.message || {}) || null }),
        'front-sync-validate': async (connection) => ({ principal: await validatePrincipal(connection) || null }),
        // The expiry is read as the connection holds it: the front applies `Number()` to it as Fastify did.
        'front-sync-activate': async (connection, _request, data) => ({
            provisioned: await isProvisioned(data.principal) === true,
            exp_ms: connection._wsApiAuthExpMs,
            version: (await getVersion())?.version || null
        }),
        'front-dev-state': async () => ({
            ws_api_connections: wsApiConnections.size,
            ws_api_users: wsApiClientsByUserId.size,
            recent_errors: recentErrors.slice(-20)
        })
    };
    return {
        attach(connection, request) {
            if (!fromFront(request.headers['x-atome-front'])) {
                connection.close(4401, 'front_required');
                return;
            }
            connection.on('message', async (raw) => {
                let data;
                try { data = JSON.parse(raw.toString()); } catch { return; }
                const type = String(data?.type || '');
                const answer = answers[type];
                if (!answer || !fromFront(data.secret)) return;
                const reply = (fields) => wsSendJson(connection, { type: `${type}-response`, front_id: data.front_id, ...fields },
                    { scope: 'ws/sync', op: 'front' });
                try { reply(await answer(connection, request, data)); }
                catch (error) { reply({ error: error instanceof Error ? error.message : String(error) }); }
            });
        }
    };
}
