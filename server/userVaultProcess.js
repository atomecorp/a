import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const [principalId, vaultRoot, socketPath] = process.argv.slice(2);
const secret = String(process.env.SQUIRREL_VAULT_IPC_SECRET || '');

if (!principalId || !vaultRoot || !socketPath || secret.length < 24) {
    throw new Error('vault_process_configuration_invalid');
}

fs.mkdirSync(vaultRoot, { recursive: true, mode: 0o700 });
const fileRoot = path.join(vaultRoot, 'files');
fs.mkdirSync(fileRoot, { recursive: true, mode: 0o700 });
process.env.SQLITE_PATH = path.join(vaultRoot, 'vault.db');
process.env.SQUIRREL_SYNC_REMOTE = '0';

const db = await import('../database/adole.js');
await db.initDatabase();
await db.resolvePendingOwners();

// Upper bound of one stream replay batch (raw stored bytes); see `stream:events`.
const STREAM_BATCH_BYTES = 8 * 1024 * 1024;

const parseJson = (value) => {
    if (value == null || typeof value === 'object') return value ?? null;
    try { return JSON.parse(value); } catch (_) { return value; }
};

const parseRow = (row) => ({
    ...row,
    payload: parseJson(row?.payload),
    actor: parseJson(row?.actor),
    projection: parseJson(row?.projection),
    lww_decisions: parseJson(row?.lww_decisions)
});

const assertActor = (event = {}, authorizedActorId = null) => {
    const actorId = event?.actor?.id || event?.actor?.user_id || event?.actor?.userId || principalId;
    const authorized = authorizedActorId ? String(authorizedActorId) : principalId;
    if (String(actorId) !== authorized) throw new Error('vault_actor_mismatch');
    return { ...event, actor: { ...(event.actor || {}), type: 'user', id: authorized } };
};

