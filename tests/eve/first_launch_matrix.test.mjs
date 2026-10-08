import assert from 'node:assert/strict';
import { createTextEditingSession } from '../../eVe/domains/rendering/text_editing_session.js';
import { getTextServiceState, mountActiveTextEditor, unmountActiveTextEditor } from '../../eVe/domains/rendering/hidden_text_service_runtime.js';
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
                const parent = spec.atoms.find(entry => entry.ref === atom.parent_ref);
                expect(parent.props.matrix_grid).toBeTruthy();
                const box = matrixGridSlotRect(parent.props.matrix_grid, parent.props, atom.props.matrix_cell);
                expect(box.left + box.width).toBeLessThanOrEqual(parent.props.width + .01);
                expect(box.top + box.height).toBeLessThanOrEqual(parent.props.height + .01);
            }
        }
        const access = FIRST_LAUNCH_TEMPLATES.first_launch_access.atoms.filter(atom => atom.props.template_control?.kind === 'button');
        expect(access[0].props.width).toBe(access[1].props.width); expect(access[0].props.height).toBe(access[1].props.height);
        const controls = FIRST_LAUNCH_TEMPLATES.dashboard_basic.atoms.map(atom => atom.props.template_control).filter(c => c?.kind === 'button');
        expect(controls.map(c => c.operation).sort()).toEqual(['agenda', 'new_monitor', 'new_program', 'profile_home']);
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
        for (const hours of [1, 11]) expect((await runtime.invoke({ project_id: 'project', operation: 'configure', bricks: ['nap'],
            sleep_preferences: { age: null, hours, effort: 50, preparationMinutes: 10 } })).ok).toBe(true);
        expect((await runtime.invoke({ project_id: 'project', operation: 'configure', bricks: ['nap'],
            sleep_preferences: { age: null, hours: .5, effort: 50, preparationMinutes: 10 } })).ok).toBe(false);
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
import { DASHBOARD_VISUAL_TOKENS } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { PROJECT_SCENES, sceneState } from '../../eVe/domains/rendering/project_scene_state.js';
import { readMatrixInstance, syncMatrixModules } from '../../eVe/domains/matrix/matrix_module_runtime.js';
import { identityMediaFrameNode, IDENTITY_PLACEHOLDER_SOURCE } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_media_card.js';
import { buildDashboardCardRecords } from '../../eVe/domains/dashboard/dashboard_card_records.js';
import { buildBevyToolSliderNode } from '../../eVe/intuition/shared/bevy_ui_tool_slider.js';
import { applyTreeScrollLayout } from '../../eVe/domains/rendering/bevy_ui_scroll_layout.js';
import { locateBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_scroll_runtime.js';
import { hitTestBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_hit_test_runtime.js';
it('projects persisted Axum identities through every authenticated first-launch Template', async () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    const trees = [], actions = [];
    const uiRuntime = { mountTree: async ({ tree }) => trees.push(tree), unmountTree: async () => {}, updateTreeMotion: async () => ({ ok: true }) };
    const walk = node => [node, ...(node.children || []).flatMap(walk)];
    try {
        for (const stage of ['welcome', 'profile', 'goals', 'sleep', 'program']) {
            const key = `first_launch_${stage}`;
            const records = FIRST_LAUNCH_TEMPLATES[key].atoms.map(atom => ({
                atome_id: atom.ref, parent_id: atom.parent_ref || 'template-project', properties: { kind: atom.type, ...atom.props }
            }));
            const runtime = createMatrixTemplateRuntime({ treeId: key, records, uiRuntime,
                readBounds: () => ({ x: 0, y: 0, width: 390, height: 844 }),
                readValues: () => ({ bricks: ['nap'], hours: 8, effort: 50, preparationMinutes: 10 }),
                activate: async control => { actions.push(control.operation); return { ok: true }; } });
            try {
                await runtime.open();
                const nodes = walk(trees.at(-1).root);
                expect(nodes.some(node => node.id.includes('undefined'))).toBe(false);
                expect(nodes.some(node => node.id === 'logo')).toBe(true);
                const button = nodes.find(node => node.on?.activate);
                expect(button).toBeDefined(); await button.on.activate();
                await Promise.resolve(); expect(actions.length).toBeGreaterThan(0);
                await runtime.updateRecords(records.map(record => ({ ...record })));
                expect(walk(trees.at(-1).root).some(node => node.id === 'logo')).toBe(true);
            } finally { await runtime.destroy(); }
        }
    } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; dom.window.close(); }
});
it('projects native panel controls and Dashboard material without a private skin', async () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>');
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    const trees = [], uiRuntime = { mountTree: async ({ tree }) => { trees.push(tree); }, unmountTree: async () => {}, updateTreeMotion: async () => ({ ok: true }) };
    const walk = node => [node, ...(node.children || []).flatMap(walk)];
    try {
        for (const key of ['first_launch_access', 'first_launch_phone', 'first_launch_billing', 'first_launch_sms', 'first_launch_welcome', 'first_launch_profile', 'first_launch_goals', 'first_launch_sleep', 'first_launch_program']) {
            const records = FIRST_LAUNCH_TEMPLATES[key].atoms.filter(atom => atom.props.template_control?.kind !== 'logo')
                .map(atom => ({ id: atom.ref, parent_id: atom.parent_ref, properties: atom.props }));
            const draft = [];
            const runtime = createMatrixTemplateRuntime({ treeId: key, records, uiRuntime, writeDraft: (key, value) => draft.push([key, value]),
                readBounds: () => ({ x: 0, y: 0, width: 390, height: 844 }), readValues: () => ({ method: 'card', bricks: ['nap'], hours: 8, effort: 50, preparationMinutes: 10 }), activate: async () => ({ ok: true }) });
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
                const glasses = nodes.filter(node => node.overlayRecord?.properties.material?.backdrop);
                expect(glasses).toHaveLength(7);
                for (const glass of glasses) {
                    expect(glass.style.radius).toBe(DASHBOARD_VISUAL_TOKENS.metrics.contentRadius);
                    expect(glass.overlayRecord.properties.material.shadow).toBe(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.shadow);
                }
                const pay = nodes.find(node => node.id === 'pay');
                expect(pay.style.surfacePaint).toBe(BEVY_PANEL_TOKENS.buttonMaterial.idle.surfacePaint);
                expect(pay.style.shadow).toBe(BEVY_PANEL_TOKENS.buttonMaterial.idle.shadow);
                expect(nodes.find(node => node.id === 'pay_label').style.font_size).toBe(BEVY_PANEL_TOKENS.controlTextSizePx);
                for (const id of ['pay', 'back']) {
                    const { box } = locateBevyUiNode({ node: trees.at(-1).root, nodeId: id });
                    const hit = hitTestBevyUiNode(trees.at(-1).root, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
                    expect(hit?.node.id).toBe(id);
                    expect(hit.node.on.activate).toBeTypeOf('function');
                }
            }
            if (key === 'first_launch_goals') {
                const cards = nodes.filter(node => node.on?.activate);
                expect(cards).toHaveLength(4);
                for (const card of cards) {
                    expect(card.style.size).toEqual(cards[0].style.size);
                    expect(card.style.radius).toBe(DASHBOARD_VISUAL_TOKENS.metrics.contentRadius);
                    expect(card.overlayRecordLayout).toBe('node_box');
                    expect(card.overlayRecord.properties.material.shadow).toBe(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.shadow);
                    expect(card.overlayRecord.properties.material.backdrop.blurPx).toBe(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.backdrop.blurPx);
                    const base = card.id.replace('__eve_dashboard_card_', '');
                    const band = nodes.find(node => node.id === `__eve_dashboard_card_label_backdrop_${base}`).overlayRecord.properties;
                    const standard = buildDashboardCardRecords({ entry: { item: { id: 'reference', title: 'Reference' },
                        category: { id: 'projects' }, rect: { x: 0, y: 0, width: card.style.size[0], height: card.style.size[1] } },
                        lane: {}, tokens: DASHBOARD_VISUAL_TOKENS }).find(record => record.id.includes('card_label_backdrop_')).properties;
                    for (const property of ['top', 'height', 'material', 'clip', 'corner_radius']) expect(band[property]).toEqual(standard[property]);
                    const icon = nodes.find(node => node.id === `__eve_dashboard_content_icon_${base}`).style;
                    expect(icon.position[0] + icon.size[0] / 2).toBe(card.style.size[0] / 2);
                    expect(icon.position[1] + icon.size[1] / 2).toBe(card.style.size[1] / 2);
                    const title = nodes.find(node => node.id === `__eve_dashboard_content_title_${base}`).style;
                    expect(title.position[1] + title.size[1]).toBe(card.style.size[1]);
                    expect(title.font_size).toBe(DASHBOARD_VISUAL_TOKENS.labelText.font_size);
                }
                const slots = ['sleep', 'nutrition', 'movement', 'journal'].map(id => nodes.find(node => node.id === id + '_slot').style);
                expect(slots[1].position[0] - slots[0].position[0] - slots[0].size[0]).toBe(DASHBOARD_VISUAL_TOKENS.metrics.gap);
                expect(slots[2].position[1] - slots[0].position[1] - slots[0].size[1]).toBe(DASHBOARD_VISUAL_TOKENS.metrics.gap);
                expect(nodes.filter(node => node.overlayRecord?.properties.material?.backdrop)).toHaveLength(9);
                const title = nodes.find(node => node.id === 'title_slot').style, hint = nodes.find(node => node.id === 'hint_slot').style;
                expect((title.position[1] + hint.position[1] + hint.size[1]) / 2).toBeCloseTo(nodes.find(node => node.id === 'header').style.size[1] / 2);
            }
            if (key === 'first_launch_profile') {
                const photo = nodes.find(node => node.id === 'photo');
                const standard = identityMediaFrameNode({ id: 'standard', placeholder: true });
                for (const key of ['size', 'radius', 'background', 'border', 'border_color']) expect(photo.style[key]).toEqual(standard.style[key]);
                expect(nodes.find(node => node.id === 'photo_image').image.source).toBe(IDENTITY_PLACEHOLDER_SOURCE);
                expect(photo.on.activate).toBeTypeOf('function');
                const inputs = nodes.filter(node => node.kind === 'text_input');
                expect(inputs).toHaveLength(3);
                const glass = nodes.find(node => node.overlayRecord?.properties.material?.backdrop);
                expect(glass.style.radius).toBe(DASHBOARD_VISUAL_TOKENS.metrics.contentRadius);
                expect(glass.overlayRecord.properties.material.shadow).toBe(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.shadow);
                for (const input of inputs) {
                    expect(input.style.size[1]).toBe(BEVY_PANEL_TOKENS.inputHeightPx);
                    expect(input.style.radius).toBe(BEVY_PANEL_TOKENS.radiusPx);
                    expect(input.style.size[0]).toBeLessThan(nodes.find(node => node.id === 'form').style.size[0]);
                }
                for (const id of ['save', 'skip']) {
                    const action = nodes.find(node => node.id === id);
                    expect(action.style.surfacePaint).toBe(BEVY_PANEL_TOKENS.buttonMaterial.idle.surfacePaint);
                    expect(action.style.shadow).toBe(BEVY_PANEL_TOKENS.buttonMaterial.idle.shadow);
                }
                const projected = projectBevyUiTreeRecords({ tree: trees.at(-1), treeId: key, workspaceLayer: 'panel' });
                const background = projected.find(record => record.id.includes('card_template_controls_form'));
                expect(projected.find(record => record.id.endsWith('_name_text_text')).properties.zIndex).toBeGreaterThan(background.properties.zIndex);
            }
            if (key === 'first_launch_sleep') {
                expect(nodes.filter(node => node.kind === 'tool_slider')).toHaveLength(3);
                expect(nodes.filter(node => node.overlayRecord?.properties.material?.backdrop)).toHaveLength(6);
                expect(nodes.find(node => node.id === 'age').style.radius).toBe(BEVY_PANEL_TOKENS.radiusPx);
                for (const [id, expected] of [['hours', 10.5], ['effort', 76], ['preparationMinutes', 85]]) {
                    const slider = nodes.find(node => node.id === id), native = buildBevyToolSliderNode({ id, orientation: 'horizontal', expanded: true, availableLength: 344,
                        sliderOptions: { showBounds: true, lengthPx: 'fill', valueInsetPx: DASHBOARD_VISUAL_TOKENS.metrics.gap } });
                    expect(slider.style.size).toEqual(native.style.size);
                    for (const suffix of ['background', 'rail', 'thumb']) {
                        const actual = nodes.find(node => node.id === `${id}_${suffix}`).style, standard = walk(native).find(node => node.id === `${id}_${suffix}`).style;
                        for (const property of ['size', 'radius', 'background']) expect(actual[property]).toEqual(standard[property]);
                    }
                    slider.on.press({}); slider.on.drag({ delta_x: 90 }); slider.on.release();
                    expect(draft.at(-1)).toEqual([id, expected]);
                }
                for (const id of ['validate', 'back']) expect(nodes.find(node => node.id === id).style.surfacePaint).toBe(BEVY_PANEL_TOKENS.buttonMaterial.idle.surfacePaint);
                const tree = trees.at(-1), scroll = tree.root.children[0];
                const short = { ...tree, root: { ...tree.root, style: { ...tree.root.style, size: [390, 650] },
                    children: [{ ...scroll, style: { ...scroll.style, size: [390, 650] } }] } };
                const entries = new Map(), before = applyTreeScrollLayout({ tree: short, treeId: key, entries });
                const entry = [...entries.values()][0]; expect(entry.maxY).toBe(90);
                entry.offsetY = entry.maxY;
                const after = applyTreeScrollLayout({ tree: short, treeId: key, entries });
                const beforeBox = locateBevyUiNode({ node: before.root, nodeId: 'back' }).box;
                const afterBox = locateBevyUiNode({ node: after.root, nodeId: 'back' }).box;
                expect(beforeBox.y - afterBox.y).toBe(entry.maxY);
                expect(afterBox.y + afterBox.height).toBeLessThanOrEqual(650);
            }
            if (key === 'first_launch_sms' || key === 'first_launch_welcome') {
                const glass = nodes.find(node => node.overlayRecord?.properties.material?.backdrop);
                expect(glass.style.radius).toBe(DASHBOARD_VISUAL_TOKENS.metrics.contentRadius);
                expect(glass.overlayRecord.properties.material.shadow).toBe(EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.shadow);
                expect(nodes.filter(node => node.kind === 'text_input')).toHaveLength(0);
                for (const id of key === 'first_launch_sms' ? ['resend', 'back'] : ['profile', 'skip']) {
                    const action = nodes.find(node => node.id === id);
                    expect(action.style.surfacePaint).toBe(BEVY_PANEL_TOKENS.buttonMaterial.idle.surfacePaint);
                    expect(action.style.shadow).toBe(BEVY_PANEL_TOKENS.buttonMaterial.idle.shadow);
                    expect(action.style.radius).toBe(BEVY_PANEL_TOKENS.radiusPx);
                    expect(action.style.size[0]).toBeLessThan(nodes.find(node => node.id === 'form').style.size[0]);
                }
                const projected = projectBevyUiTreeRecords({ tree: trees.at(-1), treeId: key, workspaceLayer: 'panel' });
                const background = projected.find(record => record.id.includes('card_template_controls_form'));
                expect(projected.find(record => record.id.endsWith('_title_text')).properties.zIndex).toBeGreaterThan(background.properties.zIndex);
            }
            if (key === 'first_launch_phone') {
                const field = nodes.find(node => node.id === 'phone');
                expect(field.style.size[1]).toBe(BEVY_PANEL_TOKENS.inputHeightPx);
                expect(field.style.size[0]).toBeLessThan(nodes.find(node => node.id === 'form').style.size[0]);
                expect(field.style.radius).toBe(BEVY_PANEL_TOKENS.radiusPx);
                const glass = nodes.find(node => node.overlayRecord?.properties.material?.backdrop);
                expect(glass.style.radius).toBe(DASHBOARD_VISUAL_TOKENS.metrics.contentRadius);
                const projected = projectBevyUiTreeRecords({ tree: trees.at(-1), treeId: key, workspaceLayer: 'panel' });
                const background = projected.find(record => record.id.includes('card_template_controls_form'));
                const inputText = projected.find(record => record.id.endsWith('_phone_text_text'));
                expect(inputText.properties.zIndex).toBeGreaterThan(background.properties.zIndex);
                const draft = [];
                const typed = createMatrixTemplateRuntime({ treeId: 'phone_semantics', records, uiRuntime,
                    readBounds: () => ({ x: 0, y: 0, width: 390, height: 844 }),
                    readValues: () => ({ phone: '' }), writeDraft: (key, value) => draft.push([key, value]), activate: async () => ({ ok: true }) });
                await typed.open();
                const input = walk(trees.at(-1).root).find(node => node.id === 'phone');
                input.on.focus({});
                const editor = document.querySelector('[data-role="active-text-editor"]');
                expect(editor.type).toBe('tel'); expect(editor.autocomplete).toBe('tel');
                editor.value = '0612345678'; editor.dispatchEvent(new dom.window.Event('input'));
                expect(draft.at(-1)).toEqual(['phone', '0612345678']);
                await typed.destroy();
            }
            if (key === 'first_launch_program') expect(nodes.filter(node => node.kind === 'checkbox')).toHaveLength(3);
            await runtime.destroy();
        }
    } finally { dom.window.close(); globalThis.window = previousWindow; globalThis.document = previousDocument; }
});

