import { test, expect, vi } from 'vitest';
import { createDashboardEveAtom } from '../../eVe/domains/dashboard/dashboard_eve_atom.js';
import { createDashboardCommunicationInput } from '../../eVe/domains/dashboard/dashboard_communication_input.js';
import { bindCommData } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_comm_data.js';
import { openCommunicationNotification } from '../../eVe/intuition/tools/communication_actions.js';
import { createCommNotificationDetail } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_comm_notification_detail.js';
import { resolveBevyPanelGeometry } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_layout.js';
import { bevyUiMysticActivation } from '../../eVe/intuition/ribbon/bevy_ui_mystic_activation.js';
import { createDashboardMysticSources } from '../../eVe/domains/dashboard/dashboard_mystic_sources.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { setSessionState } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';

const voice = vi.hoisted(() => ({ invoke: vi.fn() }));
const notifications = vi.hoisted(() => ({ changed: null }));
const gateway = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../eVe/intuition/ribbon/bevy_ui_product_runtime.js', () => ({ invokeAssistant: voice.invoke }));
vi.mock('../../eVe/intuition/tools/communication.js', () => ({ subscribeCommNotifications: listener => {
    notifications.changed = listener; return () => { notifications.changed = null; };
} }));
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({ invokeToolGateway: gateway.invoke }));
// The band's sync status (dashboard_sync_status.js) listens to the window's sync events.
globalThis.window ||= new EventTarget();
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const find = (root, id) => root?.id === id ? root : root?.children?.map(child => find(child, id)).find(Boolean);

// Alone, the large disc prepares her voice and listens; a touch on the disc while she is shown calls her (she answers,
// the disc gives under the finger), the touches right after only give, and the third within `panic.withinMs` closes her:
// the disc lands in its cell and the tiles arrive. Among the tiles, a touch closes her in place.
test('automatic voice preparation stays solo; touches on her disc make her answer, and the third closes her and reveals the tiles', async () => {
    let at = 100, active = true, listener, snapshot = { active: false, phase: 'idle' }, frameId = 0;
    const frames = new Map(), modes = [], motions = [];
    const publish = next => { snapshot = { ...snapshot, ...next }; listener?.(snapshot); };
    const close = vi.fn(async () => publish({ active: false, phase: 'idle', connected: false, microphoneActive: false }));
    const api = { getState: () => snapshot, close, subscribe: fn => { listener = fn; fn(snapshot); return () => { listener = null; }; }, subscribeSignal: () => () => {} };
    voice.invoke.mockImplementation(async action => {
        if (action === 'close') return close();
        if (action === 'open') publish({ active: true, phase: 'connecting', connected: false, microphoneActive: false });
        return { ok: true };
    });
    const env = { eveAssistantApi: api, performance: { now: () => at }, matchMedia: () => ({ matches: false }),
        document: { hidden: false, addEventListener() {}, removeEventListener() {} },
        requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id),
        setTimeout: () => 0, clearTimeout() {} };
    const atom = createDashboardEveAtom({ treeId: 'home', env, now: () => at, isActive: () => active,
        uiRuntime: () => ({ updateTreeMotion: async ({ updates }) => { motions.push(updates); } }),
        readTree: () => ({ root: { id: 'logo', style: { size: [376, 632] } } }), nodeIdOf: () => 'logo',
        rectOf: () => ({ x: 128, y: 128, width: 120, height: 120 }), tileRefs: () => [], render: async () => {},
        onMode: mode => modes.push(mode) });
    atom.slotBox({ x: 128, y: 256, width: 120, height: 120 }, { x: 0, y: 0, width: 376, height: 632 });
    const soloRecords = atom.records('logo', { width: 376, height: 632 });
    const soloGlass = soloRecords.find(record => record.id.includes('_backdrop_')).properties;
    // The visible SVG disc is 224 in a 300 image box; the halo margin must stay clear.
    const disc = soloRecords.find(record => record.id.includes('_disc_')).properties;
    expect(soloGlass.width).toBeCloseTo(disc.width * 224 / 300);
    expect(soloGlass.corner_radius).toBeCloseTo(soloGlass.width / 2);
    expect(soloGlass.scaleX).toBe(disc.scaleX);
    expect(soloGlass.material.backdrop.tint[3]).toBe(0);
    expect(disc.opacity).toBeLessThan(1);
    const advance = async () => {
        for (let i = 0; i < 140; i++) {
            at += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(at)); await flush();
        }
    };
    // Only an account has an assistant: the large disc prepares her voice for a signed-in person alone.
    setSessionState({ mode: 'authenticated', user: { id: 'owner' } }, { persist: false, silent: true });
    try {
        await atom.start();
        expect(voice.invoke).toHaveBeenCalledTimes(1);
        expect(voice.invoke).toHaveBeenLastCalledWith('open', { source: 'dashboard_eve' });
        expect(atom.inspect()).toMatchObject({ mode: 'solo', listening: false });
        publish({ phase: 'listening', connected: true, microphoneActive: false });
        expect(atom.inspect().listening).toBe(false);
        publish({ phase: 'listening', connected: true, microphoneActive: true });
        expect(atom.inspect()).toMatchObject({ mode: 'solo', listening: true, present: true });
        await atom.activate();
        expect(voice.invoke).toHaveBeenCalledTimes(2); expect(voice.invoke).toHaveBeenLastCalledWith('respond', { source: 'dashboard_eve' });
        expect(await atom.activate()).toEqual({ ok: true, poked: true });
        expect(voice.invoke).toHaveBeenCalledTimes(2); expect(close).not.toHaveBeenCalled();
        await atom.activate(); await advance();
        expect(close).toHaveBeenCalledTimes(1);
        expect(atom.inspect()).toMatchObject({ mode: 'grid', resizing: false, revealing: false, present: false });
        await atom.activate(); await advance();
        expect(close).toHaveBeenCalledTimes(2); expect(atom.inspect().mode).toBe('grid');
        // The mode it starts in is told like any later one.
        expect(modes).toEqual(['solo', 'grid']);
        const glassFrames = motions.filter(updates => updates.some(update => update.nodeId.includes('_backdrop_')));
        expect(glassFrames.length).toBeGreaterThan(10);
        for (const updates of glassFrames) {
            const glass = updates.find(update => update.nodeId.includes('_backdrop_'));
            const image = updates.find(update => update.nodeId.includes('_disc_'));
            expect(glass.scale).toEqual(image.scale);
            expect(glass.opacity).toBe(1);
        }
    } finally { active = false; await atom.destroy(); setSessionState({ mode: 'logged_out' }, { persist: false, silent: true }); }
});

