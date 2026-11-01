import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { Script } from 'node:vm';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();
const probe = { clears: 0, api: { security: { isAnonymous: () => false } } };
// Keep the actual subscription/reset owner and its shared state; isolate rendering,
// project persistence and profile services, none of which a renewal should start.
const fixtures = {
    'project_security.js': 'export const pickAuthoritativeProjects=()=>[]; export const resolveProjectMeta=()=>null; export const extractProjectOwnerId=()=>null; export const getCurrentUserId=()=>"owner";',
    'project_default_name.js': 'export const createTimestampedProjectName=()=>"fixture";',
    'project_creation_view_properties.js': 'export const projectCreationViewProperties=()=>({});',
    'workspace_surface_preference.js': 'export const readStartupView=()=>"project"; export const resolveWorkspaceSurfacePreference=async()=>{}; export const waitForWorkspaceSurfacePreference=async()=>{};',
    'project_bootstrap_projects.js': 'export const syncActiveProjectFlag=()=>{}; export const seedAnonymousProject=()=>{}; export const ensureAnonymousProjectSeeded=()=>{}; export const migrateAnonymousWelcomeText=()=>{}; export const findRenderableProjectFromStateCurrent=()=>null; export const persistCurrentProjectId=()=>{}; export const ensureProjectView=()=>{}; export const selectMostRecentProject=()=>null;',
    'project_bootstrap_support.js': `export const bootstrapPerfNowMs=()=>0, bootstrapPerfElapsedMs=()=>0, bootstrapPerfLog=()=>{}, bootstrapDebugLog=()=>{}, toErrorMessage=String;
        export const waitForAuthCheck=async()=>window.__authCheckResult, getAdoleApi=()=>probe.api;
        export const normalizeAuthBootstrapDetail=(detail={})=>({userId:detail.userId||detail.user_id||null,anonymous:detail.anonymous===true});
        export const isAnonymousWorkspace=()=>false, getAnonymousProjectName=()=>"fixture", extractAtomeId=()=>null, extractUserId=()=>null;
        export const clearProjectView=()=>{probe.clears++;};`
};
const compiled = await build({ entryPoints: ['eVe/intuition/tools/project_bootstrap.js'], bundle: true,
    write: false, platform: 'browser', format: 'iife', plugins: [{ name: 'bootstrap-service-boundaries', setup(builder) {
        if (process.env.ATOME_BOOTSTRAP_PROBE_SOURCE) builder.onLoad({ filter: /\/project_bootstrap\.js$/ }, args => ({
            contents: readFileSync(process.env.ATOME_BOOTSTRAP_PROBE_SOURCE, 'utf8'), resolveDir: new URL('../../eVe/intuition/tools/', import.meta.url).pathname
        }));
        builder.onResolve({ filter: /\.js$/ }, args => {
            const name = args.path.split('/').at(-1);
            return fixtures[name] ? { path: name, namespace: 'bootstrap-fixture' } : undefined;
        });
        builder.onLoad({ filter: /.*/, namespace: 'bootstrap-fixture' }, args => ({ contents: fixtures[args.path] }));
    } }] });
try {
    window.__authCheckComplete = true;
    window.__authCheckResult = { authenticated: true, userId: 'owner', anonymous: false };
    window.__currentProject = { id: 'active', userId: 'owner' };
    // Activation preceded this lazy import; the initial auth event was missed.
    new Script(compiled.outputFiles[0].text).runInNewContext({ window, document, probe, CustomEvent: window.CustomEvent });
    window.dispatchEvent(new window.CustomEvent('squirrel:user-logged-in', { detail: { userId: 'owner', anonymous: false } }));
    assert.equal(window.__currentProject?.id, 'active', 'renewal must preserve the active project');
    assert.equal(probe.clears, 0, 'renewal must not clear the active workspace');
    window.dispatchEvent(new window.CustomEvent('squirrel:auth-checked', { detail: { authenticated: true, userId: 'owner' } }));
    window.dispatchEvent(new window.CustomEvent('squirrel:user-logged-in', { detail: { userId: 'other', anonymous: false } }));
    assert.equal(window.__currentProject, undefined, 'another principal must invalidate the old project');
    assert.equal(probe.clears, 1);
    window.__currentProject = { id: 'other-project', userId: 'other' };
    window.dispatchEvent(new window.CustomEvent('squirrel:user-logged-out', { detail: { reason: 'logout' } }));
    assert.equal(window.__currentProject, undefined, 'logout must still invalidate the project');
    assert.equal(probe.clears, 2);
    console.log('project_bootstrap_session_renewal: PASS');
} finally { window.close(); }
