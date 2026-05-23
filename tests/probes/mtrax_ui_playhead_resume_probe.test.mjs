import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const mediaDir = path.resolve(process.env.ATOME_MEDIA_TEST_DIR || 'tests/fixtures/media');
const mediaPath = path.join(mediaDir, 'Vampire.m4v');
const outDir = path.resolve('temp/probe_reports/mtrax_ui_playhead_resume_probe');
const reportFile = path.join(outDir, 'report.json');
const logFile = path.join(outDir, 'run.log');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(logFile, '');

const redact = (value) => String(value || '')
    .replace(/([?&](?:access_token|auth_token|token)=)[^"'\s&]+/gi, '$1<redacted>')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');

const log = (message, detail = null) => {
    const line = `[${new Date().toISOString()}] ${message}${detail ? ` ${redact(JSON.stringify(detail))}` : ''}`;
    fs.appendFileSync(logFile, `${line}\n`);
    console.log(line);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const writeReport = (report) => {
    fs.writeFileSync(reportFile, redact(JSON.stringify(report, null, 2)));
};

const safeEval = async (page, fn, arg = null, timeoutMs = 15000) => {
    try {
        return await Promise.race([
            page.evaluate(fn, arg),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`eval_timeout_${timeoutMs}`)), timeoutMs))
        ]);
    } catch (error) {
        return { ok: false, error: String(error?.message || error || 'eval_failed') };
    }
};

const waitFor = async (page, predicate, timeoutMs = 30000, intervalMs = 250, arg = null) => {
    const started = Date.now();
    let last = null;
    while ((Date.now() - started) < timeoutMs) {
        last = await safeEval(page, predicate, arg, Math.min(5000, timeoutMs));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

const navigateStable = async (page, targetUrl) => {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load', { timeout: 45000 }).catch(() => {});
};

const reloadStable = async (page) => {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('load', { timeout: 45000 }).catch(() => {});
};

const tryLogin = async (page) => {
    const login = await safeEval(page, async ({ phone: loginPhone, password: loginPassword }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.login) return { ok: false, error: 'auth_login_unavailable' };
        try {
            const result = await api.auth.login(loginPhone, loginPassword, loginPhone);
            return { ok: !!(result?.fastify?.success || result?.tauri?.success), result };
        } catch (error) {
            return { ok: false, error: String(error?.message || error || 'login_failed') };
        }
    }, { phone, password }, 20000);
    if (login?.ok) return login;
    return safeEval(page, async ({ phone: loginPhone, password: loginPassword, prior }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.create) return { ok: false, error: 'auth_create_unavailable', prior };
        try {
            const result = await api.auth.create(loginPhone, loginPassword, loginPhone, { autoLogin: true });
            return {
                ok: !!(result?.fastify?.success || result?.tauri?.success || result?.login?.fastify?.success || result?.login?.tauri?.success),
                result,
                prior
            };
        } catch (error) {
            return { ok: false, error: String(error?.message || error || 'create_failed'), prior };
        }
    }, { phone, password, prior: login }, 30000);
};

