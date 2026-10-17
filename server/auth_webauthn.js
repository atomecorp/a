import crypto from 'node:crypto';
import { reject } from './auth_link_security.js';

// Internal WebAuthn verifier (no external dependency): ES256 credentials,
// `none` and self `packed` attestation, user verification always required.
// The WebAuthn challenge is SHA-256 of the existing signing message, so every
// approval reuses the purpose-bound, single-use challenge table.
const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest();
const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const bytesOf = (value) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 16384) reject('auth_webauthn_invalid');
    return Buffer.from(value, 'base64url');
};

// Minimal CBOR (RFC 8949) decoder for attestation objects and COSE keys.
function decodeCbor(buffer, offset = 0, depth = 0) {
    if (depth > 8 || offset >= buffer.length) reject('auth_webauthn_invalid');
    const initial = buffer[offset];
    const major = initial >> 5;
    let info = initial & 0x1f;
    let position = offset + 1;
    let length;
    if (info < 24) length = info;
    else if (info === 24) { length = buffer.readUInt8(position); position += 1; }
    else if (info === 25) { length = buffer.readUInt16BE(position); position += 2; }
    else if (info === 26) { length = buffer.readUInt32BE(position); position += 4; }
    else reject('auth_webauthn_invalid');
    if (major === 0) return { value: length, end: position };
    if (major === 1) return { value: -1 - length, end: position };
    if (major === 2 || major === 3) {
        if (position + length > buffer.length) reject('auth_webauthn_invalid');
        const slice = buffer.subarray(position, position + length);
        return { value: major === 2 ? Buffer.from(slice) : slice.toString('utf8'), end: position + length };
    }
    if (major === 4) {
        const items = [];
        for (let index = 0; index < length; index += 1) {
            const item = decodeCbor(buffer, position, depth + 1);
            items.push(item.value); position = item.end;
        }
        return { value: items, end: position };
    }
    if (major === 5) {
        const map = new Map();
        for (let index = 0; index < length; index += 1) {
            const key = decodeCbor(buffer, position, depth + 1);
            const value = decodeCbor(buffer, key.end, depth + 1);
            map.set(key.value, value.value); position = value.end;
        }
        return { value: map, end: position };
    }
    if (major === 7 && info >= 20 && info <= 22) return { value: [false, true, null][info - 20], end: position };
    return reject('auth_webauthn_invalid');
}

// ES256 (P-256) and RS256 (RSASSA-PKCS1-v1_5, used by Windows Hello).
function coseToJwk(cose) {
    if (!(cose instanceof Map)) reject('auth_webauthn_invalid');
    if (cose.get(1) === 2 && cose.get(3) === -7 && cose.get(-1) === 1) {
        const x = cose.get(-2), y = cose.get(-3);
        if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) reject('auth_webauthn_invalid');
        const jwk = { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y) };
        crypto.createPublicKey({ key: jwk, format: 'jwk' });
        return jwk;
    }
    if (cose.get(1) === 3 && cose.get(3) === -257) {
        const n = cose.get(-1), e = cose.get(-2);
        if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 256 || e.length > 8) reject('auth_webauthn_invalid');
        const jwk = { kty: 'RSA', n: b64u(n), e: b64u(e) };
        crypto.createPublicKey({ key: jwk, format: 'jwk' });
        return jwk;
    }
    return reject('auth_webauthn_algorithm_unsupported');
}

function parseAuthenticatorData(data, { requireCredential }) {
    if (data.length < 37) reject('auth_webauthn_invalid');
    const flags = data[32];
    const parsed = { rpIdHash: data.subarray(0, 32), flags, signCount: data.readUInt32BE(33) };
    if (requireCredential) {
        if (!(flags & FLAG_AT) || data.length < 55) reject('auth_webauthn_invalid');
        const idLength = data.readUInt16BE(53);
        const credentialId = data.subarray(55, 55 + idLength);
        if (credentialId.length !== idLength || idLength < 16 || idLength > 1023) reject('auth_webauthn_invalid');
        parsed.credentialId = b64u(credentialId);
        parsed.jwk = coseToJwk(decodeCbor(data, 55 + idLength).value);
    }
    return parsed;
}

