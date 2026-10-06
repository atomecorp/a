import { afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', () => ({
    registerBevyPanelSurface: vi.fn(), refreshBevyPanelSurface: vi.fn(), isBevyPanelSurfaceOpen: () => false,
    openBevyPanelSurface: vi.fn(), closeBevyPanelSurface: vi.fn()
}));
import { interactionPanelApi, interactionSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_interaction_runtime.js';
import { panelOpenOptionsNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_panel_open_options.js';
import { PANEL_SURFACE_DEFINITIONS } from '../../eVe/intuition/panel_definitions.js';
import { matrixSettingsSurface } from '../../eVe/intuition/tools/matrix_objects.js';
import { panelOpenSurface } from '../../eVe/intuition/tools/panel_open.js';

describe('Native Interaction editor', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('builds real Matrix numeric controls and labelled fixed panel actions', () => {
        const context = { emit: vi.fn(), bodyWidth: 360 };
        expect(matrixSettingsSurface.buildContent({}, context).length).toBe(4);
        expect(() => matrixSettingsSurface.buildFixedContent({}, context)).not.toThrow();
        expect(() => panelOpenSurface.buildContent({}, context)).not.toThrow();
        expect(() => panelOpenSurface.buildFixedContent({}, context)).not.toThrow();
    });
    it('keeps bindings, work modes and order when editing a zoned hold interaction', async () => {
        const record = { atome_id: 'binding', type: 'interaction', project_id: 'p', properties: {
            name: 'Create', enabled: true, order: 7, modes: ['performance'],
            trigger: { kind: 'hold', atome_id: 'matrix', zone: 'header_new' }, target: { mode: 'trigger' },
            actions: [{ tool_id: 'ui.matrix.create', action: 'pointer.click', parameters: { immediate: true }, parameter_bindings: { category: 'event.category' } }]
        } };
        const commit = vi.fn(async event => { Object.assign(record.properties, event.props); return { ok: true }; });
        vi.stubGlobal('window', { __eveWorkspaceMode: { mode: 'project', projectId: 'p' }, Atome: { listStateCurrent: async () => [record], commit } });
        await interactionSurface.onOpen({ refresh: vi.fn() });
        await interactionPanelApi.emit({ type: 'interaction.edit', id: 'binding' });
        await interactionPanelApi.emit({ type: 'interaction.save' });
        expect(commit.mock.calls[0][0].props).toMatchObject({ order: 7, modes: ['performance'],
            trigger: { kind: 'hold', zone: 'header_new' }, actions: [{ parameter_bindings: { category: 'event.category' } }] });
    });
    it('lays out native panel choices and forwards surface and operation changes', () => {
        const onChange = vi.fn();
        const tree = panelOpenOptionsNode({ id: 'options', width: 340, onChange });
        expect(tree.style.size[1]).toBeGreaterThan(0);
        const walk = node => [node, ...(node.children || []).flatMap(walk)];
        const nodes = walk(tree);
        const buttons = nodes.filter(node => node.kind === 'button');
        expect(buttons.length).toBeGreaterThanOrEqual(Object.keys(PANEL_SURFACE_DEFINITIONS).length);
        const chooser = tree.children[0];
        // Canonical chips emit selected values through their native handlers.
        const first = walk(chooser).find(node => node.kind === 'button');
        first.on.activate();
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'open', surface: expect.any(String) }));
        expect(tree.children.every(node => Number(node.style.size[1]) > 0)).toBe(true);
    });
});
