// The push to a person's devices is the Rust front's (atome/servers/atome-server/src/social/push/,
// with its APNs and FCM transports): Fastify's services reach it through SERVICE frames on the
// supervisor's control socket (`push:<operation>`). The installations' registration below is the
// `auth` family's own on Fastify's half, which the front answers too (auth/account_actions.rs),
// until that family's handlers leave at the cutover.
let supervisor = null;

// The supervisor's client (server/userVaultProvider.js), set once by server_services.js.
export function setCommunicationPushProvider(vaultProvider) {
    supervisor = vaultProvider;
}

const ask = (operation, payload) => {
    if (!supervisor) throw new Error('communication_push_provider_missing');
    return supervisor.service(`push:${operation}`, payload);
};

export const communicationPush = {
    // `exceptKeyIds`: device keys already told live; `personalOnly`: personal devices out of probation alone (an account notice).
    deliver: (principal, item, { exceptKeyIds = null, personalOnly = false } = {}) => ask('deliver',
        { principal: principal ?? null, item: item ?? null, exceptKeyIds: exceptKeyIds ? [...exceptKeyIds] : null, personalOnly }),
    // A VoIP installation a configured transport reaches: a call may ring.
    available: (principal) => ask('available', { principal: principal ?? null })
};

export function createCommunicationPush({ query, now = Date.now } = {}) {
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
    return { register, prune };
}
