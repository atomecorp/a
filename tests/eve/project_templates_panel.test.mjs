import { expect, test, vi } from 'vitest';
import { createProjectTemplatesSurface } from '../../eVe/intuition/tools/project_templates.js';
import { resolveContextMenu } from '../../eVe/intuition/menu/context_menu_resolver.js';
import { SYSTEM_TEMPLATES } from '../../eVe/domains/templates/system_template_catalog.js';
import { createMainMenuEditContent } from '../../eVe/intuition/runtime/eve_intuition/main_menu_edit_content.js';
import { resolveToolPresentation } from '../../eVe/intuition/shared/tool_presentation.js';
import { setPendingDropChoice, clearPendingDropChoice, dropChoiceRailDefinitions, invokeDropChoiceRail, readPendingDropChoice } from '../../eVe/domains/rendering/project_view_drop_choice_rail.js';
import { getEveLocale, setEveLocale } from '../../eVe/i18n/i18n.js';
import { combineCanonicalMolecule } from '../../eVe/intuition/tools/core/tool_runtime_molecule_combine.js';
import { DASHBOARD_VISUAL_TOKENS as tokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { normalizeAtomeRenderNode } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import { mapVirtualSceneNodeToBevyPayload } from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import { interactionSpecFrom } from '../../eVe/domains/templates/system_template_catalog.js';

const walk = node => [node, ...(node?.children || []).flatMap(walk)];
test('Include is the sole composition choice and commits the existing front composition', async () => {
    const previousLocale = getEveLocale();
    const batches = [];
    const records = ['target', 'source'].map(id => ({ id, atome_id: id, type: 'shape', project_id: 'include_project',
        parent_id: 'include_project', properties: { left: 0, top: 0, width: 100, height: 100 } }));
    try {
        setEveLocale('fr');
        setPendingDropChoice({ projectId: 'include_project', sourceId: 'source', targetId: 'target',
            apply: choice => combineCanonicalMolecule({ projectId: 'include_project', sourceId: 'source', targetId: 'target', choice }, {
                readList: async () => records, createId: () => 'include_wrapper',
                commitBatch: async events => { batches.push(events); return { ok: true }; }
            }) });
        const definitions = dropChoiceRailDefinitions();
        expect(definitions.map(({ key, label }) => ({ key, label }))).toEqual([{ key: 'drop_choice_front', label: 'Inclure' }]);
        expect(await invokeDropChoiceRail({ key: 'drop_choice_before' })).toMatchObject({ ok: false });
        expect(readPendingDropChoice()).not.toBeNull();
        expect(await invokeDropChoiceRail(definitions[0])).toMatchObject({ ok: true, mode: 'simultaneous' });
        const source = batches[0].find(event => event.atome_id === 'source');
        const target = batches[0].find(event => event.atome_id === 'target');
        expect(source.parent_id).toBe(target.parent_id);
        expect(source.props.hierarchy_order).toBeGreaterThan(target.props.hierarchy_order);
        expect(readPendingDropChoice()).toBeNull();
    } finally { clearPendingDropChoice(); setEveLocale(previousLocale); }
});
test('all generated composition and page drop choices are classified without warnings', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const definitions = [];
        for (const kind of ['composition', 'page']) {
            setPendingDropChoice({ projectId: 'classification', sourceId: 'source', targetId: 'target', kind, apply: () => ({ ok: true }) });
            definitions.push(...dropChoiceRailDefinitions());
        }
        expect(definitions).toHaveLength(3);
        for (const definition of definitions) {
            expect(resolveToolPresentation({ key: definition.key, definition }).family).toBe('modification');
        }
        expect(warning).not.toHaveBeenCalled();
    } finally { clearPendingDropChoice(); warning.mockRestore(); }
});
test('Template and panel navigation have a classified presentation without console warnings', () => {
    const definitions = createMainMenuEditContent({ t: (_key, fallback) => fallback, mainToolIdByKey: {} });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        for (const key of ['project_templates', 'panel_open']) {
            expect(resolveToolPresentation({ key, definition: definitions[key], translate: (_key, fallback) => fallback }).family).toBe('system');
        }
        expect(warning).not.toHaveBeenCalled();
    } finally { warning.mockRestore(); }
});
test('project background exposes Template first at every mastery level', () => {
    for (const level of ['beginner', 'intermediate', 'advanced']) {
        const tools = resolveContextMenu({ menu: 'sidebar', context: { type: 'project', mode: 'edit', selected: false, level } });
        expect(tools[0]).toMatchObject({ key: 'project_templates', panel: 'project_templates' });
        const shape = resolveContextMenu({ menu: 'sidebar', context: { kind: 'shape', mode: 'edit', selected: true, level } });
        expect(shape.some(tool => tool.key === 'project_templates')).toBe(false);
    }
});
test('native Template panel lists the templates and opens through its declared command', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const surface = createProjectTemplatesSurface({
        ensureOnboarding: async () => {},
        listTemplates: async () => [{ id: 'personal_source', name: 'Personal' }, { id: 'garden_source', name: 'Garden' }], invoke
    });
    await surface.onOpen({ refresh: vi.fn() });
    const snapshot = surface.readState();
    expect(snapshot.entries.map(entry => entry.label)).toEqual(['Personal', 'Garden']);
    const events = [];
    const nodes = surface.buildContent(snapshot, { emit: event => events.push(event), bodyWidth: 420 });
    const firstRow = walk(nodes[0]).find(node => node.kind === 'button' && node.on?.activate);
    expect(firstRow).toBeTruthy();
    firstRow.on.activate();
    expect(events[0]).toMatchObject({ type: 'project_templates.open', value: 'personal_source' });
    await surface.handleEvent(events[0], {});
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ tool_id: 'ui.project.templates.open', input: { template_project_id: 'personal_source' } }));
    const [newTool] = surface.buildBandTools(snapshot, { emit: event => events.push(event) });
    newTool.onSelect();
    await surface.handleEvent(events[1], {});
    expect(invoke).toHaveBeenLastCalledWith(expect.objectContaining({ tool_id: 'ui.project.templates.new' }));
});
test('Template panel refuses stale choices without inventing entries', async () => {
    const invoke = vi.fn();
    const surface = createProjectTemplatesSurface({ ensureOnboarding: async () => {}, listTemplates: async () => [], invoke });
    await surface.onOpen({ refresh: vi.fn() });
    expect(surface.readState().entries).toEqual([]);
    expect(await surface.handleEvent({ type: 'project_templates.open', value: 'missing' }, {})).toMatchObject({ ok: false });
    expect(invoke).not.toHaveBeenCalled();
    expect(SYSTEM_TEMPLATES.dashboard).toBeUndefined();
});

