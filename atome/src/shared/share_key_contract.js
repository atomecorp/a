// An account's sharing key (register R-115, Q3 « chiffrement de bout en bout », lot D25 B): an ECDH P-256 pair made on the
// person's device. Its public half is published through the account (`share_key` record of their vault, read by others
// through the `share-key` /ws/api frame); its private half reaches the vault only sealed by the account's backup keys
// (#squirrel/security/backup_keyring.js), so every device of the account opens it and the server never can. A health list
// sent to someone is sealed on the sender's device for each recipient's public key (#squirrel/security/share_keys.js): the
// server only carries ciphertext.

export const SHARE_KEY_ATOME_TYPE = 'share_key';
export const SHARE_KEY_FRAME = 'share-key';
export const SHARE_KEY_ERRORS = Object.freeze(['SHARE_KEY_UNAVAILABLE', 'SHARE_KEY_LOCKED', 'SHARE_KEY_INVALID']);
/** The record's Atome type (registered in core_atome_types.js): the public half, the private half sealed, never public. */
export const SHARE_KEY_TYPE = Object.freeze({ type: SHARE_KEY_ATOME_TYPE, kind: 'data_model', traits: ['data'], schema: {
    public_jwk: { type: 'object' }, private: { type: 'object' }, created_at: { type: 'string', maxLength: 40 },
    access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] } } });
/** The account's own record (one per account, the same id on every device). */
export const shareKeyId = principal => `share_key:${encodeURIComponent(String(principal))}`;

const B64URL = /^[A-Za-z0-9_-]+$/u;
const fail = code => Object.assign(new Error(code), { code });
/** A public key as it is published: `{ kty: 'EC', crv: 'P-256', x, y }` and nothing else. */
export const validateSharePublicJwk = (jwk) => {
    const valid = jwk && typeof jwk === 'object' && Object.keys(jwk).length === 4 && jwk.kty === 'EC' && jwk.crv === 'P-256'
        && [jwk.x, jwk.y].every(part => typeof part === 'string' && part.length === 43 && B64URL.test(part));
    if (!valid) throw fail('SHARE_KEY_INVALID');
    return jwk;
};
const box = value => value && typeof value === 'object' && typeof value.iv === 'string' && typeof value.data === 'string';
/** The record's properties: the public half, the private half sealed by backup key `key_id`. */
export const validateShareKeyRecord = (props) => {
    const valid = props && validateSharePublicJwk(props.public_jwk) && box(props.private) && typeof props.private.key_id === 'string' && props.private.key_id;
    if (!valid) throw fail('SHARE_KEY_INVALID');
    return props;
};
/**
 * A sealed content (`v: 1`): the bytes under a fresh AES-GCM key, that key sealed for each recipient (`keys[principal]`:
 * an ephemeral ECDH public key `epk` and the key under the secret it agrees with theirs, HKDF-SHA-256).
 */
export const validateSealedBox = (value) => {
    const valid = value?.v === 1 && box(value) && value.keys && typeof value.keys === 'object' && Object.keys(value.keys).length > 0
        && Object.values(value.keys).every(entry => box(entry) && validateSharePublicJwk(entry.epk));
    if (!valid) throw fail('SHARE_KEY_INVALID');
    return value;
};
