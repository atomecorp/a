import { beforeEach, expect, test, vi } from 'vitest';
import { buildBevyPanelTree } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { layoutForNode, nodeBox } from '../../eVe/domains/rendering/bevy_ui_layout_runtime.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { healthMonitorsForHost } from '../../atome/src/squirrel/health/health_catalog.js';
import { createHealthOwner } from '../../atome/src/squirrel/health/health_owner.js';
import { createHealthChannel } from '../../atome/src/squirrel/health/health_channel.js';

const panels = vi.hoisted(() => ({ definition: null, firstActions: [] }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', () => ({
    registerBevyPanelSurface: (definition) => { panels.definition = definition; },
    openBevyPanelSurface: async (key, context = {}) => {
        await panels.definition.onOpen({ context, refresh: () => {} });
        panels.firstActions = panels.definition.buildFixedContent(panels.definition.readState(), { emit: () => {}, bodyWidth: 360 });
        return { ok: true };
    },
    closeBevyPanelSurface: async () => { panels.definition.onClose(); return { ok: true }; }
}));
vi.mock('../../atome/src/squirrel/health/index.js', () => ({ getHealthOwner: () => null }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_health_detail_runtime.js', () => ({
    getHealthDetailPanel: () => ({ open: async () => ({ ok: true }), close: async () => ({ ok: true }), isOpen: () => false })
}));
const { createDashboardHealthModules } = await import('../../eVe/domains/dashboard/dashboard_health_modules.js');

const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
function setup({ host = 'ios', linked = true, selected = [], failed = false } = {}) {
    const ids = healthMonitorsForHost(host);
    const monitors = Object.fromEntries(ids.map(entry => [entry.id, { supported: true, access: 'not_determined' }]));
    const listeners = new Map();
    const owner = {
        describe: () => ({ host, supported: true }),
        capabilities: vi.fn(async () => ({ available: true, monitors })),
        linkStatus: vi.fn(async () => ({ linked })),
        link: vi.fn(async () => { linked = true; return { ok: true }; }),
        requestAccess: vi.fn(async targets => {
            if (failed) return { ok: false, completed: false, error: 'health_authorization_status_unknown' };
            targets.forEach(id => { monitors[id].access = 'unknowable'; });
            return { ok: true, completed: true };
        }),
        refresh: vi.fn(),
        subscribe: (id, listener) => { listeners.set(id, listener); listener({ state: 'loading' }); return () => listeners.delete(id); },
        onAccessChange: () => () => {}
    };
    let stored = selected;
    const persist = vi.fn(async ids => { stored = ids; return { ok: true }; });
    const modules = createDashboardHealthModules({ owner, readSelection: () => stored, persistSelection: persist });
    modules.start();
    return { modules, owner, monitors, listeners, persist };
}
beforeEach(() => { panels.definition = null; });

test('header entry requests the complete supported HealthKit catalog, even without a selection', async () => {
    const { modules, owner, monitors } = setup();
    monitors.sleeping_wrist_temperature = { supported: false, reason: 'health_os_version_unsupported' };
    await modules.openSelector(); await settle();
    const targets = owner.requestAccess.mock.calls[0]?.[0];
    expect(targets?.slice().sort()).toEqual(healthMonitorsForHost('ios').filter(e => e.ios && monitors[e.id].supported).map(e => e.id).sort());
    expect(targets).not.toContain('device_steps_today');
    expect(modules.state.selected).toEqual([]);
    await modules.openSelector(); await settle();
    expect(owner.requestAccess).toHaveBeenCalledTimes(1);
    modules.stop();
});

test('checking, dragging selection and clicking a tile never request HealthKit', async () => {
    const { modules, owner, persist } = setup();
    await modules.handleEvent({ type: 'health.row.toggle', value: 'steps' });
    await modules.handleEvent({ type: 'health.row.toggle', value: 'weight' });
    await modules.activate({ metadata: { health_monitor: { monitorId: 'steps' } } });
    await settle();
    expect(owner.requestAccess).not.toHaveBeenCalled();
    expect(modules.items(new Map()).get('monitor')).toHaveLength(2);
    expect(persist).toHaveBeenCalledTimes(2);
    await modules.handleEvent({ type: 'health.row.toggle', value: 'weight' });
    expect(modules.items(new Map()).get('monitor')).toHaveLength(1);
    modules.stop();
});

