import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('reconnect reads and delayed sync events reauthorize current property scope', async () => {
    const dbPath = path.join(os.tmpdir(), `granularity-reconnect-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?granularity_reconnect=${nonce}`);
    const operations = await import(`../../server/wsAtomeOperations.js?granularity_reconnect=${nonce}`);
    const syncSecurity = await import(`../../server/wsSyncSecurity.js?granularity_reconnect=${nonce}`);
    const propertySecurity = await import(`../../server/atomePropertySecurity.js?granularity_reconnect=${nonce}`);
    const ownerId = 'gv_reconnect_owner';
    const receiverId = 'gv_reconnect_receiver';
    const atomeId = 'gv_reconnect_shape';
    const receiverConnection = { _wsApiUserId: receiverId };

    try {
        await db.initDatabase();
        for (const id of [ownerId, receiverId]) {
            await db.createAtome({ id, type: 'user', owner: id, creator: id, properties: { name: id } });
        }
        await db.createAtome({
            id: atomeId,
            type: 'shape',
            owner: ownerId,
            creator: ownerId,
            properties: { left: 10, secret: 'protected' }
        });
        await db.appendEvent({
            id: 'gv_reconnect_initial',
            kind: 'set',
            atome_id: atomeId,
            actor: { id: ownerId },
            payload: { props: { left: 10, secret: 'protected' } }
        });
        await db.setPermission(atomeId, receiverId, true, false, false, false, 'left', ownerId, {
            shareMode: 'real-time'
        });

        const firstPull = await operations.handleWsAtomeOperation({
            type: 'sync', action: 'pull', requestId: 'gv_first_pull'
        }, receiverConnection);
        assert.equal(firstPull.success, true);
        assert.equal(firstPull.changes.length, 1);
        assert.deepEqual(firstPull.changes[0].payload.props, { left: 10 });

        await db.setPermission(atomeId, receiverId, false, false, false, false, 'left', ownerId, {
            shareMode: 'real-time'
        });
        const revokedPull = await operations.handleWsAtomeOperation({
            type: 'sync', action: 'pull', requestId: 'gv_revoked_pull'
        }, receiverConnection);
        assert.equal(revokedPull.success, true);
        assert.deepEqual(revokedPull.changes, []);
        assert.equal(await syncSecurity.filterWsSyncEventForPrincipal({
            type: 'atome-sync',
            operation: 'update',
            atome: { atome_id: atomeId, properties: { left: 20, secret: 'protected' } }
        }, receiverId), null);

        await db.setPermission(atomeId, receiverId, true, false, false, false, 'left', ownerId, {
            shareMode: 'real-time'
        });
        const reconnectedState = await operations.handleWsAtomeOperation({
            type: 'state-current', action: 'get', requestId: 'gv_reconnected_state', atome_id: atomeId
        }, receiverConnection);
        assert.equal(reconnectedState.success, true);
        assert.deepEqual(reconnectedState.state.properties, { left: 10 });

        await db.deleteAtome(atomeId);
        const ownerDelete = await syncSecurity.filterWsSyncEventForPrincipal({
            type: 'atome-sync', operation: 'delete', atome: { atome_id: atomeId, type: 'shape' }
        }, ownerId);
        const receiverDelete = await syncSecurity.filterWsSyncEventForPrincipal({
            type: 'atome-sync', operation: 'delete', atome: { atome_id: atomeId, type: 'shape' }
        }, receiverId);
        assert.equal(ownerDelete.eventType, 'atome:deleted');
        assert.equal(receiverDelete.eventType, 'atome:deleted');
        assert.deepEqual(Object.keys(receiverDelete.payload.atome).sort(), ['atome_id', 'id', 'type']);
        const projectedDeleteEvent = await propertySecurity.projectEventForRead({
            id: 'gv_reconnect_delete', kind: 'delete', atome_id: atomeId,
            payload: { props: {}, delete_keys: [] }
        }, receiverId);
        assert.equal(projectedDeleteEvent.id, 'gv_reconnect_delete');
        assert.deepEqual(projectedDeleteEvent.payload, {
            props: {}, delete_keys: [], property_versions: {}
        });

        await db.setPermission(atomeId, receiverId, false, false, false, false, 'left', ownerId, {
            shareMode: 'real-time'
        });
        assert.equal(await syncSecurity.filterWsSyncEventForPrincipal({
            type: 'atome-sync', operation: 'delete', atome: { atome_id: atomeId, type: 'shape' }
        }, receiverId), null);
        assert.equal(await propertySecurity.projectEventForRead({
            id: 'gv_reconnect_delete_revoked', kind: 'delete', atome_id: atomeId,
            payload: { props: {}, delete_keys: [] }
        }, receiverId), null);
    } finally {
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The database adapter can already have removed the temporary file.
        }
        delete process.env.SQLITE_PATH;
    }
});
