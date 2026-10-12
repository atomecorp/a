import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { loadUserProfile, upsertUserProfile } from '../../eVe/domains/user/profile_api.js';
import { transferGuestWorkspace } from '../../atome/src/squirrel/apis/unified/adole_api/auth_workspace.js';
import { commit } from '../../eVe/core/atome_commit.js';
import { getSessionState, setSessionState, setGuestWorkspace } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';
import { FastifyAdapter } from '../../atome/src/squirrel/apis/unified/adole.js';
import { getGuestAtome, guestAdoptionPayload, completeBrowserGuestAdoption, listWorkspaceEvents, pendingWorkspaceEvents } from '../../atome/src/squirrel/apis/unified/adole_api/guest_workspace_store.js';
import { mergeGuestProfileProperties, personalProfileFromProperties } from '../../atome/src/shared/profile_sharing.js';
import { normalizeHomeProfile, persistHomeProfile } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js';
import { buildHomeContent } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_view.js';

const owner = '660e8400-e29b-41d4-a716-446655440000';
const other = '550e8400-e29b-41d4-a716-446655440000';
const photo = 'data:image/png;base64,iVBORw0KGgo=';
const flatten = node => [node, ...(node?.children || []).flatMap(flatten)];
let original, api, cloud, updates;
beforeEach(() => {
    original = { window: globalThis.window, indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange };
    globalThis.indexedDB = new IDBFactory(); globalThis.IDBKeyRange = IDBKeyRange;
    const win = new EventTarget();
    Object.assign(win, { location: new URL('https://guest-test.invalid'), CustomEvent, Atome: { commit } });
    globalThis.window = win;
    cloud = vi.spyOn(FastifyAdapter.ws, 'send').mockImplementation(() => { throw new Error('unexpected_cloud_request'); });
    api = { atomes: {}, security: { isAnonymous: () => getSessionState().mode === 'anonymous' },
        auth: { current: async () => { const s = getSessionState(); return { logged: !!s.user, user: s.user, source: s.backend, anonymous: s.mode === 'anonymous' }; },
            ensureFastifyToken: vi.fn(() => { throw new Error('unexpected_cloud_auth'); }) } };
    win.AdoleAPI = api;
    updates = []; win.addEventListener('eve:user-profile-updated', event => updates.push(event.detail));
    setSessionState({ mode: 'anonymous', user: { id: owner, username: 'Guest' }, backend: 'local_guest' });
});
afterEach(() => {
    setSessionState({ mode: 'logged_out', user: null });
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
});