test('opening the selector on a signed-in unassociated device associates it and shows the sheet', async () => {
    // iPad 2026-10-11: monitors were added, every tile read "Association
    // required" and no HealthKit sheet ever appeared.
    const { modules, owner } = setup({ linked: false, selected: ['steps'] });
    await modules.openSelector(); await settle();
    expect(owner.link).toHaveBeenCalledTimes(1);
    expect(owner.requestAccess.mock.calls[0][0]).toHaveLength(32);
    expect(modules.state.selected).toEqual(['steps']);
    expect(modules.readState().link.linked).toBe(true);
    modules.stop();
});

test('a failed association is shown and never issues authorization', async () => {
    const { modules, owner } = setup({ linked: false });
    owner.link.mockResolvedValueOnce({ ok: false, error: 'health_link_store_unavailable' });
    await modules.openSelector(); await settle();
    expect(owner.requestAccess).not.toHaveBeenCalled();
    expect(modules.state.notice).toContain('health_link_store_unavailable');
    modules.stop();
});

test('without a local principal nothing is associated and no phone sign-in is opened', async () => {
    const { modules, owner } = setup({ linked: false });
    owner.linkStatus.mockResolvedValue({ linked: false, reason: 'health_account_required' });
    await modules.openSelector(); await settle();
    expect(owner.link).not.toHaveBeenCalled();
    expect(owner.requestAccess).not.toHaveBeenCalled();
    modules.stop();
});

test('a monitor shown without association or access asks the host once, without the selector', async () => {
    const { modules, owner, monitors, listeners } = setup({ linked: false, selected: ['steps', 'weight'] });
    listeners.get('steps')({ state: 'needs_link' });
    listeners.get('weight')({ state: 'needs_link' });
    await settle();
    expect(owner.link).toHaveBeenCalledTimes(1);
    expect(owner.requestAccess).toHaveBeenCalledTimes(1);
    expect(owner.requestAccess.mock.calls[0][0].slice().sort()).toEqual(['steps', 'weight']);
    // Already answered (HealthKit hides read grants): shown again, asked no more.
    listeners.get('steps')({ state: 'needs_permission' });
    await settle();
    expect(owner.requestAccess).toHaveBeenCalledTimes(1);
    // Associated even when no sheet is left to show.
    Object.values(monitors).forEach(entry => { entry.access = 'unknowable'; });
    const other = setup({ linked: false, selected: ['steps'] });
    Object.values(other.monitors).forEach(entry => { entry.access = 'unknowable'; });
    other.listeners.get('steps')({ state: 'needs_link' });
    await settle();
    expect(other.owner.link).toHaveBeenCalledTimes(1);
    expect(other.owner.requestAccess).not.toHaveBeenCalled();
    modules.stop(); other.modules.stop();
});

test('an already answered catalog is read without another permission request', async () => {
    const { modules, owner, monitors, listeners } = setup({ selected: ['steps', 'weight'] });
    Object.values(monitors).forEach(entry => { entry.access = 'unknowable'; });
    listeners.get('steps')({ state: 'no_data' });
    listeners.get('weight')({ state: 'value', value: 70 });
    await modules.openSelector(); await settle();
    expect(owner.requestAccess).not.toHaveBeenCalled();
    expect(modules.readState().needsAccess).toBe(false);
    expect(modules.readState().entries.find(e => e.id === 'steps').meta.state).toMatch(/No readable data|Aucune donnée lisible/);
    modules.stop();
});

test('a technical authorization failure is shown in the existing notice', async () => {
    const { modules } = setup({ failed: true, selected: ['steps'] });
    await modules.openSelector(); await settle();
    expect(modules.state.notice).toContain('health_authorization_status_unknown');
    modules.stop();
});

test('Android selection still asks for only the checked types', async () => {
    const { modules, owner } = setup({ host: 'android' });
    await modules.openSelector(); await settle();
    expect(owner.requestAccess).not.toHaveBeenCalled();
    await modules.handleEvent({ type: 'health.row.toggle', value: 'steps' });
    expect(owner.requestAccess).toHaveBeenCalledWith(['steps']);
    modules.stop();
});

