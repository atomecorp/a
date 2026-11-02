// Where the sync engine keeps, per scope (server environment | principal), the streams it
// follows and the cursor reached on each. A used account follows tens of thousands of them
// (66 295 streams, 10.5 MB on an iPhone, 2026-11-01): kept in localStorage, capped near
// 5 M characters for the whole app, they filled it and every other write of the app threw,
// the project opening's current-project write included (BUG-012/013, iOS build 44).
// IndexedDB holds them instead, one record per scope.
const DATABASE = 'squirrel_sync_scope';
const STORE = 'scopes';
// The localStorage keys this store replaces: the scopes they hold are moved here once,
// then the keys are freed (`release`).
const LEGACY_KEYS = ['squirrel_sync_streams_v1', 'squirrel_sync_cursors_v1'];
// A legacy key whose text is not a JSON object is kept here verbatim, under this prefix and
// its key name (scope keys start with the server environment, never with this prefix).
const UNREADABLE_PREFIX = 'unreadable_legacy:';

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const toScope = (record) => ({
    streams: Array.isArray(record?.streams) ? record.streams : [],
    cursors: asObject(record?.cursors)
});
const parseLegacy = (raw) => {
    try {
        const value = JSON.parse(raw);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (_) {
        return null; // the caller keeps the text and reports it
    }
};

export const createSyncScopeStore = (env) => {
    let database = null;
    let released = null;
    const open = () => {
        const factory = env?.indexedDB;
        if (!factory) return Promise.reject(new Error('sync_scope_store_unavailable'));
        database ||= new Promise((resolve, reject) => {
            const request = factory.open(DATABASE, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('sync_scope_store_open_failed'));
            request.onblocked = () => reject(new Error('sync_scope_store_blocked'));
        });
        // A failed opening is not kept: the next call opens again.
        database.catch(() => { database = null; });
        return database;
    };
    // `action(objectStore, done)`: `done(value)` is what the transaction resolves to once complete.
    const transact = async (mode, action) => {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            let result;
            action(tx.objectStore(STORE), (value) => { result = value; });
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error || new Error('sync_scope_store_transaction_failed'));
            tx.onabort = () => reject(tx.error || new Error('sync_scope_store_transaction_aborted'));
        });
    };
    // Moves the legacy scopes into IndexedDB in one transaction, then frees their keys: until
    // then the quota stays full and no other localStorage write of the app can succeed. A key
    // whose text cannot be read is stored verbatim beside the scopes and freed too: nothing is
    // dropped, and its name is returned in `unreadable` for the caller to report. Nothing is
    // freed when the transaction fails; that release rejects and the next call tries again.
    const moveLegacyScopes = async () => {
        const storage = env?.localStorage;
        const legacy = LEGACY_KEYS.map((key) => ({ key, raw: storage?.getItem?.(key) ?? null }))
            .filter(({ raw }) => raw !== null);
        if (!legacy.length) return { unreadable: [] };
        const parsed = legacy.map((entry) => ({ ...entry, value: parseLegacy(entry.raw) }));
        const [streams, cursors] = LEGACY_KEYS.map((key) => asObject(parsed.find((entry) => entry.key === key)?.value));
        const scopeKeys = new Set([...Object.keys(streams), ...Object.keys(cursors)]);
        const unreadable = parsed.filter(({ value }) => value === null);
        await transact('readwrite', (objectStore) => {
            for (const key of scopeKeys) objectStore.put(toScope({ streams: streams[key], cursors: cursors[key] }), key);
            for (const { key, raw } of unreadable) objectStore.put({ key, raw }, `${UNREADABLE_PREFIX}${key}`);
        });
        legacy.forEach(({ key }) => storage.removeItem(key));
        return { unreadable: unreadable.map(({ key }) => key) };
    };
    const release = () => {
        released ||= moveLegacyScopes();
        released.catch(() => { released = null; });
        return released;
    };
    const load = async (key) => {
        await release();
        return toScope(await transact('readonly', (objectStore, done) => {
            const request = objectStore.get(String(key));
            request.onsuccess = () => done(request.result);
        }));
    };
    const save = (key, scope) => transact('readwrite', (objectStore) => {
        objectStore.put(toScope(scope), String(key));
    });
    // The legacy texts kept because they could not be read: `[{ key, raw }]`.
    const readUnreadable = () => transact('readonly', (objectStore, done) => {
        const kept = [];
        const keys = objectStore.getAllKeys();
        keys.onsuccess = () => keys.result.filter((key) => String(key).startsWith(UNREADABLE_PREFIX)).forEach((key) => {
            const request = objectStore.get(key);
            request.onsuccess = () => { kept.push(request.result); done(kept); };
        });
        done(kept);
    });
    return { release, load, save, readUnreadable };
};

// One store per window: the boot releases the legacy scopes through it before the app's first
// write (spark.js), and the sync engine then reads, saves and reports through the same one.
const stores = new WeakMap();
export const getSyncScopeStore = (env) => {
    if (!stores.has(env)) stores.set(env, createSyncScopeStore(env));
    return stores.get(env);
};
