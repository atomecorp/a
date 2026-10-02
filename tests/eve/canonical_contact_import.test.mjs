import { test, expect } from 'vitest';
import { createLocalContactsSource } from '../../atome/src/squirrel/contacts/local_source.js';
import { createCanonicalImport } from '../../atome/src/squirrel/shared/canonical_import.js';
import { normalizeImportedEvent } from '../../atome/src/squirrel/calendar/import_source.js';

function fixture() {
    let user = { mode: 'authenticated', user: { id: 'owner-a' }, updatedAt: 1 };
    const records = new Map(), writes = [];
    let fail = null;
    const api = {
        async listStateCurrent(project, { atomeType, offset = 0, limit = 250 }) {
            return [...records.values()].filter(row => row.owner_id === user.user.id && row.type === atomeType).slice(offset, offset + limit);
        },
        async commit(event) {
            if (fail?.(event)) throw new Error('injected_crash');
            writes.push(structuredClone(event));
            expect(event.scope).toBe('global'); expect(event.project_id).toBeUndefined();
            const key = event.atome_id, previous = records.get(key);
            records.set(key, { atome_id: key, owner_id: user.user.id, type: event.type,
                properties: event.kind === 'delete' ? previous.properties : event.props,
                ...(event.kind === 'delete' ? { deleted_at: 'deleted' } : {}) });
            return { ok: true };
        }
    };
    return { records, writes, api: () => api, session: () => user,
        switchUser(id) { user = { mode: 'authenticated', user: { id }, updatedAt: user.updatedAt + 1 }; },
        failWhen(fn) { fail = fn; } };
}
const meta = { source_key: 'account/collection', cursor: 'token-1', complete: true };

test('import survives a new source instance, preserves identities and never merges shared numbers', async () => {
    const f = fixture(), source = createLocalContactsSource(f);
    await source.importContacts([{ id: 'a', name: 'Alex', phone: '0600' }, { id: 'b', name: 'Alex', phone: '0600' }], meta);
    const first = source.listContactsSync().items;
    expect(first).toHaveLength(2);
    const count = f.writes.length;
    await source.importContacts([{ id: 'a', name: 'Alex', phone: '0600' }, { id: 'b', name: 'Alex', phone: '0600' }], meta);
    expect(f.writes).toHaveLength(count);
    await source.importContacts([{ id: 'a', name: 'Alex', phone: '0700' }], { ...meta, cursor: 'token-2' });
    const restarted = createLocalContactsSource(f);
    await restarted.syncInitial();
    expect(restarted.listContactsSync().items.find(row => row.phone === '0700').id).toBe(first.find(row => row.phone === '0600').id);
    expect(restarted.listContactsSync().items).toHaveLength(2);
});

test('three-way merge retains local edits, records external conflicts once, and updates untouched fields', async () => {
    const f = fixture(), source = createLocalContactsSource(f);
    await source.importContacts([{ id: 'a', name: 'Initial', phone: '0600', email: 'old@example.test' }], meta);
    const id = source.listContactsSync().items[0].id;
    await source.updateContact(id, { phone: '', name: 'Local' });
    await source.importContacts([{ id: 'a', name: 'External', phone: '0700', email: 'new@example.test' }], meta);
    expect(source.listContactsSync().items[0]).toMatchObject({ id, name: 'Local', phone: '', email: 'new@example.test' });
    const origin = [...f.records.values()].find(row => row.type === 'import_origin' && !row.properties.pending);
    expect(origin.properties.conflicts.name.external).toBe('External');
    expect(origin.properties.conflicts.phone.external).toBe('0700');
    const writes = f.writes.length;
    await source.importContacts([{ id: 'a', name: 'External', phone: '0700', email: 'new@example.test' }], meta);
    expect(f.writes).toHaveLength(writes);
});

test('local deletion suppresses reimport; explicit external removal preserves canonical data', async () => {
    const f = fixture(), source = createLocalContactsSource(f);
    await source.importContacts([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], meta);
    const id = source.listContactsSync().items.find(row => row.name === 'A').id;
    await source.deleteContact(id);
    await source.importContacts([{ id: 'a', name: 'A' }], { ...meta, removed_ids: ['b'] });
    expect(source.listContactsSync().items.map(row => row.name)).toEqual(['B']);
    expect([...f.records.values()].find(row => row.type === 'import_origin' && row.properties.external_id === 'b').properties.removed).toBe(true);
});

