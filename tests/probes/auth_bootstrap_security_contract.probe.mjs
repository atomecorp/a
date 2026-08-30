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
const iosLocalServer = readSource('platforms/ios/atome-auv3/Common/LocalHTTPServer.swift');
const tauriBootstrap = sliceBetween(localAuth, 'async fn handle_bootstrap', 'async fn handle_register');
const tauriExistingBranch = sliceBetween(
    tauriBootstrap,
    'if let Some((existing_id, existing_type, deleted_at)) = existing_user',
    'let password_hash = match hash(password, AUTH_BCRYPT_COST)'
);
assert.match(tauriExistingBranch, /get_user_particles\(&db, &existing_id\)/, 'Tauri bootstrap must read the stored password hash for an existing phone');
assert.match(tauriExistingBranch, /verify\(password, &password_hash\)/, 'Tauri bootstrap must verify the submitted password for an existing phone');
assert.match(tauriExistingBranch, /deleted_at\.is_some\(\)[\s\S]*Invalid credentials/, 'Tauri bootstrap must not reactivate a deleted existing phone with an arbitrary password');
assert.doesNotMatch(tauriExistingBranch, /"password_hash"/, 'Tauri bootstrap existing-phone branch must not write password_hash');
assert.doesNotMatch(tauriExistingBranch, /upsert_required_user_particles/, 'Tauri bootstrap existing-phone branch must not repair credentials by overwriting them');

