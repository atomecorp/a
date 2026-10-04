import fs from 'node:fs';
import vm from 'node:vm';
import { test, expect } from 'vitest';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tauri injects the production authentication authority in debug and release builds', () => {
    const source = read('platforms/desktop-tauri/src/lib.rs');
    const owner = source.slice(source.indexOf('fn configured_tauri_fastify_url'), source.indexOf('fn tauri_runtime_init_script'));
    expect(owner).toContain('Some("https://atome.one".to_string())');
    expect(owner).not.toContain('cfg!(debug_assertions)');
});

test('native restart restores an unlocked grant from SQLite and its exact keystore scope', () => {
    const browser = read('atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js');
    const device = read('atome/src/squirrel/security/auth_device.js');
    const rust = read('platforms/desktop-tauri/src/server/local_auth_device.rs');
    const swift = read('platforms/ios/atome-auv3/Common/AiSRuntimeAuthChallenges.swift');
    const iosBridge = read('platforms/ios/atome-auv3/Common/WebViewManagerIPC.swift');
    const iosOriginGate = read('platforms/ios/atome-auv3/Common/WebViewManagerScriptMessages.swift');
    expect(browser).toMatch(/local-session-describe[\s\S]*record = described\.localGrant/);
    expect(browser).toMatch(/__ATOME_IOS_NATIVE_INVOKE\('auth_local_request'/);
    expect(browser).toMatch(/record\.scope \? await store\.forScope\(record\.scope\)/);
    expect(device).toContain('async function forScope(scope)');
    expect(rust).toContain('"local-session-describe" => describe(message, state)');
    expect(swift).toContain('static func localAuthDescriptor');
    expect(iosBridge).toMatch(/command == "auth_local_request"[\s\S]*AiSRuntime\.handleAuthMessage/);
    expect(iosOriginGate).toMatch(/auth_link_take" \|\| command == "auth_local_request"/);
});

test('desktop public-key requests satisfy the complete Tauri command contract', () => {
    const browser = read('atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js');
    expect(browser).toMatch(/invoke\('auth_device_key', \{[\s\S]*message: fields\.message \?\? null,[\s\S]*signature: fields\.signature \?\? null/);
});

test('local binding compares the enrolled key id without exporting a persisted macOS public key', () => {
    const browser = read('atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js');
    const rust = read('platforms/desktop-tauri/src/server/local_auth_device.rs');
    expect(browser).toMatch(/fields = \{ scope: device\.scope, keyId: device\.keyId/);
    expect(rust).toMatch(/let key_id = key_id\(message\)\?[\s\S]*response\["challenge"\]\["keyId"\] != key_id/);
    expect(rust).toMatch(/session-local-bind[\s\S]*response\["keyId"\] != key_id/);
    expect(rust).not.toContain('external_representation');
});

test('Tauri selects a rustls provider before native authentication opens TLS', () => {
    const manifest = read('platforms/desktop-tauri/Cargo.toml');
    const runtime = read('platforms/desktop-tauri/src/lib.rs');
    expect(manifest).toMatch(/rustls = \{ version = "0\.23"[^\n]*features = \["ring", "std", "tls12"\]/);
    const run = runtime.slice(runtime.indexOf('pub fn run()'));
    expect(run.indexOf('ring::default_provider().install_default()'))
        .toBeLessThan(run.indexOf('tauri::Builder::default()'));
});

test('desktop can finish a cached remote session after local binding was interrupted without changing iOS', () => {
    const login = read('atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js');
    const session = read('atome/src/squirrel/apis/unified/adole_api/auth_methods_session_account.js');
    expect(login).toMatch(/recoverDesktopAuthorization[\s\S]*__ATOME_IOS_NATIVE_INVOKE[\s\S]*attempted: false/);
    expect(login).toMatch(/deviceStore\(\)\.read\('session'\)[\s\S]*phoneLinkClient\(\)\.renew\(\)/);
    expect(session).toMatch(/initializePhoneLinks\(\)[\s\S]*recoverDesktopAuthorization\(\)[\s\S]*recovered\.authenticated/);
});

test('desktop reloads the persisted public key item instead of deriving it from a reloaded private reference', () => {
    const rust = read('platforms/desktop-tauri/src/auth_device.rs');
    expect(rust).toMatch(/fn public_key\(scope: &str\)[\s\S]*KeyClass::public\(\)[\s\S]*load_refs\(true\)/);
    expect(rust).toMatch(/if action == "public"[\s\S]*let public = public_key\(scope\)/);
    expect(rust).toMatch(/if action == "verify"[\s\S]*let public = public_key\(scope\)/);
    expect(rust).not.toContain('key.public_key()');
});

test('an active guest is resumable while a new guest cannot claim an existing account', () => {
    const rust = read('platforms/desktop-tauri/src/server/local_auth.rs');
    const swift = read('platforms/ios/atome-auv3/Common/AiSRuntimeAuthAccounts.swift');
    expect(rust.indexOf('status.as_deref() != Some("active")')).toBeLessThan(rust.indexOf('SELECT 1 FROM atomes'));
    expect(swift).toMatch(/if let status[\s\S]*guard status == "active"[\s\S]*findUserRecordById/);
    expect(swift).toMatch(/claims\["grant"\] == nil[\s\S]*"username": "Guest"/);
});


test('failed desktop session recovery settles authentication instead of blocking login', async () => {
    const source = read('atome/src/squirrel/apis/unified/adole_api/auth_methods_session_account.js')
        .replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '')
        .replace('export const sessionAccountMethods', 'const sessionAccountMethods');
    let settled = 0;
    const context = {
        loadSessionState: () => ({ mode: 'logged_out' }),
        restoreLocalAuthorization: async () => ({ authenticated: false }),
        initializePhoneLinks: async () => {},
        recoverDesktopAuthorization: async () => ({ authenticated: false, attempted: true, error: 'auth_session_invalid' }),
        getSessionState: () => ({ mode: 'logged_out' }),
        clearSessionState: () => { settled++; },
        ensureFastifyToken: () => { throw new Error('must not authorize failed recovery'); }
    };
    const method = source.slice(source.indexOf('async tryAutoLogin()'), source.indexOf('async startGuest(')).trim().replace(/,$/, '');
    const methods = vm.runInNewContext(`({${method}})`, context);
    const result = await methods.tryAutoLogin();
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe('auth_session_invalid');
    expect(settled).toBe(1);
});

test('the canonical background starts before login can request its first pixels', () => {
    const source = read('eVe/eVe.js');
    const critical = source.slice(source.indexOf('const eveSequentialModules'), source.indexOf('const eveDeferredModules'));
    const deferred = source.slice(source.indexOf('const eveDeferredModules'), source.indexOf('let deferredModulesPromise'));
    expect(critical.indexOf("id: 'eve.user_background'")).toBeGreaterThanOrEqual(0);
    expect(critical.indexOf("id: 'eve.user_background'")).toBeLessThan(critical.indexOf("id: 'eve.bootstrap'"));
    expect(deferred).not.toContain("id: 'eve.user_background'");
});
