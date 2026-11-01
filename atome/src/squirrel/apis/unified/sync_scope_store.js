// Where the sync engine keeps, per scope (server environment | principal), the streams it
// follows and the cursor reached on each. A used account follows tens of thousands of them
// (66 295 streams, 10.5 MB on an iPhone, 2026-11-01): kept in localStorage, capped near
// 5 M characters for the whole app, they filled it and every other write of the app threw,
// the project opening's current-project write included (BUG-012/013, iOS build 44).
// IndexedDB holds them instead, one record per scope.
const DATABASE = 'squirrel_sync_scope';
const STORE = 'scopes';
// The localStorage keys this store replaces: the scopes they hold are moved here once,
// then the keys are freed.
const MOVED_STREAMS_KEY = 'squirrel_sync_streams_v1';
const MOVED_CURSORS_KEY = 'squirrel_sync_cursors_v1';

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const parseObject = (raw) => (raw ? asObject(JSON.parse(raw)) : {});
const toScope = (record) => ({
    streams: Array.isArray(record?.streams) ? record.streams : [],
    cursors: asObject(record?.cursors)
});

export const createSyncScopeStore = (env) => {
    let database = null;
    let moved = null;
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
    const moveLocalStorageScopes = async () => {
        const storage = env?.localStorage;
        const rawStreams = storage?.getItem?.(MOVED_STREAMS_KEY);
        const rawCursors = storage?.getItem?.(MOVED_CURSORS_KEY);
        if (!rawStreams && !rawCursors) return;
        const streams = parseObject(rawStreams);
        const cursors = parseObject(rawCursors);
        const keys = new Set([...Object.keys(streams), ...Object.keys(cursors)]);
        await transact('readwrite', (objectStore) => {
            for (const key of keys) objectStore.put(toScope({ streams: streams[key], cursors: cursors[key] }), key);
        });
        storage.removeItem(MOVED_STREAMS_KEY);
        storage.removeItem(MOVED_CURSORS_KEY);
    };
    const load = async (key) => {
        moved ||= moveLocalStorageScopes();
        await moved;
        return toScope(await transact('readonly', (objectStore, done) => {
            const request = objectStore.get(String(key));
            request.onsuccess = () => done(request.result);
        }));
    };
    const save = (key, scope) => transact('readwrite', (objectStore) => {
        objectStore.put(toScope(scope), String(key));
    });
    return { load, save };
};
