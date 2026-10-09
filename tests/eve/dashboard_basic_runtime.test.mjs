import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { FIRST_LAUNCH_TEMPLATES } from '../../eVe/domains/templates/first_launch_template_catalog.js';
import { setHandedness } from '../../eVe/intuition/core/state.js';
import { initialProgram } from '../../eVe/domains/programs/project_program_model.js';
import { DASHBOARD_VISUAL_TOKENS } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { dashboardContentGlassStyle, dashboardGlassMaterial } from '../../eVe/domains/dashboard/dashboard_glass_material.js';
import { buildDashboardCardRecords } from '../../eVe/domains/dashboard/dashboard_card_records.js';
import { authorizeProjectTool, restoreProjectWorkModeValue } from '../../eVe/domains/rendering/project_work_mode_state.js';

const owners = vi.hoisted(() => ({ session: { mode: 'authenticated', user: { id: 'qa' } }, profile: null,
    gateway: vi.fn(), logout: vi.fn(), countdownStart: vi.fn(), motion: vi.fn(), subscribe: vi.fn(), release: vi.fn(), sourceAction: vi.fn(), openDashboard: vi.fn(), news: null, health: null, sensor: null, projects: vi.fn(), monitorItems: [] }));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/session.js', () => ({ getSessionState: () => owners.session }));
vi.mock('../../eVe/domains/user/profile_api.js', () => ({ loadUserProfile: async () => owners.profile }));
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({ invokeToolGateway: owners.gateway }));
vi.mock('../../atome/src/squirrel/health/index.js', () => ({ getHealthOwner: () => ({ subscribe: owners.subscribe }) }));
vi.mock('../../eVe/intuition/matrix/core/project_data.js', () => ({ loadProjectList: owners.projects }));
vi.mock('../../eVe/domains/dashboard/dashboard_font_runtime.js', () => ({ ensureDashboardFontsReady: async () => ({ ok: true }) }));
vi.mock('../../eVe/domains/dashboard/dashboard_news_modules.js', () => ({ createDashboardNewsModules: () => owners.news }));
vi.mock('../../eVe/domains/dashboard/dashboard_health_modules.js', () => ({ createDashboardHealthModules: () => owners.health }));
vi.mock('../../eVe/domains/matrix/matrix_module_runtime.js', () => ({ listMatrixInstances: () => [{ project_id: 'home', atome_id: 'matrix' }],
    readMatrixInstance: () => ({ executeSourceAction: owners.sourceAction }) }));
vi.mock('../../eVe/domains/dashboard/dashboard_defaults.js', () => ({ loadDashboardConstants: async () => ({}),
    readDashboardDefaults: () => ({ categories: ['calendar', 'news', 'projects', 'monitor'].map(id => ({ id, color: '#73777e', data_source: id === 'monitor' ? 'generic_record' : id })) }) }));
vi.mock('../../eVe/intuition/tools/user_workspace_surface_runtime.js', () => ({ openWorkspaceDashboardAndMainMenu: owners.openDashboard }));
vi.mock('../../eVe/intuition/tools/user.js', () => ({ disconnectHomeSession: options => {
    owners.countdownStart(); return options.startCountdown({ complete: owners.logout });
} }));
import { createBasicDashboardRuntime, invokeBasicDashboardAction } from '../../eVe/domains/dashboard/dashboard_basic_runtime.js';

const walk = node => [node, ...(node.children || []).flatMap(walk)];
let dom, previousWindow, previousDocument, previousCustomEvent, runtime, trees, viewport, records, program, observations;
const nodes = () => walk(trees.filter(tree => tree.id === 'basic_test').at(-1).root);
const collectionNodes = () => walk(trees.filter(tree => tree.id === 'basic_test_collection').at(-1).root);
const text = () => nodes().filter(node => node.kind === 'text').map(node => node.text).join('\n');
const cardFor = id => [...nodes(), ...(runtime.state.filteredCategoryId ? collectionNodes() : [])]
    .find(node => node.id.startsWith('__eve_dashboard_card_') && node.id.endsWith('_' + id) && !node.id.includes('label_backdrop'));
const createRuntime = () => createBasicDashboardRuntime({ projectId: 'home', treeId: 'basic_test', records, readBounds: () => viewport,
    uiRuntime: { mountTree: async ({ tree }) => { trees.push(tree); }, unmountTree: vi.fn(), updateTreeMotion: owners.motion } });
