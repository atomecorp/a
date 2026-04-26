import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
const username = process.env.ADOLE_TEST_USERNAME || phone;
const projectName = process.env.ADOLE_TEST_PROJECT_NAME || 'Atome Persistence Probe';
const createMissingUser = process.env.ADOLE_TEST_CREATE_USER === '1';
const outDir = path.resolve('tools/headless_output');
const outFile = path.join(outDir, 'atome_persistence_probe.json');

fs.mkdirSync(outDir, { recursive: true });

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 250) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      if (await page.evaluate(predicate)) return true;
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
      // Retry until the page runtime is ready.
    }
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const readPersistence = async (page, label) => {
  const snapshot = await page.evaluate(async (snapshotLabel) => {
    if (!window.__DEBUG__?.getPersistenceState) {
      return { ok: false, label: snapshotLabel, error: 'debug_persistence_state_unavailable' };
    }
    const state = await window.__DEBUG__.getPersistenceState();
    return { label: snapshotLabel, ...state };
  }, label);
  return snapshot;
};

const idsFromSnapshot = (snapshot) => {
  const objects = Array.isArray(snapshot?.objects) ? snapshot.objects : [];
  return new Set(objects.map((entry) => String(entry?.atome_id || '')).filter(Boolean));
};

const stateIdsFromSnapshot = (snapshot) => {
  const records = Array.isArray(snapshot?.stateCurrent) ? snapshot.stateCurrent : [];
  return new Set(records.map((entry) => String(entry?.atome_id || '')).filter(Boolean));
};

