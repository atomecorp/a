import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('linked realtime, manual linked and detached sharing remain distinct', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atome-sync-sharing-'));
    const socketRoot = path.join('/tmp', `atome-sync-sharing-${process.pid}-${Date.now()}`);
    process.env.SQLITE_PATH = path.join(root, 'orchestrator.db');
    const db = await import(`../../database/adole.js?sharing=${Date.now()}`);
    const { createUserVaultRouter } = await import(`../../server/userVaultRouter.js?sharing=${Date.now()}`);
    const { createSyncSharingService } = await import(`../../server/syncSharingService.js?sharing=${Date.now()}`);
    const router = createUserVaultRouter({ root: path.join(root, 'vaults'), socketRoot });
    const replayed = [];
    const granted = [];
    const revoked = [];
    const service = createSyncSharingService({
        vaultRouter: router,
        syncRuntime: {
            replayPrincipalStream: async (principal, stream) => { replayed.push({ principal, stream }); },
            grantStream: async (principal, stream) => { granted.push({ principal, stream }); },
            revokeStream: (principal, stream) => { revoked.push({ principal, stream }); }
        },
        isProvisioned: async () => true
    });
    const owner = 'share-owner';
    const recipient = 'share-recipient';
    const commit = (principal, atomeId, id, props, source = 'owner-device') => router.commit(principal, {
        id, kind: 'set', atome_id: atomeId,
        actor: { type: 'user', id: principal }, payload: { props }
    }, { source });
    try {
        await db.initDatabase();
        await Promise.all([router.provision(owner), router.provision(recipient)]);

        const linkedId = 'linked-shape';
        const initial = await commit(owner, linkedId, 'linked-1', { left: 1, secret: 'hidden' });
        const linked = await service.request(owner, {
            action: 'create', principal_id: recipient, atome_id: linkedId,
            share_type: 'linked', mode: 'real-time',
            permission: { read: true, alter: true }, allowed_properties: ['left']
        }, { direct: true });
        assert.equal(linked.requests[0].status, 'active');
        assert.equal(linked.requests[0].stream_id, initial.event.stream_id);
        assert.deepEqual(granted[0], { principal: recipient, stream: initial.event.stream_id });
        const replay = await router.listStreamEvents(recipient, initial.event.stream_id, { cursor: 0 });
        assert.deepEqual(replay[0].payload.props, { left: 1 });
        assert.deepEqual(replay[0].projection.properties, { left: 1 });

        const recipientWrite = await commit(recipient, linkedId, 'linked-2', { left: 8 }, 'recipient-device');
        assert.equal(recipientWrite.vaultPrincipalId, owner);
        assert.equal((await router.getState(owner, linkedId)).properties.left, 8);
        await assert.rejects(
            commit(recipient, linkedId, 'linked-denied', { secret: 'leak' }, 'recipient-device'),
            /property_write_denied/
        );

        const manualId = 'manual-shape';
        const manualInitial = await commit(owner, manualId, 'manual-1', { top: 2 });
        const manual = await service.request(owner, {
            principal_id: recipient, atome_id: manualId, share_type: 'linked', mode: 'manual',
            permission: { read: true }, allowed_properties: ['top']
        }, { direct: true });
        assert.equal(manual.requests[0].share_type, 'linked');
        assert.equal(manual.requests[0].share_mode, 'manual');
        assert.deepEqual(await router.listStreamEvents(recipient, manualInitial.event.stream_id, { cursor: 0 }), []);
        const publication = await service.publish(owner, { share_id: manual.requests[0].share_id });
        assert.equal(publication.publication_cursor, 1);
        assert.equal((await router.listStreamEvents(recipient, manualInitial.event.stream_id, { cursor: 0 })).length, 1);
        assert.deepEqual(replayed, [{ principal: recipient, stream: manualInitial.event.stream_id }]);

        const detachedSourceId = 'detached-source';
        await commit(owner, detachedSourceId, 'detached-1', { color: 'red' });
        const detached = await service.request(owner, {
            principal_id: recipient, atome_id: detachedSourceId, share_type: 'detached', mode: 'real-time',
            permission: { read: true }
        }, { direct: true });
        const detachedRow = detached.requests[0];
        assert.equal(detachedRow.status, 'accepted');
        assert.ok(detachedRow.detached_atome_id);
        assert.equal(detached.streams.length, 0);
        const copyBefore = await router.getState(recipient, detachedRow.detached_atome_id);
        await commit(owner, detachedSourceId, 'detached-2', { color: 'blue' });
        const copyAfter = await router.getState(recipient, detachedRow.detached_atome_id);
        assert.equal(copyBefore.properties.color, 'red');
        assert.equal(copyAfter.properties.color, 'red');

        const policyAtome = async (name) => {
            await commit(owner, name, `${name}-event`, { opacity: 0.5 });
            return name;
        };
        await service.setPolicy(recipient, owner, 'always', { read: true, alter: false });
        const alwaysId = await policyAtome('policy-always');
        const always = await service.request(owner, {
            target_user_id: recipient, atome_id: alwaysId, share_type: 'linked',
            permissions: { read: true, alter: true }
        });
        assert.equal(always.requests[0].status, 'active');
        assert.equal(always.requests[0].permissions.can_read, true);
        assert.equal(always.requests[0].permissions.can_write, false);
        await assert.rejects(
            commit(recipient, alwaysId, 'policy-always-denied-write', { opacity: 0.8 }, 'recipient-device'),
            /property_write_denied/
        );

        await service.setPolicy(recipient, owner, 'never');
        const neverId = await policyAtome('policy-never');
        const never = await service.request(owner, {
            target_user_id: recipient, atome_id: neverId, permissions: { read: true }
        });
        assert.equal(never.requests[0].status, 'rejected');

        await service.setPolicy(recipient, owner, 'one-shot');
        const oneShotId = await policyAtome('policy-one-shot');
        const oneShot = await service.request(owner, {
            target_user_id: recipient, atome_id: oneShotId, permissions: { read: true }
        });
        assert.equal(oneShot.requests[0].status, 'pending');
        const accepted = await service.respond(recipient, {
            share_id: oneShot.requests[0].share_id, status: 'accepted'
        });
        assert.equal(accepted.request.status, 'active');

        await service.setPolicy(recipient, owner, 'block');
        const blockedId = await policyAtome('policy-blocked');
        await assert.rejects(
            service.request(owner, {
                target_user_id: recipient, atome_id: blockedId, permissions: { read: true }
            }),
            /blocked/
        );

        await service.revoke(owner, { share_id: linked.requests[0].share_id });
        assert.equal(await router.streamAccess(recipient, initial.event.stream_id), null);
        assert.deepEqual(revoked, [{ principal: recipient, stream: initial.event.stream_id }]);
    } finally {
        await router.stopAll();
        await db.closeDatabase().catch(() => {});
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(socketRoot, { recursive: true, force: true });
        delete process.env.SQLITE_PATH;
    }
});
