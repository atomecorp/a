import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const readSource = (path) => readFileSync(new URL(path, root), 'utf8');

const runUnix = readSource('scripts/setup/run_unix.sh');
const runFastify = readSource('scripts/run_fastify.sh');
const runTauri = readSource('scripts/run_tauri.sh');
const serviceCommands = readSource('scripts/setup/service_commands.sh');
const tauriAuthDevice = readSource('platforms/desktop-tauri/src/auth_device.rs');
const loginMethods = readSource('atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js');

const assertTestModeExports = (source, label) => {
    assert.match(source, /TEST_MODE=false/, `${label} must define an explicit test mode flag`);
    assert.match(source, /--test\)[\s\S]*TEST_MODE=true/, `${label} must parse --test`);
    assert.match(source, /NODE_ENV:-\}" == "production"[\s\S]*--test cannot run with NODE_ENV=production/, `${label} must reject NODE_ENV=production`);
    assert.match(source, /export NODE_ENV=test/, `${label} must force NODE_ENV=test`);
    assert.match(source, /export SQUIRREL_AUTH_TEST_MODE=1/, `${label} must export the auth test mode marker`);
    assert.match(source, /export SQUIRREL_AUTH_OTP_BYPASS=1/, `${label} must export the OTP bypass marker`);
};

assert.match(serviceCommands, /--test\s+Launch deterministic local test mode/, 'run.sh help must document --test');
assert.match(serviceCommands, /--auth-local\s+Use local Fastify with simulated SMS validation/, 'run.sh help must document local auth');
assert.match(serviceCommands, /--auth-prod\s+Use atome\.one and send a real, billable SMS/, 'run.sh help must identify billable production SMS');
assert.match(runUnix, /SQUIRREL_AUTH_SMS_MOCK=1/, 'the default full development launch must enable simulated SMS');
assert.match(runUnix, /FASTIFY_URL="http:\/\/127\.0\.0\.1:3001"/, 'local auth must use the local Fastify authority');
assert.match(runUnix, /FASTIFY_URL="https:\/\/atome\.one"/, 'production auth must use atome.one');
assert.match(loginMethods, /SQUIRREL_TAURI_FASTIFY_URL__[\s\S]*127\\\.0\\\.0\\\.1[\s\S]*auth_development_request/, 'the local Tauri client must use the native loopback authentication transport');
assert.match(loginMethods, /tauriInvoke\('auth_local_request', \{ message \}\)/, 'desktop local-session restore must use the native Tauri bridge');
assert.match(tauriAuthDevice, /pub async fn auth_local_request[\s\S]*ws:\/\/127\.0\.0\.1:3000\/ws\/api/, 'the native local auth bridge must target only the private Axum endpoint');
assert.match(tauriAuthDevice, /local-session-describe[\s\S]*local-session-resume[\s\S]*local-session-lock/, 'the native local auth bridge must expose the durable-session lifecycle');
assert.match(tauriAuthDevice, /auth_development_mode_disabled/, 'the native development transport must be gated by the mock-mode environment');
assert.match(tauriAuthDevice, /http:\/\/127\.0\.0\.1[\s\S]*http:\/\/localhost/, 'the native development transport must accept loopback authorities only');
assert.doesNotMatch(runUnix, /--test is forbidden on a production server setup/, 'run_unix must not reject explicit test mode only because a Debian test host uses service-style setup');
assert.match(runUnix, /PROD_BUILD"\s*=\s*true[\s\S]*--test cannot be combined with production build mode/, 'run_unix must reject --test with production builds');

assertTestModeExports(runUnix, 'run_unix');
assertTestModeExports(runFastify, 'run_fastify');
assertTestModeExports(runTauri, 'run_tauri');

assert.match(runUnix, /run_fastify\.sh" --test --force-deps/, 'run_unix must forward --test with --force-deps to Fastify');
assert.match(runUnix, /run_fastify\.sh" --test\s*&?/, 'run_unix must forward --test to Fastify');
assert.match(runUnix, /run_tauri\.sh" --test --force-deps/, 'run_unix must forward --test with --force-deps to Tauri');
assert.match(runUnix, /run_tauri\.sh" --test\s*&?/, 'run_unix must forward --test to Tauri');

assert.doesNotMatch(
    runUnix,
    /lsof\s+-ti:3001\s*\|\s*xargs\s+kill/,
    'run_unix cleanup must stop only its owned Fastify PID and never kill a newer server by port'
);
