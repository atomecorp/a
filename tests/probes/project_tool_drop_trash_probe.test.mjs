import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const URL = process.env.PROBE_URL || 'http://localhost:3001/';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];

page.on('pageerror', (error) => {
  pageErrors.push(String(error?.message || error));
});

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.eveToolBase && !!window.Atome, null, { timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector('#eve_intuitionx_main_ribbon'), null, { timeout: 30000 });

  const setup = await page.evaluate(async ({ phone, password }) => {
    window.__DEBUG__?.setDeterministicTestMode?.(true);
    await import('/eVe/intuition/tools/project_drop.js');
    await import('/eVe/intuition/tools/delete.js');
    const shortcutModule = await import('/eVe/intuition/shared/tool_shortcut_visual.js');
    const api = window.AdoleAPI;
    if (!api?.auth?.login || !api?.projects?.list || !api?.projects?.setCurrent) {
      return { ok: false, error: 'project_api_missing' };
    }

    const isSuccess = (result) => !!(
      result?.fastify?.success
      || result?.tauri?.success
      || result?.success
      || result?.ok
    );
    const readList = (result) => [
      ...(Array.isArray(result?.projects) ? result.projects : []),
      ...(Array.isArray(result?.tauri?.projects) ? result.tauri.projects : []),
      ...(Array.isArray(result?.fastify?.projects) ? result.fastify.projects : [])
    ];
    const readProjectName = (project) => String(
      project?.properties?.name
      || project?.particles?.name
      || project?.data?.name
      || project?.name
      || ''
    ).trim();
    const readProjectId = (project) => String(project?.id || project?.atome_id || project?.properties?.atome_id || '').trim();

    let loginResult = await api.auth.login(phone, password, phone).catch((error) => ({ error: String(error?.message || error) }));
    if (!isSuccess(loginResult) && typeof api.auth.create === 'function') {
      await api.auth.create(phone, password, phone, 'public').catch(() => null);
      loginResult = await api.auth.login(phone, password, phone).catch((error) => ({ error: String(error?.message || error) }));
    }

    const preferredName = 'project_tool_drop_trash_probe';
    let projects = readList(await api.projects.list());
    let project = projects.find((entry) => readProjectName(entry) === preferredName) || projects[0] || null;
    if (!project && typeof api.projects.create === 'function') {
      await api.projects.create(preferredName);
      projects = readList(await api.projects.list());
      project = projects.find((entry) => readProjectName(entry) === preferredName) || projects[0] || null;
    }
    const projectId = readProjectId(project);
    if (!projectId) return { ok: false, error: 'project_missing' };

    await api.projects.setCurrent(projectId, readProjectName(project) || preferredName, project?.owner_id || project?.ownerId || null, true);
    await window.eveToolBase.loadProjectAtomes?.(projectId, { force: true }).catch(() => null);

    const spec = shortcutModule.buildToolShortcutCreateSpec({
      projectId,
      left: 260,
      top: 220,
      label: 'Probe Delete',
      toolId: 'ui.delete.selection',
      toolNameKey: 'delete',
      toolIcon: './assets/images/icons/delete.svg',
      toolActionMode: 'momentary',
      mountLayer: 'intuition'
    });
    const created = await window.eveToolBase.createAtome(spec);
    const createdId = String(created?.atome_id || created?.atomeId || created?.id || spec.id || '').trim();
    await window.eveToolBase.loadProjectAtomes?.(projectId, { force: true }).catch(() => null);
    return { ok: !!createdId, projectId, createdId };
  }, { phone: PHONE, password: PASSWORD });

  assert.equal(setup.ok, true, setup.error || 'setup_failed');
  await page.waitForFunction((id) => !!document.querySelector(`[data-atome-id="${id}"]`), setup.createdId, { timeout: 30000 });
  await page.waitForTimeout(300);

  const geometry = await page.evaluate((createdId) => {
    const host = document.querySelector(`[data-atome-id="${createdId}"]`);
    const button = host?.querySelector?.('[data-eve-tool-projection="true"]') || host;
    const handle = document.querySelector('#eve_intuitionx_main_ribbon [data-role="eve_intuitionx-handle"]');
    const buttonRect = button?.getBoundingClientRect?.();
    const handleRect = handle?.getBoundingClientRect?.();
    return {
      buttonRect: buttonRect ? { left: buttonRect.left, top: buttonRect.top, width: buttonRect.width, height: buttonRect.height } : null,
      handleRect: handleRect ? { left: handleRect.left, top: handleRect.top, width: handleRect.width, height: handleRect.height } : null
    };
  }, setup.createdId);

  assert.ok(geometry.buttonRect, 'tool_shortcut_button_missing');
  assert.ok(geometry.handleRect, 'main_toolbar_handle_missing');

  const start = {
    x: geometry.buttonRect.left + geometry.buttonRect.width / 2,
    y: geometry.buttonRect.top + geometry.buttonRect.height / 2
  };
  const end = {
    x: geometry.handleRect.left + geometry.handleRect.width / 2,
    y: geometry.handleRect.top + geometry.handleRect.height / 2
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 8 });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);

  const result = await page.evaluate(async (createdId) => {
    const state = await window.Atome.getStateCurrent(createdId).catch((error) => ({ error: String(error?.message || error) }));
    return {
      hostStillPresent: !!document.querySelector(`[data-atome-id="${createdId}"]`),
      state
    };
  }, setup.createdId);

  assert.equal(result.hostStillPresent, false, 'tool_shortcut_still_visible_after_trash_drop');
  assert.equal(result.state?.properties?.__deleted, true, 'tool_shortcut_not_soft_deleted');
  assert.ok(result.state?.properties?.deleted_at, 'tool_shortcut_deleted_at_missing');
  assert.equal(pageErrors.length, 0, `page_errors:${pageErrors.join('\n')}`);
} finally {
  await browser.close();
}
