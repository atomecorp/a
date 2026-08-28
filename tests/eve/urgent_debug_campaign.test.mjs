import { describe, expect, it, vi } from 'vitest';

import { fixedHierarchyListRowNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list_fixed_row.js';
import {
    resolveRecordCompositePreviewHit,
    resolveRecordCompositePreviewLayout
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_record_composite_preview.js';
import { projectViewLevelRailDefinitions } from '../../eVe/domains/rendering/project_view_surface_context_runtime.js';
import { feedContextualRailWithRow } from '../../eVe/domains/rendering/project_view_contextual_rail.js';
import {
    executeMidiBinding,
    findMidiBindingConflict,
    matchMidiBindingInput,
    normalizeMidiBindingRecord
} from '../../eVe/intuition/runtime/midi_binding_runtime.js';
import {
    buildLineSplitterPlan,
    splitTextAtomeIntoLineMolecule
} from '../../eVe/intuition/tools/core/tool_runtime_line_splitter.js';
import { resolveMoleculeGeometry } from '../../eVe/intuition/tools/core/tool_runtime_molecule_geometry.js';
import { normalizeRenderAtom } from '../../eVe/domains/rendering/render_atom.js';
import { createRenderScene } from '../../eVe/domains/rendering/scene_graph.js';
import { targetsForPointerGesture } from '../../eVe/domains/rendering/surface_text_pointer_runtime.js';
import { buildTargetProps } from '../../eVe/domains/rendering/surface_pointer_runtime.js';
import { resolveAppliedProjectViewMode } from '../../eVe/domains/rendering/project_view_mode_state.js';
import {
    compileProjectViewTransportPlan,
    projectViewTransportSnapshotAt
} from '../../eVe/domains/rendering/project_view_transport_plan.js';
import { buildProjectViewSurfaceTree } from '../../eVe/domains/rendering/project_view_surface_tree.js';
import { projectViewVisualPanel } from '../../eVe/domains/rendering/project_view_visual_panel.js';
import { createProjectViewVisualFullscreenRuntime } from '../../eVe/domains/rendering/project_view_visual_fullscreen_runtime.js';
import { recordsForBevyProjection } from '../../eVe/domains/rendering/project_scene_record_projection.js';
import { buildBootstrapDefsB } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_b.js';
import {
    FLOWER_TOOL_KEYS_BY_KIND,
    resolveFlowerToolKeysForKind
} from '../../eVe/intuition/runtime/eve_intuition/flower_tool_capability_matrix.js';
import { EVE_EN_CORE_MESSAGES } from '../../eVe/i18n/languages_en_core.js';
import { EVE_FR_CORE_MESSAGES } from '../../eVe/i18n/languages_fr_core.js';
import { buildMainMenuRecordingVisualNodes } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_recording_visual_model.js';
import { createMainMenuRecordingVisualRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_recording_visual_runtime.js';

const childPositions = (tree) => Object.fromEntries(
    tree.children.map((child) => [child.id.replace('row_', ''), child.style.position[0]])
);

describe('urgent campaign contracts', () => {
    it('keeps one exact Flower capability matrix for every canonical media kind', () => {
        expect(resolveFlowerToolKeysForKind('midi')).toEqual([
            'copy', 'delete', 'info', 'couleur', 'communicate', 'play'
        ]);
        expect(resolveFlowerToolKeysForKind('audio')).toEqual([
            'copy', 'delete', 'info', 'couleur', 'communicate', 'play', 'audio_to_midi'
        ]);
        expect(resolveFlowerToolKeysForKind('video')).toEqual([
            'copy', 'delete', 'info', 'couleur', 'communicate', 'play'
        ]);
        expect(resolveFlowerToolKeysForKind('image')).toEqual(['copy', 'delete', 'info', 'communicate']);
        expect(resolveFlowerToolKeysForKind('shape')).toEqual(['copy', 'delete', 'info', 'communicate']);
        expect(resolveFlowerToolKeysForKind('text')).toEqual([
            'copy', 'delete', 'info', 'couleur', 'font', 'communicate'
        ]);
        expect(Object.isFrozen(FLOWER_TOOL_KEYS_BY_KIND)).toBe(true);
    });

    it('uses localized verbs for all contextual Flower actions', () => {
        expect(EVE_EN_CORE_MESSAGES).toMatchObject({
            'eve.menu.communicate': 'communicate',
            'eve.menu.couleur': 'colorize',
            'eve.menu.size': 'resize',
            'eve.menu.font': 'set font'
        });
        expect(EVE_FR_CORE_MESSAGES).toMatchObject({
            'eve.menu.communicate': 'communiquer',
            'eve.menu.couleur': 'colorer',
            'eve.menu.size': 'redimensionner',
            'eve.menu.font': 'changer la police'
        });
    });

    it('projects the Action Recorder owner state as a red circular indicator', () => {
        const state = { recordingVisualByToolId: new Map() };
        const runtime = createMainMenuRecordingVisualRuntime({ state, scheduleRender: vi.fn() });
        runtime.projectActionRecordingState({ active: true });
        const visual = state.recordingVisualByToolId.get('ui.detail.record.toggle');
        const nodes = buildMainMenuRecordingVisualNodes({
            item: { id: 'record_action' }, itemSize: 56, position: [10, 20], metrics: {},
            visual, stackLayer: 3, cornerRadius: 8
        });
        expect(nodes).toHaveLength(1);
        expect(nodes[0].overlayRecord.properties).toMatchObject({
            color: '#ff2d2d', corner_radius: 6.5
        });
        runtime.projectActionRecordingState({ active: false });
        expect(state.recordingVisualByToolId.has('ui.detail.record.toggle')).toBe(false);
    });

    it('lays out the canonical List row for right and left handed users without duplicating it', () => {
        const base = {
            rowId: 'row', entry: { visualRecord: { properties: {} }, hasChildren: true },
            option: { label: 'Name' }, width: 480, rowHeight: 44, y: 0, selected: false,
            background: '#000', columns: { unit: 44, hierarchyWidth: 44, muteWidth: 44, nameWidth: 132 }
        };
        const right = childPositions(fixedHierarchyListRowNode({ ...base, handedness: 'right' }));
        const left = childPositions(fixedHierarchyListRowNode({ ...base, handedness: 'left' }));
        expect(right.name).toBeLessThan(right.preview);
        expect(right.preview).toBeLessThan(right.mute);
        expect(right.mute).toBeLessThan(right.hierarchy);
        expect(left.hierarchy).toBeLessThan(left.mute);
        expect(left.mute).toBeLessThan(left.preview);
        expect(left.preview).toBeLessThan(left.name);
        const hierarchyActivate = vi.fn();
        const interactive = fixedHierarchyListRowNode({
            ...base, handedness: 'right', handlers: { hierarchyActivate }
        });
        const hierarchy = interactive.children.find((child) => child.id === 'row_hierarchy');
        const chevron = hierarchy.children.find((child) => child.id === 'row_hierarchy_chevron');
        expect(chevron.kind).toBe('button');
        chevron.on.activate();
        expect(hierarchyActivate).toHaveBeenCalledOnce();
    });

    it('resolves the topmost touched composite member for Visualizer editing', () => {
        const records = [
            { atome_id: 'back', type: 'shape', properties: { left: 0, top: 0, width: 100, height: 100, z_index: 1 } },
            { atome_id: 'front', type: 'shape', properties: { left: 25, top: 25, width: 50, height: 50, z_index: 2 } }
        ];
        const layout = resolveRecordCompositePreviewLayout({ records, width: 200, height: 200 });
        expect(resolveRecordCompositePreviewHit({ layout, point: { x: 100, y: 100 } })?.id).toBe('front');
        expect(resolveRecordCompositePreviewHit({ layout, point: { x: 20, y: 20 } })?.id).toBe('back');
    });

    it('keeps common contextual tools stable and Play at the lowest reachable priority', () => {
        const definitions = projectViewLevelRailDefinitions({ entity: 'molecule' });
        const priorities = definitions.map((definition) => definition.priority);
        expect(priorities.every(Number.isFinite)).toBe(true);
        expect(definitions.at(-1).key).toBe('container_play');
        expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    });

    it('appends Molecule-specific actions to the shared contextual rail', async () => {
        const enter = vi.fn(() => ({ ok: true }));
        await feedContextualRailWithRow({
            target: {
                id: 'mol-1',
                record: {
                    atome_id: 'mol-1', project_id: 'project-1', type: 'group',
                    properties: { kind: 'group', molecule_entity: 'molecule', owner_atome_id: 'mol-1' }
                }
            },
            projectId: 'project-1', api: { enter },
            loadRecords: async () => ({ ok: true, records: [] })
        });
        const options = enter.mock.calls[0][0];
        expect(options.extraDefinitions.map((definition) => definition.key)).toEqual([
            'molecule_import', 'molecule_info', 'molecule_activity'
        ]);
        expect(options.extraDefinitions.every((definition) => definition.priority < 1000)).toBe(true);
        expect(typeof options.extraInvoker).toBe('function');
    });

    it('normalizes, matches and conflict-checks one canonical MIDI binding', () => {
        const binding = normalizeMidiBindingRecord({
            atome_id: 'binding-1', parent_id: 'target-1', type: 'midi_binding',
            properties: {
                enabled: true, order: 2,
                input: { port_id: 'kbd', message_type: 'cc', channel: 1, number: 7, min: 0, max: 127 },
                actions: [{ tool_id: 'ui.opacity', action: 'pointer.click', target_atome_id: 'target-1', parameters: {} }],
                continuous: { min: 0, max: 1, inverted: false }
            }
        });
        expect(binding.ok).toBe(true);
        expect(matchMidiBindingInput(binding.binding, { port_id: 'kbd', message_type: 'cc', channel: 1, number: 7, value: 64 })).toMatchObject({ matched: true });
        expect(findMidiBindingConflict(binding.binding, [{ ...binding.binding, atome_id: 'binding-2' }])?.atome_id).toBe('binding-2');
        expect(recordsForBevyProjection([{
            atome_id: 'binding-1', type: 'midi_binding', properties: { kind: 'midi_binding' }
        }])).toEqual([]);
    });

    it('publishes closed Tool Gateway schemas for MIDI and Line Splitter commands', () => {
        const definitions = buildBootstrapDefsB((definition) => definition, (definition) => definition, 'calendar', 'registered');
        const commands = definitions.filter((definition) => (
            definition.tool_id === 'ui.text.line_splitter'
            || String(definition.tool_id || '').startsWith('midi.binding.')
        ));
        expect(commands).toHaveLength(12);
        expect(commands.every((definition) => definition.input_schema?.additionalProperties === false)).toBe(true);
        expect(commands.find((definition) => definition.tool_id === 'midi.binding.create')
            .input_schema.required).toEqual(['parent_id', 'input', 'actions']);
    });

    it('executes ordered MIDI actions through the gateway and stops on the faulty action', async () => {
        const invoke = vi.fn()
            .mockResolvedValueOnce({ ok: true })
            .mockResolvedValueOnce({ ok: false, error: 'bad_action' });
        const result = await executeMidiBinding({
            binding: {
                atome_id: 'binding-1', parent_id: 'target-1', enabled: true,
                actions: [
                    { tool_id: 'ui.first', action: 'pointer.click', target_atome_id: 'target-1', parameters: {} },
                    { tool_id: 'ui.second', action: 'pointer.click', target_atome_id: 'target-1', parameters: {} },
                    { tool_id: 'ui.third', action: 'pointer.click', target_atome_id: 'target-1', parameters: {} }
                ]
            },
            message: { value: 100 }, invoke
        });
        expect(invoke).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ ok: false, failed_action_index: 1, error: 'bad_action' });
    });

    it('builds a sequential Line Splitter molecule while preserving empty temporal steps', () => {
        const plan = buildLineSplitterPlan({
            source: {
                atome_id: 'text-1', project_id: 'project-1', parent_id: 'parent-1', type: 'text',
                properties: { content: 'One\n\nThree', left: 10, top: 20, width: 300, height: 90, color: '#fff' }
            }, moleculeId: 'mol-1', childIds: ['text-1', 'text-2', 'text-3']
        });
        expect(plan.ok).toBe(true);
        expect(plan.molecule.properties.playback_mode).toBe('sequential');
        expect(plan.children.map((child) => child.properties.content)).toEqual(['One', '', 'Three']);
        expect(plan.children.every((child) => child.properties.playback_dwell_seconds === 1)).toBe(true);
        expect(plan.children.map((child) => child.parent_id)).toEqual(['mol-1', 'mol-1', 'mol-1']);
    });

    it('commits Line Splitter as one canonical molecule batch', async () => {
        const commitBatch = vi.fn().mockResolvedValue({ ok: true });
        const ids = ['mol-1', 'text-2', 'text-3'];
        const result = await splitTextAtomeIntoLineMolecule({ targetAtomeId: 'text-1' }, {
            read: vi.fn().mockResolvedValue({
                atome_id: 'text-1', project_id: 'project-1', parent_id: 'project-1', type: 'text',
                properties: { content: 'One\n\nThree', left: 2, top: 3, width: 80, height: 40 }
            }),
            createId: () => ids.shift(),
            commitBatch
        });
        expect(result).toMatchObject({
            ok: true, molecule_id: 'mol-1', child_ids: ['text-1', 'text-2', 'text-3'], line_count: 3
        });
        expect(commitBatch).toHaveBeenCalledTimes(1);
        const [events, options] = commitBatch.mock.calls[0];
        expect(events.map((event) => event.atome_id)).toEqual(['mol-1', 'text-1', 'text-2', 'text-3']);
        expect(events.slice(1).map((event) => event.props.content)).toEqual(['One', '', 'Three']);
        expect(options).toMatchObject({ refreshState: true, realtimeBroadcast: true });
    });

    it('gives a canonical molecule the union geometry of its visible members', () => {
        expect(resolveMoleculeGeometry([
            { properties: { left: 10, top: 20, width: 100, height: 50 } },
            { properties: { left: 80, top: 5, width: 60, height: 30 } }
        ])).toEqual({ left: 10, top: 5, width: 130, height: 65 });
    });

    it('keeps a structural Molecule hittable without painting the historical white shape', () => {
        const atom = normalizeRenderAtom({
            atome_id: 'mol-1', type: 'group',
            properties: { kind: 'group', molecule_entity: 'molecule', left: 10, top: 5, width: 130, height: 65 }
        });
        expect(atom.bounds).toEqual({ x: 10, y: 5, width: 130, height: 65 });
        expect(atom.visual.opacity).toBe(0);
    });

    it('selects one Molecule while moving its owner and members through one gesture', () => {
        const scene = createRenderScene([
            normalizeRenderAtom({
                atome_id: 'member-a', parent_id: 'mol-1', type: 'shape',
                properties: { left: 10, top: 20, width: 40, height: 30 }
            }),
            normalizeRenderAtom({
                atome_id: 'member-b', parent_id: 'mol-1', type: 'text',
                properties: { left: 70, top: 40, width: 60, height: 25, content: 'B' }
            }),
            normalizeRenderAtom({
                atome_id: 'mol-1', type: 'group',
                properties: { kind: 'group', molecule_entity: 'molecule', left: 10, top: 20, width: 120, height: 45 }
            })
        ]);
        const molecule = scene.byId.get('mol-1');
        const gesture = targetsForPointerGesture(scene, molecule, new Set());
        expect(gesture.targets.map((target) => target.atome_id)).toEqual([
            'mol-1', 'member-a', 'member-b'
        ]);
        expect(buildTargetProps({ mode: 'drag', targets: gesture.targets }, { x: 15, y: -5 }))
            .toEqual([
                { atome_id: 'mol-1', props: { left: 25, top: 15 } },
                { atome_id: 'member-a', props: { left: 25, top: 15 } },
                { atome_id: 'member-b', props: { left: 85, top: 35 } }
            ]);
    });

    it('accepts a Natural transition only when the canonical surface confirms it', () => {
        expect(resolveAppliedProjectViewMode({
            applied: undefined,
            mode: 'natural',
            projectId: 'project-1',
            surfaceState: { mounted: false, mode: 'natural', projectId: 'project-1' }
        })).toMatchObject({ ok: true, confirmed_from_surface: true });
        expect(resolveAppliedProjectViewMode({
            applied: undefined,
            mode: 'natural',
            projectId: 'project-1',
            surfaceState: { mounted: false, mode: 'list', projectId: 'project-1' }
        })).toBeUndefined();
    });

    it('runs a sequential Prompter molecule in parallel with sibling media', () => {
        const records = [
            { atome_id: 'root', type: 'group', properties: { playback_mode: 'simultaneous' } },
            { atome_id: 'music', parent_id: 'root', type: 'audio', properties: { duration_seconds: 3, hierarchy_order: 0 } },
            { atome_id: 'prompter', parent_id: 'root', type: 'group', properties: { playback_mode: 'sequential', hierarchy_order: 1 } },
            { atome_id: 'line-1', parent_id: 'prompter', type: 'text', properties: { content: 'One', playback_dwell_seconds: 1, hierarchy_order: 0 } },
            { atome_id: 'line-2', parent_id: 'prompter', type: 'text', properties: { content: 'Two', playback_dwell_seconds: 1, hierarchy_order: 1 } }
        ];
        const plan = compileProjectViewTransportPlan({ rootId: 'root', records });
        const first = projectViewTransportSnapshotAt(plan, 0.5);
        const second = projectViewTransportSnapshotAt(plan, 1.5);
        expect(first.activeLeafIds).toEqual(expect.arrayContaining(['music', 'line-1']));
        expect(second.activeLeafIds).toEqual(expect.arrayContaining(['music', 'line-2']));
        expect(first.prompter.records.map((record) => record.atome_id)).toEqual(['line-1', 'line-2']);
        expect(second.prompter.active_atome_id).toBe('line-2');
    });

    it('projects Visualizer-only content while visual_fullscreen is active', () => {
        projectViewVisualPanel.setSubject({
            atome_id: 'visual', type: 'shape', properties: { left: 0, top: 0, width: 100, height: 100, color: '#f00' }
        });
        const tree = buildProjectViewSurfaceTree({
            surface: { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ width: 800, height: 600 }) },
            state: { visualFullscreen: true },
            activeContent: () => ({}),
            syncVisualSubject: () => ({ record: projectViewVisualPanel.subjectRecord() }),
            contextualState: { menuVisible: true, handedness: 'right' },
            emit: () => null,
            footer: { setLevel: () => {}, setTransport: () => {}, build: () => ({}) },
            navigation: { current: null, depth: 0, canGoBack: false },
            currentProjectName: () => 'Project'
        });
        const ids = [];
        const visit = (node) => {
            if (!node) return;
            ids.push(node.id);
            (node.children || []).forEach(visit);
        };
        visit(tree.root);
        expect(ids).toContain('project_view_visual');
        expect(ids.some((id) => String(id).includes('footer'))).toBe(false);
        expect(ids.some((id) => String(id).includes('list'))).toBe(false);
        projectViewVisualPanel.reset();
    });

    it('keeps Visual fullscreen inside the shared canvas and exits from its long press', async () => {
        const state = { mode: 'list', visualFullscreen: false };
        const render = vi.fn().mockResolvedValue({ ok: true });
        const syncContext = vi.fn().mockResolvedValue({ ok: true });
        const setChromeSuspended = vi.fn().mockResolvedValue(undefined);
        let playing = false;
        const runtime = createProjectViewVisualFullscreenRuntime({
            state,
            readSurface: () => ({ isConnected: true }),
            setChromeSuspended,
            render,
            syncContext,
            shouldProject: () => playing
        });
        expect(await runtime.arm()).toMatchObject({ ok: true, visual_fullscreen: false, armed: true });
        expect(state.visualFullscreen).toBe(false);
        expect(state.visualFullscreenArmed).toBe(true);
        playing = true;
        expect(await runtime.activate()).toMatchObject({ ok: true, visual_fullscreen: true });
        expect(state.visualFullscreen).toBe(true);
        expect(setChromeSuspended).toHaveBeenLastCalledWith(true);
        expect(projectViewLevelRailDefinitions({}, { visualFullscreen: true })
            .find((definition) => definition.key === 'visual_fullscreen')?.active).toBe(true);

        projectViewVisualPanel.setSubject({
            atome_id: 'visual-long-press', type: 'shape', properties: { width: 10, height: 10 }
        });
        const exit = vi.fn(() => runtime.disable());
        const tree = projectViewVisualPanel.build({ width: 100, height: 100, onLongPress: exit });
        await tree.children[0].on.long_press({ x: 4, y: 4 });
        expect(exit).toHaveBeenCalledTimes(1);
        expect(state.visualFullscreen).toBe(false);
        expect(state.visualFullscreenArmed).toBe(false);
        expect(setChromeSuspended).toHaveBeenLastCalledWith(false);
        projectViewVisualPanel.reset();
    });
});
