import { test, expect } from 'vitest';
import Database from 'better-sqlite3';
import { queryCommunicationMessages } from '../../database/communication_messages.js';

test('conversation pagination preserves both directions and isolates the participant vault', async () => {
    const database = new Database(':memory:');
    try {
        database.exec(`CREATE TABLE atomes(atome_id TEXT, owner_id TEXT, creator_id TEXT, atome_type TEXT, deleted_at TEXT);
            CREATE TABLE state_current(atome_id TEXT, properties TEXT, updated_at TEXT);`);
        const add = (id, owner, from, to, timestamp) => {
            database.prepare('INSERT INTO atomes VALUES (?, ?, ?, ?, NULL)').run(id, owner, owner, 'message');
            database.prepare('INSERT INTO state_current VALUES (?, ?, ?)').run(id,
                JSON.stringify({ from_id: from, to_user_id: to, timestamp, message: id }), timestamp);
        };
        add('a', 'alice', 'alice', 'bob', '2026-10-10T12:00:00Z');
        add('b', 'alice', 'bob', 'alice', '2026-10-10T12:00:00Z');
        add('c', 'alice', 'alice', 'bob', '2026-10-11T12:00:00Z');
        add('private', 'eve', 'alice', 'bob', '2026-10-12T12:00:00Z');
        add('other', 'alice', 'alice', 'eve', '2026-10-12T12:00:00Z');
        const query = async (method, sql, params) => database.prepare(sql)[method](...params);
        const first = await queryCommunicationMessages({ query, userId: 'alice', contactId: 'bob', limit: 2 });
        expect(first.items.map(item => item.id)).toEqual(['c', 'b']);
        expect(first.items.map(item => item.from_id)).toEqual(['alice', 'bob']);
        const second = await queryCommunicationMessages({ query, userId: 'alice', contactId: 'bob', limit: 2, cursor: first.nextCursor });
        expect(second.items.map(item => item.id)).toEqual(['a']);
        expect(second.nextCursor).toBeNull();
        expect((await queryCommunicationMessages({ query, userId: 'bob', contactId: 'alice' })).items).toEqual([]);
    } finally { database.close(); }
});