const bootstrapImport = async (page) => {
    const ready = await safeEval(page, async () => {
        window.__CHECK_DEBUG__ = true;
        window.__EVE_MTRACK_DEBUG__ = true;
        window.__EVE_MTRACK_TRACE__ = true;
        window.__EVE_HMTRACKS_AUDIO_DEBUG_LOGS__ = true;
        window.__EVE_MTRAX_FORCE_WEBGPU__ = true;
        if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
            await import('/eve/application/intuition/tools/project_drop.js');
        }
        window.__DEBUG__?.setDeterministicTestMode?.(true);
        const projectEl = document.querySelector('[id^="project_view_"]');
        const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
        return {
            ok: !!(window.eveProjectDropApi?.importFilesToProjectViaCreator && projectEl && projectId),
            project_id: projectId
        };
    }, null, 30000);
    if (!ready?.ok) throw new Error(`bootstrap_not_ready:${JSON.stringify(ready)}`);

    await page.evaluate(() => {
        document.getElementById('mtrax_ui_resume_input')?.remove();
        const input = document.createElement('input');
        input.id = 'mtrax_ui_resume_input';
        input.type = 'file';
        input.style.position = 'fixed';
        input.style.left = '0';
        input.style.top = '0';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.opacity = '0';
        document.body.appendChild(input);
    });
    await page.setInputFiles('#mtrax_ui_resume_input', mediaPath);
    const imported = await safeEval(page, async () => {
        const input = document.getElementById('mtrax_ui_resume_input');
        const entries = Array.from(input?.files || []);
        const projectEl = document.querySelector('[id^="project_view_"]');
        const projectId = window.__currentProject?.id || projectEl?.id?.replace(/^project_view_/, '') || null;
        if (!entries.length) return { ok: false, error: 'no_files' };
        return window.eveProjectDropApi.importFilesToProjectViaCreator({
            entries,
            projectEl,
            projectId,
            event: { clientX: projectEl.getBoundingClientRect().left + 180, clientY: projectEl.getBoundingClientRect().top + 160 },
            origin: 'mtrax_ui_playhead_resume_probe',
            sourceLayer: 'mtrax_ui_playhead_resume_probe',
            actorType: 'probe'
        });
    }, null, 180000);
    if (!imported?.ok) throw new Error(`import_failed:${JSON.stringify(imported)}`);
    const video = Array.isArray(imported.results)
        ? imported.results.find((entry) => String(entry?.type || '').toLowerCase() === 'video')
        : null;
    if (!video?.atomeId) throw new Error(`video_import_missing:${JSON.stringify(imported)}`);
    return video.atomeId;
};

const openMtrack = async (page, atomeId) => {
    const opened = await safeEval(page, async (id) => {
        const mod = await import('/eVe/intuition/runtime/group_timeline_api.js');
        return mod.openGroupTimeline({
            action: 'open',
            atome_id: id,
            target_id: id,
            selection_ids: [id],
            toggle: false,
            source: 'mtrax_ui_playhead_resume_probe',
            source_layer: 'mtrax_ui_playhead_resume_probe',
            footer_coupled: false
        });
    }, atomeId, 45000);
    const ready = await waitFor(page, (id) => {
        const panel = document.getElementById('eve_mtrack_dialog');
        const visible = !!panel && getComputedStyle(panel).display !== 'none' && getComputedStyle(panel).visibility !== 'hidden';
        const state = window.eveMtrackApi?.getState?.() || null;
        return { ok: visible && String(state?.activeGroupId || '') === String(id) && Number(state?.clipCount || 0) > 0, state };
    }, 45000, 300, atomeId);
    if (!ready?.ok) throw new Error(`mtrack_not_ready:${JSON.stringify({ opened, ready })}`);
    return { opened, ready };
};

