import { authSigningMessage } from '../../shared/auth_link_contract.js';

// Browser approve key: a WebAuthn credential that requires user verification
// (Touch ID, Windows Hello, device PIN, security key PIN). The challenge is the
// SHA-256 of the shared signing message, so the server's purpose-bound
// challenges serve WebAuthn unchanged.
const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const decode = (value) => Uint8Array.from(atob(String(value).replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));

export function createWebAuthnApprover({ env = globalThis, crypto = globalThis.crypto } = {}) {
    const credentials = env.navigator?.credentials;
    const rpId = String(env.location?.hostname || '');
    const digest = async (challenge) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authSigningMessage(challenge))));
    // An IP address cannot be a relying party; such an origin has no approve key.
    const available = async () => {
        if (!credentials?.create || !env.PublicKeyCredential || !rpId || /^[\d.]+$|:/.test(rpId)) return false;
        return env.isSecureContext !== false;
    };
    async function register(challenge, { displayName = 'eVe' } = {}) {
        if (!await available()) throw new Error('auth_approve_key_unavailable');
        const credential = await credentials.create({ publicKey: {
            challenge: await digest(challenge), rp: { id: rpId, name: 'eVe' },
            user: { id: crypto.getRandomValues(new Uint8Array(16)), name: displayName, displayName },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: { userVerification: 'required', residentKey: 'discouraged' },
            attestation: 'none', timeout: 120000
        } });
        if (!credential?.response?.attestationObject) throw new Error('auth_approve_key_unavailable');
        const spki = credential.response.getPublicKey?.();
        if (!spki) throw new Error('auth_approve_key_unavailable');
        // The public key stays on the device for local verification (switching accounts offline).
        return { approve: { kind: 'webauthn', challengeId: challenge.challenge,
            attestationObject: encode(credential.response.attestationObject), clientDataJSON: encode(credential.response.clientDataJSON) },
        record: { kind: 'webauthn', credentialId: encode(credential.rawId), spki: encode(spki),
            alg: credential.response.getPublicKeyAlgorithm?.() === -257 ? 'RS256' : 'ES256' } };
    }
    // WebAuthn signs in DER; WebCrypto verifies P-256 as r || s.
    const rawSignature = (der) => {
        const bytes = new Uint8Array(der);
        if (bytes[0] !== 0x30) throw new Error('auth_user_verification_required');
        let offset = 2;
        const part = () => {
            if (bytes[offset] !== 0x02) throw new Error('auth_user_verification_required');
            const length = bytes[offset + 1];
            let value = bytes.slice(offset + 2, offset + 2 + length);
            offset += 2 + length;
            while (value.length > 32 && value[0] === 0) value = value.slice(1);
            const padded = new Uint8Array(32); padded.set(value, 32 - value.length); return padded;
        };
        const r = part(), s = part(), out = new Uint8Array(64); out.set(r); out.set(s, 32); return out;
    };
    // A local challenge, verified here against the stored public key: the person
    // proves themselves to this device without any server (§6.5).
    async function verifyLocal(record) {
        if (record?.kind !== 'webauthn' || !record.spki) throw new Error('auth_approve_key_required');
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const assertion = await credentials.get({ publicKey: { challenge, rpId, userVerification: 'required', timeout: 120000,
            allowCredentials: [{ type: 'public-key', id: decode(record.credentialId) }] } });
        const data = new Uint8Array(assertion?.response?.authenticatorData || []);
        const clientData = JSON.parse(new TextDecoder().decode(assertion.response.clientDataJSON));
        if (clientData.type !== 'webauthn.get' || clientData.challenge !== encode(challenge) || clientData.origin !== env.location.origin
            || data.length < 37 || !(data[32] & 0x04)) throw new Error('auth_user_verification_required');
        const rsa = record.alg === 'RS256';
        const algorithm = rsa ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
        const key = await crypto.subtle.importKey('spki', decode(record.spki), algorithm, false, ['verify']);
        const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', assertion.response.clientDataJSON));
        const signed = new Uint8Array(data.length + 32); signed.set(data); signed.set(clientHash, data.length);
        const signature = rsa ? assertion.response.signature : rawSignature(assertion.response.signature);
        if (!await crypto.subtle.verify(algorithm, key, signature, signed)) {
            throw new Error('auth_user_verification_required');
        }
        return { ok: true };
    }
    async function approve(challenge, record) {
        if (record?.kind !== 'webauthn' || !credentials?.get) throw new Error('auth_approve_key_required');
        const assertion = await credentials.get({ publicKey: {
            challenge: await digest(challenge), rpId, userVerification: 'required', timeout: 120000,
            allowCredentials: [{ type: 'public-key', id: decode(record.credentialId) }]
        } });
        if (!assertion?.response?.authenticatorData) throw new Error('auth_user_verification_required');
        return { challengeId: challenge.challenge, credentialId: encode(assertion.rawId),
            authenticatorData: encode(assertion.response.authenticatorData), clientDataJSON: encode(assertion.response.clientDataJSON),
            signature: encode(assertion.response.signature) };
    }
    return { available, register, approve, verifyLocal };
}
