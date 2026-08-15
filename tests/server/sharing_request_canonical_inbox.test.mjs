import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('share request persists a canonical recipient-owned inbox atome', async () => {
    const dbPath = path.join(os.tmpdir(), `sharing-inbox-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?sharing_inbox=${nonce}`);
    const { commitAtomeEvent } = await import(`../../server/atomeRoutes.orm.js?sharing_inbox=${nonce}`);
    const { handleShareMessage } = await import(`../../server/sharing_message_api.js?sharing_inbox=${nonce}`);
    const sharerId = 'gv_share_inbox_owner';
    const targetId = 'gv_share_inbox_target';
    const projectId = 'gv_share_inbox_project';
    const targetProjectId = 'gv_share_inbox_target_project';
    const sourceId = 'gv_share_inbox_source';

    try {
        await db.initDatabase();
        for (const userId of [sharerId, targetId]) {
            await db.createAtome({
                id: userId,
                type: 'user',
                owner: userId,
                creator: userId,
                properties: { visibility: 'public' }
            });
        }
        const project = await commitAtomeEvent({
            authenticatedUserId: sharerId,
            event: {
                id: 'gv_share_inbox_project_create',
                kind: 'set',
                atome_id: projectId,
                payload: { props: { type: 'project', owner_id: sharerId } }
            }
        });
        assert.equal(project.ok, true);
        const targetProject = await commitAtomeEvent({
            authenticatedUserId: targetId,
            event: {
                id: 'gv_share_inbox_target_project_create',
                kind: 'set',
                atome_id: targetProjectId,
                payload: { props: { type: 'project', owner_id: targetId } }
            }
        });
        assert.equal(targetProject.ok, true);
        const source = await commitAtomeEvent({
            authenticatedUserId: sharerId,
            event: {
                id: 'gv_share_inbox_source_create',
                kind: 'set',
                atome_id: sourceId,
                project_id: projectId,
                payload: {
                    props: {
                        type: 'shape', owner_id: sharerId, parent_id: projectId,
                        project_id: projectId, left: 10
                    }
                }
            }
        });
        assert.equal(source.ok, true);

        const requested = await handleShareMessage({
            action: 'request',
            target_user_id: targetId,
            atome_ids: [sourceId],
            permissions: { read: true, write: true },
            mode: 'real-time',
            share_type: 'linked'
        }, sharerId);
        assert.equal(requested.success, true);

        const inbox = await handleShareMessage({ action: 'inbox', box: 'inbox' }, targetId);
        assert.equal(inbox.success, true);
        assert.equal(inbox.data.length, 1);
        const requestAtome = inbox.data[0];
        assert.equal(requestAtome.atome_type || requestAtome.type, 'share_request');
        assert.equal(requestAtome.owner_id || requestAtome.meta?.owner_id, targetId);
        assert.equal(requestAtome.properties?.box, 'inbox');
        assert.equal(requestAtome.properties?.sharer_id, sharerId);
        assert.equal(requestAtome.properties?.source_project_id, projectId);

        const accepted = await handleShareMessage({
            action: 'respond',
            request_atome_id: requested.data.inboxId,
            receiver_project_id: targetProjectId,
            status: 'accepted'
        }, targetId);
        assert.equal(accepted.success, true);
        assert.equal(await db.canRead(sourceId, targetId), true);
        assert.equal(await db.canWrite(sourceId, targetId), true);
        const acceptedInbox = await db.getAtome(requested.data.inboxId);
        const acceptedOutbox = await db.getAtome(requested.data.outboxId);
        assert.equal(acceptedInbox.properties?.status, 'active');
        assert.equal(acceptedOutbox.properties?.status, 'active');
        assert.equal(acceptedInbox.properties?.receiver_project_id, targetProjectId);
    } finally {
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The database adapter may already have removed the isolated test file.
        }
        delete process.env.SQLITE_PATH;
    }
});
