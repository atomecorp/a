import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, openNewProject } from '../../tests/helpers/probe_app.mjs';
import { openHome } from '../../tests/helpers/probe_home.mjs';
import { awaitBevyUiNodeTarget, clickCanvasTarget } from '../../tests/probes/molecule_ui_acceptance_support.mjs';

const output = path.dirname(fileURLToPath(import.meta.url));
const railId = 'eve_bevy_panel_atome_contextual_edit';
const toolId = 'atome_contextual_tool_timeline_input';
const trackIds = Array.from({ length: 8 }, (_, index) => `track_${index + 1}`);
const direct = process.argv.includes('--direct');

// The fixture changes only the definitions fed to the real rail in this browser session.
const file = 'eVe/domains/rendering/project_view_timeline_input_rail.js';
const moduleSource = (await fs.readFile(file, 'utf8')).replace('export const timelineInputDefinition =', 'const stockTimelineInputDefinition =');
const fixture = `
export const timelineInputDefinition = (options = {}) => {
    const [palette] = stockTimelineInputDefinition(options);
    if (!palette) return [];
    const tracks = options.tracks || [];
    const stereo = tracks.length === 1 && tracks[0].track_id === 'track_4';
    const channel = stereo ? 23 : 17;
    const values = stereo ? Array.from({ length: 15 }, (_, index) => (2 * index + 1) + '–' + (2 * index + 2))
        : Array.from({ length: 30 }, (_, index) => String(index + 1));
    const roller = (key, values, index, icon) => ({ key, label: values[index], toolType: 'roller', rollerValues: values,
        rollerValue: index, rollerIcon: icon });
    const original = new Map(palette.children.map(row => [row.key, row]));
    const camera = palette.inputKinds.includes('video')
        ? [roller('timeline_input_roller_video', ['Arrière', 'Avant'], 0, 'video')] : [];
    const listening = original.get('timeline_input_monitoring');
    const level = original.get('timeline_input_level');
    return [{ ...palette, label: 'Entrée', children: [
        roller('timeline_input_roller_audio', values, stereo ? (channel - 1) / 2 : channel - 1, 'microphone'),
        { key: 'timeline_input_format', label: stereo ? 'Stéréo' : 'Mono', icon: 'waveform', toolType: 'tool' },
        roller('timeline_input_roller_card', ['Micro', 'Carte USB'], 1, 'microphone'),
        ...camera,
        ...(level ? [{ ...level, label: 'Niveau' }] : []),
        ...(listening ? [listening] : [])
    ] }];
};`;

