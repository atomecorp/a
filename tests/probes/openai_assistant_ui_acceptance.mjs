import fs from 'node:fs';
import { chromium } from 'playwright';
import { awaitBevyUiNodeTarget, clickCanvasTarget, recordCenter, waitFor } from './molecule_ui_acceptance_support.mjs';

const handedness = process.env.ATOME_TEST_HANDEDNESS === 'left' ? 'left' : 'right';
const viewport = { width: Number(process.env.ATOME_TEST_WIDTH || 1280), height: 900 };
const report = { errors: [], checks: [], platform: 'web', live_provider: false, handedness, viewport };
const directory = 'temp/openai-assistant-ui/' + handedness + '-' + viewport.width;
fs.mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport });
let originalProfile = null;
let retainedConversationId = null, retainedAssetId = null;
const iconTarget = async () => {
    await waitFor(page, async () => {
        const { sceneState } = await import('/eVe/domains/rendering/project_scene_state.js');
        return window.eveToolBase?.getProjectSceneState?.(sceneState.foregroundProjectId)?.records?.some(record => record.id.endsWith('main_menu_tool_atome_icon_image'));
    }, null, 15000);
    const projectId = await page.evaluate(async () => (await import('/eVe/domains/rendering/project_scene_state.js')).sceneState.foregroundProjectId);
    const hint = await recordCenter(page, projectId, record => record.id.endsWith('main_menu_tool_atome_icon_image'));
    return awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_main_menu', nodeId: 'eve_bevy_ui_main_menu_tool_atome', hint });
};
page.on('console', message => { if (message.type() === 'error' && /assistant|voice|bevy_main_menu/.test(message.text())) report.errors.push(message.text().slice(0, 500)); });
page.on('pageerror', error => report.errors.push(error.message.slice(0, 500)));
try {
    await page.goto(process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.AdoleAPI && window.__authCheckComplete, null, { timeout: 45000 });
    const logged = await page.evaluate(async credentials => {
        const response = await window.AdoleAPI.auth.login(credentials.phone, credentials.password, credentials.phone);
        return { ok: response?.success === true || response?.fastify?.success === true || response?.tauri?.success === true,
            error: response?.error || response?.fastify?.error || response?.tauri?.error };
    }, { phone: process.env.ATOME_TEST_PHONE, password: process.env.ATOME_TEST_PASSWORD });
    if (!logged.ok) throw new Error('ui_test_login_failed:' + logged.error);
    const configured = await page.evaluate(async () => { const { requestProviderService } = await import('#squirrel/ai/provider_broker.js');
        return (await requestProviderService('credential.status')).configured; });
    if (configured) throw new Error('ui_live_provider_requires_budgeted_campaign');
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => window.AdoleAPI && window.__authCheckComplete, null, { timeout: 45000 });
    await page.waitForFunction(() => typeof window.Atome?.commit === 'function', null, { timeout: 45000 });
    originalProfile = await page.evaluate(async value => {
        const home = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js');
        const loaded = await home.loadHomeProfile();
        if (!loaded.ok) throw new Error('ui_profile_load_failed');
        const original = { userId: loaded.userId, handedness: loaded.profile.preferences.visual.handedness };
        if (original.handedness !== value) {
            loaded.profile.preferences.visual.handedness = value;
            const result = await home.persistHomeProfile({ profile: loaded.profile, userId: loaded.userId, guest: false });
            if (!result.ok) return { ...original, error: result.error || result.reason || 'ui_profile_update_failed' };
        }
        return original;
    }, handedness);
    if (originalProfile.error) throw new Error('ui_profile_update_failed:' + originalProfile.error);
    await waitFor(page, async () => {
        const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const menu = getMainMenuRuntime()?.measure();
        return document.getElementById('eve_surface_project') && menu?.active && menu.treeMounted;
    }, null, 45000);
    const target = await iconTarget();
    if (!target) throw new Error('assistant_icon_hit_target_missing');
    await page.mouse.move(target.x, target.y); await page.mouse.down();
    try { await page.waitForFunction(() => window.eveAssistantApi?.getState()?.active === true, null, { timeout: 5000 }); }
    finally { await page.mouse.up(); }
    await page.waitForFunction(() => window.eveAssistantApi?.getState()?.transition === 'visible', null, { timeout: 15000 });
    report.checks.push('real_held_pointer_opens_assistant');
    await page.screenshot({ path: directory + '/opened.png' });
    const field = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_main_menu', nodePrefix: 'eve_assistant_prompt' });
    if (!field) throw new Error('assistant_prompt_hit_target_missing');
    await clickCanvasTarget(page, field);
    await page.keyboard.type('UI acceptance draft');
    await page.waitForFunction(() => window.eveAssistantApi?.getState()?.inputMode === 'text');
    if (process.env.ATOME_TEST_ATTACHMENT === '1') await page.evaluate(() => window.eveAssistantApi.addImageReference(new File(['Explicit local attachment acceptance data.'], 'openai-attachment.txt', { type: 'text/plain' })));
    report.checks.push('real_text_focus_disables_listening');
    await page.screenshot({ path: directory + '/typing.png' });
    report.slider = [];
    const sliderSnapshot = async stage => report.slider.push({ stage, ...await page.evaluate(async () => {
        const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const menu = getMainMenuRuntime();
        return { itemSize: menu.state.itemSize, slider: menu.state.sliderStateByKey.get('assistant'),
            level: window.eveAssistantApi.getState().conversation.level };
    }) });
    await sliderSnapshot('before_press');
    const dragTarget = await iconTarget();
    const travel = await page.evaluate(async () => { const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js'); return getMainMenuRuntime().state.itemSize * 1.5; });
    await page.mouse.move(dragTarget.x, dragTarget.y); await page.mouse.down();
    await page.mouse.move(dragTarget.x + (handedness === 'right' ? -travel : travel), dragTarget.y, { steps: 12 });
    await sliderSnapshot('after_moves');
    await page.screenshot({ path: directory + '/slider.png' });
    await sliderSnapshot('after_capture');
    await page.mouse.up();
    await sliderSnapshot('after_release');
    await page.waitForFunction(() => window.eveAssistantApi?.getState()?.conversation?.level === 3, null, { timeout: 10000 });
    const afterSlider = await page.evaluate(() => { const state = window.eveAssistantApi.getState(); return { level: state.conversation.level, inputMode: state.inputMode }; });
    if (afterSlider.inputMode !== 'text') throw new Error('slider_resumed_microphone');
    report.checks.push('inward_drag_selects_level_without_resuming_microphone');
    await page.screenshot({ path: directory + '/after-slider.png' });
    if (process.env.ATOME_TEST_ALL_LEVELS === '1') {
        for (const level of [5, 1, 4, 2, 3]) {
            const start = await iconTarget();
            const distance = Math.max(8, (level - 1) * travel / 2);
            await page.mouse.move(start.x, start.y); await page.mouse.down();
            await page.mouse.move(start.x + (handedness === 'right' ? -distance : distance), start.y, { steps: 12 });
            await page.mouse.up(); await sliderSnapshot('selected_' + level);
            await page.waitForFunction(level => window.eveAssistantApi.getState().conversation.level === level, level, { timeout: 5000 });
            if ((await page.evaluate(() => window.eveAssistantApi.getState().inputMode)) !== 'text') throw new Error('level_selection_restarted_capture');
        }
        report.checks.push('all_five_levels_are_reachable_in_repeated_inward_gestures');
    }
    const submitField = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_main_menu', nodePrefix: 'eve_assistant_prompt' });
    await clickCanvasTarget(page, submitField); await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.eveAssistantApi.getState().conversation.phase === 'error', null, { timeout: 15000 });
    const failedTurn = await page.evaluate(() => { const c = window.eveAssistantApi.getState().conversation;
        return { id: c.id, count: c.turns.length, error: c.error }; });
    if (failedTurn.count !== 1 || !['no_ai_key_configured', 'no_active_ai_provider', 'ai_active_provider_key_missing'].includes(failedTurn.error)) throw new Error('unexpected_unconfigured_provider_result:' + failedTurn.error);
    report.expected_errors = [failedTurn.error];
    report.errors = report.errors.filter(error => error !== failedTurn.error);
    report.checks.push('written_turn_retained_after_missing_credential');
    const keep = await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_main_menu', nodeId: 'assistant_save' });
    await clickCanvasTarget(page, keep);
    await page.waitForFunction(() => window.eveAssistantApi.getState().conversation.saved === true, null, { timeout: 15000 });
    retainedConversationId = failedTurn.id;
    retainedAssetId = await page.evaluate(() => window.eveAssistantApi.getState().conversation.turns[0]?.attachments?.[0]?.asset_id || null);
    if (process.env.ATOME_TEST_ATTACHMENT === '1' && !retainedAssetId) throw new Error('retained_attachment_asset_missing');
    await page.evaluate(async id => {
        const { createConversationStore } = await import('#squirrel/ai/conversation_store.js');
        const store = createConversationStore();
        const loaded = await store.load(id);
        if (loaded.turns.length !== 1 || loaded.turns[0].text !== 'UI acceptance draft') throw new Error('conversation_round_trip_failed');
        if (!(await store.list()).some(item => (item.id || item.atome_id) === id)) throw new Error('conversation_list_missing');
        await store.rename(id, 'OpenAI UI acceptance conversation');
        if ((await store.load(id)).turns[0].text !== loaded.turns[0].text) throw new Error('conversation_rename_lost_turn');
    }, retainedConversationId);
    report.checks.push('real_keep_round_trip_list_and_rename');
    const closeTarget = await iconTarget();
    await page.mouse.move(closeTarget.x, closeTarget.y); await page.mouse.down();
    try { await page.waitForFunction(() => { const state = window.eveAssistantApi?.getState();
        return state?.transition === 'disappearing' || state?.active === false; }, null, { timeout: 5000 }); }
    finally { await page.mouse.up(); }
    await page.waitForFunction(() => window.eveAssistantApi?.getState()?.active === false, null, { timeout: 15000 });
    report.checks.push('real_held_pointer_closes_assistant');
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => window.__authCheckComplete && typeof window.Atome?.commit === 'function', null, { timeout: 45000 });
    const reopenedIcon = await iconTarget();
    await page.mouse.move(reopenedIcon.x, reopenedIcon.y); await page.mouse.down();
    try { await page.waitForFunction(() => window.eveAssistantApi?.getState()?.active === true, null, { timeout: 5000 }); }
    finally { await page.mouse.up(); }
    await page.waitForFunction(() => window.eveAssistantApi.getState().transition === 'visible', null, { timeout: 15000 });
    await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_main_menu', nodeId: 'assistant_history' }));
    const rowId = 'finder_row_id_' + retainedConversationId;
    await clickCanvasTarget(page, await awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_panel_finder', nodeId: rowId }));
    await page.waitForFunction(id => window.eveAssistantApi.getState().conversation.id === id, retainedConversationId, { timeout: 15000 });
    await page.waitForFunction(() => !window.eveBevyUiRuntime.state.trees.has('eve_bevy_panel_finder'), null, { timeout: 10000 });
    const restored = await page.evaluate(() => { const state = window.eveAssistantApi.getState();
        return { text: state.conversation.turns[0]?.text, inputMode: state.inputMode, saved: state.conversation.saved }; });
    if (restored.text !== 'UI acceptance draft' || restored.inputMode !== 'text' || !restored.saved) throw new Error('finder_conversation_resume_failed');
    await page.screenshot({ path: directory + '/resumed-conversation.png' });
    report.checks.push('reload_history_finder_click_resumes_saved_conversation_in_text_mode');
    if (retainedAssetId) {
        const fileRead = await page.evaluate(async () => {
            const reference = window.eveAssistantApi.getState().image.references[0];
            if (!reference?.asset_id) throw new Error('restored_attachment_reference_missing');
            try { await window.eveAssistantApi.processAttachment({ operation: 'transcribe', reference_id: reference.id }); }
            catch (error) { return error.message; }
            return 'unexpected_audio_acceptance';
        });
        // A text file is loaded locally, then rejected before an audio provider request.
        if (fileRead !== 'assistant_audio_type_unsupported') throw new Error('restored_local_file_read_failed:' + fileRead);
        report.checks.push('restored_local_attachment_read_without_provider_transfer');
    }
    if (process.env.ATOME_TEST_RETOUCH === '1') {
        const { runOpenAiRetouchAcceptance } = await import('./openai_retouch_ui_acceptance.mjs');
        await runOpenAiRetouchAcceptance({ page, report, directory });
    }
    report.status = 'passed';
} catch (error) {
    report.status = 'blocked'; report.error = String(error.message).slice(0, 500);
    report.anchors = await page.evaluate(() => { const p = window.eveDashboardBevyUiRuntime?.state?.active ? window.eveDashboardBevyUiRuntime.state.projectId : window.__currentProject?.id;
        return (window.eveToolBase?.getProjectSceneState?.(p)?.records || []).filter(r => r.id.includes('main_menu_tool_atome')).map(r => ({ id: r.id, type: r.type })); });
    report.assistant = await page.evaluate(() => { const state = window.eveAssistantApi?.getState();
        return state ? { active: state.active, phase: state.phase, transition: state.transition, error: state.error, inputMode: state.inputMode, level: state.conversation?.level } : null; });
    try { await page.screenshot({ path: directory + '/failure.png' }); }
    catch (captureError) { report.capture_error = captureError.message; }
    process.exitCode = 2;
} finally {
    if (retainedConversationId && !page.isClosed()) {
        try {
            await page.evaluate(async id => {
                const { createConversationStore } = await import('#squirrel/ai/conversation_store.js');
                const store = createConversationStore(); await store.remove(id);
                let missing = false;
                try { await store.load(id); } catch (error) { missing = ['conversation_not_found', 'State not found', 'state_not_found'].includes(error.message); }
                if (!missing) throw new Error('conversation_delete_not_visible');
            }, retainedConversationId);
            report.checks.push('canonical_conversation_deletion_verified');
        } catch (error) { report.errors.push(error.message); report.status = 'failed'; process.exitCode = 2; }
    }
    if (retainedAssetId && !page.isClosed()) {
        try {
            await page.evaluate(async id => {
                const { delete_atome } = await import('#squirrel/apis/unified/adole_api/atomes.js');
                const removed = await delete_atome(id);
                if (!removed.fastify?.success) throw new Error('test_attachment_delete_failed');
            }, retainedAssetId);
        } catch (error) { report.status = 'failed'; report.cleanup_error = error.message; process.exitCode = 2; }
    }
    if (originalProfile && originalProfile.handedness !== handedness) {
        try {
            await page.evaluate(async original => {
                const home = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js');
                const loaded = await home.loadHomeProfile();
                if (!loaded.ok || loaded.userId !== original.userId) throw new Error('ui_profile_restore_principal_changed');
                loaded.profile.preferences.visual.handedness = original.handedness;
                if (!(await home.persistHomeProfile({ profile: loaded.profile, userId: loaded.userId, guest: false })).ok) throw new Error('ui_profile_restore_failed');
            }, originalProfile);
        } catch (error) { report.status = 'blocked'; report.cleanup_error = error.message; process.exitCode = 2; }
    }
    fs.writeFileSync(directory + '/report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    await browser.close();
}