// The V6.1 band: the field's glass on whole cells of the screen grid, the Messages tool (a square tool, its badge the count
// of what waits, red while something urgent waits) beside it; while the field is being typed in, the tools it covers fold
// into thin traits before it (the « Finder » band) and the draft and its selection stay as they are.
test('the lower band contains only the real field and a square urgent count, preserving drafts and selection', async () => {
    let rows = [], disturbed = false, focused = true;
    const draft = 'Unfinished search', selection = { start: 3, end: 8 }, patch = vi.fn(), openMessages = vi.fn();
    bindCommData({ readNotifications: () => rows, patch, isDoNotDisturb: () => disturbed });
    const editing = { registerField: vi.fn(), fieldView: () => ({ focused, selection }) };
    const projection = createDashboardCommunicationInput({ treeId: 'home', readDraft: () => draft, openMessages, refresh() {}, env: {} });
    const build = () => projection.build({ kind: 'text', value_key: 'search', label_key: 'eve.dashboard.mystic.search_everything' },
        { box: { width: 376, height: 60 }, editing, emit() {} }, 'field');
    // A cell of 60: a tool of 55, every part inside its cells by half the joint.
    const cell = 60, tool = 55;
    const kept = tree => {
        expect(find(tree, 'field').kind).toBe('text_input');
        expect(find(tree, 'field_text').text).toBe(draft);
        expect(find(tree, 'field_selection')).toBeTruthy();
    };
    try {
        await projection.start();
        expect(build().children.map(child => child.id)).toEqual(['field_glass']);
        expect(find(build(), 'field_glass').style.size).toEqual([Math.round(376 / cell) * cell - (cell - tool), tool]);
        kept(build());
        rows = [{ id: 'old', unread: true, priority: 'urgent', fromName: 'Alice', message: 'An urgent message' }];
        notifications.changed();
        let tree = build();
        expect(tree.children.map(child => child.id)).toEqual(['field_glass', 'field_traits', 'field_trait_messages']);
        expect(find(tree, 'field_glass').style.size[0]).toBe((Math.round(376 / cell) - 1) * cell - (cell - tool));
        kept(tree);
        focused = false;
        tree = build();
        const button = find(tree, 'field_messages');
        expect(tree.children.map(child => child.id)).toEqual(['field_glass', 'field_messages']);
        expect(button.style.size).toEqual([tool, tool]);
        expect(find(button, 'field_messages_badge_count').text).toBe('1');
        expect(find(button, 'field_messages_badge').style.background).toEqual(BEVY_PANEL_TOKENS.actionButton.destructiveBackground);
        kept(tree);
        button.on.activate(); expect(openMessages).toHaveBeenCalledTimes(1);
        expect(patch).not.toHaveBeenCalled(); expect(rows[0].unread).toBe(true);
        expect(editing.fieldView().selection).toBe(selection); expect(draft).toBe('Unfinished search');
        disturbed = true; notifications.changed();
        expect(build().children.map(child => child.id)).toEqual(['field_glass', 'field_messages']);
    } finally { projection.destroy(); }
});

