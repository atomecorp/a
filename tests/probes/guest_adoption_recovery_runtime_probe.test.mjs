import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(os.tmpdir(), 'eve-guest-adoption-recovery-'));
process.env.SQLITE_PATH = path.join(directory, 'adole.db');
process.env.JWT_SECRET = 'guest-adoption-recovery-test-secret-long-enough';

const adole = await import('../../database/adole.js');
const { handleWsApiGuestAdoption } = await import('../../server/wsApiGuestAdoption.js');
const targetId = crypto.randomUUID();
const guestId = crypto.randomUUID();
const now = new Date().toISOString();

const digest = (value) => crypto.createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const bytes = (value) => Buffer.from(value, 'utf8');

function payloadFor(label, options = {}) {
    const atomeId = `guest-project-${label}`;
    const content = bytes(`guest-file-${label}`);
    const file = {
        file_id: crypto.randomUUID(),
        file_name: `${label}.txt`,
        content_digest: digest(content),
        byte_length: content.length
    };
    const payload = {
        atomes: [{ atome_id: atomeId, atome_type: 'project', properties: { name: label } }],
        events: [{ id: `event-${label}`, atome_id: atomeId, kind: 'set', payload: { props: { name: label } }, actor: { type: 'guest', id: guestId } }],
        snapshots: [{ atome_id: atomeId, snapshot_data: '{}', actor: { type: 'guest', id: guestId } }],
        sync_queue: [{ operation: 'commit', payload: { atome_id: atomeId } }],
        permissions: options.permissions || [{ atome_id: atomeId, principal_id: guestId, granted_by: guestId, can_read: true, can_write: true }],
        files: options.files === false ? [] : [file]
    };
    return { payload, content, file, manifestDigest: digest(payload) };
}

async function invoke(context, base, action, fields = {}) {
    return handleWsApiGuestAdoption({ ...base, action, ...fields }, context);
}

async function prepare(context, base, guestPrincipalId, manifestDigest, expiresAt = new Date(Date.now() + 60_000).toISOString()) {
    return invoke(context, base, 'prepare', { guest_principal_id: guestPrincipalId, manifest_digest: manifestDigest, expires_at: expiresAt, confirmed: true });
}

async function importPayload(context, base, payload, manifestDigest) {
    return invoke(context, base, 'import', { payload, payload_digest: manifestDigest });
}

async function stage(context, base, file, content) {
    return invoke(context, base, 'stage-file', { file_id: file.file_id, content_base64: content.toString('base64') });
}

