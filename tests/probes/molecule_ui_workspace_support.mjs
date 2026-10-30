// Canonical browser workspace and Molecule fixtures, shared by acceptance and focused diagnostics.
import { createRichMoleculeFixture } from "../fixtures/molecule/canonical_v2_fixtures.mjs";
import { waitFor } from "./molecule_ui_acceptance_support.mjs";
export const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';

export const ensureProject = (page, projectName) => page.evaluate(async (name) => {
    const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    workspaceMode.beginDashboardWorkspaceTransition?.('project');
    const created = await window.AdoleAPI.projects.create(name);
    const directId = created?.id || created?.project_id || created?.atome_id
        || created?.fastify?.project?.id || created?.tauri?.project?.id || '';
    let projectId = String(directId || '');
    if (!projectId) {
        const listed = await window.AdoleAPI.projects.list();
        const projects = [
            ...(listed?.fastify?.projects || []),
            ...(listed?.tauri?.projects || []),
            ...(listed?.projects || [])
        ];
        const match = projects.find((project) => String(project?.name || project?.properties?.name || '') === name);
        projectId = String(match?.id || match?.atome_id || match?.project_id || '');
    }
    if (!projectId) return { ok: false, error: 'project_id_missing', created };
    const projectRuntime = await import('/eVe/intuition/matrix/core/project_data.js');
    const activation = await projectRuntime.activateProjectWorkspace({ id: projectId, name }, {
        force: true, staleFirst: false
    });
    workspaceMode.markProjectWorkspaceMode?.(projectId);
    return {
        ok: activation?.ok === true,
        id: projectId,
        name,
        loaded: activation?.loaded || null,
        activation
    };
}, projectName);