const handleOperation = async (operation, payload = {}) => {
    if (operation === 'health') {
        return { ok: true, principalId, pid: process.pid, databasePath: process.env.SQLITE_PATH, fileRoot, socketPath };
    }
    if (operation === 'event:commit') {
        const event = await db.appendEvent(assertActor(payload.event, payload.authorized_actor_id), {
            source: payload.source || null,
            conflictMode: payload.conflictMode || null
        });
        return { ...event, inserted: db.wasEventInserted(event) };
    }
    if (operation === 'event:commit-batch') {
        const events = Array.isArray(payload.events)
            ? payload.events.map((event) => assertActor(event, payload.authorized_actor_id))
            : null;
        if (!events) throw new Error('vault_events_array_required');
        const committed = await db.appendEvents(events, {
            txId: payload.tx_id || payload.txId || null,
            source: payload.source || null,
            conflictMode: payload.conflictMode || null
        });
        return committed.map((event) => ({ ...event, inserted: db.wasEventInserted(event) }));
    }
    if (operation === 'event:get') return db.getEvent(payload.event_id || payload.eventId);
    if (operation === 'history:apply') {
        const { executeAtomeHistoryCommand } = await import('./atomeHistoryCommands.js');
        return executeAtomeHistoryCommand({ operation: payload.operation, sourceTxId: payload.sourceTxId,
            atomeIds: payload.atomeIds || payload.atome_ids || [], requestId: payload.requestId,
            authenticatedUserId: principalId });
    }
    if (operation === 'state:get') return db.getStateCurrent(payload.atome_id || payload.atomeId);
    if (operation === 'communication:list') {
        const { queryCommunicationMessages } = await import('../database/communication_messages.js');
        // `db` est l'espace de noms du module : `query` n'existe que dans son export par defaut.
        return queryCommunicationMessages({ query: db.default.query, userId: principalId, ...payload });
    }
    if (operation === 'communication:threads') {
        const { queryListingThreads } = await import('../database/communication_messages.js');
        return queryListingThreads({ query: db.default.query, userId: principalId, listingId: payload.listingId });
    }
    if (operation === 'state:list') {
        return db.listStateCurrent(payload.project_id || payload.projectId || null, {
            ownerId: principalId,
            atomeType: payload.atome_type || payload.atomeType || null,
            includeShared: false,
            excludeSystem: payload.exclude_system === true || payload.excludeSystem === true,
            limit: payload.limit,
            offset: payload.offset,
            order: payload.order,
            after: payload.after
        });
    }
    if (operation === 'events:list') {
        return db.listEvents({
            projectId: payload.project_id || payload.projectId || null,
            atomeId: payload.atome_id || payload.atomeId || null,
            txId: payload.tx_id || payload.txId || null,
            gestureId: payload.gesture_id || payload.gestureId || null,
            since: payload.since || null,
            until: payload.until || null,
            limit: payload.limit,
            offset: payload.offset,
            order: payload.order || 'asc'
        });
    }
    if (operation === 'stream:of-atome') return db.streamOfAtome(payload.atome_id || payload.atomeId);
    if (operation === 'stream:events') {
        const streamId = String(payload.stream_id || payload.streamId || '');
        const cursor = Math.max(0, Number(payload.cursor) || 0);
        const limit = Math.max(1, Math.min(Number(payload.limit) || 500, 1000));
        if (!streamId) throw new Error('vault_stream_required');
        // Every event carries the projection of its object (hundreds of KB for a large
        // project): 500 of them made one reply of ~150 MB and killed this process. The batch
        // is bounded in bytes too, read from the row sizes first; at least one event goes.
        const sizes = await db.default.query(
            'all',
            `SELECT COALESCE(LENGTH(payload), 0) + COALESCE(LENGTH(projection), 0)
                    + COALESCE(LENGTH(lww_decisions), 0) AS bytes
             FROM events WHERE stream_id = ? AND sequence > ?
             ORDER BY sequence ASC, id ASC LIMIT ?`,
            [streamId, cursor, limit]
        );
        let count = 0;
        let bytes = 0;
        for (const row of sizes || []) {
            if (count && bytes + Number(row.bytes || 0) > STREAM_BATCH_BYTES) break;
            bytes += Number(row.bytes || 0);
            count += 1;
        }
        if (!count) return [];
        const rows = await db.default.query(
            'all',
            `SELECT * FROM events WHERE stream_id = ? AND sequence > ?
             ORDER BY sequence ASC, id ASC LIMIT ?`,
            [streamId, cursor, count]
        );
        return (rows || []).map(parseRow);
    }
    if (operation === 'stream:head') {
        const streamId = String(payload.stream_id || payload.streamId || '');
        if (!streamId) throw new Error('vault_stream_required');
        const row = await db.default.query(
            'get',
            'SELECT COALESCE(MAX(sequence), 0) AS sequence FROM events WHERE stream_id = ?',
            [streamId]
        );
        return Number(row?.sequence || 0);
    }
    // Bulk `stream:head` for a subscription batch: one indexed query instead of one request per stream.
    if (operation === 'stream:heads') {
        const streamIds = Array.isArray(payload.stream_ids) ? payload.stream_ids.map(String).filter(Boolean) : [];
        if (!streamIds.length) return {};
        if (streamIds.length > 1000) throw new Error('vault_stream_batch_too_large');
        const rows = await db.default.query(
            'all',
            `SELECT stream_id, MAX(sequence) AS sequence FROM events
             WHERE stream_id IN (${streamIds.map(() => '?').join(',')}) GROUP BY stream_id`,
            streamIds
        );
        return Object.fromEntries((rows || []).map((row) => [row.stream_id, Number(row.sequence || 0)]));
    }
    // Objects this vault has placed on a teleport surface (surface loss / reconnect).
    if (operation === 'teleport:hosted') {
        const surfaceId = String(payload.surface_id || payload.surfaceId || '');
        if (!surfaceId) throw new Error('vault_surface_required');
        const rows = await db.default.query(
            'all',
            `SELECT DISTINCT atome_id FROM particles
             WHERE particle_key = 'teleport_surface_id' AND particle_value IN (?, ?)`,
            [surfaceId, JSON.stringify(surfaceId)]
        );
        return (rows || []).map((row) => row.atome_id);
    }
    // The live Atome describing each stored file, by its stored name: its id and the
    // name the person's file had (`original_name`), the life profiles it belongs to, newest first for a name stored twice.
    if (operation === 'files:described') {
        const fileNames = Array.isArray(payload.file_names) ? payload.file_names.map(String).filter(Boolean) : [];
        if (!fileNames.length) return [];
        if (fileNames.length > 1000) throw new Error('vault_file_batch_too_large');
        const rows = await db.default.query(
            'all',
            `SELECT f.atome_id, f.particle_value AS file_name, o.particle_value AS original_name, p.particle_value AS profiles
             FROM particles f
             JOIN atomes a ON a.atome_id = f.atome_id AND a.deleted_at IS NULL
             LEFT JOIN particles o ON o.atome_id = f.atome_id AND o.particle_key = 'original_name'
             LEFT JOIN particles p ON p.atome_id = f.atome_id AND p.particle_key = 'profiles'
             WHERE f.particle_key = 'file_name' AND f.particle_value IN (${fileNames.map(() => '?').join(',')})
             ORDER BY COALESCE(a.updated_at, a.created_at) DESC`,
            fileNames.map((name) => JSON.stringify(name))
        );
        return (rows || []).map((row) => ({
            atome_id: row.atome_id,
            file_name: JSON.parse(row.file_name),
            original_name: row.original_name === null ? null : JSON.parse(row.original_name),
            profiles: row.profiles === null ? [] : JSON.parse(row.profiles)
        }));
    }
    throw new Error('vault_operation_not_allowed');
};

const server = net.createServer((connection) => {
    let buffer = '';
    connection.setEncoding('utf8');
    connection.on('data', (chunk) => {
        buffer += chunk;
        if (buffer.length > 2_000_000) connection.destroy(new Error('vault_request_too_large'));
        const newline = buffer.indexOf('\n');
        if (newline < 0) return;
        const raw = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        Promise.resolve().then(async () => {
            const request = JSON.parse(raw);
            if (!crypto.timingSafeEqual(Buffer.from(String(request.secret || '')), Buffer.from(secret))) {
                throw new Error('vault_authentication_failed');
            }
            const result = await handleOperation(request.operation, request.payload);
            connection.end(`${JSON.stringify({ requestId: request.requestId, ok: true, result })}\n`);
        }).catch((error) => {
            connection.end(`${JSON.stringify({
                ok: false,
                error: error?.code || error?.message || 'vault_operation_failed'
            })}\n`);
        });
    });
});

if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
});
fs.chmodSync(socketPath, 0o600);
process.send?.({ type: 'vault-ready', principalId, pid: process.pid, socketPath });

let shutdownPromise = null;
const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
        const forcedExit = setTimeout(() => process.exit(0), 3000);
        forcedExit.unref();
        await new Promise((resolve) => server.close(resolve));
        await db.closeDatabase().catch(() => {});
        if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
        clearTimeout(forcedExit);
        process.exit(0);
    })();
    return shutdownPromise;
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
process.once('disconnect', shutdown);
