import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const OUT_DIR = path.resolve('temp/probe_reports/user_login_guest_real_ui');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const GUEST_IMPORT_FILE = path.join(OUT_DIR, 'guest_flower_import.svg');
const PHONE_SEED = String(process.env.ADOLE_TEST_PHONE || `${Date.now()}`).replace(/\D+/g, '').slice(-8).padStart(8, '7');
const PHONE = `06${PHONE_SEED}`.slice(-10);
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || `Valid${PHONE_SEED}`;
const WRONG_PASSWORD = `Wrong${PHONE_SEED}`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
    GUEST_IMPORT_FILE,
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="#111"/><circle cx="48" cy="32" r="22" fill="#fff"/></svg>\n',
    'utf8'
);

const writeReport = (report) => {
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, timeoutMs = 30000, intervalMs = 250, arg = null) => {
    const startedAt = Date.now();
    let last = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            last = await page.evaluate(predicate, arg);
            if (last === true || last?.ok === true) return { ok: true, last };
        } catch (error) {
            last = { ok: false, error: error?.message || String(error) };
        }
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

const visibleLocator = async (locator) => {
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    return locator;
};

const waitForRuntimeReady = async (page) => waitFor(page, () => ({
    ok: !!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition'),
    hasDebug: !!window.__DEBUG__,
    hasMenu: !!window.new_menu_v2,
    hasIntuition: !!document.getElementById('intuition')
}), 45000);

const waitForChoice = async (page) => {
    await waitForRuntimeReady(page);
    const choice = page.locator('#eve_login_sequence__choice').first();
    await visibleLocator(choice);
    return choice;
};

const submitLogin = async (page, phone, password) => {
    const authenticateChoice = page.locator('#eve_login_sequence__choice_authenticate').first();
    if (await authenticateChoice.count() > 0 && await authenticateChoice.isVisible()) {
        await authenticateChoice.click({ timeout: 8000 });
    }
    const phoneInput = page.locator('#eve_login_sequence__phone_input').first();
    await phoneInput.waitFor({ state: 'attached', timeout: 8000 });
    await phoneInput.fill(phone);
    await phoneInput.press('Enter');
    const passwordInput = page.locator('#eve_login_sequence__password_field__input').first();
    await passwordInput.waitFor({ state: 'attached', timeout: 8000 });
    await passwordInput.fill(password);
    await passwordInput.press('Enter');
};

const waitForAuthenticatedProject = async (page, anonymous) => waitFor(page, async (expectedAnonymous) => {
    const api = window.AdoleAPI || null;
    let current = null;
    try {
        current = api?.auth?.current ? await api.auth.current() : null;
    } catch (error) {
        current = { error: error?.message || String(error) };
    }
    const projectId = window.__currentProject?.id || null;
    const projectCanvas = document.getElementById('eve_surface_project');
    const sequence = document.getElementById('eve_login_sequence');
    const sequenceHidden = !sequence || getComputedStyle(sequence).display === 'none';
    const isAnonymous = api?.security?.isAnonymous ? api.security.isAnonymous() : null;
    return {
        ok: current?.logged === true
            && isAnonymous === expectedAnonymous
            && !!projectId
            && !!projectCanvas
            && sequenceHidden,
        current,
        isAnonymous,
        projectId,
        hasProjectCanvas: !!projectCanvas,
        sequenceHidden
    };
}, 45000, 300, anonymous);

const openUserPanel = async (page) => {
    await waitForRuntimeReady(page);
    if (await page.locator('button[data-tool-id="tool.main.home"]').count() === 0) {
        throw new Error('home_tool_missing');
    }
    await page.evaluate(() => window.new_menu_v2?.reveal?.());
    const home = page.locator('button[data-tool-id="tool.main.home"]').first();
    await visibleLocator(home);
    await home.click({ timeout: 8000 });
    await visibleLocator(page.locator('#eve_user_dialog__actions__logout').first());
};

const closeUserPanel = async (page) => {
    const closeButton = page.locator('#eve_user_dialog__close').first();
    if (await closeButton.count() > 0 && await closeButton.isVisible()) {
        await closeButton.click({ timeout: 8000 });
    }
};

const collectVisibleToolIds = async (page) => page.evaluate(() => {
    window.new_menu_v2?.reveal?.();
    return Array.from(document.querySelectorAll('button[data-tool-id]'))
        .filter((button) => {
            const style = getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && rect.width > 0
                && rect.height > 0;
        })
        .map((button) => String(button.dataset.toolId || '').trim())
        .filter(Boolean);
});