test('notification actions use the canonical pointer intent and propagate the gateway refusal', async () => {
    gateway.invoke.mockResolvedValue({ ok: true, result: { ok: false, error: 'permission_denied' } });
    expect(await openCommunicationNotification({ action: { kind: 'conversation', contactId: 'alice', messageId: 'old' } }))
        .toEqual({ ok: false, error: 'permission_denied' });
    expect(gateway.invoke).toHaveBeenLastCalledWith(expect.objectContaining({ tool_id: 'communication.conversation.open',
        action: 'pointer.click', input: { contactId: 'alice', messageId: 'old' } }));
    expect(await openCommunicationNotification({ message: 'Information only' })).toEqual({ ok: true, informational: true });
});

test('notification cells retain the paginated grid and hand the exact cell to the canonical reader', async () => {
    const openNotification = vi.fn(async () => ({ ok: true }));
    const rows = [{ id: 'urgent', unread: true, priority: 'urgent', message: 'Important' },
        { id: 'read', unread: false, message: 'Still consultable' }];
    // `resumable(page, open)`: the stage's way back to a page shown (dashboard_mystic_stage.js); here it opens as given.
    const sources = createDashboardMysticSources({ stage: { openNotification, resumable: (_page, open) => open }, readNotifications: () => rows });
    const items = await sources.itemsFor('notifications', {}), item = items[0];
    expect(items).toHaveLength(2); expect(item.closeOnSelect).toBe(false);
    const state = { phase: 'open', context: {}, surfaceEpoch: 1, geometry: { placements: [{ item, size: 120, point: [195, 520] }] } };
    const close = vi.fn(), failure = vi.fn();
    const activation = bevyUiMysticActivation({ state, stopCentreHold() {}, stopAutoOpenDwell() {}, releaseEligible: () => true,
        interactionsEnabled: () => true, animateReplacement() {}, close, lensDisplaced: () => false, onError: failure });
    await activation.activateItem(item); await activation.activateItem(item);
    expect(openNotification).toHaveBeenCalledTimes(2);
    expect(openNotification).toHaveBeenLastCalledWith({ id: 'urgent', rect: { x: 135, y: 460, width: 120, height: 120 } });
    expect(close).not.toHaveBeenCalled(); expect(failure).not.toHaveBeenCalled();
    item.closeOnSelect = true; await activation.activateItem(item); expect(close).toHaveBeenCalledTimes(1);
});

