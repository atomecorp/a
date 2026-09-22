import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "vitest";
import { buildUserProperties, resolveUsername, sanitizeProfileForPersistence } from "../../eVe/domains/user/profile_api_support.js";
import { upsertUserProfile } from "../../eVe/domains/user/profile_api.js";
import { normalizeHomeProfile, mergeHomeProfileUpdate, profileDisplayName } from "../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js";
import { homeSurface, readHomePanelState } from "../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js";
import { createHomeAccessRuntime } from "../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_access.js";
import { handleHomeVaultEvent } from "../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_vault_runtime.js";
import { resolveBevyPanelGeometry } from "../../eVe/intuition/runtime/bevy_panel/bevy_panel_layout.js";
import { setMainMenuRuntime } from "../../eVe/intuition/ribbon/bevy_ui_product_registry.js";
import { buildHomeContent, buildHomeFixedContent } from "../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_view.js";
import { normalizeVisualPreferences } from '../../eVe/intuition/tools/user_visual_preferences_model.js';

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
    subject: null,
    subsections: {
        'profile.competences': true,
        'profile.passions': true,
        'profile.experiences': true,
        'settings.preferences': true,
        'settings.level': true,
        'settings.passkeys': true,
        'settings.security': true,
        'settings.privacy': true,
        'passkeys.passwords': true,
        'passkeys.keys': true,
        'preferences.mail': true,
        'preferences.visual': true,
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
    rowKeys: {
        custom_fields: [],
        'bio.biometrics': [],
        'profile.competences': [],
        'profile.passions': [],
        'profile.experiences': []
    },
    ...overrides
});

const editing = {
    displayValue: () => '',
    fieldView: () => ({}),
    registerFieldWidth: () => {}
};

const flatten = (nodes = []) => nodes.flatMap((entry) => [entry, ...flatten(entry?.children || [])]);

test('Home is the card of the current user with a collapsed Settings accordion below it', () => {
    const state = baseState();
    const nodes = buildHomeContent(state, { emit: () => {}, bodyWidth: 452, editing });
    const all = flatten([
        ...nodes,
        ...buildHomeContent({ ...state, expanded: 'bio' }, { emit: () => {}, bodyWidth: 452, editing }),
        ...buildHomeContent({ ...state, expanded: 'profile' }, { emit: () => {}, bodyWidth: 452, editing }),
        ...buildHomeContent({ ...state, expanded: 'settings' }, { emit: () => {}, bodyWidth: 452, editing })
    ]);
    const fixed = buildHomeFixedContent(state, { emit: () => {}, bodyWidth: 452 });

    assert.equal(homeSurface.surfaceKey, 'home');
    assert.equal(homeSurface.surfaceId, 'eve_bevy_panel_home');
    assert.deepEqual(nodes.map((entry) => entry.id), [
        'home_identity_accordion',
        'home_bio_accordion',
        'home_profile_accordion',
        'home_settings_accordion'
    ]);
    const initialProjection = flatten(nodes);
    assert.equal(initialProjection.some((entry) => entry.id === 'home_bio_birth'), false);
    assert.equal(initialProjection.some((entry) => entry.id === 'home_settings_content'), false, 'Settings starts collapsed');
    const photo = initialProjection.find((entry) => entry.id === 'home_profile_photo');
    assert.equal(photo.kind, 'button');
    assert.equal(typeof photo.on.activate, 'function');
    assert.equal(typeof photo.on.drop, 'function');
    assert.ok(initialProjection.some((entry) => entry.id === 'home_custom_fields_add'), 'the card carries its free fields');
    assert.ok(initialProjection.some((entry) => entry.id === 'home_display_source'));
    const settings = flatten(buildHomeContent({ ...state, expanded: 'settings' }, { emit: () => {}, bodyWidth: 452, editing }))
        .find((entry) => entry.id === 'home_settings_content');
    assert.deepEqual(settings.children.map((entry) => entry.id), [
        'home_settings_preferences_accordion',
        'home_settings_level_accordion',
        'home_settings_passkeys_accordion',
        'home_settings_security_accordion',
        'home_settings_privacy_accordion'
    ]);
    [
        'home_profile_competences_accordion',
        'home_profile_passions_accordion',
        'home_profile_experiences_accordion',
        'home_passwords_accordion',
        'home_ai_keys_accordion',
        'home_preferences_mail_accordion',
        'home_preferences_visual_accordion',
        'home_preferences_language_accordion',
        'home_preferences_server_accordion',
        'home_level_global',
        'home_sharing_name',
        'home_privacy_target_phone'
    ].forEach((id) => assert.ok(all.some((entry) => entry.id === id), id));
    [
        'home_preferences_dashboard_accordion', 'home_render_style', 'home_mystic_roundness',
        'home_mystic_gap', 'home_mystic_timing', 'home_navigation_taxonomy'
    ].forEach((id) => assert.equal(all.some((entry) => entry.id === id), false, id));
    assert.ok(all.some((entry) => entry.id === 'home_handedness'));
    assert.ok(all.some((entry) => entry.id === 'home_accessibility_auditory'));
    assert.ok(all.some((entry) => entry.id === 'home_server_select'));
    assert.equal(fixed[0].id, 'home_session_exit');
    assert.equal(profileDisplayName(state.profile), 'Ada');
});

