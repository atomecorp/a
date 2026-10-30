import { afterEach, expect, test, vi } from 'vitest';
import { resolveMainMenuVisibility, resolveViewOptions, resolveLevelBehaviors } from '../../eVe/intuition/menu/context_menu_resolver.js';
import { buildBevyMainMenuItems } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createProjectViewListView } from '../../eVe/domains/rendering/project_view_list_view.js';
import { projectCreationViewProperties } from '../../eVe/domains/rendering/project_creation_view_properties.js';
import { BEGINNER_LIST_RAIL_KEYS, projectViewListRailToolKeys } from '../../eVe/domains/rendering/project_view_list_options.js';
import { createAtomeContextualEditRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js';
import * as surfaceState from '../../eVe/domains/rendering/project_view_surface_runtime.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const roots = ['capture', 'create', 'find', 'communicate', 'calendar', 'view', 'help', 'contact'];
const content = { toolbox: { children: roots }, ...Object.fromEntries(roots.map(key => [key, {
    type: 'tool', tool_id: `tool.main.${key}`, label: key, icon: key
}])) };

const listTree = (level, mixed) => {
    vi.stubGlobal('window', { __eveProfilePreferences: { visual: { masteryLevel: level } } });
    const records = [{ id: 'audio', type: 'audio', properties: { mute: mixed, solo: mixed, peaks: [0.2, 0.8] } }];
    const state = { projectId: 'scope_project', windowState: { visibleStart: 0 }, records,
        entries: [{ id: 'audio', label: 'Audio', depth: 1, visualRecord: records[0] }],
        namesExpanded: false, mixMode: 'solo', clipEditingIds: new Set() };
    const view = createProjectViewListView({ state, reportError: () => {}, nameEditing: {
        renderName: ({ id, width, height }) => ({ id: `${id}_name`, type: 'text', style: { size: [width, height] }, text: 'Audio' })
    } });
    return view.build({ width: 900, height: 380, emit: () => {}, playingIds: ['audio'] });
};

// Full projections cover the requested List cleanup at both expertise levels.
for (const level of ['intermediate', 'advanced']) {
    test(`${level} preserves its existing toolbar, options and List projection`, () => {
        expect({
            visibility: resolveMainMenuVisibility({ level }),
            items: buildBevyMainMenuItems(content, { levelVisibility: resolveMainMenuVisibility({ level }) }),
            options: resolveViewOptions({ level }),
            behaviors: resolveLevelBehaviors({ level })
        }).toMatchSnapshot();
        for (const mixed of [false, true]) expect(listTree(level, mixed)).toMatchSnapshot(`mixed=${mixed}`);
    });
}

test('beginner toolbar contains Atom alone, including an active palette', () => {
    for (const activePaletteKey of ['', 'create']) {
        expect(buildBevyMainMenuItems(content, {
            activePaletteKey, levelVisibility: resolveMainMenuVisibility({ level: 'beginner' })
        }).map(item => item.key)).toEqual(['atome']);
    }
});

test('beginner List hides Mute even on muted or soloed rows, preserving playback properties', () => {
    for (const mixed of [false, true]) {
        const tree = listTree('beginner', mixed);
        const nodes = [];
        const visit = value => {
            if (Array.isArray(value)) return value.forEach(visit);
            if (!value) return;
            nodes.push(value);
            visit(value.children);
        };
        visit(tree);
        expect(nodes.some(node => node.id?.endsWith('_mute'))).toBe(false);
        expect(nodes.some(node => node.id?.endsWith('_hierarchy'))).toBe(false);
        expect(nodes.some(node => node.id?.endsWith('_play'))).toBe(true);
        expect(nodes.some(node => node.id?.endsWith('_preview'))).toBe(true);
        expect(nodes.some(node => node.id === 'project_view_list_entry_0_name_name')).toBe(true);
        expect(nodes.some(node => node.overlayRecord?.properties?.mute === mixed)).toBe(true);
    }
});

test('beginner List composes only requested tools, including Import, without widening permissions', () => {
    const context = { level: 'beginner', selected: true, records: [{ properties: {}, capabilities: { write: true, delete: true } }],
        projectRecord: { capabilities: { create: true } } };
    expect(projectViewListRailToolKeys({ context })).toEqual(BEGINNER_LIST_RAIL_KEYS);
    expect(projectViewListRailToolKeys({ context: { ...context, records: [{ capabilities: { write: false, delete: false } }],
        projectRecord: { capabilities: { create: false } } } })).toEqual([]);
    expect(projectViewListRailToolKeys({ context: { ...context, type: 'project' } })).not.toContain('delete');
    for (const level of ['intermediate', 'advanced']) {
        expect(projectViewListRailToolKeys({ context: { level }, toolKeys: ['delete', 'copy', 'paste', 'size', 'info', 'teleport', 'play', 'couleur'] }))
            .toEqual(['play', 'couleur']);
    }
});

test('only beginner creation receives List and explicit views remain authoritative', () => {
    for (const level of ['beginner', 'intermediate', 'advanced']) {
        const windowRef = { __eveProfilePreferences: { visual: { masteryLevel: level } } };
        const properties = { name: 'Project', background: '#abcdef' };
        expect(projectCreationViewProperties(properties, { windowRef })).toEqual(
            level === 'beginner' ? { ...properties, view_mode: 'list' } : properties
        );
        if (level !== 'beginner') expect(projectCreationViewProperties(properties, { windowRef })).toBe(properties);
        for (const view_mode of ['natural', 'list', 'table', 'mix', 'timeline']) {
            const explicit = { ...properties, view_mode };
            expect(projectCreationViewProperties(explicit, { windowRef })).toBe(explicit);
        }
    }
});

test('blank beginner List adds native Delete only for a deletable row, preserving the other tool order', () => {
    const context = { level: 'beginner', selected: true, records: [{ capabilities: { write: true, delete: true } }],
        projectRecord: { id: 'blank', type: 'project', properties: {}, capabilities: { create: true } } };
    expect(projectViewListRailToolKeys({ context })).toEqual(['delete', ...BEGINNER_LIST_RAIL_KEYS]);
    expect(projectViewListRailToolKeys({ context: { ...context, type: 'project' } })).toEqual(BEGINNER_LIST_RAIL_KEYS);
    expect(projectViewListRailToolKeys({ context: { ...context, records: [{ capabilities: { write: true, delete: false } }] } }))
        .toEqual(BEGINNER_LIST_RAIL_KEYS);
    for (const properties of [{ project_intent: { family: 'creation' } }, { project_program: {} },
        { project_tags: ['news'] }, { project_tags: ['template'] }, { system_template_key: 'sleep' },
        { template_link: { source_project_id: 'template' } }]) {
        expect(projectViewListRailToolKeys({ context: { ...context, projectRecord: { ...context.projectRecord, properties } } }))
            .toEqual(BEGINNER_LIST_RAIL_KEYS);
    }
});

test('blank beginner List keeps the shared rail at the bottom, Organize staying in the band', async () => {
    const projectId = 'blank', row = { id: 'row', project_id: projectId, type: 'text', properties: {} };
    const projectRecord = { id: projectId, type: 'project', properties: {}, capabilities: { create: true } };
    const win = { __eveProfilePreferences: { visual: { masteryLevel: 'beginner' } },
        __eveWorkspaceMode: { mode: 'project', projectId }, __selectedAtomeIds: [row.id],
        requestAnimationFrame: () => 1, dispatchEvent: vi.fn() };
    vi.stubGlobal('window', win);
    const mounted = vi.fn();
    const surface = { getBoundingClientRect: () => ({ width: 900, height: 720 }) };
    vi.spyOn(surfaceState, 'readProjectViewSurfaceState').mockReturnValue({ mounted: true, projectId, mode: 'list' });
    const runtime = createAtomeContextualEditRuntime({ legacyState: {},
        resolveDefinitions: () => ['delete', ...BEGINNER_LIST_RAIL_KEYS].map((key, index) => ({ key, priority: index + 1 })),
        invokeDefinition: async () => ({ ok: true }), surfaceResolver: () => surface,
        bevyRuntimeResolver: () => ({ mountTree: mounted, updateTree: mounted }),
        readMenuAccess: async () => ({ projectRecord, records: [row] }),
        readMainMenuHeight: () => 60, findSceneByAtomeId: () => null });
    runtime.enter({ atomeId: row.id, projectId, record: { ...row, structured_context: true }, railOnly: true });
    await runtime.render();
    const railKeys = () => mounted.mock.lastCall[0].tree.root.children.find(node => node.kind === 'scroll_area')
        .children[0].children.map(node => node.id.replace('atome_contextual_tool_', ''));
    expect(railKeys()).toEqual(['delete', ...BEGINNER_LIST_RAIL_KEYS]);
    const layout = runtime.readState().railLayout;
    expect(layout.y + layout.railHeight).toBe(layout.bottom);
    expect(layout.bottom).toBe(720 - 60 - layout.gap);
    expect(railKeys()).not.toContain('container_dashboard');
});
