import { extractEventPatch, eventDeletedPropertyKeys, assertIdempotentEventReplay } from '../../../../shared/adole_event_contract.js';
import { sanitizeAtomeProperties } from '../../../../shared/atome_contract.js';
// Installation-scoped browser guest persistence. This is the only local guest
// authority and keeps append-only events separate from projected current state.
const DB_NAME = 'squirrel_guest_workspace_v1';
const DB_VERSION = 3;
const STORE_RECORDS = 'records';
const STORE_EVENTS = 'events';
const STORE_SNAPSHOTS = 'snapshots';
const STORE_QUEUE = 'queue';
const STORE_FILES = 'files';
// Outbox rows the server refused: kept, never dropped, out of the send order so
// they cannot hold back the rows behind them; requeued on the next session.
const STORE_REFUSED = 'refused_queue';
// Outbox rows of one owner in send order. Without it, finding the next row to
// send meant deserializing the whole outbox on every commit.
const QUEUE_ORDER_INDEX = 'owner_created';

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

export async function commitWorkspaceEvents(ownerId, inputs, { actorType = 'user' } = {}) {
    if (!ownerId || !Array.isArray(inputs) || !inputs.length) throw new Error('workspace_event_invalid');
    const events = inputs.map(input => {
        if (!input?.atome_id || !['set', 'delete', 'restore', 'snapshot', 'gesture_start', 'gesture_frame', 'gesture_end'].includes(input.kind)) throw new Error('workspace_event_invalid');
        if (input.actor?.id && String(input.actor.id) !== String(ownerId)) throw new Error('workspace_identity_mismatch');
        const id = input.id || globalThis.crypto?.randomUUID?.();
        if (!id) throw new Error('secure_random_unavailable');
        return { ...input, id, ts: input.ts || new Date().toISOString(), actor: { type: actorType, id: String(ownerId) },
            payload: input.payload || { props: input.props || input.properties || {} } };
    });
    let failure;
    try {
        await transact([STORE_RECORDS, STORE_EVENTS, STORE_SNAPSHOTS, STORE_QUEUE], 'readwrite', tx => {
            const records = tx.objectStore(STORE_RECORDS), log = tx.objectStore(STORE_EVENTS);
            const next = (index) => {
                if (index >= events.length) return;
                const event = events[index], eventKey = key(ownerId, event.id);
                const duplicate = log.get(eventKey);
                duplicate.onsuccess = () => {
                    try {
                        if (duplicate.result) { assertIdempotentEventReplay(duplicate.result, event); next(index + 1); return; }
                        const request = records.get(key(ownerId, event.atome_id));
                        request.onsuccess = () => {
                            try {
                                const previous = request.result;
                                const patch = extractEventPatch(event.kind, event.payload, event.ts);
                                if (!patch) {
                                    if (!event.kind.startsWith('gesture_')) throw new Error('workspace_event_invalid');
                                    log.add({ ...event, key: eventKey });
                                    tx.objectStore(STORE_QUEUE).add({ key: eventKey, owner_id: String(ownerId), operation: 'commit', payload: event, created_at: event.ts });
                                    next(index + 1); return;
                                }
                                const requestedOwner = event.owner_id || patch.owner_id || patch.ownerId;
                                if (requestedOwner && String(requestedOwner) !== String(ownerId)) throw new Error('workspace_identity_mismatch');
                                const properties = { ...(previous?.properties || {}), ...sanitizeAtomeProperties(patch) };
                                eventDeletedPropertyKeys(event).forEach(name => delete properties[name]);
                                const record = {
                                    ...previous, key: key(ownerId, event.atome_id), atome_id: event.atome_id, id: event.atome_id,
                                    atome_type: patch.type || event.type || previous?.atome_type || patch.kind || 'shape',
                                    owner_id: String(ownerId), creator_id: previous?.creator_id || String(ownerId),
                                    project_id: event.payload?.scope === 'global' ? null : event.project_id || previous?.project_id || null,
                                    parent_id: event.parent_id || patch.parent_id || previous?.parent_id || null,
                                    properties, created_at: previous?.created_at || event.ts, updated_at: event.ts,
                                    deleted_at: event.kind === 'delete' ? event.ts : event.kind === 'restore' ? null : previous?.deleted_at || null,
                                    version: (previous?.version || 0) + 1
                                };
                                records.put(record);
                                log.add({ ...event, key: eventKey });
                                tx.objectStore(STORE_SNAPSHOTS).put({ key: eventKey, owner_id: String(ownerId), atome_id: event.atome_id,
                                    project_id: record.project_id, snapshot_data: JSON.stringify(record), actor: event.actor, created_by: String(ownerId), created_at: event.ts });
                                tx.objectStore(STORE_QUEUE).add({ key: eventKey, owner_id: String(ownerId), operation: 'commit', payload: event, created_at: event.ts });
                                next(index + 1);
                            } catch (error) { failure = error; tx.abort(); }
                        };
                    } catch (error) { failure = error; tx.abort(); }
                };
            };
            next(0);
        });
    } catch (error) { throw failure || new Error(storageError(error)); }
    return { ok: true, success: true, events, event: events[0] };
}

