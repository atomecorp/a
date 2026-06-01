import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dbPath = path.join(os.tmpdir(), `adole-user-classification-${process.pid}-${Date.now()}.db`);
process.env.SQLITE_PATH = dbPath;

const {
    initDatabase,
    closeDatabase,
    createAtome,
    listAtomes
} = await import('./adole.js');

try {
    await initDatabase();

    await createAtome({
        id: 'user_a',
        type: 'user',
        owner: 'user_a',
        creator: 'user_a',
        properties: { username: 'Alice', phone: '111' }
    });
    await createAtome({
        id: 'user_b',
        type: 'user',
        owner: 'user_b',
        creator: 'user_b',
        properties: { username: 'Bob', phone: '222' }
    });
    await createAtome({
        id: 'project_b',
        type: 'project',
        owner: 'user_b',
        creator: 'user_b',
        properties: { name: 'Private Project B' }
    });

    const usersSeenByUserA = await listAtomes('user_a', { type: 'user', limit: 50, offset: 0, skipOwner: true });
    const userIds = usersSeenByUserA.map((item) => item.id).sort();
    assert.deepEqual(userIds, ['user_a', 'user_b'], 'user listing should not be filtered by current owner');

    const projectsSeenByUserA = await listAtomes('user_a', { type: 'project', limit: 50, offset: 0 });
    assert.equal(projectsSeenByUserA.length, 0, 'non-user atomes must remain owner-filtered');
} finally {
    await closeDatabase().catch(() => {});
    try { fs.unlinkSync(dbPath); } catch (_) {}
}
