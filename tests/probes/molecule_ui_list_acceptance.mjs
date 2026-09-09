import path from 'node:path';
import { analyzePngSignal, assert, awaitBevyUiNodeTarget, clickCanvasTarget, diffPng, findBevyUiNodeTarget, findBevyUiNodeTargets, readBevyUiHit, visibleMenuTool, wait, waitFor, waitForStableScene } from "./molecule_ui_acceptance_support.mjs";
const clickMenuTarget = clickCanvasTarget;

export const runMoleculeListAcceptance = async ({ page, project, fixture, report, check, OUT_DIR, EXPECTED_HANDEDNESS, projectViewNode, readAcceptanceState }) => {
        report.measurements.viewport_geometry = await page.evaluate(() => {
            const canvas = document.getElementById('eve_surface_project');
            const view = document.getElementById('view');
            const styleFor = (element) => {
                const style = element ? getComputedStyle(element) : null;
                const rect = element?.getBoundingClientRect?.() || null;
                return {
                    rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
                    width: style?.width || null, height: style?.height || null,
                    minWidth: style?.minWidth || null, minHeight: style?.minHeight || null,
                    transform: style?.transform || null, zoom: style?.zoom || null
                };
            };
            return {
                inner: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
                visual: window.visualViewport ? {
                    width: window.visualViewport.width, height: window.visualViewport.height,
                    scale: window.visualViewport.scale
                } : null,
                html: styleFor(document.documentElement), body: styleFor(document.body),
                view: styleFor(view), canvas: styleFor(canvas),
                canvas_backing: { width: canvas?.width || 0, height: canvas?.height || 0 }
            };
        });

        await check('one shared canvas and a ready Bevy menu', async () => {
            const state = await readAcceptanceState(page, project.id, fixture.ownerId);
            assert(state.canvas_count === 1, `canvas_count:${state.canvas_count}`);
            assert(state.authoritative_dom_count === 0, `authoritative_dom_count:${state.authoritative_dom_count}`);
            assert(state.handedness === EXPECTED_HANDEDNESS, `handedness:${state.handedness}`);
            assert(state.menu?.active === true && state.menu?.treeMounted === true, `menu_not_ready:${JSON.stringify(state.menu)}`);
            assert(!state.overlay_error, `overlay_error:${state.overlay_error}`);
            return state;
        });

        await check('the fixed menu exposes the required tool order', async () => {
            const expected = ['atome', 'home', 'find', 'capture', 'time', 'communicate', 'mode', 'view', 'create'];
            const projected = [];
            for (const key of expected) {
                const target = await visibleMenuTool(page, project.id, key);
                projected.push(target?.id || null);
            }
            assert(projected.every(Boolean), `missing_menu_tools:${JSON.stringify(projected)}`);
            return { expected, projected };
        });

        await check('a real Creation click exposes only the functional v1 palette', async () => {
            const create = await visibleMenuTool(page, project.id, 'create');
            await clickMenuTarget(page, create);
            const measure = await waitFor(page, async () => {
                const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                const value = getMainMenuRuntime()?.measure?.() || null;
                return { ok: value?.activePaletteKey === 'create' && value?.paletteMotionActive === false, value };
            });
            // Les cles sont celles que le produit declare dans
            // `main_menu_create_content_runtime.js`. `draw` a ete renomme
            // `draw_create` : la sonde le demandait encore sous l'ancien nom et
            // signalait un menu introuvable la ou il n'y avait qu'un renommage.
            const children = ['text_create', 'draw_create', 'code_create', 'page_create'];
            const targets = [];
            for (const child of children) targets.push((await visibleMenuTool(page, project.id, child)).id);
            assert(!targets.some((id) => id.includes('generator')), `unexpected_generator:${JSON.stringify(targets)}`);
            return { palette: measure.value?.activePaletteKey, children, targets };
        });

        await check('a real View then List click opens the Molecule list', async () => {
            const view = await visibleMenuTool(page, project.id, 'view');
            await clickMenuTarget(page, view);
            await waitFor(page, async () => {
                const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                const measure = getMainMenuRuntime()?.measure?.() || null;
                return {
                    ok: measure?.activePaletteKey === 'view' && measure?.paletteMotionActive === false,
                    measure
                };
            });
            const list = await visibleMenuTool(page, project.id, 'view_list');
            const hit = await readBevyUiHit(page, list);
            assert(String(hit.nodeId || '').endsWith('view__view_list'), `view_list_hit_mismatch:${JSON.stringify({ list, hit })}`);
            await clickMenuTarget(page, list);
            const opened = await waitFor(page, async () => {
                const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                const state = readProjectViewSurfaceState();
                return {
                    ok: state.mode === 'list' && (state.content?.entries || []).length > 0,
                    mode: state.mode,
                    record_count: state.content?.recordCount || 0,
                    entry_count: state.content?.entries?.length || 0
                };
            });
            assert(await awaitBevyUiNodeTarget(page, {
                nodeId: 'project_view_list_entry_0_name', treeId: 'eve_bevy_ui_project_view'
            }),
                'project_view_first_list_row_not_actionable');
            return opened;
        });
        await waitForStableScene(page, project.id);

        const listShot = path.join(OUT_DIR, 'list_collapsed.png');
        await page.screenshot({ path: listShot, animations: 'disabled' });
        report.screenshots.push(listShot);

        await check('a real Molecule accordion exposes only its direct Atomes', async () => {
            const moleculeChevron = await awaitBevyUiNodeTarget(page, {
                nodeId: 'project_view_list_entry_0_hierarchy_chevron',
                treeId: 'eve_bevy_ui_project_view'
            });
            assert(moleculeChevron, 'molecule_chevron_not_actionable');
            const moleculeHit = await readBevyUiHit(page, moleculeChevron);
            assert(String(moleculeHit.nodeId || '').includes('project_view_list_entry_0_hierarchy_chevron'),
                `molecule_chevron_hit_mismatch:${JSON.stringify({ moleculeChevron, moleculeHit })}`);
            await clickCanvasTarget(page, moleculeChevron);
            const expandedMolecule = await waitFor(page, async () => {
                const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                const entries = readProjectViewSurfaceState().content?.entries || [];
                const directMembers = entries.filter((entry) => Number(entry.depth) === 1
                    && !['section', 'track'].includes(String(entry.visualRecord?.properties?.molecule_entity || '')));
                const internalRows = entries.filter((entry) => ['section', 'track']
                    .includes(String(entry.visualRecord?.properties?.molecule_entity || '')));
                return {
                    ok: directMembers.length > 0 && internalRows.length === 0,
                    memberIndex: entries.indexOf(directMembers[0]),
                    directMembers: directMembers.map((entry) => ({ id: entry.id, depth: entry.depth })),
                    internalRows: internalRows.map((entry) => entry.id),
                    entries: entries.map((entry, index) => ({
                        index, label: entry.label,
                        id: entry.id, depth: entry.depth,
                        entity: entry.visualRecord?.properties?.molecule_entity || null
                    }))
                };
            });
            memberEntryIndex = expandedMolecule.memberIndex;
            assert(await awaitBevyUiNodeTarget(page, {
                nodeId: `project_view_list_entry_${memberEntryIndex}_name`,
                treeId: 'eve_bevy_ui_project_view'
            }), `project_view_member_row_not_actionable:${memberEntryIndex}`);
            await wait(500);
            return expandedMolecule;
        });

        await check('real member selection remains canonical in the simplified List', async () => {
            assert(Number.isSafeInteger(memberEntryIndex), 'member_entry_index_missing');
            const nameVisual = await projectViewNode(page, project.id, `project_view_list_entry_${memberEntryIndex}_name`);
            const name = await findBevyUiNodeTarget(page, {
                nodeId: `project_view_list_entry_${memberEntryIndex}_name`,
                treeId: 'eve_bevy_ui_project_view', hint: nameVisual
            });
            assert(name, `member_name_not_actionable:${memberEntryIndex}`);
            const nameHit = {
                ...(await readBevyUiHit(page, name)),
                ...(await page.evaluate(() => {
                const dashboard = window.eveDashboardBevyUiRuntime?.state || {};
                return {
                    dashboard: {
                        active: dashboard.active === true,
                        suspended: dashboard.suspended === true,
                        opening: dashboard.opening === true,
                        closing: dashboard.closing === true,
                        sceneProjectId: dashboard.sceneProjectId || null
                    },
                    workspaceMode: window.__eveWorkspaceMode || null
                };
                }))
            };
            assert(String(nameHit.nodeId || '').endsWith(`project_view_list_entry_${memberEntryIndex}_name`),
                `member_name_hit_mismatch:${JSON.stringify({ name, nameHit })}`);
            await clickCanvasTarget(page, name);
            const selected = await waitFor(page, async () => {
                const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                const selection = await import('/eVe/intuition/runtime/selection.js');
                const primaryId = readProjectViewSurfaceState().content?.primaryId || null;
                return {
                    ok: Boolean(primaryId) && selection.getCurrentSelectionIds().includes(primaryId),
                    primaryId, selectedIds: selection.getCurrentSelectionIds()
                };
            });
            await wait(500);
            await waitFor(page, async () => {
                const registry = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
                const contextual = registry.getAtomeContextualEditApi()?.readState?.() || null;
                return { ok: contextual?.menuVisible === true, contextual };
            });
            return selected;
        });

        await check('selecting a Molecule exposes the canonical Delete action in its contextual rail', async () => {
            const molecule = await projectViewNode(page, project.id, 'project_view_list_entry_0_name');
            await clickCanvasTarget(page, molecule);
            const remove = await awaitBevyUiNodeTarget(page, {
                nodeId: 'atome_contextual_tool_delete',
                treeId: 'eve_bevy_panel_atome_contextual_edit'
            });
            assert(remove, 'molecule_delete_not_actionable');
            const hit = await readBevyUiHit(page, remove);
            assert(String(hit.nodeId || '').endsWith('atome_contextual_tool_delete'),
                `molecule_delete_hit_mismatch:${JSON.stringify({ remove, hit })}`);

            await waitFor(page, async (pid) => {
                const { readActiveMoleculeTarget } = await import('/eVe/domains/rendering/project_view_molecule_workspace_state.js');
                const target = readActiveMoleculeTarget(pid);
                return { ok: target?.entity_type === 'molecule', target };
            }, project.id);
            return { node: remove.id, hit };
        });

        await check('the contextual rail does not cover visible Molecule row content', async () => {
            const readyRail = await waitFor(page, async () => {
                const registry = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
                const rail = registry.getAtomeContextualEditApi()?.readState?.()?.railLayout || null;
                return { ok: !!rail, rail };
            });
            const candidates = (await findBevyUiNodeTargets(page, {
                nodePrefix: 'project_view_list_entry_',
                treeId: 'eve_bevy_ui_project_view',
                step: 2
            })).filter((target) => /_(?:name|preview|hierarchy_chevron)$/.test(target.id))
                .map((target) => ({ id: target.id, x: target.x, y: target.y }));
            const geometry = { rail: readyRail.rail, candidates };
            assert(geometry.rail, 'contextual_rail_layout_missing');
            const rail = geometry.rail;
            assert(geometry.candidates.length > 0, 'contextual_rail_row_targets_missing');
            const overlaps = geometry.candidates.filter((target) => (
                target.x >= rail.x && target.x <= rail.x + rail.itemSize
                && target.y >= rail.y && target.y <= rail.y + rail.railHeight
            ));
            assert(overlaps.length === 0, `contextual_rail_overlap:${JSON.stringify({ rail, overlaps })}`);
            return { rail, checked_boxes: geometry.candidates.length };
        });

        await check('a real Info click opens the canonical track property panel', async () => {
            // Attendre la projection plutot que de la supposer : un seul balayage
            // repondait `null` quand le panneau contextuel n'etait pas encore
            // peint, ce qui arrive sur le rasteriseur logiciel d'un run headless.
            // L'assertion est inchangee — seule la patience l'est.
            let info = null;
            let stableSamples = 0;
            let previousSignature = '';
            const readinessSamples = [];
            const infoDeadline = Date.now() + 30000;
            while (!info && Date.now() < infoDeadline) {
                const candidate = await findBevyUiNodeTarget(page, {
                    nodeId: 'atome_contextual_tool_molecule_info',
                    treeId: 'eve_bevy_panel_atome_contextual_edit',
                    step: 2
                });
                const hit = candidate ? await readBevyUiHit(page, candidate) : null;
                const signature = candidate && hit?.nodeId === candidate.id
                    ? JSON.stringify({ id: candidate.id, x: candidate.x, y: candidate.y, box: hit.box || null })
                    : '';
                stableSamples = signature && signature === previousSignature ? stableSamples + 1 : 0;
                readinessSamples.push({ signature, stableSamples });
                if (readinessSamples.length > 20) readinessSamples.shift();
                previousSignature = signature;
                if (stableSamples >= 1) info = candidate;
                else await wait(120);
            }
            assert(info, `molecule_info_not_actionable:${JSON.stringify(readinessSamples)}`);
            const hit = await readBevyUiHit(page, info);
            assert(String(hit.nodeId || '').endsWith('atome_contextual_tool_molecule_info'),
                `molecule_info_hit_mismatch:${JSON.stringify({ info, hit })}`);
            await clickCanvasTarget(page, info);
            const opened = await waitFor(page, async (pid) => {
                const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
                const ids = records.map((record) => String(record.id || ''));
                const infoRecords = ids.filter((id) => id.includes('eve_bevy_panel_info'));
                const infoTree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                    .some((tree) => tree.id === 'eve_bevy_panel_info');
                const { infoRuntime } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js');
                const panelRuntime = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
                const properties = infoRuntime.surface.readState()?.primary?.properties || {};
                return {
                    ok: (infoRecords.some((id) => id.includes('eve_bevy_panel_info_panel')) || infoTree)
                        // This context is the Molecule owner, not one of its
                        // tracks. Track-only fields must not be required here.
                        && Object.hasOwn(properties, 'tempo')
                        && Object.hasOwn(properties, 'quantization')
                        && Object.hasOwn(properties, 'metronome'),
                    properties, info_tree: infoTree,
                    info_record_count: infoRecords.length,
                    panel_open: panelRuntime.isBevyPanelSurfaceOpen('info'),
                    mounted_panels: [...panelRuntime.bevyPanelRuntimeState.mounted.keys()],
                    overlay_error: window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.lastOverlayError || null,
                    info_tool_failures: (window.__eveToolFailures || [])
                        .filter((entry) => String(entry?.tool_id || '').includes('info')).slice(-4),
                    info_routing: (window.atome?.tools?.gatewayRoutingLog || [])
                        .filter((entry) => String(entry?.tool_id || '').includes('info')).slice(-6)
                };
            }, project.id);
            await waitForStableScene(page, project.id);
            const close = await findBevyUiNodeTarget(page, {
                nodeId: 'eve_bevy_panel_info_footer_close',
                treeId: 'eve_bevy_panel_info'
            });
            assert(close, 'molecule_info_close_not_actionable');
            await clickCanvasTarget(page, close);
            await waitFor(page, () => ({
                ok: !(window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                    .some((tree) => tree.id === 'eve_bevy_panel_info')
            }));
            return opened;
        });

        await waitForStableScene(page, project.id);
        const expandedA = path.join(OUT_DIR, 'list_expanded_a.png');
        const expandedB = path.join(OUT_DIR, 'list_expanded_b.png');
        await page.screenshot({ path: expandedA, animations: 'disabled' });
        await wait(350);
        await page.screenshot({ path: expandedB, animations: 'disabled' });
        report.screenshots.push(expandedA, expandedB);
        report.visual_diff = diffPng(expandedA, expandedB);
        report.measurements.expanded_capture_signal = analyzePngSignal(expandedA);
        await check('two successive deterministic captures meet strict visual thresholds', async () => {
            const diff = report.visual_diff;
            const signal = report.measurements.expanded_capture_signal;
            assert(signal.non_black_pixel_ratio >= 0.01, `capture_visually_empty:${JSON.stringify(signal)}`);
            assert(signal.luma_range >= 12, `capture_luma_range:${JSON.stringify(signal)}`);
            assert(signal.sampled_color_count >= 12, `capture_color_count:${JSON.stringify(signal)}`);
            assert(diff.same_size === true, 'capture_size_changed');
            assert(diff.max_channel_delta <= 2, `max_channel_delta:${diff.max_channel_delta}`);
            assert(diff.differing_pixel_ratio <= 0.003, `differing_pixel_ratio:${diff.differing_pixel_ratio}`);
            assert(diff.mean_absolute_channel_delta <= 0.01, `mean_absolute_channel_delta:${diff.mean_absolute_channel_delta}`);
            return { diff, signal };
        });
};