const prepareSession = async (page) => {
  return page.evaluate(async (input) => {
    const api = window.AdoleAPI || null;
    const isSuccess = (res) => !!(res?.ok || res?.success || res?.tauri?.success || res?.fastify?.success);
    const readProjectId = (entry) => String(entry?.id || entry?.atome_id || '').trim();
    const readProjectName = (entry) => {
      const props = entry?.properties || entry?.particles || entry?.data || {};
      return String(entry?.name || props.name || '').trim();
    };
    const readOwnerId = (entry) => {
      const props = entry?.properties || entry?.particles || entry?.data || {};
      return String(entry?.owner_id || entry?.ownerId || props.owner_id || props.ownerId || '').trim();
    };
    const projectList = (result) => [
      ...(Array.isArray(result?.tauri?.projects) ? result.tauri.projects : []),
      ...(Array.isArray(result?.fastify?.projects) ? result.fastify.projects : [])
    ];

    if (!api?.auth?.login || !api?.projects?.list || !api?.projects?.setCurrent) {
      return { ok: false, error: 'required_api_unavailable' };
    }

    let authInfo = api.auth.getCurrentInfo?.() || null;
    let authenticated = !!(api.auth.isAuthenticated?.() || authInfo?.user_id || authInfo?.id);
    let loginResult = null;
    let createUserResult = null;
    if (!authenticated) {
      loginResult = await api.auth.login(input.phone, input.password, input.username);
      authenticated = isSuccess(loginResult) || !!api.auth.isAuthenticated?.();
      if (!authenticated && input.createMissingUser && typeof api.auth.create === 'function') {
        createUserResult = await api.auth.create(input.phone, input.password, input.username, { autoLogin: true });
        authenticated = isSuccess(createUserResult) || !!api.auth.isAuthenticated?.();
        if (!authenticated) {
          loginResult = await api.auth.login(input.phone, input.password, input.username);
          authenticated = isSuccess(loginResult) || !!api.auth.isAuthenticated?.();
        }
      }
    }
    if (!authenticated) {
      return { ok: false, error: 'auth_failed', loginResult, createUserResult };
    }

    authInfo = api.auth.getCurrentInfo?.() || authInfo || null;
    let projectsResult = await api.projects.list();
    let projects = projectList(projectsResult);
    let targetProject = projects.find((entry) => readProjectName(entry) === input.projectName) || projects[0] || null;

    if (!targetProject && typeof api.projects.create === 'function') {
      await api.projects.create(input.projectName);
      projectsResult = await api.projects.list();
      projects = projectList(projectsResult);
      targetProject = projects.find((entry) => readProjectName(entry) === input.projectName) || projects[0] || null;
    }

    const projectId = readProjectId(targetProject);
    if (!projectId) return { ok: false, error: 'project_unavailable', authInfo, projectsResult };

    await api.projects.setCurrent(projectId, readProjectName(targetProject) || input.projectName, readOwnerId(targetProject) || null, true);
    if (window.eveToolBase?.loadProjectAtomes) {
      await window.eveToolBase.loadProjectAtomes(projectId, { force: true }).catch(() => {});
    }

    return {
      ok: true,
      authInfo: api.auth.getCurrentInfo?.() || authInfo || null,
      project: {
        id: projectId,
        name: readProjectName(targetProject) || input.projectName,
        owner_id: readOwnerId(targetProject) || null
      },
      loginResult,
      createUserResult
    };
  }, { phone, password, username, projectName, createMissingUser });
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    console: [],
    errors: []
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    report.console.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => {
    report.errors.push({ type: 'pageerror', message: error?.message || String(error) });
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 1365, height: 900 });

    const debugReady = await waitFor(page, () => !!window.__DEBUG__?.getPersistenceState, 25000);
    report.debugReady = debugReady;
    if (!debugReady) throw new Error('debug_surface_unavailable');

    await page.evaluate(() => window.__DEBUG__.setDeterministicTestMode?.(true));

    report.session = await prepareSession(page);
    if (!report.session?.ok) throw new Error(report.session?.error || 'session_prepare_failed');
    await page.waitForTimeout(1000);

    const before = await readPersistence(page, 'before_create');
    report.before = before;

    const beforeDomIds = idsFromSnapshot(before);
    const beforeStateIds = stateIdsFromSnapshot(before);

    const createResult = await page.evaluate(async () => {
      if (!window.eveDebugTools?.createRandomAtome) {
        return { ok: false, error: 'random_atome_tool_unavailable' };
      }
      return window.eveDebugTools.createRandomAtome();
    });
    report.createResult = createResult;

    await waitFor(page, () => {
      const objects = window.__DEBUG__?.getObjectTree?.(1000) || [];
      return objects.some((entry) => String(entry?.atome_id || '').startsWith('atome_'));
    }, 15000);
    await page.waitForTimeout(1000);

    const afterCreate = await readPersistence(page, 'after_create');
    report.afterCreate = afterCreate;

    const afterDomIds = idsFromSnapshot(afterCreate);
    const afterStateIds = stateIdsFromSnapshot(afterCreate);
    const newDomIds = Array.from(afterDomIds).filter((id) => !beforeDomIds.has(id));
    const newStateIds = Array.from(afterStateIds).filter((id) => !beforeStateIds.has(id));
    const candidateIds = Array.from(new Set([...newDomIds, ...newStateIds]));
    report.newDomIds = newDomIds;
    report.newStateIds = newStateIds;
    report.candidateIds = candidateIds;

    if (!candidateIds.length) {
      throw new Error('created_atome_id_not_detected');
    }

    await page.reload({ waitUntil: 'networkidle' });
    const debugReadyAfterReload = await waitFor(page, () => !!window.__DEBUG__?.getPersistenceState, 25000);
    report.debugReadyAfterReload = debugReadyAfterReload;
    if (!debugReadyAfterReload) throw new Error('debug_surface_unavailable_after_reload');
    await page.waitForTimeout(1500);

    const afterReload = await readPersistence(page, 'after_reload');
    report.afterReload = afterReload;

    const reloadDomIds = idsFromSnapshot(afterReload);
    const reloadStateIds = stateIdsFromSnapshot(afterReload);
    report.candidateStatus = candidateIds.map((id) => ({
      id,
      inDomAfterCreate: afterDomIds.has(id),
      inStateAfterCreate: afterStateIds.has(id),
      inDomAfterReload: reloadDomIds.has(id),
      inStateAfterReload: reloadStateIds.has(id)
    }));

    const persisted = report.candidateStatus.some((entry) => entry.inDomAfterReload && entry.inStateAfterReload);
    report.ok = persisted;
    if (!persisted) {
      throw new Error('created_atome_missing_after_reload');
    }
  } finally {
    await browser.close().catch(() => {});
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  }
};

run().catch((error) => {
  const message = error?.message || String(error);
  try {
    const existing = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
    existing.ok = false;
    existing.fatal = message;
    fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
  } catch (error) {
        console.warn("[cleanup] operation failed", error);
    // Ignore reporting failures; the process exit code carries the failure.
  }
  console.error(message);
  process.exit(1);
});
