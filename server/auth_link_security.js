import crypto from 'node:crypto';
import { authSigningMessage } from '../atome/src/shared/auth_link_contract.js';

export const randomHandle = () => crypto.randomBytes(32).toString('base64url');
export const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
export const reject = (code = 'auth_proof_invalid') => { throw new Error(code); };
export const requireHandle = (value) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) reject('auth_request_invalid');
    return value;
};

export function publicDeviceKey(value) {
    if (!value || value.kty !== 'EC' || value.crv !== 'P-256' || value.d !== undefined
        || !/^[A-Za-z0-9_-]{43}$/.test(value.x) || !/^[A-Za-z0-9_-]{43}$/.test(value.y)) reject('auth_key_invalid');
    const jwk = { kty: 'EC', crv: 'P-256', x: value.x, y: value.y };
    try { crypto.createPublicKey({ key: jwk, format: 'jwk' }); } catch { reject('auth_key_invalid'); }
    return { jwk, keyId: digest(JSON.stringify(jwk)) };
}

// The account's backup keys as a device carries them (#squirrel/security/backup_keyring.js): opaque here,
// wrapped or sealed for a key the server never holds; only their shape and size are checked.
export function backupKeysOf(value) {
    if (value === undefined || value === null) return null;
    let box;
    try { box = typeof value === 'string' && value.length <= 16384 ? JSON.parse(value) : null; } catch { box = null; }
    if (box?.version !== 1 || typeof box.iv !== 'string' || typeof box.data !== 'string') reject('auth_request_invalid');
    return value;
}
// What an approval binds carried backup keys to (the client computes the same).
export const backupKeysDigest = (value) => (value ? digest(value) : '-');

export function createAuthProofSecurity({ query, transaction, masterSecret, now = Date.now }) {
    if (typeof masterSecret !== 'string' || masterSecret.length < 32) reject('auth_secret_required');
    const sealKey = Buffer.from(crypto.hkdfSync('sha256', masterSecret, 'atome-auth-v1', 'phone-encryption', 32));
    const indexKey = Buffer.from(crypto.hkdfSync('sha256', masterSecret, 'atome-auth-v1', 'phone-lookup', 32));
    const keyedIndex = (value) => crypto.createHmac('sha256', indexKey).update(value).digest('hex');
    const sealPhone = (phone) => {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', sealKey, iv);
        const ciphertext = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
    };
    const openPhone = (sealed) => {
        const bytes = Buffer.from(sealed, 'base64url');
        const decipher = crypto.createDecipheriv('aes-256-gcm', sealKey, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    };
    async function audit(eventType, principalId = null, referenceId = null) {
        await query('run', 'INSERT INTO auth_security_events VALUES (?, ?, ?, ?, ?)',
            [randomHandle(), principalId, eventType, referenceId, now()]);
    }
    async function limit(bucket, maximum, windowMs) {
        const current = now();
        await query('run', `INSERT INTO auth_send_limits VALUES (?, 1, ?)
            ON CONFLICT(bucket) DO UPDATE SET
            count = CASE WHEN reset_ms <= ? THEN 1 ELSE count + 1 END,
            reset_ms = CASE WHEN reset_ms <= ? THEN excluded.reset_ms ELSE reset_ms END`,
        [bucket, current + windowMs, current, current]);
        const entry = await query('get', 'SELECT count FROM auth_send_limits WHERE bucket = ?', [bucket]);
        if (entry.count > maximum) reject('auth_rate_limited');
    }
    async function challenge(purpose, reference, keyId, clientNonce = null) {
        const nonce = clientNonce ? `${randomHandle()}:${requireHandle(clientNonce)}` : randomHandle();
        const result = { purpose, reference, keyId, challenge: randomHandle(), nonce, issuedAt: now() };
        await query('run', `INSERT INTO auth_device_challenges VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
            [result.challenge, purpose, reference, keyId, result.nonce, result.issuedAt, result.issuedAt + 60000]);
        return result;
    }
    // One fresh challenge, bound to purpose, reference and key, is consumed once
    // by a proof over its signing message: a device signature (`consumeProof`)
    // or a WebAuthn assertion whose challenge is the message digest.
    async function consumeChallenge(challengeId, purpose, reference, keyId, verify) {
        requireHandle(challengeId);
        const proof = await query('get', 'SELECT * FROM auth_device_challenges WHERE challenge_id = ?', [challengeId]);
        if (!proof || proof.consumed_ms !== null || proof.expires_ms <= now()
            || proof.purpose !== purpose || proof.reference_id !== reference || proof.key_id !== keyId) reject();
        const message = Buffer.from(authSigningMessage({ purpose, reference, keyId,
            challenge: challengeId, nonce: proof.nonce, issuedAt: proof.issued_ms }));
        const outcome = await verify(message);
        const result = await query('run', `UPDATE auth_device_challenges SET consumed_ms = ?
            WHERE challenge_id = ? AND consumed_ms IS NULL`, [now(), challengeId]);
        if (Number(result.changes) !== 1) reject();
        return outcome;
    }
    async function consumeProof({ challengeId, signature }, purpose, reference, publicKey) {
        if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86,96}$/.test(signature)) reject();
        const { keyId, jwk } = publicDeviceKey(publicKey);
        await consumeChallenge(challengeId, purpose, reference, keyId, (bytes) => {
            const encodedSignature = Buffer.from(signature, 'base64url');
            if (!crypto.verify('sha256', bytes, { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }),
                dsaEncoding: encodedSignature.length === 64 ? 'ieee-p1363' : 'der' }, encodedSignature)) reject();
        });
    }
    async function cleanup() {
        await transaction(async () => {
            await query('run', 'DELETE FROM auth_device_challenges WHERE expires_ms <= ?', [now()]);
            await query('run', `DELETE FROM auth_phone_changes WHERE attempt_id IN
                (SELECT attempt_id FROM auth_link_attempts WHERE expires_ms <= ?)`, [now()]);
            await query('run', 'DELETE FROM auth_link_attempts WHERE expires_ms <= ?', [now()]);
            await query('run', 'DELETE FROM auth_send_limits WHERE reset_ms <= ?', [now()]);
            await query('run', 'DELETE FROM auth_security_events WHERE created_ms < ?', [now() - 180 * 86400000]);
            await query('run', `UPDATE auth_pair_requests SET state = 'expired'
                WHERE expires_ms <= ? AND state IN ('pending', 'approved')`, [now()]);
            await query('run', 'DELETE FROM auth_pair_requests WHERE expires_ms <= ?', [now() - 86400000]);
            await query('run', `UPDATE auth_recovery_requests SET state = 'expired'
                WHERE expires_ms <= ? AND state = 'pending'`, [now()]);
        });
    }
    return { keyedIndex, sealPhone, openPhone, audit, limit, challenge, consumeChallenge, consumeProof, cleanup };
}
