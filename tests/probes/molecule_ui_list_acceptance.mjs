import path from 'node:path';
import { analyzePngSignal, assert, awaitBevyUiNodeTarget, clickCanvasTarget, diffPng, findBevyUiNodeTarget, findBevyUiNodeTargets, readBevyUiHit, visibleMenuTool, wait, waitFor, waitForStableScene } from "./molecule_ui_acceptance_support.mjs";
const clickMenuTarget = clickCanvasTarget;

// The List orders loose Atomes before Molecules: the fixture's Molecule row is
// found by its id, never assumed at index 0.
const moleculeRowIndex = (page, ownerId) => page.evaluate(async (id) => {
    const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
    return (readProjectViewSurfaceState().content?.entries || []).findIndex((entry) => entry.id === id);
}, ownerId);

// Opens the Mystic menu of the selected subject: in a structured view Mystic is
// blocked on the BevyUI rows and opens on the subject's visual preview
// (`context_target.js#readProjectViewVisualPoint`); resolves with its item keys.
const mysticItemIds = (page) => page.evaluate(() => {
    const tree = window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_ui_mystic')?.tree || null;
    const ids = [];
    const visit = (node) => { if (!node || typeof node !== 'object') return; ids.push(String(node.id || '')); (node.children || []).forEach(visit); };
    visit(tree?.root);
    return ids;
});
const openRowMystic = async (page) => {
    const visual = await awaitBevyUiNodeTarget(page, { nodeId: 'project_view_visual_preview', treeId: 'eve_bevy_ui_project_view' });
    assert(visual, 'project_view_visual_preview_missing');
    await page.mouse.click(visual.x, visual.y, { button: 'right' });
    const opened = await waitFor(page, async () => {
        const mystic = await import('/eVe/intuition/mystic/index.js');
        return { ok: mystic.isMysticMenuOpen?.() === true };
    });
    assert(opened.ok, 'molecule_mystic_not_open');
    await wait(400);
    return [...new Set((await mysticItemIds(page)).map((id) => id.match(/_item_([a-z_]+?)_\d/)?.[1]).filter(Boolean))];
};
const mysticItemTarget = async (page, key) => {
    const nodeId = (await mysticItemIds(page)).find((id) => new RegExp(`_item_${key}_\\d+$`).test(id));
    return nodeId ? findBevyUiNodeTarget(page, { nodeId, treeId: 'eve_bevy_ui_mystic', step: 2 }) : null;
};

// The ids the contextual rail projects now (diagnostic of a missing tool).
const railNodeIds = (page) => page.evaluate(async () => {
    const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
    const registry = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
    const content = readProjectViewSurfaceState().content || {};
    const rail = registry.getAtomeContextualEditApi()?.readState?.() || {};
    const context = { primaryId: content.primaryId, selectedIds: content.selectedIds, entry0: content.entries?.[0] ? { id: content.entries[0].id, entity: content.entries[0].visualRecord?.properties?.molecule_entity, type: content.entries[0].visualRecord?.type } : null,
        railTarget: rail.activeAtomeId || rail.atomeId || null, railKind: rail.kind || null };
    const root = window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_panel_atome_contextual_edit')?.tree?.root;
    const ids = [];
    const visit = (node) => { if (!node) return; if (/^atome_contextual_tool_[^]*$/.test(String(node.id)) && !/_(label|icon|ground|glass)$/.test(String(node.id))) ids.push(String(node.id)); (node.children || []).forEach(visit); };
    visit(root);
    return { context, ids: ids.filter((id) => !/_(background|corner)$/.test(id)) };
});