it('duplicates and syncs nested Matrix groups without losing the input owner or its value', () => {
    const source = FIRST_LAUNCH_TEMPLATES.first_launch_phone.atoms.map(atom => ({
        id: `source_${atom.ref}`, type: atom.type, parent_id: atom.parent_ref ? `source_${atom.parent_ref}` : 'source', properties: atom.props }));
    let serial = 0;
    const first = planTemplateInstanceSync({ sourceProjectId: 'source', sourceStates: source,
        instanceRootId: 'instance', instanceProjectId: 'instance', createId: () => `nested_${++serial}` });
    const field = first.events.find(event => event.props?.template_control?.value_key === 'phone');
    const parent = first.events.find(event => event.props?.template_control?.kind === 'group');
    expect(field.parent_id).toBe(parent.atome_id);
    expect(field.props.template_control.input_type).toBe('tel');
    const records = first.events.map(event => ({ id: event.atome_id, type: event.type, parent_id: event.parent_id,
        properties: { ...event.props, ...(event === field ? { template_value: '0612345678' } : {}) } }));
    const next = planTemplateInstanceSync({ sourceProjectId: 'source', sourceStates: source,
        instanceStates: records, instanceRootId: 'instance', instanceProjectId: 'instance', createId: () => 'unexpected' });
    expect(next.events.filter(event => event.atome_id === field.atome_id).every(event => !Object.hasOwn(event.props, 'template_value'))).toBe(true);
});

