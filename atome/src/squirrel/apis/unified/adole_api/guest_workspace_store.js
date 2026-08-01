// Installation-scoped browser guest persistence. This is the only local guest
// authority and keeps append-only events separate from projected current state.
const DB_NAME = 'squirrel_guest_workspace_v1';
const DB_VERSION = 1;
const STORE_RECORDS = 'records';
const STORE_EVENTS = 'events';
const STORE_SNAPSHOTS = 'snapshots';
const STORE_QUEUE = 'queue';
const STORE_FILES = 'files';

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
            [STORE_RECORDS, STORE_EVENTS, STORE_SNAPSHOTS, STORE_QUEUE, STORE_FILES].forEach((name) => {
                if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'key' });
            });
        };
        request.onsuccess = () => resolve(request.result);
    });
}

async function transact(stores, mode, work) {
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

function requestValue(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('guest_storage_request_failed'));
    });
}

function storageError(error) {
    if (error?.name === 'QuotaExceededError' || error?.message === 'QuotaExceededError') return 'guest_storage_quota_exceeded';
    return error?.message || 'guest_storage_write_failed';
}

async function sha256(bytes) {
    if (!globalThis.crypto?.subtle) throw new Error('guest_adoption_digest_unavailable');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

const key = (ownerId, id) => `${String(ownerId)}:${String(id)}`;

export async function listGuestAtomes(ownerId, options = {}) {
    const records = await transact([STORE_RECORDS], 'readonly', (transaction) => requestValue(transaction.objectStore(STORE_RECORDS).getAll()));
    return (records || []).filter((record) => record.owner_id === String(ownerId))
        .filter((record) => options.include_deleted || !record.deleted_at)
        .filter((record) => !options.type || record.atome_type === options.type)
        .map((record) => ({ ...record, properties: { ...record.properties } }));
}

export async function getGuestAtome(ownerId, atomeId) {
    return transact([STORE_RECORDS], 'readonly', (transaction) => requestValue(transaction.objectStore(STORE_RECORDS).get(key(ownerId, atomeId))));
}

export async function commitGuestAtome(ownerId, payload = {}) {
    const atomeId = String(payload.atome_id || payload.id || '').trim();
    if (!atomeId) return { ok: false, error: 'missing_atome_id' };
    const now = new Date().toISOString();
    try {
        await transact([STORE_RECORDS, STORE_EVENTS, STORE_SNAPSHOTS, STORE_QUEUE], 'readwrite', (transaction) => {
            const records = transaction.objectStore(STORE_RECORDS);
            const recordRequest = records.get(key(ownerId, atomeId));
            recordRequest.onsuccess = () => {
                const previous = recordRequest.result;
                const properties = { ...(previous?.properties || {}), ...(payload.props || payload.properties || {}) };
                const record = {
                    key: key(ownerId, atomeId), atome_id: atomeId, id: atomeId,
                    atome_type: payload.kind || payload.type || previous?.atome_type || properties.kind || 'shape',
                    owner_id: String(ownerId), creator_id: previous?.creator_id || String(ownerId),
                    project_id: payload.project_id || payload.projectId || previous?.project_id || null,
                    parent_id: payload.parent_id || payload.parentId || previous?.parent_id || null,
                    properties, created_at: previous?.created_at || now, updated_at: now,
                    deleted_at: payload.deleted_at || null
                };
                records.put(record);
                const eventId = globalThis.crypto?.randomUUID?.();
                if (!eventId) throw new Error('secure_random_unavailable');
                const event = { key: key(ownerId, eventId), id: eventId, ts: now, atome_id: atomeId, project_id: record.project_id, kind: 'set', payload: { props: properties }, actor: { type: 'guest', id: String(ownerId) } };
                transaction.objectStore(STORE_EVENTS).put(event);
                transaction.objectStore(STORE_SNAPSHOTS).put({
                    key: key(ownerId, eventId), owner_id: String(ownerId), atome_id: atomeId,
                    project_id: record.project_id, snapshot_data: JSON.stringify(record),
                    actor: { type: 'guest', id: String(ownerId) }, created_by: String(ownerId), created_at: now
                });
                transaction.objectStore(STORE_QUEUE).put({ key: key(ownerId, eventId), owner_id: String(ownerId), operation: 'commit', payload: event, created_at: now });
            };
        });
    } catch (error) {
        return { ok: false, error: storageError(error) };
    }
    return { ok: true, success: true };
}

export async function deleteGuestAtome(ownerId, atomeId) {
    const previous = await getGuestAtome(ownerId, atomeId);
    if (!previous) return { ok: false, error: 'atome_not_found' };
    return commitGuestAtome(ownerId, { atome_id: atomeId, kind: previous.atome_type, props: previous.properties, deleted_at: new Date().toISOString() });
}

export async function putGuestFile(ownerId, { file_id: fileId = null, name, blob } = {}) {
    const resolvedFileId = String(fileId || globalThis.crypto?.randomUUID?.() || '').trim();
    if (!resolvedFileId || typeof Blob !== 'function' || !(blob instanceof Blob)) return { ok: false, error: 'guest_file_invalid' };
    const bytes = await blob.arrayBuffer();
    const record = {
        key: key(ownerId, resolvedFileId), owner_id: String(ownerId), file_id: resolvedFileId,
        file_name: String(name || 'upload.bin'), content_digest: await sha256(bytes), byte_length: bytes.byteLength,
        blob, created_at: new Date().toISOString()
    };
    try {
        await transact([STORE_FILES], 'readwrite', (transaction) => transaction.objectStore(STORE_FILES).put(record));
    } catch (error) {
        return { ok: false, error: storageError(error) };
    }
    return { ok: true, file: { ...record, blob: undefined } };
}

export async function listGuestFiles(ownerId) {
    const files = await transact([STORE_FILES], 'readonly', (transaction) => requestValue(transaction.objectStore(STORE_FILES).getAll()));
    return (files || []).filter((file) => file.owner_id === String(ownerId));
}

export async function guestAdoptionPayload(ownerId) {
    const [atomes, events, snapshots, syncQueue, files] = await Promise.all([
        listGuestAtomes(ownerId, { include_deleted: true }),
        transact([STORE_EVENTS], 'readonly', (transaction) => requestValue(transaction.objectStore(STORE_EVENTS).getAll())),
        transact([STORE_SNAPSHOTS], 'readonly', (transaction) => requestValue(transaction.objectStore(STORE_SNAPSHOTS).getAll())),
        transact([STORE_QUEUE], 'readonly', (transaction) => requestValue(transaction.objectStore(STORE_QUEUE).getAll())),
        listGuestFiles(ownerId)
    ]);
    return {
        atomes,
        events: (events || []).filter((event) => event.actor?.id === String(ownerId)).map(({ key: _key, ...event }) => event),
        snapshots: (snapshots || []).filter((snapshot) => snapshot.owner_id === String(ownerId)).map(({ key: _key, owner_id: _ownerId, ...snapshot }) => snapshot),
        sync_queue: (syncQueue || []).filter((entry) => entry.owner_id === String(ownerId)).map(({ key: _key, ...entry }) => entry),
        permissions: [],
        files: files.map(({ blob: _blob, key: _key, owner_id: _ownerId, created_at: _createdAt, ...file }) => file)
    };
}

export async function clearGuestWorkspace(ownerId) {
    const stores = [STORE_RECORDS, STORE_EVENTS, STORE_SNAPSHOTS, STORE_QUEUE, STORE_FILES];
    const all = await Promise.all(stores.map((store) => transact([store], 'readonly', (transaction) => requestValue(transaction.objectStore(store).getAllKeys()))));
    await transact(stores, 'readwrite', (transaction) => {
        all.forEach((keys, index) => (keys || []).filter((value) => String(value).startsWith(`${String(ownerId)}:`))
            .forEach((value) => transaction.objectStore(stores[index]).delete(value)));
    });
}
