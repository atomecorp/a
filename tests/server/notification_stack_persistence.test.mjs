import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let dbPath = null;
let adole = null;
let createUserAtome = null;
let pushNotificationToUserStack = null;
let readNotificationStack = null;
let updateNotificationInUserStack = null;

beforeAll(async () => {
    vi.resetModules();
    const directory = mkdtempSync(path.join(os.tmpdir(), 'adole-notification-update-'));
    dbPath = path.join(directory, 'adole.db');
    process.env.SQLITE_PATH = dbPath;
    adole = await import('../../database/adole.js');
    await adole.initDatabase();
    const authModule = await import('../../server/auth.js');
    createUserAtome = authModule.createUserAtome;
    const stackModule = await import('../../server/notificationStack.js');
    pushNotificationToUserStack = stackModule.pushNotificationToUserStack;
    readNotificationStack = stackModule.readNotificationStack;
    updateNotificationInUserStack = stackModule.updateNotificationInUserStack;
});

afterAll(async () => {
    await adole?.closeDatabase?.();
    delete process.env.SQLITE_PATH;
    if (dbPath) rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

test('notification unread and archive updates remain durable in the canonical user stack', async () => {
    const userId = `notification_user_${Date.now()}`;
    await createUserAtome(
        adole.getDataSourceAdapter(), userId, 'Notification user', '+15550003005', 'hash', 'public', {}
    );
    await pushNotificationToUserStack({
        userId,
        notification: { id: 'msg_update', message: 'Hello', unread: true }
    });

    const updated = await updateNotificationInUserStack({
        userId,
        notificationId: 'msg_update',
        patch: { unread: false, archived: true, message: 'must not change' }
    });
    expect(updated).toMatchObject({ ok: true });
    const read = await readNotificationStack(userId);
    expect(read.stack[0]).toMatchObject({
        id: 'msg_update', message: 'Hello', unread: false, archived: true
    });
});
