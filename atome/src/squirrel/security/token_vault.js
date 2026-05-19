const DEFAULT_PREFIX = 'squirrel.token_vault.';
const KEY_DERIVATION_ITERATIONS = 120000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const normalizeText = (value) => String(value || '').trim();

const cloneValue = (value) => {
    if (value === undefined) return undefined;
    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(value);
        }
    } catch (_) {
        // Fall through to JSON clone below.
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return null;
    }
};

const createMemoryStorage = () => {
    const map = new Map();
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(String(key), String(value));
        },
        removeItem(key) {
            map.delete(String(key));
        },
        key(index) {
            return Array.from(map.keys())[Number(index)] || null;
        },
        get length() {
            return map.size;
        }
    };
};

const resolveStorage = (storage = null) => {
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
        return storage;
    }
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
        return localStorage;
    }
    return createMemoryStorage();
};

const toBase64 = (bytes) => {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    bytes.forEach((value) => {
        binary += String.fromCharCode(value);
    });
    return btoa(binary);
};

const fromBase64 = (value = '') => {
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(String(value || ''), 'base64'));
    }
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, (entry) => entry.charCodeAt(0));
};

const getCryptoApi = async () => {
    if (globalThis?.crypto?.subtle && typeof globalThis.crypto.getRandomValues === 'function') {
        return globalThis.crypto;
    }
    if (typeof process !== 'undefined' && process.versions?.node) {
        const mod = await import('node:crypto');
        if (mod.webcrypto?.subtle && typeof mod.webcrypto.getRandomValues === 'function') {
            return mod.webcrypto;
        }
    }
    throw new Error('token_vault_crypto_unavailable');
};

const deriveKey = async (cryptoApi, secret, saltBytes) => {
    const secretBytes = textEncoder.encode(normalizeText(secret));
    const keyMaterial = await cryptoApi.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return cryptoApi.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: KEY_DERIVATION_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        ['encrypt', 'decrypt']
    );
};

const encryptValue = async (secret, value) => {
    const cryptoApi = await getCryptoApi();
    const salt = cryptoApi.getRandomValues(new Uint8Array(16));
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(cryptoApi, secret, salt);
    const encoded = textEncoder.encode(JSON.stringify(value));
    const cipher = await cryptoApi.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );
    return {
        version: 1,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2-SHA-256',
        salt: toBase64(salt),
        iv: toBase64(iv),
        cipher_text: toBase64(new Uint8Array(cipher))
    };
};

const decryptValue = async (secret, payload = {}) => {
    const cryptoApi = await getCryptoApi();
    const salt = fromBase64(payload.salt || '');
    const iv = fromBase64(payload.iv || '');
    const cipherText = fromBase64(payload.cipher_text || payload.cipherText || '');
    const key = await deriveKey(cryptoApi, secret, salt);
    const plainBuffer = await cryptoApi.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipherText
    );
    return JSON.parse(textDecoder.decode(new Uint8Array(plainBuffer)));
};

export const createEncryptedTokenVault = ({
    storage = null,
    prefix = DEFAULT_PREFIX,
    now = () => new Date().toISOString(),
    secret = null
} = {}) => {
    const resolvedStorage = resolveStorage(storage);
    let currentSecret = normalizeText(secret) || null;

    const storageKeyFor = (entryId) => `${prefix}${normalizeText(entryId)}`;

    const ensureSecret = () => {
        if (!currentSecret) {
            throw new Error('token_vault_secret_missing');
        }
        return currentSecret;
    };

    const readRawRecord = (entryId) => {
        const key = storageKeyFor(entryId);
        const raw = resolvedStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    };

    return {
        setSecret(nextSecret) {
            currentSecret = normalizeText(nextSecret) || null;
            return {
                ok: !!currentSecret,
                configured: !!currentSecret
            };
        },
        hasSecret() {
            return currentSecret != null;
        },
        async store(entryId, value, metadata = {}) {
            const normalizedId = normalizeText(entryId);
            if (!normalizedId) {
                throw new Error('token_vault_entry_id_required');
            }
            const sealed = await encryptValue(ensureSecret(), cloneValue(value));
            const record = {
                entry_id: normalizedId,
                created_at: now(),
                updated_at: now(),
                metadata: cloneValue(metadata) || {},
                sealed
            };
            resolvedStorage.setItem(storageKeyFor(normalizedId), JSON.stringify(record));
            return {
                ok: true,
                entry_id: normalizedId,
                metadata: cloneValue(record.metadata)
            };
        },
        async read(entryId) {
            const normalizedId = normalizeText(entryId);
            if (!normalizedId) {
                throw new Error('token_vault_entry_id_required');
            }
            const record = readRawRecord(normalizedId);
            if (!record) {
                return {
                    ok: false,
                    error: 'token_vault_entry_not_found',
                    entry_id: normalizedId
                };
            }
            const value = await decryptValue(ensureSecret(), record.sealed || {});
            return {
                ok: true,
                entry_id: normalizedId,
                metadata: cloneValue(record.metadata) || {},
                value
            };
        },
        remove(entryId) {
            const normalizedId = normalizeText(entryId);
            if (!normalizedId) {
                throw new Error('token_vault_entry_id_required');
            }
            resolvedStorage.removeItem(storageKeyFor(normalizedId));
            return {
                ok: true,
                entry_id: normalizedId
            };
        },
        list() {
            const items = [];
            for (let index = 0; index < Number(resolvedStorage.length || 0); index += 1) {
                const key = resolvedStorage.key(index);
                if (!String(key || '').startsWith(prefix)) continue;
                const entryId = String(key).slice(prefix.length);
                const record = readRawRecord(entryId);
                if (!record) continue;
                items.push({
                    entry_id: entryId,
                    metadata: cloneValue(record.metadata) || {},
                    created_at: record.created_at || null,
                    updated_at: record.updated_at || null
                });
            }
            return {
                ok: true,
                items
            };
        }
    };
};
