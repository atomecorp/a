import assert from "node:assert/strict";
import fs from "node:fs";
import { test, vi } from "vitest";
import { repairBootstrapPhoneProfile, repairLegacyRemoteProfile } from "../../eVe/domains/user/profile_api_support.js";
import { loadUserProfile, upsertUserProfile } from "../../eVe/domains/user/profile_api.js";
import { applyHomeServerPreference, createHomeSectionSubscriptions } from "../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js";
import { homeSurface } from "../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js";
import { FastifyAdapter, TauriAdapter } from "../../atome/src/squirrel/apis/unified/adole.js";
import { classifyRetryableMutationException, classifyRetryableMutationResult } from "../../eVe/intuition/tools/core/tool_registry_mutations.js";

test('Home applies a validated server through the existing HTTP/WebSocket and reconnect owners', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const records = new Map();
    globalThis.window = {
        location: {
            protocol: 'asset:',
            hostname: 'workspace.example',
            href: 'asset://workspace.example/',
            origin: 'null'
        },
        localStorage: {
            getItem: (key) => records.get(String(key)) || null,
            setItem: (key, value) => records.set(String(key), String(value))
        },
        Squirrel: {
            SyncEngine: {
                clearFastifyAvailabilityCache: () => calls.push('clear'),
                disconnect: () => calls.push('disconnect'),
                retry: () => calls.push('retry'),
                getState: () => ({ connected: true })
            }
        },
        RemoteCommands: {
            stop: () => calls.push('remote-stop'),
            start: async (userId) => calls.push(`remote-start:${userId}`),
            getCurrentUserId: () => 'server-user'
        }
    };
    try {
        const result = await applyHomeServerPreference({ mode: 'custom', customBase: 'server.example/' });
        assert.equal(result.ok, true);
        assert.equal(result.selected, 'https://server.example');
        assert.equal(globalThis.window.__SQUIRREL_FASTIFY_URL__, 'https://server.example');
        assert.match(globalThis.window.__SQUIRREL_FASTIFY_WS_API_URL__, /^wss:\/\/server\.example\//);
        assert.deepEqual(calls, ['clear', 'disconnect', 'retry', 'remote-stop', 'remote-start:server-user']);
        assert.equal(records.get('squirrel_tauri_fastify_url_override'), 'https://server.example');

        globalThis.window.__SQUIRREL_FORCE_TAURI_RUNTIME__ = true;
        globalThis.window.__SQUIRREL_TAURI_LOCAL_PORT__ = 3000;
        assert.deepEqual(await applyHomeServerPreference({ mode: 'custom', customBase: 'http://localhost:3000' }), {
            ok: false,
            error: 'home_server_rejected'
        });
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Home section services subscribe only while their lazy subsection is active', () => {
    const previousWindow = globalThis.window;
    const target = new EventTarget();
    const counts = new Map();
    target.addEventListener = (type, handler) => {
        counts.set(type, (counts.get(type) || 0) + 1);
        EventTarget.prototype.addEventListener.call(target, type, handler);
    };
    target.removeEventListener = (type, handler) => {
        counts.set(type, (counts.get(type) || 0) - 1);
        EventTarget.prototype.removeEventListener.call(target, type, handler);
    };
    globalThis.window = target;
    try {
        const subscriptions = createHomeSectionSubscriptions({ onBackgroundResult: () => {}, onServerState: () => {} });
        assert.equal(counts.size, 0);
        subscriptions.background(true);
        subscriptions.server(true);
        assert.equal(counts.get('eve:background-action-result'), 1);
        assert.equal(counts.get('squirrel:sync-ready'), 1);
        subscriptions.release();
        assert.ok(Array.from(counts.values()).every((count) => count === 0));
    } finally {
        globalThis.window = previousWindow;
    }
});

test('legacy bootstrap phone aliases are repaired through one canonical profile commit on each backend', async () => {
    for (const backend of ['tauri', 'fastify']) {
        const commits = [];
        const repaired = await repairBootstrapPhoneProfile({
            backend,
            userId: `phone_alias_user_${backend}`,
            properties: { name: '+33123456789', username: '+33123456789', phone: '+33 1 23 45 67 89' },
            profile: {},
            commit: async (payload, options) => {
                commits.push({ payload, options });
                return { ok: true };
            }
        });
        assert.equal(repaired.profile.name, '');
        assert.equal(repaired.profile.phone, '+33123456789');
        assert.match(repaired.profile.username, /^user_/);
        assert.notEqual(repaired.profile.username, repaired.profile.phone);
        assert.equal(repaired.properties.name, '');
        assert.equal(repaired.properties.username, repaired.profile.username);
        assert.equal(commits.length, 1);
        assert.equal(commits[0].payload.actor.id, `phone_alias_user_${backend}`);
        assert.equal(commits[0].options.backend, backend);
    }
    assert.equal(await repairBootstrapPhoneProfile({
        backend: 'tauri', userId: 'named_user',
        properties: { name: 'Ada', username: '+33123456789', phone: '+33123456789' },
        profile: { name: 'Ada' }, commit: async () => ({ ok: true })
    }), null);
});

test('guest tool bootstrap keeps the local registry when no remote account is provisioned', () => {
    assert.equal(classifyRetryableMutationException(new Error('remote_account_not_provisioned')), 'access_denied');
    assert.equal(classifyRetryableMutationResult({ error: 'remote_account_not_provisioned' }), 'access_denied');
});

test('legacy Home DOM owners remain deleted and the route never names eve_user_dialog', () => {
    const deleted = [
        'user_dialogs_runtime.js',
        'user_identity_fields_runtime.js',
        'user_profile_sections_runtime.js',
        'user_photo_runtime.js',
        'user_action_buttons_runtime.js',
        'user_profile_lifecycle_runtime.js'
    ];
    deleted.forEach((file) => assert.equal(fs.existsSync(`eVe/intuition/tools/${file}`), false, file));
    const definitions = fs.readFileSync('eVe/intuition/panel_definitions.js', 'utf8');
    const userModule = fs.readFileSync('eVe/intuition/tools/user.js', 'utf8');
    const routeModule = fs.readFileSync('eVe/intuition/tools/user_home_panel_runtime.js', 'utf8');
    const commonSurfaces = fs.readFileSync('eVe/intuition/runtime/bevy_panel/bevy_panel_surfaces.js', 'utf8');
    const actionsModule = fs.readFileSync('eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js', 'utf8');
    const homeRuntime = fs.readFileSync('eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js', 'utf8');
    const commonPanelRuntime = fs.readFileSync('eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', 'utf8');
    assert.doesNotMatch(definitions, /eve_user_dialog/);
    assert.match(definitions, /runtime_owner: 'window'/);
    assert.match(definitions, /surface_key: useWindowOwner \? '' : def\.surface_key/);
    assert.doesNotMatch(userModule, /createEveDialog|createElement\(|innerHTML|querySelector/);
    assert.match(userModule, /bevy_panel_home_runtime\.js/);
    assert.match(userModule, /registerBevyPanelSurface\(homeSurface\)/);
    assert.doesNotMatch(userModule, /^import .*user_workspace_(runtime|surface_runtime)\.js/m);
    assert.match(userModule, /import\('\.\/user_workspace_runtime\.js'\)/);
    assert.match(userModule, /import\('\.\/user_workspace_surface_runtime\.js'\)/);
    assert.doesNotMatch(commonPanelRuntime, /^import .*workspace_main_menu_visibility\.js/m);
    assert.match(commonPanelRuntime, /import\('\.\.\/\.\.\/tools\/workspace_main_menu_visibility\.js'\)/);
    assert.doesNotMatch(commonSurfaces, /bevy_panel_(home|contact|lab)/);
    assert.doesNotMatch(actionsModule, /^import .*profile_api|^import .*dashboard_defaults|^import .*loadServerConfig/m);
    assert.doesNotMatch(homeRuntime, /^import .*home_vault|^import .*project_media_import_runtime/m);
    assert.match(routeModule, /api\.security\.startGuest\(\{ force: true \}\)/);
    assert.match(routeModule, /syncLoginToolState\(false, 'first_launch_complete'\)/);
    assert.match(routeModule, /syncLoginToolState\(false, 'authenticated_workspace'\)/);
});

test('Home reboot keeps public access and photo on the principal owned by the configured profile backend', async () => {
    const previousWindow = globalThis.window;
    const previousApi = globalThis.AdoleAPI;
    const originalMe = TauriAdapter.auth.me;
    const originalGetStateCurrent = TauriAdapter.atome.getStateCurrent;
    const originalFastifyMe = FastifyAdapter.auth.me;
    const originalFastifyGetStateCurrent = FastifyAdapter.atome.getStateCurrent;
    const commits = [];
    TauriAdapter.auth.me = async () => ({
        ok: true,
        user: { id: 'local_profile_principal', username: 'Local identity' }
    });
    TauriAdapter.atome.getStateCurrent = async (id) => ({
        ok: true,
        data: {
            state: {
                atome_id: id,
                property_versions: { eve_profile: 1 },
                properties: {
                    eve_profile: {
                        name: 'Local identity',
                        access: 'public'
                    }
                }
            }
        }
    });
    FastifyAdapter.auth.me = async () => ({
        ok: true,
        user: { id: 'remote_session_principal', username: 'Remote identity' }
    });
    FastifyAdapter.atome.getStateCurrent = async (id) => ({
        ok: true,
        data: {
            state: {
                atome_id: id,
                properties: {
                    eve_profile: {
                        name: 'Persisted name',
                        access: 'public',
                        user_face: 'data:image/png;base64,persisted'
                    }
                }
            }
        }
    });
    const api = {
        auth: {
            current: async () => ({
                logged: true,
                source: 'fastify',
                user: { id: 'remote_session_principal', username: 'Remote identity' }
            }),
            ensureFastifyToken: async () => ({ ok: true })
        },
        atomes: {},
        security: { isAnonymous: () => false }
    };
    globalThis.window = {
        __SQUIRREL_FORCE_TAURI_RUNTIME__: true,
        __SQUIRREL_PROFILE_SOURCE__: 'tauri',
        AdoleAPI: api,
        Atome: {
            commit: async (payload, options) => {
                commits.push({ payload, options });
                return { ok: true };
            }
        }
    };
    globalThis.AdoleAPI = api;
    try {
        const intentionalRemoval = await repairLegacyRemoteProfile({
            backend: 'tauri',
            userId: 'local_profile_principal',
            user: { name: 'Local identity' },
            profile: { name: 'Custom local name', user_face: '' },
            commit: globalThis.window.Atome.commit
        });
        assert.equal(intentionalRemoval, null);
        assert.equal(commits.length, 0);

        const ensureToken = api.auth.ensureFastifyToken;
        api.auth.ensureFastifyToken = () => { throw new Error('remote access must not block local Home'); };
        const localOnly = await loadUserProfile(null, { repair: false });
        assert.equal(localOnly.ok, true);
        assert.equal(localOnly.userId, 'local_profile_principal');
        assert.equal(commits.length, 0);
        api.auth.ensureFastifyToken = ensureToken;
        const loaded = await loadUserProfile();
        assert.equal(loaded.ok, true);
        assert.equal(loaded.userId, 'local_profile_principal');
        assert.equal(loaded.profile.access, 'public');
        assert.equal(loaded.profile.user_face, undefined, 'the local profile returns before optional remote reconciliation');
        await vi.waitFor(() => assert.equal(commits.length, 1));
        assert.equal(commits[0].payload.atome_id, 'local_profile_principal');
        assert.equal(commits[0].payload.props.eve_profile.name, 'Persisted name');

        const updated = await upsertUserProfile({ ...commits[0].payload.props.eve_profile,
            user_face: commits[0].payload.props.user_face }, { allowCreate: false });
        assert.equal(updated.ok, true);
        assert.equal(updated.userId, 'local_profile_principal');
        assert.equal(commits.length, 2);
        assert.equal(commits[1].payload.atome_id, 'local_profile_principal');
        assert.equal(commits[1].payload.actor.id, 'local_profile_principal');
        assert.equal(commits[1].options.backend, 'tauri');

        TauriAdapter.atome.getStateCurrent = async () => ({ ok: false, error: 'state not found' });
        const refused = await loadUserProfile();
        assert.equal(refused.ok, false);
        assert.equal(refused.error, 'state not found');
    } finally {
        TauriAdapter.auth.me = originalMe;
        TauriAdapter.atome.getStateCurrent = originalGetStateCurrent;
        FastifyAdapter.auth.me = originalFastifyMe;
        FastifyAdapter.atome.getStateCurrent = originalFastifyGetStateCurrent;
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        if (previousApi === undefined) delete globalThis.AdoleAPI;
        else globalThis.AdoleAPI = previousApi;
    }
});

test('a native profile read returns local data while optional historical recovery has no response', async () => {
    const previousWindow = globalThis.window, previousGet = TauriAdapter.atome.getStateCurrent;
    const { loadResolvedProfileState } = await import('../../eVe/domains/user/profile_api_support.js');
    let release;
    const api = { auth: { current: async () => ({ logged: true, source: 'tauri', user: { id: 'local-offline-profile' } }),
        ensureFastifyToken: () => new Promise(resolve => { release = resolve; }) } };
    globalThis.window = { __SQUIRREL_FORCE_TAURI_RUNTIME__: true, __SQUIRREL_PROFILE_SOURCE__: 'tauri', AdoleAPI: api };
    TauriAdapter.atome.getStateCurrent = async () => ({ ok: true, state: { property_versions: { eve_profile: 1 },
        properties: { eve_profile: { preferences: { workspace: { startup_view: 'project' } } } } } });
    try {
        const result = await loadResolvedProfileState({ api, identity: { backend: 'tauri', userId: 'local-offline-profile' },
            user: { id: 'local-offline-profile' }, commit: async () => { throw new Error('must not commit without remote confirmation'); } });
        assert.equal(result.profile.preferences.workspace.startup_view, 'project');
        await vi.waitFor(() => assert.equal(typeof release, 'function'));
        release({ ok: false });
    } finally {
        release?.({ ok: false });
        TauriAdapter.atome.getStateCurrent = previousGet;
        globalThis.window = previousWindow;
    }
});


test('historical profile recovery preserves a newer local edit made during remote authorization', async () => {
    const previousWindow=globalThis.window, previousLocal=TauriAdapter.atome.getStateCurrent;
    const previousMe=FastifyAdapter.auth.me, previousRemote=FastifyAdapter.atome.getStateCurrent;
    const baseline={eve_profile:{name:'Bootstrap'}};
    let latest={...baseline}, release;
    const waiting=new Promise(resolve=>{release=resolve;});
    const api={auth:{current:async()=>({logged:true,source:'tauri',user:{id:'local-profile'}}),ensureFastifyToken:()=>waiting}};
    globalThis.window={__SQUIRREL_FORCE_TAURI_RUNTIME__:true,__SQUIRREL_PROFILE_SOURCE__:'tauri',AdoleAPI:api};
    TauriAdapter.atome.getStateCurrent=vi.fn(async()=>({ok:true,state:{properties:latest,property_versions:{eve_profile:2}}}));
    FastifyAdapter.auth.me=async()=>({ok:true,user:{id:'remote-profile'}});
    FastifyAdapter.atome.getStateCurrent=async()=>({ok:true,state:{properties:{eve_profile:{name:'Remote profile'},user_face:'data:image/png;base64,QA'}}});
    const commit=vi.fn(async()=>({ok:true}));
    try {
        const repair=repairLegacyRemoteProfile({backend:'tauri',userId:'local-profile',user:{username:'Bootstrap'},profile:{name:'Bootstrap'},properties:baseline,commit,api});
        await Promise.resolve();
        latest={eve_profile:{name:'New manual name'}}; release({ok:true});
        assert.equal(await repair,null);
        assert.equal(commit.mock.calls.length,0);
        assert.equal(latest.eve_profile.name,'New manual name');
        assert.equal(TauriAdapter.atome.getStateCurrent.mock.calls.length,1);
    } finally {
        globalThis.window=previousWindow;TauriAdapter.atome.getStateCurrent=previousLocal;
        FastifyAdapter.auth.me=previousMe;FastifyAdapter.atome.getStateCurrent=previousRemote;
    }
});
