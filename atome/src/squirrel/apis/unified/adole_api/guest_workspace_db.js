// The browser workspace's IndexedDB: its stores, indexes, transactions and keys (guest_workspace_store.js reads and writes them).
export const DB_NAME = 'squirrel_guest_workspace_v1';
export const DB_VERSION = 5;
export const STORE_RECORDS = 'records';
export const STORE_EVENTS = 'events';
export const STORE_SNAPSHOTS = 'snapshots';
export const STORE_QUEUE = 'queue';
export const STORE_FILES = 'files';
// Outbox rows the server refused: kept, never dropped, out of the send order so
// they cannot hold back the rows behind them; requeued on the next session.
export const STORE_REFUSED = 'refused_queue';
// Outbox rows of one owner in send order. Without it, finding the next row to
// send meant deserializing the whole outbox on every commit.
export const QUEUE_ORDER_INDEX = 'owner_created';
// Records of one owner and one type: listing the projects no longer deserializes every atome of the device.
export const RECORD_TYPE_INDEX = 'owner_type';
// The journal of one atome or one project: an undo reads its scope's history, never every event of the device.
export const EVENT_ATOME_INDEX = 'atome_id', EVENT_PROJECT_INDEX = 'project_id';

function unavailable() {
    if (!globalThis.indexedDB) throw new Error('guest_storage_unavailable');
}

function openDatabase() {
    unavailable();
    return new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error || new Error('guest_storage_open_failed'));
        request.onupgradeneeded = () => {
            const database = request.result;
            [STORE_RECORDS, STORE_EVENTS, STORE_SNAPSHOTS, STORE_QUEUE, STORE_FILES, STORE_REFUSED].forEach((name) => {
                if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'key' });
            });
            const queue = request.transaction.objectStore(STORE_QUEUE);
            if (!queue.indexNames.contains(QUEUE_ORDER_INDEX)) queue.createIndex(QUEUE_ORDER_INDEX, ['owner_id', 'created_at']);
            const records = request.transaction.objectStore(STORE_RECORDS);
            if (!records.indexNames.contains(RECORD_TYPE_INDEX)) records.createIndex(RECORD_TYPE_INDEX, ['owner_id', 'atome_type']);
            const log = request.transaction.objectStore(STORE_EVENTS);
            for (const name of [EVENT_ATOME_INDEX, EVENT_PROJECT_INDEX]) if (!log.indexNames.contains(name)) log.createIndex(name, name);
        };
        request.onsuccess = () => resolve(request.result);
    });
}

export async function transact(stores, mode, work) {
    const database = await openDatabase();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = database.transaction(stores, mode);
            let result;
            transaction.onerror = () => reject(transaction.error || new Error('guest_storage_transaction_failed'));
            transaction.onabort = () => reject(transaction.error || new Error('guest_storage_transaction_aborted'));
            transaction.oncomplete = () => resolve(result);
            try { result = work(transaction); } catch (error) { transaction.abort(); reject(error); }
        });
    } finally {
        database.close();
    }
}

export function requestValue(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('guest_storage_request_failed'));
    });
}

export function storageError(error) {
    if (error?.name === 'QuotaExceededError' || error?.message === 'QuotaExceededError') return 'guest_storage_quota_exceeded';
    return error?.message || 'guest_storage_write_failed';
}

export const key = (ownerId, id) => `${String(ownerId)}:${String(id)}`;
export const ownerKeyRange = (ownerId) => IDBKeyRange.bound(`${String(ownerId)}:`, `${String(ownerId)}:\uffff`);
