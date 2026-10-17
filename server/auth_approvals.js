import crypto from 'node:crypto';
import { digest, publicDeviceKey, reject } from './auth_link_security.js';
import { requireAssurance } from './auth_devices.js';
import { verifyWebAuthnAssertion, verifyWebAuthnRegistration } from './auth_webauthn.js';

// Approve keys: registration (WebAuthn credential or native user-verified key)
// and approval proofs over the shared purpose-bound challenges.
export function createApprovals({ query, proof, webauthn, now }) {
    // A new approve key proves possession over a challenge issued to the session
    // key of the same device: the two keys are bound together.
    async function register(input, purpose, reference, sessionKeyId) {
        if (input?.kind === 'webauthn') {
            const credential = await proof.consumeChallenge(input.challengeId, purpose, reference, sessionKeyId,
                (message) => verifyWebAuthnRegistration(input, message, webauthn));
            const exists = await query('get', 'SELECT key_id FROM auth_device_keys WHERE credential_id = ?', [credential.credentialId]);
            if (exists) reject('auth_request_invalid');
            return { keyId: digest(JSON.stringify(credential.jwk)), jwk: credential.jwk, credentialId: credential.credentialId,
                signCount: credential.signCount, assurance: 'hardware_uv' };
        }
        if (input?.kind === 'native') {
            // Native keys carry no attestation in V1: the platform declares its assurance.
            const { keyId, jwk } = publicDeviceKey(input.publicKey);
            const assurance = requireAssurance(input.assurance);
            await proof.consumeChallenge(input.challengeId, purpose, reference, sessionKeyId, (message) => {
                const signature = Buffer.from(String(input.signature || ''), 'base64url');
                if (!crypto.verify('sha256', message, { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }),
                    dsaEncoding: signature.length === 64 ? 'ieee-p1363' : 'der' }, signature)) reject();
            });
            return { keyId, jwk, credentialId: null, signCount: 0, assurance };
        }
        return reject('auth_request_invalid');
    }
    const challenge = (approveKey, purpose, reference) => proof.challenge(purpose, reference, approveKey.key_id);
    async function consume(input, purpose, reference, approveKey) {
        if (approveKey.credential_id) {
            const { signCount } = await proof.consumeChallenge(input?.challengeId, purpose, reference, approveKey.key_id,
                (message) => verifyWebAuthnAssertion(input, message, approveKey, webauthn));
            await query('run', 'UPDATE auth_device_keys SET sign_count = ?, last_seen_ms = ? WHERE key_id = ?',
                [signCount, now(), approveKey.key_id]);
            return;
        }
        await proof.consumeProof(input || {}, purpose, reference, JSON.parse(approveKey.public_key));
        await query('run', 'UPDATE auth_device_keys SET last_seen_ms = ? WHERE key_id = ?', [now(), approveKey.key_id]);
    }
    return { register, challenge, consume };
}
