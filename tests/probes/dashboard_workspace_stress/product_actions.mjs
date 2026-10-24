import { sceneSnapshot, sleep, waitFor } from './support.mjs';

export const ensureProject = async (page, name) => page.evaluate(async (projectName) => {
    const withTimeout = (promise, error, timeoutMs = 20000) => Promise.race([
        Promise.resolve(promise),
        new Promise((resolve) => setTimeout(() => resolve({ timeout: true, error }), timeoutMs))
    ]);
    const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    workspaceMode.beginDashboardWorkspaceTransition?.('project');
    const loadProjectWithTimeout = (projectId, options = {}, timeoutMs = 20000) => Promise.race([
        Promise.resolve(window.eveToolBase?.loadProjectAtomes?.(projectId, options)).then((result) => ({ ok: result?.ok !== false, result })),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true, error: 'load_project_atomes_timeout' }), timeoutMs))
    ]);
    const api = window.AdoleAPI;
    const created = await withTimeout(api.projects.create(projectName), 'project_create_timeout');
    if (created?.timeout) return { ok: false, error: created.error, name: projectName };
    let projectId = created?.id || created?.project_id || created?.atome_id
        || created?.fastify?.project?.id || created?.tauri?.project?.id || null;
    if (!projectId) {
        const listed = await withTimeout(api.projects.list(), 'project_list_timeout');
        if (listed?.timeout) return { ok: false, error: listed.error, created, name: projectName };
        const projects = [
            ...(Array.isArray(listed?.fastify?.projects) ? listed.fastify.projects : []),
            ...(Array.isArray(listed?.tauri?.projects) ? listed.tauri.projects : []),
            ...(Array.isArray(listed?.projects) ? listed.projects : [])
        ];
        const found = projects.find((project) => String(project?.name || project?.properties?.name || '') === projectName);
        projectId = found?.id || found?.atome_id || found?.project_id || null;
    }
    if (!projectId) return { ok: false, error: 'project_create_id_missing', created };
    const currentSet = await withTimeout(api.projects.setCurrent(projectId, projectName, null, true), 'project_set_current_timeout');
    if (currentSet?.timeout) return { ok: false, error: currentSet.error, id: String(projectId), name: projectName };
    window.eveToolBase?.ensureProjectLayer?.(projectId);
    const loaded = await loadProjectWithTimeout(projectId, { force: true, staleFirst: false });
    if (!loaded.ok) return { ok: false, error: 'project_initial_load_failed', loaded, id: String(projectId), name: projectName };
    workspaceMode.markProjectWorkspaceMode?.(String(projectId));
    return { ok: true, id: String(projectId), name: projectName };
}, name);

export const createBasicAtomes = async (page, projectId, prefix, index) => page.evaluate(async ({ projectId: pid, prefix: key, index: order }) => {
    const textId = `${key}_text_${order}`;
    const shapeId = `${key}_shape_${order}`;
    const batch = [
        {
            kind: 'set',
            atome_id: textId,
            project_id: pid,
            parent_id: pid,
            props: {
                kind: 'text',
                text: `Stress text ${order}`,
                content: `Stress text ${order}`,
                left: `${60 + order * 4}px`,
                top: `${80 + order * 3}px`,
                width: '150px',
                height: '70px',
                color: '#ffffff',
                backgroundColor: '#202733'
            }
        },
        {
            kind: 'set',
            atome_id: shapeId,
            project_id: pid,
            parent_id: pid,
            props: {
                kind: 'shape',
                left: `${250 + order * 4}px`,
                top: `${110 + order * 3}px`,
                width: '120px',
                height: '90px',
                color: '#d6b93f',
                backgroundColor: '#d6b93f',
                shape_variant: 'box'
            }
        }
    ];
    const result = await window.Atome.commitBatch(batch, { projectId: pid });
    return { ok: true, ids: [textId, shapeId], result };
}, { projectId, prefix, index });

export const importProjectMedia = async (page, projectId, index, mediaFixtures) => {
    await page.evaluate(() => {
        document.getElementById('dashboard_workspace_stress_files')?.remove?.();
        const input = document.createElement('input');
        input.id = 'dashboard_workspace_stress_files';
        input.type = 'file';
        input.multiple = true;
        input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(input);
    });
    await page.setInputFiles('#dashboard_workspace_stress_files', mediaFixtures);
    return page.evaluate(async ({ projectId: pid, index: order }) => {
        await import('/eVe/intuition/tools/project_drop.js');
        const projectEl = window.eveToolBase?.ensureProjectLayer?.(pid)
            || document.getElementById(`project_view_${pid}`)
            || document.querySelector('[id^="project_view_"]');
        const input = document.getElementById('dashboard_workspace_stress_files');
        const entries = Array.from(input?.files || []);
        if (!projectEl || entries.length === 0) return { ok: false, error: 'media_input_or_project_missing', entries: entries.length, hasProjectEl: !!projectEl };
        return window.eveProjectDropApi.importFilesToProjectViaCreator({
            entries,
            projectId: pid,
            projectEl,
            event: { clientX: 430 + order * 5, clientY: 160 + order * 5 },
            origin: 'dashboard_workspace_stress_probe',
            sourceLayer: 'dashboard_workspace_stress_probe',
            actorType: 'probe'
        });
    }, { projectId, index });
};

