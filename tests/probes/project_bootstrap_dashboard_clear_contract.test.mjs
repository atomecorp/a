import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
import {
    DASHBOARD_WORKSPACE_HOST_ID,
    DASHBOARD_WORKSPACE_PROJECT_ID
} from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';

const { window, document } = installMockBrowserEnv();
globalThis.CustomEvent = window.CustomEvent;

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

const dashboardHost = document.createElement('div');
dashboardHost.id = DASHBOARD_WORKSPACE_HOST_ID;
const dashboardCanvas = document.createElement('canvas');
dashboardCanvas.id = 'eve_surface_project';
dashboardHost.appendChild(dashboardCanvas);
view.appendChild(dashboardHost);

const userProjectHost = document.createElement('div');
userProjectHost.id = 'project_view_user_project';
view.appendChild(userProjectHost);

window.eveDashboardBevyUiRuntime = {
    state: {
        active: true,
        projectId: DASHBOARD_WORKSPACE_PROJECT_ID
    }
};

const { clearProjectView } = await import('../../eVe/intuition/tools/project_bootstrap_support.js');

clearProjectView({ preserveDashboardWorkspace: true });
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(
    document.getElementById(DASHBOARD_WORKSPACE_HOST_ID),
    dashboardHost,
    'dashboard startup cleanup must preserve the neutral dashboard host'
);
assert.equal(
    document.getElementById('eve_surface_project'),
    dashboardCanvas,
    'dashboard startup cleanup must preserve the shared canvas inside the neutral dashboard host'
);
assert.equal(
    dashboardCanvas.parentElement,
    dashboardHost,
    'dashboard startup cleanup must not move the neutral dashboard canvas back to #view'
);
assert.equal(
    document.getElementById('project_view_user_project'),
    null,
    'dashboard startup cleanup must still remove user project hosts'
);
assert.notEqual(
    dashboardCanvas.style.visibility,
    'hidden',
    'dashboard startup cleanup must not hide the active neutral dashboard surface'
);

const bootstrapSource = readFileSync(
    new URL('../../eVe/intuition/tools/project_bootstrap.js', import.meta.url),
    'utf8'
);
assert.match(
    bootstrapSource,
    /clearProjectView\(\{\s*preserveDashboardWorkspace:\s*readStartupView\(\)\s*!==\s*['"]project['"]\s*\}\);/,
    'unauthenticated or late-auth bootstrap cleanup must preserve the neutral Dashboard workspace in dashboard startup mode'
);

console.log('project_bootstrap_dashboard_clear_contract.test: PASS');