export const runMoleculeListAcceptance = async ({ page, project, fixture, report, check, OUT_DIR, EXPECTED_HANDEDNESS, projectViewNode, readAcceptanceState }) => {
    // The member row the accordion revealed, shared by the following checks.
    let memberEntryIndex = null;
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
            // Every root of the ribbon (the account level's canonical taxonomy) is
            // reachable, in order, and the tools a Molecule needs are among them.
            const expected = await page.evaluate(async () => (await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js'))
                .getMainMenuRuntime()?.measure?.()?.rootKeys || []);
            const required = ['atome', 'find', 'capture', 'communicate', 'view', 'create'];
            assert(required.every((key) => expected.includes(key)), `required_menu_tools_missing:${JSON.stringify({ expected, required })}`);
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
            const row = await moleculeRowIndex(page, fixture.ownerId);
            assert(row >= 0, 'molecule_row_missing');
            const moleculeChevron = await awaitBevyUiNodeTarget(page, {
                nodeId: `project_view_list_entry_${row}_hierarchy_chevron`,
                treeId: 'eve_bevy_ui_project_view'
            });
            assert(moleculeChevron, 'molecule_chevron_not_actionable');
            const moleculeHit = await readBevyUiHit(page, moleculeChevron);
            assert(String(moleculeHit.nodeId || '').includes(`project_view_list_entry_${row}_hierarchy_chevron`),
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
                ...(await page.evaluate(() => ({
                    workspaceMode: window.__eveWorkspaceMode || null
                })))
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

        // Canonical taxonomy (eVe/intuition/menu/context_menus.json): a selected
        // Molecule's rail (`menus.sidebar.objects.molecule` + the List's own
        // actions) offers Enter and Ungroup; Delete and Info are its Mystic items
        // (`menus.mystic.objects.molecule`) — the List keeps Info out of the rail.
        await check('selecting a Molecule exposes its rail, and Delete in its Mystic menu', async () => {
            const row = await moleculeRowIndex(page, fixture.ownerId);
            assert(row >= 0, 'molecule_row_missing');
            const molecule = await projectViewNode(page, project.id, `project_view_list_entry_${row}_name`);
            await clickCanvasTarget(page, molecule);
            await waitFor(page, async (pid) => {
                const { readActiveMoleculeTarget } = await import('/eVe/domains/rendering/project_view_molecule_workspace_state.js');
                const target = readActiveMoleculeTarget(pid);
                return { ok: target?.entity_type === 'molecule', target };
            }, project.id);
            for (const key of ['molecule_enter', 'ungroup']) {
                const tool = await awaitBevyUiNodeTarget(page, { nodeId: `atome_contextual_tool_${key}`, treeId: 'eve_bevy_panel_atome_contextual_edit' });
                assert(tool, `molecule_rail_${key}_missing:${JSON.stringify(await railNodeIds(page))}`);
            }
            const items = await openRowMystic(page);
            assert(items.includes('delete') && items.includes('info'), `molecule_mystic_items:${JSON.stringify(items)}`);
            await page.evaluate(async () => (await import('/eVe/intuition/mystic/index.js')).closeMysticMenu?.());
            await waitForStableScene(page, project.id);
            assert(await awaitBevyUiNodeTarget(page, { nodeId: `project_view_list_entry_${row}_name`, treeId: 'eve_bevy_ui_project_view' }),
                'molecule_row_not_actionable_after_mystic');
            return { row, items };
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
            // Info of a Molecule in the List is its Mystic item (see above).
            const items = await openRowMystic(page);
            assert(items.includes('info'), `molecule_info_not_actionable:${JSON.stringify(items)}`);
            const info = await mysticItemTarget(page, 'info');
            assert(info, 'molecule_info_item_not_actionable');
            await clickCanvasTarget(page, info);
            const opened = await waitFor(page, async ({ pid, ownerId }) => {
                const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
                const ids = records.map((record) => String(record.id || ''));
                const infoRecords = ids.filter((id) => id.includes('eve_bevy_panel_info'));
                const infoTree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                    .some((tree) => tree.id === 'eve_bevy_panel_info');
                const { infoRuntime } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js');
                const panelRuntime = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
                const properties = infoRuntime.surface.readState()?.primary?.properties || {};
                const primary = infoRuntime.surface.readState()?.primary || {};
                return {
                    // The Info panel of this Molecule (its tempo, quantization and
                    // metronome are the Timeline rail's own tools now).
                    ok: (infoRecords.some((id) => id.includes('eve_bevy_panel_info_panel')) || infoTree)
                        && (String(primary.id || primary.atome_id || '') === ownerId
                            || properties.molecule_timeline?.owner_atome_id === ownerId),
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
            }, { pid: project.id, ownerId: fixture.ownerId });
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