test('crash after reservation reuses canonical id and never advances the checkpoint', async () => {
    const f = fixture(), source = createLocalContactsSource(f);
    f.failWhen(event => event.type === 'contact');
    await expect(source.importContacts([{ id: 'a', name: 'A' }], meta)).rejects.toThrow('injected_crash');
    const reserved = [...f.records.values()][0].properties.canonical_id;
    expect([...f.records.values()].some(row => row.type === 'import_source_state')).toBe(false);
    f.failWhen(null);
    await source.importContacts([{ id: 'a', name: 'A' }], meta);
    expect(source.listContactsSync().items[0].id).toBe(reserved);
    expect(source.listContactsSync().items).toHaveLength(1);
});

test('late source reads cannot write after the account changes', async () => {
    const f = fixture();
    const api = f.api();
    const original = api.listStateCurrent;
    api.listStateCurrent = async (...args) => { const result = await original(...args); f.switchUser('owner-b'); return result; };
    const store = createCanonicalImport({ ...f, type: 'contact' });
    await expect(store.collect([{ id: 'a', name: 'Private' }], meta)).rejects.toThrow('import_session_changed');
    expect(f.writes).toHaveLength(0);
});
test('group members reference canonical contacts across partial batches and source restarts', async () => {
    const f=fixture(),source=createLocalContactsSource(f);
    await source.importContacts([{id:'a',name:'A',collections:['friends']},{id:'b',name:'B'}],
        {...meta,groups:[{id:'friends',name:'Friends',members:['a','b']}]});
    const members=[...f.records.values()].find(row=>row.type==='contact_group').properties.members;
    expect(members.sort()).toEqual(source.listContactsSync().items.map(item=>item.id).sort());
    await createLocalContactsSource(f).importContacts([{id:'b',name:'B2'}],
        {...meta,groups:[{id:'friends',name:'Friends',members:['a','b']}]});
    expect([...f.records.values()].find(row=>row.type==='contact_group').properties.members.sort()).toEqual(members);
});
test('unread fields retain their previous baseline and later external edits remain importable',async()=>{
    const f=fixture(),source=createLocalContactsSource(f);
    await source.importContacts([{id:'a',name:'A',note:'one'}],meta);
    await source.importContacts([{id:'a',name:'A2'}],meta);
    await source.importContacts([{id:'a',name:'A2',note:'two'}],meta);
    expect(source.listContactsSync().items[0].note).toBe('two');
});
test('calendar temporal fields reconcile as a unit while unrelated external edits still apply',async()=>{
    const f=fixture(),store=createCanonicalImport({...f,type:'calendar_event',normalize:normalizeImportedEvent});
    const first={id:'series',title:'One',start:'2026-10-01T09:00:00Z',end:'2026-10-01T10:00:00Z',timezone:'UTC',calendarId:'cal',sequence:1};
    await store.collect([first],meta);
    const entity=[...f.records.values()].find(row=>row.type==='calendar_event');
    entity.properties.end='2026-10-01T11:00:00.000Z';
    await store.collect([{...first,title:'Two',start:'2026-10-02T09:00:00Z',end:'2026-10-02T10:00:00Z',sequence:2}],meta);
    const props=f.records.get(entity.atome_id).properties;
    expect(props).toMatchObject({title:'Two',start:'2026-10-01T09:00:00.000Z',end:'2026-10-01T11:00:00.000Z'});
    await store.collect([{...first,title:'Stale',sequence:1}],meta);
    expect(f.records.get(entity.atome_id).properties.title).toBe('Two');
});
test('delayed DAV observations cannot overwrite a newer accepted observation and origins reserve stable exchange identities',async()=>{
    const f=fixture(),source=createLocalContactsSource(f);
    await source.importContacts([{id:'a',name:'New',version:{observed_at:200,etag:'opaque-z'}}],meta);
    await source.importContacts([{id:'a',name:'Old',version:{observed_at:100,etag:'opaque-a'}}],meta);
    expect(source.listContactsSync().items[0].name).toBe('New');
    const other=createLocalContactsSource(fixture());
    await other.importContacts([{id:'a',name:'New'}],meta);
    expect(other.listContactsSync().items[0].exchange_uid).toBe(source.listContactsSync().items[0].exchange_uid);
});