test('the direct iPhone pedometer retains its separate Motion request', async () => {
    const { modules, owner } = setup();
    await modules.handleEvent({ type: 'health.row.toggle', value: 'device_steps_today' });
    expect(owner.requestAccess).toHaveBeenCalledWith(['device_steps_today']);
    modules.stop();
});

test('unknown native request status remains an explicit error and never issues authorization', async () => {
    const { modules, owner, monitors } = setup({ selected: ['steps'] });
    monitors.steps = { supported: false, reason: 'health_authorization_status_unknown' };
    await modules.openSelector(); await settle();
    expect(owner.requestAccess).not.toHaveBeenCalled();
    expect(modules.state.notice).toContain('health_authorization_status_unknown');
    expect(modules.readState().needsAccess).toBe(true); // Other catalog types are still unanswered; Associate can retry the check.
    expect(modules.readState().entries.find(e => e.id === 'steps').meta.state).toMatch(/Read error|Erreur de lecture/);
    modules.stop();
});

test.each(['all', 'partial', 'none'])('the real owner/channel deliver %s access and survive relaunch without another sheet', async mode => {
    const entries = healthMonitorsForHost('ios').filter(entry => entry.ios);
    const asked = new Set();
    let sheets = 0;
    const invoke = async (command, payload) => {
        if (command === 'health_channel_open') return { channel: 'health-test-channel-token' };
        if (command === 'health_link_status') return { linked: true };
        if (command === 'health_capabilities') return { available: true, monitors: Object.fromEntries(payload.monitors.map(id => [id,
            { supported: true, access: asked.has(id) ? 'unknowable' : 'not_determined' }])) };
        if (command === 'health_request_access') {
            sheets++;
            payload.monitors.forEach(id => asked.add(id));
            return { completed: true };
        }
        if (command === 'health_read') return { results: Object.fromEntries(payload.requests.map(({ id }) => [id,
            { status: 'ok', hasData: mode === 'all' || (mode === 'partial' && id === 'steps'), value: 123,
                samples: mode === 'all' ? [{ value: 70, start: Date.now() - 1000, end: Date.now() }] : [] }])) };
        return {};
    };
    const make = () => {
        const channel = createHealthChannel({ host: 'ios', invoke, getAuthToken: () => 'test-auth' });
        const owner = createHealthOwner({ channel, getAccountId: () => 'A', pollMs: 1e9 });
        const modules = createDashboardHealthModules({ owner, readSelection: () => ['steps', 'weight'], persistSelection: async () => ({ ok: true }) });
        modules.start();
        return { owner, modules };
    };
    const first = make();
    await Promise.all([first.modules.openSelector(), first.modules.openSelector()]); await settle();
    expect(sheets).toBe(1);
    expect([...asked].sort()).toEqual(entries.map(entry => entry.id).sort());
    expect(first.modules.readState().needsAccess).toBe(false);
    expect(first.owner.reading('steps').state).toBe(mode === 'none' ? 'no_data' : 'value');
    expect(first.owner.reading('weight').state).toBe(mode === 'all' ? 'value' : 'no_data');
    await first.modules.openSelector();
    for (const entry of entries) {
        if (!first.modules.state.selected.includes(entry.id)) await first.modules.handleEvent({ type: 'health.row.toggle', value: entry.id });
        await first.modules.activate({ metadata: { health_monitor: { monitorId: entry.id } } });
    }
    expect(first.modules.items(new Map()).get('monitor').map(item => item.metadata.health_monitor.monitorId).sort()).toEqual(entries.map(entry => entry.id).sort());
    expect(sheets).toBe(1);
    first.modules.destroy(); first.owner.seal();
    const second = make();
    await second.modules.openSelector(); await settle();
    expect(sheets).toBe(1);
    expect(second.modules.readState().needsAccess).toBe(false);
    second.modules.destroy(); second.owner.seal();
});

