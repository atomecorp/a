import assert from 'node:assert/strict';

import { createGlobalSecurityApi } from './bootstrap.js';

const env = {};
const api = createGlobalSecurityApi({ env });

assert.equal(env.Squirrel.security, api, 'security bootstrap should expose a global Squirrel security API');
assert.equal(env.atome.security, api, 'security bootstrap should expose a global atome security API');
assert.equal(env.atome.tools.security, api, 'security bootstrap should expose security under atome.tools');

assert.equal(api.vaultStatus().configured, false, 'security bootstrap should start with an unconfigured token vault');
assert.equal(api.configureVaultSecret('bootstrap-secret').configured, true, 'security bootstrap should configure the token vault secret');

const stored = await api.storeToken('calendar_auth_primary', {
    username: 'user@icloud.test',
    appPassword: 'calendar-password'
}, {
    provider: 'icloud_caldav_legacy'
});
assert.equal(stored.ok, true, 'security bootstrap should expose encrypted token storage');

const read = await api.readToken('calendar_auth_primary');
assert.equal(read.ok, true, 'security bootstrap should expose encrypted token retrieval');
assert.equal(read.value?.appPassword, 'calendar-password', 'security bootstrap should round-trip encrypted token values');

console.log('security_bootstrap: ok');
