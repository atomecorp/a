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
    if (operation === 'state:get') return db.getStateCurrent(payload.atome_id || payload.atomeId);
    if (operation === 'state:list') {
        return db.listStateCurrent(payload.project_id || payload.projectId || null, {
            ownerId: principalId,
            atomeType: payload.atome_type || payload.atomeType || null,
            includeShared: false,
            excludeSystem: payload.exclude_system === true || payload.excludeSystem === true,
            limit: payload.limit,
            offset: payload.offset
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
    if (operation === 'stream:events') {
        const streamId = String(payload.stream_id || payload.streamId || '');
        const cursor = Math.max(0, Number(payload.cursor) || 0);
        const limit = Math.max(1, Math.min(Number(payload.limit) || 500, 1000));
        if (!streamId) throw new Error('vault_stream_required');
        const rows = await db.default.query(
            'all',
            `SELECT * FROM events WHERE stream_id = ? AND sequence > ?
             ORDER BY sequence ASC, id ASC LIMIT ?`,
            [streamId, cursor, limit]
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

const shutdown = async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.closeDatabase().catch(() => {});
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    process.exit(0);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
