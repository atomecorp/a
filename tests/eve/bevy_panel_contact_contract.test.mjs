import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

import { contactSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_runtime.js';

const visit = (root, predicate) => {
    if (Array.isArray(root)) return root.map((child) => visit(child, predicate)).find(Boolean) || null;
    if (!root) return null;
    if (predicate(root)) return root;
    return (root.children || []).map((child) => visit(child, predicate)).find(Boolean) || null;
};

const visitAll = (root, predicate, matches = []) => {
    if (Array.isArray(root)) {
        root.forEach((child) => visitAll(child, predicate, matches));
        return matches;
    }
    if (!root) return matches;
    if (predicate(root)) matches.push(root);
    (root.children || []).forEach((child) => visitAll(child, predicate, matches));
    return matches;
};

const installContactEnvironment = ({
    items,
    directory = [],
    current,
    writes = [],
    creates = [],
    sources = [],
    imports = [],
    importSource = null,
    deleteContact = null
}) => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    dom.window.Squirrel = { contacts: {
        list: () => ({ items: items.map((item) => ({ ...item })) }),
        ensureReady: async () => ({ ok: true, items }),
        sources: () => ({ items: sources.map((source) => ({ ...source })) }),
        importSource: async (sourceId) => {
            imports.push(sourceId);
            if (typeof importSource === 'function') return importSource(sourceId);
            return { ok: true, imported: 2, source_id: sourceId };
        },
        createLocalContact: async (contact) => {
            const id = `local_created_${creates.length + 1}`;
            const next = {
                id,
                source_contact_id: id,
                source_provider: 'eve_contacts_local',
                source_writable: true,
                read_only: false,
                custom_fields: [],
                ...contact
            };
            creates.push(next);
            items.push(next);
            return { ok: true, contact: next };
        },
        updateLocalContact: async (id, draft) => {
            writes.push({ id, draft: { ...draft, custom_fields: draft.custom_fields.map((entry) => ({ ...entry })) } });
            const target = items.find((item) => item.id === id || item.source_contact_id === id);
            if (target) Object.assign(target, draft);
            return { ok: !!target, contact: target || null };
        },
        deleteLocalContact: async (id) => {
            if (typeof deleteContact === 'function') return deleteContact(id, items);
            const index = items.findIndex((item) => item.id === id || item.source_contact_id === id);
            if (index >= 0) items.splice(index, 1);
            return { ok: index >= 0 };
        }
    } };
    dom.window.AdoleAPI = { auth: {
        getCurrentInfo: () => ({ ...current }),
        list: async () => ({ directory: [{ id: 'private_bait', name: 'Must not appear', visibility: 'private' }] })
    }, directory: {
        list: async () => ({ entries: directory.map((entry) => ({ ...entry })) })
    } };
    return dom;
};