const readCanonicalIds = (page, projectId) => page.evaluate(async (pid) => {
    const { listStateCurrent } = await import('/eVe/core/atome_commit.js');
    const records = await listStateCurrent(pid, { limit: 3000 });
    return {
        ok: Array.isArray(records),
        ids: Array.isArray(records) ? records.map((record) => String(record.id || record.atome_id || '')) : [],
        count: Array.isArray(records) ? records.length : 0
    };
}, projectId);

const normalizeExpectedMediaKind = (kind = '') => {
    const value = String(kind || '').trim().toLowerCase();
    if (value === 'sound' || value === 'audio') return 'audio_waveform';
    return value;
};

const invalidExpectedMediaKinds = (project, snapshot) => {
    const expected = (project.mediaIds || [])
        .map((id, index) => [id, normalizeExpectedMediaKind(project.mediaKinds?.[index] || '')])
        .filter(([id, kind]) => !!id && !!kind);
    const kinds = new Map(snapshot.nodeKinds.map((entry) => [entry.id, entry.kind]));
    return expected
        .map(([id, kind]) => ({ id, expected: kind, actual: kinds.get(id) || null }))
        .filter((entry) => entry.actual !== entry.expected);
};

const waitForProjectedSceneReady = async (page, project, expectedIds) => {
    const startedAt = Date.now();
    let last = null;
    while (Date.now() - startedAt < 60000) {
        const snapshot = await sceneSnapshot(page, project.id);
        const missing = Array.from(expectedIds).filter((id) => !snapshot.recordIds.includes(id));
        const extra = snapshot.recordIds.filter((id) => (
            id
            && !expectedIds.has(id)
            && !id.startsWith('__eve_dashboard_')
            && !id.startsWith('__eve_bevy_ui_')
        ));
        const skipped = snapshot.bevySkipped.filter((entry) => expectedIds.has(entry.id));
        const invalidKinds = invalidExpectedMediaKinds(project, snapshot);
        last = { snapshot, missing, extra, skipped, invalidKinds };
        if (
            missing.length === 0
            && extra.length === 0
            && skipped.length === 0
            && invalidKinds.length === 0
            && snapshot.dashboardVisibleIds.length === 0
            && snapshot.canvasCount === 1
            && snapshot.atomeDomCount === 0
        ) {
            return snapshot;
        }
        await sleep(500);
    }
    if (last?.missing?.length) throw new Error(`project_scene_missing_ids:${project.id}:${last.missing.join(',')}`);
    if (last?.extra?.length) throw new Error(`project_scene_extra_ids:${project.id}:${last.extra.join(',')}`);
    if (last?.snapshot?.dashboardVisibleIds?.length) throw new Error(`dashboard_visible_in_closed_project:${project.id}:${last.snapshot.dashboardVisibleIds.join(',')}`);
    if (last?.snapshot?.canvasCount !== 1) throw new Error(`project_canvas_count_invalid:${last?.snapshot?.canvasCount}`);
    if (last?.snapshot?.atomeDomCount !== 0) throw new Error(`project_atome_dom_hosts_present:${last?.snapshot?.atomeDomCount}`);
    if (last?.skipped?.length) throw new Error(`media_nodes_skipped:${project.id}:${JSON.stringify(last.skipped)}`);
    if (last?.invalidKinds?.length) throw new Error(`project_media_kind_mismatch:${project.id}:${JSON.stringify(last.invalidKinds)}`);
    throw new Error(`project_scene_not_ready:${project.id}:${JSON.stringify(last)}`);
};

export const assertProjectLoaded = async (page, project) => {
    const expectedIds = new Set(project.expectedIds);
    const loaded = await waitFor(page, async ({ projectId, expected }) => {
        const loadedProject = await Promise.race([
            Promise.resolve(window.eveToolBase?.loadProjectAtomes?.(projectId, { force: true, staleFirst: false })).then((result) => ({ ok: result?.ok !== false, result })),
            new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true, error: 'load_project_atomes_timeout' }), 20000))
        ]);
        if (!loadedProject.ok) return { ok: false, error: loadedProject.error || 'project_load_failed', loadedProject };
        const scene = window.eveToolBase?.getProjectSceneState?.(projectId);
        const ids = new Set((scene?.records || []).map((record) => String(record.id || record.atome_id || '')));
        return { ok: expected.every((id) => ids.has(id)), ids: Array.from(ids) };
    }, 60000, 500, { projectId: project.id, expected: Array.from(expectedIds) });
    if (!loaded.ok) throw new Error(`project_records_missing:${project.id}:${JSON.stringify(loaded.last)}`);

    const canonical = await readCanonicalIds(page, project.id);
    const canonicalMissing = Array.from(expectedIds).filter((id) => !canonical.ids.includes(id));
    if (canonicalMissing.length) throw new Error(`project_canonical_missing_ids:${project.id}:${canonicalMissing.join(',')}`);

    const snapshot = await waitForProjectedSceneReady(page, project, expectedIds);
    return { ...snapshot, canonicalCount: canonical.count };
};
