// A `set` that changes nothing records no event, only its delivery receipt; a resend of its
// event id (the acknowledgement lost) is ignored, never applied over a later change (R-189,
// known-bug-solutions/ghost-atomes-typeless-set). The Rust store runs the same rule
// (tests/atome_store/unchanged_receipts.rs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

test('an unchanged set is received, not recorded, and its resend never overwrites a later change', async () => {
    const directory = mkdtempSync(resolve('temp/event-receipts-'));
    const previous = process.env.SQLITE_PATH;
    process.env.SQLITE_PATH = join(directory, 'adole.db');
    const db = await import('../../database/adole.js');
    const count = async (sql) => (await db.default.query('get', sql)).count;
    const nameOf = async () => JSON.parse((await db.default.query('get',
        "SELECT particle_value FROM particles WHERE atome_id = 'contact-1' AND particle_key = 'name'")).particle_value);
    try {
        await db.initDatabase();
        await db.createAtome({ id: 'owner', type: 'user', owner: 'owner', creator: 'owner', properties: { visibility: 'private' } });
        const set = (id, props, extra = {}) => ({ id, kind: 'set', atome_id: 'contact-1', scope: 'global',
            actor: { type: 'user', id: 'owner' }, payload: { props }, ...extra });
        for (const conflictMode of ['interactive', 'offline-lww']) {
            const suffix = `-${conflictMode}`;
            await db.appendEvent(set(`c0${suffix}`, { type: 'contact', name: 'Paul' }), { conflictMode });
            const events = await count('SELECT COUNT(*) AS count FROM events');
            const receipts = await count('SELECT COUNT(*) AS count FROM event_receipts');

            // The iPad sends name = Paul, already Paul (with its type): no event, a receipt.
            const ipad = set(`ipad${suffix}`, { type: 'contact', name: 'Paul' });
            const first = await db.appendEvent(structuredClone(ipad), { conflictMode });
            assert.equal(first.inserted, false);
            assert.equal(first.unchanged, true);
            assert.equal(db.wasEventInserted(first), false);
            assert.equal(await count('SELECT COUNT(*) AS count FROM events'), events);
            assert.equal(await count('SELECT COUNT(*) AS count FROM event_receipts'), receipts + 1);

            // The Mac renames; then the iPad's retry of the same id arrives, alone and in a batch.
            const mac = await db.appendEvent(set(`mac${suffix}`, { name: 'Paul Martin' }), { conflictMode });
            assert.equal(db.wasEventInserted(mac), true);
            const resent = await db.appendEvent(structuredClone(ipad), { conflictMode });
            assert.equal(resent.unchanged, true);
            const batch = await db.appendEvents([structuredClone(ipad)], { conflictMode });
            assert.equal(batch[0].unchanged, true);
            assert.equal(await nameOf(), 'Paul Martin');
            assert.equal(await count('SELECT COUNT(*) AS count FROM events'), events + 1);

            // Another intent under the received id is refused.
            await assert.rejects(db.appendEvent(set(`ipad${suffix}`, { name: 'Pierre' }), { conflictMode }), /event_id_conflict/);
            // Reset the name for the next mode.
            await db.appendEvent(set(`back${suffix}`, { name: 'Paul' }), { conflictMode });
        }

        // A set with one real change is recorded with that change alone; a delete is a change.
        const changed = await db.appendEvent(set('c1', { type: 'contact', name: 'Paul', note: 'x' }));
        assert.deepEqual(changed.payload.props, { note: 'x' });
        const deleting = await db.appendEvent({ ...set('c2', { name: 'Paul' }), payload: { props: { name: 'Paul' }, delete_keys: ['note'] } });
        assert.equal(db.wasEventInserted(deleting), true);
    } finally {
        await db.closeDatabase();
        if (previous === undefined) delete process.env.SQLITE_PATH; else process.env.SQLITE_PATH = previous;
        rmSync(directory, { recursive: true, force: true });
    }
});