export async function commitGuestAtome(ownerId, payload = {}) {
    try {
        return await commitWorkspaceEvents(ownerId, [{ ...payload, atome_id: payload.atome_id || payload.id,
            kind: payload.deleted_at ? 'delete' : 'set', payload: { props: { ...(payload.props || payload.properties || {}),
                ...(payload.type ? { type: payload.type } : {}) } } }], { actorType: 'guest' });
    } catch (error) { return { ok: false, error: storageError(error) }; }
}

export async function deleteGuestAtome(ownerId, atomeId) {
    if (!await getGuestAtome(ownerId, atomeId)) return { ok: false, error: 'atome_not_found' };
    return commitGuestAtome(ownerId, { atome_id: atomeId, deleted_at: new Date().toISOString() });
}

export async function putGuestFile(ownerId, { file_id: fileId = null, name, blob, atome_id = null, atome_type = null } = {}) {
    const resolvedFileId = String(fileId || globalThis.crypto?.randomUUID?.() || '').trim();
    if (!resolvedFileId || typeof Blob !== 'function' || !(blob instanceof Blob)) return { ok: false, error: 'guest_file_invalid' };
    const bytes = await blob.arrayBuffer();
    const record = {
        key: key(ownerId, resolvedFileId), owner_id: String(ownerId), file_id: resolvedFileId,
        file_name: String(name || 'upload.bin'), content_digest: await sha256(bytes), byte_length: bytes.byteLength,
        blob, atome_id, atome_type, uploaded: false, created_at: new Date().toISOString()
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

function rebindGuestMedia(value, fromOwner, toOwner) {
    if (!toOwner) return value;
    if (typeof value === 'string' && value.startsWith('/api/uploads/')) {
        const url = new URL(value, 'https://atome.one');
        if (url.searchParams.get('media_user_id') === String(fromOwner)) url.searchParams.set('media_user_id', String(toOwner));
        return url.pathname + url.search + url.hash;
    }
    if (Array.isArray(value)) return value.map(item => rebindGuestMedia(item, fromOwner, toOwner));
    if (!value || typeof value !== 'object' || value instanceof Blob) return value;
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name,
        name === 'snapshot_data' && typeof item === 'string'
            ? JSON.stringify(rebindGuestMedia(JSON.parse(item), fromOwner, toOwner))
            : rebindGuestMedia(item, fromOwner, toOwner)]));
}

export async function guestAdoptionPayload(ownerId, targetOwner = null) {
    const [atomes, events, snapshots, syncQueue, files] = await Promise.all([
        listGuestAtomes(ownerId, { include_deleted: true }),
        transact([STORE_EVENTS], 'readonly', (transaction) => requestValue(transaction.objectStore(STORE_EVENTS).getAll())),
        transact([STORE_SNAPSHOTS], 'readonly', (transaction) => requestValue(transaction.objectStore(STORE_SNAPSHOTS).getAll())),
        transact([STORE_QUEUE, STORE_REFUSED], 'readonly', (transaction) => Promise.all([
            requestValue(transaction.objectStore(STORE_QUEUE).getAll()),
            requestValue(transaction.objectStore(STORE_REFUSED).getAll())
        ]).then(([queued, refused]) => [...queued, ...refused.map(({ refused: _refused, ...row }) => row)])),
        listGuestFiles(ownerId)
    ]);
    return rebindGuestMedia({
        atomes,
        events: (events || []).filter((event) => event.actor?.id === String(ownerId)).map(({ key: _key, ...event }) => event),
        snapshots: (snapshots || []).filter((snapshot) => snapshot.owner_id === String(ownerId)).map(({ key: _key, owner_id: _ownerId, ...snapshot }) => snapshot),
        sync_queue: (syncQueue || []).filter((entry) => entry.owner_id === String(ownerId)).map(({ key: _key, ...entry }) => entry),
        permissions: [],
        files: files.map(({ blob: _blob, key: _key, owner_id: _ownerId, created_at: _createdAt, ...file }) => file)
    }, ownerId, targetOwner);
}