it('the ordinary embedded Matrix runtime retains nested controls and refreshes their declared grid', async () => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document, previousProject = sceneState.foregroundProjectId;
    const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>', { pretendToBeVisual: true });
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    const trees = [], walk = node => [node, ...(node.children || []).flatMap(walk)];
    const projectId = 'nested_template_project';
    const records = FIRST_LAUNCH_TEMPLATES.first_launch_phone.atoms.map(atom => ({ id: atom.ref, type: atom.type,
        parent_id: atom.parent_ref || projectId, properties: { ...atom.props,
            ...(atom.ref === 'phone' ? { template_value: '0612345678' } : {}) } }));
    try {
        const surface = document.getElementById('eve_surface_project');
        Object.defineProperties(surface, { clientWidth: { value: 390 }, clientHeight: { value: 844 } });
        window.eveBevyUiRuntime = { mountTree: async ({ tree }) => { trees.push(tree); }, unmountTree: async () => {}, updateTreeMotion: async () => ({ ok: true }) };
        window.__eveWorkspaceMode = { mode: 'project', projectId }; sceneState.foregroundProjectId = projectId;
        PROJECT_SCENES.set(projectId, { records: new Map(records.map(record => [record.id, record])) });
        await syncMatrixModules(); await readMatrixInstance('matrix').render();
        expect(walk(trees.at(-1).root).find(node => node.id === 'phone_text').text).toBe('0612345678');
        const before = walk(trees.at(-1).root).find(node => node.id === 'phone_slot').style.position[1];
        const form = records.find(record => record.id === 'form');
        form.properties.matrix_grid = { ...form.properties.matrix_grid, rows: 12 };
        await syncMatrixModules();
        const after = walk(trees.at(-1).root).find(node => node.id === 'phone_slot').style.position[1];
        expect(after).toBeLessThan(before);
        expect(walk(trees.at(-1).root).find(node => node.id === 'phone_text').text).toBe('0612345678');
        const contentHeight = walk(trees.at(-1).root).find(node => node.id === 'matrix_content').style.size[1];
        const matrix = records.find(record => record.id === 'matrix');
        PROJECT_SCENES.get(projectId).records.set('matrix', { ...matrix, properties: { ...matrix.properties, height: matrix.properties.height * 2 } });
        await syncMatrixModules(); await readMatrixInstance('matrix').render();
        expect(walk(trees.at(-1).root).find(node => node.id === 'matrix_content').style.size[1]).toBeGreaterThan(contentHeight);
    } finally {
        window.__eveWorkspaceMode = { mode: 'dashboard' }; await syncMatrixModules(); PROJECT_SCENES.delete(projectId);
        sceneState.foregroundProjectId = previousProject; dom.window.close(); globalThis.window = previousWindow; globalThis.document = previousDocument;
    }
});