it.each(['consultation', 'performance'])('allows Basic Dashboard navigation in %s while scene edits remain blocked', async mode => {
    const project_id = 'basic-navigation-' + mode;
    restoreProjectWorkModeValue(project_id, mode, { windowRef: window });
    try {
        for (const operation of ['profile_home', 'agenda', 'weather', 'program', 'monitor', 'new_monitor', 'new_program']) {
            expect(await authorizeProjectTool({ tool: { id: 'ui.first_launch.home' },
                context: { input: { project_id, operation } }, windowRef: window })).toMatchObject({ ok: true });
        }
        expect(await authorizeProjectTool({ tool: { id: 'ui.matrix.value' }, context: { input: { project_id } }, windowRef: window }))
            .toMatchObject({ ok: false, error: 'project_work_mode_editing_blocked' });
    } finally { restoreProjectWorkModeValue(project_id, 'edit', { windowRef: window }); }
});
beforeEach(() => {
    previousWindow = globalThis.window; previousDocument = globalThis.document; previousCustomEvent = globalThis.CustomEvent;
    dom = new JSDOM('<canvas id="eve_surface_project"></canvas>');
    globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.CustomEvent = dom.window.CustomEvent;
    owners.session = { mode: 'authenticated', user: { id: 'qa' } };
    owners.profile = { ok: true, profile: { preferences: { first_launch: { program_id: 'sleep' } } } };
    owners.openDashboard.mockReset().mockResolvedValue({ ok: true, route: 'dashboard_creation' });
    owners.gateway.mockReset().mockResolvedValue({ ok: true }); owners.release.mockReset();
    owners.logout.mockReset().mockResolvedValue({ ok: true }); owners.countdownStart.mockReset(); owners.motion.mockReset();
    owners.sourceAction.mockReset().mockResolvedValue({ ok: true });
    owners.news = { items: () => new Map([['news', [{ metadata: { weather: { status: 'manual', status_label: 'Choisissez une ville' } } }]]]),
        start: vi.fn(), destroy: vi.fn(), activate: vi.fn() };
    owners.projects.mockReset().mockResolvedValue([]); owners.monitorItems = [];
    owners.health = { start: vi.fn(), items: source => new Map([['monitor', [...owners.monitorItems, ...(source.get('monitor') || [])]]]), destroy: vi.fn(), openSelector: vi.fn() };
    owners.subscribe.mockReset().mockImplementation((_id, listener) => { owners.sensor = listener; listener({ state: 'unsupported' }); return owners.release; });
    trees = []; viewport = { x: 0, y: 0, width: 390, height: 844 }; program = initialProgram('sleep'); observations = [];
    records = FIRST_LAUNCH_TEMPLATES.dashboard_basic.atoms.map(atom => ({ id: atom.ref, parent_id: atom.parent_ref || 'home', type: atom.type, properties: atom.props }));
    window.Atome = { getStateCurrent: vi.fn(async id => ({ id, owner_id: 'qa', properties: id === 'sleep' ? { project_program: program } : {} })),
        listStateCurrent: vi.fn(async () => observations), eventBus: { on: vi.fn(), off: vi.fn() } };
    runtime = createRuntime();
});
afterEach(async () => { await runtime.destroy(); vi.useRealTimers(); dom.window.close(); globalThis.window = previousWindow; globalThis.document = previousDocument; globalThis.CustomEvent = previousCustomEvent; });

