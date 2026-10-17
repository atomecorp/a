import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

test('compacted events survive lost receipts, restart and duplicate batches without accepting changed intent', async () => {
    const directory = mkdtempSync(resolve('temp/durable-event-retry-'));
    const previous = process.env.SQLITE_PATH;
    process.env.SQLITE_PATH = join(directory, 'adole.db');
    const db = await import('../../database/adole.js');
    try {
        await db.initDatabase();
        await db.createAtome({ id:'owner', type:'user', owner:'owner', creator:'owner', properties:{visibility:'private'} });
        const event = (id, props) => ({ id, kind:'set', atome_id:'record', scope:'global',
            ts:'2026-10-16T00:00:00Z', actor:{type:'user',id:'owner'}, tx_id:'transaction', payload:{props} });
        const stable = { photo:'x'.repeat(10000), name:'Unchanged' };
        await db.appendEvent(event('initial', { ...stable, width:10 }));
        const original = event('retry', { ...stable, width:20 });
        const stored = await db.appendEvent(original);
        assert.equal(stored.payload.props.photo, undefined);
        assert.equal(stored.payload.props.name, undefined);
        assert.match(stored.payload.idempotency_intent_hash, /^[a-f0-9]{64}$/);
        await db.closeDatabase(); await db.initDatabase();
        const replay = await db.appendEvent(structuredClone(original));
        assert.equal(replay.inserted, false);
        assert.equal(replay.sequence, stored.sequence);
        const batch = await db.appendEvents([original, original]);
        assert.equal(batch.every(row=>row.inserted===false), true);
        for (const changed of [
            { ...original, payload:{props:{...original.payload.props,name:'Changed'}} },
            { ...original, actor:{type:'user',id:'other'} },
            { ...original, tx_id:'other-transaction' }
        ]) await assert.rejects(db.appendEvent(changed), /event_id_conflict/);
        // The server owns this hash; an incoming payload cannot choose it.
        const forged = event('forged', { ...stable, width:30 });
        forged.payload.idempotency_intent_hash = stored.payload.idempotency_intent_hash;
        const protectedRow = await db.appendEvent(forged);
        assert.notEqual(protectedRow.payload.idempotency_intent_hash, forged.payload.idempotency_intent_hash);
        await assert.rejects(db.appendEvent({ ...forged, payload:{...forged.payload,props:{width:99}} }), /event_id_conflict/);
        // Existing compacted journals have no hash. Their immutable snapshot
        // proves which omitted incoming values were no-ops at that event.
        const legacy = { ...stored.payload }; delete legacy.idempotency_intent_hash;
        await db.default.query('run','UPDATE events SET payload=? WHERE id=?',[JSON.stringify(legacy),original.id]);
        assert.equal((await db.appendEvent(original)).inserted, false);
        await assert.rejects(db.appendEvent({ ...original, payload:{props:{...original.payload.props,name:'Changed'}} }), /event_id_conflict/);
        assert.equal((await db.default.query('get','SELECT COUNT(*) AS n FROM events')).n,3);
    } finally {
        await db.closeDatabase();
        if(previous===undefined) delete process.env.SQLITE_PATH; else process.env.SQLITE_PATH=previous;
        rmSync(directory,{recursive:true,force:true});
    }
});