export async function clearGuestWorkspace(ownerId) {
    const stores = [STORE_RECORDS, STORE_EVENTS, STORE_SNAPSHOTS, STORE_QUEUE, STORE_FILES, STORE_REFUSED];
    const all = await Promise.all(stores.map((store) => transact([store], 'readonly', (transaction) => requestValue(transaction.objectStore(store).getAllKeys()))));
    await transact(stores, 'readwrite', (transaction) => {
        all.forEach((keys, index) => (keys || []).filter((value) => String(value).startsWith(`${String(ownerId)}:`))
            .forEach((value) => transaction.objectStore(stores[index]).delete(value)));
    });
}

export async function listWorkspaceEvents(ownerId, options = {}) {
    const events = await transact([STORE_EVENTS], 'readonly', tx => requestValue(tx.objectStore(STORE_EVENTS).getAll()));
    return events.filter(event => String(event.key).startsWith(String(ownerId) + ':'))
        .filter(event => !options.atome_id || event.atome_id === options.atome_id)
        .filter(event => !options.project_id || event.project_id === options.project_id)
        .filter(event => !options.tx_id || event.tx_id === options.tx_id)
        .filter(event => !options.gesture_id || event.gesture_id === options.gesture_id)
        .filter(event => !options.since || event.ts >= options.since)
        .filter(event => !options.until || event.ts <= options.until)
        .sort((a, b) => options.order === 'desc' ? b.ts.localeCompare(a.ts) : a.ts.localeCompare(b.ts))
        .slice(Number(options.offset) || 0, (Number(options.offset) || 0) + (Number(options.limit) || 1000))
        .map(({ key: _key, ...event }) => event);
}

// Same rows and order as filtering the outbox by owner then sorting it by
// `created_at` (ties keep primary-key order in both), read from the index.
// The bounds span every key type `created_at` could hold (number to string).
const ownerQueueRange = (ownerId) => IDBKeyRange.bound([String(ownerId), -Infinity], [String(ownerId), []]);

export async function pendingWorkspaceEvents(ownerId) {
    return transact([STORE_QUEUE], 'readonly', tx => requestValue(
        tx.objectStore(STORE_QUEUE).index(QUEUE_ORDER_INDEX).getAll(ownerQueueRange(ownerId))));
}

// The next row to send: one cursor step instead of the whole outbox.
export async function oldestPendingWorkspaceEvent(ownerId) {
    return transact([STORE_QUEUE], 'readonly', tx => new Promise((resolve, reject) => {
        const request = tx.objectStore(STORE_QUEUE).index(QUEUE_ORDER_INDEX).openCursor(ownerQueueRange(ownerId));
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => reject(request.error || new Error('guest_storage_request_failed'));
    }));
}

export async function acknowledgeWorkspaceEvent(ownerId, eventId) {
    await transact([STORE_QUEUE], 'readwrite', tx => tx.objectStore(STORE_QUEUE).delete(key(ownerId, eventId)));
}

const ownerKeyRange = (ownerId) => IDBKeyRange.bound(`${String(ownerId)}:`, `${String(ownerId)}:\uffff`);

// Moves a refused row out of the send order, atomically and without loss.
export async function parkRefusedWorkspaceEvent(ownerId, entry, error) {
    await transact([STORE_QUEUE, STORE_REFUSED], 'readwrite', tx => {
        tx.objectStore(STORE_REFUSED).put({ ...entry, refused: { error: String(error || 'workspace_sync_refused'), at: new Date().toISOString() } });
        tx.objectStore(STORE_QUEUE).delete(entry.key);
    });
}