it.each([false, true])('adds Profile hold feedback with photo=%s while preserving the ordinary card', async photo => {
    if (photo) owners.profile.profile.user_face = '/assets/images/1.png';
    await runtime.destroy(); vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'performance'] });
    runtime = createRuntime(); await runtime.open(); await runtime.render();
    const ordinary = nodes().find(node => node.id.startsWith('__eve_dashboard_card_') && node.id.endsWith('_profile') && node.on?.activate);
    const appearance = structuredClone(ordinary.style);
    expect(typeof ordinary.on.long_press).toBe('function');
    expect(nodes().filter(node => node.on?.long_press)).toHaveLength(1);
    ordinary.on.long_press();
    await vi.waitFor(() => expect(owners.countdownStart).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(192);
    expect(owners.motion.mock.calls.at(-1)[0].updates[0].opacity).toBe(0);
    expect(nodes().find(node => node.id.endsWith('_countdown')).text).toBe('2');
    expect(owners.logout).not.toHaveBeenCalled(); expect(owners.gateway).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(nodes().find(node => node.id.endsWith('_countdown')).text).toBe('1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(nodes().find(node => node.id.endsWith('_countdown')).text).toBe('0');
    expect(owners.logout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(owners.logout).toHaveBeenCalledOnce();
    expect(nodes().some(node => node.id.endsWith('_countdown'))).toBe(false);
    expect(nodes().find(node => node.id === ordinary.id).style).toEqual(appearance);
});

it('cancels Profile countdown on account change before disconnecting', async () => {
    await runtime.destroy(); vi.useFakeTimers(); runtime = createRuntime(); await runtime.open();
    nodes().find(node => node.on?.long_press).on.long_press();
    await vi.waitFor(() => expect(owners.countdownStart).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(500);
    owners.session.user.id = 'other'; window.dispatchEvent(new dom.window.Event('squirrel:user-logged-in'));
    await runtime.destroy(); await vi.advanceTimersByTimeAsync(4000);
    expect(owners.logout).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it('uses the professional light glass, native labelled add cards and Dashboard font', async () => {
    expect((await runtime.open()).ok).toBe(true);
    for (const width of [390, 1024]) {
        viewport.width = width; await runtime.render();
        const current = nodes(), cards = current.filter(node => node.overlayRecord?.properties.material?.backdrop);
        const native = dashboardContentGlassStyle('#73777e', DASHBOARD_VISUAL_TOKENS);
        for (const card of cards.filter(node => !node.id.includes('label_backdrop'))) {
            expect(card.style.radius).toBe(DASHBOARD_VISUAL_TOKENS.metrics.contentRadius);
            expect([native.material, dashboardGlassMaterial({ settings: DASHBOARD_VISUAL_TOKENS.headerBand, shadow: false })])
                .toContainEqual(card.overlayRecord.properties.material);
        }
        for (const node of current.filter(node => node.overlayRecord?.type === 'text'))
            expect(node.overlayRecord.properties.text_style.font_family).toBe(DASHBOARD_VISUAL_TOKENS.text.fontFamily);
        const slots = ['clock', 'weather', 'program', 'monitor', 'profile', 'calendar'].map(id => current.find(node => node.id === id + '_slot').style);
        expect(slots.filter((_, i) => i !== 1).every(slot => slot.size[0] === slot.size[1] && slot.size[0] === slots[0].size[0])).toBe(true);
        expect(slots[1].size[0]).toBe(2 * slots[0].size[0]);
        expect(slots[4].position[0] - slots[5].position[0] - slots[5].size[0]).toBeCloseTo(DASHBOARD_VISUAL_TOKENS.metrics.gap);
        for (const id of ['new_monitor', 'new_program']) {
            const actual = cardFor(id), control = records.find(record => record.id === id).properties.template_control;
            const size = current.find(node => node.id === id + '_slot').style.size;
            const standard = buildDashboardCardRecords({ entry: { item: { id }, category: { id: 'template_controls' },
                rect: { x: 0, y: 0, width: size[0], height: size[1] } }, lane: {}, tokens: DASHBOARD_VISUAL_TOKENS,
                content: { label: actual.accessibility.label, icon: control.icon_source, layout: 'label_band' } });
            expect(actual.overlayRecord.properties.material).toEqual(standard[0].properties.material);
            expect(size).toEqual(slots[0].size);
            expect(current.find(node => node.id === id + '_slot').style.position[0]).toBeGreaterThan(0);
            expect(actual.accessibility.label).toBeTruthy();
        }
        expect(current.filter(node => node.id.includes('card_label_backdrop_'))).toHaveLength(6);
        const tree = trees.at(-1), content = current.find(node => node.id === 'matrix_content');
        const contentBottom = tree.root.style.position[1] + tree.root.children[0].style.position[1] + content.style.size[1];
        expect(viewport.height - contentBottom).toBe(30);
        const addSlot = current.find(node => node.id === 'new_program_slot').style;
        expect(addSlot.size[1]).toBeGreaterThan(current.find(node => node.id === 'programs_title_group_slot').style.size[1]);
    }
    expect(text()).toContain('Sommeil'); expect(text()).toContain('Aucune donnée'); expect(text()).not.toContain('Proposition');
    expect(text()).not.toContain('Indisponible'); expect(text()).not.toContain('86%'); expect(text()).not.toContain('26°');
});

it('dispatches Profile, Calendar, New monitor and New programme through the registered tool', async () => {
    await runtime.open();
    for (const [id, operation, project_id] of [['profile', 'profile_home', 'sleep'], ['calendar', 'agenda', 'sleep'],
        ['new_monitor', 'new_monitor', 'home'], ['new_program', 'new_program', 'sleep']]) {
        const card = cardFor(id);
        card.on.activate();
        await vi.waitFor(() => expect(owners.gateway).toHaveBeenLastCalledWith({ tool_id: 'ui.first_launch.home', action: 'pointer.click',
            input: { operation, project_id }, source: { type: 'ui' } }));
    }
    await invokeBasicDashboardAction({ operation: 'new_program', project_id: 'home' });
    expect(owners.openDashboard).toHaveBeenCalledExactlyOnceWith({ source: 'dashboard_basic.new_project', creationCategory: 'projects' });
    expect(owners.gateway.mock.calls.some(([call]) => call.input?.surface === 'program')).toBe(false);
    await invokeBasicDashboardAction({ operation: 'agenda', project_id: 'sleep' });
    expect(owners.gateway).toHaveBeenLastCalledWith({ tool_id: 'ui.panel.open', action: 'open', input: { surface: 'calendar', project_id: 'sleep' }, source: { type: 'ui' } });
    for (const operation of ['weather', 'new_monitor']) {
        await invokeBasicDashboardAction({ operation, project_id: 'home' }); expect(owners.sourceAction).toHaveBeenLastCalledWith(operation);
        await runtime.executeSourceAction(operation);
    }
    expect(owners.news.activate).toHaveBeenCalled(); expect(owners.health.openSelector).toHaveBeenCalled();
});

it('shows only consented feeling and native sensor data; rehydrates the profile image', async () => {
    observations = [{ properties: { text: 'Private', program_observation: { kind: 'declaration', useInFollowup: false, date: '2030-01-01T00:00:00Z' } } },
        { properties: { text: 'Reposé', program_observation: { kind: 'declaration', useInFollowup: true, date: '2030-01-02T00:00:00Z' } } }];
    owners.profile.profile.user_face = '/assets/images/1.png';
    await runtime.open(); await runtime.render();
    expect(text()).toContain('Reposé'); expect(text()).not.toContain('Private');
    expect(nodes().some(node => node.overlayRecord?.properties.source === '/assets/images/1.png')).toBe(true);
    owners.sensor({ state: 'value', value: { minutes: 480, semantics: 'asleep' } }); await runtime.render();
    expect(text()).toContain('8');
    owners.sensor({ state: 'denied' }); await runtime.render();
    expect(text()).not.toContain('Connecté');
});

it('closes and releases source owners when the account changes, rejecting late readings', async () => {
    await runtime.open();
    owners.session = { mode: 'authenticated', user: { id: 'other' } };
    window.dispatchEvent(new dom.window.Event('squirrel:user-logged-in'));
    await vi.waitFor(() => expect(runtime.state.active).toBe(false));
    const count = trees.length; owners.sensor({ state: 'value', value: { minutes: 480 } }); await runtime.render();
    expect(trees).toHaveLength(count); expect(owners.release).toHaveBeenCalled();
    expect(owners.news.destroy).toHaveBeenCalled(); expect(owners.health.destroy).toHaveBeenCalled();
    owners.session.mode = 'logged_out'; expect((await invokeBasicDashboardAction({ operation: 'agenda' })).ok).toBe(false);
});

it('clears old programme information when its owner is no longer accessible', async () => {
    await runtime.open(); expect(text()).toContain('Sommeil');
    window.Atome.getStateCurrent.mockResolvedValue({ owner_id: 'other', properties: { project_program: program } });
    window.dispatchEvent(new dom.window.Event('eve:user-profile-updated'));
    await vi.waitFor(() => expect(text()).toContain('Aucun programme'));
    expect(text()).not.toContain('Mieux dormir');
});

it('shows a recorded shared measurement without a local sensor and excludes private or deleted measurements', async () => {
    const observation = (value, use, date, deleted = false) => ({ deleted, properties: { text: value,
        program_observation: { kind: 'measurement', useInFollowup: use, date, provenance: 'synced' } } });
    observations = [observation('7 h', true, '2030-01-01T00:00:00Z'), observation('PRIVATE', false, '2030-01-03T00:00:00Z'),
        observation('DELETED', true, '2030-01-04T00:00:00Z', true)];
    await runtime.open(); await runtime.render();
    expect(text()).toContain('7 h'); expect(text()).not.toContain('Aucune donnée');
    expect(text()).not.toContain('PRIVATE'); expect(text()).not.toContain('DELETED'); expect(text()).not.toContain('Indisponible');
});

it('follows the updated canonical Matrix width instead of keeping a stale template frame', async () => {
    await runtime.open(); viewport.width = 1024;
    const next = records.map(record => record.id === 'matrix' ? { ...record, properties: { ...record.properties, width: 744 } } : record);
    await runtime.updateRecords(next);
    expect(nodes().find(node => node.id === 'clock_slot').style.size[0]).toBeCloseTo((744 - 16) / 3);
});

it('releases source owners when opening rejects the home or its read fails', async () => {
    window.Atome.getStateCurrent.mockResolvedValue({ owner_id: 'other' });
    expect((await runtime.open()).ok).toBe(false);
    expect(runtime.state.active).toBe(false); expect(owners.health.destroy).toHaveBeenCalled();
    window.Atome.getStateCurrent.mockRejectedValue(new Error('read_failed'));
    await expect(runtime.open()).rejects.toThrow('read_failed');
    expect(owners.news.destroy).toHaveBeenCalled(); expect(trees).toHaveLength(0);
});

// Check actual projected positions across desktop/mobile, and the live preference path.
it.each([[1680, 1050], [1024, 768], [390, 844], [390, 650], [320, 480]])('anchors and mirrors the layout at %i × %i', async (width, height) => {
    viewport = { x: 11, y: 17, width, height };
    await runtime.open();
    const slots = ['clock', 'weather', 'programs_background', 'monitors_background', 'programs_title_group', 'program', 'monitors_title_group', 'monitor', 'calendar', 'profile',
        'programs_title', 'new_program', 'monitors_title', 'new_monitor'];
    const styles = () => Object.fromEntries(slots.map(id => [id, structuredClone(nodes().find(node => node.id === id + '_slot').style)]));
    const right = styles(), frame = nodes().find(node => node.id === 'matrix_content').style;
    const scroll = nodes().find(node => node.id === 'matrix_scroll').style;
    expect(scroll.position).toEqual([30, 30]);
    expect(right.clock.position).toEqual([0, 0]);
    expect(right.weather.position[0]).toBeCloseTo(right.clock.size[0] + 8);
    expect(right.weather.size[0]).toBe(2 * right.clock.size[0]);
    expect(right.programs_background.position[1]).toBeCloseTo(right.clock.size[1] + 8);
    expect(right.programs_background.size).toEqual(right.monitors_background.size);
    expect(right.monitors_background.position[1]).toBeCloseTo(right.programs_background.position[1] + right.programs_background.size[1] + 8);
    for (const [background, footer, item, add] of [['programs_background', 'programs_title_group', 'program', 'new_program'],
        ['monitors_background', 'monitors_title_group', 'monitor', 'new_monitor']]) {
        expect(right[item].position[1]).toBeCloseTo(right[background].position[1] + 8);
        expect(right[item].position[0]).toBe(8);
        expect(right[add].position[1]).toBe(right[item].position[1]);
        expect(right[add].position[0] + right[add].size[0]).toBeCloseTo(frame.size[0] - 8);
        expect(right[footer].position[1] + right[footer].size[1]).toBeCloseTo(right[background].position[1] + right[background].size[1]);
        expect(right[footer].position[1]).toBeGreaterThanOrEqual(right[item].position[1] + right[item].size[1] + 8 - .001);
    }
    for (const [section, title] of [['programs_title_group', 'programs_title'], ['monitors_title_group', 'monitors_title']]) {
        expect(right[section].position[0]).toBe(0);
        expect(right[section].size[0]).toBe(frame.size[0]);
        expect(right[section].position[0] + right[section].size[0]).toBeCloseTo(right.profile.position[0] + right.profile.size[0]);
        expect(right[title].position[0] + right[title].size[0] / 2).toBeCloseTo(frame.size[0] / 2);
    }
    expect(right.profile.position[0] + right.profile.size[0]).toBe(frame.size[0]);
    expect(right.profile.position[0] - right.calendar.position[0] - right.calendar.size[0]).toBeCloseTo(8);
    expect(right.profile.position[1] + right.profile.size[1]).toBe(frame.size[1]);
    expect(right.profile.position[1]).toBeGreaterThanOrEqual(right.monitor.position[1] + right.monitor.size[1] + 8);
    for (const slot of Object.values(right)) expect(slot.position[0]).toBeGreaterThanOrEqual(0);
    setHandedness('left', { source: 'test' });
    await vi.waitFor(() => expect(styles().profile.position[0]).toBeCloseTo(0));
    const left = styles();
    for (const id of slots) {
        const parentWidth = id === 'programs_title' ? right.programs_title_group.size[0]
            : id === 'monitors_title' ? right.monitors_title_group.size[0] : frame.size[0];
        expect(left[id].position[0]).toBeCloseTo(parentWidth - right[id].position[0] - right[id].size[0]);
        expect(left[id].position[1]).toBe(right[id].position[1]); expect(left[id].size).toEqual(right[id].size);
    }
    setHandedness('right', { source: 'test' }); await runtime.render();
    expect(styles()).toEqual(right);
});

const programmeRoot = (id, name, extra = {}) => ({ id, type: 'project', name, owner_id: 'qa',
    properties: { project_program: initialProgram('sleep'), ...extra } });
const clickHeading = async category => {
    const id = category === 'projects' ? 'programs_title_group' : 'monitors_title_group';
    nodes().find(node => node.id === '__eve_dashboard_card_template_controls_' + id).on.activate();
    await vi.waitFor(() => expect(owners.gateway).toHaveBeenCalledWith({ tool_id: 'ui.matrix.focus', action: 'pointer.click',
        input: { matrix_atome_id: 'matrix', project_id: 'home', category }, source: { type: 'ui' } }));
};
const dispatchFocus = () => owners.gateway.mockImplementation(intent => intent.tool_id === 'ui.matrix.focus'
    ? runtime.toggleCategoryFilter(intent.input.category) : Promise.resolve({ ok: true }));
it('toggles native rubans, keeps chrome and add action, lists all actual programmes and restores both sections', async () => {
    viewport = { x: 0, y: 0, width: 1680, height: 1050 };
    const canonical = JSON.stringify(records);
    owners.projects.mockResolvedValue([programmeRoot('sleep', 'Mieux dormir'), programmeRoot('second', 'Sommeil voyage'),
        programmeRoot('template', 'TEMPLATE', { project_tags: ['template'] }), { id: 'ordinary', name: 'ORDINARY', properties: {} },
        { ...programmeRoot('deleted', 'DELETED'), deleted: true }]);
    await runtime.open(); dispatchFocus();
    const chrome = () => ['clock', 'weather', 'calendar', 'profile'].map(id => nodes().find(node => node.id === id + '_slot').style);
    const initialChrome = structuredClone(chrome());
    await clickHeading('projects');
    await vi.waitFor(() => expect(collectionNodes().some(node => node.text === 'Sommeil voyage')).toBe(true));
    expect(runtime.state.filteredCategoryId).toBe('projects'); expect(chrome()).toEqual(initialChrome);
    expect(text()).toContain('Vos programmes'); expect(text()).not.toContain('Vos moniteurs');
    expect(nodes().some(node => ['program_slot', 'monitor_slot'].includes(node.id))).toBe(false);
    const labels = collectionNodes().filter(node => node.kind === 'text').map(node => node.text).join(' ');
    expect(labels).toContain('Mieux dormir'); expect(labels).not.toMatch(/TEMPLATE|ORDINARY|DELETED/);
    collectionNodes().find(node => node.id.startsWith('__eve_dashboard_card_') && node.id.endsWith('_second') && !node.id.includes('label_backdrop')).on.activate();
    await vi.waitFor(() => expect(owners.gateway).toHaveBeenLastCalledWith({ tool_id: 'ui.first_launch.home', action: 'pointer.click',
        input: { operation: 'program', project_id: 'second' }, source: { type: 'ui' } }));
    cardFor('new_program').on.activate();
    await vi.waitFor(() => expect(owners.gateway).toHaveBeenLastCalledWith({ tool_id: 'ui.first_launch.home', action: 'pointer.click',
        input: { operation: 'new_program', project_id: 'sleep' }, source: { type: 'ui' } }));
    expect(runtime.state.filteredCategoryId).toBe('projects');
    await clickHeading('projects');
    await vi.waitFor(() => expect(runtime.state.filteredCategoryId).toBe(''));
    expect(text()).toContain('Vos programmes'); expect(text()).toContain('Vos moniteurs');
    expect(chrome()).toEqual(initialChrome); expect(JSON.stringify(records)).toBe(canonical);
});

it('expands monitor data above its footer, preserves the standard gap and mirrors the collection', async () => {
    viewport = { x: 11, y: 17, width: 1024, height: 768 };
    owners.monitorItems = [{ id: 'dashboard_health_steps', title: 'Pas', metadata: { health_monitor: { monitorId: 'steps', label: 'Pas', value: '2500', unit: 'pas', detail: '' } } }];
    const generic = { id: 'generic-monitor', properties: { source_domain: 'eve.dashboard', category_id: 'monitor', title: 'Moniteur personnel' } };
    window.Atome.listStateCurrent.mockImplementation(async id => id === 'home' ? [generic, { ...generic, id: 'deleted', deleted: true }] : observations);
    await runtime.open(); dispatchFocus(); await clickHeading('monitor');
    await vi.waitFor(() => expect(collectionNodes().some(node => node.id === 'generic-monitor_slot')).toBe(true));
    expect(text()).toContain('Vos moniteurs'); expect(text()).not.toContain('Vos programmes');
    const clock = nodes().find(node => node.id === 'clock_slot').style;
    const heading = nodes().find(node => node.id === 'monitors_title_group_slot').style;
    const background = nodes().find(node => node.id === 'monitors_background_slot').style;
    expect(background.position[1]).toBe(clock.size[1] + 8);
    expect(heading.position[1] + heading.size[1]).toBeCloseTo(background.position[1] + background.size[1]);
    const collectionTree = trees.filter(tree => tree.id === 'basic_test_collection').at(-1);
    expect(collectionTree.root.style.position[1]).toBe(viewport.y + 30 + background.position[1] + 8);
    expect(collectionTree.root.style.size[1]).toBeCloseTo(heading.position[1] - background.position[1] - 16);
    const labels = collectionNodes().filter(node => node.kind === 'text').map(node => node.text).join(' ');
    expect(labels).toContain('Sommeil'); expect(labels).toContain('Aucune donnée'); expect(labels).toContain('2500');
    expect(collectionNodes().filter(node => node.id.endsWith('_slot'))).toHaveLength(4);
    const right = collectionNodes().find(node => node.id === 'dashboard_health_steps_slot').style;
    setHandedness('left', { source: 'test' }); await runtime.render();
    const left = collectionNodes().find(node => node.id === 'dashboard_health_steps_slot').style;
    expect(left.position[0]).toBeCloseTo(948 - right.position[0] - right.size[0]);
    expect(nodes().find(node => node.id === 'profile_slot').style.position[0]).toBe(0);
    cardFor('new_monitor').on.activate();
    await vi.waitFor(() => expect(owners.gateway).toHaveBeenLastCalledWith({ tool_id: 'ui.first_launch.home', action: 'pointer.click',
        input: { operation: 'new_monitor', project_id: 'home' }, source: { type: 'ui' } }));
    expect(runtime.state.filteredCategoryId).toBe('monitor');
    await runtime.toggleCategoryFilter('projects'); expect(text()).not.toContain('Vos moniteurs');
    await runtime.toggleCategoryFilter('projects'); expect(text()).toContain('Vos moniteurs');
    setHandedness('right', { source: 'test' });
});

it('scrolls a long collection independently between the ribbon and footer, without a Matrix cell cap', async () => {
    owners.projects.mockResolvedValue(Array.from({ length: 300 }, (_, i) => programmeRoot('programme-' + i, 'Programme ' + i)));
    await runtime.open(); await runtime.toggleCategoryFilter('projects');
    const tree = trees.filter(tree => tree.id === 'basic_test_collection').at(-1), scroll = collectionNodes().find(node => node.kind === 'scroll_area');
    const body = collectionNodes().find(node => node.id === 'matrix_collection_content');
    const footerY = viewport.y + 30 + nodes().find(node => node.id === 'programs_title_group_slot').style.position[1];
    expect(tree.root.style.position[1] + scroll.style.size[1]).toBeCloseTo(footerY - 8);
    expect(scroll.style.overflow).toBe('scroll_y'); expect(body.style.size[1]).toBeGreaterThan(scroll.style.size[1]);
    expect(collectionNodes().some(node => node.text === 'Programme 299')).toBe(true);
    expect(nodes().find(node => node.id === 'matrix_content').style.size[1]).toBe(viewport.height - 60);
});

it.each(['collapse', 'account'])('rejects late collection reads after %s and does not remount private cards', async reason => {
    let resolve; owners.projects.mockImplementation(() => new Promise(done => { resolve = done; }));
    await runtime.open(); const pending = runtime.toggleCategoryFilter('projects');
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    if (reason === 'collapse') await runtime.toggleCategoryFilter('projects');
    else { owners.session = { mode: 'authenticated', user: { id: 'other' } }; window.dispatchEvent(new dom.window.Event('squirrel:user-logged-in')); }
    await vi.waitFor(() => expect(runtime.state.filteredCategoryId).toBe(''));
    const mounts = trees.length; resolve([programmeRoot('late', 'PRIVATE LATE')]); await pending;
    expect(trees).toHaveLength(mounts);
    expect(trees.flatMap(tree => walk(tree.root)).some(node => node.text === 'PRIVATE LATE')).toBe(false);
});

it('opens the same Basic dashboard for the anonymous principal using session preferences', async () => {
    owners.session = { mode: 'anonymous', user: { id: 'qa' } };
    owners.profile = { ok: false, error: 'account_profile_must_not_be_read' };
    window.__eveProfilePreferences = { first_launch: { program_id: 'sleep' } };
    expect(await runtime.open()).toMatchObject({ ok: true });
    expect(runtime.state.error).toBeFalsy();
    expect(await invokeBasicDashboardAction({ operation: 'agenda' })).toMatchObject({ ok: true });
    expect(owners.gateway).toHaveBeenCalled();
});

it('an anonymous session cannot open a home owned by another principal', async () => {
    owners.session = { mode: 'anonymous', user: { id: 'qa' } };
    window.Atome.getStateCurrent.mockResolvedValue({ owner_id: 'other', properties: {} });
    expect(await runtime.open()).toMatchObject({ ok: false, error: 'program_owner_required' });
    expect(trees).toHaveLength(0);
});


it.each(['release', 'cancel'].flatMap(phase => [100, 1200, 2250].map(elapsed => [phase, elapsed])))('stops Profile countdown on %s at %i ms and restores the card', async (phase, elapsed) => {
    await runtime.destroy(); vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'performance'] });
    runtime = createRuntime(); await runtime.open();
    const profile = () => nodes().find(node => node.on?.long_press);
    const appearance = structuredClone(profile().style);
    profile().on.press(); profile().on.long_press();
    await vi.waitFor(() => expect(owners.countdownStart).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(elapsed);
    profile().on[phase]();
    await vi.advanceTimersByTimeAsync(4000);
    expect(owners.logout).not.toHaveBeenCalled();
    expect(nodes().some(node => node.id.endsWith('_countdown'))).toBe(false);
    expect(profile().style).toEqual(appearance);
    expect(owners.gateway).not.toHaveBeenCalled();
    profile().on.press(); profile().on.long_press();
    await vi.advanceTimersByTimeAsync(2600);
    expect(owners.logout).toHaveBeenCalledOnce();
});

it('does not start Profile countdown when released before the async action arrives', async () => {
    await runtime.destroy(); vi.useFakeTimers(); runtime = createRuntime(); await runtime.open();
    const profile = nodes().find(node => node.on?.long_press);
    profile.on.press(); profile.on.long_press(); profile.on.release();
    await vi.advanceTimersByTimeAsync(4000);
    expect(owners.logout).not.toHaveBeenCalled();
    expect(nodes().some(node => node.id.endsWith('_countdown'))).toBe(false);
});
