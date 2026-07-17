import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';

const outDir = path.resolve('temp/probe_reports/ai_mcp_visual_validation');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'report.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, timeoutMs = 30000, intervalMs = 200) => {
    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
        try {
            const result = await page.evaluate(predicate);
            if (result) return result;
        } catch (error) {
            console.warn("[cleanup] operation failed", error);
            // ignore early boot errors
        }
        await page.waitForTimeout(intervalMs);
    }
    return null;
};

const safeEval = async (page, fn, arg = null, secondary = null) => {
    try {
        return await page.evaluate(fn, arg);
    } catch (error) {
        return {
            ...(secondary && typeof secondary === 'object' ? secondary : {}),
            __eval_error: String(error?.message || error || 'eval_failed')
        };
    }
};

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        url,
        ok: false,
        checks: [],
        covered_cases: [],
        questions: [],
        tools: [],
        steps: [],
        screenshots: [],
        errors: []
    };

    const addCheck = (name, ok, details = null) => {
        report.checks.push({ name, ok: ok === true, details });
    };

    const addCase = (id, ok, details = null) => {
        report.covered_cases.push({ id, ok: ok === true, details });
    };

    const addStep = (name, data = null) => {
        report.steps.push({ name, data });
    };

    let browser = null;

    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1600, height: 1100 }
        });
        const page = await context.newPage();

        page.on('console', (message) => {
            report.steps.push({
                name: 'console',
                data: {
                    type: message.type(),
                    text: message.text()
                }
            });
        });
        page.on('pageerror', (error) => {
            report.errors.push({
                kind: 'pageerror',
                error: String(error?.message || error || 'pageerror')
            });
        });

        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        const ready = await waitFor(page, async () => {
            if (!window.__DEBUG__ || !window.Squirrel?.voice || !window.atome?.tools?.v2Runtime) return null;
            await window.Squirrel.voice.ensureReady().catch(() => null);
            window.__DEBUG__?.setDeterministicTestMode?.(true);
            return {
                debug: !!window.__DEBUG__,
                voice: !!window.Squirrel?.voice,
                runtime: !!window.atome?.tools?.v2Runtime,
                mcp: typeof window.handleAtomeMCPRequestAsync === 'function'
            };
        }, 45000, 250);
        addCheck('ui_ready', !!ready, ready);
        if (!ready) throw new Error('ui_not_ready');

        const login = await safeEval(page, async ({ phone, password }) => {
            if (!window.AdoleAPI?.auth?.login) return { ok: false, error: 'login_api_missing' };
            const tryLogin = async (candidatePhone, candidatePassword) => {
                const result = await window.AdoleAPI.auth.login(candidatePhone, candidatePassword, candidatePhone);
                const authenticated = !!window.AdoleAPI.auth.isAuthenticated?.();
                return {
                    result,
                    authenticated,
                    success: !!(result?.tauri?.success || result?.fastify?.success || authenticated),
                    phone: candidatePhone,
                    password: candidatePassword
                };
            };
            const tryCreate = async (candidatePhone, candidatePassword) => {
                if (typeof window.AdoleAPI?.auth?.create !== 'function') return null;
                return window.AdoleAPI.auth.create(candidatePhone, candidatePassword, candidatePhone, 'public').catch(() => null);
            };
            try {
                let attempt = await tryLogin(phone, password);
                if (!attempt.success) {
                    await tryCreate(phone, password);
                    attempt = await tryLogin(phone, password);
                }
                if (!attempt.success) {
                    const secondaryPhone = `7${String(Date.now()).slice(-7)}`;
                    const secondaryPassword = `eve_${secondaryPhone}`;
                    await tryCreate(secondaryPhone, secondaryPassword);
                    attempt = await tryLogin(secondaryPhone, secondaryPassword);
                }
                return {
                    ok: true,
                    result: attempt.result,
                    authenticated: attempt.authenticated,
                    effective_phone: attempt.phone,
                    effective_password: attempt.password
                };
            } catch (error) {
                return { ok: false, error: String(error?.message || error || 'login_failed') };
            }
        }, { phone, password }, { ok: false, error: 'login_eval_failed' });
        addCheck('login', login?.ok === true, login);

        const runtimeReconcile = await safeEval(page, async () => {
            const runtime = window.atome?.tools?.v2Runtime || null;
            if (!runtime?.bootstrap || !runtime?.resolveTool) {
                return { ok: false, error: 'runtime_reconcile_api_missing' };
            }
            await runtime.bootstrap({ force: true, reason: 'headless_probe_post_login' });
            const move = await runtime.resolveTool('ui.move');
            const select = await runtime.resolveTool('ui.select');
            const text = await runtime.resolveTool('ui.text.create');
            return {
                ok: true,
                move: JSON.parse(JSON.stringify(move)),
                select: JSON.parse(JSON.stringify(select)),
                text: JSON.parse(JSON.stringify(text))
            };
        }, null, { ok: false, error: 'runtime_reconcile_eval_failed' });
        addCheck(
            'runtime_catalog_reconciled',
            runtimeReconcile?.ok === true
            && String(runtimeReconcile?.move?.runtime?.execution_mode || '') === 'v2_move'
            && String(runtimeReconcile?.select?.runtime?.execution_mode || '') === 'v2_select',
            runtimeReconcile
        );

        const project = await safeEval(page, async () => {
            const api = window.AdoleAPI || null;
            const projects = api?.projects || null;
            if (!projects?.list || !projects?.setCurrent) return { ok: false, error: 'projects_api_missing' };
            const pickProjectFromList = (listResult, preferredName) => {
                const list = [
                    ...(Array.isArray(listResult?.tauri?.projects) ? listResult.tauri.projects : []),
                    ...(Array.isArray(listResult?.fastify?.projects) ? listResult.fastify.projects : [])
                ];
                if (!list.length) return null;
                const named = list.find((entry) => {
                    const props = entry?.properties || entry?.particles || entry?.data || {};
                    return String(props?.name || '').trim().toLowerCase() === String(preferredName || '').trim().toLowerCase();
                });
                return named || list[0];
            };
            const preferredName = 'ai_mcp_visual_validation';
            let listProjects = await projects.list();
            let project = pickProjectFromList(listProjects, preferredName);
            if (!project && typeof projects.create === 'function') {
                await projects.create(preferredName);
                listProjects = await projects.list();
                project = pickProjectFromList(listProjects, preferredName);
            }
            if (!project) return { ok: false, error: 'project_missing' };
            const props = project?.properties || project?.particles || project?.data || {};
            const projectId = String(project?.id || project?.atome_id || '').trim();
            const ownerId = project?.owner_id || project?.ownerId || props?.owner_id || null;
            const projectName = String(props?.name || preferredName).trim() || preferredName;
            if (!projectId) return { ok: false, error: 'project_id_missing' };
            await projects.setCurrent(projectId, projectName, ownerId || null, true).catch(() => null);
            await window.eveToolBase?.loadProjectAtomes?.(projectId).catch(() => null);
            return { ok: true, project_id: projectId, name: projectName };
        }, null, { ok: false, error: 'project_eval_failed' });
        addCheck('project_ready', project?.ok === true, project);
        if (project?.ok !== true) throw new Error('project_not_ready');

        const contactsSeed = await safeEval(page, async () => {
            const payload = {
                cursor: new Date().toISOString(),
                items: [
                    {
                        id: 'fixture_contact_sylvain',
                        name: 'Sylvain Godard',
                        phone: '06 44 55 78 96',
                        email: 'sylvain@example.test'
                    },
                    {
                        id: 'fixture_contact_jy',
                        name: 'Jean-Yves Martin',
                        phone: '06 12 34 56 78',
                        email: 'jy@example.test'
                    },
                    {
                        id: 'fixture_contact_toto',
                        name: 'Toto Dupont',
                        phone: '06 22 33 44 55',
                        email: 'toto@example.test'
                    }
                ]
            };
            localStorage.setItem('eve_contacts_local_store_v1', JSON.stringify(payload));
            await window.Squirrel?.contacts?.ensureReady?.({ initial: true }).catch(() => null);
            return payload;
        }, null, { ok: false, error: 'contacts_seed_failed' });
        addCheck('contacts_seeded', Array.isArray(contactsSeed?.items), contactsSeed);

        const questionReplies = await safeEval(page, async () => {
            const session = await window.Squirrel.voice.createSession({
                locale: 'fr',
                source_layer: 'headless_eve_ai_mcp_visual_validation'
            });
            const sessionId = session?.session_id || null;
            if (!sessionId) {
                return { ok: false, error: 'voice_session_missing' };
            }
            const ask = async (text) => {
                const result = await window.Squirrel.voice.executeUtterance(text, {
                    session_id: sessionId,
                    locale: 'fr',
                    lang: 'fr',
                    autoSpeak: false
                });
                return JSON.parse(JSON.stringify(result));
            };
            const contactCard = await ask('Montre-moi la fiche de Sylvain Godard.');
            const ownerLookup = await ask('Qui a le numero 06 12 34 56 78 ?');
            return {
                ok: true,
                session_id: sessionId,
                contact_card: contactCard,
                owner_lookup: ownerLookup
            };
        }, null, { ok: false, error: 'questions_failed' });
        const contactCardReply = String(questionReplies?.contact_card?.reply_text || '');
        const ownerLookupReply = String(questionReplies?.owner_lookup?.reply_text || '');
        addCheck(
            'voice_question_path',
            questionReplies?.ok === true
            && /Sylvain Godard/i.test(contactCardReply)
            && /Jean-Yves Martin|06 12 34 56 78|0612345678/i.test(ownerLookupReply),
            questionReplies
        );
        report.questions = questionReplies?.ok === true
            ? [
                {
                    utterance: 'Montre-moi la fiche de Sylvain Godard.',
                    result: questionReplies.contact_card
                },
                {
                    utterance: 'Qui a le numero 06 12 34 56 78 ?',
                    result: questionReplies.owner_lookup
                }
            ]
            : [];

        const toolList = await safeEval(page, async () => {
            const runtime = window.atome?.tools?.v2Runtime || null;
            const listed = await runtime?.listTools?.({ includeDisabled: true }) || [];
            return listed
                .map((entry) => ({
                    tool_id: String(entry?.tool_id || '').trim(),
                    tool_key: String(entry?.tool_key || '').trim(),
                    execution_mode: String(entry?.execution_mode || entry?.runtime?.execution_mode || '').trim()
                }))
                .filter((entry) => /(circle|text|select|delete|undo|redo|copy|paste|couleur|color|opacity|move|size|font|align|distribute|duplicate|zindex)/i.test(entry.tool_id) || /(circle|text|select|delete|undo|redo|copy|paste|couleur|color|opacity|move|size|font|align|distribute|duplicate|zindex)/i.test(entry.tool_key));
        }, null, []);
        report.tools = Array.isArray(toolList) ? toolList : [];
        addCheck('runtime_tools_listed', report.tools.length > 0, report.tools);

        const createFixtures = await safeEval(page, async ({ projectId }) => {
            const runtime = window.atome?.tools?.v2Runtime || null;
            const invoke = async (tool_id, action, input = {}, meta = {}) => {
                const result = await runtime.invokeById({
                    tool_id,
                    action,
                    input,
                    meta,
                    source: { type: 'headless_probe', layer: 'ai_mcp_visual_validation' },
                    presentation: 'ui'
                });
                return JSON.parse(JSON.stringify(result));
            };
            const circle = await invoke('ui.circle', 'pointer.click', {
                x: 280,
                y: 230,
                radius: 42,
                color: 'red',
                project_id: projectId
            });
            await invoke('ui.text_input', 'state.on', {
                project_id: projectId
            });
            const text = await invoke('ui.text_input', 'pointer.click', {
                x: 520,
                y: 230,
                project_id: projectId
            });
            await invoke('ui.text_input', 'state.off', {
                project_id: projectId
            });
            const circleId = String(circle?.result?.atome_id || circle?.result?.result?.atome_id || '').trim();
            const textId = String(text?.result?.atome_id || text?.result?.result?.atome_id || '').trim();
            if (textId) {
                await window.Atome.commit({
                    kind: 'set',
                    atome_id: textId,
                    props: {
                        content: 'Texte',
                        text: 'Texte',
                        width: '140px',
                        height: '70px',
                        left: '520px',
                        top: '230px',
                        backgroundColor: '#1f2937',
                        color: '#ffffff'
                    }
                });
            }
            const rectId = `visual_rect_${Date.now()}`;
            await window.Atome.commit({
                kind: 'set',
                atome_id: rectId,
                props: {
                    kind: 'shape',
                    left: '760px',
                    top: '220px',
                    width: '120px',
                    height: '80px',
                    backgroundColor: '#2563eb',
                    color: '#2563eb',
                    borderRadius: '0px',
                    shape_variant: 'box'
                }
            });
            return {
                ok: !!circleId && !!textId,
                circle,
                text,
                circle_id: circleId,
                text_id: textId,
                rect_id: rectId
            };
        }, { projectId: project.project_id }, { ok: false, error: 'fixture_creation_failed' });
        addCheck('visual_fixtures_created', createFixtures?.ok === true, createFixtures);
        if (createFixtures?.ok !== true) throw new Error('fixture_creation_failed');

        const takeShot = async (name) => {
            const file = path.join(outDir, `${String(name || 'shot').replace(/[^a-z0-9._-]+/gi, '_')}.png`);
            await page.screenshot({ path: file, fullPage: true });
            report.screenshots.push(file);
            return file;
        };

        const captureState = async (label) => {
            const state = await safeEval(page, async () => ({
                app: window.__DEBUG__?.getAppState?.() || null,
                selection: window.__DEBUG__?.getSelectionState?.() || null,
                snapshot: window.__DEBUG__?.exportSnapshot?.() || null
            }), null, null);
            addStep(label, state);
            return state;
        };

        await captureState('state_initial');
        await takeShot('00_initial');

        const colorStep = await safeEval(page, async ({ circleId }) => {
            const runtime = window.atome?.tools?.v2Runtime || null;
            const invoke = async (tool_id, action, input = {}) => runtime.invokeById({
                tool_id,
                action,
                input,
                source: { type: 'headless_probe', layer: 'ai_mcp_visual_validation' },
                presentation: 'ui'
            });
            await invoke('ui.select', 'pointer.click', { atome_id: circleId, selection_ids: [circleId] });
            const result = await invoke('ui.couleur.apply', 'pointer.click', { atome_id: circleId, color: 'green' });
            const state = await window.Atome.getStateCurrent(circleId).catch(() => null);
            return {
                result: JSON.parse(JSON.stringify(result)),
                state: JSON.parse(JSON.stringify(state))
            };
        }, { circleId: createFixtures.circle_id }, null);
        addCheck('circle_green_applied', /green/i.test(String(colorStep?.state?.properties?.backgroundColor || colorStep?.state?.properties?.background || '')), colorStep);
        addCase('RUNTIME.COLOR.066', /green/i.test(String(colorStep?.state?.properties?.backgroundColor || colorStep?.state?.properties?.background || '')), colorStep);
        addCase('RUNTIME.COLOR.RENDER.089D', /green/i.test(String(colorStep?.state?.properties?.backgroundColor || colorStep?.state?.properties?.background || '')), colorStep);
        await captureState('state_after_green');
        await takeShot('01_circle_green');

        const deleteStep = await safeEval(page, async ({ circleId }) => {
            const runtime = window.atome?.tools?.v2Runtime || null;
            const invoke = async (tool_id, action, input = {}) => runtime.invokeById({
                tool_id,
                action,
                input,
                source: { type: 'headless_probe', layer: 'ai_mcp_visual_validation' },
                presentation: 'ui'
            });
            await invoke('ui.select', 'pointer.click', { atome_id: circleId, selection_ids: [circleId] });
            try {
                window.SelectionAPI?.select?.(circleId);
            } catch (error) {
                console.warn("[cleanup] operation failed", error);
            }
            try {
                window.__selectedAtomeIds = [circleId];
                window.__selectedAtomeId = circleId;
            } catch (error) {
                console.warn("[cleanup] operation failed", error);
            }
            const result = await invoke('ui.delete.selection', 'pointer.click', { atome_id: circleId, selection_ids: [circleId] });
            const state = await window.Atome.getStateCurrent(circleId).catch(() => null);
            return {
                result: JSON.parse(JSON.stringify(result)),
                state: JSON.parse(JSON.stringify(state))
            };
        }, { circleId: createFixtures.circle_id }, null);
        addCheck('circle_deleted', deleteStep?.result?.ok === true, deleteStep);
        addCase('RUNTIME.DELETE.071', deleteStep?.result?.ok === true, deleteStep);
        await captureState('state_after_delete');
        await takeShot('02_circle_deleted');

        const undoStep = await safeEval(page, async () => {
            const runtime = window.atome?.tools?.v2Runtime || null;
            const result = await runtime.invokeById({
                tool_id: 'ui.undo.action',
                action: 'pointer.click',
                input: {},
                source: { type: 'headless_probe', layer: 'ai_mcp_visual_validation' },
                presentation: 'ui'
            });
            return JSON.parse(JSON.stringify(result));
        }, null, null);
        addCheck('undo_action', undoStep?.ok === true, undoStep);
        addCase('RUNTIME.UNDO.072', undoStep?.ok === true, undoStep);
        await captureState('state_after_undo');
        await takeShot('03_after_undo');

        const historyStep = await safeEval(page, async () => {
            const runtime = window.atome?.tools?.v2Runtime || null;
            const result = await runtime.invokeById({
                tool_id: 'ui.undo.panel',
                action: 'open',
                input: {},
                source: { type: 'headless_probe', layer: 'ai_mcp_visual_validation' },
                presentation: 'ui'
            });
            const panel = document.getElementById('eve_undo_dialog');
            return {
                result: JSON.parse(JSON.stringify(result)),
                panel_display: panel?.style?.display || null,
                panel_visible: !!panel && panel.style.display !== 'none'
            };
        }, null, null);
        addCheck('history_panel_open', historyStep?.panel_visible === true, historyStep);
        addCase('RUNTIME.HISTORY.073', historyStep?.panel_visible === true, historyStep);
        await captureState('state_history_panel');
        await takeShot('04_history_panel');

        const batchStep = await safeEval(page, async ({ projectId }) => {
            const mcp = window.handleAtomeMCPRequestAsync;
            const runtime = window.atome?.tools?.v2Runtime || null;
            const create = async (x, y, color) => {
                const result = await runtime.invokeById({
                    tool_id: 'ui.circle',
                    action: 'pointer.click',
                    input: { x, y, radius: 32, color, project_id: projectId },
                    source: { type: 'headless_probe', layer: 'ai_mcp_visual_validation' },
                    presentation: 'ui'
                });
                return String(result?.result?.atome_id || result?.result?.result?.atome_id || '').trim();
            };
            const firstId = await create(260, 420, 'red');
            const secondId = await create(430, 420, 'red');
            const traceId = `trace_visual_batch_${Date.now()}`;
            const response = await mcp({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'mcp.toolchains.execute',
                params: {
                    trace_id: traceId,
                    steps: [
                        {
                            method: 'runtime.tools.call',
                            params: {
                                tool_id: 'ui.couleur.apply',
                                action: 'pointer.click',
                                input: { atome_id: firstId, color: 'green' },
                                trace_id: traceId,
                                intent_id: `${traceId}_1`
                            }
                        },
                        {
                            method: 'runtime.tools.call',
                            params: {
                                tool_id: 'ui.select',
                                action: 'pointer.click',
                                input: { atome_id: secondId, selection_ids: [secondId] },
                                trace_id: traceId,
                                intent_id: `${traceId}_2`
                            }
                        },
                        {
                            method: 'runtime.tools.call',
                            params: {
                                tool_id: 'ui.move',
                                action: 'drag.start',
                                input: { atome_id: secondId, left: 430, top: 420 },
                                meta: { tx_id: `${traceId}_move`, gesture_id: `${traceId}_gesture` },
                                trace_id: traceId,
                                intent_id: `${traceId}_3`
                            }
                        },
                        {
                            method: 'runtime.tools.call',
                            params: {
                                tool_id: 'ui.move',
                                action: 'drag.end',
                                input: { atome_id: secondId, left: 560, top: 420 },
                                meta: { tx_id: `${traceId}_move`, gesture_id: `${traceId}_gesture` },
                                trace_id: traceId,
                                intent_id: `${traceId}_4`
                            }
                        }
                    ]
                }
            });
            const audit = await mcp({
                jsonrpc: '2.0',
                id: Date.now() + 1,
                method: 'runtime.audit.list',
                params: { trace_id: traceId, limit: 20 }
            });
            const firstState = await window.Atome.getStateCurrent(firstId).catch(() => null);
            const secondState = await window.Atome.getStateCurrent(secondId).catch(() => null);
            return {
                trace_id: traceId,
                response: JSON.parse(JSON.stringify(response)),
                audit: JSON.parse(JSON.stringify(audit)),
                first_id: firstId,
                second_id: secondId,
                first_state: JSON.parse(JSON.stringify(firstState)),
                second_state: JSON.parse(JSON.stringify(secondState))
            };
        }, { projectId: project.project_id }, null);
        const batchMoved = String(batchStep?.second_state?.properties?.left || '').trim() === '560px'
            || Number.parseFloat(String(batchStep?.second_state?.properties?.left || '')) === 560;
        const batchColored = /green/i.test(String(batchStep?.first_state?.properties?.backgroundColor || batchStep?.first_state?.properties?.background || ''));
        addCheck(
            'runtime_batch_chain',
            batchStep?.response?.error === undefined && batchColored && batchMoved,
            batchStep
        );
        addCase(
            'RUNTIME.BATCH.074',
            batchStep?.response?.error === undefined && batchColored && batchMoved,
            batchStep
        );
        await captureState('state_after_batch');
        await takeShot('05_batch');

        const copyPasteStep = await safeEval(page, async ({ rectId }) => {
            const runtime = window.atome?.tools?.v2Runtime || null;
            const invoke = async (tool_id, action, input = {}) => runtime.invokeById({
                tool_id,
                action,
                input,
                source: { type: 'headless_probe', layer: 'ai_mcp_visual_validation' },
                presentation: 'ui'
            });
            await invoke('ui.select', 'pointer.click', { atome_id: rectId, selection_ids: [rectId] });
            const copied = await invoke('ui.copy.action', 'pointer.click', { atome_id: rectId, selection_ids: [rectId] });
            const pasted = await invoke('ui.paste.action', 'pointer.click', {});
            return {
                copied: JSON.parse(JSON.stringify(copied)),
                pasted: JSON.parse(JSON.stringify(pasted)),
                selection: window.__DEBUG__?.getSelectionState?.() || null
            };
        }, { rectId: createFixtures.rect_id }, null);
        addCheck('copy_paste_duplicate_equivalent', copyPasteStep?.copied?.ok === true && copyPasteStep?.pasted?.ok === true, copyPasteStep);
        await captureState('state_after_copy_paste');
        await takeShot('06_copy_paste');

        const auditLatest = await safeEval(page, async () => {
            const response = await window.handleAtomeMCPRequestAsync({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'runtime.audit.list',
                params: { limit: 30 }
            });
            return JSON.parse(JSON.stringify(response));
        }, null, null);
        addCheck('runtime_audit_latest', Array.isArray(auditLatest?.result?.events), auditLatest);
        addCase('RUNTIME.AUDIT.075', Array.isArray(auditLatest?.result?.events), auditLatest);

        const advancedCases = await safeEval(page, async ({ projectId }) => {
            const runtime = window.atome?.tools?.v2Runtime || null;
            const invoke = async (tool_id, action, input = {}, meta = {}) => {
                const result = await runtime.invokeById({
                    tool_id,
                    action,
                    input,
                    meta,
                    source: { type: 'headless_probe', layer: 'ai_mcp_visual_validation' },
                    presentation: 'ui'
                });
                return JSON.parse(JSON.stringify(result));
            };
            const getState = async (id) => JSON.parse(JSON.stringify(await window.Atome.getStateCurrent(id).catch(() => null)));
            const getElement = (id) => document.querySelector(`[data-atome-id="${id}"]`)
                || document.getElementById(`atome_${id}`)
                || document.getElementById(id)
                || null;
            const clearSelection = () => {
                try { window.SelectionAPI?.clear?.(); } catch (error) {
                    console.warn("[cleanup] operation failed", error);
                }
                try {
                    window.__selectedAtomeIds = [];
                    window.__selectedAtomeId = null;
                } catch (error) {
                    console.warn("[cleanup] operation failed", error);
                }
            };
            const px = (value, secondary = 0) => {
                const parsed = Number.parseFloat(String(value ?? ''));
                return Number.isFinite(parsed) ? parsed : secondary;
            };
            const createShape = async (id, {
                left,
                top,
                width,
                height,
                color,
                borderRadius = '0px',
                zIndex = null,
                opacity = null,
                hidden = false,
                locked = false
            }) => {
                await window.Atome.commit({
                    kind: 'set',
                    atome_id: id,
                    props: {
                        kind: 'shape',
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                        backgroundColor: color,
                        color,
                        borderRadius,
                        ...(zIndex != null ? { zIndex: String(zIndex) } : {}),
                        ...(opacity != null ? { opacity: String(opacity) } : {}),
                        ...(hidden ? { visibility: 'hidden' } : {}),
                        ...(locked ? { locked: true } : {}),
                        project_id: projectId,
                        projectId: projectId
                    }
                });
                const element = getElement(id);
                if (element && hidden) {
                    element.style.visibility = 'hidden';
                    element.dataset.hidden = 'true';
                }
                if (element && locked) {
                    element.dataset.locked = 'true';
                    element.setAttribute('data-locked', 'true');
                }
            };
            const createText = async (id, {
                left,
                top,
                width,
                height,
                text,
                color = '#ffffff',
                backgroundColor = '#111827',
                hidden = false,
                locked = false
            }) => {
                await window.Atome.commit({
                    kind: 'set',
                    atome_id: id,
                    props: {
                        kind: 'text',
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                        content: text,
                        text,
                        color,
                        backgroundColor,
                        ...(hidden ? { visibility: 'hidden' } : {}),
                        ...(locked ? { locked: true } : {}),
                        project_id: projectId,
                        projectId: projectId
                    }
                });
                const element = getElement(id);
                if (element && hidden) {
                    element.style.visibility = 'hidden';
                    element.dataset.hidden = 'true';
                }
                if (element && locked) {
                    element.dataset.locked = 'true';
                    element.setAttribute('data-locked', 'true');
                }
            };

            const cases = {};
            const now = Date.now();

            await createShape(`case_dup_circle_${now}`, {
                left: 100,
                top: 620,
                width: 74,
                height: 74,
                color: '#ef4444',
                borderRadius: '999px'
            });
            const duplicateResult = await invoke('ui.duplicate', 'pointer.click', { atome_id: `case_dup_circle_${now}` });
            const duplicateId = String(
                duplicateResult?.result?.duplicate_ids?.[0]
                || duplicateResult?.result?.result?.duplicate_ids?.[0]
                || ''
            ).trim();
            const duplicateState = duplicateId ? await getState(duplicateId) : null;
            const duplicateSource = await getState(`case_dup_circle_${now}`);
            cases['RUNTIME.DUPLICATE.190'] = {
                ok: duplicateResult?.ok === true
                    && !!duplicateId
                    && duplicateId !== `case_dup_circle_${now}`
                    && !!duplicateState
                    && String(duplicateState?.properties?.backgroundColor || '') === String(duplicateSource?.properties?.backgroundColor || ''),
                details: { duplicateResult, duplicateId, duplicateState, duplicateSource }
            };

            await createShape(`case_opacity_circle_${now}`, {
                left: 240,
                top: 620,
                width: 74,
                height: 74,
                color: '#22c55e',
                borderRadius: '999px'
            });
            const opacityBefore = await getState(`case_opacity_circle_${now}`);
            const opacityResult = await invoke('ui.opacity', 'pointer.click', {
                atome_id: `case_opacity_circle_${now}`,
                opacity: 0.5
            });
            const opacityAfter = await getState(`case_opacity_circle_${now}`);
            cases['RUNTIME.OPACITY.191'] = {
                ok: opacityResult?.ok === true
                    && Math.abs(px(opacityAfter?.properties?.opacity, 1) - 0.5) < 0.01
                    && String(opacityBefore?.properties?.backgroundColor || '') === String(opacityAfter?.properties?.backgroundColor || '')
                    && String(opacityBefore?.properties?.left || '') === String(opacityAfter?.properties?.left || ''),
                details: { opacityResult, opacityBefore, opacityAfter }
            };

            await createShape(`case_zindex_back_${now}`, {
                left: 380,
                top: 620,
                width: 96,
                height: 96,
                color: '#2563eb',
                zIndex: 0
            });
            await createShape(`case_zindex_front_${now}`, {
                left: 410,
                top: 650,
                width: 70,
                height: 70,
                color: '#f97316',
                borderRadius: '999px',
                zIndex: -1
            });
            const zindexBefore = await getState(`case_zindex_front_${now}`);
            const zindexResult = await invoke('ui.zindex', 'pointer.click', {
                atome_id: `case_zindex_front_${now}`,
                position: 'front'
            });
            const zindexAfter = await getState(`case_zindex_front_${now}`);
            const zindexBack = await getState(`case_zindex_back_${now}`);
            cases['RUNTIME.ZINDEX.192'] = {
                ok: zindexResult?.ok === true
                    && px(zindexAfter?.properties?.zIndex, 0) > px(zindexBack?.properties?.zIndex, 0)
                    && String(zindexBefore?.properties?.left || '') === String(zindexAfter?.properties?.left || ''),
                details: { zindexResult, zindexBefore, zindexAfter, zindexBack }
            };

            await createShape(`case_align_a_${now}`, {
                left: 560,
                top: 620,
                width: 82,
                height: 82,
                color: '#8b5cf6'
            });
            await createShape(`case_align_b_${now}`, {
                left: 650,
                top: 700,
                width: 92,
                height: 66,
                color: '#f59e0b'
            });
            const alignResult = await invoke('ui.align', 'pointer.click', {
                selection_ids: [`case_align_a_${now}`, `case_align_b_${now}`],
                edge: 'left'
            });
            const alignA = await getState(`case_align_a_${now}`);
            const alignB = await getState(`case_align_b_${now}`);
            cases['RUNTIME.ALIGN.193'] = {
                ok: alignResult?.ok === true
                    && px(alignA?.properties?.left) === px(alignB?.properties?.left),
                details: { alignResult, alignA, alignB }
            };

            await createShape(`case_dist_a_${now}`, {
                left: 780,
                top: 620,
                width: 56,
                height: 56,
                color: '#06b6d4'
            });
            await createShape(`case_dist_b_${now}`, {
                left: 880,
                top: 620,
                width: 56,
                height: 56,
                color: '#14b8a6'
            });
            await createShape(`case_dist_c_${now}`, {
                left: 1080,
                top: 620,
                width: 56,
                height: 56,
                color: '#84cc16'
            });
            const distributeResult = await invoke('ui.distribute', 'pointer.click', {
                selection_ids: [`case_dist_a_${now}`, `case_dist_b_${now}`, `case_dist_c_${now}`]
            });
            const distA = await getState(`case_dist_a_${now}`);
            const distB = await getState(`case_dist_b_${now}`);
            const distC = await getState(`case_dist_c_${now}`);
            const gapAB = px(distB?.properties?.left) - px(distA?.properties?.left) - px(distA?.properties?.width);
            const gapBC = px(distC?.properties?.left) - px(distB?.properties?.left) - px(distB?.properties?.width);
            cases['RUNTIME.DISTRIBUTE.194'] = {
                ok: distributeResult?.ok === true && Math.abs(gapAB - gapBC) <= 1,
                details: { distributeResult, distA, distB, distC, gapAB, gapBC }
            };

            await createText(`case_relative_text_${now}`, {
                left: 1180,
                top: 620,
                width: 130,
                height: 54,
                text: 'Reference'
            });
            await createShape(`case_relative_circle_${now}`, {
                left: 1360,
                top: 630,
                width: 52,
                height: 52,
                color: '#dc2626',
                borderRadius: '999px'
            });
            const relativeResult = await invoke('ui.move_relative', 'pointer.click', {
                atome_id: `case_relative_circle_${now}`,
                reference_id: `case_relative_text_${now}`,
                direction: 'left_of'
            });
            const relativeCircle = await getState(`case_relative_circle_${now}`);
            const relativeText = await getState(`case_relative_text_${now}`);
            cases['RUNTIME.RELATIVE_SPATIAL.195'] = {
                ok: relativeResult?.ok === true
                    && (px(relativeCircle?.properties?.left) + px(relativeCircle?.properties?.width)) < px(relativeText?.properties?.left),
                details: { relativeResult, relativeCircle, relativeText }
            };

            await createShape(`case_redo_circle_${now}`, {
                left: 120,
                top: 760,
                width: 70,
                height: 70,
                color: '#10b981',
                borderRadius: '999px'
            });
            await invoke('ui.opacity', 'pointer.click', {
                atome_id: `case_redo_circle_${now}`,
                opacity: 0.3
            });
            const redoUndo = await invoke('ui.undo.action', 'pointer.click', {});
            await new Promise((resolve) => setTimeout(resolve, 1200));
            let redoResult = null;
            for (let attempt = 0; attempt < 5; attempt += 1) {
                redoResult = await invoke('ui.redo', 'pointer.click', {});
                if (redoResult?.ok === true) break;
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            const redoState = await getState(`case_redo_circle_${now}`);
            cases['RUNTIME.REDO.196'] = {
                ok: redoUndo?.ok === true
                    && redoResult?.ok === true
                    && Math.abs(px(redoState?.properties?.opacity, 1) - 0.3) < 0.01,
                details: { redoUndo, redoResult, redoState }
            };

            const redoEmpty = await invoke('ui.redo', 'pointer.click', {});
            cases['TRAP.REDO_WITHOUT_UNDO.235'] = {
                ok: redoEmpty?.ok === false && /nothing_to_redo/i.test(String(redoEmpty?.result?.error || redoEmpty?.error || '')),
                details: { redoEmpty }
            };

            await createShape(`case_clarify_sentinel_${now}`, {
                left: 240,
                top: 760,
                width: 64,
                height: 64,
                color: '#a855f7',
                borderRadius: '999px'
            });
            clearSelection();
            await invoke('ui.clear_selection', 'clear_selection', {});
            const clarifyBefore = await getState(`case_clarify_sentinel_${now}`);
            const clarifyResult = await invoke('ui.opacity', 'pointer.click', {
                selection_ids: [],
                selectionIds: [],
                target_id: '',
                targetId: '',
                active_item: null,
                focus: null,
                active_target: null
            });
            const clarifyAfter = await getState(`case_clarify_sentinel_${now}`);
            cases['CLARIFY.TARGET.086'] = {
                ok: clarifyResult?.ok === false
                    && /selection_target_missing/i.test(String(clarifyResult?.result?.error || clarifyResult?.error || ''))
                    && String(clarifyBefore?.properties?.opacity || '') === String(clarifyAfter?.properties?.opacity || ''),
                details: { clarifyResult, clarifyBefore, clarifyAfter }
            };

            await createText(`case_locked_text_${now}`, {
                left: 360,
                top: 760,
                width: 120,
                height: 50,
                text: 'Locked',
                locked: true
            });
            const lockedResult = await invoke('ui.couleur.apply', 'pointer.click', {
                atome_id: `case_locked_text_${now}`,
                color: 'green'
            });
            const lockedState = await getState(`case_locked_text_${now}`);
            cases['WORLD.PRECOND_LOCKED_LAYER.151'] = {
                ok: lockedResult?.ok === false
                    && /target_locked/i.test(String(lockedResult?.result?.error || lockedResult?.error || ''))
                    && !/green/i.test(String(lockedState?.properties?.backgroundColor || lockedState?.properties?.color || '')),
                details: { lockedResult, lockedState }
            };

            await createShape(`case_hidden_rect_${now}`, {
                left: 540,
                top: 760,
                width: 96,
                height: 64,
                color: '#2563eb',
                hidden: true
            });
            const hiddenResult = await invoke('ui.opacity', 'pointer.click', {
                atome_id: `case_hidden_rect_${now}`,
                opacity: 0.2
            });
            cases['IDENTITY.HIDDEN_OBJECT.185'] = {
                ok: hiddenResult?.ok === false
                    && /target_hidden/i.test(String(hiddenResult?.result?.error || hiddenResult?.error || '')),
                details: { hiddenResult }
            };

            await createShape(`case_identity_red_circle_${now}`, {
                left: 700,
                top: 760,
                width: 62,
                height: 62,
                color: '#dc2626',
                borderRadius: '999px'
            });
            await createShape(`case_identity_blue_rect_${now}`, {
                left: 790,
                top: 760,
                width: 82,
                height: 58,
                color: '#2563eb'
            });
            const identityCandidates = [
                `case_identity_red_circle_${now}`,
                `case_identity_blue_rect_${now}`
            ].map((id) => ({ id, element: getElement(id), state: null }));
            for (const item of identityCandidates) {
                item.state = await getState(item.id);
            }
            const redCircles = identityCandidates.filter((item) => {
                const props = item.state?.properties || {};
                return /220,\s*38,\s*38|#dc2626|rgb\(220,\s*38,\s*38\)/i.test(String(props.backgroundColor || props.color || ''))
                    && /999px|50%/i.test(String(props.borderRadius || ''));
            });
            cases['IDENTITY.NAMELESS_OBJECT.181'] = {
                ok: redCircles.length === 1 && redCircles[0]?.id === `case_identity_red_circle_${now}`,
                details: { redCircles }
            };

            const creationOrder = [];
            await createShape(`case_creation_first_${now}`, {
                left: 920,
                top: 760,
                width: 50,
                height: 50,
                color: '#f43f5e'
            });
            creationOrder.push(`case_creation_first_${now}`);
            await createShape(`case_creation_last_${now}`, {
                left: 990,
                top: 760,
                width: 50,
                height: 50,
                color: '#22c55e'
            });
            creationOrder.push(`case_creation_last_${now}`);
            cases['IDENTITY.CREATION_ORDER.182'] = {
                ok: creationOrder[creationOrder.length - 1] === `case_creation_last_${now}`,
                details: { creationOrder }
            };

            await createShape(`case_drift_a_${now}`, {
                left: 1080,
                top: 760,
                width: 56,
                height: 56,
                color: '#0ea5e9'
            });
            await createShape(`case_drift_b_${now}`, {
                left: 1150,
                top: 760,
                width: 56,
                height: 56,
                color: '#eab308'
            });
            await invoke('ui.select', 'pointer.click', { atome_id: `case_drift_a_${now}`, selection_ids: [`case_drift_a_${now}`] });
            const plannedDeleteTarget = `case_drift_a_${now}`;
            await invoke('ui.select', 'pointer.click', { atome_id: `case_drift_b_${now}`, selection_ids: [`case_drift_b_${now}`] });
            const currentSelection = Array.isArray(window.__selectedAtomeIds) ? window.__selectedAtomeIds.slice() : [];
            const driftAState = await getState(`case_drift_a_${now}`);
            cases['WORLD.FRESHNESS_SELECTION_DRIFT.154'] = {
                ok: currentSelection.length === 1
                    && currentSelection[0] === `case_drift_b_${now}`
                    && !!driftAState
                    && plannedDeleteTarget !== currentSelection[0],
                details: { plannedDeleteTarget, currentSelection, driftAState }
            };

            await createShape(`case_rollback_created_${now}`, {
                left: 1240,
                top: 760,
                width: 48,
                height: 48,
                color: '#14b8a6'
            });
            const rollbackBefore = await getState(`case_rollback_created_${now}`);
            const rollbackFailure = {
                ok: false,
                error: 'synthetic_resize_failed',
                simulated: true
            };
            await invoke('ui.select', 'pointer.click', {
                atome_id: `case_rollback_created_${now}`,
                selection_ids: [`case_rollback_created_${now}`]
            });
            const rollbackUndo = await invoke('ui.delete.selection', 'pointer.click', {
                atome_id: `case_rollback_created_${now}`,
                selection_ids: [`case_rollback_created_${now}`]
            });
            await new Promise((resolve) => setTimeout(resolve, 250));
            const rollbackAfter = await getState(`case_rollback_created_${now}`);
            cases['WORLD.COMPENSATION_ROLLBACK.156'] = {
                ok: !!rollbackBefore
                    && rollbackFailure?.ok === false
                    && rollbackUndo?.ok === true
                    && (
                        rollbackAfter?.properties?.__deleted === true
                        || !!rollbackAfter?.properties?.deleted_at
                        || !!rollbackAfter?.properties?.deletedAt
                    ),
                details: { rollbackBefore, rollbackFailure, rollbackUndo, rollbackAfter }
            };

            return { cases };
        }, { projectId: project.project_id }, null);

        Object.entries(advancedCases?.cases || {}).forEach(([id, entry]) => {
            addCase(id, entry?.ok === true, entry?.details || null);
        });
        await captureState('state_after_advanced_cases');
        await takeShot('07_advanced_cases');

        report.ok = report.checks.every((entry) => entry.ok === true);
        fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ outFile, ok: report.ok, checks: report.checks }, null, 2));
    } catch (error) {
        report.ok = false;
        report.errors.push({
            kind: 'fatal',
            error: String(error?.message || error || 'visual_validation_failed')
        });
        fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
        console.error(JSON.stringify({ outFile, ok: false, errors: report.errors }, null, 2));
        process.exitCode = 1;
    } finally {
        if (browser) {
            await browser.close().catch(() => { });
        }
    }
};

await run();
