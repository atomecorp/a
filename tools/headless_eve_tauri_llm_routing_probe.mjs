import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.EVE_TAURI_LLM_URL || 'http://127.0.0.1:3000';
const OUT_DIR = path.resolve('tools/headless_output/tauri_llm_routing_probe');
const OUT_FILE = path.join(OUT_DIR, 'report.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (predicate, {
    timeoutMs = 30000,
    intervalMs = 250,
    label = 'wait_for'
} = {}) => {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeoutMs) {
        const result = await predicate();
        if (result) return result;
        await sleep(intervalMs);
    }
    throw new Error(`${label}_timeout`);
};

const report = {
    created_at: new Date().toISOString(),
    url: APP_URL,
    ok: false,
    checks: [],
    requests: [],
    console: [],
    screenshots: [],
    failures: []
};

const addCheck = (name, ok, details = null) => {
    const entry = { name, ok: ok === true, details };
    report.checks.push(entry);
    if (ok !== true) {
        report.failures.push(entry);
    }
};

const main = async () => {
    let browser = null;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1440, height: 980 }
        });

        await context.addInitScript(() => {
            window.__SQUIRREL_FORCE_TAURI_RUNTIME__ = true;
        });

        await context.route('http://127.0.0.1:3000/api/eve/ai/provider-completion', async (route) => {
            const request = route.request();
            let parsedBody = null;
            try {
                parsedBody = JSON.parse(request.postData() || '{}');
            } catch (error) {
        console.warn("[cleanup] operation failed", error);
                parsedBody = null;
            }
            report.requests.push({
                url: request.url(),
                method: request.method(),
                headers: request.headers(),
                body: parsedBody
            });
            await route.fulfill({
                status: 429,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: {
                        type: 'rate_limit_exceeded',
                        message: 'Too many requests'
                    }
                })
            });
        });

        const page = await context.newPage();
        page.on('console', (message) => {
            report.console.push({
                type: message.type(),
                text: message.text()
            });
        });
        page.on('pageerror', (error) => {
            report.console.push({
                type: 'pageerror',
                text: String(error?.message || error || 'pageerror')
            });
        });

        await page.goto(APP_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        const ready = await waitFor(
            async () => page.evaluate(async () => {
                if (!window.__DEBUG__ || !window.Squirrel?.voice?.ensureReady) return null;
                window.__DEBUG__.setDeterministicTestMode?.(true);
                await window.Squirrel.voice.ensureReady().catch(() => null);
                return {
                    debug: !!window.__DEBUG__,
                    voice: !!window.Squirrel?.voice,
                    locale: window.document?.documentElement?.lang || null
                };
            }),
            { timeoutMs: 45000, label: 'ui_ready' }
        );
        addCheck('ui_ready', !!ready, ready);

        const injectProfile = await page.evaluate(async () => {
            if (!window.AdoleAPI?.auth || !window.Atome) {
                return { ok: false, error: 'missing_auth_or_atome' };
            }

            const fakeUserId = 'probe_user_llm_routing';
            const fakeProfile = {
                username: 'Probe User',
                passkeys: {
                    keys: [
                        {
                            provider: 'openai',
                            model: 'gpt-5-mini',
                            key: 'sk-probe'
                        }
                    ]
                }
            };

            const originalCurrent = window.AdoleAPI.auth.current?.bind(window.AdoleAPI.auth) || null;
            const originalGetStateCurrent = window.Atome.getStateCurrent?.bind(window.Atome) || null;

            window.__EVE_LLM_ROUTING_PROBE_RESTORE__ = () => {
                if (originalCurrent) {
                    window.AdoleAPI.auth.current = originalCurrent;
                }
                if (originalGetStateCurrent) {
                    window.Atome.getStateCurrent = originalGetStateCurrent;
                }
            };

            window.AdoleAPI.auth.current = async () => ({
                logged: true,
                user: {
                    id: fakeUserId,
                    user_id: fakeUserId,
                    username: 'Probe User',
                    name: 'Probe User'
                }
            });

            window.Atome.getStateCurrent = async (userId) => ({
                id: userId || fakeUserId,
                properties: {
                    eve_profile: JSON.stringify(fakeProfile)
                }
            });

            return {
                ok: true,
                fake_user_id: fakeUserId,
                providers: fakeProfile.passkeys.keys.map((entry) => entry.provider)
            };
        });
        addCheck('profile_injected', injectProfile?.ok === true, injectProfile);

        const voiceResult = await page.evaluate(async () => {
            const session = await window.Squirrel.voice.createSession({
                locale: 'fr',
                source_layer: 'headless_tauri_llm_routing_probe'
            });
            const response = await window.Squirrel.voice.executeUtterance('hello', {
                session_id: session?.session_id || null,
                locale: 'fr',
                lang: 'fr',
                autoSpeak: false
            });
            return {
                session_id: session?.session_id || null,
                response: JSON.parse(JSON.stringify(response || {}))
            };
        });

        addCheck(
            'response_classified_as_rate_limited',
            voiceResult?.response?.error === 'provider_rate_limited'
                && !String(voiceResult?.response?.reply_text || '').includes('credits de l\'IA sont epuises'),
            voiceResult?.response || null
        );

        addCheck(
            'proxy_request_sent_to_axum',
            report.requests.length === 1
                && report.requests[0]?.url === 'http://127.0.0.1:3000/api/eve/ai/provider-completion'
                && report.requests[0]?.body?.provider_id === 'openai',
            report.requests[0] || null
        );

        const screenshotPath = path.join(OUT_DIR, 'voice_surface.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        report.screenshots.push(screenshotPath);

        await page.evaluate(() => {
            if (typeof window.__EVE_LLM_ROUTING_PROBE_RESTORE__ === 'function') {
                window.__EVE_LLM_ROUTING_PROBE_RESTORE__();
            }
        }).catch(() => {});

        report.ok = report.failures.length === 0;
    } catch (error) {
        addCheck('probe_runtime', false, {
            error: String(error?.message || error || 'probe_failed')
        });
        report.ok = false;
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
        fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
    }

    if (!report.ok) {
        process.exitCode = 1;
    }
};

await main();
