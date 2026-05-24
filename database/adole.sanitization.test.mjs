import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('ADOLE persistence removes reserved Atome envelope fields from particles', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-sanitization-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`./adole.js?sanitization=${Date.now()}`);

    try {
        await db.initDatabase();
        await db.createAtome({
            id: 'shape_reserved_fields',
            type: 'shape',
            owner: 'shape_reserved_fields',
            creator: 'shape_reserved_fields',
            properties: {
                id: 'wrong_id',
                type: 'wrong_type',
                owner_id: 'wrong_owner',
                left: '12px'
            }
        });

        const atome = await db.getAtome('shape_reserved_fields');
        assert.equal(atome.properties.id, undefined);
        assert.equal(atome.properties.type, undefined);
        assert.equal(atome.properties.owner_id, undefined);
        assert.equal(atome.properties.left, '12px');

        await assert.rejects(
            () => db.setParticle('shape_reserved_fields', 'atome_id', 'wrong_id', 'shape_reserved_fields'),
            /Reserved Atome envelope field/
        );
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});

test('ADOLE createAtome rejects records without canonical type', async () => {
    const dbPath = path.join(os.tmpdir(), `adole-canonical-type-${process.pid}-${Date.now()}.db`);
    process.env.SQLITE_PATH = dbPath;
    const db = await import(`./adole.js?canonical_type=${Date.now()}`);

    try {
        await db.initDatabase();
        await assert.rejects(
            () => db.createAtome({
                id: 'missing_type',
                owner: 'missing_type',
                creator: 'missing_type',
                properties: {
                    left: '12px'
                }
            }),
            /Canonical Atome requires id and type/
        );
    } finally {
        await db.closeDatabase().catch(() => {});
        try { fs.unlinkSync(dbPath); } catch (_) {}
    }
});
