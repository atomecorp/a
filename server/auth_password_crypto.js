import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const MEMORY = 19456, PASSES = 2, PARALLELISM = 1;
let active = 0;
const requirePassword = password => {
    if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 4096 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(password)) {
        throw new Error('auth_password_invalid');
    }
};
async function derive(password, salt, memory = MEMORY, passes = PASSES, parallelism = PARALLELISM) {
    if (typeof crypto.argon2 !== 'function') throw new Error('auth_argon2_unavailable');
    if (active >= 2) throw new Error('auth_rate_limited');
    active++;
    try { return await promisify(crypto.argon2)('argon2id', { message: Buffer.from(password, 'utf8'), nonce: salt,
        memory, passes, parallelism, tagLength: 32 }); }
    finally { active--; }
}
const encode = bytes => bytes.toString('base64').replace(/=+$/, '');
export async function hashPassword(password, { legacyUpgrade = false } = {}) {
    requirePassword(password);
    if (!legacyUpgrade && [...password].length < 15) throw new Error('auth_password_too_short');
    const salt = crypto.randomBytes(16);
    const tag = await derive(password, salt);
    return `$argon2id$v=19$m=${MEMORY},t=${PASSES},p=${PARALLELISM}$${encode(salt)}$${encode(tag)}`;
}
export async function verifyPassword(password, encoded) {
    requirePassword(password);
    const legacy = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(encoded));
    if (legacy) {
        // bcrypt cannot prove any suffix beyond 72 bytes. Do not authenticate
        // a truncated input or silently choose its replacement credential.
        if (Buffer.byteLength(password, 'utf8') > 72) return { ok: false, legacy: true };
        return { ok: await bcrypt.compare(password, encoded), legacy: true };
    }
    const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/.exec(String(encoded));
    if (!match) return { ok: false };
    const [, m, t, p, salt, tag] = match;
    if (+m < MEMORY || +m > 65536 || +t < PASSES || +t > 6 || +p < 1 || +p > 4) return { ok: false };
    const actual = await derive(password, Buffer.from(salt, 'base64'), +m, +t, +p);
    return { ok: crypto.timingSafeEqual(actual, Buffer.from(tag, 'base64')), legacy: false };
}
/** Operator-maintained SHA-256 blocklist. No password leaves this server. */
export async function screenPassword(password, path = process.env.AUTH_PASSWORD_BLOCKLIST_PATH) {
    requirePassword(password);
    if ([...password].length < 15) throw new Error('auth_password_too_short');
    if (!path) throw new Error('auth_password_screening_unavailable');
    let contents;
    try { contents = await readFile(path, 'utf8'); } catch { throw new Error('auth_password_screening_unavailable'); }
    const hashes = contents.split(/\r?\n/).filter(Boolean);
    if (!hashes.length || hashes.some(hash => !/^[a-f0-9]{64}$/.test(hash))) throw new Error('auth_password_screening_unavailable');
    const candidate = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
    if (hashes.includes(candidate)) throw new Error('auth_password_compromised');
}