describe('canonical local guest profile', () => {
    it('loads an empty guest without creating an account or requesting cloud auth', async () => {
        const result = await loadUserProfile();
        expect(result.ok).toBe(true); expect(result.userId).toBe(owner);
        expect(result.profile.name).toBeNull();
        expect(await getGuestAtome(owner, owner)).toBeUndefined();
        expect(cloud).not.toHaveBeenCalled(); expect(api.auth.ensureFastifyToken).not.toHaveBeenCalled();
    });
    it('saves the complete personal card globally and reloads it after a session restart', async () => {
        window.__currentProject = { id: 'unrelated-project' };
        const profile = { name: 'Doe', first_name: 'Ada', nickname: 'AD', phone: '+33100000000', email: 'ada@example.test', user_face: photo,
            custom_fields: [{ label: 'Website', value: 'ada.test' }], bio: { birth: '2000-01-01', weight: '60', height: '170', biometrics: [{ label: 'Size', value: 'M' }] },
            profile: { competences: [{ label: 'Piano', value: 'Expert' }], passions: [{ label: 'Music', value: 'Yes' }], experiences: [{ label: 'Work', value: '10 years' }] } };
        expect((await upsertUserProfile(profile, { allowCreate: false })).ok).toBe(true);
        const record = await getGuestAtome(owner, owner);
        expect(record.atome_type).toBe('guest_workspace'); expect(record.project_id).toBeNull();
        expect(record.properties.eve_profile.user_face).toBeUndefined(); expect(record.properties.user_face).toBe(photo);
        setSessionState({ mode: 'logged_out', user: null });
        setSessionState({ mode: 'anonymous', user: { id: owner, username: 'Guest' }, backend: 'local_guest' });
        expect((await loadUserProfile()).profile).toMatchObject(profile);
        expect(updates).toHaveLength(1); expect(updates[0].userId).toBe(owner);
        expect(cloud).not.toHaveBeenCalled(); expect(api.auth.ensureFastifyToken).not.toHaveBeenCalled();
    });
    it('persists cleared names, removed rows and photo removal', async () => {
        await upsertUserProfile({ name: 'Before', first_name: 'Ada', user_face: photo, custom_fields: [{ label: 'Site', value: 'a.test' }] });
        await upsertUserProfile({ name: '', first_name: '', user_face: '', custom_fields: [] });
        expect((await loadUserProfile()).profile).toMatchObject({ name: '', first_name: '', user_face: '', custom_fields: [] });
        expect(await listWorkspaceEvents(owner)).toHaveLength(2);
    });
    it('refuses another principal and never announces a failed or stale save', async () => {
        expect((await upsertUserProfile({ name: 'Wrong' }, { userId: other })).ok).toBe(false);
        expect((await loadUserProfile(other)).ok).toBe(false);
        window.Atome.commit = async () => ({ ok: false, error: 'guest_storage_quota_exceeded' });
        expect((await upsertUserProfile({ name: 'Quota' })).ok).toBe(false);
        expect(updates).toHaveLength(0);
        window.Atome.commit = async () => { setSessionState({ mode: 'authenticated', user: { id: other }, backend: 'fastify' }); return { ok: true }; };
        expect((await upsertUserProfile({ name: 'Stale' })).error).toBe('workspace_identity_changed');
        expect(updates).toHaveLength(0);
    });
    it('rejects a session change during identity resolution before issuing any write', async () => {
        const write = vi.spyOn(window.Atome, 'commit');
        api.auth.current = async () => {
            const current = getSessionState();
            setSessionState({ mode: 'authenticated', user: { id: other }, backend: 'fastify' });
            return { logged: true, user: current.user, anonymous: current.mode === 'anonymous', source: current.backend };
        };
        expect((await upsertUserProfile({ name: 'Stale' })).error).toBe('workspace_identity_changed');
        expect(write).not.toHaveBeenCalled(); expect(cloud).not.toHaveBeenCalled();
    });
    it('does not save a stale guest editor into a newly authenticated account', async () => {
        setSessionState({ mode: 'authenticated', user: { id: other }, backend: 'fastify' });
        expect((await persistHomeProfile({ guest: true, userId: owner, profile: { name: 'Old guest' } })).ok).toBe(false);
        expect(cloud).not.toHaveBeenCalled(); expect(await getGuestAtome(other, other)).toBeUndefined();
    });
    it('keeps guest profile history outside the project import and preserves it on completion', async () => {
        await upsertUserProfile({ name: 'Guest name', user_face: photo });
        await commit({ kind: 'set', atome_id: 'guest-project', type: 'project', props: { name: 'Project' } });
        const payload = await guestAdoptionPayload(owner, other);
        expect(payload.profile).toEqual({ name: 'Guest name', user_face: photo });
        expect(payload.atomes.map(row => row.atome_id)).toEqual(['guest-project']);
        expect(payload.events.every(event => event.atome_id === 'guest-project')).toBe(true);
        const history = await listWorkspaceEvents(owner);
        await completeBrowserGuestAdoption(owner, other);
        expect(await getGuestAtome(other, owner)).toBeUndefined();
        expect((await getGuestAtome(owner, owner)).properties.name).toBe('Guest name');
        expect(await listWorkspaceEvents(owner)).toEqual(history.filter(event => event.atome_id === owner));
        expect(await pendingWorkspaceEvents(owner)).toEqual([]);
    });
    it.each(['beginner', 'intermediate', 'advanced'])('offers the real editor and photo actions at level %s', level => {
        const state = { guest: true, subject: null, loading: false, loadError: '', expanded: 'identity', subsections: {}, rowKeys: {},
            profile: normalizeHomeProfile({ preferences: { visual: { masteryLevel: level } } }) };
        const editing = { displayValue: () => '', registerFieldWidth: () => {}, isActive: () => false, fieldView: () => ({}) };
        const nodes = buildHomeContent(state, { bodyWidth: 452, editing, emit: () => {} }).flatMap(flatten);
        expect(nodes.find(node => node.id === 'home_profile_photo').on.activate).toBeTypeOf('function');
        expect(nodes.find(node => node.id === 'home_custom_fields_add')).toBeDefined();
        expect(nodes.find(node => node.id === 'home_identity_name').children.some(node => node.on)).toBe(true);
    });
});