const fastifyServer = readSource('server/server.js');
const fastifyOtp = readSource('server/auth_otp.js');
const databaseCore = readSource('database/adole_db_core.js');
assert.match(databaseCore, /let transactionTail = Promise\.resolve\(\)/, 'Canonical database transactions must share one serialization queue');
assert.match(databaseCore, /transactionContext\.getStore\(\) === true\) return work\(\)/, 'A nested canonical write must reuse its owning transaction instead of opening a second SQLite transaction');
assert.match(databaseCore, /await previousTransaction[\s\S]*transactionContext\.run\(true,[\s\S]*await db\.beginTransaction\(\)/, 'An independent transaction must wait for its predecessor before opening SQLite state');
assert.match(databaseCore, /finally \{[\s\S]*releaseTransaction\(\)/, 'The transaction queue must advance after both commit and rollback');
const fastifyBootstrapBranch = sliceBetween(fastifyServer, "if (action === 'bootstrap' || action === 'register' || action === 'create-user')", "} else if (action === 'lookup-phone')");
assert.match(fastifyBootstrapBranch, /const isBootstrap = action === 'bootstrap'/, 'Fastify WS auth must expose an explicit bootstrap action');
assert.match(fastifyBootstrapBranch, /verifyPassword\(password, existingUser\.password_hash\)/, 'Fastify bootstrap must verify existing-phone passwords');
assert.ok((fastifyBootstrapBranch.match(/phone: cleanPhone/g) || []).length >= 2, 'Fastify bootstrap must return the verified normalized phone for both existing and newly created principals');
assert.match(fastifyBootstrapBranch, /success: false,[\s\S]*alreadyExists: true,[\s\S]*error: 'Invalid credentials'/, 'Fastify register/create must not report existing phone as authenticated');
assert.doesNotMatch(fastifyBootstrapBranch, /message: 'User already exists - ready to login'/, 'Fastify auth must not preserve the former misleading existing-user success message');
assert.match(fastifyBootstrapBranch, /createUserAtome\(dataSource, userId, cleanUsername, cleanPhone, passwordHash, 'private'/, 'Fastify must ignore legacy public creation input and create every new account privately');
assert.match(fastifyBootstrapBranch, /consumePhoneVerification\(connection, cleanPhone, 'enrollment'\)/, 'Fastify must require a consumed server-side enrollment proof before creating a new principal');
assert.match(fastifyBootstrapBranch, /error: 'phone_verification_required'/, 'Fastify must expose an explicit missing enrollment proof error');
const fastifyStartup = sliceBetween(fastifyServer, 'async function startServer()', 'async function stopFileWatcher()');
assert.ok(
    fastifyStartup.indexOf('await server.listen') < fastifyStartup.indexOf('directoryPublicService.rebuild()'),
    'Fastify must listen before rebuilding the persisted public directory'
);
const authIdentity = readSource('server/auth_identity.js');
assert.match(authIdentity, /INSERT INTO guest_workspace_principals[\s\S]*SELECT a\.atome_id/, 'Credentialless legacy principals must be classified in one bulk insert');
assert.doesNotMatch(authIdentity, /classifyLegacyGuestWorkspace/, 'Per-principal credentialless startup classification must stay removed');

const authApi = readSource('atome/src/squirrel/apis/unified/adole_api/auth.js');
const authLoginMethods = readSource('atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js');
const authBackends = readSource('atome/src/squirrel/apis/unified/adole_api/auth_backends.js');
const authFastifyToken = readSource('atome/src/squirrel/apis/unified/adole_api/auth_fastify_token.js');
const authRemoteProvisioning = readSource('atome/src/squirrel/apis/unified/adole_api/auth_remote_provisioning.js');
const adoleApis = readSource('atome/src/squirrel/apis/unified/adole_apis.js');
assert.match(authLoginMethods, /bootstrapBackend/, 'Unified auth login methods must use the bootstrap backend adapter');
assert.match(authBackends, /alreadyExists && !token\) ok = false/, 'Unified register must reject alreadyExists responses that have no token');
assert.match(authLoginMethods, /hasAuthenticatedToken\(activeBackend, activeResult\)/, 'Unified auth must require an effective authenticated backend token before installing a session');
assert.match(authLoginMethods, /async bootstrap\(phone, password, username, visibility = 'private'\)/, 'Unified bootstrap must create accounts privately unless the user explicitly publishes later');
assert.match(authLoginMethods, /async register\(phone, password, username, visibility = 'private'\)/, 'Unified register must create accounts privately unless the user explicitly publishes later');
assert.doesNotMatch(authLoginMethods, /visibility = 'public'/, 'Unified auth must not retain an implicit public default');
assert.match(authLoginMethods, /createTechnicalUsername\(username, cleanPhone\)/, 'Unified auth must generate a technical username distinct from the login phone');
assert.doesNotMatch(authLoginMethods, /normalizeUsername\(username\) \|\| cleanPhone/, 'Unified auth must never reuse the login phone as a technical username');

const authPhoneVerification = readSource('atome/src/squirrel/apis/unified/adole_api/auth_phone_verification.js');
const adoleAdapter = readSource('atome/src/squirrel/apis/unified/adole_adapter.js');
assert.match(authPhoneVerification, /requestPhoneVerificationBackend/, 'Unified auth API must route pre-auth phone verification through backend adapters');
assert.match(authPhoneVerification, /verifyPhoneVerificationBackend/, 'Unified auth API must route pre-auth phone verification checks through backend adapters');
assert.match(authPhoneVerification, /otpBypassed: isOtpBypassed\(result\)/, 'Unified phone verification must preserve explicit OTP bypass responses from the backend adapter');
const adoleWebSocketMessage = readSource('atome/src/squirrel/apis/unified/adole_websocket_message.js');
assert.match(adoleWebSocketMessage, /otpBypassed: message\.otpBypassed/, 'Unified WebSocket auth response normalization must preserve OTP bypass responses');
const sessionAccountMethods = readSource('atome/src/squirrel/apis/unified/adole_api/auth_methods_session_account.js');
const lookupPhoneMethod = sliceBetween(sessionAccountMethods, 'async lookupPhone(phone)', 'getCurrentInfo()');
assert.match(lookupPhoneMethod, /const backend = getPrimaryBackend\(\)/, 'Unified lookupPhone must resolve the active auth backend');
assert.match(lookupPhoneMethod, /const adapter = adapters\[backend\]/, 'Unified lookupPhone must use the active adapter map');
assert.doesNotMatch(lookupPhoneMethod, /FastifyAdapter\.auth\.lookupPhone/, 'Unified lookupPhone must not force Fastify when Tauri is active');

const fastifyLookupBranch = sliceBetween(fastifyServer, "} else if (action === 'lookup-phone')", "} else if (action === 'delete'");
assert.doesNotMatch(
    fastifyLookupBranch,
    /_wsApiUserId|Authentication is required/,
    'Fastify phone lookup must remain a pre-auth routing check and never act as an authorization decision'
);
const guestStartMethod = sliceBetween(sessionAccountMethods, 'async startGuest', 'async provisionAccount');
assert.match(guestStartMethod, /globalThis\.crypto\?\.randomUUID\?\.\(\)/, 'Guest entry must create an opaque local UUID v4');
assert.doesNotMatch(guestStartMethod, /bootstrapBackend\(/, 'Guest entry must not bootstrap a remote account');
assert.doesNotMatch(sessionAccountMethods, /ensureAnonymousUser/, 'Legacy anonymous-account alias must not remain exposed');
assert.match(localAuth, /const AUTH_BCRYPT_COST: u32 = 10;/, 'Tauri local auth bcrypt cost must match the Fastify auth cost so local bootstrap fits the workspace-open budget');
assert.doesNotMatch(localAuth, /DEFAULT_COST/, 'Tauri local auth must not use bcrypt DEFAULT_COST because it is slower than the Fastify contract');
assert.doesNotMatch(localAuth, /unwrap_or\("public"\)/, 'Tauri account creation must not retain an implicit public default');
assert.match(tauriBootstrap, /let visibility = "private"\.to_string\(\);/, 'Tauri bootstrap must force every new account private');
const tauriRegister = sliceBetween(localAuth, 'async fn handle_register', 'async fn handle_login');
assert.match(tauriRegister, /let visibility = "private"\.to_string\(\);/, 'Tauri register must force every new account private');
assert.doesNotMatch(localAuth, /patch\.insert\("name"\.to_string\(\), JsonValue::String\(username\.to_string\(\)\)\)/, 'Tauri auth projection must not copy the technical username into the profile name');
assert.match(localAuth, /username = format!\("user_\{\}", user_id\)/, 'Tauri registration must replace a phone-shaped username with an opaque technical alias');

assert.match(adoleApis, /bootstrap: auth\.bootstrap/, 'AdoleAPI.auth must expose bootstrap');
assert.match(adoleApis, /requestPhoneVerification,[\s\S]*verifyPhoneVerification,/, 'AdoleAPI.auth must expose pre-auth phone verification helpers from the dedicated module');
assert.match(adoleAdapter, /data\.context === 'login_demo' \? 'enrollment' : data\.context/, 'Fastify adapter must map the legacy login context to the canonical enrollment purpose');
assert.match(adoleAdapter, /action: 'request-phone-verification',[\s\S]*purpose,/, 'Fastify phone verification requests must transmit an explicit purpose');
assert.match(adoleAdapter, /action: 'verify-phone-verification',[\s\S]*purpose/, 'Fastify phone verification checks must transmit the same explicit purpose');

const fastifyHttpAuth = readSource('server/auth.js');
assert.doesNotMatch(fastifyHttpAuth, /\/api\/auth\/request-phone-verification/, 'Fastify auth must not add HTTP phone verification routes');
assert.doesNotMatch(fastifyHttpAuth, /\/api\/auth\/verify-phone-verification/, 'Fastify auth must not add HTTP phone verification routes');
assert.match(fastifyHttpAuth, /export \{[^}]*enforceAuthIdentityRateLimit[^}]*\} from '\.\/auth_otp\.js'/, 'Fastify auth must expose a shared identity rate limiter for WS phone verification');
assert.match(fastifyServer, /action === 'request-phone-verification'/, 'Fastify WS auth must expose phone verification request');
assert.match(fastifyServer, /requestPhoneVerificationDelivery\(\{[\s\S]*exposeForTest: data\.exposeForTest === true/, 'Fastify WS auth must delegate OTP transport to the canonical auth owner');
assert.match(fastifyServer, /if \(delivery\.code\) response\.code = delivery\.code/, 'Fastify WS auth must preserve an explicitly authorized displayed OTP');
assert.match(fastifyServer, /if \(purpose === 'enrollment'\) markPhoneVerification\(connection, cleanPhone, purpose\)/, 'Fastify must bind successful enrollment verification to the active connection');
assert.match(fastifyOtp, /process\.env\.NODE_ENV !== 'production' && process\.env\.SQUIRREL_AUTH_OTP_BYPASS === '1'/, 'Fastify OTP bypass must remain explicitly gated outside production');
assert.match(fastifyOtp, /purpose === 'enrollment' && process\.env\.SQUIRREL_AUTH_ENROLLMENT_OTP_DISPLAY === '1'/, 'Production OTP display must be explicitly limited to enrollment');
assert.match(fastifyOtp, /isEnrollmentOtpDisplayEnabled\(purpose\)[\s\S]*delivery: 'display'/, 'Enrollment display mode must return the generated OTP through the existing response contract');
assert.match(fastifyOtp, /otpStore\.delete\(otpKey\(phone, purpose\)\)[\s\S]*otp_delivery_unavailable/, 'Failed OTP delivery must remove the undelivered code and return a stable cause');
assert.match(fastifyOtp, /const otpKey = \(phone, purpose = 'legacy'\)[\s\S]*verifyOTP\(phone, code, purpose = 'legacy'\)/, 'OTP storage and verification must remain isolated by purpose');
assert.match(fastifyServer, /enforceAuthIdentityRateLimit\('phone_verification_request', cleanPhone, 3\)/, 'Fastify WS auth must rate-limit phone verification requests');
assert.match(fastifyServer, /enforceAuthIdentityRateLimit\('phone_verification_verify', cleanPhone, 5\)/, 'Fastify WS auth must rate-limit phone verification checks');
assert.match(localAuth, /"request-phone-verification" =>[\s\S]*handle_request_phone_verification/, 'Tauri local auth must expose phone verification request');
assert.match(localAuth, /expose_for_test && !is_production_runtime\(\)/, 'Tauri local auth must return OTP code only in non-production test mode');
assert.match(localAuth, /fn auth_otp_bypass_enabled\(\) -> bool[\s\S]*!is_production_runtime\(\)[\s\S]*SQUIRREL_AUTH_OTP_BYPASS/, 'Tauri OTP bypass must be explicitly gated outside production');
assert.match(localAuth, /#\[serde\(rename = "otpBypassed", skip_serializing_if = "Option::is_none"\)\][\s\S]*pub otp_bypassed: Option<bool>/, 'Tauri auth responses must expose the camelCase OTP bypass contract');
assert.match(localAuth, /if auth_otp_bypass_enabled\(\)[\s\S]*return AuthResponse[\s\S]*otp_bypassed: Some\(true\)/, 'Tauri test mode must return an explicit OTP bypass response');
assert.match(iosLocalServer, /case "request-phone-verification":[\s\S]*handleRequestPhoneVerification/, 'iOS local auth must expose phone verification request');
assert.match(iosLocalServer, /case "verify-phone-verification":[\s\S]*handleVerifyPhoneVerification/, 'iOS local auth must expose phone verification verification');
assert.match(iosLocalServer, /exposeForTest && !isProductionRuntime\(\)/, 'iOS local auth must return OTP code only in non-production test mode');
assert.match(iosLocalServer, /ProcessInfo\.processInfo\.environment\["SQUIRREL_AUTH_OTP_BYPASS"\]/, 'iOS OTP bypass must be explicitly environment gated');
assert.match(iosLocalServer, /if let otpBypassed \{ response\["otpBypassed"\] = otpBypassed \}/, 'iOS auth responses must expose the camelCase OTP bypass contract');

const userTool = readSource('eVe/intuition/tools/user_home_panel_runtime.js');
const executeLoginFlow = sliceBetween(userTool, 'const executeLoginFlow = async', 'setSharedLoginHandlers({');
assert.match(executeLoginFlow, /api\.auth\.bootstrap/, 'Initial login UI must call the atomic bootstrap flow');
assert.doesNotMatch(executeLoginFlow, /api\.auth\.create/, 'Initial login UI must not create after a failed login');
assert.doesNotMatch(executeLoginFlow, /api\.auth\.login/, 'Initial login UI must not split bootstrap into a separate login attempt');
assert.match(executeLoginFlow, /api\.auth\.bootstrap\(phone, password, username \|\| '', 'private'\)/, 'Initial login UI must create a private account without copying the phone into username');
assert.match(executeLoginFlow, /void openAuthenticatedWorkspace\(\)/, 'Authenticated session completion must not wait on Dashboard/project bootstrap');
const publicBootstrap = sliceBetween(authLoginMethods, 'async bootstrap(phone, password, username, visibility =', 'async register');
assert.match(publicBootstrap, /response\.ok = true/, 'Unified bootstrap must expose top-level ok after login or account creation');
assert.match(publicBootstrap, /response\.user = activeResult\.user/, 'Unified bootstrap must expose the authenticated created/logged user');
assert.match(publicBootstrap, /response\.backend = activeBackend/, 'Unified bootstrap must expose the authenticated backend');
assert.match(authLoginMethods, /repairMissingFastifyCounterpart/, 'A valid local login must repair a missing Fastify counterpart');
assert.match(authFastifyToken, /remote_counterpart_provisioned/, 'A restored Tauri session must repair its Fastify counterpart before directory reads');
assert.match(authFastifyToken, /createTechnicalUsername\(/, 'Restored Tauri sessions must generate a phone-safe technical username for remote provisioning');
assert.doesNotMatch(authFastifyToken, /localSession\.user\.username \|\| cached\.phone/, 'Restored Tauri sessions must never use the cached phone as technical username');
assert.doesNotMatch(authLoginMethods, /loggedUser\?\.username \|\| cleanPhone/, 'Cross-backend login repair must never use the login phone as technical username');
assert.match(authRemoteProvisioning, /crypto\.subtle\.verify/, 'Remote provisioning must verify the server signature locally');
assert.match(authRemoteProvisioning, /remote_identity_fingerprint_mismatch/, 'Remote provisioning must bind the verified key to its fingerprint');
assert.match(authRemoteProvisioning, /getFastifyHttpBaseUrl/, 'Remote identity verification must use the canonical HTTP\/HTTPS Fastify base');
assert.doesNotMatch(authRemoteProvisioning, /FastifyAdapter\?\.baseUrl/, 'Remote identity verification must never derive a fetch URL from the WebSocket adapter base');
assert.match(authRemoteProvisioning, /username: createTechnicalUsername\(username, normalizedPhone\)/, 'Remote provisioning must derive its technical username through the canonical phone-safe generator');
assert.doesNotMatch(authRemoteProvisioning, /username: String\(username[^\n]*\|\| normalizedPhone/, 'Remote provisioning must never fall back directly to the verified phone');
assert.match(authRemoteProvisioning, /provisionAccount/, 'Remote repair must use the dedicated idempotent provisioning contract');
assert.doesNotMatch(authRemoteProvisioning, /\.register\(/, 'Remote repair must not bypass enrollment through raw registration');
assert.doesNotMatch(readSource('server/wsApiAuthProvisioning.js'), /String\(message\.username \|\| ''\)\.trim\(\) \|\| phone/, 'Fastify provisioning must never use the verified phone as technical username');
assert.match(adoleApis, /directory:[\s\S]*ensureFastifyToken/, 'Public directory reads must prepare the authenticated Fastify identity');