let hitModule = false;
const { page, close } = await openHome({
    report: { errors: [] }, write: () => {}, check: (name, ok) => assert.ok(ok, name), view: 'desktop', locale: 'fr-FR',
    beforeOpen: direct ? null : async (page) => {
        const session = await page.context().newCDPSession(page);
        await session.send('Network.setBypassServiceWorker', { bypass: true });
        await page.route(`**/${file}*`, (route) => {
            hitModule = true;
            return route.fulfill({ contentType: 'text/javascript', body: `${moduleSource}\n${fixture}` });
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__eveWorkspaceDashboardReady === true && !!window.eveBevyUiRuntime, null, { timeout: 90000 });
    }
});

const click = async (nodeId) => {
    const target = await awaitBevyUiNodeTarget(page, { nodeId }, { timeoutMs: 12000 });
    assert.ok(target, nodeId);
    await clickCanvasTarget(page, target);
};

const projectFixture = ({ projectId, trackId }) => page.evaluate(async ({ projectId, trackId, railId, toolId, fixture }) => {
    const [{ buildAtomeContextualEditTree }, input, { locateBevyUiNode }, { railRollerHandlers }] = await Promise.all([
        import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_model.js'),
        import('/eVe/domains/rendering/project_view_timeline_input_rail.js'),
        import('/eVe/domains/rendering/bevy_ui_scroll_runtime.js'),
        import('/eVe/intuition/runtime/eve_intuition/atome_contextual_rail_roller.js')
    ]);
    input.stopLevelMeter();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const runtime = window.eveBevyUiRuntime;
    const current = runtime.state.sourceTrees.get(railId);
    const rendered = runtime.state.trees.get(railId).tree;
    const anchor = locateBevyUiNode({ node: rendered.root, nodeId: toolId }).box;
    const timeline = window.eveMoleculeTimelineApi.readGroupTimeline({ group_id: projectId }).timeline;
    const [palette] = new Function('stockTimelineInputDefinition', `${fixture}\nreturn timelineInputDefinition;`)(input.timelineInputDefinition)({
        timeline, tracks: timeline.tracks.filter((track) => track.track_id === trackId)
    });
    const handlers = Object.fromEntries(palette.children.filter((row) => row.toolType === 'roller')
        .map((row) => [`${toolId}_${row.key}`, railRollerHandlers(row, () => {}, 30)]));
    const draft = buildAtomeContextualEditTree({ surface: current.surface, activeAtomeId: projectId,
        definitions: [palette], itemSize: anchor.width, activePaletteKey: palette.key, handlers });
    const draftAnchor = locateBevyUiNode({ node: draft.root, nodeId: toolId }).box;
    const isMenu = (node) => node.id.startsWith(`${toolId}_`) || node.id === 'atome_contextual_tether_timeline_input';
    const move = (node) => ({ ...node, style: { ...node.style,
        position: [node.style.position[0] + anchor.x - draftAnchor.x, node.style.position[1] + anchor.y - draftAnchor.y] } });
    const children = [...current.tree.root.children.filter((node) => !isMenu(node)), ...draft.root.children.filter(isMenu).map(move)];
    await runtime.updateTree({ id: railId, surface: current.surface, tree: { ...current.tree, root: { ...current.tree.root, children } } });
}, { projectId, trackId, railId, toolId, fixture: fixture.replace('export const timelineInputDefinition', 'const timelineInputDefinition') });

const inspect = (wanted) => page.evaluate(async ({ railId, toolId, wanted }) => {
    const { locateBevyUiNode } = await import('/eVe/domains/rendering/bevy_ui_scroll_runtime.js');
    const root = window.eveBevyUiRuntime.state.trees.get(railId).tree.root;
    const find = (suffix) => locateBevyUiNode({ node: root, nodeId: `${toolId}_timeline_input_${suffix}` });
    const describe = (suffix) => {
        const selected = find(suffix);
        if (!selected) return null;
        const observe = (node, key) => node?.id.endsWith(key) ? node : (node?.children || []).map((child) => observe(child, key)).find(Boolean);
        const picked = observe(selected.node, '_roller_value');
        const split = suffix.startsWith('roller') ? ['decrement', 'value', 'increment'].map((part) => {
            const item = observe(selected.node, `_roller_${part}`);
            return item?.accessibility?.label || observe(item, part === 'value' ? '_input' : '_text')?.text || '';
        }) : [];
        return { box: selected.box, picked: picked ? locateBevyUiNode({ node: root, nodeId: picked.id })?.box : null,
            fill: picked?.style.background, values: split };
    };
    return Object.fromEntries(wanted.map((key) => [key, describe(key)]));
}, { railId, toolId, wanted });

try {
    await page.setViewportSize({ width: 1180, height: 880 });
    await page.context().grantPermissions(['microphone', 'camera']);
    await app(page, `const { setVisualPreferences } = await import('/eVe/intuition/tools/user_visual_preference_writer.js');
        return setVisualPreferences({ theme: 'amber', masteryLevel: 'advanced', dashboardStyle: 'pro' }, { source: 'probe' });`);
    const projectId = (await openNewProject(page, 'Entrée · Maquette')).id;
    await app(page, `const { setProjectViewMode } = await import('/eVe/domains/rendering/project_view_mode_state.js');
        return setProjectViewMode('timeline', { projectId: arg });`, projectId);
    const sample = await app(page, `const { projectId, trackIds } = arg; const api = window.eveMoleculeTimelineApi;
        const sectionId = api.readGroupTimeline({ group_id: projectId }).timeline.sections[0].section_id;
        return api.applyGroupTimelineBatch({ group_id: projectId, operations: trackIds.map((trackId, index) => ({ operation: 'track.add',
            command: { track_id: trackId, section_id: sectionId, kind: index === 2 || index === 3 ? 'video' : 'audio',
                name: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'][index], order: index + 1 } })) });`, { projectId, trackIds });
    assert.equal(sample.ok, true, JSON.stringify(sample));
    const examples = [
        { trackId: 'track_3', file: 'piste-3-mono' },
        { trackId: 'track_4', file: 'piste-4-stereo' },
        { trackId: 'track_3', file: 'retour-piste-3' }
    ];
    for (const example of examples) {
        await click(`project_view_timeline_header_${example.trackId}`);
        if (example === examples[0]) {
            await click('atome_contextual_tool_timeline_view');
            await click('atome_contextual_tool_timeline_view_multitrack_preview');
        }
        await click(toolId);
        await page.waitForTimeout(1200);
        if (direct) await projectFixture({ projectId, trackId: example.trackId });
        const found = await inspect(['monitoring', 'level', 'roller_video', 'roller_card', 'format', 'roller_audio']);
        assert.ok(direct || hitModule);
        console.log(example.file, JSON.stringify(found));
        assert.ok(found.roller_video && found.roller_audio && found.roller_card && found.format);
        assert.ok(found.roller_video.box.y + found.roller_video.box.height <= found.roller_card.box.y);
        assert.ok(found.format.box.y + found.format.box.height <= found.roller_audio.box.y);
        assert.ok(found.roller_audio.fill[0] > 0.8 && found.roller_video.fill[0] > 0.8);
        await page.screenshot({ path: path.join(output, `${example.file}.png`) });
        await click(toolId);
    }
} finally {
    await close();
}