const waitForGuestToolbar = async (page) => waitFor(page, () => {
    window.new_menu_v2?.reveal?.();
    const visibleToolIds = Array.from(document.querySelectorAll('button[data-tool-id]'))
        .filter((button) => {
            const style = getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && rect.width > 0
                && rect.height > 0;
        })
        .map((button) => String(button.dataset.toolId || '').trim())
        .filter(Boolean);
    return {
        ok: visibleToolIds.includes('tool.main.home'),
        visibleToolIds,
        menuAuthState: window.__eveMainMenuAuthState || null,
        authCheckResult: window.__authCheckResult || null
    };
}, 20000, 250);

const openGuestFlowerMenu = async (page) => {
    const projectSurface = page.locator('#eve_surface_project').first();
    await projectSurface.waitFor({ state: 'visible', timeout: 15000 });
    const box = await projectSurface.boundingBox();
    if (!box || box.width < 20 || box.height < 20) throw new Error('project_surface_not_actionable');
    await projectSurface.click({
        button: 'right',
        position: {
            x: Math.min(Math.max(80, box.width / 2), box.width - 10),
            y: Math.min(Math.max(80, box.height / 2), box.height - 10)
        },
        timeout: 10000
    });
    const importButton = page.locator('#eve_intuitionx_flower [data-role="eve_intuitionx-flower-item"][data-key="import"]').first();
    await visibleLocator(importButton);
    return page.evaluate(() => Array.from(document.querySelectorAll('#eve_intuitionx_flower [data-role="eve_intuitionx-flower-item"]'))
        .map((button) => ({
            key: String(button.dataset.key || '').trim(),
            toolId: String(button.dataset.toolId || button.dataset.tool_id || '').trim(),
            visible: getComputedStyle(button).display !== 'none' && getComputedStyle(button).visibility !== 'hidden'
        })));
};

const readProjectRecordIds = async (page) => page.evaluate(() => {
    const projectId = window.__currentProject?.id || '';
    const scene = window.eveToolBase?.getProjectSceneState?.(projectId);
    const records = Array.isArray(scene?.records) ? scene.records : [];
    return records.map((entry) => String(entry?.id || entry?.atome_id || entry?.atomeId || '').trim()).filter(Boolean);
});

const importViaGuestFlower = async (page) => {
    await page.evaluate(() => {
        try {
            window.showOpenFilePicker = undefined;
        } catch (_) { }
    });
    const beforeIds = await readProjectRecordIds(page);
    const flowerItems = await openGuestFlowerMenu(page);
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
    await page.locator('#eve_intuitionx_flower [data-role="eve_intuitionx-flower-item"][data-key="import"]').first().click({ timeout: 10000 });
    const chooser = await chooserPromise;
    await chooser.setFiles(GUEST_IMPORT_FILE);
    const imported = await waitFor(page, (knownIds) => {
        const projectId = window.__currentProject?.id || '';
        const scene = window.eveToolBase?.getProjectSceneState?.(projectId);
        const records = Array.isArray(scene?.records) ? scene.records : [];
        const ids = records.map((entry) => String(entry?.id || entry?.atome_id || entry?.atomeId || '').trim()).filter(Boolean);
        const known = new Set(Array.isArray(knownIds) ? knownIds : []);
        const createdIds = ids.filter((id) => id && !known.has(id));
        return {
            ok: createdIds.length > 0,
            projectId,
            beforeCount: known.size,
            afterCount: ids.length,
            createdIds
        };
    }, 60000, 500, beforeIds);
    return { flowerItems, imported };
};

