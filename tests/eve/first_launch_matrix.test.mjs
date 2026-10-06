import { describe, expect, it } from 'vitest';
import { FIRST_LAUNCH_TEMPLATES } from '../../eVe/domains/templates/first_launch_template_catalog.js';
import { firstLaunchRequired, firstLaunchProfile, firstLaunchProgress } from '../../eVe/domains/user/first_launch_model.js';
import { matrixGridSlotRect } from '../../eVe/domains/matrix/matrix_grid_model.js';
import { planTemplateInstanceSync } from '../../eVe/domains/templates/project_template_model.js';
import { createProjectProgramRuntime } from '../../eVe/domains/programs/project_program_runtime.js';
import { initialProgram, validateProgramBricks } from '../../eVe/domains/programs/project_program_model.js';
import { programMonitorSources } from '../../eVe/domains/programs/program_monitor_sources.js';

describe('first launch canonical composition', () => {
    it('uses beginner only for explicit initialization and never enrolls legacy accounts', () => {
        expect(firstLaunchRequired({ id: 'old' }, {})).toBe(false);
        expect(firstLaunchRequired({ id: 'new', first_launch_version: 1 }, {})).toBe(true);
        const old = { preferences: { visual: { masteryLevel: 'advanced' }, background: { source: 'owned' } } };
        const seeded = firstLaunchProfile(old, firstLaunchProgress(), { initialize: true });
        expect(seeded.preferences.visual.masteryLevel).toBe('beginner'); expect(old.preferences.visual.masteryLevel).toBe('advanced');
        expect(seeded.preferences.background).toEqual(old.preferences.background);
        expect(firstLaunchRequired({ first_launch_version: 1 }, { first_launch: { version: 1, step: 'complete' } })).toBe(false);
        expect(firstLaunchRequired({}, { first_launch: { version: 1, step: 'sleep' } })).toBe(true);
    });
    it('declares every screen as ordinary Matrix/cell Atomes with in-grid placement', () => {
        for (const spec of Object.values(FIRST_LAUNCH_TEMPLATES)) {
            const root = spec.atoms[0]; expect(root.props.module).toBe('matrix'); expect(root.props.matrix_grid).toBeTruthy();
            for (const atom of spec.atoms.slice(1)) {
                expect(atom.parent_ref).toBe(root.ref);
                const box = matrixGridSlotRect(root.props.matrix_grid, root.props, atom.props.matrix_cell);
                expect(box.left + box.width).toBeLessThanOrEqual(root.props.width + .01);
                expect(box.top + box.height).toBeLessThanOrEqual(root.props.height + .01);
            }
        }
        const access = FIRST_LAUNCH_TEMPLATES.first_launch_access.atoms.filter(atom => atom.props.template_control?.kind === 'button');
        expect(access[0].props.width).toBe(access[1].props.width); expect(access[0].props.height).toBe(access[1].props.height);
        const controls = FIRST_LAUNCH_TEMPLATES.dashboard_basic.atoms.map(atom => atom.props.template_control).filter(c => c?.kind === 'button');
        expect(controls.map(c => c.operation)).toEqual(['profile_home', 'agenda', 'new_monitor', 'new_program']);
    });
    it('remaps cell parents and preserves a user control value when a linked template changes', () => {
        const source = [{ id: 'matrix', type: 'group', parent_id: 'source', properties: { matrix_grid: { rows: 1, columns: 1 } } },
            { id: 'cell', type: 'group', parent_id: 'matrix', properties: { template_control: { kind: 'text', value_key: 'name' }, template_value: 'default' } }];
        let serial = 0;
        const first = planTemplateInstanceSync({ sourceProjectId: 'source', sourceStates: source, instanceRootId: 'instance', instanceProjectId: 'instance', createId: () => 'id' + ++serial });
        expect(first.events[1].parent_id).toBe(first.events[0].atome_id);
        const records = first.events.map(e => ({ ...e, properties: { ...e.props, ...(e.props.template_control ? { template_value: 'typed by user' } : {}) } }));
        source[1].properties.template_control.placeholder = 'new label';
        const next = planTemplateInstanceSync({ sourceProjectId: 'source', sourceStates: source, instanceStates: records, instanceRootId: 'instance', instanceProjectId: 'instance', createId: () => 'unexpected' });
        expect(next.events.find(e => e.atome_id === first.events[1].atome_id).props.template_value).toBeUndefined();
    });
    it('configures transverse brick selection and declared preferences without touching the calendar', async () => {
        let program = initialProgram('sleep'), calendarCalls = 0;
        const runtime = createProjectProgramRuntime({ actor: () => 'user', project: () => 'project',
            read: async () => ({ owner_id: 'user', properties: { project_program: program } }),
            commit: async events => { program = events[0].props.project_program; return { ok: true }; }, calendar: { createEvent: () => { calendarCalls++; } } });
        expect(validateProgramBricks(program, ['nap', 'nutrition'])).toEqual(['nap', 'nutrition']);
        const result = await runtime.invoke({ project_id: 'project', operation: 'configure', bricks: ['nap'], sleep_preferences: { age: null, hours: 8, effort: 50, preparationMinutes: 10 } });
        expect(result.ok).toBe(true); expect(program.bricks).toEqual(['nap']); expect(program.status).toBe('draft'); expect(calendarCalls).toBe(0);
        expect((await runtime.invoke({ project_id: 'project', operation: 'configure', bricks: ['invented'], sleep_preferences: {} })).ok).toBe(false);
    });
    it('keeps a consented feeling distinct from missing sensor data and ignores unconsented observations', () => {
        const observation = (value, use) => ({ properties: { text: value, program_observation: { kind: 'declaration', date: '2030-01-01T00:00:00Z', provenance: 'user', useInFollowup: use } } });
        expect(programMonitorSources([observation('private', false)]).feeling).toBeNull();
        const sources = programMonitorSources([observation('rested', true)]);
        expect(sources.feeling.value).toBe('rested'); expect(sources.sensor.value).toBeNull(); expect(sources.sensor.state).toBe('no_data');
    });
    it.each(['denied', 'unsupported', 'needs_permission', 'no_data'])('keeps %s sensor access independent of journal consent', state => {
        const sources = programMonitorSources([{ properties: { text: 'rested', program_observation: {
            kind: 'declaration', useInFollowup: true, date: '2030-01-01T00:00:00Z' } } }], { state, value: { minutes: 480 } });
        expect(sources.feeling.value).toBe('rested'); expect(sources.sensor.state).toBe(state); expect(sources.sensor.value).toBeNull();
    });
    it('formats a real sensor reading with no invented journal declaration', () => {
        const sources = programMonitorSources([], { state: 'value', value: { minutes: 480, semantics: 'asleep' } });
        expect(sources.feeling).toBeNull(); expect(sources.sensor.value).toBeTruthy(); expect(sources.sensor.state).toBe('value');
    });
});

