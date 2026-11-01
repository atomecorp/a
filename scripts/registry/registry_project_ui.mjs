// Registry projection of the UI owners: declared panel surfaces (`PANEL_SURFACE_DEFINITIONS`), the main menu
// content (`createMainMenuContentRuntime`, built with the real tool catalog and theme values; its handlers are
// only called on a touch, so the build hands it handlers that refuse to run) and the contextual taxonomy
// (`context_menus.json`). Menu content keys become `taxonomy_node:menu.<key>`; every menu table becomes a
// `taxonomy_node:menu_slot.<menu>.<where>` holding its keys as `ui_placement:<menu>:<where>:<key>`.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, entryId } from './registry_paths.mjs';

const at = (file) => import(`${ROOT}/${file}`);
const PANELS_FILE = 'eVe/intuition/panel_definitions.js';
const CONTENT_FILE = 'eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js';
const CONTEXT_FILE = 'eVe/intuition/menu/context_menus.json';
const REGISTRATION_FILE = 'eVe/intuition/runtime/eve_intuition/main_tool_registration_runtime.js';
const BAND_FILE = 'eVe/intuition/menu/project_band_tools.js';
const LEVELS = ['beginner', 'intermediate', 'advanced'];

export async function projectPanels() {
    const { PANEL_SURFACE_DEFINITIONS } = await at(PANELS_FILE);
    const entries = [], relations = [];
    for (const definition of Object.values(PANEL_SURFACE_DEFINITIONS)) {
        const id = entryId('panel_surface', definition.surface_key);
        entries.push({ id, kind: 'panel_surface', native_id: definition.surface_key, origin: 'projected', owner: PANELS_FILE,
            declared_by: 'panel_definitions', surface_id: definition.surface_id || null, tool_id: definition.tool_id || null,
            module_key: definition.module_key || null, label_key: definition.label_key || null });
        if (definition.tool_id) relations.push({ from: entryId('tool_definition', definition.tool_id), type: 'opens', to: id });
    }
    return { owner: PANELS_FILE, entries, relations, findings: [] };
}

const inertHandlers = new Proxy({}, { get: (target, name) => () => { throw new Error(`registry_build_inert_handler:${String(name)}`); } });

async function mainMenuContent() {
    const { createMainToolCatalogRuntime } = await at('eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js');
    const { normalizeMainToolKey } = await at('eVe/intuition/runtime/eve_intuition/tool_key_runtime.js');
    const { DEFAULT_ORIENTATION, DIRECTION_VALUES, DIRECTION_VALUE_TO_LABEL } = await at('eVe/intuition/tools/theme.js');
    const { createMainMenuContentRuntime } = await at(CONTENT_FILE);
    const catalog = createMainToolCatalogRuntime({ normalizeMainToolKey });
    const names = ['applyDeleteSelection', 'closeBackgroundPanel', 'closeCalendarPanel', 'closeCanonicalHomePanel', 'closeCommunicatePanel',
        'closeCouleurPanel', 'closeDeletePanel', 'closeFinderPanel', 'closeFontPanel', 'closeInfoPanel', 'closeLayerPanel', 'closeMediaPanel',
        'closePastePanel', 'closeTimelinePanel', 'closeUndoPanel', 'ensureActivitiesModule', 'ensureCopyModule', 'ensurePastePanelModule',
        'handleAiTouch', 'handleFinderTouch', 'invokeTool', 'openBackgroundPanel', 'openCalendarPanel', 'openCanonicalHomePanel',
        'openCommunicatePanel', 'openCouleurPanel', 'openDeletePanel', 'openFinderPanel', 'openFontPanel', 'openInfoPanel', 'openLayerPanel',
        'openMediaPanel', 'openPastePanel', 'openTimelinePanel', 'openUndoPanel', 'orientationChanged'];
    const content = createMainMenuContentRuntime({ ...Object.fromEntries(names.map(name => [name, inertHandlers[name]])),
        defaultOrientation: DEFAULT_ORIENTATION, directionValues: DIRECTION_VALUES, directionValueToLabel: DIRECTION_VALUE_TO_LABEL,
        mainToolIdByKey: catalog.mainToolIdByKey, translate: (key, label) => label });
    return { content, catalog, normalizeMainToolKey };
}

