import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { createUserVaultProvider } from '../../server/userVaultProvider.js';
const root = fs.mkdtempSync(path.resolve('temp/guest_profile/adoption-'));
const sockets = path.resolve('temp/gp-sock-' + process.pid);
process.env.SQLITE_PATH = path.join(root, 'directory.db');
process.env.JWT_SECRET = 'isolated-guest-profile-adoption-test-secret';
const db = await import('../../database/adole.js');
const { handleWsApiGuestAdoption } = await import('../../server/wsApiGuestAdoption.js');
const { handleWsAtomeOperation } = await import('../../server/wsAtomeOperations.js');
const { UserVaultRouter } = await import('../../server/userVaultRouter.js');
const provider = createUserVaultProvider({ root: path.join(root, 'vaults'), socketRoot: sockets });
const router = new UserVaultRouter({ provider });
const owner = crypto.randomUUID(), guest = crypto.randomUUID();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
    await db.initDatabase();
    await db.createAtome({ id: owner, type: 'user', owner, creator: owner, properties: { name: 'Account' } });
    const token = jwt.sign({ sub: owner }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const connection = { _wsApiVaultRouter: router };
    const context = { connection, dataSource: db.getDataSourceAdapter(), projectRoot: root };
    const command = message => handleWsAtomeOperation({ token, ...message }, connection);
    assert.equal((await command({ type: 'events', action: 'commit', event: { id: crypto.randomUUID(), type: 'user', kind: 'set', atome_id: owner,
        actor: { type: 'user', id: owner }, payload: { scope: 'global', props: { type: 'user', name: 'Account', user_face: 'account.png',
            eve_profile: { name: 'Account', first_name: '', access: 'private', preferences: { language: 'fr', security: { remote_control_allowed: true } } } } } } })).ok, true);
    const prepare = async (profile, { project = false } = {}) => {
        const operationId = crypto.randomUUID(), projectId = crypto.randomUUID();
        const original = { id: crypto.randomUUID(), atome_id: projectId, kind: 'set', ts: new Date().toISOString(), actor: { type: 'guest', id: guest }, payload: { props: { name: 'Local project' } } };
        const payload = { atomes: project ? [{ atome_id: projectId, atome_type: 'project', properties: { name: 'Local project' } }] : [],
            events: project ? [original] : [], snapshots: project ? [{ atome_id: projectId, snapshot_data: '{}' }] : [], sync_queue: [],
            permissions: project ? [{ atome_id: projectId, principal_id: guest, granted_by: guest, can_read: true }] : [], files: [], profile };
        const base = { type: 'guest-adoption', token, operation_id: operationId };
        const invoke = (action, extra = {}) => handleWsApiGuestAdoption({ ...base, action, ...extra }, context);
        assert.equal((await invoke('prepare', { guest_principal_id: guest, confirmed: true, manifest_digest: hash(payload), expires_at: new Date(Date.now() + 60000).toISOString() })).ok, true);
        assert.equal((await invoke('import', { payload, payload_digest: hash(payload) })).ok, true);
        return { invoke, operationId, projectId, original, payload };
    };
    const first = await prepare({ name: 'Guest', first_name: 'Ada', user_face: 'guest.png', access: 'public', password: 'never-import',
        preferences: { language: 'en', security: { remote_control_allowed: false } }, custom_fields: [{ label: 'Site', value: 'ada.test' }] }, { project: true });
    await context.dataSource.query('UPDATE guest_adoption_operations SET expires_at = ? WHERE operation_digest = ?',
        ['2000-01-01T00:00:00.000Z', crypto.createHash('sha256').update(first.operationId).digest('hex')]);
    assert.equal((await first.invoke('import', { payload: first.payload, payload_digest: hash(first.payload) })).error, 'guest_adoption_expired');
    assert.equal((await first.invoke('prepare', { guest_principal_id: guest, confirmed: true, manifest_digest: hash(first.payload),
        expires_at: new Date(Date.now() + 60000).toISOString() })).ok, true, 'same confirmed journal can renew its deadline');
    const completed = await first.invoke('finalize');
    assert.equal(completed.ok, true, JSON.stringify(completed));
    const state = (await command({ type: 'state-current', action: 'get', atome_id: owner })).state;
    assert.equal(state.properties.name, 'Account'); assert.equal(state.properties.user_face, 'account.png');
    assert.equal(state.properties.eve_profile.first_name, 'Ada'); assert.equal(state.properties.eve_profile.access, 'private');
    assert.equal(state.properties.eve_profile.preferences.language, 'fr'); assert.equal(state.properties.eve_profile.password, undefined);
    assert.equal(completed.profile_event.scope, 'global'); assert.equal(state.project_id ?? null, null);
    assert.equal((await command({ type: 'state-current', action: 'get', atome_id: first.projectId })).state.properties.name, 'Local project');
    assert.equal(await db.getAtomeById(first.projectId), null, 'business data stays in the principal vault');
    const archived = await context.dataSource.query('SELECT payload_json FROM guest_adoption_payloads WHERE operation_digest = ?', [crypto.createHash('sha256').update(first.operationId).digest('hex')]);
    assert.deepEqual(JSON.parse(archived[0].payload_json).events[0], first.original, 'the guest source event is preserved unchanged');
    await context.dataSource.query('UPDATE guest_adoption_operations SET expires_at = ? WHERE operation_digest = ?',
        ['2000-01-01T00:00:00.000Z', crypto.createHash('sha256').update(first.operationId).digest('hex')]);
    assert.equal((await first.invoke('import')).replayed, true, 'completed import remains recoverable after expiry');
    assert.equal((await first.invoke('stage-file', { file_id: 'already-finalized' })).replayed, true);
    assert.equal((await first.invoke('finalize')).replayed, true);
    const events = await command({ type: 'events', action: 'list', atome_id: owner });
    assert.equal(events.events.filter(event => event.id === completed.profile_event.id).length, 1);

    // A lost final acknowledgement retries the journaled intent, without
    // overwriting an account edit made after the original adoption commit.
    const interrupted = await prepare({ bio: { birth: '2001-01-01' } });
    await db.getDatabase().exec("CREATE TRIGGER guest_profile_interrupt BEFORE UPDATE OF status ON guest_adoption_operations WHEN NEW.status = 'completed' BEGIN SELECT RAISE(FAIL, 'guest_profile_interrupted'); END");
    assert.equal((await interrupted.invoke('finalize')).error, 'guest_profile_interrupted');
    const adopted = (await command({ type: 'state-current', action: 'get', atome_id: owner })).state;
    assert.equal(adopted.properties.eve_profile.bio.birth, '2001-01-01');
    await db.getDatabase().exec('DROP TRIGGER guest_profile_interrupt');
    const edited = structuredClone(adopted.properties.eve_profile); edited.bio.birth = '2002-02-02';
    await command({ type: 'events', action: 'commit', event: { id: crypto.randomUUID(), atome_id: owner, kind: 'set', actor: { type: 'user', id: owner },
        payload: { scope: 'global', props: { eve_profile: edited } } } });
    assert.equal((await interrupted.invoke('finalize')).ok, true);
    assert.equal((await command({ type: 'state-current', action: 'get', atome_id: owner })).state.properties.eve_profile.bio.birth, '2002-02-02');
    const emptyOwner = crypto.randomUUID(), emptyOperation = crypto.randomUUID();
    await db.createAtome({ id: emptyOwner, type: 'user', owner: emptyOwner, creator: emptyOwner, properties: {} });
    const emptyToken = jwt.sign({ sub: emptyOwner }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const emptyConnection = { _wsApiVaultRouter: router };
    const emptyContext = { ...context, connection: emptyConnection };
    const emptyPayload = { atomes: [], events: [], snapshots: [], sync_queue: [], permissions: [], files: [],
        profile: { name: 'Guest', first_name: 'Ada', user_face: 'guest.png', profile: { passions: [{ label: 'Music', value: 'Yes' }] } } };
    const adoptEmpty = (action, extra = {}) => handleWsApiGuestAdoption({ type: 'guest-adoption', token: emptyToken,
        operation_id: emptyOperation, action, ...extra }, emptyContext);
    assert.equal((await adoptEmpty('prepare', { guest_principal_id: guest, confirmed: true, manifest_digest: hash(emptyPayload), expires_at: new Date(Date.now()+60000).toISOString() })).ok, true);
    assert.equal((await adoptEmpty('import', { payload: emptyPayload, payload_digest: hash(emptyPayload) })).ok, true);
    assert.equal((await adoptEmpty('finalize')).ok, true);
    const emptyState = (await handleWsAtomeOperation({ type: 'state-current', action: 'get', atome_id: emptyOwner, token: emptyToken }, emptyConnection)).state;
    assert.equal(emptyState.properties.eve_profile.name, 'Guest'); assert.equal(emptyState.properties.user_face, 'guest.png');
    assert.equal(emptyState.properties.eve_profile.user_face, undefined);
    console.log('guest_profile_adoption: PASS (vault isolation, merge, project import, immutable source, interrupted replay)');
} finally {
    await provider.stopAll(); await db.closeDatabase();
    fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(sockets, { recursive: true, force: true });
}