// Traverse the production layout, so a button outside the shell cannot pass.
const boxesOf = (root) => {
    const boxes = new Map();
    const visit = (node, parent, forced) => {
        const box = forced || nodeBox(node, parent);
        boxes.set(node.id, { node, box });
        const layout = layoutForNode(node, box);
        (node.children || []).forEach((child, i) => visit(child, box, layout.childBoxes[i]));
    };
    visit(root);
    return boxes;
};

test.each([{ selected: [] }, { selected: ['steps'] }])('a failed automatic association leaves a visible Associate retry with selection $selected', async ({ selected }) => {
    const { modules, owner } = setup({ linked: false, selected });
    owner.link.mockResolvedValueOnce({ ok: false, error: 'health_link_store_unavailable' });
    await modules.openSelector(); await settle();
    const emit = intent => modules.handleEvent(intent);
    for (const width of [320, 390, 440]) {
        const bodyWidth = width - BEVY_PANEL_TOKENS.paddingPx * 2;
        const snapshot = modules.readState();
        const bodyChildren = panels.definition.buildContent(snapshot, { emit, bodyWidth });
        const fixedChildren = panels.definition.buildFixedContent(snapshot, { emit, bodyWidth });
        const tree = buildBevyPanelTree({ id: 'health_fixture', geometry: { x: 0, y: 0, width, height: 600 },
            surfaceSize: { width, height: 844 }, bodyChildren, fixedChildren });
        const boxes = boxesOf(tree.root);
        const action = boxes.get('health_link');
        expect(action, 'association action must exist before checking any measure').toBeDefined();
        expect(action.box.x + action.box.width, 'association must fit inside the visible panel').toBeLessThanOrEqual(width);
        expect(action.box.y + action.box.height).toBeLessThanOrEqual(boxes.get('health_fixture_footer').box.y);
        expect(boxes.has('health_hint')).toBe(false);
        expect(boxes.has('health_link_prompt')).toBe(false);
    }
    const fixed = panels.definition.buildFixedContent(modules.readState(), { emit, bodyWidth: 360 });
    await fixed[0].on.activate(); await settle();
    expect(owner.link).toHaveBeenCalledTimes(2);
    expect(owner.requestAccess.mock.calls[0][0]).toHaveLength(32);
    expect(modules.state.selected).toEqual(selected);
    expect(panels.definition.buildFixedContent(modules.readState(), { emit, bodyWidth: 360 })).toEqual([]);
    modules.stop();
});

test('linked iOS asks the unanswered catalog on opening, leaving no Associate to press', async () => {
    const { modules, owner } = setup();
    await modules.activate(); await settle();
    const fixed = panels.definition.buildFixedContent(modules.readState(), { emit: intent => modules.handleEvent(intent), bodyWidth: 360 });
    expect(fixed).toEqual([]);
    expect(owner.link).not.toHaveBeenCalled();
    expect(owner.requestAccess).toHaveBeenCalledTimes(1);
    expect(owner.requestAccess.mock.calls[0][0]).toHaveLength(healthMonitorsForHost('ios').filter(entry => entry.ios).length);
    modules.stop();
});

test('first mounted panel already includes Associate when native status resolves during opening', async () => {
    const { modules } = setup({ linked: false, selected: ['steps'] });
    await modules.activate();
    expect(panels.firstActions.some(node => node.id === 'health_link')).toBe(true);
    modules.stop();
});

test('association stays behind authenticated-account and sealed-channel checks', async () => {
    const { modules, owner } = setup({ linked: false });
    owner.linkStatus.mockResolvedValue({ linked: false, reason: 'health_account_required' });
    await modules.activate();
    let fixed = panels.definition.buildFixedContent(modules.readState(), { emit: () => {}, bodyWidth: 360 });
    expect(fixed).toEqual([]);
    expect(owner.requestAccess).not.toHaveBeenCalled();
    owner.describe = () => ({ host: 'ios', supported: false, reason: 'health_access_sealed' });
    fixed = panels.definition.buildFixedContent(modules.readState(), { emit: () => {}, bodyWidth: 360 });
    expect(fixed).toEqual([]);
    modules.stop();
});

