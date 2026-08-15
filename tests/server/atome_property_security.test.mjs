import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('canonical commits and realtime projections enforce property ACL atomically', async () => {
    const dbPath = path.join(os.tmpdir(), `atome-property-security-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?property_security=${nonce}`);
    const commits = await import(`../../server/atomeRoutes.orm.js?property_security=${nonce}`);
    const syncSecurity = await import(`../../server/wsSyncSecurity.js?property_security=${nonce}`);
    const operations = await import(`../../server/wsAtomeOperations.js?property_security=${nonce}`);
    const realtimeOperation = await import(`../../server/wsAtomeRealtimeOperation.js?property_security=${nonce}`);
    const ownerId = 'property_owner';
    const memberId = 'property_member';
    const atomeId = 'property_document';

    try {
        await db.initDatabase();
        for (const id of [ownerId, memberId]) {
            await db.createAtome({ id, type: 'user', owner: id, creator: id, properties: { name: id } });
        }
        await db.createAtome({
            id: atomeId,
            type: 'document',
            owner: ownerId,
            creator: ownerId,
            properties: { content: 'allowed', secret: 'protected' }
        });
        await db.appendEvent({
            id: 'property_initial',
            kind: 'set',
            atome_id: atomeId,
            actor: { id: ownerId },
            payload: { props: { content: 'allowed', secret: 'protected' } }
        });
        await db.setPermission(atomeId, memberId, true, true, false, false, 'content', ownerId, {
            shareMode: 'real-time'
        });

        const realtimeAllowed = await realtimeOperation.handleWsAtomeRealtimeOperation({
            data: {
                type: 'atome', action: 'realtime', requestId: 'property_realtime_allowed',
                atome_id: atomeId, particles: { content: 'preview' }
            },
            connection: {},
            requesterId: memberId,
            requestId: 'property_realtime_allowed'
        });
        assert.equal(realtimeAllowed.success, true);
        const realtimeDenied = await realtimeOperation.handleWsAtomeRealtimeOperation({
            data: {
                type: 'atome', action: 'realtime', requestId: 'property_realtime_denied',
                atome_id: atomeId, particles: { secret: 'preview leak' }
            },
            connection: {},
            requesterId: memberId,
            requestId: 'property_realtime_denied'
        });
        assert.equal(realtimeDenied.success, false);
        assert.equal(realtimeDenied.error, 'property_write_denied');

        const denied = await commits.commitAtomeEvent({
            authenticatedUserId: memberId,
            event: {
                id: 'property_denied', kind: 'set', atome_id: atomeId,
                payload: { props: { secret: 'leaked' } }
            }
        });
        assert.equal(denied.ok, false);
        assert.equal(denied.error, 'property_write_denied');
        assert.deepEqual(denied.denied_keys, ['secret']);
        assert.equal((await db.getStateCurrent(atomeId)).properties.secret, 'protected');
        assert.equal(await db.getEvent('property_denied'), null);

        const mixed = await commits.commitAtomeEvent({
            authenticatedUserId: memberId,
            event: {
                id: 'property_mixed', kind: 'set', atome_id: atomeId,
                payload: { props: { content: 'changed', secret: 'leaked' } }
            }
        });
        assert.equal(mixed.ok, false);
        assert.equal((await db.getStateCurrent(atomeId)).properties.content, 'allowed');
        assert.equal(await db.getEvent('property_mixed'), null);

        const allowed = await commits.commitAtomeEvent({
            authenticatedUserId: memberId,
            event: {
                id: 'property_allowed', kind: 'set', atome_id: atomeId,
                payload: { props: { content: 'changed' } }
            }
        });
        assert.equal(allowed.ok, true);
        assert.equal((await db.getStateCurrent(atomeId)).properties.content, 'changed');

        const projected = await syncSecurity.filterWsSyncEventForPrincipal({
            type: 'atome-sync',
            operation: 'update',
            atome: {
                atome_id: atomeId,
                id: atomeId,
                type: 'document',
                properties: { content: 'changed', secret: 'protected' }
            }
        }, memberId);
        assert.equal(projected.eventType, 'atome:updated');
        assert.deepEqual(projected.payload.atome.properties, { content: 'changed' });

        const connection = { _wsApiUserId: memberId };
        const currentState = await operations.handleWsAtomeOperation({
            type: 'state-current', action: 'get', requestId: 'property_state', atome_id: atomeId
        }, connection);
        assert.equal(currentState.success, true);
        assert.deepEqual(currentState.state.properties, { content: 'changed' });
        assert.deepEqual(currentState.state.capabilities, {
            properties: {
                content: { write: true, delete: false, share: false }
            },
            create: false,
            delete: false,
            share: false
        });
        assert.equal(Object.hasOwn(currentState.state.capabilities.properties, 'secret'), false);
        const history = await operations.handleWsAtomeOperation({
            type: 'atome', action: 'history', requestId: 'property_history', atome_id: atomeId
        }, connection);
        assert.equal(history.success, true);
        assert.equal(history.events.some((event) => Object.hasOwn(event.payload?.props || {}, 'secret')), false);

        await db.setPermission(atomeId, memberId, false, false, false, false, 'content', ownerId, {
            shareMode: 'real-time'
        });
        assert.equal(await syncSecurity.filterWsSyncEventForPrincipal({
            type: 'atome-sync',
            operation: 'update',
            atome: { atome_id: atomeId, properties: { content: 'changed' } }
        }, memberId), null);

        await db.setPermission(atomeId, memberId, true, false, false, false, 'content', ownerId, {
            shareMode: 'manual'
        });
        assert.equal(await syncSecurity.filterWsSyncEventForPrincipal({
            type: 'atome-sync',
            operation: 'update',
            atome: { atome_id: atomeId, properties: { content: 'changed' } }
        }, memberId), null);
    } finally {
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The SQLite adapter can already have removed its temporary file.
        }
        delete process.env.SQLITE_PATH;
    }
});