// The menu entries with a local behaviour register their tool at boot (main_tool_registration_runtime.js): the
// registrar is injected, so the build runs the real registration with a sink that records each definition.
async function mainMenuTools({ content, catalog, normalizeMainToolKey }) {
    const { createMainToolRegistrationRuntime } = await at(REGISTRATION_FILE);
    const registered = [];
    createMainToolRegistrationRuntime({ intuitionContent: content, isBaseAtomeToolDef: catalog.isBaseAtomeToolDef, normalizeMainToolKey,
        mainToolIdByKey: catalog.mainToolIdByKey, resolveCanonicalMainToolId: catalog.resolveCanonicalMainToolId,
        dedicatedToolDeclarationIds: catalog.dedicatedToolDeclarationIds, registerAtomeTool: definition => registered.push(definition),
        resolvePanelContextElement: inertHandlers.resolvePanelContextElement, triggerMainToolInteraction: inertHandlers.triggerMainToolInteraction })();
    return registered;
}

const menuNodeId = key => entryId('taxonomy_node', `menu.${key}`);
const slotId = (menu, where) => entryId('taxonomy_node', `menu_slot.${menu}.${where}`);

export async function projectMenus() {
    const menu = await mainMenuContent();
    const { content } = menu;
    const context = JSON.parse(fs.readFileSync(path.join(ROOT, CONTEXT_FILE), 'utf8'));
    const entries = new Map(), relations = [], placements = [], findings = [];
    const contentKeys = Object.keys(content).filter(key => content[key] && typeof content[key] === 'object' && 'labelKey' in content[key]);
    for (const key of contentKeys) {
        const node = content[key];
        entries.set(menuNodeId(key), { id: menuNodeId(key), kind: 'taxonomy_node', native_id: `menu.${key}`, origin: 'projected', owner: CONTENT_FILE,
            role: Array.isArray(node.children) && node.children.length ? 'family' : 'menu_item', label_key: node.labelKey,
            label: typeof node.label === 'string' ? node.label : null, icon: typeof node.icon === 'string' ? node.icon : null,
            tool_id: node.tool_id || null, panel: context.commands?.[key]?.panel || null });
        (node.children || []).forEach((child, order) => placements.push({ surface: 'menu_content', menu: 'menu_content', where: key, key: child, order, parent: menuNodeId(key) }));
    }
    for (const [key, command] of Object.entries(context.commands || {})) {
        if (entries.has(menuNodeId(key))) continue;
        entries.set(menuNodeId(key), { id: menuNodeId(key), kind: 'taxonomy_node', native_id: `menu.${key}`, origin: 'projected', owner: CONTEXT_FILE,
            role: 'menu_item', label_key: command.labelKey || null, label: null, icon: null, tool_id: command.tool_id || null, panel: command.panel || null });
    }
    contextPlacements(context, content).forEach(placement => placements.push(placement));
    // Trouver › Outils lays any tool of the menu on a project's bottom band (project_band_tools.js#bandKeyForTool): the
    // project's own `band_tools` place it, so each such tool is placed in the band's slot under that project fact.
    contentKeys.filter(key => content[key].atome_tool === true && content[key].tool_id).forEach(key => placements.push({ surface: 'project_band',
        menu: 'project_band', where: 'tools', key, parent: slotId('project_band', 'tools'), owner: BAND_FILE,
        visible_when: { scope: 'project', requires: [`band_tool:${key}`] } }));
    const out = [];
    for (const placement of placements) {
        const target = menuNodeId(placement.key);
        if (!entries.has(target)) { findings.push({ type: 'menu_key_without_definition', id: `${placement.menu}:${placement.where}:${placement.key}` }); continue; }
        if (placement.surface !== 'menu_content' && !entries.has(placement.parent)) {
            entries.set(placement.parent, { id: placement.parent, kind: 'taxonomy_node', native_id: placement.parent.slice('taxonomy_node:'.length),
                origin: 'projected', owner: placement.owner || CONTEXT_FILE, role: 'menu_slot', label_key: null, label: null, icon: null, tool_id: null, panel: null });
        }
        const id = entryId('ui_placement', `${placement.menu}:${placement.where}:${placement.key}`);
        out.push({ id, kind: 'ui_placement', native_id: id.slice('ui_placement:'.length), origin: 'projected',
            owner: placement.owner || (placement.surface === 'menu_content' ? CONTENT_FILE : CONTEXT_FILE), surface: placement.surface, parent: placement.parent,
            target, key: placement.key, order: placement.order ?? null, effect: placement.removed ? 'remove' : 'show',
            visible_when: placement.visible_when || { scope: 'project' }, ...(placement.slot ? { slot: placement.slot } : {}) });
    }
    const { toolGesture } = await at('eVe/intuition/shared/tool_gesture.js');
    // main_tool_registration_runtime publishes a menu handler under a tool id; a tool owned by its own module or by
    // the bootstrap definitions keeps that owner (see its comment), so the assembly merges these as bindings.
    const bindings = (await mainMenuTools(menu)).map(definition => {
        const gesture = toolGesture({ key: definition.name_key });
        return { id: entryId('tool_definition', definition.tool_id), kind: 'tool_definition', native_id: definition.tool_id, origin: 'projected',
            owner: REGISTRATION_FILE, registry: 'runtime_atome_tool', visibility: definition.tool_scope === 'main' ? 'visible' : 'hidden', button_type: null,
            label: definition.tool_name, tool_key: definition.name_key, ...(gesture.classified ? { family: gesture.family, family_basis: 'tool_gesture' } : {}) };
    });
    for (const entry of entries.values()) if (entry.tool_id) relations.push({ from: entry.id, type: 'executes', to: entryId('tool_definition', entry.tool_id) });
    return { owner: `${CONTENT_FILE} + ${CONTEXT_FILE}`, entries: [...entries.values(), ...out], relations, findings, bindings };
}

