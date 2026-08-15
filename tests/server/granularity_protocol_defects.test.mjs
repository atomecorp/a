import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const recordingConnection = () => ({
    messages: [],
    send(raw) {
        this.messages.push(JSON.parse(raw));
    }
});

const sharedParticles = (connection) => connection.messages.flatMap((message) => {
    if (message?.type !== 'console-message' || typeof message.message !== 'string') return [];
    const command = JSON.parse(message.message);
    return command?.params?.particles ? [command.params.particles] : [];
});

test('realtime protocol excludes the sender connection and authorizes every property', async () => {
    const dbPath = path.join(os.tmpdir(), `granularity-protocol-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const nonce = Date.now();
    const db = await import(`../../database/adole.js?granularity_protocol=${nonce}`);
    const realtime = await import(`../../server/atomeRealtime.js?granularity_protocol=${nonce}`);
    const operations = await import(`../../server/wsAtomeOperations.js?granularity_protocol=${nonce}`);
    const wsState = await import('../../server/wsApiState.js');
    const ownerId = 'gv_protocol_owner';
    const actorId = 'gv_protocol_actor';
    const readerId = 'gv_protocol_reader';
    const atomeId = 'gv_protocol_shape';
    const sender = recordingConnection();
    const ownerSecondSession = recordingConnection();
    const reader = recordingConnection();

    try {
        await db.initDatabase();
        for (const id of [ownerId, actorId, readerId]) {
            await db.createAtome({ id, type: 'user', owner: id, creator: id, properties: { name: id } });
        }
        await db.createAtome({
            id: atomeId,
            type: 'shape',
            owner: ownerId,
            creator: ownerId,
            properties: { left: 10, top: 20, color: 'blue', secret: 'protected' }
        });
        await db.setPermission(atomeId, actorId, true, true, false, false, null, ownerId, {
            shareMode: 'real-time'
        });
        await db.setPermission(atomeId, actorId, false, false, false, false, 'secret', ownerId, {
            shareMode: 'real-time'
        });
        await db.setPermission(atomeId, readerId, false, false, false, false, 'secret', ownerId, {
            shareMode: 'real-time'
        });
        await db.setPermission(atomeId, readerId, true, false, false, false, 'left', ownerId, {
            shareMode: 'real-time'
        });

        wsState.attachWsApiClientToUser(sender, ownerId);
        wsState.attachWsApiClientToUser(ownerSecondSession, ownerId);
        wsState.attachWsApiClientToUser(reader, readerId);

        await realtime.broadcastAtomeCreate({
            atomeId,
            atomeType: 'shape',
            parentId: null,
            particles: { left: 10, top: 20 },
            senderUserId: ownerId,
            senderConnection: sender
        });
        const createSenderEchoes = sender.messages.length;
        const createOtherSessionMessages = ownerSecondSession.messages.length;

        sender.messages.length = 0;
        ownerSecondSession.messages.length = 0;
        await realtime.broadcastAtomeRealtimePatch({
            atomeId,
            particles: { left: 12 },
            senderUserId: ownerId,
            senderConnection: sender
        });
        const updateSenderEchoes = sender.messages.length;
        const updateOtherSessionMessages = ownerSecondSession.messages.length;

        sender.messages.length = 0;
        ownerSecondSession.messages.length = 0;
        await realtime.broadcastAtomeDelete({ atomeId, senderUserId: ownerId, senderConnection: sender });
        const deleteSenderEchoes = sender.messages.length;
        const deleteOtherSessionMessages = ownerSecondSession.messages.length;

        assert.equal(await db.canWrite(atomeId, actorId), true, 'legacy coarse authorization accepts the patch');
        reader.messages.length = 0;
        await realtime.broadcastAtomeRealtimePatch({
            atomeId,
            particles: { secret: 'leaked' },
            senderUserId: actorId,
            senderConnection: recordingConnection()
        });
        const deniedPropertyLeaked = sharedParticles(reader)
            .some((particles) => Object.hasOwn(particles, 'secret'));

        sender.messages.length = 0;
        ownerSecondSession.messages.length = 0;
        reader.messages.length = 0;
        const durableRequest = {
            type: 'events',
            action: 'commit',
            requestId: 'gv_protocol_durable_commit',
            event: {
                id: 'gv_protocol_durable_event',
                kind: 'set',
                atome_id: atomeId,
                payload: { props: { left: 13, secret: 'still-protected' } }
            }
        };
        const durableResponse = await operations.handleWsAtomeOperation(durableRequest, sender);
        const readerDurableCommands = reader.messages.map((message) => JSON.parse(message.message));
        const durableProjection = readerDurableCommands[0]?.params || null;
        const durableSenderEchoes = sender.messages.length;
        const durableOtherSessionMessages = ownerSecondSession.messages.length;
        const durableReaderMessages = reader.messages.length;
        await operations.handleWsAtomeOperation(durableRequest, {
            ...recordingConnection(),
            _wsApiUserId: ownerId
        });
        const duplicateReaderMessages = reader.messages.length;

        assert.deepEqual({
            createSenderEchoes,
            createOtherSessionMessages,
            updateSenderEchoes,
            updateOtherSessionMessages,
            deleteSenderEchoes,
            deleteOtherSessionMessages,
            deniedPropertyLeaked,
            durableSuccess: durableResponse.success,
            durableSenderEchoes,
            durableOtherSessionMessages,
            durableReaderMessages,
            durableProjection: durableProjection && {
                particles: durableProjection.particles,
                durable: durableProjection.durable,
                event_id: durableProjection.event_id
            },
            duplicateReaderMessages
        }, {
            createSenderEchoes: 0,
            createOtherSessionMessages: 1,
            updateSenderEchoes: 0,
            updateOtherSessionMessages: 1,
            deleteSenderEchoes: 0,
            deleteOtherSessionMessages: 1,
            deniedPropertyLeaked: false,
            durableSuccess: true,
            durableSenderEchoes: 0,
            durableOtherSessionMessages: 1,
            durableReaderMessages: 1,
            durableProjection: {
                particles: { left: 13 },
                durable: true,
                event_id: 'gv_protocol_durable_event'
            },
            duplicateReaderMessages: 1
        });
    } finally {
        wsState.detachWsApiClient(sender);
        wsState.detachWsApiClient(ownerSecondSession);
        wsState.detachWsApiClient(reader);
        await db.closeDatabase().catch(() => {});
        try {
            fs.unlinkSync(dbPath);
        } catch {
            // The database adapter can already have removed the temporary file.
        }
        delete process.env.SQLITE_PATH;
    }
});
