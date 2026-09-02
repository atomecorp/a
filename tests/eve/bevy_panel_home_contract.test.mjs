import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

import {
    buildUserProperties,
    mergeUserProfileIdentity,
    repairBootstrapPhoneProfile,
    repairLegacyRemoteProfile,
    resolveUsername,
    sanitizeProfileForPersistence
} from '../../eVe/domains/user/profile_api_support.js';
import { loadUserProfile, upsertUserProfile } from '../../eVe/domains/user/profile_api.js';
import {
    applyHomeServerPreference,
    changeHomePassword,
    createHomeSectionSubscriptions,
    deleteHomeAccount,
    logoutHomeSession,
    normalizeHomeProfile,
    mergeHomeProfileUpdate,
    profileDisplayName
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js';
import {
    ensureHomeVault,
    lockHomeVault,
    mailVaultEntryId,
    readHomeVaultState,
    removeHomeAiToken,
    removeHomeCredential,
    storeHomeAiToken,
    storeHomeCredential,
    storeHomeMailSecret
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_vault.js';
import { homeSurface, readHomePanelState } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js';
import { createHomeAccessRuntime } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_access.js';
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
import { resolveActiveAiProviderConfig } from '../../atome/src/squirrel/ai/provider_client.js';
import { resolveConfiguredAiProviderKeys } from '../../atome/src/squirrel/ai/model_catalog_refresh.js';
import { FastifyAdapter, TauriAdapter } from '../../atome/src/squirrel/apis/unified/adole.js';
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
    accessError: '',
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
    server: {
        selected: 'https://atome.one', mode: 'production', customBase: '', debugSync: false,
        environments: [
            { id: 'local', label: 'Local test', base: 'http://localhost:3001' },
            { id: 'production', label: 'Production — atome.one', base: 'https://atome.one' },
            { id: 'custom', label: 'Custom développeur', base: '' }
        ],
        connected: false
    },
    dashboardCategories: [{ id: 'projects', label_key: 'eve.dashboard.category.projects' }],
    rowKeys: {
        'bio.biometrics': [],
        'profile.competences': [],
        'profile.passions': [],
        'profile.experiences': []
    },
    ...overrides
});

test('Home is a seven-section Bevy composition with the restored nested hierarchy', () => {
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
        'home_security_accordion',
        'home_privacy_accordion'
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
        'home_ai_keys_accordion',
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
    assert.equal(all.some((entry) => /professional/i.test(entry.id || '')), false);
    assert.equal(fixed[0].id, 'home_session_exit');
    assert.equal(profileDisplayName(state.profile), 'Ada');
});

test('profile reconstruction never derives the technical username from display identity or phone', () => {
    assert.equal(resolveUsername({
        phone: '+33612345678',
        name: 'Toto',
        first_name: 'Toto',
        nickname: 'Tot'
    }), '');
    assert.equal(resolveUsername({ username: 'user_opaque', phone: '+33612345678' }), 'user_opaque');
    const properties = buildUserProperties({ phone: '+33612345678', name: 'Toto' });
    assert.equal(Object.prototype.hasOwnProperty.call(properties, 'username'), false);
    assert.equal(properties.name, 'Toto');
});

test('Home replaces the access selector with an inline destructive error when a public name is required', () => {
    const state = baseState({
        profile: normalizeHomeProfile({ access: 'private' }, { preserveEmptyItems: true }),
        accessError: 'Renseignez un nom avant de rendre ce profil public.'
    });
    const all = flatten(buildHomeContent(state, { emit: () => {}, bodyWidth: 452, editing }));
    const error = all.find((entry) => entry.id === 'home_access_error');
    assert.equal(all.some((entry) => entry.id === 'home_access_select'), false);
    assert.equal(error.text, 'Renseignez un nom avant de rendre ce profil public.');
    assert.equal(Array.isArray(error.style.color), true);
    assert.equal(all.some((entry) => /modal|popup|dialog/i.test(entry.id || '')), false);
});

