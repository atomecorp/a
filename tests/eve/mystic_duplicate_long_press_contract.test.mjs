import { JSDOM } from 'jsdom';
import { expect, test } from 'vitest';
import { PROJECT_SCENES } from '../../eVe/domains/rendering/project_scene_state.js';

// L'appui long sur Copier (menu Mystic) est un compose, pas un troisieme verbe :
// il copie la selection par le chemin normal (`ui.copy.action`) puis colle par le
// chemin normal (`ui.paste.action`), qui range le clone par l'API de placement
// des arrivees. Ces contrats traversent le chemin reellement emprunte par
// l'appui long — contenu canonique, module lazy, gateway, commit — et verrouillent
// la regle de rangement demandee : a droite de la source, sinon en dessous.

// Une seule fenetre pour tout le fichier : vitest met les modules en cache, donc
// `runtime/tool.js` ne se re-execute pas au test suivant. Recreer une fenetre
// laisserait `window.atome.tools.handlers` absent sur la nouvelle et le gateway
// repondrait `tool_handler_missing` pour une raison etrangere au contrat teste.
let sharedDom = null;
const setupDom = () => {
    if (sharedDom) return sharedDom;
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/' });
    sharedDom = dom;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.CustomEvent = dom.window.CustomEvent;
    globalThis.Event = dom.window.Event;
    globalThis.localStorage = dom.window.localStorage;
    // `runtime/tool.js` reschedule une synchro du catalogue a l'import: sans API
    // adole le timer rejette une promesse non geree et fait echouer le fichier
    // pour une raison etrangere au contrat.
    dom.window.AdoleAPI = { atomes: { list: async () => ({ ok: true, atomes: [] }) } };
    return dom;
};

const shape = (id, projectId, { left, top, width = 120, height = 80 }) => ({
    atome_id: id,
    type: 'shape',
    project_id: projectId,
    properties: { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, parent_id: projectId, visible: true }
});

const installProject = (records) => {
    const projectId = records[0].project_id;
    PROJECT_SCENES.set(projectId, {
        project_id: projectId,
        project_revision: 1,
        records: new Map(records.map((record) => [record.atome_id, record]))
    });
    const clones = () => records.map((record) => JSON.parse(JSON.stringify(record)));
    window.Atome = {
        getStateCurrent: async (atomeId) => clones().find((record) => record.atome_id === String(atomeId)) || null,
        listStateCurrent: async () => clones(),
        commitBatch: (events, options) => window.__atomeCommitApi.commitBatch(events, options)
    };
    const committed = [];
    window.__atomeCommitApi = {
        commitBatch: async (events) => { committed.push(...events); return { ok: true }; }
    };
    return { projectId, committed };
};

test('the Copy tile declares its long press as Copy then Paste, served by the copy module', async () => {
    const { createMainMenuEditContent } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_edit_content.js');
    const content = createMainMenuEditContent({
        t: (key, fallback) => fallback || key,
        mainToolIdByKey: { copy: 'tool.main.copy', cut: 'tool.main.cut', undo: 'tool.main.undo' },
        invokeSimpleTool: () => ({ ok: true }),
        ensureCopyModule: async () => null,
        applyDeleteSelection: async () => ({ ok: true }),
        openDeletePanel: () => null,
        openUndoPanel: () => null
    });
    expect(content.copy.long_press_tool_id).toBe('ui.copy.duplicate');
    expect(content.copy.long_press_module).toBe('copy');
});

test('the lazy copy module owns the ui.copy.duplicate handler the gateway resolves', async () => {
    setupDom();
    await import('../../eVe/intuition/runtime/tool.js');
    const { duplicateSelectionViaClipboard } = await import('../../eVe/intuition/tools/copy.js');
    expect(typeof duplicateSelectionViaClipboard).toBe('function');

    const { bootstrapV2Tools } = await import('../../eVe/intuition/tools/core/tool_runtime.js');
    await bootstrapV2Tools();
    expect(typeof window.atome.tools.handlers.get('ui.copy.duplicate')).toBe('function');

    const { invokeToolGateway } = await import('../../eVe/intuition/runtime/tool_gateway.js');
    const resolved = await invokeToolGateway({
        tool_id: 'ui.copy.duplicate',
        action: 'open',
        nameKey: 'copy_long_press',
        input: { name_key: 'copy_long_press' },
        source: { type: 'ui', layer: 'mystic_menu' },
        presentation: 'ui'
    });
    // Aucune selection: la route existe et le handler enregistre par le module
    // est bien celui qui s'execute. C'est exactement l'echec observe a l'ecran
    // (`tool_handler_missing`) que ce contrat interdit.
    expect(resolved.tool_key).toBe('copy_duplicate');
    expect(resolved.result?.bridged).toBe('registered_handler');
    expect(resolved.error).not.toBe('tool_not_found');
    expect(resolved.error).not.toBe('tool_handler_missing');
    expect(resolved.error).not.toBe('tool_handler_missing_v2');
});