test('Contact lists the authenticated profile once at the top and one folded accordion per stable identity', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const items = [
        { id: 'local_ada', source_contact_id: 'local_ada', source_provider: 'eve_contacts_local', source_writable: true, name: 'Ada', first_name: 'Lovelace', phone: '0600000000', custom_fields: [] },
        { id: 'local_grace', source_contact_id: 'local_grace', source_provider: 'eve_contacts_local', source_writable: true, name: 'Grace', first_name: 'Hopper', phone: '0600000000', custom_fields: [] }
    ];
    installContactEnvironment({
        items,
        current: { id: 'current_user', name: 'Godard3', first_name: 'Jeezs3', phone: '0600000000' },
        directory: [
            { principal_id: 'current_user', display_name: 'Godard3', user_face: '', revision: 1 },
            { principal_id: 'remote_user', display_name: 'Remote', user_face: '/remote.png', revision: 1 }
        ]
    });

    try {
        await contactSurface.handleEvent({ type: 'contact.refresh' });
        const snapshot = contactSurface.readState();
        assert.deepEqual(snapshot.entries.map((entry) => entry.id), ['current_user', 'local_ada', 'local_grace', 'remote_user']);
        assert.equal(snapshot.entries[0].current, true);
        assert.equal(snapshot.entries[0].deletable, false, 'the authenticated profile cannot enter deletion selection');
        assert.equal(snapshot.entries.at(-1).label, 'Remote', 'a public card is named by its published display name');
        assert.equal(snapshot.entries.some((entry) => entry.id === 'private_bait'), false);

        const emitted = [];
        const content = contactSurface.buildContent(snapshot, { emit: (intent) => emitted.push(intent), bodyWidth: 388 });
        assert.equal(visitAll(content, (node) => node.id === 'contact_accordion_current_user').length, 1);
        assert.equal(visit(content, (node) => node.id === 'contact_select_current_user_protected').kind, 'panel');
        assert.equal(visit(content, (node) => node.id === 'contact_select_local_ada').kind, 'checkbox');
        assert.deepEqual(
            visit(content, (node) => node.id === 'contact_select_current_user_protected').style.position,
            visit(content, (node) => node.id === 'contact_select_local_ada').style.position,
            'the column reserved for a non-selectable row sits exactly where the rail does'
        );
        assert.match(visit(content, (node) => node.id === 'contact_current_user_header_avatar_image').image.source, /user\.svg$/);
        assert.equal(visit(content, (node) => node.id === 'contact_remote_user_header_avatar_image').image.source, '/remote.png');
        assert.equal(visitAll(content, (node) => String(node.id || '').endsWith('_body')).length, 0, 'every row starts folded');
        visit(content, (node) => node.id === 'contact_accordion_local_ada_header').on.activate();
        assert.deepEqual(emitted.at(-1), { type: 'contact.accordion.toggle', id: 'local_ada' });
    } finally {
        await contactSurface.onClose?.();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('Contact unfolds the card of a person in place, built by the Home card', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const creates = [];
    const items = [
        { id: 'local_ada', source_contact_id: 'local_ada', source_provider: 'eve_contacts_local', source_writable: true, name: 'Ada', custom_fields: [] }
    ];
    installContactEnvironment({
        items, creates,
        current: { id: 'current_user', name: 'Current' },
        directory: [{ principal_id: 'remote_user', display_name: 'Remote', nickname: 'Rem', user_face: '', revision: 1 }]
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
    const build = () => contactSurface.buildContent(contactSurface.readState(), { emit: () => {}, bodyWidth: 388 });

    try {
        await contactSurface.handleEvent({ type: 'contact.refresh' });
        await contactSurface.handleEvent({ type: 'contact.accordion.toggle', id: 'remote_user' }, { refresh: () => {} });
        await settle();
        assert.equal(contactSurface.readState().expandedId, 'remote_user');
        let content = build();
        assert.ok(visit(content, (node) => node.id === 'contact_accordion_remote_user_body'));
        assert.ok(visit(content, (node) => node.id === 'home_identity_nickname'), 'the body is the Home card');
        assert.equal(visit(content, (node) => node.id === 'home_settings_accordion'), null);

        await contactSurface.handleEvent({ type: 'contact.accordion.toggle', id: 'local_ada' }, { refresh: () => {} });
        await settle();
        content = build();
        assert.equal(visit(content, (node) => node.id === 'contact_accordion_remote_user_body'), null, 'one card at a time');
        assert.ok(visit(content, (node) => node.id === 'home_custom_fields_add'), 'an address-book contact stays editable');

        await contactSurface.handleEvent({ type: 'contact.add' }, { refresh: () => {} });
        await settle();
        assert.equal(creates.length, 1);
        assert.match(creates[0].name, /contact 1$/i);
        assert.equal(contactSurface.readState().expandedId, 'local_created_1');
    } finally {
        await contactSurface.onClose?.();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('Contact selection rail supports additive drag and cancellation', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const items = [
        { id: 'local_a', source_contact_id: 'local_a', source_provider: 'eve_contacts_local', source_writable: true, name: 'A', custom_fields: [] },
        { id: 'local_b', source_contact_id: 'local_b', source_provider: 'eve_contacts_local', source_writable: true, name: 'B', custom_fields: [] },
        { id: 'local_c', source_contact_id: 'local_c', source_provider: 'eve_contacts_local', source_writable: true, name: 'C', custom_fields: [] }
    ];
    installContactEnvironment({ items, current: { id: 'current_user', name: 'Current user' } });

    try {
        await contactSurface.handleEvent({ type: 'contact.refresh' });
        const content = contactSurface.buildContent(contactSurface.readState(), { emit: () => {}, bodyWidth: 388 });
        const rowTop = (id) => visit(content, (node) => node.id === `contact_entry_${id}`).style.position[1];
        const first = { top: rowTop('local_a') };
        const third = { top: rowTop('local_c') };
        await contactSurface.handleEvent({ type: 'contact.selection.press', id: 'local_a', event: { y: 8 } });
        await contactSurface.handleEvent({
            type: 'contact.selection.drag',
            id: 'local_a',
            event: { y: third.top - first.top + 8 }
        });
        await contactSurface.handleEvent({ type: 'contact.selection.release', id: 'local_a' });
        assert.deepEqual(contactSurface.readState().selectedIds, ['local_a', 'local_b', 'local_c']);

        await contactSurface.handleEvent({ type: 'contact.selection.press', id: 'local_b', event: { y: 8 } });
        await contactSurface.handleEvent({ type: 'contact.selection.cancel', id: 'local_b' });
        assert.deepEqual(contactSurface.readState().selectedIds, ['local_a', 'local_b', 'local_c']);
        assert.deepEqual(
            await contactSurface.handleEvent({ type: 'contact.selection.press', id: 'current_user', event: { y: 8 } }),
            { ok: false, error: 'contact_not_selectable' }
        );
    } finally {
        await contactSurface.onClose?.();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('Contact fixed actions expose Import, Add, and conditional multi-delete with partial-failure recovery', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const deleteCalls = [];
    const items = [
        { id: 'local_a', source_contact_id: 'local_a', source_provider: 'eve_contacts_local', source_writable: true, name: 'A', custom_fields: [] },
        { id: 'local_b', source_contact_id: 'local_b', source_provider: 'eve_contacts_local', source_writable: true, name: 'B', custom_fields: [] }
    ];
    installContactEnvironment({
        items,
        current: { id: 'current_user', name: 'Current user' },
        sources: [{
            source_id: 'macos_contacts', role: 'import', provider: 'macos_contacts',
            interactive_import: true, label_key: 'eve.contact.import_source_apple'
        }],
        deleteContact: async (id, stored) => {
            deleteCalls.push(id);
            if (id === 'local_b') return { ok: false, error: 'locked' };
            const index = stored.findIndex((entry) => entry.id === id);
            if (index >= 0) stored.splice(index, 1);
            return { ok: index >= 0 };
        }
    });

    try {
        await contactSurface.handleEvent({ type: 'contact.refresh' });
        let snapshot = contactSurface.readState();
        let fixed = contactSurface.buildFixedContent(snapshot, { emit: () => {}, bodyWidth: 388 });
        let actionRow = visit(fixed, (node) => node.id === 'contact_fixed_actions');
        assert.deepEqual(
            actionRow.children.flatMap(row => row.children.map(child => child.id)),
            ['contact_import', 'contact_add', 'contact_create_user']
        );
        assert.equal(visit(fixed, (node) => node.id === 'contact_delete'), null, 'Delete is absent at zero selection');
        assert.equal(contactSurface.buildFooterContent, undefined, 'Contacts has no select-all footer action');

        contactSurface.buildContent(snapshot, { emit: () => {}, bodyWidth: 388 });
        await contactSurface.handleEvent({ type: 'contact.selection.press', id: 'local_a', event: { y: 8 } });
        await contactSurface.handleEvent({ type: 'contact.selection.release', id: 'local_a' });
        await contactSurface.handleEvent({ type: 'contact.selection.press', id: 'local_b', event: { y: 8 } });
        await contactSurface.handleEvent({ type: 'contact.selection.release', id: 'local_b' });
        snapshot = contactSurface.readState();
        fixed = contactSurface.buildFixedContent(snapshot, { emit: () => {}, bodyWidth: 388 });
        actionRow = visit(fixed, (node) => node.id === 'contact_fixed_actions');
        assert.deepEqual(
            actionRow.children.flatMap(row => row.children.map(child => child.id)),
            ['contact_import', 'contact_add', 'contact_create_user', 'contact_delete']
        );
        assert.equal(visit(fixed, (node) => node.id === 'contact_delete').accessibility.label, 'Supprimer (2)');

        await contactSurface.handleEvent({ type: 'contact.delete.request' });
        fixed = contactSurface.buildFixedContent(contactSurface.readState(), { emit: () => {}, bodyWidth: 388 });
        const confirmation = visit(fixed, (node) => node.id === 'contact_delete_confirmation');
        assert.equal(confirmation.kind, 'column');
        assert.deepEqual(confirmation.children.map((child) => child.id), [
            'contact_delete_confirmation_text',
            'contact_delete_confirmation_buttons'
        ]);
        assert.equal(visit(fixed, (node) => node.id === 'contact_add'), null, 'confirmation replaces the normal action bar');
        assert.equal(contactSurface.readState().status, '', 'Contact notices stay out of the shared footer');
        const result = await contactSurface.handleEvent({ type: 'contact.delete.confirm' });
        assert.equal(result.partial, true);
        assert.deepEqual(deleteCalls, ['local_a', 'local_b']);
        assert.equal(contactSurface.readState().entries.some((entry) => entry.id === 'local_a'), false);
        assert.deepEqual(contactSurface.readState().selectedIds, ['local_b']);
        assert.match(contactSurface.readState().notice, /1 supprimé.*1 en échec/i);
    } finally {
        await contactSurface.onClose?.();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('Contact filters headless sources and handles zero, one, or multiple interactive imports', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const imports = [];
    const items = [];
    installContactEnvironment({
        items,
        current: { id: 'current_user', name: 'Current user' },
        imports,
        sources: [
            { source_id: 'apple', role: 'import', provider: 'apple', interactive_import: true, label_key: 'eve.contact.import_source_apple' },
            { source_id: 'device', role: 'import', provider: 'device', interactive_import: true },
            { source_id: 'icloud_contacts', role: 'import', provider: 'icloud', interactive_import: false }
        ]
    });

    try {
        await contactSurface.handleEvent({ type: 'contact.refresh' });
        assert.deepEqual(contactSurface.readState().importSources.map((source) => source.source_id), ['apple', 'device']);
        const request = await contactSurface.handleEvent({ type: 'contact.import.request' });
        assert.equal(request.revealNodeId, 'contact_import_source_chooser');
        const content = contactSurface.buildContent(contactSurface.readState(), { emit: () => {}, bodyWidth: 388 });
        const chooser = visit(content, (node) => node.id === 'contact_import_source_chooser');
        assert.ok(chooser);
        assert.equal(visit(chooser, (node) => node.id === 'contact_import_source_icloud_contacts'), null);
        await contactSurface.handleEvent({ type: 'contact.import.source', sourceId: 'device' });
        assert.deepEqual(imports, ['device']);
        assert.match(contactSurface.readState().notice, /2 contacts importés/i);
    } finally {
        await contactSurface.onClose?.();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }

    const emptyDom = installContactEnvironment({ items: [], current: { id: 'current_user', name: 'Current user' } });
    try {
        await contactSurface.handleEvent({ type: 'contact.refresh' });
        const fixed = contactSurface.buildFixedContent(contactSurface.readState(), { emit: () => {}, bodyWidth: 388 });
        assert.equal(visit(fixed, (node) => node.id === 'contact_import').on, undefined);
        const content = contactSurface.buildContent(contactSurface.readState(), { emit: () => {}, bodyWidth: 388 });
        assert.ok(visit(content, (node) => node.id === 'contact_import_unavailable_notice'));
        assert.equal((await contactSurface.handleEvent({ type: 'contact.import.request' })).ok, false);
    } finally {
        await contactSurface.onClose?.();
        emptyDom.window.close();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('Contact reports denied interactive import permission without blocking the panel', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    installContactEnvironment({
        items: [],
        current: { id: 'current_user', name: 'Current user' },
        sources: [{ source_id: 'apple', role: 'import', provider: 'apple', interactive_import: true }],
        importSource: async () => ({ ok: false, error: 'macos_contacts_permission_denied', permission: 'denied' })
    });

    try {
        await contactSurface.handleEvent({ type: 'contact.refresh' });
        const result = await contactSurface.handleEvent({ type: 'contact.import.request' });
        assert.equal(result.ok, false);
        assert.match(contactSurface.readState().notice, /pas été autorisé/i);
        assert.equal(contactSurface.readState().entries[0].id, 'current_user', 'permission refusal leaves the Contact panel usable');
    } finally {
        await contactSurface.onClose?.();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('Dashboard and panel readers share slow hydration, never read a stale cache, and surface permission failures', async () => {
    const { readLocalContacts } = await import('../../eVe/intuition/tools/contact_model_helpers.js');
    let release, hydrated = false, reads = 0, hydrations = 0;
    const pending = new Promise(resolve => { release = resolve; });
    const api = { ensureReady: async () => { hydrations += 1; await pending; hydrated = true; return { ok: true }; },
        list: () => { reads += 1; assert.equal(hydrated, true); return { items: [{ id: 'canonical' }] }; } };
    const dashboard = readLocalContacts(api);const panel = readLocalContacts(api);
    await Promise.resolve();assert.equal(reads, 0);assert.equal(hydrations, 1);
    release();assert.deepEqual(await dashboard, await panel);assert.equal(reads, 1);
    await readLocalContacts(api);assert.equal(reads, 2, 'an import invalidation must read fresh data');
    const failed = { ensureReady: async () => ({ ok: false, error: 'permission_denied' }), list: () => { throw Error('must_not_read'); } };
    await assert.rejects(readLocalContacts(failed), /permission_denied/);
});

test('direct contact opening waits for hydration, reopens the same card without toggling it, and reports a vanished contact', async () => {
    const previousWindow=globalThis.window, previousDocument=globalThis.document;
    const dom=installContactEnvironment({items:[{id:'ada',name:'Ada',source_provider:'eve_contacts_local',source_writable:true}],current:{id:'self',name:'Self'}});
    let release;const ready=new Promise(resolve=>{release=resolve;});
    dom.window.Squirrel.contacts.ensureReady=async()=>{await ready;return {ok:true};};
    let revealed='';let settled=false;
    try {
        const opening=contactSurface.onOpen({context:{contactId:'ada'},refresh:()=>{},reveal:id=>{revealed=id;}}).then(cleanup=>{settled=true;return cleanup;});
        await Promise.resolve();assert.equal(settled,false);release();const cleanup=await opening;
        assert.equal(contactSurface.readState().expandedId,'ada');assert.equal(revealed,'contact_accordion_ada_header');cleanup();
        const cleanupAgain=await contactSurface.onOpen({context:{contactId:'ada'},refresh:()=>{},reveal:()=>{}});
        assert.equal(contactSurface.readState().expandedId,'ada');cleanupAgain();
        const missing=await contactSurface.onOpen({context:{contactId:'deleted'},refresh:()=>{}});
        assert.equal(contactSurface.readState().error,true);assert.match(contactSurface.readState().notice,/introuvable|not found/i);missing();
    } finally { await contactSurface.onClose();dom.window.close();globalThis.window=previousWindow;globalThis.document=previousDocument; }
});
