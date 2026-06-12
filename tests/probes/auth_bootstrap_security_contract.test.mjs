import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const readSource = (path) => readFileSync(new URL(path, root), 'utf8');
const sliceBetween = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(start, -1, `${startMarker} must exist`);
    assert.notEqual(end, -1, `${endMarker} must exist after ${startMarker}`);
    return source.slice(start, end);
};

const localAuth = readSource('platforms/desktop-tauri/src/server/local_auth.rs');
const tauriBootstrap = sliceBetween(localAuth, 'async fn handle_bootstrap', 'async fn handle_register');
const tauriExistingBranch = sliceBetween(
    tauriBootstrap,
    'if let Some((existing_id, existing_type, deleted_at)) = existing_user',
    'let password_hash = match hash(password, DEFAULT_COST)'
);
assert.match(tauriExistingBranch, /get_user_particles\(&db, &existing_id\)/, 'Tauri bootstrap must read the stored password hash for an existing phone');
assert.match(tauriExistingBranch, /verify\(password, &password_hash\)/, 'Tauri bootstrap must verify the submitted password for an existing phone');
assert.match(tauriExistingBranch, /deleted_at\.is_some\(\)[\s\S]*Invalid credentials/, 'Tauri bootstrap must not reactivate a deleted existing phone with an arbitrary password');
assert.doesNotMatch(tauriExistingBranch, /"password_hash"/, 'Tauri bootstrap existing-phone branch must not write password_hash');
assert.doesNotMatch(tauriExistingBranch, /upsert_required_user_particles/, 'Tauri bootstrap existing-phone branch must not repair credentials by overwriting them');

const fastifyServer = readSource('server/server.js');
const fastifyBootstrapBranch = sliceBetween(fastifyServer, "if (action === 'bootstrap' || action === 'register' || action === 'create-user')", "} else if (action === 'lookup-phone')");
assert.match(fastifyBootstrapBranch, /const isBootstrap = action === 'bootstrap'/, 'Fastify WS auth must expose an explicit bootstrap action');
assert.match(fastifyBootstrapBranch, /verifyPassword\(password, existingUser\.password_hash\)/, 'Fastify bootstrap must verify existing-phone passwords');
assert.match(fastifyBootstrapBranch, /success: false,[\s\S]*alreadyExists: true,[\s\S]*error: 'Invalid credentials'/, 'Fastify register/create must not report existing phone as authenticated');
assert.doesNotMatch(fastifyBootstrapBranch, /message: 'User already exists - ready to login'/, 'Fastify auth must not preserve the former misleading existing-user success message');

const authApi = readSource('atome/src/squirrel/apis/unified/adole_api/auth.js');
assert.match(authApi, /const bootstrapBackend = async/, 'Unified auth API must have a bootstrap backend adapter');
assert.match(authApi, /alreadyExists && !token\) ok = false/, 'Unified register must reject alreadyExists responses that have no token');
assert.match(authApi, /hasAuthenticatedToken\(activeBackend, activeResult\)/, 'Unified auth must require an effective authenticated backend token before installing a session');

const adoleApis = readSource('atome/src/squirrel/apis/unified/adole_apis.js');
assert.match(adoleApis, /bootstrap: auth\.bootstrap/, 'AdoleAPI.auth must expose bootstrap');

const userTool = readSource('eVe/intuition/tools/user.js');
const executeLoginFlow = sliceBetween(userTool, 'const executeLoginFlow = async', 'const executeCreateUserFlow = async');
assert.match(executeLoginFlow, /api\.auth\.bootstrap/, 'Initial login UI must call the atomic bootstrap flow');
assert.doesNotMatch(executeLoginFlow, /api\.auth\.create/, 'Initial login UI must not create after a failed login');
assert.doesNotMatch(executeLoginFlow, /api\.auth\.login/, 'Initial login UI must not split bootstrap into a separate login attempt');

