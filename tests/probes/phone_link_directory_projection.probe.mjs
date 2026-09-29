import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';

// The public directory is a projection of the user profile, rebuilt at boot by
// `DirectoryPublicService.rebuild()`. Account creation, profile edits and account
// deletion happen outside the client commit pipeline, so this probe locks the
// contract that each of those writers refreshes its own projection: without it a
// user created during a session stayed invisible in Communication until the next
// server start.
test('phone-link account writes refresh their directory projection without a restart', async () => {
    const databasePath = path.join(os.tmpdir(), `phone-directory-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = databasePath;
    const db = await import('../../database/adole.js');
    const { createDirectoryPublicService } = await import('../../server/directoryPublicService.js');
    const { createWsPhoneLinkHandler } = await import('../../server/wsPhoneLinkAuth.js');
    const { publicDeviceKey, randomHandle } = await import('../../server/auth_link_security.js');
    const { authSigningMessage, parseAuthLink } = await import('../../atome/src/shared/auth_link_contract.js');
    await db.initDatabase();

    const secret = 'probe-only-secret-material'.repeat(3);
    const published = [];
    const directoryService = createDirectoryPublicService({
        syncRuntime: { publishDirectory: async (event) => published.push(event) },
        vaultRouter: null
    });
    const links = [];
    const { handle, service } = createWsPhoneLinkHandler({
        projectRoot: path.join(os.tmpdir()),
        jwtSecret: () => secret,
        sendLink: async (phone, link) => { links.push({ phone, link }); return { accepted: true }; }
    });
    const connection = { _wsApiDirectoryService: directoryService };
    const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const device = publicDeviceKey(keys.publicKey.export({ format: 'jwk' }));
    const phone = '+33612349876';
    const sign = (challenge) => ({
        challengeId: challenge.challenge,
        signature: crypto.sign('sha256', Buffer.from(authSigningMessage(challenge)), {
            key: keys.privateKey, dsaEncoding: 'ieee-p1363'
        }).toString('base64url')
    });

    try {
        const started = await handle({
            type: 'auth', action: 'phone-link-start', requestId: 'start',
            phone, publicKey: device.jwk, clientNonce: randomHandle()
        }, connection, '192.0.2.1');
        assert.equal(started.ok, true, JSON.stringify(started));

        const challenge = await service.getChallenge(
            { attemptId: started.attemptId, keyId: device.keyId, purpose: 'consume' }, '192.0.2.1'
        );
        const consumed = await handle({
            type: 'auth', action: 'phone-link-consume', requestId: 'consume',
            attemptId: started.attemptId, token: parseAuthLink(links.at(-1).link).token,
            ...sign(challenge.challenge)
        }, connection, '192.0.2.1');
        assert.equal(consumed.ok, true, JSON.stringify(consumed));
        const principalId = consumed.user.id;
        const claims = jwt.verify(consumed.token, secret, { algorithms: ['HS256'] });
        connection._wsApiDeviceClaims = claims;

        // A freshly created account is private, so the projection stays empty —
        // and then the profile becomes public through the same handler.
        assert.deepEqual(await directoryService.list(), []);
        const named = await handle({
            type: 'auth', action: 'update-user', requestId: 'name', userId: principalId, key: 'name', value: 'Nouvelle'
        }, connection, '192.0.2.1');
        assert.equal(named.ok, true, JSON.stringify(named));
        const opened = await handle({
            type: 'auth', action: 'update-user', requestId: 'access', userId: principalId, key: 'access', value: 'public'
        }, connection, '192.0.2.1');
        assert.equal(opened.ok, true, JSON.stringify(opened));

        const entries = await directoryService.list({ requesterId: 'other-principal' });
        assert.deepEqual(entries.map((entry) => [entry.principal_id, entry.display_name]),
            [[principalId, 'Nouvelle']],
            'the new user must reach directory.public inside the creating session');
        assert.equal(published.length > 0, true, 'the projection must publish its invalidation event');
        assert.equal(published.some((event) => event.stream_id === 'directory.public'), true);
    } finally {
        await db.closeDatabase().catch(() => { });
        try { fs.unlinkSync(databasePath); } catch (_) { }
        delete process.env.SQLITE_PATH;
    }
});