test('permission conditions validate operation and property context and fail closed', async () => {
    const dbPath = path.join(os.tmpdir(), `atome-property-conditions-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?property_conditions=${Date.now()}`);
    const ownerId = 'condition_owner';
    const memberId = 'condition_member';
    const atomeId = 'condition_document';

    try {
        await db.initDatabase();
        for (const id of [ownerId, memberId]) {
            await db.createAtome({ id, type: 'user', owner: id, creator: id, properties: { name: id } });
        }
        await db.createAtome({ id: atomeId, type: 'document', owner: ownerId, creator: ownerId, properties: { content: 'text' } });
        await db.setPermission(atomeId, memberId, true, true, false, false, 'content', ownerId, {
            conditions: {
                schemaVersion: 1,
                root: {
                    combinator: 'and',
                    children: [
                        { source: 'operation', field: 'name', operator: 'eq', value: 'read' },
                        { source: 'property', field: 'key', operator: 'eq', value: 'content' }
                    ]
                }
            }
        });
        assert.equal(await db.canRead(atomeId, memberId, 'content'), true);
        assert.equal(await db.canWrite(atomeId, memberId, 'content'), false);
        await assert.rejects(
            db.setPermission(atomeId, memberId, true, false, false, false, 'secret', ownerId, {
                conditions: { schemaVersion: 1, root: { unsupported_rule: true } }
            }),
            /permission_conditions_invalid/
        );
        await db.setPermission(atomeId, memberId, true, false, false, false, 'content', ownerId, {
            conditions: {
                schemaVersion: 1,
                root: { source: 'actor', field: 'id', operator: 'eq', value: 'someone_else' }
            }
        });
        assert.equal(await db.canRead(atomeId, memberId, 'content'), false);
        await db.setPermission(atomeId, memberId, true, false, false, false, 'content', ownerId, { conditions: null });
        assert.equal(await db.canRead(atomeId, memberId, 'content'), true);
    } finally {
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The SQLite adapter can already have removed its temporary file.
        }
        delete process.env.SQLITE_PATH;
    }
});

