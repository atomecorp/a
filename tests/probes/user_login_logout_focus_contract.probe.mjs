import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routeSource = await readFile(new URL('../../eVe/intuition/tools/user_home_panel_runtime.js', import.meta.url), 'utf8');
const userToolSource = await readFile(new URL('../../eVe/intuition/tools/user.js', import.meta.url), 'utf8');
const homeViewSource = await readFile(new URL('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_view.js', import.meta.url), 'utf8');
const sequenceSource = await readFile(new URL('../../eVe/intuition/tools/user_login_sequence.js', import.meta.url), 'utf8');

assert.doesNotMatch(homeViewSource, /home_session_exit/,
    'logging out is the Atom gesture of the Dashboard, never a Home panel button');
assert.match(userToolSource, /logoutHomeSession\(\{ guest: mode === 'anonymous' \}\)/,
    'the logout gesture must call the canonical session owner (account or guest)');
assert.match(routeSource, /'squirrel:user-logged-out'/,
    'the shell must react to the canonical logout event');
assert.match(routeSource, /openLogin\(\{ reset: true, route: 'auth_logout' \}\)/,
    'logout must reopen and focus the existing Login application shell');
assert.doesNotMatch(routeSource, /eve_user_dialog|userDialog|authDialog/,
    'logout must not revive the deleted Home HTML dialog');
assert.match(sequenceSource, /close: flow.close/,
    'logout must release the canonical first-launch owner');
assert.match(sequenceSource, /open: \(\) => flow.open\(\)/,
    'reentry must use the same canonical Matrix composition');
console.log('user_login_logout_focus_contract.test: PASS');