const installTrace = async (page) => safeEval(page, async () => {
    window.__MTRAX_UI_RESUME_TRACE__ = [];
    window.__MTRAX_UI_RESUME_DOM_TRACE__ = [];
    const summarizeEventTarget = (target) => target
        ? {
            tag: String(target.tagName || '').toLowerCase(),
            id: String(target.id || ''),
            toolId: String(target.dataset?.toolId || ''),
            nameKey: String(target.dataset?.nameKey || '')
        }
        : null;
    const recordDomEvent = (event) => {
        if (event.type !== 'click' && event.key !== ' ' && event.code !== 'Space') return;
        window.__MTRAX_UI_RESUME_DOM_TRACE__.push({
            type: event.type,
            key: String(event.key || ''),
            code: String(event.code || ''),
            defaultPrevented: event.defaultPrevented === true,
            target: summarizeEventTarget(event.target),
            active: summarizeEventTarget(document.activeElement),
            ts: Date.now()
        });
    };
    if (window.__MTRAX_UI_RESUME_DOM_TRACE_BOUND__ !== true) {
        document.addEventListener('keydown', recordDomEvent, true);
        document.addEventListener('keyup', recordDomEvent, true);
        document.addEventListener('click', recordDomEvent, true);
        window.__MTRAX_UI_RESUME_DOM_TRACE_BOUND__ = true;
    }
    const api = window.eveMtrackApi || null;
    if (!api) return { ok: false, error: 'api_missing' };
    for (const method of ['play', 'pause', 'stop', 'togglePlay', 'seek', 'loadGroupTimeline']) {
        const original = api[method];
        if (typeof original !== 'function' || original.__resumeProbeWrapped === true) continue;
        api[method] = async function wrappedResumeProbe(...args) {
            const before = typeof api.getState === 'function' ? api.getState() : null;
            let result = null;
            let error = null;
            try {
                result = await original.apply(this, args);
                return result;
            } catch (err) {
                error = String(err?.message || err || 'error');
                throw err;
            } finally {
                const after = typeof api.getState === 'function' ? api.getState() : null;
                window.__MTRAX_UI_RESUME_TRACE__.push({
                    method,
                    args: args.map((arg) => {
                        try { return JSON.parse(JSON.stringify(arg)); } catch (_) { return String(arg); }
                    }),
                    result: result && typeof result === 'object' ? result : { value: result },
                    error,
                    before_playhead: Number(before?.playhead || 0),
                    after_playhead: Number(after?.playhead || 0),
                    after_playing: after?.playing === true || after?.isPlaying === true,
                    ts: Date.now()
                });
            }
        };
        Object.defineProperty(api[method], '__resumeProbeWrapped', { value: true });
    }
    return { ok: true };
}, null, 10000);

const state = async (page, label) => safeEval(page, (sampleLabel) => {
    const timeline = window.__DEBUG__?.getTimelineState?.() || null;
    const apiState = window.eveMtrackApi?.getState?.() || null;
    const status = document.querySelector('#eve_mtrack_dialog [data-role="transport-status"], #eve_mtrack_dialog .eve-mtrack-status')?.textContent || '';
    const activeEl = document.activeElement;
    const summarizeElement = (el) => el
        ? {
            tag: String(el.tagName || '').toLowerCase(),
            id: String(el.id || ''),
            text: String(el.textContent || '').trim().slice(0, 80),
            nameKey: String(el.dataset?.nameKey || ''),
            toolId: String(el.dataset?.toolId || ''),
            role: String(el.getAttribute?.('role') || '')
        }
        : null;
    return {
        ok: true,
        label: sampleLabel,
        playhead: Number(apiState?.playhead || timeline?.state?.playhead || 0),
        playing: apiState?.playing === true || apiState?.isPlaying === true || timeline?.state?.playing === true,
        status,
        activeElement: summarizeElement(activeEl),
        transportButtons: Array.from(document.querySelectorAll('#eve_mtrack_dialog button')).map(summarizeElement),
        debug: timeline,
        trace: Array.isArray(window.__MTRAX_UI_RESUME_TRACE__) ? window.__MTRAX_UI_RESUME_TRACE__.slice() : [],
        domTrace: Array.isArray(window.__MTRAX_UI_RESUME_DOM_TRACE__) ? window.__MTRAX_UI_RESUME_DOM_TRACE__.slice() : []
    };
}, label, 10000);

const clickTransport = async (page, key) => {
    if (key === 'play') {
        const child = page.locator('#eve_mtrack_dialog button[data-name-key="play_media"]:visible, #eve_mtrack_dialog button[data-tool-id="ui.media.reader"]:visible').first();
        const visible = await child.count().catch(() => 0);
        if (visible < 1) {
            await openTransportPalette(page);
        }
        await child.waitFor({ state: 'visible', timeout: 15000 });
        await child.click({ timeout: 15000 });
        return;
    }
    if (key === 'stop') {
        const playHost = page.locator('#eve_mtrack_dialog button[data-name-key="play"], #eve_mtrack_dialog button[data-tool-id="ui.play"]').first();
        await playHost.hover({ timeout: 15000 });
        await sleep(300);
    }
    const selector = key === 'stop'
        ? '#eve_mtrack_dialog button[data-name-key="play_stop"]:visible, #eve_mtrack_dialog button[data-tool-id="ui.stop"]:visible'
        : `#eve_mtrack_dialog button[data-name-key="${key}"]:visible, #eve_mtrack_dialog button[data-tool-id*="${key}"]:visible, #eve_mtrack_dialog button[data-label="${key}"]:visible`;
    const locator = page.locator(selector).first();
    if (key === 'stop') {
        const visible = await locator.count().catch(() => 0);
        if (visible < 1) {
            const dispatched = await safeEval(page, () => {
                const button = document.querySelector('#eve_mtrack_dialog button[data-name-key="play_stop"], #eve_mtrack_dialog button[data-tool-id="ui.stop"]');
                if (!button) return { ok: false, error: 'stop_button_missing' };
                button.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
                return { ok: true };
            }, null, 10000);
            if (!dispatched?.ok) throw new Error(`stop_dispatch_failed:${JSON.stringify(dispatched)}`);
            return;
        }
    }
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.click({ timeout: 15000 });
};