// Puts every refused row back in the outbox; `created_at` restores its place.
export async function requeueRefusedWorkspaceEvents(ownerId) {
    return transact([STORE_QUEUE, STORE_REFUSED], 'readwrite', tx => new Promise((resolve, reject) => {
        const refused = tx.objectStore(STORE_REFUSED).getAll(ownerKeyRange(ownerId));
        refused.onerror = () => reject(refused.error || new Error('guest_storage_request_failed'));
        refused.onsuccess = () => {
            for (const { refused: _refused, ...row } of refused.result) {
                tx.objectStore(STORE_QUEUE).put(row);
                tx.objectStore(STORE_REFUSED).delete(row.key);
            }
            resolve(refused.result.length);
        };
    }));
}

export async function refusedWorkspaceEvents(ownerId) {
    return transact([STORE_REFUSED], 'readonly', tx => requestValue(tx.objectStore(STORE_REFUSED).getAll(ownerKeyRange(ownerId))));
}

// Incoming state cannot overwrite an unsent local change. Account namespaces and
// explicit server ownership are both checked before any projection is persisted.
export async function importWorkspaceStates(ownerId, states) {
    if (!Array.isArray(states)) throw new Error('workspace_states_invalid');
    const owned = states.filter(state => state.owner_id === String(ownerId) && state.atome_id).map(state => {
        const properties = typeof state.properties === 'string' ? JSON.parse(state.properties) : state.properties;
        if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('workspace_properties_invalid');
        return { ...state, properties };
    });
    await transact([STORE_RECORDS, STORE_QUEUE, STORE_REFUSED], 'readwrite', tx => {
        const pending = tx.objectStore(STORE_QUEUE).getAll();
        const refused = tx.objectStore(STORE_REFUSED).getAll(ownerKeyRange(ownerId));
        refused.onsuccess = () => {
            const dirty = new Set([...pending.result, ...refused.result].filter(row => row.owner_id === String(ownerId)).map(row => row.payload.atome_id));
            for (const state of owned) {
                if (dirty.has(state.atome_id)) continue;
                const props = state.properties;
                tx.objectStore(STORE_RECORDS).put({ ...state, key: key(ownerId, state.atome_id), id: state.atome_id,
                    atome_type: state.atome_type || props?.type || props?.kind || 'shape', properties: props || {} });
            }
        };
    });
}

export async function acknowledgeWorkspaceFile(ownerId, fileId) {
    await transact([STORE_FILES], 'readwrite', tx => {
        const files = tx.objectStore(STORE_FILES), found = files.get(key(ownerId, fileId));
        found.onsuccess = () => { if (found.result) files.put({ ...found.result, uploaded: true }); };
    });
}

// Called only after the remote adoption owner confirms all files and records.
// Account copies and removal of the guest source share one local transaction.
export async function completeBrowserGuestAdoption(fromOwner, toOwner) {
    if (!fromOwner || !toOwner || fromOwner === toOwner) throw new Error('guest_adoption_identity_invalid');
    const stores = [STORE_RECORDS, STORE_EVENTS, STORE_SNAPSHOTS, STORE_QUEUE, STORE_FILES, STORE_REFUSED];
    let failure;
    try {
        await transact(stores, 'readwrite', tx => {
            for (const storeName of stores) {
                const store = tx.objectStore(storeName);
                const request = store.getAll();
                request.onsuccess = () => {
                    try {
                        for (const row of request.result) {
                            if (!String(row.key).startsWith(String(fromOwner) + ':')) continue;
                            if (storeName !== STORE_QUEUE && storeName !== STORE_REFUSED) {
                                const adopted = { ...rebindGuestMedia(row, fromOwner, toOwner), key: String(toOwner) + row.key.slice(String(fromOwner).length), owner_id: String(toOwner) };
                                if (storeName === STORE_FILES) adopted.uploaded = true;
                                store.add(adopted);
                            }
                            store.delete(row.key);
                        }
                    } catch (error) { failure = error; tx.abort(); }
                };
            }
        });
    } catch (error) { throw failure || error; }
}
