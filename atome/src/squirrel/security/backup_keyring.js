// The account's backup keys: the AES-GCM keys its devices encrypt their copies with before anything is sent
// to the account vault (the raw motion recordings first, #squirrel/health/sensor_backup.js). The server never
// holds one in the clear: a device keeps its ring in the auth device store, the recovery code (version 2)
// wraps it for the server (#shared/auth_recovery_code.js recoveryWrapKey), and pairing hands it to the new
// device under a key agreed with it alone (ECDH P-256). One key is current; earlier ones stay to open older copies.
const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const decode = (text) => Uint8Array.from(atob(String(text).replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
const AES = { name: 'AES-GCM', length: 256 };
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const PAIR_INFO = 'atome.pair.backup.v1';

export function createBackupKeyring({ devices, crypto = globalThis.crypto }) {
    const slot = (userId) => `backup-keys:${userId}`;
    const keyIdOf = () => encode(crypto.getRandomValues(new Uint8Array(9)));
    const toBytes = async (ring) => {
        const keys = {};
        for (const [id, key] of Object.entries(ring.keys)) keys[id] = encode(await crypto.subtle.exportKey('raw', key));
        return new TextEncoder().encode(JSON.stringify({ version: 1, current: ring.current, keys }));
    };
    const fromBytes = async (bytes) => {
        const value = JSON.parse(new TextDecoder().decode(bytes));
        if (value?.version !== 1 || typeof value.keys?.[value.current] !== 'string') throw new Error('auth_backup_keys_invalid');
        const keys = {};
        for (const [id, raw] of Object.entries(value.keys)) keys[id] = await crypto.subtle.importKey('raw', decode(raw), AES, true, ['encrypt', 'decrypt']);
        return { current: value.current, keys };
    };
    const seal = async (key, bytes) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        return { iv: encode(iv), data: encode(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)) };
    };
    const open = async (key, box) => {
        try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(box.iv) }, key, decode(box.data))); }
        catch (_) { throw new Error('auth_backup_keys_invalid'); }
    };
    // The ring agreed between two ECDH keys, through HKDF.
    const agreed = async (privateKey, publicJwk) => {
        const peer = await crypto.subtle.importKey('jwk', publicJwk, ECDH, false, []);
        const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
        const base = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(PAIR_INFO) },
            base, AES, false, ['encrypt', 'decrypt']);
    };
    const read = (userId) => devices.read(slot(userId));
    // A ring received (recovery, pairing) joins this device's: every key is kept, the received current one wins.
    async function merge(userId, incoming) {
        const own = await read(userId);
        const ring = { current: incoming.current, keys: { ...own?.keys, ...incoming.keys } };
        await devices.put(slot(userId), ring);
        return ring;
    }
    return {
        read,
        // The ring of this account on this device, made the first time it is needed.
        async ensure(userId) {
            const own = await read(userId);
            if (own) return own;
            const id = keyIdOf();
            const ring = { current: id, keys: { [id]: await crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']) } };
            await devices.put(slot(userId), ring);
            return ring;
        },
        // Wrapped by the recovery code's key, as the server keeps it.
        wrap: async (ring, wrapKey) => JSON.stringify({ version: 1, ...await seal(wrapKey, await toBytes(ring)) }),
        unwrap: async (userId, wrapped, wrapKey) => merge(userId, await fromBytes(await open(wrapKey, JSON.parse(wrapped)))),
        // The new device's half of the agreement: its private key never leaves it.
        pairKey: () => crypto.subtle.generateKey(ECDH, false, ['deriveBits']),
        publicJwk: async (pair) => {
            const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', pair.publicKey);
            return { kty, crv, x, y };
        },
        // The approving device seals its ring for the new device's public key.
        async sealFor(ring, publicJwk) {
            const own = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
            const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', own.publicKey);
            return JSON.stringify({ version: 1, epk: { kty, crv, x, y }, ...await seal(await agreed(own.privateKey, publicJwk), await toBytes(ring)) });
        },
        async receive(userId, sealed, pairPrivateKey) {
            const box = JSON.parse(sealed);
            if (box?.version !== 1 || !box.epk) throw new Error('auth_backup_keys_invalid');
            return merge(userId, await fromBytes(await open(await agreed(pairPrivateKey, box.epk), box)));
        }
    };
}

// What approvals bind a carried ring to: its SHA-256, or '-' when none is carried.
export const backupDigest = async (text, crypto = globalThis.crypto) => (!text ? '-'
    : Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (value) => value.toString(16).padStart(2, '0')).join(''));