test('dynamic permission conditions are re-evaluated for write, read, history and sync', async () => {
    const dbPath = path.join(os.tmpdir(), `atome-property-dynamic-conditions-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?property_dynamic_conditions=${nonce}`);
    const commits = await import(`../../server/atomeRoutes.orm.js?property_dynamic_conditions=${nonce}`);
    const operations = await import(`../../server/wsAtomeOperations.js?property_dynamic_conditions=${nonce}`);
    const propertySecurity = await import(`../../server/atomePropertySecurity.js?property_dynamic_conditions=${nonce}`);
    const syncSecurity = await import(`../../server/wsSyncSecurity.js?property_dynamic_conditions=${nonce}`);
    const ownerId = 'dynamic_condition_owner';
    const memberId = 'dynamic_condition_member';
    const atomeId = 'dynamic_condition_document';

    try {
        await db.initDatabase();
        await db.createAtome({
            id: ownerId,
            type: 'user',
            owner: ownerId,
            creator: ownerId,
            properties: { name: ownerId }
        });
        await db.createAtome({
            id: memberId,
            type: 'user',
            owner: memberId,
            creator: memberId,
            properties: { name: memberId, access_state: 'open' }
        });
        await db.createAtome({
            id: atomeId,
            type: 'document',
            owner: ownerId,
            creator: ownerId,
            properties: { content: 'initial', secret: 'protected' }
        });
        await db.appendEvent({
            id: 'dynamic_condition_initial',
            kind: 'set',
            atome_id: atomeId,
            actor: { id: ownerId },
            payload: { props: { content: 'initial', secret: 'protected' } }
        });
        await db.setPermission(atomeId, memberId, true, true, false, false, 'content', ownerId, {
            shareMode: 'real-time',
            conditions: {
                schemaVersion: 1,
                root: { source: 'user', field: 'access_state', operator: 'eq', value: 'open' }
            }
        });

        assert.equal(await db.canRead(atomeId, memberId, 'content'), true);
        assert.equal(await db.canWrite(atomeId, memberId, 'content'), true);
        assert.equal((await commits.commitAtomeEvent({
            authenticatedUserId: memberId,
            event: {
                id: 'dynamic_condition_allowed_write',
                kind: 'set',
                atome_id: atomeId,
                payload: { props: { content: 'allowed while open' } }
            }
        })).ok, true);

        assert.equal((await commits.commitAtomeEvent({
            authenticatedUserId: memberId,
            event: {
                id: 'dynamic_condition_close',
                kind: 'set',
                atome_id: memberId,
                payload: { props: { access_state: 'closed' } }
            }
        })).ok, true);

        assert.equal(await db.canRead(atomeId, memberId, 'content'), false);
        assert.equal(await db.canWrite(atomeId, memberId, 'content'), false);
        const deniedWrite = await commits.commitAtomeEvent({
            authenticatedUserId: memberId,
            event: {
                id: 'dynamic_condition_denied_write',
                kind: 'set',
                atome_id: atomeId,
                payload: { props: { content: 'must not persist' } }
            }
        });
        assert.equal(deniedWrite.ok, false);
        assert.equal(deniedWrite.error, 'property_write_denied');
        assert.equal(await db.getEvent('dynamic_condition_denied_write'), null);
        assert.deepEqual(await propertySecurity.projectAtomePropertiesForRead(
            atomeId,
            { content: 'allowed while open', secret: 'protected' },
            memberId
        ), {});
        const history = await operations.handleWsAtomeOperation({
            type: 'atome',
            action: 'history',
            requestId: 'dynamic_condition_history',
            atome_id: atomeId
        }, { _wsApiUserId: memberId });
        assert.equal(history.success, false);
        assert.equal(history.error, 'Access denied');
        assert.equal(Object.hasOwn(history, 'events'), false);
        assert.equal(await propertySecurity.projectEventForRead({
            id: 'dynamic_condition_delayed_event',
            kind: 'set',
            atome_id: atomeId,
            payload: { props: { content: 'delayed' } }
        }, memberId), null);
        assert.equal(await syncSecurity.filterWsSyncEventForPrincipal({
            type: 'atome-sync',
            operation: 'update',
            atome: { atome_id: atomeId, properties: { content: 'delayed' } }
        }, memberId), null);
    } finally {
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The SQLite adapter can already have removed its temporary file.
        }
        delete process.env.SQLITE_PATH;
    }
});

