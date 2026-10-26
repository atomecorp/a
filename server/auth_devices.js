import { randomHandle, reject } from './auth_link_security.js';

// Registry of device keys: one account x one device holds a silent `session` key
// and, where the platform verifies its user, an `approve` key. Only public halves
// are stored. Approve-class purposes are decided here, never on the client.
export const APPROVE_ASSURANCE = 'hardware_uv';
export const PROBATION_MS = 72 * 3600000;
const ASSURANCES = new Set(['hardware_uv', 'hardware', 'software']);
const PLATFORMS = new Set(['ios', 'ipados', 'android', 'macos', 'windows', 'linux', 'freebsd', 'chromeos', 'web']);
const ALWAYS_PERSONAL = new Set(['ios', 'ipados', 'android']);
// `enrolled_by` of a device opened by a recovery (code or SMS link).
const RECOVERY_CHANNELS = new Set(['recovery_code', 'phone_recovery']);

export function normalizeDeviceMeta(meta = {}) {
    const platform = PLATFORMS.has(meta?.platform) ? meta.platform : 'web';
    const label = String(meta?.label || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64);
    return { platform, label };
}

// Phones and tablets are personal; a computer or a browser says it once.
export function resolveDeviceClass(platform, requested) {
    if (ALWAYS_PERSONAL.has(platform)) return 'personal';
    if (requested === 'personal' || requested === 'shared') return requested;
    return reject('auth_device_class_required');
}

export const requireAssurance = (value) => (ASSURANCES.has(value) ? value : reject('auth_request_invalid'));

export function createDeviceRegistry({ query, now }) {
    // Keys enrolled by the V1 flows belong to clients that prove them on every connection.
    async function enroll({ keyId, principalId, jwk, role = 'session', deviceId, assurance = 'software', deviceClass = 'personal',
        platform = 'web', label = '', enrolledBy, restrictedUntil = now(), credentialId = null, signCount = 0, connectionProof = false }) {
        await query('run', `INSERT INTO auth_device_keys (key_id, principal_id, public_key, enrolled_ms, restricted_until_ms,
            revoked_ms, key_role, device_id, assurance, device_class, platform, label, enrolled_by, credential_id, sign_count, last_seen_ms,
            connection_proof) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [keyId, principalId, JSON.stringify(jwk), now(), restrictedUntil, role, deviceId || keyId, requireAssurance(assurance),
            deviceClass, platform, label, enrolledBy || null, credentialId, signCount, now(), connectionProof ? 1 : 0]);
    }
    const byId = (keyId) => query('get', 'SELECT * FROM auth_device_keys WHERE key_id = ?', [keyId]);
    const deviceOf = (row) => row.device_id || row.key_id;
    // The active approve key of the device that holds this session key.
    const approveKeyOf = async (sessionKey) => query('get', `SELECT * FROM auth_device_keys
        WHERE principal_id = ? AND device_id = ? AND key_role = 'approve' AND revoked_ms IS NULL
        ORDER BY enrolled_ms DESC LIMIT 1`, [sessionKey.principal_id, deviceOf(sessionKey)]);
    // A remote approval needs a user-verified key on a personal device out of probation.
    // A device enrolled by a recovery is the account's only device: it may replace
    // the consumed recovery code at once, so the account is never left without one.
    async function requireApprover(sessionKey, purpose) {
        if (!sessionKey || sessionKey.revoked_ms !== null) reject('auth_session_invalid');
        const approve = await approveKeyOf(sessionKey);
        if (!approve || approve.assurance !== APPROVE_ASSURANCE || approve.device_class !== 'personal'
            || sessionKey.device_class !== 'personal') reject('auth_approve_key_required');
        const recovered = purpose === 'recovery-code-set' && RECOVERY_CHANNELS.has(sessionKey.enrolled_by);
        if (!recovered && (approve.restricted_until_ms > now() || sessionKey.restricted_until_ms > now())) reject('auth_device_cooling_off');
        return approve;
    }
    async function list(principalId) {
        const rows = await query('all', `SELECT key_id, key_role, device_id, assurance, device_class, platform, label,
            enrolled_ms, restricted_until_ms, enrolled_by, last_seen_ms FROM auth_device_keys
            WHERE principal_id = ? AND revoked_ms IS NULL ORDER BY enrolled_ms`, [principalId]);
        const devices = new Map();
        for (const row of rows) {
            const id = deviceOf(row);
            const device = devices.get(id) || { deviceId: id, platform: row.platform || 'web', label: row.label || '',
                deviceClass: row.device_class, enrolledAt: row.enrolled_ms, lastSeenAt: row.last_seen_ms,
                probationUntil: row.restricted_until_ms, canApprove: false, sessionKeyId: null };
            if (row.key_role === 'session') device.sessionKeyId = row.key_id;
            if (row.key_role === 'approve' && row.assurance === APPROVE_ASSURANCE) device.canApprove = true;
            device.probationUntil = Math.max(device.probationUntil, row.restricted_until_ms);
            device.lastSeenAt = Math.max(device.lastSeenAt || 0, row.last_seen_ms || 0) || null;
            devices.set(id, device);
        }
        return [...devices.values()].filter((device) => device.sessionKeyId);
    }
    async function revokeDevice(principalId, deviceId) {
        const keys = await query('all', `SELECT key_id FROM auth_device_keys
            WHERE principal_id = ? AND (device_id = ? OR key_id = ?) AND revoked_ms IS NULL`, [principalId, deviceId, deviceId]);
        if (!keys.length) reject('auth_request_invalid');
        const sessions = [];
        for (const { key_id: keyId } of keys) {
            await query('run', 'UPDATE auth_device_keys SET revoked_ms = ? WHERE key_id = ?', [now(), keyId]);
            for (const session of await query('all', 'SELECT session_id FROM auth_device_sessions WHERE key_id = ? AND revoked_ms IS NULL', [keyId])) {
                await query('run', 'UPDATE auth_device_sessions SET revoked_ms = ? WHERE session_id = ?', [now(), session.session_id]);
                await query('run', 'DELETE FROM auth_push_installations WHERE session_id = ?', [session.session_id]);
                sessions.push(session.session_id);
            }
        }
        return sessions;
    }
    const touch = (keyId) => query('run', 'UPDATE auth_device_keys SET last_seen_ms = ? WHERE key_id = ?', [now(), keyId]);
    return { enroll, byId, deviceOf, approveKeyOf, requireApprover, list, revokeDevice, touch, newDeviceId: randomHandle };
}