const openTransportPalette = async (page) => {
    const host = page.locator('#eve_mtrack_dialog button[data-name-key="play"], #eve_mtrack_dialog button[data-tool-id="ui.play"]').first();
    await host.waitFor({ state: 'visible', timeout: 15000 });
    await host.click({ timeout: 15000 });
    await sleep(250);
};

const seekTo = async (page, seconds) => {
    const result = await safeEval(page, async (target) => window.eveMtrackApi.seek({ seconds: target }), seconds, 15000);
    if (result?.ok === false) throw new Error(`seek_failed:${JSON.stringify(result)}`);
    await sleep(350);
};

const assertNotReset = (sample, expectedMin, label) => {
    if (!(Number(sample?.playhead || 0) >= expectedMin)) {
        throw new Error(`${label}_playhead_reset:${JSON.stringify(sample)}`);
    }
};

const assertPlaying = (sample, label) => {
    if (sample?.playing !== true) {
        throw new Error(`${label}_not_playing:${JSON.stringify(sample)}`);
    }
};

const assertPaused = (sample, label) => {
    if (sample?.playing === true) {
        throw new Error(`${label}_still_playing:${JSON.stringify(sample)}`);
    }
};

const waitForPlayingState = async (page, expectedPlaying, label, timeoutMs = 6000) => {
    const startedAt = Date.now();
    let sample = null;
    while (Date.now() - startedAt < timeoutMs) {
        sample = await state(page, label);
        if ((sample?.playing === true) === expectedPlaying) return sample;
        await sleep(180);
    }
    return sample || await state(page, label);
};

const waitForAudioSessionReady = async (page) => {
    const ready = await waitFor(page, () => {
        const state = window.eveMtrackApi?.getState?.() || null;
        const engine = state?.audioEngine || null;
        return {
            ok: Number(engine?.session_clip_count || 0) > 0
                && Number(engine?.session_native_audio_clip_count || 0) > 0
                && engine?.prepared === true
        };
    }, 30000, 250);
    if (!ready?.ok) throw new Error(`audio_session_not_ready:${JSON.stringify(ready)}`);
};

