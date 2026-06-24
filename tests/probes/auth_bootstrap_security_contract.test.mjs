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

const authPhoneVerification = readSource('atome/src/squirrel/apis/unified/adole_api/auth_phone_verification.js');
assert.match(authPhoneVerification, /requestPhoneVerificationBackend/, 'Unified auth API must route pre-auth phone verification through backend adapters');
assert.match(authPhoneVerification, /verifyPhoneVerificationBackend/, 'Unified auth API must route pre-auth phone verification checks through backend adapters');

const adoleApis = readSource('atome/src/squirrel/apis/unified/adole_apis.js');
assert.match(adoleApis, /bootstrap: auth\.bootstrap/, 'AdoleAPI.auth must expose bootstrap');
assert.match(adoleApis, /requestPhoneVerification,[\s\S]*verifyPhoneVerification,/, 'AdoleAPI.auth must expose pre-auth phone verification helpers from the dedicated module');

const fastifyHttpAuth = readSource('server/auth.js');
assert.doesNotMatch(fastifyHttpAuth, /\/api\/auth\/request-phone-verification/, 'Fastify auth must not add HTTP phone verification routes');
assert.doesNotMatch(fastifyHttpAuth, /\/api\/auth\/verify-phone-verification/, 'Fastify auth must not add HTTP phone verification routes');
assert.match(fastifyHttpAuth, /export function enforceAuthIdentityRateLimit/, 'Fastify auth must expose a shared identity rate limiter for WS phone verification');
assert.match(fastifyServer, /action === 'request-phone-verification'/, 'Fastify WS auth must expose phone verification request');
assert.match(fastifyServer, /data\.exposeForTest === true && process\.env\.NODE_ENV !== 'production'[\s\S]*response\.code = code/, 'Fastify WS auth must return OTP code only in non-production test mode');
assert.match(fastifyServer, /enforceAuthIdentityRateLimit\('phone_verification_request', cleanPhone, 3\)/, 'Fastify WS auth must rate-limit phone verification requests');
assert.match(fastifyServer, /enforceAuthIdentityRateLimit\('phone_verification_verify', cleanPhone, 5\)/, 'Fastify WS auth must rate-limit phone verification checks');
assert.match(localAuth, /"request-phone-verification" =>[\s\S]*handle_request_phone_verification/, 'Tauri local auth must expose phone verification request');
assert.match(localAuth, /expose_for_test && !is_production_runtime\(\)/, 'Tauri local auth must return OTP code only in non-production test mode');

const userTool = readSource('eVe/intuition/tools/user_auth_flow_runtime.js');
const executeLoginFlow = sliceBetween(userTool, 'const executeLoginFlow = async', 'return {');
assert.match(executeLoginFlow, /api\.auth\.bootstrap/, 'Initial login UI must call the atomic bootstrap flow');
assert.doesNotMatch(executeLoginFlow, /api\.auth\.create/, 'Initial login UI must not create after a failed login');
assert.doesNotMatch(executeLoginFlow, /api\.auth\.login/, 'Initial login UI must not split bootstrap into a separate login attempt');
const publicBootstrap = sliceBetween(authApi, 'async bootstrap(phone, password, username, visibility =', 'async register');
assert.match(publicBootstrap, /response\.ok = true/, 'Unified bootstrap must expose top-level ok after login or account creation');
assert.match(publicBootstrap, /response\.user = activeResult\.user/, 'Unified bootstrap must expose the authenticated created/logged user');
assert.match(publicBootstrap, /response\.backend = activeBackend/, 'Unified bootstrap must expose the authenticated backend');
