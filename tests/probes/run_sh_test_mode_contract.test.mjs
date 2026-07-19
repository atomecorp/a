import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const readSource = (path) => readFileSync(new URL(path, root), 'utf8');

const runUnix = readSource('scripts/setup/run_unix.sh');
const runFastify = readSource('scripts/run_fastify.sh');
const runTauri = readSource('scripts/run_tauri.sh');
const serviceCommands = readSource('scripts/setup/service_commands.sh');

const assertTestModeExports = (source, label) => {
    assert.match(source, /TEST_MODE=false/, `${label} must define an explicit test mode flag`);
    assert.match(source, /--test\)[\s\S]*TEST_MODE=true/, `${label} must parse --test`);
    assert.match(source, /NODE_ENV:-\}" == "production"[\s\S]*--test cannot run with NODE_ENV=production/, `${label} must reject NODE_ENV=production`);
    assert.match(source, /export NODE_ENV=test/, `${label} must force NODE_ENV=test`);
    assert.match(source, /export SQUIRREL_AUTH_TEST_MODE=1/, `${label} must export the auth test mode marker`);
    assert.match(source, /export SQUIRREL_AUTH_OTP_BYPASS=1/, `${label} must export the OTP bypass marker`);
};

assert.match(serviceCommands, /--test\s+Launch local test mode and bypass pre-auth OTP verification/, 'run.sh help must document --test');
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
