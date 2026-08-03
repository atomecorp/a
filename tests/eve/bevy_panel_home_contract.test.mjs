import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

import { sanitizeProfileForPersistence } from '../../eVe/domains/user/profile_api_support.js';
import {
    applyHomeServerPreference,
    changeHomePassword,
    createHomeSectionSubscriptions,
    deleteHomeAccount,
    logoutHomeSession,
    normalizeHomeProfile,
    profileDisplayName
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js';
import {
    lockHomeVault,
    mailVaultEntryId,
    readHomeVaultState,
    removeHomeAiToken,
    removeHomeCredential,
    storeHomeAiToken,
    storeHomeCredential,
    storeHomeMailSecret,
    unlockHomeVault
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_vault.js';
import { homeSurface, readHomePanelState } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js';
import { handleHomeVaultEvent } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_vault_runtime.js';
import { resolveBevyPanelGeometry } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_layout.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import {
    buildHomeContent,
    buildHomeFixedContent
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_view.js';
import {
    persistRuntimeMailPreferences,
    readPersistedRuntimeMailPreferences
} from '../../atome/src/squirrel/mail/runtime_preferences.js';
import { resolveSecureMailAuth } from '../../atome/src/squirrel/mail/bootstrap_transport.js';
import { resolveFirstAiProviderConfig } from '../../atome/src/squirrel/ai/provider_client.js';
import { resolveConfiguredAiProviderKeys } from '../../atome/src/squirrel/ai/model_catalog_refresh.js';
import {
    classifyRetryableMutationException,
    classifyRetryableMutationResult
} from '../../eVe/intuition/tools/core/tool_registry_mutations.js';

const flatten = (nodes = []) => nodes.flatMap((entry) => [entry, ...flatten(entry?.children || [])]);
const editing = {
    displayValue: () => '',
    fieldView: () => ({}),
    registerFieldWidth: () => {}
};
const baseState = (overrides = {}) => ({
    profile: normalizeHomeProfile({ name: 'Ada', preferences: { language: 'en' } }, { preserveEmptyItems: true }),
    guest: false,
    loading: false,
    loadError: '',
    notice: '',
    error: false,
    busy: false,
    sessionBusy: false,
    expanded: 'identity',
    subsections: {
        'profile.competences': true,
        'profile.passions': true,
        'profile.experiences': true,
        'passkeys.passwords': true,
        'passkeys.keys': true,
        'preferences.mail': true,
        'preferences.visual': true,
        'preferences.dashboard': true,
        'preferences.language': true,
        'preferences.server': true
    },
    selectOpen: '',
    securityMode: '',
    vault: { unlocked: false, credentials: [], providers: [], mailConfigured: false },
    server: { selected: 'https://atome.one', servers: ['https://atome.one'], connected: false },
    dashboardCategories: [{ id: 'projects', label_key: 'eve.dashboard.category.projects' }],
    rowKeys: {
        'bio.biometrics': [],
        'profile.competences': [],
        'profile.passions': [],
        'profile.experiences': []
    },
    ...overrides
});

test('Home is a six-section Bevy composition with the restored nested hierarchy', () => {
    const state = baseState();
    const nodes = buildHomeContent(state, { emit: () => {}, bodyWidth: 452, editing });
    const all = flatten([
        ...nodes,
        ...buildHomeContent({ ...state, expanded: 'bio' }, { emit: () => {}, bodyWidth: 452, editing }),
        ...buildHomeContent({ ...state, expanded: 'profile' }, { emit: () => {}, bodyWidth: 452, editing }),
        ...buildHomeContent({ ...state, expanded: 'passkeys' }, { emit: () => {}, bodyWidth: 452, editing }),
        ...buildHomeContent({ ...state, expanded: 'preferences' }, { emit: () => {}, bodyWidth: 452, editing })
    ]);
    const fixed = buildHomeFixedContent(state, { emit: () => {}, bodyWidth: 452 });

    assert.equal(homeSurface.surfaceKey, 'home');
    assert.equal(homeSurface.surfaceId, 'eve_bevy_panel_home');
    assert.deepEqual(nodes.map((entry) => entry.id), [
        'home_identity_accordion',
        'home_bio_accordion',
        'home_profile_accordion',
        'home_passkeys_accordion',
        'home_preferences_accordion',
        'home_security_accordion'
    ]);
    const initialProjection = flatten(nodes);
    assert.equal(initialProjection.some((entry) => entry.id === 'home_bio_birth'), false);
    assert.equal(initialProjection.some((entry) => entry.id === 'home_preferences_mail_accordion'), false);
    const photo = initialProjection.find((entry) => entry.id === 'home_profile_photo');
    assert.equal(photo.kind, 'button');
    assert.equal(photo.children.length, 0);
    assert.deepEqual(photo.style.border, [1, 1, 1, 1]);
    assert.equal(typeof photo.on.activate, 'function');
    assert.equal(typeof photo.on.drop, 'function');
    assert.equal(initialProjection.some((entry) => entry.id === 'home_profile_photo_change'), false);
    assert.equal(initialProjection.find((entry) => entry.id === 'home_display_source_heading').text, 'Afficher');
    [
        'home_profile_competences_accordion',
        'home_profile_passions_accordion',
        'home_profile_experiences_accordion',
        'home_passwords_accordion',
        'home_keys_accordion',
        'home_preferences_mail_accordion',
        'home_preferences_visual_accordion',
        'home_preferences_dashboard_accordion',
        'home_preferences_language_accordion',
        'home_preferences_server_accordion'
    ].forEach((id) => assert.ok(all.some((entry) => entry.id === id), id));
    assert.ok(all.some((entry) => entry.id === 'home_display_source'));
    assert.ok(all.some((entry) => entry.id === 'home_handedness'));
    assert.ok(all.some((entry) => entry.id === 'home_accessibility_auditory'));
    assert.ok(all.some((entry) => entry.id === 'home_server_select'));
    assert.equal(all.some((entry) => /professional|home_ai_/i.test(entry.id || '')), false);
    assert.equal(fixed[0].id, 'home_session_exit');
    assert.equal(profileDisplayName(state.profile), 'Ada');
});

test('Passwords and keys contain the credential plus and the five canonical providers without an AI section', () => {
    const providers = ['openai', 'anthropic', 'mistral', 'google', 'deepseek'].map((id) => ({
        id,
        label: id,
        models: [`${id}-model`],
        configured: id === 'openai'
    }));
    const state = baseState({
        expanded: 'passkeys',
        vault: {
            unlocked: true,
            credentials: [{ id: 'credential-1', name: 'Site', login: 'ada', configured: true }],
            providers,
            mailConfigured: false
        }
    });
    const all = flatten(buildHomeContent(state, { emit: () => {}, bodyWidth: 452, editing }));
    const credentials = all.find((entry) => entry.id === 'home_credentials');

    assert.equal(credentials.children.at(-1).id, 'home_credentials_add');
    assert.equal(credentials.children.at(-2).id, 'home_credentials_credential-1');
    providers.forEach(({ id }) => {
        assert.ok(all.some((entry) => entry.id === `home_key_${id}_model`), id);
        assert.ok(all.some((entry) => entry.id === `home_key_${id}_api`), id);
        assert.ok(all.some((entry) => entry.id === `home_key_${id}_save`), id);
    });
    assert.equal(all.some((entry) => /home_ai_|ai_accordion/i.test(entry.id || '')), false);
});

test('the credential plus creates a stable draft above itself without touching profile persistence', async () => {
    const state = baseState({
        userId: 'credential-user',
        vault: { unlocked: true, credentials: [], providers: [], mailConfigured: false },
        security: { credentialPasswords: {} }
    });
    let persisted = false;
    const result = await handleHomeVaultEvent({
        intent: { type: 'home.credential.add' },
        state,
        persist: async () => { persisted = true; return { ok: true }; },
        refreshVault: async () => state.vault,
        setNotice: () => {},
        clearSecrets: () => {},
        newRowKey: () => 'draft_1',
        refresh: () => {}
    });
    const all = flatten(buildHomeContent({ ...state, expanded: 'passkeys' }, {
        emit: () => {}, bodyWidth: 452, editing
    }));
    const credentials = all.find((entry) => entry.id === 'home_credentials');

    assert.equal(result.revealNodeId, 'home_credentials_draft_1');
    assert.equal(credentials.children.at(-2).id, result.revealNodeId);
    assert.equal(credentials.children.at(-1).id, 'home_credentials_add');
    assert.equal(persisted, false);
});

test('Home normalization preserves hidden Pro values and removes every legacy secret field', () => {
    const unsafe = {
        name: 'Ada',
        password: 'account-secret',
        profile: { competences: [{ label: 'Piano', value: 'Expert', pro: true }] },
        preferences: { mail: { email: 'ada@example.test', password: 'mail-secret', auth_ref: 'mail.ref' } },
        passkeys: {
            credentials: [{ label: 'site', login: 'ada', password: 'credential-secret' }],
            keys: [{ provider: 'openai', model: 'gpt-5', key: 'api-secret' }]
        }
    };
    const home = normalizeHomeProfile(unsafe);
    const persisted = sanitizeProfileForPersistence(unsafe);

    assert.equal(home.profile.competences[0].pro, true);
    assert.equal(home.preferences.mail.password, '');
    assert.equal(home.preferences.mail.auth_ref, 'mail.ref');
    assert.deepEqual(home.passkeys.keys, [{ provider: 'openai', model: 'gpt-5' }]);
    assert.equal('key' in home.passkeys.keys[0], false);
    assert.equal('password' in persisted, false);
    assert.equal('password' in persisted.preferences.mail, false);
    assert.equal('password' in persisted.passkeys.credentials[0], false);
    assert.equal('key' in persisted.passkeys.keys[0], false);
});

test('Home list additions retain blank stable rows immediately above the canonical add action', async () => {
    const runtimeSource = fs.readFileSync(new URL('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js', import.meta.url), 'utf8');
    assert.match(runtimeSource, /home\.field\.focus'[\s\S]*`\$\{path\}\.\$\{itemIndex\}\.label`/, 'A newly added Home list row must immediately focus its first canonical field');
    assert.match(runtimeSource, /home\.credential\.add'[\s\S]*home\.field\.focus'[\s\S]*credentials\.\$\{credentialId\}\.name/, 'A newly added credential must immediately focus its name field');
    const sections = [
        ['bio.biometrics', 'home_biometrics', 'bio'],
        ['profile.competences', 'home_competences', 'profile'],
        ['profile.passions', 'home_passions', 'profile'],
        ['profile.experiences', 'home_experiences', 'profile']
    ];
    for (const [section, ownerId, expanded] of sections) {
        const result = await homeSurface.handleEvent({ type: 'home.list.add', section }, { refresh: () => {} });
        assert.match(result.revealNodeId, new RegExp(`^${ownerId}_row_\\d+$`));
        const current = readHomePanelState();
        const snapshot = {
            ...current,
            loading: false,
            loadError: '',
            expanded,
            subsections: { ...current.subsections, [section]: true }
        };
        const all = flatten(buildHomeContent(snapshot, { emit: () => {}, bodyWidth: 452, editing }));
        const owner = all.find((entry) => entry.id === ownerId);
        assert.ok(owner, section);
        assert.equal(owner.children.at(-1).id, `${ownerId}_add`);
        assert.equal(owner.children.at(-2).id, result.revealNodeId);
    }
});

test('Home opening geometry follows handedness and remains bottom-aligned on desktop and mobile', () => {
    const previousWindow = globalThis.window;
    globalThis.window = {};
    const desktopSurface = { getBoundingClientRect: () => ({ width: 1024, height: 768 }) };
    try {
        setMainMenuRuntime({ handedness: 'left', getReservedHeight: () => 74 });
        const left = resolveBevyPanelGeometry({
            surface: desktopSurface,
            defaultGeometry: homeSurface.defaultGeometry,
            allowMobileFloating: true,
            openAtHandednessEdge: true
        });
        assert.deepEqual([left.x, left.y, left.width, left.height], [0, 74, 480, 620]);

        setMainMenuRuntime({ handedness: 'right', getReservedHeight: () => 74 });
        const right = resolveBevyPanelGeometry({
            surface: desktopSurface,
            defaultGeometry: homeSurface.defaultGeometry,
            allowMobileFloating: true,
            openAtHandednessEdge: true
        });
        assert.deepEqual([right.x, right.y, right.width, right.height], [544, 74, 480, 620]);

        const mobile = resolveBevyPanelGeometry({
            surface: { getBoundingClientRect: () => ({ width: 390, height: 844 }) },
            defaultGeometry: homeSurface.defaultGeometry,
            allowMobileFloating: true,
            openAtHandednessEdge: true
        });
        assert.deepEqual([mobile.x, mobile.y, mobile.width, mobile.height], [0, 150, 390, 620]);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

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
        const result = await applyHomeServerPreference('server.example/');
        assert.equal(result.ok, true);
        assert.equal(result.selected, 'https://server.example');
        assert.equal(globalThis.window.__SQUIRREL_FASTIFY_URL__, 'https://server.example');
        assert.match(globalThis.window.__SQUIRREL_FASTIFY_WS_API_URL__, /^wss:\/\/server\.example\//);
        assert.deepEqual(calls, ['clear', 'disconnect', 'retry', 'remote-stop', 'remote-start:server-user']);
        assert.equal(records.get('squirrel_tauri_fastify_url_override'), 'https://server.example');

        globalThis.window.__SQUIRREL_FORCE_TAURI_RUNTIME__ = true;
        globalThis.window.__SQUIRREL_TAURI_LOCAL_PORT__ = 3000;
        assert.deepEqual(await applyHomeServerPreference('http://localhost:3000'), {
            ok: false,
            error: 'home_server_invalid'
        });
    } finally {
        globalThis.window = previousWindow;
    }
});

test('The common vault encrypts credentials, Mail auth and five provider keys without projection leaks', async () => {
    const previousWindow = globalThis.window;
    const records = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (key) => records.get(String(key)) || null,
            setItem: (key, value) => records.set(String(key), String(value)),
            removeItem: (key) => records.delete(String(key)),
            key: (index) => Array.from(records.keys())[index] || null,
            get length() { return records.size; }
        }
    };
    try {
        assert.deepEqual(await unlockHomeVault({ userId: 'home-user', secret: 'vault-secret' }), { ok: true });
        const credential = await storeHomeCredential({
            userId: 'home-user',
            credential: { name: 'Private site', login: 'ada', draft: true },
            password: 'credential-password'
        });
        assert.equal(credential.ok, true);
        assert.equal((await storeHomeMailSecret({
            userId: 'home-user', username: 'ada@example.test', password: 'mail-password'
        })).ok, true);
        for (const providerId of ['openai', 'anthropic', 'mistral', 'google', 'deepseek']) {
            assert.equal((await storeHomeAiToken({
                userId: 'home-user', providerId, apiKey: `${providerId}-private-key`
            })).ok, true);
        }
        const snapshot = await readHomeVaultState({ userId: 'home-user' });
        assert.equal(snapshot.unlocked, true);
        assert.equal(snapshot.mailConfigured, true);
        assert.equal(snapshot.credentials[0].name, 'Private site');
        assert.deepEqual(snapshot.providers.map((provider) => provider.id), ['openai', 'anthropic', 'mistral', 'google', 'deepseek']);
        assert.ok(snapshot.providers.every((provider) => provider.configured));
        assert.doesNotMatch(JSON.stringify(snapshot), /credential-password|mail-password|private-key|vault-secret/);
        assert.doesNotMatch([...records.values()].join(''), /credential-password|mail-password|private-key|vault-secret/);

        lockHomeVault();
        assert.equal((await unlockHomeVault({ userId: 'home-user', secret: 'wrong-secret' })).ok, false);
        assert.deepEqual(await unlockHomeVault({ userId: 'home-user', secret: 'vault-secret' }), { ok: true });
        assert.equal(removeHomeCredential({ userId: 'home-user', credentialId: credential.credential.id }).ok, true);
        assert.equal(removeHomeAiToken({ userId: 'home-user', providerId: 'openai' }).ok, true);
    } finally {
        lockHomeVault();
        globalThis.window = previousWindow;
    }
});

test('Mail preferences persist auth_ref only and resolve the password asynchronously from the vault', async () => {
    const previousWindow = globalThis.window;
    const records = new Map();
    const localStorage = {
        getItem: (key) => records.get(String(key)) || null,
        setItem: (key, value) => records.set(String(key), String(value)),
        removeItem: (key) => records.delete(String(key)),
        key: (index) => Array.from(records.keys())[index] || null,
        get length() { return records.size; }
    };
    globalThis.window = { localStorage };
    try {
        await unlockHomeVault({ userId: 'mail-user', secret: 'vault-secret' });
        await storeHomeMailSecret({ userId: 'mail-user', username: 'ada', password: 'mail-secret' });
        const authRef = mailVaultEntryId({ userId: 'mail-user' });
        const saved = persistRuntimeMailPreferences(globalThis.window, {
            email: 'ada@example.test', username: 'ada', password: 'must-not-persist', auth_ref: authRef
        });
        assert.equal(saved.password, '');
        assert.equal(saved.auth_ref, authRef);
        assert.equal(readPersistedRuntimeMailPreferences(globalThis.window).auth_ref, authRef);
        assert.doesNotMatch([...records.values()].join(''), /mail-secret|must-not-persist|vault-secret/);
        const resolved = await resolveSecureMailAuth(globalThis.window, saved);
        assert.equal(resolved.password, 'mail-secret');
    } finally {
        lockHomeVault();
        globalThis.window = previousWindow;
    }
});

test('AI consumers read provider secrets asynchronously from the vault, never from profile metadata', async () => {
    const profile = {
        ok: true,
        userId: 'ai-user',
        profile: {
            passkeys: {
                keys: [{ provider: 'openai', model: 'gpt-5', key: 'legacy-clear-key' }]
            }
        }
    };
    const securityApi = {
        vaultStatus: () => ({ configured: true }),
        readToken: async (entryId) => ({ ok: true, entry_id: entryId, value: { apiKey: 'vault-only-key' } })
    };
    const options = { loadProfile: async () => profile, securityApi };
    const consumer = await resolveFirstAiProviderConfig(options);
    const catalog = await resolveConfiguredAiProviderKeys(options);

    assert.equal(consumer.apiKey, 'vault-only-key');
    assert.equal(consumer.source, 'profile.passkeys.keys+token_vault.first');
    assert.deepEqual(catalog.items, [{ provider: 'openai', model: 'gpt-5', apiKey: 'vault-only-key' }]);
    assert.doesNotMatch(JSON.stringify({ consumer, catalog }), /legacy-clear-key/);
});

test('Home security actions normalize owner exceptions without exposing a second route', async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
        AdoleAPI: {
            auth: {
                changePassword: async () => { throw new Error('change_denied'); },
                deleteAccount: async () => { throw new Error('delete_denied'); },
                logout: async () => { throw new Error('logout_denied'); }
            }
        }
    };
    try {
        assert.deepEqual(await changeHomePassword({ currentPassword: 'old', newPassword: 'new' }), { ok: false, error: 'change_denied' });
        assert.deepEqual(await deleteHomeAccount({ password: 'old' }), { ok: false, error: 'delete_denied' });
        assert.deepEqual(await logoutHomeSession(), { ok: false, error: 'logout_denied' });
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Guest authorization rejects every private Home intent outside the visual projection', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ dashboard: { categories: [] } }) });
    let refreshCount = 0;
    let resolveReady = null;
    const ready = new Promise((resolve) => { resolveReady = resolve; });
    const cleanup = homeSurface.onOpen({
        context: { guest: true },
        refresh: () => {
            refreshCount += 1;
            if (refreshCount >= 2) resolveReady();
        }
    });
    try {
        await ready;
        for (const intent of [
            { type: 'home.choice.set', field: 'display_name_source', value: 'nickname' },
            { type: 'home.list.add', section: 'bio.biometrics' },
            { type: 'home.photo.pick' },
            { type: 'home.security.change_password.request' },
            { type: 'home.vault.unlock' },
            { type: 'home.credential.add' },
            { type: 'home.mail.save' },
            { type: 'home.server.add' }
        ]) {
            assert.deepEqual(await homeSurface.handleEvent(intent, { refresh: () => {} }), {
                ok: false,
                error: 'home_guest_read_only'
            });
        }
    } finally {
        cleanup?.();
        globalThis.fetch = previousFetch;
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
    assert.doesNotMatch(definitions, /eve_user_dialog/);
    assert.match(definitions, /runtime_owner: 'window'/);
    assert.match(definitions, /surface_key: useWindowOwner \? '' : def\.surface_key/);
    assert.doesNotMatch(userModule, /createEveDialog|createElement\(|innerHTML|querySelector/);
    assert.match(userModule, /bevy_panel_home_runtime\.js/);
    assert.match(userModule, /registerBevyPanelSurface\(homeSurface\)/);
    assert.doesNotMatch(commonSurfaces, /bevy_panel_(home|contact|lab)/);
    assert.doesNotMatch(actionsModule, /^import .*profile_api|^import .*dashboard_defaults|^import .*loadServerConfig/m);
    assert.doesNotMatch(homeRuntime, /^import .*home_vault|^import .*project_media_import_runtime/m);
    assert.match(routeModule, /syncLoginToolState\(false, 'anonymous_workspace'\)/);
    assert.match(routeModule, /syncLoginToolState\(false, 'authenticated_workspace'\)/);
});
