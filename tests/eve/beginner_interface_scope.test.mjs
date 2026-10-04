import { afterEach, expect, test, vi } from 'vitest';
import { resolveMainMenuVisibility, resolveViewOptions, resolveLevelBehaviors } from '../../eVe/intuition/menu/context_menu_resolver.js';
import { buildBevyMainMenuItems } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { createProjectViewListView } from '../../eVe/domains/rendering/project_view_list_view.js';
import { projectCreationViewProperties } from '../../eVe/domains/rendering/project_creation_view_properties.js';

afterEach(() => vi.unstubAllGlobals());

const roots = ['organize', 'capture', 'create', 'find', 'communicate', 'calendar', 'view', 'help', 'contact'];
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

// Generated BEFORE the beginner changes. These full projections retain layout,
// node types, controls and event names for the two protected expertise levels.
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
        expect(nodes.some(node => node.id?.endsWith('_preview'))).toBe(true);
        expect(nodes.some(node => node.id === 'project_view_list_entry_0_name_name')).toBe(true);
        expect(nodes.some(node => node.overlayRecord?.properties?.mute === mixed)).toBe(true);
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