const run = async () => {
    if (!fs.existsSync(mediaPath)) throw new Error(`missing_media:${mediaPath}`);
    const report = { ok: false, url, steps: [], console: [], reportFile };
    const browser = await chromium.launch({
        headless: process.env.MTRAX_UI_RESUME_HEADLESS !== '0',
        args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
        window.__CHECK_DEBUG__ = true;
        window.__EVE_MTRACK_DEBUG__ = true;
        window.__EVE_MTRACK_TRACE__ = true;
        window.__EVE_HMTRACKS_AUDIO_DEBUG_LOGS__ = true;
        window.__EVE_MTRAX_FORCE_WEBGPU__ = true;
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
        const entry = { type: msg.type(), text: redact(msg.text()) };
        report.console.push(entry);
        if (/mtrack|hmtracks|play|stop|pause|error/i.test(entry.text)) log('console', entry);
    });
    page.on('pageerror', (error) => report.console.push({ type: 'pageerror', text: error.message }));
    page.on('requestfailed', (request) => report.console.push({ type: 'requestfailed', url: redact(request.url()), error: request.failure()?.errorText || '' }));
    try {
        await navigateStable(page, url);
        await waitFor(page, () => ({ ok: !!window.AdoleAPI && window.__authCheckComplete === true }), 45000);
        const login = await tryLogin(page);
        if (!login?.ok) throw new Error(`login_failed:${JSON.stringify(login)}`);
        await reloadStable(page);
        await waitFor(page, () => ({ ok: window.__authCheckComplete === true && !!document.querySelector('[id^="project_view_"]') }), 45000);
        const atomeId = await bootstrapImport(page);
        await openMtrack(page, atomeId);
        await installTrace(page);
        report.steps.push(await state(page, 'opened'));

        await seekTo(page, 10);
        await waitForAudioSessionReady(page);
        report.steps.push(await state(page, 'seek_10_before_click_play'));
        await page.screenshot({ path: path.join(outDir, '01_seek_10_before_play.png'), fullPage: true });
        await openTransportPalette(page);
        const afterOpenTransportPalette = await state(page, 'after_open_transport_palette');
        report.steps.push(afterOpenTransportPalette);
        assertPaused(afterOpenTransportPalette, 'open_transport_palette');
        assertNotReset(afterOpenTransportPalette, 9.75, 'open_transport_palette');
        await clickTransport(page, 'play');
        const afterClickPlay = await waitForPlayingState(page, true, 'after_click_play');
        report.steps.push(afterClickPlay);
        assertNotReset(afterClickPlay, 9.75, 'click_play');
        assertPlaying(afterClickPlay, 'click_play');

        await clickTransport(page, 'play');
        const afterClickPause = await waitForPlayingState(page, false, 'after_click_pause');
        report.steps.push(afterClickPause);
        assertNotReset(afterClickPause, 9.75, 'click_pause');
        assertPaused(afterClickPause, 'click_pause');

        await clickTransport(page, 'play');
        const afterClickResume = await waitForPlayingState(page, true, 'after_click_resume');
        report.steps.push(afterClickResume);
        assertNotReset(afterClickResume, Number(afterClickPause.playhead || 0) - 0.1, 'click_resume');
        assertPlaying(afterClickResume, 'click_resume');

        await page.keyboard.press('Space');
        const afterSpacePause = await waitForPlayingState(page, false, 'after_space_pause');
        report.steps.push(afterSpacePause);
        assertNotReset(afterSpacePause, Number(afterClickResume.playhead || 0) - 0.1, 'space_pause');
        assertPaused(afterSpacePause, 'space_pause');

        await page.keyboard.press('Space');
        const afterSpaceResume = await waitForPlayingState(page, true, 'after_space_resume');
        report.steps.push(afterSpaceResume);
        assertNotReset(afterSpaceResume, Number(afterSpacePause.playhead || 0) - 0.1, 'space_resume');
        assertPlaying(afterSpaceResume, 'space_resume');

        await clickTransport(page, 'stop');
        await sleep(450);
        const afterStop = await state(page, 'after_stop');
        report.steps.push(afterStop);
        if (Number(afterStop.playhead || 0) > 0.1) throw new Error(`stop_did_not_reset:${JSON.stringify(afterStop)}`);

        const trace = afterStop.trace || [];
        const earlyStop = trace.find((entry, index) => entry.method === 'stop' && trace.slice(index + 1).some((later) => later.method === 'play' || later.method === 'togglePlay'));
        if (earlyStop) throw new Error(`stop_before_play_detected:${JSON.stringify(earlyStop)}`);

        report.ok = true;
        writeReport(report);
        console.log(JSON.stringify({ ok: true, reportFile, steps: report.steps.map((step) => ({ label: step.label, playhead: step.playhead, playing: step.playing })) }, null, 2));
    } catch (error) {
        report.ok = false;
        report.error = String(error?.message || error || 'probe_failed');
        report.stack = error?.stack || null;
        try { report.final = await state(page, 'fatal_final_state'); } catch (_) {}
        writeReport(report);
        log('fatal', { error: report.error });
        throw error;
    } finally {
        await browser.close();
    }
};

run().catch(() => process.exit(1));
