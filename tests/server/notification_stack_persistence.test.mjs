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
let publishOwnNotification = null;

beforeAll(async () => {
    vi.resetModules();
    const directory = mkdtempSync(path.join(os.tmpdir(), 'adole-notification-update-'));
    dbPath = path.join(directory, 'adole.db');
    process.env.SQLITE_PATH = dbPath;
    adole = await import('../../database/adole.js');
    await adole.initDatabase();
    const authModule = await import('../../server/auth_users.js');
    createUserAtome = authModule.createUserAtome;
    const stackModule = await import('../../server/notificationStack.js');
    pushNotificationToUserStack = stackModule.pushNotificationToUserStack;
    readNotificationStack = stackModule.readNotificationStack;
    updateNotificationInUserStack = stackModule.updateNotificationInUserStack;
    publishOwnNotification = stackModule.publishOwnNotification;
});

afterAll(async () => {
    await adole?.closeDatabase?.();
    delete process.env.SQLITE_PATH;
    if (dbPath) rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

test('notification unread and archive updates remain durable in the canonical user stack', async () => {
    const userId = `notification_user_${Date.now()}`;
    await createUserAtome(
        adole.getDataSourceAdapter(), userId, 'Notification user', '+15550003005', 'public', {}
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
    await pushNotificationToUserStack({ userId, notification: { id: 'msg_update', message: 'Hello', unread: true } });
    expect((await readNotificationStack(userId)).stack[0]).toMatchObject({ unread: false, archived: true });
});

test('simultaneous deliveries and a status patch preserve every pending message beyond the retention limit', async () => {
    const userId = `concurrent_notifications_${Date.now()}`;
    await createUserAtome(adole.getDataSourceAdapter(), userId, 'Concurrent user', '+15550003006', 'public', {});
    await pushNotificationToUserStack({ userId, notification: { id: 'seed', message: 'Seed' } });
    const writes = Array.from({ length: 12 }, (_, index) => pushNotificationToUserStack({ userId, maxKeep: 2, deferPush: true,
        notification: { id: `pending_${index}`, message: `Message ${index}`, priority: index % 2 ? 'urgent' : 'normal',
            action: { kind: 'conversation', contactId: 'sender', messageId: `pending_${index}` } } }));
    writes.push(updateNotificationInUserStack({ userId, notificationId: 'seed', patch: { todo: true, priority: 'urgent' } }));
    expect((await Promise.all(writes)).every(result => result.ok)).toBe(true);
    await pushNotificationToUserStack({ userId, maxKeep: 2, deferPush: true,
        notification: { id: 'pending_0', message: 'Message 0', action: { kind: 'conversation', contactId: 'sender', messageId: 'pending_0' } } });
    const { stack } = await readNotificationStack(userId);
    expect(stack).toHaveLength(13);
    expect(stack.find(item => item.id === 'seed')).toMatchObject({ todo: true, priority: 'normal', unread: true });
    expect(stack.find(item => item.id === 'pending_1')).toMatchObject({ priority: 'urgent', action: { messageId: 'pending_1' } });
});

test('a calendar retry keeps a read notice read and cannot overwrite another sender', async () => {
    const userId = `calendar_notice_${Date.now()}`;
    await createUserAtome(adole.getDataSourceAdapter(), userId, 'Calendar user', '+15550003007', 'public', {});
    const notification = { id: 'alarm_reference', kind: 'calendar', from_id: userId, to_user_id: userId, message: 'Reminder',
        action: { kind: 'command', toolId: 'ui.panel.open', input: { surface: 'calendar', eventId: 'event' } } };
    await publishOwnNotification({ userId, notification });
    await updateNotificationInUserStack({ userId, notificationId: notification.id, patch: { unread: false } });
    const retry = await publishOwnNotification({ userId, notification });
    expect(retry).toMatchObject({ ok: true, duplicate: true, notification: { unread: false } });
    await expect(publishOwnNotification({ userId, notification: { ...notification, message: 'Replacement' } })).rejects.toThrow('notification_id_conflict');
});