test('a notification expands through Panels, marks read after presentation, and restores its grid on close', async () => {
    let definition, principal = 'account', rect = { x: 7, y: 76, width: 376, height: 504 };
    const rows = [{ id: 'notice', unread: true, fromName: 'Alice', message: 'A complete long message '.repeat(100),
        action: { kind: 'conversation', contactId: 'alice', messageId: 'old' } }];
    const markRead = vi.fn(async () => ({ ok: true })), onClose = vi.fn(), invoke = vi.fn(async () => ({ ok: false }));
    const presentation = { open: vi.fn(async () => ({ ok: true })), close: vi.fn(async () => { await definition.onClose(); return { ok: true }; }) };
    const reader = createCommNotificationDetail({ presentation, register: value => { definition = value; }, repaint() {},
        read: () => rows, markRead, invoke, actor: () => principal });
    await reader.open({ id: 'notice', rect: { x: 135, y: 460, width: 120, height: 120 }, readBounds: () => rect, onClose }); await flush();
    expect(presentation.open).toHaveBeenCalledWith({ rect: { x: 135, y: 460, width: 120, height: 120 } });
    expect(markRead).toHaveBeenCalledWith('notice');
    const body = () => definition.buildContent({}, { bodyWidth: 340, emit() {} });
    expect(JSON.stringify(body())).toContain(rows[0].message.trim());
    await definition.handleEvent({ type: 'comm.notification.open' });
    expect(find({ children: body() }, 'comm_notification_error')).toBeTruthy();
    expect(presentation.close).not.toHaveBeenCalled();
    rect = { x: 4, y: 40, width: 600, height: 400 }; expect(definition.readBounds()).toEqual(rect);
    principal = 'other-account'; expect(JSON.stringify(body())).not.toContain(rows[0].message.trim());
    await reader.close(); expect(onClose).toHaveBeenCalledTimes(1);
});

test('a host-constrained panel uses the real stage rectangle on phones and rejects invalid bounds', () => {
    const surface = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) };
    const bounds = { x: 7, y: 76, width: 376, height: 504 };
    expect(resolveBevyPanelGeometry({ surface, bounds })).toMatchObject(bounds);
    expect(() => resolveBevyPanelGeometry({ surface, bounds: { ...bounds, width: -1 } })).toThrow('bevy_panel_bounds_invalid');
});

// Whatever waits shows the Messages tool; only a message marked urgent by its sender (`priority`) turns its badge red,
// never a personal `urgent` flag.
test('idle notification text stays in the field, personal urgent cannot turn the badge red, and DND suppresses only previews', async () => {
    let rows = [{ id: 'normal', unread: true, message: 'Only the message', urgent: true }], disturbed = false;
    bindCommData({ readNotifications: () => rows, isDoNotDisturb: () => disturbed });
    const projection = createDashboardCommunicationInput({ treeId: 'home', readDraft: () => '', openMessages() {}, refresh() {}, env: {} });
    const build = () => projection.build({ kind: 'text', value_key: 'search', label_key: 'eve.dashboard.mystic.search_everything' },
        { box: { width: 376, height: 60 }, editing: { registerField() {}, fieldView: () => ({ focused: false }) }, emit() {} }, 'field');
    try {
        const red = BEVY_PANEL_TOKENS.actionButton.destructiveBackground;
        const badge = () => find(build(), 'field_messages_badge');
        await projection.start();
        expect(build().children.map(child => child.id)).toEqual(['field_glass', 'field_messages']);
        expect(find(build(), 'field_text').text).toContain('Only the message');
        expect(find(badge(), 'field_messages_badge_count').text).toBe('1');
        expect(badge().style.background).not.toEqual(red);
        rows = [...rows, { id: 'vip', unread: true, priority: 'urgent', message: 'Urgent message' }]; notifications.changed();
        expect(build().children.map(child => child.id)).toEqual(['field_glass', 'field_messages']);
        expect(JSON.stringify(build())).toContain('Urgent message');
        expect(find(badge(), 'field_messages_badge_count').text).toBe('2');
        expect(badge().style.background).toEqual(red);
        disturbed = true;
        expect(JSON.stringify(build())).not.toContain('Urgent message');
        expect(find(build(), 'field_messages')).toBeTruthy();
        rows = rows.map(row => ({ ...row, unread: false })); notifications.changed();
        expect(build().children.map(child => child.id)).toEqual(['field_glass']);
        expect(projection.messages()).toHaveLength(2);
    } finally { projection.destroy(); }
});