test('Home refuses public access without a name and restores the last public display identity', async () => {
    const state = {
        profile: normalizeHomeProfile({ access: 'private' }, { preserveEmptyItems: true }),
        accessError: '',
        selectOpen: 'access',
        savedSignature: JSON.stringify(normalizeHomeProfile({
            access: 'public',
            name: 'Ada'
        }, { preserveEmptyItems: true }))
    };
    const readPath = (root, path) => String(path || '').split('.').reduce((value, part) => value?.[part], root);
    const writePath = (root, path, value) => {
        const parts = String(path || '').split('.');
        const leaf = parts.pop();
        const owner = parts.reduce((value, part) => value[part], root);
        owner[leaf] = value;
    };
    let persisted = 0;
    let choiceWrites = 0;
    const runtime = createHomeAccessRuntime({
        state,
        displayName: profileDisplayName,
        readPath,
        writePath,
        persist: async () => { persisted += 1; return { ok: true }; },
        persistable: () => true
    });

    assert.deepEqual(runtime.setChoice('access', 'public', () => {}, () => {
        choiceWrites += 1;
    }), { ok: false, error: 'profile_public_name_required' });
    assert.equal(state.profile.access, 'private');
    assert.equal(choiceWrites, 0);
    assert.ok(state.accessError);

    state.profile.access = 'public';
    state.profile.name = '';
    assert.deepEqual(runtime.commitField('name', { refresh: () => {} }), {
        ok: false,
        error: 'profile_public_name_required'
    });
    assert.equal(state.profile.name, 'Ada');
    assert.equal(state.profile.access, 'public');
    assert.equal(persisted, 0);

    state.profile.name = 'Grace';
    assert.deepEqual(await runtime.commitField('name'), { ok: true });
    assert.equal(state.accessError, '');
    assert.equal(persisted, 1);
});