test('the card of somebody else holds only their shared card and never any setting', () => {
    const profile = normalizeHomeProfile({
        name: 'Grace', nickname: 'Amazing', phone: '0600000000',
        profile: { competences: [{ label: 'COBOL', value: 'Author' }] }
    }, { preserveEmptyItems: true });
    const remote = baseState({ profile, subject: { id: 'remote_user', local: false, editable: false } });
    const nodes = buildHomeContent(remote, { emit: () => {}, bodyWidth: 452, editing });
    const all = flatten(nodes);
    assert.deepEqual(nodes.map((entry) => entry.id), ['home_identity_accordion', 'home_profile_accordion']);
    assert.deepEqual(all.filter((entry) => /^home_identity_[a-z_]+$/.test(entry.id || '') && entry.kind === 'row').map((entry) => entry.id),
        ['home_identity_name', 'home_identity_nickname', 'home_identity_phone'], 'a read-only card shows only what was shared');
    assert.equal(all.some((entry) => entry.id === 'home_display_source' || entry.id === 'home_access_select'), false);
    assert.equal(all.some((entry) => entry.id === 'home_custom_fields_add'), false);
    assert.equal(all.find((entry) => entry.id === 'home_profile_photo').on, undefined, 'a read-only photo is not a picker');

    const local = baseState({ profile, subject: { id: 'local_ada', local: true, editable: true } });
    const localAll = flatten(buildHomeContent(local, { emit: () => {}, bodyWidth: 452, editing }));
    assert.ok(localAll.some((entry) => entry.id === 'home_identity_email'), 'a contact of the address book stays fully editable');
    assert.ok(localAll.some((entry) => entry.id === 'home_custom_fields_add'));
    assert.equal(localAll.some((entry) => entry.id === 'home_settings_accordion'), false);
});

test('only the handedness and the expertise levels remain visual preferences', () => {
    assert.deepEqual(normalizeVisualPreferences({}), {
        handedness: 'right', masteryLevel: 'beginner', activityLevels: {}
    });
    assert.deepEqual(normalizeVisualPreferences({
        handedness: 'left', renderStyle: 'liquid', navigationTaxonomy: 'modern',
        mysticRoundness: 0, mysticTileGap: 4, mysticOpeningMs: 6000, liquidTheme: 'eau'
    }), { handedness: 'left', masteryLevel: 'beginner', activityLevels: {} }, 'retired settings are dropped on the next save');
});