async function count(dataSource, table, condition = '1 = 1', params = []) {
    return Number((await dataSource.query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${condition}`, params))[0].count);
}

try {
    await adole.initDatabase();
    const dataSource = adole.getDataSourceAdapter();
    await dataSource.query(`INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at)
        VALUES (?, 'user', ?, ?, ?, ?)`, [targetId, targetId, targetId, now, now]);
    const token = jwt.sign({ userId: targetId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const context = { dataSource, connection: {}, projectRoot: directory };

    const preparedOnly = payloadFor('prepared-only');
    const preparedBase = { type: 'guest-adoption', token, operation_id: crypto.randomUUID() };
    assert.equal((await prepare(context, preparedBase, guestId, preparedOnly.manifestDigest)).status, 'prepared');
    assert.equal((await importPayload({ ...context, connection: {} }, preparedBase, preparedOnly.payload, preparedOnly.manifestDigest)).status, 'importing');
    const preparedStage = await stage({ ...context, connection: {} }, preparedBase, preparedOnly.file, preparedOnly.content);
    assert.equal(preparedStage.status, 'importing', JSON.stringify(preparedStage));
    assert.equal((await invoke({ ...context, connection: {} }, preparedBase, 'finalize')).status, 'completed');

    const interrupted = payloadFor('post-move-interruption');
    const interruptedBase = { type: 'guest-adoption', token, operation_id: crypto.randomUUID() };
    assert.equal((await prepare(context, interruptedBase, guestId, interrupted.manifestDigest)).success, true);
    assert.equal((await importPayload(context, interruptedBase, interrupted.payload, interrupted.manifestDigest)).success, true);
    assert.equal((await stage(context, interruptedBase, interrupted.file, interrupted.content)).success, true);
    await adole.getDatabase().exec(`CREATE TRIGGER guest_adoption_test_interrupt_moved
        BEFORE UPDATE OF status ON guest_adoption_files
        WHEN NEW.status = 'moved'
        BEGIN SELECT RAISE(FAIL, 'guest_adoption_test_interrupted'); END`);
    const interruptedFinalize = await invoke(context, interruptedBase, 'finalize');
    assert.equal(interruptedFinalize.error, 'guest_adoption_test_interrupted');
    const interruptedTarget = path.join(directory, 'data', 'users', targetId, 'Downloads', interrupted.file.file_name);
    assert.equal(readFileSync(interruptedTarget, 'utf8'), interrupted.content.toString('utf8'));
    assert.equal((await dataSource.query(`SELECT status FROM guest_adoption_operations WHERE operation_digest = ?`, [digest(interruptedBase.operation_id)]))[0].status, 'committed');
    await adole.getDatabase().exec('DROP TRIGGER guest_adoption_test_interrupt_moved');
    assert.equal((await importPayload(context, interruptedBase, interrupted.payload, interrupted.manifestDigest)).status, 'committed');
    assert.equal((await invoke(context, interruptedBase, 'finalize')).status, 'completed');
    assert.equal((await count(dataSource, 'atomes', 'atome_id = ?', [interrupted.payload.atomes[0].atome_id])), 1);
    assert.equal((await count(dataSource, 'events', 'atome_id = ?', [interrupted.payload.atomes[0].atome_id])), 1);
    assert.equal((await count(dataSource, 'snapshots', 'atome_id = ?', [interrupted.payload.atomes[0].atome_id])), 1);
    assert.equal((await count(dataSource, 'permissions', 'atome_id = ?', [interrupted.payload.atomes[0].atome_id])), 1);
    assert.equal((await count(dataSource, 'sync_queue', 'atome_id = ?', [interrupted.payload.atomes[0].atome_id])), 1);

    const incomplete = payloadFor('incomplete');
    const incompleteBase = { type: 'guest-adoption', token, operation_id: crypto.randomUUID() };
    await prepare(context, incompleteBase, guestId, incomplete.manifestDigest);
    await importPayload(context, incompleteBase, incomplete.payload, incomplete.manifestDigest);
    assert.equal((await invoke(context, incompleteBase, 'finalize')).error, 'guest_adoption_files_incomplete');
    assert.equal((await count(dataSource, 'atomes', 'atome_id = ?', [incomplete.payload.atomes[0].atome_id])), 0);

    const invalidFile = payloadFor('invalid-file');
    const invalidFileBase = { type: 'guest-adoption', token, operation_id: crypto.randomUUID() };
    await prepare(context, invalidFileBase, guestId, invalidFile.manifestDigest);
    await importPayload(context, invalidFileBase, invalidFile.payload, invalidFile.manifestDigest);
    assert.equal((await stage(context, invalidFileBase, invalidFile.file, bytes('different-content'))).error, 'guest_adoption_file_digest_invalid');

    const manifestChanged = payloadFor('manifest-changed');
    const manifestChangedBase = { type: 'guest-adoption', token, operation_id: crypto.randomUUID() };
    await prepare(context, manifestChangedBase, guestId, manifestChanged.manifestDigest);
    const changedPayload = { ...manifestChanged.payload, atomes: [{ ...manifestChanged.payload.atomes[0], properties: { name: 'changed' } }] };
    assert.equal((await importPayload(context, manifestChangedBase, changedPayload, digest(changedPayload))).error, 'guest_adoption_manifest_conflict');
    assert.equal((await count(dataSource, 'guest_adoption_payloads', 'operation_digest = ?', [digest(manifestChangedBase.operation_id)])), 0);

    const ambiguous = payloadFor('ambiguous-acl', { permissions: [{ atome_id: 'guest-project-ambiguous-acl', principal_id: crypto.randomUUID(), granted_by: guestId }] });
    const ambiguousBase = { type: 'guest-adoption', token, operation_id: crypto.randomUUID() };
    await prepare(context, ambiguousBase, guestId, ambiguous.manifestDigest);
    await importPayload(context, ambiguousBase, ambiguous.payload, ambiguous.manifestDigest);
    await stage(context, ambiguousBase, ambiguous.file, ambiguous.content);
    assert.equal((await invoke(context, ambiguousBase, 'finalize')).error, 'guest_adoption_acl_ambiguous');
    assert.equal((await count(dataSource, 'atomes', 'atome_id = ?', [ambiguous.payload.atomes[0].atome_id])), 0);

    const expired = payloadFor('expired');
    const expiredBase = { type: 'guest-adoption', token, operation_id: crypto.randomUUID() };
    await prepare(context, expiredBase, guestId, expired.manifestDigest);
    await dataSource.query(`UPDATE guest_adoption_operations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE operation_digest = ?`, [digest(expiredBase.operation_id)]);
    assert.equal((await importPayload(context, expiredBase, expired.payload, expired.manifestDigest)).error, 'guest_adoption_expired');

    const concurrent = payloadFor('concurrent');
    const concurrentBase = { type: 'guest-adoption', token, operation_id: crypto.randomUUID() };
    const prepared = await Promise.all([prepare(context, concurrentBase, guestId, concurrent.manifestDigest), prepare(context, concurrentBase, guestId, concurrent.manifestDigest)]);
    assert.deepEqual(prepared.map((result) => result.success), [true, true]);
    const imported = await Promise.all([importPayload(context, concurrentBase, concurrent.payload, concurrent.manifestDigest), importPayload(context, concurrentBase, concurrent.payload, concurrent.manifestDigest)]);
    assert.deepEqual(imported.map((result) => result.success), [true, true]);
    await stage(context, concurrentBase, concurrent.file, concurrent.content);
    const finalized = await Promise.all([invoke(context, concurrentBase, 'finalize'), invoke(context, concurrentBase, 'finalize')]);
    assert.deepEqual(finalized.map((result) => result.success), [true, true]);
    assert.equal((await count(dataSource, 'atomes', 'atome_id = ?', [concurrent.payload.atomes[0].atome_id])), 1);
    assert.equal(existsSync(path.join(directory, 'data', 'users', targetId, 'Downloads', concurrent.file.file_name)), true);
    console.log('guest_adoption_recovery_runtime_probe: PASS');
} finally {
    await adole.closeDatabase();
    rmSync(directory, { recursive: true, force: true });
}
