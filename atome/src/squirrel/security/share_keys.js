// The account's sharing key (#shared/share_key_contract.js): made once on a device that holds the account's backup keys,
// kept in the account vault with its private half sealed by them (rule 21: nothing only on a device; the server never
// opens it), opened on any device of the account. `seal` locks bytes for several accounts' public keys, `open` unlocks a
// box sealed for this account, `digest` names a content without telling it (a list's version, keyed by this account).
import { SHARE_KEY_ATOME_TYPE, shareKeyId, validateSealedBox, validateShareKeyRecord, validateSharePublicJwk } from '../../shared/share_key_contract.js';

const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
const decode = text => Uint8Array.from(atob(String(text).replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const AES = { name: 'AES-GCM', length: 256 };
const SEAL_INFO = new TextEncoder().encode('atome.share.seal.v1');
const DIGEST_INFO = new TextEncoder().encode('atome.share.digest.v1');
const fail = code => Object.assign(new Error(code), { code });
const publicOf = ({ kty, crv, x, y }) => ({ kty, crv, x, y });

/**
 * `ring()`: the account's backup keys on this device (`{ current, keys }`, null without them); `read(id)` / `commit(events)`:
 * the account's store; `published(id)`: that record on the account's server (null when it has none), asked before a pair is
 * made; `actor()`: the account; `lookup(principal)`: another account's published public key (the `share-key` frame).
 */
export function createShareKeys({ ring, read, published, commit, actor, lookup, crypto = globalThis.crypto }) {
    const me = () => { const id = actor(); if (!id) throw fail('AUTH_REQUIRED'); return String(id); };
    const keys = async () => { const own = await ring(); if (!own?.keys?.[own.current]) throw fail('SHARE_KEY_LOCKED'); return own; };
    const aes = async (key, bytes, iv = crypto.getRandomValues(new Uint8Array(12))) => ({ iv: encode(iv),
        data: encode(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)) });
    const unaes = async (key, value) => {
        try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(value.iv) }, key, decode(value.data))); }
        catch (_) { throw fail('SHARE_KEY_INVALID'); }
    };
    // The secret two ECDH keys agree, through HKDF, as a key of `usage`.
    const agreed = async (privateKey, publicJwk, info, algorithm, usages) => {
        const peer = await crypto.subtle.importKey('jwk', publicJwk, ECDH, false, []);
        const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
        const base = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info }, base, algorithm, false, usages);
    };
    // This account's pair, made and published the first time; its private half opened with the backup keys. One opening at a
    // time: two first uses at once never make two pairs.
    let opening = null;
    const own = () => {
        const principal = me();
        if (opening?.principal !== principal) opening = { principal, pair: make(principal).catch((error) => { opening = null; throw error; }) };
        return opening.pair;
    };
    const make = async (principal) => {
        // A device signed in a moment ago may not hold the account's record yet: its server tells whether the account has
        // a key, so a new device never replaces it with one of its own (every box sealed for the account would stay shut).
        const ringNow = await keys(), record = await read(shareKeyId(principal)) || await published(shareKeyId(principal));
        if (record) {
            const props = validateShareKeyRecord(record.properties || {});
            const backup = ringNow.keys[props.private.key_id];
            if (!backup) throw fail('SHARE_KEY_LOCKED');
            const jwk = JSON.parse(new TextDecoder().decode(await unaes(backup, props.private)));
            return { publicJwk: props.public_jwk, privateKey: await crypto.subtle.importKey('jwk', jwk, ECDH, false, ['deriveBits']) };
        }
        const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
        const publicJwk = publicOf(await crypto.subtle.exportKey('jwk', pair.publicKey));
        const sealed = await aes(ringNow.keys[ringNow.current], new TextEncoder().encode(JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey))));
        const result = await commit([{ kind: 'set', atome_id: shareKeyId(principal), type: SHARE_KEY_ATOME_TYPE, actor: principal, scope: 'global',
            props: { public_jwk: publicJwk, private: { key_id: ringNow.current, ...sealed }, created_at: new Date().toISOString(), access: 'private', visibility: 'private' } }]);
        if (result?.ok === false) throw fail('SHARE_KEY_UNAVAILABLE');
        return { publicJwk, privateKey: await crypto.subtle.importKey('jwk', await crypto.subtle.exportKey('jwk', pair.privateKey), ECDH, false, ['deriveBits']) };
    };
    const publicKeyOf = async principal => (String(principal) === me() ? (await own()).publicJwk : validateSharePublicJwk(await lookup(String(principal))));
    return {
        /** This account's key made (published) if it was not: `{ public_jwk }`. */
        ensure: async () => ({ public_jwk: (await own()).publicJwk }),
        publicKeyOf,
        /** `bytes` sealed for each account of `principals` (their published keys). */
        async seal(bytes, principals) {
            const content = await crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']);
            const raw = await crypto.subtle.exportKey('raw', content), sealedKeys = {};
            for (const principal of [...new Set(principals.map(String))]) {
                const ephemeral = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
                const wrap = await agreed(ephemeral.privateKey, await publicKeyOf(principal), SEAL_INFO, AES, ['encrypt']);
                sealedKeys[principal] = { epk: publicOf(await crypto.subtle.exportKey('jwk', ephemeral.publicKey)), ...await aes(wrap, raw) };
            }
            return validateSealedBox({ v: 1, ...await aes(content, bytes), keys: sealedKeys });
        },
        /** A box sealed for this account, opened. */
        async open(value) {
            const sealed = validateSealedBox(value), mine = sealed.keys[me()];
            if (!mine) throw fail('SHARE_KEY_LOCKED');
            const unwrap = await agreed((await own()).privateKey, mine.epk, SEAL_INFO, AES, ['decrypt']);
            const content = await crypto.subtle.importKey('raw', await unaes(unwrap, mine), AES, false, ['decrypt']);
            return unaes(content, sealed);
        },
        /** A name for `bytes` only this account can make: the same content, the same name, never its words. */
        async digest(bytes) {
            const { privateKey, publicJwk } = await own();
            const key = await agreed(privateKey, publicJwk, DIGEST_INFO, { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']);
            return encode(await crypto.subtle.sign('HMAC', key, bytes));
        }
    };
}
