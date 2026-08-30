import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routeSource = await readFile(new URL('../../eVe/intuition/tools/user_home_panel_runtime.js', import.meta.url), 'utf8');
const homeRuntimeSource = await readFile(new URL('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js', import.meta.url), 'utf8');
const homeViewSource = await readFile(new URL('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_view.js', import.meta.url), 'utf8');
const credentialSource = await readFile(new URL('../../eVe/intuition/tools/user_login_credentials.js', import.meta.url), 'utf8');

assert.match(homeViewSource, /id: 'home_session_exit'/,
    'the Bevy Home fixed action surface must own logout/guest exit');
assert.match(homeRuntimeSource, /logoutHomeSession\(\{ guest: state\.guest \}\)/,
    'Home logout must call the canonical session owner');
assert.match(homeRuntimeSource, /closeBevyPanelSurface\('home'/,
    'logout must close the Bevy Home surface');
assert.match(routeSource, /'squirrel:user-logged-out'/,
    'the shell must react to the canonical logout event');
assert.match(routeSource, /openLogin\(\{ reset: true, route: 'auth_logout' \}\)/,
    'logout must reopen and focus the existing Login application shell');
assert.doesNotMatch(routeSource, /eve_user_dialog|userDialog|authDialog/,
    'logout must not revive the deleted Home HTML dialog');
assert.match(credentialSource, /resetCredentialAnimations\(\{ surface, topBand, middle, bottomBand, instruction, typedText, sessionOpening \}\)/,
    'every credential reopen must cancel retained transient animations');
assert.match(credentialSource, /if \(!isCurrentSurfaceGeneration\(generation\)\) return false;/,
    'a completed animation from an older surface generation must not hide the reopened Login');

console.log('user_login_logout_focus_contract.test: PASS');