// Exercise the real retained tree, so incompatible control contracts cannot be
// hidden by mocked first-launch presentations or inferred from screenshots.
import { JSDOM } from 'jsdom';
import { createMatrixTemplateRuntime } from '../../eVe/domains/matrix/matrix_template_runtime.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { EVE_COMMON_SKIN_TOKENS } from '../../eVe/elements/skin/tokens.js';
it('projects native panel controls and Dashboard material without a private skin', async () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    const trees = [], uiRuntime = { mountTree: async ({ tree }) => { trees.push(tree); }, unmountTree: async () => {}, updateTreeMotion: async () => ({ ok: true }) };
    const walk = node => [node, ...(node.children || []).flatMap(walk)];
    try {
        for (const key of ['first_launch_access', 'first_launch_billing', 'first_launch_profile', 'first_launch_program']) {
            const records = FIRST_LAUNCH_TEMPLATES[key].atoms.filter(atom => atom.props.template_control?.kind !== 'logo')
                .map(atom => ({ id: atom.ref, properties: atom.props }));
            const runtime = createMatrixTemplateRuntime({ treeId: key, records, uiRuntime,
                readBounds: () => ({ x: 0, y: 0, width: 390, height: 844 }), readValues: () => ({ method: 'card', bricks: ['nap'] }), activate: async () => ({ ok: true }) });
            await runtime.open(); const nodes = walk(trees.at(-1).root);
            if (key === 'first_launch_access') {
                const cards = nodes.filter(node => node.on?.activate);
                expect(cards).toHaveLength(2); expect(cards[0].style.size).toEqual(cards[1].style.size);
                expect(cards[0].style.size.every(size => size % 60 === 0)).toBe(true);
                expect(cards[0].overlayRecord.properties.material.shadow).toBe(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.shadow);
                expect(cards.every(card => card.overlayRecordLayout === 'node_box')).toBe(true);
                expect(cards[0].overlayRecord.properties.material.backdrop.blurPx).toBe(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.backdrop.blurPx);
            }
            if (key === 'first_launch_billing') {
                expect(nodes.filter(node => node.kind === 'radio')).toHaveLength(6);
                const pay = nodes.find(node => node.id === 'pay');
                expect(pay.style.surfacePaint).toBe(BEVY_PANEL_TOKENS.buttonMaterial.idle.surfacePaint);
                expect(pay.style.shadow).toBe(BEVY_PANEL_TOKENS.buttonMaterial.idle.shadow);
                expect(nodes.find(node => node.id === 'pay_label').style.font_size).toBe(BEVY_PANEL_TOKENS.controlTextSizePx);
            }
            if (key === 'first_launch_profile') {
                expect(nodes.filter(node => node.kind === 'text_input')).toHaveLength(3);
                expect(nodes.find(node => node.id === 'name').style.size[1]).toBe(BEVY_PANEL_TOKENS.inputHeightPx);
            }
            if (key === 'first_launch_program') expect(nodes.filter(node => node.kind === 'checkbox')).toHaveLength(3);
            await runtime.destroy();
        }
    } finally { dom.window.close(); globalThis.window = previousWindow; globalThis.document = previousDocument; }
});