// The contextual taxonomy tables, read the way context_menus_loader.js reads them: a table maps a key to its
// minimum level (null removes an inherited option), `objects.<kind>` is a selection, `modes.<mode>` a work mode,
// `activities.<activity>` a project activity.
function contextPlacements(context, content) {
    const out = [];
    const put = (menu, where, key, extra = {}) => out.push({ surface: menu, menu, where, key, parent: slotId(menu, where), ...extra });
    const level = (value) => (LEVELS.includes(value) ? { profile: { level: value } } : {});
    const when = (base, value) => ({ scope: 'project', ...base, ...level(value) });
    Object.entries(context.menus.main.roots).forEach(([key, value], order) => put('main', 'roots', key, { order, visible_when: when({}, value) }));
    Object.entries(context.menus.main.children).forEach(([key, value]) => put('main', 'children_min_level', key, { visible_when: when({}, value) }));
    const mystic = context.menus.mystic;
    if (mystic.immutable?.center) put('mystic', 'immutable.center', mystic.immutable.center.command, { slot: 'center', visible_when: when({}, null) });
    (mystic.fixed || []).forEach((item, order) => put('mystic', 'fixed', item.command, { order, slot: item.slot || null, visible_when: when({}, null) }));
    Object.entries(mystic.modes || {}).forEach(([mode, table]) => [table.center, ...(table.cross || []), table.exit, ...(table.entries || [])].filter(Boolean)
        .forEach((item, order) => put('mystic', `modes.${mode}`, item.command, { order, slot: item.slot || null, visible_when: when({ work_mode: [mode] }, null) })));
    Object.entries(mystic.objects || {}).forEach(([object, table]) => Object.entries(table)
        .forEach(([key, value]) => put('mystic', `objects.${object}`, key, { visible_when: when({ selection: [object] }, value) })));
    Object.entries(mystic.activities || {}).forEach(([activity, table]) => Object.entries(table.add || {})
        .forEach(([key, value]) => put('mystic', `activities.${activity}.add`, key, { visible_when: when({ activity: [activity] }, value) })));
    const sidebar = context.menus.sidebar;
    Object.entries(sidebar.objects || {}).forEach(([object, table]) => Object.entries(table)
        .forEach(([key, value]) => put('sidebar', `objects.${object}`, key, { visible_when: when({ selection: [object] }, value) })));
    Object.entries(sidebar.tools || {}).forEach(([tool, table]) => Object.entries(table.options || {})
        .forEach(([key, value]) => put('sidebar', `tools.${tool}.options`, key, { removed: value === null, visible_when: when({ armed_tool: [tool] }, value) })));
    Object.entries(sidebar.activities || {}).forEach(([activity, table]) => {
        Object.entries(table.add || {}).forEach(([key, value]) => put('sidebar', `activities.${activity}.add`, key, { visible_when: when({ activity: [activity] }, value) }));
        Object.entries(table.objects || {}).forEach(([object, part]) => Object.entries(part.add || {}).forEach(([key, value]) =>
            put('sidebar', `activities.${activity}.objects.${object}.add`, key, { visible_when: when({ activity: [activity], selection: [object] }, value) })));
        Object.entries(table.replace || {}).forEach(([from, to]) => put('sidebar', `activities.${activity}.replace`, to, { replaces: from, visible_when: when({ activity: [activity] }, null) }));
    });
    (content.toolbox?.children || []).forEach((key, order) => out.push({ surface: 'main_toolbox_content', menu: 'main_toolbox_content', where: 'toolbox.children',
        key, order, parent: slotId('main_toolbox_content', 'toolbox.children'), visible_when: when({}, null) }));
    return out;
}