describe('personal profile adoption merge', () => {
    it('fills empty strings and lists and preserves account identity, privacy, preferences and nonempty lists', () => {
        const target = { user_face: 'account.png', phone: '+33199999999', eve_profile: {
            name: 'Account', first_name: '', custom_fields: [], preferences: { security: { remote_control_allowed: true } }, access: 'private',
            profile: { competences: [{ label: 'Existing', value: 'Keep' }] } } };
        const guest = { name: 'Guest', first_name: 'Ada', phone: '+33100000000', user_face: photo, email: 'ada@example.test',
            access: 'public', password: 'never-import', preferences: { security: { remote_control_allowed: false } },
            custom_fields: [{ label: 'Site', value: 'ada.test' }], profile: { competences: [{ label: 'Replace', value: 'No' }], passions: [{ label: 'Music', value: 'Yes' }] } };
        const props = mergeGuestProfileProperties(target, guest);
        expect(props.user_face).toBeUndefined(); expect(props.phone).toBeUndefined(); expect(props.name).toBeUndefined();
        expect(props.eve_profile).toMatchObject({ name: 'Account', first_name: 'Ada', access: 'private', preferences: target.eve_profile.preferences,
            custom_fields: guest.custom_fields, profile: { competences: target.eve_profile.profile.competences, passions: guest.profile.passions } });
        expect(props.eve_profile.password).toBeUndefined(); expect(props.eve_profile.phone).toBeUndefined();
        expect(mergeGuestProfileProperties({ ...target, ...props }, guest)).toBeNull();
    });
    it('preserves nonempty lists even with blank rows and an existing legacy first name', () => {
        const target = { firstname: 'Existing', eve_profile: { profile: { passions: [{ label: '', value: '' }] } } };
        expect(mergeGuestProfileProperties(target, { first_name: 'Ada', profile: { passions: [{ label: 'Music', value: 'Yes' }] } })).toBeNull();
    });
    it('extracts only supported personal data and keeps the photo out of eve_profile', () => {
        const profile = personalProfileFromProperties({ user_face: photo, eve_profile: { name: 'Ada', password: 'secret', preferences: { apiKey: 'secret' } } });
        expect(profile).toEqual({ name: 'Ada', user_face: photo });
        expect(mergeGuestProfileProperties({}, profile)).toEqual({ name: 'Ada', user_face: photo, eve_profile: { name: 'Ada' } });
    });
});

it('adoption preserves the existing local account fields even when the cloud account has different values', async () => {
    await upsertUserProfile({ name: 'Guest', first_name: 'Ada' });
    const operationId = '770e8400-e29b-41d4-a716-446655440000';
    setGuestWorkspace({ user: { id: owner }, adoptionAccountId: other, adoptionOperationId: operationId });
    setSessionState({ mode: 'authenticated', user: { id: other }, backend: 'fastify' });
    await commit({ kind: 'set', type: 'user', atome_id: other, scope: 'global', props: { name: 'Local account', eve_profile: { name: 'Local account', preferences: { language: 'fr' } } } });
    cloud.mockImplementation(async message => message.type === 'state-current'
        ? { ok: true, state: { properties: { name: 'Cloud account', eve_profile: { name: 'Cloud account', first_name: 'Ada', preferences: { language: 'en' } } } } }
        : ({ ok: true, status: message.action === 'finalize' ? 'completed' : 'importing',
        ...(message.action === 'finalize' ? { profile_event: { id: 'cloud-profile-import', tx_id: 'cloud-profile-import', kind: 'set', atome_id: other, scope: 'global',
            actor: { type: 'user', id: other }, ts: new Date().toISOString(), payload: { scope: 'global', props: { first_name: 'Ada', eve_profile: { name: 'Cloud account', first_name: 'Ada', preferences: { language: 'en' } } } } } } : {}) }));
    expect((await transferGuestWorkspace(owner, other, { operationId })).ok).toBe(true);
    const local = await getGuestAtome(other, other);
    expect(local.atome_type).toBe('user'); expect(local.properties.eve_profile).toEqual({ name: 'Local account', first_name: 'Ada', preferences: { language: 'fr' } });
    expect((await listWorkspaceEvents(other)).filter(event => event.id === 'cloud-profile-import:local')).toHaveLength(1);
});

it('hydrates local personal fields even when the remote account needs no adoption event', async () => {
    await upsertUserProfile({ name: 'Guest' });
    const operationId = '770e8400-e29b-41d4-a716-446655440000';
    setGuestWorkspace({ user: { id: owner }, adoptionAccountId: other, adoptionOperationId: operationId });
    setSessionState({ mode: 'authenticated', user: { id: other }, backend: 'fastify' });
    cloud.mockImplementation(async message => message.type === 'state-current'
        ? { ok: true, state: { properties: { name: 'Existing account', eve_profile: { name: 'Existing account' } } } }
        : { ok: true, status: 'completed', profile_event: null });
    expect((await transferGuestWorkspace(owner, other, { operationId })).ok).toBe(true);
    expect((await getGuestAtome(other, other)).properties.name).toBe('Existing account');
    expect((await getGuestAtome(owner, owner)).properties.name).toBe('Guest');
});