test('Passwords and keys expose direct AI provider settings without a vault unlock screen', () => {
    const providers = ['openai', 'anthropic', 'mistral', 'google', 'deepseek'].map((id) => ({
        id,
        label: id,
        models: [`${id}-model`],
        configured: id === 'openai'
    }));
    const state = baseState({
        expanded: 'passkeys',
        vault: {
            unlocked: false,
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
        assert.equal(all.some((entry) => entry.id === `home_key_${id}_model`), true, id);
        assert.ok(all.some((entry) => entry.id === `home_key_${id}_api`), id);
        assert.equal(all.some((entry) => entry.id === `home_key_${id}_save`), false, id);
        assert.equal(all.some((entry) => entry.id === `home_key_${id}_status`), false, id);
    });
    assert.ok(all.some((entry) => entry.id === 'home_ai_keys_accordion'));
    assert.equal(all.some((entry) => /home_vault_|locked_notice/i.test(entry.id || '')), false);
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

test('Home persists exactly one active configured AI provider and rejects providers without a key', async () => {
    const state = baseState({
        userId: 'ai-provider-user',
        profile: normalizeHomeProfile({
            passkeys: {
                keys: [
                    { provider: 'openai', model: 'gpt-5', active: true },
                    { provider: 'anthropic', model: 'claude-sonnet-4-5', active: false }
                ]
            }
        }, { preserveEmptyItems: true }),
        vault: {
            unlocked: false,
            credentials: [],
            mailConfigured: false,
            providers: [
                { id: 'openai', models: ['gpt-5'], configured: true },
                { id: 'anthropic', models: ['claude-sonnet-4-5'], configured: true },
                { id: 'mistral', models: ['mistral-large'], configured: false }
            ]
        },
        security: { aiKeys: {}, credentialPasswords: {}, mailPassword: '' }
    });
    let persistCount = 0;
    const invoke = (provider) => handleHomeVaultEvent({
        intent: { type: 'home.key.active.set', provider },
        state,
        persist: async () => { persistCount += 1; return { ok: true }; },
        refreshVault: async () => state.vault,
        setNotice: () => { },
        clearSecrets: () => { },
        newRowKey: () => 'unused',
        refresh: () => { }
    });

    const activated = await invoke('anthropic');
    assert.equal(activated.ok, true);
    assert.deepEqual(
        state.profile.passkeys.keys.filter((entry) => entry.active).map((entry) => entry.provider),
        ['anthropic']
    );
    const rejected = await invoke('mistral');
    assert.equal(rejected.error, 'ai_active_provider_key_missing');
    assert.equal(persistCount, 1);
});

test('Home normalization preserves hidden Pro values and removes every legacy secret field', () => {
    const unsafe = {
        name: 'Ada',
        password: 'account-secret',
        profile: { competences: [{ label: 'Piano', value: 'Expert', pro: true }] },
        preferences: { mail: { email: 'ada@example.test', password: 'mail-secret', auth_ref: 'mail.ref' } },
        passkeys: {
            credentials: [{ label: 'site', login: 'ada', password: 'credential-secret' }],
            keys: [{ provider: 'openai', model: 'gpt-5', active: true, key: 'api-secret' }]
        }
    };
    const home = normalizeHomeProfile(unsafe);
    const persisted = sanitizeProfileForPersistence(unsafe);

    assert.equal(home.profile.competences[0].pro, true);
    assert.equal(home.preferences.mail.password, '');
    assert.equal(home.preferences.mail.auth_ref, 'mail.ref');
    assert.deepEqual(home.passkeys.keys, [{ provider: 'openai', model: 'gpt-5', active: true }]);
    assert.equal('key' in home.passkeys.keys[0], false);
    assert.equal('password' in persisted, false);
    assert.equal('password' in persisted.preferences.mail, false);
    assert.equal('password' in persisted.passkeys.credentials[0], false);
    assert.equal('key' in persisted.passkeys.keys[0], false);
});

test('Contact identity edits preserve the complete canonical Home profile', () => {
    const merged = mergeUserProfileIdentity({
        name: 'Before',
        access: 'private',
        bio: { birth: '2000-01-01' },
        profile: { competences: [{ label: 'Piano', value: 'Expert', pro: true }] },
        preferences: { language: 'fr', dashboard: { news: false } },
        passkeys: { credentials: [{ label: 'site', login: 'ada' }] }
    }, {
        name: 'After', first_name: 'Ada', nickname: 'AA', phone: '0600000000', email: 'ada@example.test'
    });

    assert.equal(merged.name, 'After');
    assert.equal(merged.first_name, 'Ada');
    assert.equal(merged.access, 'private');
    assert.equal(merged.bio.birth, '2000-01-01');
    assert.equal(merged.profile.competences[0].label, 'Piano');
    assert.equal(merged.preferences.language, 'fr');
    assert.equal(merged.passkeys.credentials[0].login, 'ada');

    const cleared = buildUserProperties(mergeUserProfileIdentity(merged, {
        name: '', first_name: '', nickname: '', email: '', user_face: ''
    }));
    assert.equal(cleared.name, '');
    assert.equal(cleared.first_name, '');
    assert.equal(cleared.nickname, '');
    assert.equal(cleared.email, '');
    assert.equal(cleared.user_face, '');
});

test('Home overlays a confirmed Contact update without discarding stored sections', () => {
    const profile = mergeHomeProfileUpdate({
        name: 'Before',
        access: 'public',
        bio: { birth: '2000-01-01' },
        preferences: { language: 'fr' }
    }, {
        name: 'After', first_name: 'Ada'
    });

    assert.equal(profile.name, 'After');
    assert.equal(profile.first_name, 'Ada');
    assert.equal(profile.access, 'public');
    assert.equal(profile.bio.birth, '2000-01-01');
    assert.equal(profile.preferences.language, 'fr');

    const contactRuntime = fs.readFileSync(
        new URL('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_runtime.js', import.meta.url),
        'utf8'
    );
    const homeRuntime = fs.readFileSync(
        new URL('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js', import.meta.url),
        'utf8'
    );
    assert.match(contactRuntime, /updateUserProfileIdentity\(draft, \{ userId: state\.currentUserId \}\)/);
    assert.doesNotMatch(contactRuntime, /upsertUserProfile\(draft/);
    assert.match(homeRuntime, /state\.profile = mergeHomeProfileUpdate\(state\.profile, event\?\.detail\?\.profile\)/);
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

test('Home creates its local encryption key automatically and keeps credentials, Mail auth and provider keys out of projections', async () => {
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
        assert.deepEqual(ensureHomeVault({ userId: 'home-user' }), { ok: true });
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
        assert.doesNotMatch(JSON.stringify(snapshot), /credential-password|mail-password|private-key/);
        assert.doesNotMatch([...records.values()].join(''), /credential-password|mail-password|private-key/);

        lockHomeVault();
        assert.deepEqual(ensureHomeVault({ userId: 'home-user' }), { ok: true });
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
        assert.deepEqual(ensureHomeVault({ userId: 'mail-user' }), { ok: true });
        await storeHomeMailSecret({ userId: 'mail-user', username: 'ada', password: 'mail-secret' });
        const authRef = mailVaultEntryId({ userId: 'mail-user' });
        const saved = persistRuntimeMailPreferences(globalThis.window, {
            email: 'ada@example.test', username: 'ada', password: 'must-not-persist', auth_ref: authRef
        });
        assert.equal(saved.password, '');
        assert.equal(saved.auth_ref, authRef);
        assert.equal(readPersistedRuntimeMailPreferences(globalThis.window).auth_ref, authRef);
        assert.doesNotMatch([...records.values()].join(''), /mail-secret|must-not-persist/);
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
                keys: [{ provider: 'openai', model: 'gpt-5', active: true, key: 'legacy-clear-key' }]
            }
        }
    };
    const securityApi = {
        vaultStatus: () => ({ configured: true }),
        readToken: async (entryId) => ({ ok: true, entry_id: entryId, value: { apiKey: 'vault-only-key' } })
    };
    const options = { loadProfile: async () => profile, securityApi };
    const consumer = await resolveActiveAiProviderConfig(options);
    const catalog = await resolveConfiguredAiProviderKeys(options);

    assert.equal(consumer.apiKey, 'vault-only-key');
    assert.equal(consumer.source, 'profile.passkeys.keys.active+token_vault');
    assert.deepEqual(catalog.items, [{ provider: 'openai', model: 'gpt-5', apiKey: 'vault-only-key' }]);
    assert.doesNotMatch(JSON.stringify({ consumer, catalog }), /legacy-clear-key/);
});

test('AI provider resolution fails closed until exactly one configured provider is active', async () => {
    const securityApi = {
        vaultStatus: () => ({ configured: true }),
        readToken: async () => ({ ok: true, value: { apiKey: 'vault-key' } })
    };
    const resolve = (keys) => resolveActiveAiProviderConfig({
        loadProfile: async () => ({ ok: true, userId: 'ai-user', profile: { passkeys: { keys } } }),
        securityApi
    });
    assert.equal((await resolve([{ provider: 'openai', model: 'gpt-5' }])).error, 'no_active_ai_provider');
    assert.equal((await resolve([
        { provider: 'openai', model: 'gpt-5', active: true },
        { provider: 'anthropic', model: 'claude-sonnet-4', active: true }
    ])).error, 'ai_active_provider_ambiguous');
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
    assert.match(routeModule, /syncLoginToolState\(false, 'anonymous_workspace'\)/);
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

        const loaded = await loadUserProfile();
        assert.equal(loaded.ok, true);
        assert.equal(loaded.userId, 'local_profile_principal');
        assert.equal(loaded.profile.access, 'public');
        assert.equal(loaded.profile.user_face, 'data:image/png;base64,persisted');
        assert.equal(commits.length, 1);
        assert.equal(commits[0].payload.atome_id, 'local_profile_principal');
        assert.equal(commits[0].payload.props.eve_profile.name, 'Persisted name');

        const updated = await upsertUserProfile(loaded.profile, { allowCreate: false });
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
