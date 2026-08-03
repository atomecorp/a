import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const userSource = readFileSync('eVe/intuition/tools/user.js', 'utf8');
const routeSource = readFileSync('eVe/intuition/tools/user_home_panel_runtime.js', 'utf8');
const surfaceSource = readFileSync('eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js', 'utf8');
const viewSource = readFileSync('eVe/intuition/runtime/bevy_panel/bevy_panel_home_view.js', 'utf8');
const definitions = readFileSync('eVe/intuition/panel_definitions.js', 'utf8');

assert.match(userSource, /window\.open_home_panel = open_home_panel/);
assert.match(userSource, /bevy_panel_surfaces\.js/);
assert.match(routeSource, /openBevyPanelSurface\('home'/);
assert.match(routeSource, /ensureSharedLoginSequence/);
assert.match(routeSource, /api\.security\.startGuest/);
assert.match(routeSource, /api\.auth\.bootstrap/);
assert.match(definitions, /surface_id: 'eve_bevy_panel_home'/);
assert.doesNotMatch(definitions, /eve_user_dialog/);

['identity', 'bio', 'profile', 'passkeys', 'preferences', 'security']
    .forEach((section) => assert.match(viewSource, new RegExp(`\\['${section}'`)));
assert.match(viewSource, /id: `home_\$\{key\}_accordion`/);
assert.match(viewSource, /id: 'home_session_exit'/);
assert.match(viewSource, /id: 'home_credentials_add'/);
assert.match(viewSource, /id: 'home_passwords_accordion'/);
assert.match(viewSource, /id: 'home_keys_accordion'/);
assert.doesNotMatch(viewSource, /home_ai_|home_professional|eve\.user\.pro\.label/);

assert.match(surfaceSource, /persistHomeProfile/);
assert.match(surfaceSource, /changeHomePassword/);
assert.match(surfaceSource, /deleteHomeAccount/);
assert.doesNotMatch(surfaceSource, /localStorage|sessionStorage|innerHTML|querySelector|createElement/);

[
    'user_dialogs_runtime.js',
    'user_identity_fields_runtime.js',
    'user_profile_sections_runtime.js',
    'user_photo_runtime.js',
    'user_visual_preferences_runtime.js',
    'user_dashboard_preferences_runtime.js',
    'user_accessibility_preferences_runtime.js',
    'user_mail_preferences_runtime.js',
    'user_action_buttons_runtime.js',
    'user_panel_mode_runtime.js',
    'user_profile_lifecycle_runtime.js',
    'user_profile_model.js',
    'user_ai_catalog_runtime.js',
    'user_auth_flow_runtime.js',
    'user_background_actions.js',
    'user_background_language_preferences.js',
    'user_custom_field_list.js',
    'user_panel_reset_runtime.js',
    'user_preferences_cache_runtime.js',
    'user_server_preferences.js',
    'user_server_runtime.js'
].forEach((file) => assert.equal(existsSync(`eVe/intuition/tools/${file}`), false, `${file} must be deleted`));

console.log('user_panel_content_contract.test: PASS');