const createTextAndEditByDoubleClick = async (page) => {
    const frame = { left: 220, top: 170, width: 260, height: 90 };
    const created = await page.evaluate(async () => {
        const projectId = window.__currentProject?.id || '';
        if (!projectId) return { ok: false, error: 'project_missing' };
        if (typeof window.eveToolBase?.createAtome !== 'function') {
            return { ok: false, error: 'create_atome_unavailable' };
        }
        const result = await window.eveToolBase.createAtome({
            kind: 'text',
            type: 'text',
            name: 'Guest editable text',
            text: 'Guest editable text',
            content: 'Guest editable text',
            left: 220,
            top: 170,
            width: 260,
            height: 90,
            projectId
        });
        return {
            ok: result?.ok === true,
            atomeId: result?.id || result?.atome_id || result?.atomeId || null,
            result
        };
    });
    if (!created?.ok || !created.atomeId) throw new Error(`guest_text_create_failed:${created?.error || 'unknown'}`);
    const recordReady = await waitFor(page, (atomeId) => {
        const projectId = window.__currentProject?.id || '';
        const scene = window.eveToolBase?.getProjectSceneState?.(projectId);
        const records = Array.isArray(scene?.records) ? scene.records : [];
        return { ok: records.some((entry) => String(entry?.id || entry?.atome_id || entry?.atomeId || '') === atomeId) };
    }, 20000, 250, created.atomeId);
    if (!recordReady.ok) throw new Error('guest_text_record_missing');
    const projectSurface = page.locator('#eve_surface_project').first();
    await projectSurface.waitFor({ state: 'visible', timeout: 15000 });
    await projectSurface.dblclick({
        position: {
            x: frame.left + Math.round(frame.width / 2),
            y: frame.top + Math.round(frame.height / 2)
        },
        timeout: 10000
    });
    const editableReady = await waitFor(page, (atomeId) => {
        const editable = document.querySelector('[data-role="active-text-editor"]');
        const projectId = window.__currentProject?.id || '';
        const scene = window.eveToolBase?.getProjectSceneState?.(projectId);
        const session = scene?.text?.inline_edit_session || null;
        return {
            ok: editable instanceof HTMLElement && session?.atom_id === atomeId,
            activeTag: document.activeElement?.tagName || null,
            editorValue: editable?.value || '',
            session
        };
    }, 15000, 250, created.atomeId);
    if (!editableReady.ok) throw new Error('guest_text_edit_not_focused');
    await page.keyboard.type(' updated');
    const typed = await waitFor(page, (atomeId) => {
        const projectId = window.__currentProject?.id || '';
        const scene = window.eveToolBase?.getProjectSceneState?.(projectId);
        const records = Array.isArray(scene?.records) ? scene.records : [];
        const record = records.find((entry) => String(entry?.id || entry?.atome_id || entry?.atomeId || '') === atomeId) || null;
        const text = String(record?.properties?.text || record?.text || record?.content || '');
        return { ok: /updated/.test(text), text };
    }, 10000, 250, created.atomeId);
    return { created, editableReady, typed };
};

const logoutViaUi = async (page) => {
    await openUserPanel(page);
    await page.locator('#eve_user_dialog__actions__logout').first().click({ timeout: 8000 });
    await waitForChoice(page);
};

const collectSnapshot = async (page) => page.evaluate(async () => {
    const api = window.AdoleAPI || null;
    let current = null;
    try {
        current = api?.auth?.current ? await api.auth.current() : null;
    } catch (error) {
        current = { error: error?.message || String(error) };
    }
    const sequence = document.getElementById('eve_login_sequence');
    const choice = document.getElementById('eve_login_sequence__choice');
    const projectCanvas = document.getElementById('eve_surface_project');
    return {
        authCheckComplete: window.__authCheckComplete === true,
        authCheckResult: window.__authCheckResult || null,
        current,
        anonymous: api?.security?.isAnonymous ? api.security.isAnonymous() : null,
        currentProject: window.__currentProject || null,
        loginDisplay: sequence ? getComputedStyle(sequence).display : null,
        choiceDisplay: choice ? getComputedStyle(choice).display : null,
        hasProjectCanvas: !!projectCanvas,
        projectCanvasVisibility: projectCanvas ? getComputedStyle(projectCanvas).visibility : null
    };
});

