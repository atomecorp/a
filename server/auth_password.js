import { publicDeviceKey, reject, requireHandle } from './auth_link_security.js';
import { hashPassword, verifyPassword, screenPassword } from './auth_password_crypto.js';
import { readPasswordCredential } from '../database/auth_credentials.js';
import { authPasswordRequestDigest } from '../atome/src/shared/auth_link_contract.js';

// Credentials belong to protected identity storage, never Atome state/history.
export function createPasswordAuth({ query, transaction, proof, sessions, findByPhone, findById,
    now = Date.now, screen = screenPassword, disconnectSession }) {
    let dummy;
    const credential = id => readPasswordCredential(query, id);
    const reference = input => `${proof.keyedIndex(input.phone)}:${input.clientNonce}`;
    const fields = input => {
        if (!/^\+[1-9]\d{7,14}$/.test(input.phone)) reject('auth_phone_e164_required');
        requireHandle(input.clientNonce);
        return publicDeviceKey(input.publicKey);
    };
    const limit = async (input, network, keyId) => {
        if (!network) reject();
        // Coupling phone to source avoids letting a stranger lock a victim globally.
        for (const bucket of [`password-network:${proof.keyedIndex(network)}`, `password-device:${keyId}`,
            `password-phone-source:${proof.keyedIndex(input.phone + ':' + network)}`]) await proof.limit(bucket, 8, 60000);
    };
    const failureBuckets = (input, network, keyId) => [proof.keyedIndex(`password-device:${keyId}`), proof.keyedIndex(`password-source:${input.phone}:${network}`)];
    async function throttle(input, network, keyId, failed = null) {
        for (const bucket of failureBuckets(input, network, keyId)) {
            const row = await query('get', 'SELECT * FROM auth_password_failures WHERE bucket=?', [bucket]);
            if (failed === null && row?.expires_ms > now() && row.next_ms > now()) reject('auth_password_rejected');
            if (failed === false) await query('run', 'DELETE FROM auth_password_failures WHERE bucket=?', [bucket]);
            if (failed === true) {
                const count = row?.expires_ms > now() ? row.count + 1 : 1;
                const delay = Math.min(600000, 250 * 2 ** Math.min(count - 1, 12));
                await query('run', `INSERT INTO auth_password_failures VALUES (?, ?, ?, ?)
                    ON CONFLICT(bucket) DO UPDATE SET count=excluded.count, next_ms=excluded.next_ms, expires_ms=excluded.expires_ms`,
                    [bucket, count, now() + delay, now() + 3600000]);
            }
        }
    }
    async function challenge(input, network) {
        const { keyId } = fields(input);
        await limit(input, network, keyId);
        // Identical response for unknown, SMS-only and password-enabled accounts.
        return { ok: true, challenge: await proof.challenge('password-login', reference(input), keyId, input.clientNonce) };
    }
    async function login(input, network) {
        const { keyId, jwk } = fields(input);
        await limit(input, network, keyId);
        await throttle(input, network, keyId);
        await transaction(() => proof.consumeProof(input, 'password-login', reference(input), jwk));
        const account = await findByPhone(input.phone);
        const stored = account ? await credential(account.user_id) : null;
        // One Argon2 operation also runs for absent credentials. No account flags escape.
        const dummyVerifier = await (dummy ||= hashPassword('server dummy credential ' + proof.keyedIndex('password-dummy'))
            .catch(error => { dummy = null; throw error; }));
        const legacy = /^\$2[aby]\$/.test(stored?.verifier || '');
        const [verified] = await Promise.all([verifyPassword(input.password, stored?.verifier || dummyVerifier),
            ...(legacy ? [verifyPassword(input.password, dummyVerifier)] : [])]);
        if (!stored || !verified.ok) {
            await transaction(() => throttle(input, network, keyId, true));
            await proof.audit('password_login_failed', null, keyId);
            reject('auth_password_rejected');
        }
        const upgraded = verified.legacy ? await hashPassword(input.password, { legacyUpgrade: true }) : null;
        return transaction(async () => {
            const current = await credential(account.user_id);
            if (current?.verifier !== stored.verifier || (await findByPhone(input.phone))?.user_id !== account.user_id) reject('auth_password_rejected');
            const device = await query('get', 'SELECT * FROM auth_device_keys WHERE key_id = ?', [keyId]);
            if (device && (device.revoked_ms !== null || device.principal_id !== account.user_id)) reject('auth_password_rejected');
            if (!device) {
                await query('run', 'INSERT INTO auth_device_keys VALUES (?, ?, ?, ?, ?, NULL)',
                    [keyId, account.user_id, JSON.stringify(jwk), now(), now() + 86400000]);
                await proof.audit('device_enrolled', account.user_id, keyId);
            }
            if (upgraded) {
                await query('run', `INSERT INTO auth_password_credentials VALUES (?, ?, ?)
                    ON CONFLICT(principal_id) DO UPDATE SET verifier=excluded.verifier, updated_ms=excluded.updated_ms`,
                    [account.user_id, upgraded, now()]);
                await proof.audit('password_algorithm_upgraded', account.user_id);
            }
            await proof.audit('password_login_succeeded', account.user_id, keyId);
            await throttle(input, network, keyId, false);
            return { ...await sessions.create(account, keyId), passwordAuthenticated: true };
        });
    }
    async function set(input) {
        const requestDigest = await authPasswordRequestDigest(input.password, input.currentPassword || '');
        const row = await sessions.read(input.sessionId);
        if (row.generation !== input.generation) reject('auth_session_stale');
        if (row.restricted_until_ms > now()) reject('auth_device_cooling_off');
        await transaction(() => proof.consumeProof(input, 'set-password', `${input.sessionId}:${input.generation}:${requestDigest}`, JSON.parse(row.public_key)));
        await proof.limit(`password-set:${row.key_id}`, 4, 60000);
        const current = await credential(row.principal_id);
        // Replacing a credential is distinct from SMS login and never a SMS-only reset.
        if (current && !(await verifyPassword(input.currentPassword, current.verifier)).ok) reject('auth_password_rejected');
        await screen(input.password);
        const encoded = await hashPassword(input.password);
        const revoked = await transaction(async () => {
            const active = await sessions.read(input.sessionId);
            if (active.generation !== input.generation || active.restricted_until_ms > now()
                || (await credential(row.principal_id))?.verifier !== current?.verifier || !await findById(row.principal_id)) reject();
            await query('run', `INSERT INTO auth_password_credentials VALUES (?, ?, ?)
                ON CONFLICT(principal_id) DO UPDATE SET verifier = excluded.verifier, updated_ms = excluded.updated_ms`,
            [row.principal_id, encoded, now()]);
            const other = await query('all', 'SELECT session_id FROM auth_device_sessions WHERE principal_id = ? AND session_id != ? AND revoked_ms IS NULL',
                [row.principal_id, input.sessionId]);
            for (const session of other) await query('run', 'UPDATE auth_device_sessions SET revoked_ms = ? WHERE session_id = ?', [now(), session.session_id]);
            await proof.audit('password_changed', row.principal_id, row.key_id);
            return other;
        });
        for (const session of revoked) await disconnectSession(session.session_id);
        return { ok: true };
    }
    return { challenge, login, set };
}
