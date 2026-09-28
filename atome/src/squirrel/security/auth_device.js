import { authSigningMessage } from '../../shared/auth_link_contract.js';

const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const hex = (bytes) => Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
const utf8 = (value) => new TextEncoder().encode(value);

// IndexedDB can persist non-exportable CryptoKeys without exporting private bytes.
// Native consumers inject the platform key capability; they never use browser keys.
export function createAuthDeviceStore({ indexedDB = globalThis.indexedDB, crypto = globalThis.crypto,
    nativeKey = null, databaseName = 'atome_auth_device_v1' } = {}) {
    let opening = null;
    const open = () => {
        if (!indexedDB || !crypto?.subtle) throw new Error('auth_protected_storage_unavailable');
        if (!opening) opening = new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('records');
            request.onerror = () => reject(new Error('auth_protected_storage_unavailable'));
            request.onsuccess = () => resolve(request.result);
        });
        return opening;
    };
    async function storage(mode, work) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction('records', mode);
            const request = work(transaction.objectStore('records'));
            transaction.oncomplete = () => resolve(request?.result);
            transaction.onerror = transaction.onabort = () => reject(new Error('auth_storage_write_failed'));
        });
    }
    const read = (key) => storage('readonly', (store) => store.get(key));
    const put = (key, value) => storage('readwrite', (store) => store.put(value, key));
    const remove = (key) => storage('readwrite', (store) => store.delete(key));
    // Atomic add chooses the existing record when two tabs initialize concurrently.
    async function insertOnce(key, candidate) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction('records', 'readwrite');
            const store = transaction.objectStore('records');
            let selected;
            const request = store.get(key);
            request.onsuccess = () => {
                selected = request.result || candidate;
                if (!request.result) store.put(candidate, key);
            };
            transaction.oncomplete = () => resolve(selected);
            transaction.onerror = transaction.onabort = () => reject(new Error('auth_storage_write_failed'));
        });
    }
    async function phoneScope(phone) {
        // Native runtimes keep the signing key in the platform keystore. Avoid
        // persisting a WebCrypto CryptoKey merely to obscure the phone lookup:
        // on WKWebView this can block indefinitely while Security.framework
        // tries to decrypt WebKit's master key. The domain-separated digest is
        // deterministic and only identifies the local IndexedDB record.
        if (nativeKey) return hex(await crypto.subtle.digest(
            'SHA-256', utf8(`atome.phone-scope.v1\0${phone}`)));
        let key = await read('lookup-key');
        if (!key) key = await insertOnce('lookup-key', await crypto.subtle.generateKey(
            { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']));
        return hex(await crypto.subtle.sign('HMAC', key, utf8(phone)));
    }
    async function forScope(scope) {
        let record = null;
        try { record = await read(`key:${scope}`); } catch (_) { /* native keystore can operate without Web storage */ }
        if (!record) {
            if (nativeKey) {
                const publicKey = await nativeKey({ action: 'public', scope });
                const candidate = { publicKey, native: true, scope };
                try { record = await insertOnce(`key:${scope}`, candidate); } catch (_) { record = candidate; }
            } else {
                const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
                const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
                record = await insertOnce(`key:${scope}`, { publicKey, privateKey: pair.privateKey, native: false, scope });
            }
        }
        if (record.native !== Boolean(nativeKey)) throw new Error('auth_device_provider_mismatch');
        const { x, y } = record.publicKey;
        const publicKey = { kty: 'EC', crv: 'P-256', x, y };
        const keyId = hex(await crypto.subtle.digest('SHA-256', utf8(JSON.stringify(publicKey))));
        return {
            keyId, publicKey, scope: record.scope,
            async sign(challenge) {
                if (challenge.keyId !== keyId) throw new Error('auth_challenge_key_mismatch');
                const message = authSigningMessage(challenge);
                const signature = nativeKey
                    ? await nativeKey({ action: 'sign', scope: record.scope, message })
                    : encode(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, record.privateKey, utf8(message)));
                return { challengeId: challenge.challenge, signature };
            }
        };
    }
    async function forPhone(phone) { return forScope(await phoneScope(phone)); }
    return { forPhone, forScope, read, put, remove,
        async aliasPhone(previousPhone, nextPhone) {
            const previous = await read(`key:${await phoneScope(previousPhone)}`);
            if (!previous) throw new Error('auth_device_key_missing');
            await put(`key:${await phoneScope(nextPhone)}`, previous);
            if (previousPhone !== nextPhone) await remove(`key:${await phoneScope(previousPhone)}`);
        },
        async keys(prefix) { return (await storage('readonly', (store) => store.getAllKeys())).filter((key) => String(key).startsWith(prefix)); },
        randomHandle: () => encode(crypto.getRandomValues(new Uint8Array(32))),
        async close() { if (opening) (await opening).close(); opening = null; } };
}
