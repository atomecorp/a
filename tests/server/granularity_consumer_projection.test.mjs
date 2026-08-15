import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('search, export, custom and collection consumers preserve exact property scope', async () => {
    const dbPath = path.join(os.tmpdir(), `granularity-consumers-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    process.env.SQUIRREL_SYNC_REMOTE = '0';
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?granularity_consumers=${nonce}`);
    const commits = await import(`../../server/atomeRoutes.orm.js?granularity_consumers=${nonce}`);
    const operations = await import(`../../server/wsAtomeOperations.js?granularity_consumers=${nonce}`);
    const sharing = await import(`../../server/sharingPermissionService.js?granularity_consumers=${nonce}`);
    const ownerId = 'gv_consumers_owner';
    const receiverId = 'gv_consumers_receiver';
    const atomeId = 'gv_consumers_shape';
    const receiverConnection = { _wsApiUserId: receiverId };

    try {
        await db.initDatabase();
        for (const id of [ownerId, receiverId]) {
            await db.createAtome({ id, type: 'user', owner: id, creator: id, properties: { name: id } });
        }
        const created = await commits.commitAtomeEvent({
            authenticatedUserId: ownerId,
            event: {
                id: 'gv_consumers_create', kind: 'set', tx_id: 'gv_consumers_create_tx',
                atome_id: atomeId,
                payload: { props: {
                    type: 'shape', owner_id: ownerId,
                    public_label: 'visible needle',
                    secret_note: 'forbidden needle',
                    custom_metric: { score: 7, unit: 'px' },
                    collection: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }]
                } }
            }
        });
        assert.equal(created.ok, true);
        for (const [key, writable] of [
            ['public_label', false],
            ['custom_metric', true],
            ['collection', true]
        ]) {
            await db.setPermission(atomeId, receiverId, true, writable, false, false, key, ownerId, {
                shareMode: key === 'public_label' ? 'manual' : 'real-time'
            });
        }

        const stateList = await operations.handleWsAtomeOperation({
            type: 'state-current', action: 'list', requestId: 'gv_consumer_list',
            include_shared: true, include_total: true
        }, receiverConnection);
        const sharedStates = stateList.states.filter((state) => (state.atome_id || state.id) === atomeId);
        assert.equal(sharedStates.length, 1, JSON.stringify(stateList));
        assert.equal(stateList.total, stateList.states.length);
        assert.deepEqual(sharedStates[0].properties, {
            public_label: 'visible needle',
            custom_metric: { score: 7, unit: 'px' },
            collection: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }]
        });

        const exported = await operations.handleWsAtomeOperation({
            type: 'user-data', action: 'export', requestId: 'gv_consumer_export'
        }, receiverConnection);
        assert.equal(exported.success, true);
        assert.equal(exported.atomes.filter((state) => (state.atome_id || state.id) === atomeId).length, 1);
        const serializedExport = JSON.stringify(exported);
        assert.equal(serializedExport.includes('secret_note'), false);
        assert.equal(serializedExport.includes('forbidden needle'), false);
        assert.equal(serializedExport.includes('before_missing'), false);
        assert.equal(serializedExport.includes('base_versions'), false);

        const discovery = await operations.handleWsAtomeOperation({
            type: 'conditions', action: 'properties-discover', requestId: 'gv_consumer_discovery',
            search: 'needle', scope: { includeShared: true }
        }, receiverConnection);
        assert.equal(discovery.success, true);
        assert.equal(JSON.stringify(discovery).includes('forbidden'), false);
        assert.equal(JSON.stringify(discovery).includes('secret_note'), false);
        const deniedSearch = await operations.handleWsAtomeOperation({
            type: 'conditions', action: 'once', requestId: 'gv_consumer_denied_search',
            scope: { includeShared: true, candidateSource: 'atome' },
            conditionSet: {
                schemaVersion: 1,
                root: { source: 'atome', field: 'secret_note', operator: 'contains', value: 'forbidden' }
            },
            projection: ['secret_note']
        }, receiverConnection);
        assert.equal(deniedSearch.success, true);
        assert.equal(deniedSearch.total, 0);
        assert.deepEqual(deniedSearch.items, []);
        const allowedSearch = await operations.handleWsAtomeOperation({
            type: 'conditions', action: 'once', requestId: 'gv_consumer_allowed_search',
            scope: { includeShared: true, candidateSource: 'atome' },
            conditionSet: {
                schemaVersion: 1,
                root: { source: 'atome', field: 'public_label', operator: 'contains', value: 'visible' }
            },
            projection: ['public_label']
        }, receiverConnection);
        assert.equal(allowedSearch.success, true);
        assert.equal(allowedSearch.total, 1);
        assert.deepEqual(allowedSearch.items[0].properties, { public_label: 'visible needle' });

        const customVersion = sharedStates[0].property_versions.custom_metric;
        const deletedCustom = await commits.commitAtomeEvent({
            authenticatedUserId: receiverId,
            event: {
                id: 'gv_custom_delete', kind: 'set', tx_id: 'gv_custom_delete_tx', atome_id: atomeId,
                payload: { props: {}, delete_keys: ['custom_metric'], expected_versions: { custom_metric: customVersion } }
            }
        });
        assert.equal(deletedCustom.ok, true);
        assert.equal(await db.getParticle(atomeId, 'custom_metric'), null);
        const restoredCustom = await operations.handleWsAtomeOperation({
            type: 'history', action: 'undo', requestId: 'gv_custom_restore',
            source_tx_id: 'gv_custom_delete_tx'
        }, receiverConnection);
        assert.equal(restoredCustom.success, true);
        assert.deepEqual(await db.getParticle(atomeId, 'custom_metric'), { score: 7, unit: 'px' });

        const collectionVersion = (await db.default.query(
            'get', 'SELECT version FROM particles WHERE atome_id = ? AND particle_key = ?', [atomeId, 'collection']
        )).version;
        const collectionUpdate = await commits.commitAtomeEvent({
            authenticatedUserId: receiverId,
            event: {
                id: 'gv_collection_update', kind: 'set', atome_id: atomeId,
                payload: {
                    props: { collection: [{ id: 'a', value: 3 }] },
                    expected_versions: { collection: collectionVersion }
                }
            }
        });
        assert.equal(collectionUpdate.ok, true);
        assert.deepEqual(await db.getParticle(atomeId, 'collection'), [{ id: 'a', value: 3 }]);
        const nestedWrite = await commits.commitAtomeEvent({
            authenticatedUserId: receiverId,
            event: {
                id: 'gv_collection_nested_write', kind: 'set', atome_id: atomeId,
                payload: { props: { 'collection.0.value': 99 } }
            }
        });
        assert.equal(nestedWrite.ok, false);
        assert.equal(nestedWrite.error, 'property_write_denied');

        const accessible = await sharing.getAccessibleAtomes(receiverId);
        assert.equal(accessible.some((atome) => atome.atome_id === atomeId), true);
    } finally {
        await db.closeDatabase().catch(() => {});
        delete process.env.SQLITE_PATH;
        delete process.env.SQUIRREL_SYNC_REMOTE;
        try { fs.unlinkSync(dbPath); } catch { /* Database cleanup can already have removed it. */ }
    }
});
