import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('ADOLE particle history lists version changes using schema columns', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-particle-history-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`../../database/adole.js?particle_history=${Date.now()}`);

    try {
        await db.initDatabase();
        await db.createAtome({
            id: 'history_shape',
            type: 'shape',
            owner: 'user_history',
            creator: 'user_history'
        });

        await db.setParticle('history_shape', 'color', 'red', 'user_history');
        await db.setParticle('history_shape', 'color', 'blue', 'user_history');
        await db.setParticle('history_shape', 'color', { value: 'green' }, 'user_history');

        const historyBeforeRestore = await db.getParticleHistory('history_shape', 'color');
        assert.deepEqual(historyBeforeRestore.map((row) => row.version), [3, 2, 1]);
        assert.equal(historyBeforeRestore[0].new_value, JSON.stringify({ value: 'green' }));

        const changes = await db.getChangesSince('1970-01-01T00:00:00.000Z');
        const colorChanges = changes.filter((row) => row.atome_id === 'history_shape' && row.particle_key === 'color');
        assert.equal(colorChanges.length, 3);
        colorChanges.forEach((row) => {
            assert.ok(row.changed_at);
            assert.equal(row.created_at, row.changed_at);
            assert.equal(row.atome_type, 'shape');
        });

        const futureChanges = await db.getChangesSince('9999-01-01T00:00:00.000Z');
        assert.deepEqual(futureChanges, []);
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});