test('programme templates paint standard square glass cards and retain each canonical tab action', () => {
    for (const key of ['sleep', 'music_title']) {
        const spec = SYSTEM_TEMPLATES[key];
        expect(spec.version).toBeGreaterThan(1);
        expect(spec.root_props.template_update_policy).toBe('pinned');
        expect(spec.atoms).toHaveLength(12);
        const refs = new Map(spec.atoms.map(atom => [atom.ref, 'stored_' + atom.ref]));
        for (const [index, tab] of ['plan', 'journal', 'monitor'].entries()) {
            const background = spec.atoms.find(atom => atom.ref === tab + '_bg');
            const { width, height, left, top, corner_radius, material } = background.props;
            expect(width).toBe(height); expect(width).toBeGreaterThan(44);
            expect(top).toBe(tokens.metrics.margin);
            expect(left).toBe(tokens.metrics.margin + index * (width + tokens.metrics.gap));
            expect(corner_radius).toBe(tokens.metrics.contentRadius);
            expect(background.props.color).toBe('rgba(0,0,0,0)');
            expect(material.backdrop.blurPx).toBe(16);
            const payload = mapVirtualSceneNodeToBevyPayload(normalizeAtomeRenderNode({
                id: refs.get(background.ref), type: background.type, properties: background.props
            }));
            expect(payload.backdrop).toBeTruthy(); expect(payload.shadow).toBeTruthy();
            expect(payload.layer).toBeLessThan(500);
            expect(spec.atoms.find(atom => atom.ref === tab + '_icon').props.source).toContain('data:image/svg+xml');
            const label = spec.atoms.find(atom => atom.ref === tab + '_label');
            expect(label.props.text_style.font_family).toBe(tokens.text.fontFamily);
            const interaction = interactionSpecFrom(spec.interactions[index], refs);
            expect(interaction.trigger.atome_ids).toEqual(['bg', 'accent', 'icon', 'label'].map(part => refs.get(tab + '_' + part)));
            expect(interaction.actions).toEqual([{ tool_id: 'ui.panel.open', parameters: { surface: 'program', tab } }]);
            expect(background.props.parent_id).toBeUndefined();
            expect(background.props.layer).toBeUndefined();
        }
    }
});