// Phone login of the current auth flow: a new number pays (simulated), then the
// SMS link (sent back in the WebSocket frame by the dev server's SMS mock) logs
// in; the beginner first launch is then marked complete.
export const enterProvisionedWorkspace = async (page) => {
    let developmentLink = '';
    page.on('websocket', (ws) => ws.on('framereceived', (frame) => {
        const match = String(frame.payload).match(/"developmentLink":"([^"]+)"/);
        if (match) developmentLink = match[1];
    }));
    await page.goto(APP_URL, { waitUntil: 'commit', timeout: 45000 });
    // The app has adopted its server (an isolated instance announces its own port).
    const appPort = Number(new URL(APP_URL).port) || 3001;
    await page.waitForFunction((port) => !!window.AdoleAPI?.auth?.startPhoneLogin && window.__authCheckComplete === true
        && (port === 3001 || Number(window.__SQUIRREL_SERVER_CONFIG__?.fastify?.port) === port), appPort, { timeout: 120000 });
    const current = await page.evaluate(async () => {
        const api = window.AdoleAPI;
        const session = await api.auth.current().catch(() => null);
        return session?.logged === true && api.security?.isAnonymous?.() === false;
    });
    let login = { ok: current, current };
    if (!current) {
        const started = await page.evaluate(async () => {
            const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`.replace(/\D+/g, '').slice(-10);
            // The socket may still be opening: a few tries before giving up.
            let result = null;
            for (let attempt = 0; attempt < 10; attempt += 1) {
                try { result = await window.AdoleAPI.auth.startPhoneLogin(`+1555${suffix}`); break; } catch (error) {
                    if (!/auth_server_unreachable/.test(String(error?.message || error)) || attempt === 9) throw error;
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                }
            }
            const paid = result?.paymentRequired === true ? await window.AdoleAPI.auth.payPhoneLogin({ method: 'paypal' }) : null;
            return { started: result, paid, session: Boolean(paid?.session) };
        });
        for (let attempt = 0; attempt < 60 && !started.session && !developmentLink; attempt += 1) await page.waitForTimeout(100);
        login = started.session ? { ok: true, started } : developmentLink
            ? await page.evaluate(async (link) => ({ ok: (await window.AdoleAPI.auth.completePhoneLogin(link))?.ok === true }), developmentLink)
            : { ok: false, started };
        if (login.ok) {
            await page.reload({ waitUntil: 'commit', timeout: 45000 });
            await page.waitForFunction(() => !!window.AdoleAPI && window.__authCheckComplete === true && typeof window.Atome?.commit === 'function', null, { timeout: 120000 });
            login.firstLaunch = await page.evaluate(async () => {
                const profiles = await import('/eVe/domains/user/profile_api.js');
                const session = await window.AdoleAPI.auth.current();
                const info = window.AdoleAPI.auth.getCurrentInfo?.() || {};
                const userId = String(session?.user?.id || session?.user?.user_id || session?.user_id || info.user_id || info.id || '');
                const profile = (await profiles.loadUserProfile(userId))?.profile || {};
                const preferences = profile.preferences || {};
                const saved = await profiles.upsertUserProfile({ ...profile, preferences: { ...preferences,
                    first_launch: { ...(preferences.first_launch || {}), version: 1, step: 'complete' } } }, { userId, allowCreate: false, eventSource: 'probe' });
                return saved?.ok === true;
            });
        }
    }
    if (!login?.ok) throw new Error(`provisioned_login_failed:${JSON.stringify(login).slice(0, 600)}`);
    await page.reload({ waitUntil: 'commit', timeout: 45000 });
    // The signed-in workspace opens on the Dashboard (or straight on a project).
    return waitFor(page, async () => {
        const current = await window.AdoleAPI?.auth?.current?.().catch(() => null);
        const mode = window.__eveWorkspaceMode?.mode || null;
        return {
            ok: current?.logged === true
                && window.AdoleAPI?.security?.isAnonymous?.() === false
                && (mode === 'dashboard' || mode === 'project'),
            anonymous: window.AdoleAPI?.security?.isAnonymous?.() ?? null,
            mode
        };
    }, null, 180000);
};

export const installCanonicalFixture = (page, projectId) => page.evaluate(async ({ pid, fixtureTimeline }) => {
    const timeline = fixtureTimeline;
    const sources = [
        ['audio', 'audio'], ['video', 'video'], ['image', 'image'], ['text', 'text'],
        ['drawing', 'shape'], ['page', 'group'], ['code', 'text']
    ];
    const sourceIds = new Map();
    for (let index = 0; index < sources.length; index += 1) {
        const [key, kind] = sources[index];
        const created = await window.eveToolBase.createAtome({
            kind, type: kind, name: `Fixture ${key}`, projectId: pid,
            text: kind === 'text' ? `Fixture ${key}` : undefined,
            left: `${40 + index * 12}px`, top: `${40 + index * 8}px`, width: '160px', height: '90px'
        }, { render: false });
        const id = String(created?.id || created?.atome_id || created?.ids?.[0] || '');
        if (!created?.ok || !id) throw new Error(`fixture_source_create_failed:${key}:${JSON.stringify(created)}`);
        sourceIds.set(`fixture_atome_${key}`, id);
    }
    const owner = await window.eveToolBase.createAtome({
        kind: 'group', type: 'group', name: 'Molécule 1', projectId: pid
    }, { render: false });
    const ownerId = String(owner?.id || owner?.atome_id || owner?.ids?.[0] || '');
    if (!owner?.ok || !ownerId) throw new Error('fixture_owner_create_failed');
    timeline.project_id = pid;
    timeline.owner_atome_id = ownerId;
    timeline.timeline_id = `tl_${ownerId}`;
    timeline.clips = timeline.clips.map((clip) => ({
        ...clip,
        source: clip.source?.type === 'atome'
            ? { ...clip.source, atome_id: sourceIds.get(clip.source.atome_id) || clip.source.atome_id }
            : clip.source
    }));
    const txId = `molecule_acceptance_fixture_${ownerId}_${Date.now()}`;
    const membershipEvents = [...sourceIds.values()].map((sourceId, hierarchyOrder) => ({
        kind: 'set',
        atome_id: sourceId,
        project_id: pid,
        parent_id: ownerId,
        tx_id: txId,
        props: { hierarchy_order: hierarchyOrder }
    }));
    const committed = await window.Atome.commitBatch([
        {
            kind: 'set',
            atome_id: ownerId,
            project_id: pid,
            tx_id: txId,
            props: { molecule_timeline: timeline }
        },
        ...membershipEvents
    ], { projectId: pid, tx_id: txId });
    if (!committed?.ok) throw new Error(`fixture_molecule_commit_failed:${JSON.stringify(committed)}`);
    await window.eveToolBase.loadProjectAtomes(pid, { staleFirst: false });
    const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    workspaceMode.markProjectWorkspaceMode?.(pid);
    return { ok: true, ownerId, timelineId: timeline.timeline_id, clipId: timeline.clips[0].clip_id };
}, { pid: projectId, fixtureTimeline: createRichMoleculeFixture() });