const runScenario = async () => {
    const report = {
        ok: false,
        appUrl: APP_URL,
        phone: PHONE,
        checks: [],
        console: [],
        pageErrors: [],
        requestFailures: []
    };
    const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const page = await context.newPage();
    page.on('console', (message) => {
        if (message.type() === 'error') report.console.push(message.text());
    });
    page.on('pageerror', (error) => {
        const message = error?.message || String(error);
        if (!/^unreachable$/i.test(message)) report.pageErrors.push(message);
    });
    page.on('requestfailed', (request) => {
        const url = request.url();
        if (/\/(?:favicon|apple-touch-icon)[^/]*\.(?:ico|png)$/i.test(url)) return;
        report.requestFailures.push({ url, failure: request.failure()?.errorText || null });
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitForChoice(page);
        await submitLogin(page, PHONE, PASSWORD);
        const created = await waitForAuthenticatedProject(page, false);
        if (!created.ok) throw new Error('new_phone_bootstrap_failed');
        report.checks.push({ name: 'new_phone_creates_account', ok: true, snapshot: await collectSnapshot(page) });

        await logoutViaUi(page);
        await submitLogin(page, PHONE, WRONG_PASSWORD);
        await sleep(900);
        const wrongPasswordSnapshot = await collectSnapshot(page);
        if (wrongPasswordSnapshot.loginDisplay === 'none') {
            throw new Error('wrong_password_closed_login');
        }
        report.checks.push({ name: 'existing_phone_wrong_password_stays_on_login', ok: true, snapshot: wrongPasswordSnapshot });

        await submitLogin(page, PHONE, PASSWORD);
        const loggedIn = await waitForAuthenticatedProject(page, false);
        if (!loggedIn.ok) throw new Error('existing_phone_good_password_failed');
        report.checks.push({ name: 'existing_phone_good_password_logs_in', ok: true, snapshot: await collectSnapshot(page) });

        await context.close();

        const guestContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
        const guestPage = await guestContext.newPage();
        guestPage.on('console', (message) => {
            if (message.type() === 'error') report.console.push(message.text());
        });
        guestPage.on('pageerror', (error) => {
            const message = error?.message || String(error);
            if (!/^unreachable$/i.test(message)) report.pageErrors.push(message);
        });
        guestPage.on('requestfailed', (request) => {
            const url = request.url();
            if (/\/(?:favicon|apple-touch-icon)[^/]*\.(?:ico|png)$/i.test(url)) return;
            report.requestFailures.push({ url, failure: request.failure()?.errorText || null });
        });
        await guestPage.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitForChoice(guestPage);
        await guestPage.locator('#eve_login_sequence__choice_without_account').first().click({ timeout: 8000 });
        const guestReady = await waitForAuthenticatedProject(guestPage, true);
        if (!guestReady.ok) throw new Error('guest_workspace_failed');
        report.checks.push({ name: 'guest_enters_desktop', ok: true, snapshot: await collectSnapshot(guestPage) });
        const guestToolbar = await waitForGuestToolbar(guestPage);
        if (!guestToolbar.ok) throw new Error('guest_toolbar_home_missing');
        const visibleToolIds = await collectVisibleToolIds(guestPage);
        report.checks.push({ name: 'guest_toolbar_available', ok: true, visibleToolIds, guestToolbar });
        await openUserPanel(guestPage);
        report.checks.push({
            name: 'guest_user_panel_opens',
            ok: true,
            snapshot: await guestPage.evaluate(() => {
                const root = document.getElementById('eve_user_dialog');
                const logout = document.getElementById('eve_user_dialog__actions__logout');
                const login = document.getElementById('eve_user_dialog__actions__login');
                const deleteButton = document.getElementById('eve_user_dialog__actions__delete');
                return {
                    rootDisplay: root ? getComputedStyle(root).display : null,
                    logoutDisplay: logout ? getComputedStyle(logout).display : null,
                    logoutText: logout?.textContent?.trim() || '',
                    loginDisplay: login ? getComputedStyle(login).display : null,
                    deleteDisplay: deleteButton ? getComputedStyle(deleteButton).display : null
                };
            })
        });
        await closeUserPanel(guestPage);
        const flowerItems = await openGuestFlowerMenu(guestPage);
        if (!flowerItems.some((entry) => entry.key === 'import' && entry.visible)) throw new Error('guest_flower_import_missing');
        report.checks.push({ name: 'guest_flower_menu_opens', ok: true, flowerItems });
        await guestPage.mouse.click(12, 12);
        await sleep(400);
        const flowerImport = await importViaGuestFlower(guestPage);
        if (!flowerImport.imported.ok) throw new Error('guest_flower_import_failed');
        report.checks.push({ name: 'guest_flower_import_creates_atome', ok: true, flowerImport });
        const textEdit = await createTextAndEditByDoubleClick(guestPage);
        if (!textEdit.typed.ok) throw new Error('guest_text_double_click_edit_failed');
        report.checks.push({ name: 'guest_text_double_click_edit_works', ok: true, textEdit });
        await guestContext.close();

        if (report.console.length || report.pageErrors.length || report.requestFailures.length) {
            throw new Error('browser_errors_detected');
        }
        report.ok = true;
    } catch (error) {
        report.error = error?.message || String(error);
        try {
            report.failureSnapshot = await collectSnapshot(page);
        } catch (_) {
            report.failureSnapshot = null;
        }
    } finally {
        await browser.close();
        writeReport(report);
    }
    if (!report.ok) {
        throw new Error(report.error || 'user_login_guest_real_ui_probe_failed');
    }
};

await runScenario();
