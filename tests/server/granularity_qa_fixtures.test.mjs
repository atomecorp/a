import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fastify from 'fastify';
import {
    buildGranularityQaEvents,
    provisionGranularityQaFixture
} from '../fixtures/granularity/canonical_qa_fixtures.mjs';

test('granularity QA fixtures use isolated accounts and canonical commits', async () => {
    const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'granularity-qa-'));
    process.env.SQLITE_PATH = path.join(tempDirectory, 'adole.db');
    process.env.JWT_SECRET = 'granularity_qa_jwt_secret_1234567890';
    process.env.COOKIE_SECRET = 'granularity_qa_cookie_secret_123456';
    process.env.SQUIRREL_SYNC_REMOTE = '0';
    const db = await import(`../../database/adole.js?granularity_qa=${Date.now()}`);
    const app = fastify();

    try {
        await db.initDatabase();
        const { registerAuthRoutes } = await import('../../server/auth.js');
        const { commitAtomeEvents } = await import('../../server/atomeRoutes.orm.js');
        const { createShare, parsePermission } = await import('../../server/sharingPermissionService.js');
        await registerAuthRoutes(app, db.getDataSourceAdapter(), {
            jwtSecret: process.env.JWT_SECRET,
            cookieSecret: process.env.COOKIE_SECRET,
            isProduction: false
        });

        const runId = `${process.pid}_${Date.now()}`;
        const fixture = await provisionGranularityQaFixture({
            runId,
            registerAccount: async ({ role }) => {
                const phoneSuffix = role === 'owner' ? '01' : '02';
                const response = await app.inject({
                    method: 'POST',
                    url: '/api/auth/register',
                    payload: {
                        username: `Granularity QA ${role}`,
                        phone: `+339${String(Date.now()).slice(-8)}${phoneSuffix}`,
                        password: 'granularity-qa-password',
                        access: 'private'
                    }
                });
                assert.equal(response.statusCode, 200);
                const body = response.json();
                assert.equal(body.success, true);
                return { id: body.principalId };
            },
            commitBatch: commitAtomeEvents,
            createPropertyShare: ({
                grantorId, atomeId, principalId, particleKey, permission, shareMode
            }) => createShare(
                grantorId,
                atomeId,
                principalId,
                parsePermission(permission),
                { particleKey, shareMode }
            )
        });

        assert.notEqual(fixture.accounts.ownerId, fixture.accounts.receiverId);
        assert.deepEqual(fixture.shares.map((entry) => entry.particleKey), ['left', 'top']);
        const ownerProject = await db.getAtome(fixture.ids.ownerProjectId);
        const receiverProject = await db.getAtome(fixture.ids.receiverProjectId);
        const shape = await db.getStateCurrent(fixture.ids.shapeId);
        const text = await db.getStateCurrent(fixture.ids.textId);
        const image = await db.getStateCurrent(fixture.ids.imageId);
        const video = await db.getStateCurrent(fixture.ids.videoId);
        const custom = await db.getStateCurrent(fixture.ids.customId);
        assert.equal(ownerProject.type, 'project');
        assert.equal(receiverProject.type, 'project');
        assert.equal(shape.properties.color, '#2255aa');
        assert.equal(text.properties.font_size, 24);
        assert.equal(image.properties.fixture_state, 'awaiting-real-file');
        assert.equal(video.properties.fixture_state, 'awaiting-real-five-second-capture');
        assert.deepEqual(custom.properties.qa_complex_property, {
            order: ['alpha', 'beta'], enabled: true
        });
        assert.equal(await db.canWrite(fixture.ids.shapeId, fixture.accounts.receiverId, 'left'), true);
        assert.equal(await db.canWrite(fixture.ids.shapeId, fixture.accounts.receiverId, 'top'), true);
        assert.equal(await db.canWrite(fixture.ids.shapeId, fixture.accounts.receiverId, 'color'), false);

        const rebuilt = buildGranularityQaEvents({
            runId,
            ownerId: fixture.accounts.ownerId,
            receiverId: fixture.accounts.receiverId
        });
        assert.deepEqual(rebuilt.ids, fixture.ids);
    } finally {
        await app.close();
        await db.closeDatabase().catch(() => {});
        delete process.env.SQLITE_PATH;
        delete process.env.JWT_SECRET;
        delete process.env.COOKIE_SECRET;
        delete process.env.SQUIRREL_SYNC_REMOTE;
        rmSync(tempDirectory, { recursive: true, force: true });
    }
});