test('Android mixed request/settings actions remain fully inside the fixed footer', async () => {
    const { modules, owner, monitors } = setup({ host: 'android', selected: ['steps', 'weight'] });
    monitors.weight.access = 'denied';
    // The sheet shown on opening was dismissed: steps is still askable.
    owner.requestAccess.mockImplementation(async () => ({ ok: true, completed: true }));
    await modules.activate();
    const fixedChildren = panels.definition.buildFixedContent(modules.readState(), { emit: () => {}, bodyWidth: 300 });
    const tree = buildBevyPanelTree({ id: 'android_fixture', geometry: { x: 0, y: 0, width: 320, height: 600 },
        surfaceSize: { width: 320, height: 844 }, fixedChildren });
    const boxes = boxesOf(tree.root);
    expect(boxes.get('health_allow')).toBeDefined();
    expect(boxes.get('health_settings')).toBeDefined();
    for (const id of ['health_allow', 'health_settings']) {
        const { box } = boxes.get(id);
        expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    modules.stop();
});

test.each([260, 340, 400, 768])('sensor names reclaim empty status space at body width %s, retain selection and expose the full long name', async bodyWidth => {
    const { modules, persist } = setup();
    const snapshot = modules.readState();
    const emit = intent => modules.handleEvent(intent);
    const list = panels.definition.buildContent(snapshot, { emit, bodyWidth }).find(node => node.id === 'health_monitor_list');
    const index = snapshot.entries.findIndex(entry => entry.id === 'walking_heart_rate_average');
    const row = list.children[index];
    const name = row.children.find(node => node.id.endsWith('_name'));
    const label = name.children.find(node => node.id.endsWith('_label'));
    expect(label.text).toBe(snapshot.entries[index].label);
    expect(label.style.size[0]).toBe(name.style.size[0]);
    expect(name.style.position[0] + name.style.size[0]).toBe(bodyWidth - BEVY_PANEL_TOKENS.inputPaddingHorizontalPx);
    expect(label.style.wrap_width).toBe(label.style.size[0]);
    expect(name.children.some(node => node.id.endsWith('_state'))).toBe(false);
    await row.on.long_press();
    expect(modules.readState().inspectedLabel).toBe(snapshot.entries[index].label);
    expect(modules.state.selected).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
    const note = panels.definition.buildFixedContent(modules.readState(), { emit, bodyWidth }).find(node => node.id === 'health_full_name');
    expect(note.text).toBe(label.text);
    expect(note.style.wrap_width).toBe(bodyWidth);
    await row.on.activate();
    expect(modules.state.selected).toContain('walking_heart_rate_average');
    expect(persist).toHaveBeenCalledTimes(1);
    modules.destroy();
});

test('new readings propagate to the existing monitor cell and leave other sensors intact', () => {
    const {modules,listeners}=setup({selected:['heart_rate','exercise_minutes','oxygen_saturation','steps']});
    const emit=(id,value,date)=>listeners.get(id)({state:'value',value,measuredTo:date});
    const cells=()=>Object.fromEntries(modules.items(new Map()).get('monitor').map(item=>[item.metadata.health_monitor.monitorId,item.metadata.health_monitor]));
    emit('heart_rate',60,1000);emit('exercise_minutes',12,1000);emit('oxygen_saturation',97,1000);emit('steps',100,1000);
    const first=cells();
    emit('heart_rate',75,2000);emit('exercise_minutes',18,2000);emit('oxygen_saturation',98,2000);
    const next=cells();
    expect(next.heart_rate.value).toBe('75');expect(next.exercise_minutes.value).toBe('18 min');expect(next.oxygen_saturation.value).toBe('98');
    expect(next.steps).toEqual(first.steps);
    modules.destroy();
});

test('the shared selector footer says Validate and closing retains selected monitor cards', async () => {
    const { modules, persist } = setup(); await modules.openSelector();
    await modules.handleEvent({ type: 'health.row.toggle', value: 'heart_rate' }); await settle();
    expect(panels.definition.closeLabel).toBe('Valider');
    panels.definition.onClose();
    expect(persist).toHaveBeenLastCalledWith(['heart_rate']);
    expect(modules.items(new Map()).get('monitor').map(item => item.metadata.health_monitor.monitorId)).toEqual(['heart_rate']);
    modules.stop();
});