test('the Copy long press commits the clone right of the source, same top', async () => {
    setupDom();
    const { clearProjectSceneFlowReservations } = await import('../../eVe/domains/rendering/project_scene_stack_runtime.js');
    clearProjectSceneFlowReservations(null);
    await import('../../eVe/intuition/runtime/tool.js');
    await import('../../eVe/intuition/tools/copy.js');
    const { invokeToolGateway } = await import('../../eVe/intuition/runtime/tool_gateway.js');

    const source = shape('a1', 'p_dup_right', { left: 300, top: 200 });
    const { projectId, committed } = installProject([source]);

    const result = await invokeToolGateway({
        tool_id: 'ui.copy.duplicate',
        action: 'open',
        nameKey: 'copy_long_press',
        input: { name_key: 'copy_long_press', selection_ids: ['a1'], project_id: projectId },
        source: { type: 'ui', layer: 'mystic_menu' },
        presentation: 'ui'
    });
    expect(result.ok).toBe(true);
    expect(committed).toHaveLength(1);
    // 300 + 120 (largeur) + 24 (gouttiere canonique), meme haut que la source.
    expect(committed[0].props.left).toBe('444px');
    expect(committed[0].props.top).toBe('200px');
});

test('the Copy long press falls below the source when the row has no room', async () => {
    setupDom();
    const { clearProjectSceneFlowReservations } = await import('../../eVe/domains/rendering/project_scene_stack_runtime.js');
    clearProjectSceneFlowReservations(null);
    await import('../../eVe/intuition/runtime/tool.js');
    await import('../../eVe/intuition/tools/copy.js');
    const { invokeToolGateway } = await import('../../eVe/intuition/runtime/tool_gateway.js');

    const projectId = 'p_dup_below';
    const source = shape('a1', projectId, { left: 300, top: 200 });
    const neighbour = shape('a2', projectId, { left: 420, top: 200, width: 200 });
    const { committed } = installProject([source, neighbour]);

    const result = await invokeToolGateway({
        tool_id: 'ui.copy.duplicate',
        action: 'open',
        nameKey: 'copy_long_press',
        input: { name_key: 'copy_long_press', selection_ids: ['a1'], project_id: projectId },
        source: { type: 'ui', layer: 'mystic_menu' },
        presentation: 'ui'
    });
    expect(result.ok).toBe(true);
    expect(committed.at(-1).props.left).toBe('300px');
    // 200 + 80 (hauteur) + 24 (gouttiere), meme gauche que la source.
    expect(committed.at(-1).props.top).toBe('304px');
});

test('a paste with an explicit drop point keeps landing at the click', async () => {
    const { executeBootstrapDuplicateOperation } = await import('../../eVe/intuition/tools/core/tool_runtime_atome_duplicate.js');
    const sourceState = {
        atome_id: 'a1',
        type: 'shape',
        project_id: 'p_dup_drop',
        parent_id: 'p_dup_drop',
        properties: { left: '10px', top: '20px', width: '100px', height: '50px' }
    };
    const committed = [];
    window.__atomeCommitApi = {
        commitBatch: async (events) => { committed.push(...events); return { ok: true }; }
    };
    window.Atome = {
        ...(window.Atome || {}),
        getStateCurrent: async (atomeId) => (String(atomeId) === 'a1' ? structuredClone(sourceState) : null),
        commitBatch: window.__atomeCommitApi.commitBatch
    };
    const placements = [];

    const pasted = await executeBootstrapDuplicateOperation(
        { selection_ids: ['a1'], placement_mode: 'preserve_relative', project_id: 'p_dup_drop', left: 42, top: 84 },
        {
            placeBlock: (projectId, box) => { placements.push({ projectId, box }); return { left: 500, top: 60 }; },
            mergeStack: () => ({})
        }
    );
    expect(pasted.ok).toBe(true);
    expect(placements).toHaveLength(0);
    expect(committed.at(-1).props.left).toBe('42px');
    expect(committed.at(-1).props.top).toBe('84px');
});
