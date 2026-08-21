import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(os.tmpdir(), 'eve-guest-adoption-'));
process.env.SQLITE_PATH = path.join(directory, 'adole.db');
process.env.JWT_SECRET = 'guest-adoption-test-secret-which-is-long-enough';

const adole = await import('../../database/adole.js');
const { handleWsApiGuestAdoption } = await import('../../server/wsApiGuestAdoption.js');
const targetId = '550e8400-e29b-41d4-a716-446655440000';
const guestId = '660e8400-e29b-41d4-a716-446655440000';
const operationId = '770e8400-e29b-41d4-a716-446655440000';
const now = new Date().toISOString();

try {
    await adole.initDatabase();
    const dataSource = adole.getDataSourceAdapter();
    await dataSource.query(`INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at)
        VALUES (?, 'user', ?, ?, ?, ?)`, [targetId, targetId, targetId, now, now]);
    const token = jwt.sign({ userId: targetId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const connection = {};
    const fileBytes = Buffer.from('guest adoption file', 'utf8');
    const fileId = '990e8400-e29b-41d4-a716-446655440000';
    const payload = {
        atomes: [{ atome_id: 'project-guest-1', atome_type: 'project', properties: { name: 'Guest project' } }],
        events: [{ id: 'event-guest-1', atome_id: 'project-guest-1', kind: 'set', payload: { props: { name: 'Guest project' } }, actor: { type: 'guest', id: guestId } }],
        snapshots: [{ atome_id: 'project-guest-1', snapshot_data: '{}' }],
        sync_queue: [{ operation: 'commit', payload: { atome_id: 'project-guest-1' } }],
        permissions: [{ atome_id: 'project-guest-1', principal_id: guestId, granted_by: guestId, can_read: true, can_write: true }],
        files: [{ file_id: fileId, file_name: 'guest.txt', content_digest: crypto.createHash('sha256').update(fileBytes).digest('hex'), byte_length: fileBytes.length }]
    };
    const payloadDigest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const context = { dataSource, connection, projectRoot: directory };
    const base = { type: 'guest-adoption', token, operation_id: operationId };
    const prepared = await handleWsApiGuestAdoption({ ...base, action: 'prepare', guest_principal_id: guestId, manifest_digest: payloadDigest, expires_at: new Date(Date.now() + 60_000).toISOString(), confirmed: true }, context);
    assert.equal(prepared.success, true);
    const imported = await handleWsApiGuestAdoption({ ...base, action: 'import', payload, payload_digest: payloadDigest }, context);
    assert.equal(imported.success, true, JSON.stringify(imported));
    const staged = await handleWsApiGuestAdoption({ ...base, action: 'stage-file', file_id: fileId, content_base64: fileBytes.toString('base64') }, context);
    assert.equal(staged.success, true, JSON.stringify(staged));
    const completed = await handleWsApiGuestAdoption({ ...base, action: 'finalize' }, context);
    assert.equal(completed.success, true);
    const project = await dataSource.query('SELECT owner_id, creator_id FROM atomes WHERE atome_id = ?', ['project-guest-1']);
    assert.deepEqual(project[0], { owner_id: targetId, creator_id: targetId });
    assert.equal((await dataSource.query('SELECT COUNT(*) AS count FROM events WHERE atome_id = ?', ['project-guest-1']))[0].count, 1);
    assert.deepEqual((await dataSource.query('SELECT principal_id, granted_by, can_write FROM permissions WHERE atome_id = ?', ['project-guest-1']))[0], { principal_id: targetId, granted_by: targetId, can_write: 1 });
    assert.equal(readFileSync(path.join(directory, 'data', 'users', targetId, 'Downloads', 'guest.txt'), 'utf8'), 'guest adoption file');
    const replayed = await handleWsApiGuestAdoption({ ...base, action: 'finalize' }, context);
    assert.equal(replayed.replayed, true);
    const resumedOperationId = 'aa0e8400-e29b-41d4-a716-446655440000';
    const resumedFileId = 'bb0e8400-e29b-41d4-a716-446655440000';
    const resumedPayload = {
        atomes: [{ atome_id: 'project-guest-2', atome_type: 'project', properties: { name: 'Resumed project' } }],
        events: [{ id: 'event-guest-2', atome_id: 'project-guest-2', kind: 'set', payload: { props: { name: 'Resumed project' } }, actor: { type: 'guest', id: guestId } }],
        snapshots: [], sync_queue: [], permissions: [],
        files: [{ file_id: resumedFileId, file_name: 'guest.txt', content_digest: crypto.createHash('sha256').update(fileBytes).digest('hex'), byte_length: fileBytes.length }]
    };
    const resumedDigest = crypto.createHash('sha256').update(JSON.stringify(resumedPayload)).digest('hex');
    const resumedBase = { type: 'guest-adoption', token, operation_id: resumedOperationId };
    assert.equal((await handleWsApiGuestAdoption({ ...resumedBase, action: 'prepare', guest_principal_id: guestId, manifest_digest: resumedDigest, expires_at: new Date(Date.now() + 60_000).toISOString(), confirmed: true }, context)).success, true);
    assert.equal((await handleWsApiGuestAdoption({ ...resumedBase, action: 'import', payload: resumedPayload, payload_digest: resumedDigest }, context)).success, true);
    assert.equal((await handleWsApiGuestAdoption({ ...resumedBase, action: 'stage-file', file_id: resumedFileId, content_base64: fileBytes.toString('base64') }, context)).success, true);
    const blockedFinalize = await handleWsApiGuestAdoption({ ...resumedBase, action: 'finalize' }, context);
    assert.equal(blockedFinalize.error, 'guest_adoption_file_collision');
    unlinkSync(path.join(directory, 'data', 'users', targetId, 'Downloads', 'guest.txt'));
    assert.equal((await handleWsApiGuestAdoption({ ...resumedBase, action: 'finalize' }, context)).success, true);
    const missingConfirmation = await handleWsApiGuestAdoption({ ...base, action: 'prepare', operation_id: '880e8400-e29b-41d4-a716-446655440000', guest_principal_id: guestId, manifest_digest: payloadDigest, expires_at: new Date(Date.now() + 60_000).toISOString() }, context);
    assert.equal(missingConfirmation.error, 'guest_adoption_confirmation_required');
    const conflicting = await handleWsApiGuestAdoption({ ...base, action: 'prepare', guest_principal_id: guestId, manifest_digest: 'a'.repeat(64), expires_at: new Date(Date.now() + 60_000).toISOString(), confirmed: true }, context);
    assert.equal(conflicting.error, 'guest_adoption_operation_conflict');
    console.log('guest_adoption_runtime_probe: PASS');
} finally {
    await adole.closeDatabase();
    rmSync(directory, { recursive: true, force: true });
}