// The relying party: a fixed RP ID and an allow-list of origins from server
// configuration. Development may name `http://localhost:*` (browsers refuse an
// IP address as RP ID).
export function resolveWebAuthnConfig(env = process.env) {
    const production = env.NODE_ENV === 'production';
    const rpId = String(env.SQUIRREL_WEBAUTHN_RP_ID || (production ? 'atome.one' : 'localhost')).trim();
    const origins = String(env.SQUIRREL_WEBAUTHN_ORIGINS || (production ? 'https://atome.one' : 'http://localhost:*'))
        .split(',').map((value) => value.trim()).filter(Boolean);
    if (production && origins.some((origin) => origin.endsWith(':*'))) throw new Error('auth_webauthn_origin_pattern_forbidden_in_production');
    return { rpId, origins };
}

const originAllowed = (origin, origins) => origins.some((allowed) => allowed.endsWith(':*')
    ? new RegExp(`^${allowed.slice(0, -2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\d{1,5}$`).test(origin)
    : origin === allowed);

function checkClientData(clientDataJSON, type, message, config) {
    let clientData;
    try { clientData = JSON.parse(clientDataJSON.toString('utf8')); } catch { reject('auth_webauthn_invalid'); }
    if (clientData?.type !== type || clientData.challenge !== b64u(sha256(message))
        || typeof clientData.origin !== 'string' || !originAllowed(clientData.origin, config.origins)) reject('auth_webauthn_rejected');
    return clientData;
}

function checkAuthenticatorFlags(parsed, config) {
    if (!parsed.rpIdHash.equals(sha256(Buffer.from(config.rpId)))) reject('auth_webauthn_rejected');
    if (!(parsed.flags & FLAG_UP) || !(parsed.flags & FLAG_UV)) reject('auth_user_verification_required');
}

export function verifyWebAuthnRegistration({ attestationObject, clientDataJSON }, message, config) {
    const clientData = bytesOf(clientDataJSON);
    checkClientData(clientData, 'webauthn.create', message, config);
    const attestation = decodeCbor(bytesOf(attestationObject)).value;
    if (!(attestation instanceof Map) || !Buffer.isBuffer(attestation.get('authData'))) reject('auth_webauthn_invalid');
    const authData = attestation.get('authData');
    const parsed = parseAuthenticatorData(authData, { requireCredential: true });
    checkAuthenticatorFlags(parsed, config);
    const format = attestation.get('fmt');
    const statement = attestation.get('attStmt');
    if (format === 'packed') {
        // Self attestation only: no trust chain is evaluated in V1.
        if (!(statement instanceof Map) || statement.has('x5c') || statement.get('alg') !== (parsed.jwk.kty === 'RSA' ? -257 : -7)
            || !Buffer.isBuffer(statement.get('sig'))) reject('auth_webauthn_attestation_unsupported');
        const signed = Buffer.concat([authData, sha256(clientData)]);
        if (!crypto.verify('sha256', signed, crypto.createPublicKey({ key: parsed.jwk, format: 'jwk' }), statement.get('sig'))) {
            reject('auth_webauthn_rejected');
        }
    } else if (format !== 'none') reject('auth_webauthn_attestation_unsupported');
    return { credentialId: parsed.credentialId, jwk: parsed.jwk, signCount: parsed.signCount };
}

export function verifyWebAuthnAssertion({ credentialId, authenticatorData, clientDataJSON, signature }, message, key, config) {
    if (credentialId !== key.credential_id) reject('auth_webauthn_rejected');
    const clientData = bytesOf(clientDataJSON);
    checkClientData(clientData, 'webauthn.get', message, config);
    const authData = bytesOf(authenticatorData);
    const parsed = parseAuthenticatorData(authData, { requireCredential: false });
    checkAuthenticatorFlags(parsed, config);
    // A counter that does not move forward betrays a cloned authenticator.
    const previous = Number(key.sign_count || 0);
    if ((parsed.signCount !== 0 || previous !== 0) && parsed.signCount <= previous) reject('auth_webauthn_counter_regressed');
    const signed = Buffer.concat([authData, sha256(clientData)]);
    if (!crypto.verify('sha256', signed, crypto.createPublicKey({ key: JSON.parse(key.public_key), format: 'jwk' }), bytesOf(signature))) {
        reject('auth_webauthn_rejected');
    }
    return { signCount: parsed.signCount };
}
