import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

import { BEVY_ICON_BUTTON_TOKENS } from '../../eVe/intuition/shared/bevy_ui_icon_button.js';
import { contactPanelMode, contactSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_runtime.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { panelBandTool } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_band.js';
import * as contactPickerApi from '../../eVe/intuition/tools/contact_picker.js';

const visit = (root, predicate) => {
    if (Array.isArray(root)) return root.map((child) => visit(child, predicate)).find(Boolean) || null;
    if (!root) return null;
    if (predicate(root)) return root;
    return (root.children || []).map((child) => visit(child, predicate)).find(Boolean) || null;
};

const contacts = [
    { id: 'local_ada', source_contact_id: 'local_ada', source_provider: 'eve_contacts_local', source_writable: true, name: 'Ada', phone: '0600000000', custom_fields: [] },
    { id: 'local_grace', source_contact_id: 'local_grace', source_provider: 'eve_contacts_local', source_writable: true, name: 'Grace', phone: '0611111111', custom_fields: [] }
];

const installEnvironment = () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    dom.window.Squirrel = { contacts: {
        list: () => ({ items: contacts.map((contact) => ({ ...contact })) }),
        ensureReady: async () => ({ ok: true, items: contacts }),
        sources: () => ({ items: [] }),
        deleteLocalContact: async () => ({ ok: true })
    } };
    dom.window.AdoleAPI = {
        auth: { getCurrentInfo: () => ({ id: 'current_user', name: 'Current user' }) },
        directory: { list: async () => ({ entries: [] }) }
    };
    return dom;
};

const openPanel = async ({ mode, onPick = null } = {}) => {
    const dom = installEnvironment();
    const release = await contactSurface.onOpen({
        context: { mode, ...(onPick ? { onPick } : {}) }, refresh: () => {}
    });
    await contactSurface.handleEvent({ type: 'contact.refresh' });
    return { dom, release };
};

const draw = () => {
    const emitted = [];
    const snapshot = contactSurface.readState();
    const content = contactSurface.buildContent(snapshot, { emit: (intent) => emitted.push(intent), bodyWidth: 388 });
    // The panel's tools lie in its foot band (bevy_panel_band.js): one item per tool, by its key.
    const tools = contactSurface.buildBandTools(contactSurface.readState(), { emit: (intent) => emitted.push(intent) });
    return { content, tools, emitted };
};

test('the pick mode of the Contact panel is the Communication picker, not a second surface', async () => {
    const { dom, release } = await openPanel({ mode: 'pick', onPick: () => {} });
    try {
        const snapshot = contactSurface.readState();
        assert.equal(contactPanelMode(), 'pick');
        assert.equal(snapshot.mode, 'pick');
        assert.equal(snapshot.title, 'Choisir un contact');
        assert.deepEqual(snapshot.entries.map((entry) => entry.id), ['current_user', 'local_ada', 'local_grace'],
            'the current user stays first even in the picker: that row is the way to their settings');
        assert.equal(snapshot.entries[0].selectable, false, 'one does not pick oneself as a recipient');
        assert.equal(snapshot.entries.slice(1).every((entry) => entry.selectable), true, 'every other listed person can be picked');
        assert.equal(snapshot.selectableCount, 2);

        const { content } = draw();
        assert.equal(visit(content, (node) => node.id === 'contact_select_local_ada').kind, 'checkbox');
        assert.equal(visit(content, (node) => node.id === 'contact_select_current_user_protected').kind, 'panel',
            'the own row keeps its reserved rail column but cannot be checked');
    } finally {
        release?.();
        await contactSurface.onClose?.();
        dom.window.close();
    }
});

test('the pick band chooses the checked people and stays inert without a selection', async () => {
    const picked = [];
    const { dom, release } = await openPanel({ mode: 'pick', onPick: (recipients) => picked.push(recipients) });
    try {
        let { tools, emitted } = draw();
        const tool = (key) => tools.find((item) => item.key === key);
        assert.deepEqual(tools.map((item) => item.key), ['contact_search', 'contact_pick_choose'],
            'picking offers the search and Choix, never a deletion or a selection of all');
        assert.equal(tool('contact_pick_choose').label, panelBandTool('choose').label);
        assert.equal(tool('contact_pick_choose').disabled, true, 'without a selection the tool is inert');

        await contactSurface.handleEvent({ type: 'contact.selection.toggle_all' });
        ({ tools, emitted } = draw());
        assert.equal(tool('contact_pick_choose').disabled, false);
        tool('contact_pick_choose').onSelect();
        assert.deepEqual(emitted.at(-1), { type: 'contact.pick.selection' });
        assert.equal(tool('contact_select_all'), undefined);
        assert.equal(tool('contact_delete'), undefined);

        const result = await contactSurface.handleEvent({ type: 'contact.pick.selection' });
        assert.equal(result.ok, true);
        assert.deepEqual(picked, [[
            { id: 'local_ada', name: 'Ada', phone: '0600000000' },
            { id: 'local_grace', name: 'Grace', phone: '0611111111' }
        ]]);
        assert.deepEqual(contactSurface.readState().selectedIds, [], 'the panel hands the choice over and lets go');
    } finally {
        release?.();
        await contactSurface.onClose?.();
        dom.window.close();
    }
});