test('the shared card defaults to the name, the first name, the nickname and the photo', () => {
    assert.deepEqual(normalizeHomeProfile({}).sharing.fields, ['name', 'first_name', 'nickname', 'user_face']);
    assert.deepEqual(normalizeHomeProfile({ sharing: { fields: ['phone', 'unknown', 'name'] } }).sharing.fields, ['name', 'phone']);
    assert.deepEqual(normalizeHomeProfile({ sharing: { fields: [] } }).sharing.fields, []);
    assert.deepEqual(normalizeHomeProfile({ custom_fields: [{ label: 'Site', value: 'ada.dev' }] }).custom_fields,
        [{ label: 'Site', value: 'ada.dev' }], 'a save from Home keeps the free fields of the card');
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
        expanded: 'settings',
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
        assert.equal(all.some((entry) => entry.id === `home_key_${id}_status`), true, id);
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
    const all = flatten(buildHomeContent({ ...state, expanded: 'settings' }, {
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

    const homeRuntime = fs.readFileSync(
        new URL('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js', import.meta.url),
        'utf8'
    );
    assert.match(homeRuntime, /state\.profile = mergeHomeProfileUpdate\(state\.profile, event\?\.detail\?\.profile\)/);
});

test('Home list additions retain blank stable rows immediately above the canonical add action', async () => {
    const runtimeSource = fs.readFileSync(new URL('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js', import.meta.url), 'utf8');
    assert.match(runtimeSource, /home\.field\.focus'[\s\S]*`\$\{path\}\.\$\{itemIndex\}\.label`/, 'A newly added Home list row must immediately focus its first canonical field');
    assert.match(runtimeSource, /home\.credential\.add'[\s\S]*home\.field\.focus'[\s\S]*credentials\.\$\{credentialId\}\.name/, 'A newly added credential must immediately focus its name field');
    const sections = [
        ['custom_fields', 'home_custom_fields', 'identity'],
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

test('Home opening geometry follows handedness, side centering and compact mobile sizing', () => {
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
        assert.deepEqual([left.x, left.y, left.width, left.height], [0, 37, 480, 620]);

        setMainMenuRuntime({ handedness: 'right', getReservedHeight: () => 74 });
        const right = resolveBevyPanelGeometry({
            surface: desktopSurface,
            defaultGeometry: homeSurface.defaultGeometry,
            allowMobileFloating: true,
            openAtHandednessEdge: true
        });
        assert.deepEqual([right.x, right.y, right.width, right.height], [544, 37, 480, 620]);

        const mobile = resolveBevyPanelGeometry({
            surface: { getBoundingClientRect: () => ({ width: 390, height: 844 }) },
            defaultGeometry: homeSurface.defaultGeometry,
            allowMobileFloating: true,
            openAtHandednessEdge: true
        });
        assert.deepEqual([mobile.x, mobile.y, mobile.width, mobile.height], [20, 75, 370, 620]);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('stored provider keys show a fixed mask without repopulating the editor or hiding status errors', () => {
    const render = provider => flatten(buildHomeContent(baseState({ expanded: 'settings', vault: {
        credentials: [], providers: [{ id: 'openai', label: 'OpenAI', models: [], ...provider }] }
    }), { emit() {}, bodyWidth: 452, editing }));
    const saved = render({ configured: true });
    const field = saved.find(node => node.id === 'home_key_openai_api_input');
    assert.ok(JSON.stringify(field).includes('••••••••'));
    assert.equal(editing.displayValue('security.aiKeys.openai'), '');
    const unknown = render({ configured: null, error: 'provider_connection_failed' });
    assert.equal(JSON.stringify(unknown).includes('••••••••'), false);
    assert.notDeepEqual(unknown.find(node => node.id === 'home_key_openai_status'), render({ configured: false }).find(node => node.id === 'home_key_openai_status'));
});

test('Home keeps all section headers available while the profile is pending or timed out', () => {
    for (const phase of [{ loading: true }, { loadError: 'Request timeout' }]) {
        const intents = [];
        const nodes = buildHomeContent(baseState(phase), { emit: value => intents.push(value), bodyWidth: 452, editing });
        const all = flatten(nodes);
        assert.equal(all.filter(node => /home_(identity|bio|profile|settings)_accordion$/.test(node.id)).length, 4);
        assert.ok(all.some(node => node.id === 'home_identity_status'));
        if (phase.loadError) assert.ok(all.some(node => node.id === 'home_identity_retry'));
    }
});


test('Home exposes explicit activation for a configured provider without requesting its secret', () => {
    const intents = [];
    const state = baseState({ expanded: 'settings', vault: { credentials: [],
        providers: [{ id: 'openai', label: 'OpenAI', models: [], configured: true }] } });
    const render = () => flatten(buildHomeContent(state, { emit: intent => intents.push(intent), bodyWidth: 452, editing }));
    const button = render().find(node => node.id === 'home_key_openai_active');
    assert.equal(typeof button.on.activate, 'function');
    button.on.activate();
    assert.deepEqual(intents, [{ type: 'home.key.active.set', provider: 'openai' }]);
    state.profile.passkeys.keys = [{ provider: 'openai', model: 'gpt-5.6-sol', active: true }];
    render().find(node => node.id === 'home_key_openai_active').on?.activate?.();
    assert.equal(intents.length, 1);
});