it('telephone sessions use one native autofill editor and restore plain text semantics on transfer', () => {
    const dom = new JSDOM('<html><body></body></html>', { pretendToBeVisual: true });
    const changes = [];
    const phone = createTextEditingSession({ ownerId: 'phone', documentRef: () => dom.window.document, singleLine: true });
    const plain = createTextEditingSession({ ownerId: 'plain', documentRef: () => dom.window.document });
    try {
        phone.start({ inputType: 'tel', onInput: value => changes.push(value) });
        const editor = phone.getEditor();
        assert.equal(editor.tagName, 'INPUT');
        assert.equal(editor.type, 'tel');
        assert.equal(editor.getAttribute('inputmode'), 'tel');
        assert.equal(editor.autocomplete, 'tel');
        assert.equal(editor.name, 'phone');
        assert.equal(dom.window.document.activeElement, editor);
        editor.value = '+33612345678';
        editor.dispatchEvent(new dom.window.InputEvent('input', { inputType: 'insertReplacementText', bubbles: true }));
        assert.equal(phone.getSnapshot().value, '+33612345678');
        assert.equal(changes.at(-1), '+33612345678');
        phone.start({ inputType: 'tel', value: editor.value });
        assert.equal(phone.getEditor(), editor);
        plain.start({ value: 'Name' });
        assert.equal(phone.active(), false);
        const text = plain.getEditor();
        assert.equal(text.tagName, 'TEXTAREA');
        assert.equal(editor.isConnected, false);
        assert.equal(text.autocomplete, 'off');
        assert.equal(text.getAttribute('inputmode'), null);
        assert.equal(text.getAttribute('name'), null);
        assert.equal(dom.window.document.querySelectorAll('[data-role="active-text-editor"]').length, 1);
        plain.stop();
        assert.equal(getTextServiceState().activeEditorCount, 0);
    } finally { phone.stop(); plain.stop(); dom.window.close(); }
});

it('native editor type replacement evicts the previous owner without allowing a late stop to remove its successor', () => {
    const dom = new JSDOM('<html><body></body></html>', { pretendToBeVisual: true }); let evictions = 0;
    try {
        const previous = mountActiveTextEditor({ documentRef: dom.window.document, ownerKey: 'text', onEvicted: () => { evictions++; } });
        assert.throws(() => mountActiveTextEditor({ documentRef: dom.window.document, inputType: 'invented' }), /input_type_unsupported/);
        assert.equal(previous.editor.isConnected, true);
        const next = mountActiveTextEditor({ documentRef: dom.window.document, ownerKey: 'phone', inputType: 'tel' });
        assert.equal(evictions, 1); assert.equal(previous.editor.isConnected, false);
        assert.equal(unmountActiveTextEditor({ ownerKey: 'text' }), false);
        assert.equal(next.editor.isConnected, true);
        assert.equal(getTextServiceState().activeEditorCount, 1);
    } finally { unmountActiveTextEditor(); dom.window.close(); }
});