test('a row click picks one person in pick mode while the caret keeps unfolding the card', async () => {
    const picked = [];
    const { dom, release } = await openPanel({ mode: 'pick', onPick: (recipients) => picked.push(recipients) });
    try {
        const { content, emitted } = draw();
        const header = visit(content, (node) => node.id === 'contact_accordion_local_ada_header');
        header.on.activate();
        assert.deepEqual(emitted.at(-1), { type: 'contact.pick', id: 'local_ada' });

        const own = visit(content, (node) => node.id === 'contact_accordion_current_user_header');
        assert.deepEqual(Object.keys(own.on || {}), ['activate'],
            'the own row unfolds its settings instead of picking itself as a recipient');
        own.on.activate();
        assert.deepEqual(emitted.at(-1), { type: 'contact.accordion.toggle', id: 'current_user' });

        const chevron = visit(content, (node) => node.id === 'contact_accordion_local_ada_chevron');
        assert.equal(chevron.kind, 'button', 'the caret is a control of its own when the row chooses');
        chevron.on.activate();
        assert.deepEqual(emitted.at(-1), { type: 'contact.accordion.toggle', id: 'local_ada' });

        const result = await contactSurface.handleEvent({ type: 'contact.pick', id: 'local_grace' });
        assert.deepEqual(picked, [[{ id: 'local_grace', name: 'Grace', phone: '0611111111' }]]);
        assert.equal(result.ok, true);
    } finally {
        release?.();
        await contactSurface.onClose?.();
        dom.window.close();
    }
});

test('the book mode keeps the whole row as the unfold and only offers the deletable rows to the rail', async () => {
    const { dom, release } = await openPanel();
    try {
        const snapshot = contactSurface.readState();
        assert.equal(contactPanelMode(), 'book');
        assert.equal(snapshot.title, 'Contact');
        assert.deepEqual(snapshot.entries.map((entry) => entry.id), ['current_user', 'local_ada', 'local_grace']);
        assert.equal(snapshot.entries[0].selectable, false, 'one does not select oneself for deletion');
        assert.equal(snapshot.selectableCount, 2);

        const { content, emitted } = draw();
        const header = visit(content, (node) => node.id === 'contact_accordion_local_ada_header');
        assert.deepEqual(Object.keys(header.on || {}).sort(), ['activate', 'long_press'],
            'the book row unfolds at a tap and is ticked by a hold, it does not pick');
        header.on.activate();
        assert.deepEqual(emitted.at(-1), { type: 'contact.accordion.toggle', id: 'local_ada' });
        header.on.long_press();
        assert.deepEqual(emitted.at(-1), { type: 'contact.selection.hold', id: 'local_ada' });
        const own = visit(content, (node) => node.id === 'contact_accordion_current_user_header');
        assert.equal(own.on.long_press, undefined, 'the own row cannot be held into the selection');
        assert.equal(visit(content, (node) => node.id === 'contact_accordion_local_ada_chevron').kind, 'panel',
            'without a row-level choice the caret belongs to the header');
    } finally {
        release?.();
        await contactSurface.onClose?.();
        dom.window.close();
    }
});

test('a contact row is doubled and its face follows the shared row density', async () => {
    const { dom, release } = await openPanel();
    try {
        const { content } = draw();
        const row = visit(content, (node) => node.id === 'contact_entry_local_ada');
        const avatar = visit(content, (node) => node.id === 'contact_local_ada_header_avatar');
        const rail = visit(content, (node) => node.id === 'contact_select_local_ada');
        const accordion = visit(content, (node) => node.id === 'contact_accordion_local_ada');

        assert.equal(row.style.size[1], 60, 'a contact row is twice the default list row');
        assert.deepEqual(avatar.style.size, [BEVY_PANEL_TOKENS.contactIdentity.tallRowAvatarSizePx, BEVY_PANEL_TOKENS.contactIdentity.tallRowAvatarSizePx]);
        assert.deepEqual(rail.style.position, [
            BEVY_PANEL_TOKENS.listRow.selectionInsetPx,
            (BEVY_PANEL_TOKENS.listRow.tall.heightPx - BEVY_ICON_BUTTON_TOKENS.sizePx) / 2
        ], 'the rail keeps the leading column and centers itself in the doubled row');
        assert.equal(accordion.style.position[0], BEVY_ICON_BUTTON_TOKENS.sizePx + BEVY_PANEL_TOKENS.gapPx,
            'the accordion starts after the rail, never under it');
    } finally {
        release?.();
        await contactSurface.onClose?.();
        dom.window.close();
    }
});

// Créer in the band adds a local contact to the book (user, 27 Oct. 2026); the picker only chooses.
test('the book band creates a contact while the picker band offers no creation', async () => {
    const { dom, release } = await openPanel();
    try {
        const { tools, emitted } = draw();
        const create = tools.find((item) => item.key === 'contact_create');
        assert.equal(create.label, panelBandTool('create').label, 'the label is the shared band tool, not a second wording');
        assert.equal(tools.at(-1), create, 'Créer closes the book tools');
        create.onSelect();
        assert.deepEqual(emitted.at(-1), { type: 'contact.add' });
    } finally {
        release?.();
        await contactSurface.onClose?.();
        dom.window.close();
    }

    const picker = await openPanel({ mode: 'pick', onPick: () => {} });
    try {
        const { tools } = draw();
        assert.equal(tools.some((item) => item.key === 'contact_create'), false);
    } finally {
        picker.release?.();
        await contactSurface.onClose?.();
        picker.dom.window.close();
    }
});

test('the picker API stays the same question asked to the one Contact panel', () => {
    assert.deepEqual(
        Object.keys(contactPickerApi).sort(),
        ['closeContactPicker', 'isContactPickerOpen', 'openContactPicker']
    );
    assert.equal(contactPickerApi.isContactPickerOpen(), false, 'no panel is mounted in this process');
    assert.doesNotThrow(() => contactPickerApi.closeContactPicker());
});
