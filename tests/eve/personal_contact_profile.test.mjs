import { test, expect } from 'vitest';
import { createLocalContactsSource } from '../../atome/src/squirrel/contacts/local_source.js';

const phone = '+33612345678';
const card = { id: 'me', first_name: 'Alice', name: 'Alice Martin', nickname: 'Ali', phones: [{ value: phone }] };
function fixture() {
    let user = { mode: 'authenticated', user: { id: 'owner', phone } };
    const records = new Map([['owner', { atome_id: 'owner', owner_id: 'owner', type: 'user', properties: {
        username: 'opaque-account-name', eve_profile: { preferences: { language: 'fr' }, sharing: { fields: [] } }, access: 'private'
    }, property_versions: { username: 1, eve_profile: 1, access: 1 } }]]);
    const writes = [];
    const api = { async listStateCurrent(_, { atomeType }) { return [...records.values()].filter(row => row.type === atomeType); },
        async getStateCurrent(id) { return structuredClone(records.get(id)); },
        async commit(event) {
            const previous = records.get(event.atome_id);
            const props = event.props || event.payload?.props;
            if (Object.entries(event.payload?.expected_versions || {}).some(([key, version]) => version !== (previous?.property_versions?.[key] || 0)))
                return { ok: false, error: 'property_version_conflict' };
            writes.push(event);
            const versions = { ...previous?.property_versions };
            for (const key of Object.keys(props || {})) versions[key] = (versions[key] || 0) + 1;
            records.set(event.atome_id, { atome_id: event.atome_id, owner_id: user.user.id, type: event.type,
                properties: { ...previous?.properties, ...props }, property_versions: versions, deleted_at: event.kind === 'delete' ? 'deleted' : null });
            return { ok: true };
        } };
    // The eVe profile owner: `atome_not_available_locally` while the account's profile has not reached this device.
    const profile = { arriving: false, loads: [] };
    const loadProfile = async (id, options) => { profile.loads.push({ id, ...options });
        return profile.arriving ? { ok: false, error: 'atome_not_available_locally' } : { ok: true, userId: id }; };
    return { api: () => api, session: () => user, loadProfile, profile, records, writes, change: () => { user = { mode: 'authenticated', user: { id: 'other', phone } }; } };
}
const meta = { source_key: 'macos_contacts', complete: true, cursor: 'one', personal_candidates: [card] };
test('unique verified phone fills one account and repeated imports preserve manual changes and privacy', async () => {
    const f = fixture(), source = createLocalContactsSource(f);
    const first = await source.importContacts([card, { id: 'other-card', name: 'Bob' }], meta);
    expect(first.personal_profile).toMatchObject({ principal_id: 'owner', external_id: 'me' });
    expect(source.listContactsSync().items).toHaveLength(1);
    const props = f.records.get('owner').properties;
    expect(props).toMatchObject({ name: card.name, first_name: 'Alice', username: 'opaque-account-name', access: 'private',
        eve_profile: { preferences: { language: 'fr' }, sharing: { fields: [] } } });
    const count = f.writes.length;
    await createLocalContactsSource(f).importContacts([card, { id: 'other-card', name: 'Bob' }], meta);
    expect(f.writes.slice(count)).toEqual([]);
    props.name = 'My manual name'; props.eve_profile.name = 'My manual name';
    props.first_name = ''; props.eve_profile.first_name = '';
    await source.importContacts([{ ...card, name: 'New native name', first_name: 'Alicia' }], meta);
    expect(f.records.get('owner').properties).toMatchObject({ name: 'My manual name', first_name: '' });
    expect([...f.records.values()].find(row => row.type === 'import_origin' && row.properties.domain_type === 'user')
        .properties.conflicts.name.external).toBe('New native name');
});
test.each([{ candidates: [] }, { candidates: [card, { ...card, id: 'ambiguous' }] }])('absent or ambiguous phone never chooses a card', async ({ candidates }) => {
    const f = fixture(), source = createLocalContactsSource(f);
    await source.importContacts([card], { ...meta, personal_candidates: candidates });
    expect(f.records.get('owner').properties.name).toBeUndefined();
    expect(source.listContactsSync().items).toHaveLength(1);
});
test('explicit selection keeps the principal, suppresses the ordinary card and survives a new source', async () => {
    const f = fixture(), source = createLocalContactsSource(f);
    await source.importContacts([card], { ...meta, personal_candidates: [] });
    const id = source.listContactsSync().items[0].id;
    expect(await source.selectPersonalContact(id)).toMatchObject({ ok: true, principal_id: 'owner' });
    expect((await createLocalContactsSource(f).importContacts([card], { ...meta, personal_candidates: [] })).items).toHaveLength(0);
    expect(f.records.get('owner').type).toBe('user');
});
test('late account changes refuse the profile mutation', async () => {
    const f = fixture();
    const api = f.api(), read = api.listStateCurrent;
    api.listStateCurrent = async (...args) => { const rows = await read(...args); f.change(); return rows; };
    await expect(createLocalContactsSource(f).importContacts([card], meta)).rejects.toThrow('import_session_changed');
    expect(f.writes).toHaveLength(0);
});
test('a manual edit during the profile commit is rejected and never overwritten', async () => {
    const f = fixture(), api = f.api(), commit = api.commit;
    let raced = false;
    api.commit = async event => {
        if (event.atome_id === 'owner' && !raced) {
            raced = true;
            const row = f.records.get('owner');
            row.properties.eve_profile = { ...row.properties.eve_profile, name: 'Manual value' };
            row.properties.name = 'Manual value'; row.property_versions.eve_profile++;
            row.property_versions.name = 1;
        }
        return commit(event);
    };
    await expect(createLocalContactsSource(f).importContacts([card], meta)).rejects.toThrow('property_version_conflict');
    expect(f.records.get('owner').properties.name).toBe('Manual value');
    expect([...f.records.values()].some(row => row.type === 'import_source_state')).toBe(false);
    await createLocalContactsSource(f).importContacts([card], meta);
    expect(f.records.get('owner').properties.name).toBe('Manual value');
});
test('a device that has not received the account profile leaves it untouched, keeps the card out of the book, then fills it', async () => {
    const f = fixture();
    const bare = { atome_id: 'owner', owner_id: 'owner', type: 'user', properties: { username: 'opaque-account-name' }, property_versions: { username: 1 } };
    f.records.set('owner', bare);
    f.profile.arriving = true;
    const source = createLocalContactsSource(f);
    const first = await source.importContacts([card, { id: 'other-card', name: 'Bob' }], meta);
    expect(first.personal_profile).toMatchObject({ external_id: 'me', changed: false, deferred: 'account_profile_arriving' });
    expect(f.writes.filter(event => event.atome_id === 'owner')).toEqual([]);
    expect(f.records.get('owner').properties.eve_profile).toBeUndefined();
    expect(source.listContactsSync().items.map(item => item.name)).toEqual(['Bob']);
    // The account's profile arrives (synchronization), then the next pass fills only what it lacks.
    f.records.set('owner', { ...bare, properties: { ...bare.properties, name: 'Account name',
        eve_profile: { name: 'Account name', preferences: { contacts: { favorites: [{ id: 'contact_1' }] } } } },
        property_versions: { username: 1, name: 1, eve_profile: 1 } });
    f.profile.arriving = false;
    await source.importContacts([card, { id: 'other-card', name: 'Bob' }], meta);
    expect(f.records.get('owner').properties).toMatchObject({ name: 'Account name', first_name: 'Alice',
        eve_profile: { name: 'Account name', first_name: 'Alice', preferences: { contacts: { favorites: [{ id: 'contact_1' }] } } } });
});