test('property sharing keeps global and exact ACL identities separate', async () => {
    const dbPath = path.join(os.tmpdir(), `atome-share-scope-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?share_scope=${nonce}`);
    const sharing = await import(`../../server/sharingPermissionService.js?share_scope=${nonce}`);
    const ownerId = 'share_owner';
    const memberId = 'share_member';
    const atomeId = 'share_document';

    try {
        await db.initDatabase();
        for (const id of [ownerId, memberId]) {
            await db.createAtome({ id, type: 'user', owner: id, creator: id, properties: { name: id } });
        }
        await db.createAtome({ id: atomeId, type: 'document', owner: ownerId, creator: ownerId, properties: { content: 'text', color: 'red' } });
        const globalGrant = await sharing.createShare(ownerId, atomeId, memberId, sharing.PERMISSION.READ);
        const propertyGrant = await sharing.createShare(ownerId, atomeId, memberId, sharing.PERMISSION.WRITE, { particleKey: 'color' });
        assert.equal(globalGrant.success, true);
        assert.equal(propertyGrant.success, true);

        const rows = await db.default.query('all', `
            SELECT permission_id, particle_key, can_read, can_write
            FROM permissions
            WHERE atome_id = ? AND principal_id = ?
            ORDER BY permission_id ASC
        `, [atomeId, memberId]);
        assert.equal(rows.length, 2);
        assert.deepEqual(rows.map((row) => row.particle_key), [null, 'color']);
        assert.deepEqual(rows.map((row) => row.can_write), [0, 1]);

        assert.equal((await sharing.revokeShare(ownerId, propertyGrant.data.permission_id)).success, true);
        const remaining = await db.default.query('all', 'SELECT particle_key, can_read, can_write FROM permissions WHERE atome_id = ? AND principal_id = ?', [atomeId, memberId]);
        assert.deepEqual(remaining, [{ particle_key: null, can_read: 1, can_write: 0 }]);
    } finally {
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The SQLite adapter can already have removed its temporary file.
        }
        delete process.env.SQLITE_PATH;
    }
});

test('canonical batch creation authorizes a new child under a new parent atomically', async () => {
    const dbPath = path.join(os.tmpdir(), `atome-batch-create-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?batch_create=${nonce}`);
    const commits = await import(`../../server/atomeRoutes.orm.js?batch_create=${nonce}`);
    const ownerId = 'batch_owner';

    try {
        await db.initDatabase();
        await db.createAtome({ id: ownerId, type: 'user', owner: ownerId, creator: ownerId, properties: { name: ownerId } });
        const result = await commits.commitAtomeEvents({
            authenticatedUserId: ownerId,
            events: [
                {
                    id: 'batch_parent_create',
                    kind: 'set',
                    atome_id: 'batch_parent',
                    payload: { props: { type: 'project', owner_id: ownerId, title: 'Project' } }
                },
                {
                    id: 'batch_child_create',
                    kind: 'set',
                    atome_id: 'batch_child',
                    payload: { props: { type: 'shape', owner_id: ownerId, parent_id: 'batch_parent', color: 'blue' } }
                }
            ]
        });
        assert.equal(result.ok, true);
        assert.equal((await db.getStateCurrent('batch_child')).properties.color, 'blue');
    } finally {
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The SQLite adapter can already have removed its temporary file.
        }
        delete process.env.SQLITE_PATH;
    }
});

test('an editable existing parent is not treated as a new batch parent', async () => {
    const dbPath = path.join(os.tmpdir(), `atome-batch-parent-scope-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?batch_parent_scope=${nonce}`);
    const commits = await import(`../../server/atomeRoutes.orm.js?batch_parent_scope=${nonce}`);
    const ownerId = 'batch_parent_owner';
    const memberId = 'batch_parent_member';
    const parentId = 'batch_existing_parent';

    try {
        await db.initDatabase();
        for (const id of [ownerId, memberId]) {
            await db.createAtome({ id, type: 'user', owner: id, creator: id, properties: { name: id } });
        }
        await db.createAtome({ id: parentId, type: 'project', owner: ownerId, creator: ownerId, properties: { title: 'Project' } });
        await db.setPermission(parentId, memberId, true, true, false, false, 'title', ownerId);
        const result = await commits.commitAtomeEvents({
            authenticatedUserId: memberId,
            events: [
                {
                    id: 'batch_existing_parent_edit',
                    kind: 'set',
                    atome_id: parentId,
                    payload: { props: { title: 'Edited' } }
                },
                {
                    id: 'batch_unauthorized_child',
                    kind: 'set',
                    atome_id: 'batch_unauthorized_child_atome',
                    payload: { props: { type: 'shape', owner_id: memberId, parent_id: parentId, color: 'red' } }
                }
            ]
        });
        assert.equal(result.ok, false);
        assert.equal(result.error, 'parent_create_denied');
        assert.equal((await db.getStateCurrent(parentId)).properties.title, 'Project');
        assert.equal(await db.getEvent('batch_existing_parent_edit'), null);
        assert.equal(await db.getEvent('batch_unauthorized_child'), null);
    } finally {
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The SQLite adapter can already have removed its temporary file.
        }
        delete process.env.SQLITE_PATH;
    }
});
