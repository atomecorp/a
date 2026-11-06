import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const webViewManagerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/WebViewManager.swift', import.meta.url), 'utf8');
const webViewBootSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/WebViewManagerBoot.swift', import.meta.url), 'utf8');
const webViewFactorySource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/WKWebViewFactory.swift', import.meta.url), 'utf8');
const webViewScriptMessagesSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/WebViewManagerScriptMessages.swift', import.meta.url), 'utf8');
const webViewNavigationSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/WebViewManagerNavigation.swift', import.meta.url), 'utf8');
const featureFlagsSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/FeatureFlags.swift', import.meta.url), 'utf8');
const appViewControllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/application/ViewController.swift', import.meta.url), 'utf8');
const appDelegateSource = await readFile(new URL('../../platforms/ios/atome-auv3/application/AppDelegate.swift', import.meta.url), 'utf8');
const fileManagerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/iCloudFileManager.swift', import.meta.url), 'utf8');
const projectSceneEngineSource = await readFile(new URL('../../eVe/domains/rendering/project_scene_engine.js', import.meta.url), 'utf8');
const projectSceneBevyProjectionSource = await readFile(new URL('../../eVe/domains/rendering/project_scene_bevy_projection_runtime.js', import.meta.url), 'utf8');
const toolGenesisCreateSource = await readFile(new URL('../../eVe/intuition/runtime/tool_genesis_create_runtime.js', import.meta.url), 'utf8');
const projectSource = await readFile(new URL('../../platforms/ios/atome-auv3/atome.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
const workspaceCargoSource = await readFile(new URL('../../Cargo.toml', import.meta.url), 'utf8');
const iosBevyCargoSource = await readFile(new URL('../../platforms/ios/bevy-renderer/Cargo.toml', import.meta.url), 'utf8');
const iosBevyFfiSource = await readFile(new URL('../../platforms/ios/bevy-renderer/src/lib.rs', import.meta.url), 'utf8');
const iosBevyBuildScriptSource = await readFile(new URL('../../platforms/ios/build_bevy_renderer.sh', import.meta.url), 'utf8');
const bridgingHeaderSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/AtomeAUv3BridgingHeader.h', import.meta.url), 'utf8');
const audioSchemeHandlerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/AudioSchemeHandler.swift', import.meta.url), 'utf8');
const midiControllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/MIDIController.swift', import.meta.url), 'utf8');
const iosPackagerSource = await readFile(new URL('../../platforms/ios/package_ios_runtime.mjs', import.meta.url), 'utf8');
const eveEntrySource = await readFile(new URL('../../eVe/eVe.js', import.meta.url), 'utf8');
const audioApiSource = await readFile(new URL('../../eVe/domains/media/api/audio_api.js', import.meta.url), 'utf8');
const webBevyBuildScriptSource = await readFile(new URL('../../platforms/web/bevy-renderer/build.sh', import.meta.url), 'utf8');

test('iOS app boot keeps file reconciliation off the startup main thread', () => {
    assert.equal(
        appDelegateSource.includes('init() {\n        // Initialiser les fichiers au démarrage'),
        false,
        'the SwiftUI app initializer must not synchronously reconcile files before the WebView exists'
    );
    assert.equal(
        webViewManagerSource.includes('iCloudFileManager.shared.initializeFileStructure()'),
        false,
        'WebView setup must not block first navigation on file structure initialization'
    );
    assert.equal(
        fileManagerSource.includes('syncFromAppGroupsToVisibleDocuments'),
        false,
        'legacy app-group copying must not duplicate FileSyncCoordinator during boot'
    );
    assert.equal(
        fileManagerSource.includes('syncFromVisibleDocumentsToAppGroups'),
        false,
        'legacy reverse copying must not duplicate FileSyncCoordinator during boot'
    );
    assert.match(
        fileManagerSource,
        /initializationQueue\.async[\s\S]*?FileSyncCoordinator\.shared\.syncAll\(force: true\)/,
        'directory setup and canonical reconciliation must execute asynchronously in one ordered lane'
    );
});

test('iOS app boot loads immediately and diagnoses inactivity instead of elapsed time', () => {
    assert.equal(
        appViewControllerSource.includes('DispatchQueue.main.async {\n            WebViewManager.setupWebView'),
        false,
        'viewDidLoad must configure the WebView immediately on the main thread'
    );
    assert.ok(
        appViewControllerSource.includes('WebViewManager.triggerMainLoadNow()'),
        'viewDidAppear must trigger the first load as soon as the WebView is visible'
    );
    assert.equal(
        appViewControllerSource.includes('asyncAfter(deadline: .now() + 8'),
        false,
        'the app must not turn a live cold WebKit launch into a terminal eight-second failure'
    );
    assert.ok(
        appViewControllerSource.includes('WebViewManager.startBootWatchdog()'),
        'the app must arm the progress-aware boot watchdog'
    );
    assert.match(
        webViewBootSource,
        /coldWebKitGrace: TimeInterval = 20[\s\S]*?activeBootStallLimit: TimeInterval = 8/,
        'cold WebKit process creation needs a distinct grace period from an active stalled boot'
    );
    assert.ok(
        webViewBootSource.includes('noteProgress(_ milestone: String'),
        'each native or JavaScript milestone must refresh the inactivity watchdog'
    );
    assert.match(
        webViewBootSource,
        /func reportBootStall\(\)[\s\S]*?bootWatchdog\.cancel\(\)[\s\S]*?bootFailureHandler\?\("boot_stalled", report\)/,
        'an inactivity warning must remain observable without becoming a terminal boot failure'
    );
    assert.equal(
        /func reportBootStall\(\)[\s\S]*?bootTerminalFailure\s*=\s*true/.test(webViewBootSource),
        false,
        'a slow but live boot must still be allowed to publish presentation readiness'
    );
    assert.match(
        appViewControllerSource,
        /reason == "boot_stalled"[\s\S]*?showBootDelayWarning\(\)/,
        'the app must render a boot delay as a non-blocking warning'
    );
    assert.match(
        appViewControllerSource,
        /func showBootDelayWarning\(\)[\s\S]*?bootOverlay\.backgroundColor = \.clear[\s\S]*?bootOverlay\.isUserInteractionEnabled = false/,
        'the delay warning must reveal the WebView and let real touches reach it'
    );
    assert.ok(
        // The boot and its retry live in WebViewManagerBoot.swift.
        webViewBootSource.includes('webView.stopLoading()'),
        'an explicit retry must stop the previous navigation before starting another one'
    );
    assert.equal(
        webViewManagerSource.includes('asyncAfter(deadline: .now() + 0.03'),
        false,
        'the first main-page load must not include a fixed startup delay'
    );
});

test('iOS Panel Lab remains explicit opt-in even in development builds', () => {
    assert.match(
        featureFlagsSource,
        /#if DEBUG\s+static var panelLabEnabled:[\s\S]*?-AtomePanelLab[\s\S]*?ATOME_IOS_PANEL_LAB[\s\S]*?#else\s+static let panelLabEnabled: Bool = false/,
        'Panel Lab must require an explicit iOS Debug argument or environment opt-in'
    );
    assert.ok(
        webViewManagerSource.includes('let panelLabBootstrap = FeatureFlags.panelLabEnabled'),
        'The shared iOS WebView bootstrap must consume the Debug-only Panel Lab flag'
    );
    assert.ok(
        webViewManagerSource.includes('window.__EVE_PANEL_LAB__ = true;'),
        'Debug iOS WebViews must expose the existing internal Panel Lab gate'
    );
    assert.equal(
        webViewNavigationSource.includes('creerDivRouge'),
        false,
        'installed iOS builds must not dispatch the historical red-div smoke-test IPC'
    );
    assert.ok(
        webViewManagerSource.indexOf('\\(panelLabBootstrap)')
            < webViewManagerSource.indexOf('WKUserScript(source: scriptSource, injectionTime: .atDocumentStart'),
        'The Panel Lab gate must be part of the document-start bootstrap before eVe modules run'
    );
});

// iOS draws through the Web renderer WASM in its WebView: the staticlib's Bevy probe ABI (`atome_ios_bevy_*`), its
// header and its Bevy core dependency were removed with their last Swift caller (R-118 follow-up, 2026-11-06).
test('iOS links one Rust staticlib for the audio engine and the local server, without Bevy', () => {
    assert.ok(
        iosBevyCargoSource.includes('crate-type = ["staticlib"]'),
        'the iOS Rust library must build as a native staticlib for Xcode'
    );
    assert.equal(iosBevyCargoSource.includes('atome-bevy-renderer-core'), false, 'the iOS staticlib must not link the Bevy core');
    assert.ok(
        iosBevyFfiSource.includes('mod audio;') && iosBevyFfiSource.includes('mod local_server;'),
        'the iOS staticlib must hold the audio engine and the local server ABIs'
    );
    assert.equal(iosBevyFfiSource.includes('atome_ios_bevy_'), false, 'the dead native Bevy probe ABI must not return');
    assert.equal(
        existsSync(new URL('../../platforms/ios/atome-auv3/Common/AtomeIosBevyRendererBridge.h', import.meta.url)),
        false,
        'the dead native Bevy probe header must not return'
    );
    assert.ok(
        bridgingHeaderSource.includes('AtomeIosAudioEngineBridge.h') && bridgingHeaderSource.includes('AtomeIosLocalServerBridge.h'),
        'Swift must import the Rust audio engine and local server ABIs'
    );
    assert.equal(bridgingHeaderSource.includes('AtomeIosBevyRendererBridge.h'), false, 'Swift must not import a native Bevy ABI');
    assert.ok(
        projectSource.includes('Build iOS Bevy Renderer'),
        'Xcode must build the Rust staticlib before Swift links'
    );
    assert.ok(
        projectSource.includes('sh \\"$SRCROOT/../build_bevy_renderer.sh\\"'),
        'Xcode must run the Rust build script through sh so checkout file modes cannot break the phase'
    );
    assert.ok(
        iosBevyBuildScriptSource.includes('export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"'),
        'Rust build script must work from the Xcode GUI environment without relying on an interactive shell PATH'
    );
    assert.ok(
        iosBevyBuildScriptSource.includes('[IOS_BEVY_BUILD] fatal cargo not found'),
        'Rust build script must emit an actionable Xcode-console error when cargo is unavailable'
    );
    assert.ok(
        // The workspace's named iOS profiles own the panic strategy (root Cargo.toml).
        /\[profile\.ios\][^[]*panic = "abort"/.test(workspaceCargoSource)
            && /\[profile\.ios-dev\][^[]*panic = "abort"/.test(workspaceCargoSource),
        'iOS Rust staticlib must not unwind through the Swift C ABI boundary'
    );
    assert.ok(
        /\[profile\.ios\][^[]*strip = "debuginfo"/.test(workspaceCargoSource)
            && /\[profile\.ios-dev\][^[]*strip = "debuginfo"/.test(workspaceCargoSource),
        'iOS Rust staticlib must not inject full Rust debuginfo into Xcode link products'
    );
    assert.ok(
        iosBevyBuildScriptSource.includes('-C force-unwind-tables=no'),
        'iOS Rust staticlib must avoid forced unwind tables that overflow ld compact unwind encoding'
    );
    assert.match(
        iosBevyBuildScriptSource,
        // The workspace's named profiles (root Cargo.toml): `ios` by default, `ios-dev` on request.
        /PROFILE_DIR=ios\n[\s\S]*?--profile "\$PROFILE_DIR"/,
        'normal Xcode installs must link the optimized Rust archive'
    );
    assert.match(
        iosBevyBuildScriptSource,
        /ATOME_IOS_RUST_DEV:-0\}" = "1" \]; then\n {2}PROFILE_DIR=ios-dev/,
        'native Rust dev symbols must require an explicit diagnostic opt-in'
    );
    assert.ok(
        iosBevyBuildScriptSource.includes('export CARGO_TARGET_DIR="$DERIVED_CACHE_ROOT/Build/Intermediates.noindex/atome.build/Debug-iphoneos/ios-bevy-renderer-target"'),
        'app and AUv3 must share one Cargo target directory across configurations'
    );
    assert.ok(
        projectSource.includes('-latome_ios_bevy_renderer'),
        'Xcode targets must link the Rust staticlib'
    );
});

// The native Bevy commands (`bevy_native_*`) and their Swift controller were removed with the JS
// native-renderer route (R-118 final lot, 2026-11-06): the page renders through the Web renderer.
test('iOS native invoke travels through swiftBridge', () => {
    assert.ok(webViewManagerSource.includes('window.__ATOME_IOS_NATIVE_INVOKE'), 'WebViewManager must install the iOS native invoke bridge');
    assert.ok(webViewManagerSource.includes("action: 'nativeInvoke'"), 'iOS native invoke must travel through swiftBridge nativeInvoke');
});

test('project projection and created atomes render through the canonical Web renderer path', () => {
    assert.equal(
        projectSceneBevyProjectionSource.includes('logProjectRenderDiag'),
        false,
        'project projection must not emit temporary render diagnostics after the iOS import diagnosis is complete'
    );
    assert.ok(
        projectSceneEngineSource.includes('if (projectionOk)')
            && projectSceneEngineSource.includes('runtime.virtualScene = virtualScene'),
        'a failed projection must not mark the virtual scene as successfully started'
    );
    assert.equal(
        toolGenesisCreateSource.includes('created:render_result'),
        false,
        'created atome diagnostics must not emit temporary render logs'
    );
    assert.ok(
        toolGenesisCreateSource.includes('return renderAtomeRecord(canonicalState, layer)'),
        'created atomes must still render through the canonical project render path'
    );
    assert.ok(
        toolGenesisCreateSource.includes('view?.ok === true'),
        'creator results must mark rendered only when the project projection is actually ok'
    );
});

test('iOS custom scheme serves Bevy WASM and project file media', () => {
    assert.ok(
        audioSchemeHandlerSource.includes('path.hasPrefix("/file/")'),
        'iOS atome:// scheme must serve project media URLs under /file/'
    );
    assert.ok(
        audioSchemeHandlerSource.includes('serveSandboxFile(relativePath: relative, label: "file"'),
        'iOS /file media must resolve through the sandbox file resolver'
    );
    assert.ok(
        audioSchemeHandlerSource.includes('case "wasm": return "application/wasm"'),
        'iOS scheme must serve Bevy WASM with the application/wasm MIME type'
    );
    assert.ok(
        audioSchemeHandlerSource.includes('path.hasPrefix("/api/recordings/")'),
        'iOS scheme must resolve canonical recording media routes'
    );
    assert.ok(
        audioSchemeHandlerSource.includes('data/users/\\(safeUserId)/recordings/\\(safeFileName)'),
        'iOS recording routes must resolve through the owner-scoped sandbox path'
    );
    assert.ok(
        webViewManagerSource.includes('(document.head || document.documentElement).appendChild(m)'),
        'iOS viewport injection must work before document.head exists'
    );
    assert.ok(
        audioSchemeHandlerSource.includes('components?.query = nil'),
        'iOS scheme routing must ignore cache-version queries when resolving bundled assets'
    );
    assert.equal(
        audioSchemeHandlerSource.includes('respondRedirect'),
        false,
        'iOS scheme must serve versioned ES modules and WASM directly because WebKit module loading rejects custom-scheme redirects'
    );
});

test('Xcode synchronizes the Common group into the iOS targets', () => {
    assert.ok(projectSource.includes('PBXFileSystemSynchronizedRootGroup'), 'Xcode project must use synchronized folder groups');
    assert.ok(projectSource.includes('path = Common;'), 'Common folder must be synchronized into the iOS targets');
});

test('iOS resource packaging excludes build artifacts before copying', () => {
    assert.equal(
        projectSource.includes('cp -R \\"$SRCROOT/../../../atome\\"'),
        false,
        'iOS packaging must not copy Rust target directories into the app before pruning them'
    );
    assert.ok(projectSource.includes('package_ios_runtime.mjs'), 'both iOS targets must use the canonical runtime packager');
    assert.ok(
        projectSource.includes('PATH=\\"/opt/homebrew/bin:/usr/local/bin:$PATH\\"'),
        'runtime packaging must resolve Homebrew Node when Xcode is launched outside an interactive shell'
    );
    assert.ok(
        projectSource.includes('Package Atome Runtime requires Node.js'),
        'a missing Node binary must produce an actionable Xcode error instead of a silent PhaseScriptExecution failure'
    );
    assert.ok(
        projectSource.includes('command -v node || true'),
        'Node discovery must not terminate the packaging phase before its explicit diagnostic'
    );
    assert.equal(projectSource.includes('src in Resources'), false, 'raw src must not be copied beside the packaged runtime');
    assert.equal(projectSource.includes('eVe in Resources'), false, 'raw eVe must not be copied beside the packaged runtime');
    assert.match(iosPackagerSource, /SKIP_DIRS[\s\S]*?'\.git'[\s\S]*?'target'/, 'packager must exclude repository and Rust build metadata');
    assert.ok(iosPackagerSource.includes("'chunks/optional-integrations'"), 'optional domains must remain in a deferred ESM entry');
    assert.ok(iosPackagerSource.includes("'eVe/eVe': EVE_APPLICATION_ENTRY_ID"), 'the application entry must retain its canonical URL');
    assert.match(
        iosPackagerSource,
        /const registryLines = criticalDescriptors[\s\S]*?\(\[moduleId, target\]\) => ` {2}\$\{JSON\.stringify\(moduleId\)\}: \(\) => import/,
        'packaged loaders must remain lazy so import-time owners execute only after their registry exists'
    );
    assert.equal(iosPackagerSource.includes('bevy.early_wasm_start'), false, 'iOS must not retain a preloaded WASM module while the application graph is parsed');
    assert.equal(iosPackagerSource.includes('eve-stage-'), false, 'the critical graph must not duplicate shared dependencies across independent stage bundles');
    assert.equal(iosPackagerSource.includes('deferDynamicImportsPlugin'), false, 'the old discovery build and its externalized duplicate graph must be removed');
    assert.match(iosPackagerSource, /runtimeBuild[\s\S]*?splitting:\s*true[\s\S]*?chunkNames:\s*'chunks\/shared\/\[name\]-\[hash\]'/, 'all browser owners must use one factorized ESM graph');
    assert.ok(iosPackagerSource.includes('EVE_CRITICAL_MODULE_IDS'), 'the packaged eVe graph must explicitly own its presentation-critical boundary');
    assert.ok(iosPackagerSource.includes('singletonOwnerPaths'), 'the packager must declare stateful owners that may never be duplicated');
    assert.ok(iosPackagerSource.includes('packaged_singleton_owner_count'), 'the iOS build must fail when a singleton owner is emitted more than once');
    assert.ok(iosPackagerSource.includes('packaged_runtime_input_duplicated'), 'the iOS build must reject every duplicated browser input, not only named singletons');
    assert.match(
        audioApiSource,
        /import ['"]\.\.\/\.\.\/\.\.\/\.\.\/atome\/src\/application\/audio_runtime\/record_audio_api\.js['"];/,
        'the canonical audio API must install its unified recorder dependency when Capture is loaded'
    );
    assert.equal(
        eveEntrySource.includes("id: 'eve.record_audio_api'"),
        false,
        'the recorder dependency must not also be scheduled by the unrelated deferred boot lane'
    );
    assert.match(
        eveEntrySource,
        /if \(!globalThis\.__ATOME_PACKAGED_MODULES__\) \{[\s\S]*?queueMicrotask/,
        'the packaged iOS entry must install its compiled module registry before startEve can load an owner'
    );
    assert.equal(iosPackagerSource.includes('const criticalBuild ='), false, 'the former independent Spark build must not survive');
    assert.equal(iosPackagerSource.includes('const optionalBuild ='), false, 'the former independent optional build must not survive');
    assert.equal(iosPackagerSource.includes('const eveBundleBuild ='), false, 'the former independent eVe build must not survive');
    assert.equal(iosPackagerSource.includes('reuseCriticalEveModulesPlugin'), false, 'the former partial alias workaround must not survive the unified graph');
    assert.ok(
        iosPackagerSource.includes('critical-workspace-surface'),
        'the shared workspace owner must have one stable packaged entry for deferred callers'
    );
    assert.ok(
        iosPackagerSource.includes('critical-workspace-main-menu'),
        'deferred panels must reuse the initialized main-menu registry instead of bundling an empty duplicate'
    );
    assert.match(
        iosPackagerSource,
        /'eVe\/domains\/rendering\/bevy_project_preview_capture_frame':\s*bevyProjectPreviewCaptureFramePath/,
        'the iframe preview runtime must be an entry in the same graph at the URL requested by its adapter'
    );
    assert.ok(iosPackagerSource.includes('minifyIdentifiers: true'), 'critical Debug packaging must reduce WebKit parser memory, not only whitespace');
    assert.ok(
        iosPackagerSource.includes('IOS_WEB_RENDERER_MAX_BYTES'),
        'iOS packaging must reject a renderer artifact large enough to restore the WebContent memory regression'
    );
    assert.equal(
        webBevyBuildScriptSource.includes('virtual-function-elimination'),
        false,
        'the production renderer build must reject the VFE artifact that fails on physical iOS'
    );
    assert.ok(iosPackagerSource.includes("'src/wasm/renderer_version.mjs'"), 'the WebGPU renderer version contract must remain available through /wasm');
    assert.ok(webViewScriptMessagesSource.includes('bootPresentationReady'), 'the native bridge must consume versioned presentation readiness');
    assert.ok(webViewScriptMessagesSource.includes('bootMilestone'), 'the native bridge must consume versioned JavaScript boot milestones');
    assert.ok(webViewScriptMessagesSource.includes('bootFailure'), 'the native bridge must consume explicit terminal JavaScript boot failures');
    assert.ok(appViewControllerSource.includes('bootRetryButton'), 'terminal boot failure must expose an explicit native retry action');
    assert.match(featureFlagsSource, /webInspectorEnabled[\s\S]*?-AtomeWebInspector[\s\S]*?ATOME_IOS_WEB_INSPECTOR/, 'Web Inspector must be an explicit Debug diagnostic opt-in');
    assert.ok(webViewFactorySource.includes('FeatureFlags.webInspectorEnabled'), 'WKWebView construction must consume the explicit inspector flag');
    assert.match(featureFlagsSource, /textTraceEnabled[\s\S]*?-AtomeTextTrace[\s\S]*?ATOME_IOS_TEXT_TRACE/, 'verbose text tracing must be an explicit Debug diagnostic opt-in');
    assert.ok(webViewManagerSource.includes('if FeatureFlags.textTraceEnabled'), 'document-start text tracing must consume the explicit diagnostic flag');
    assert.equal(audioSchemeHandlerSource.includes('AUv3 Audio Test'), false, 'the production atome root must not expose the historical audio-test page');
    assert.match(
        audioSchemeHandlerSource,
        /func webView\(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask\) \{\s*close\(urlSchemeTask\)/,
        'a stopped WebKit scheme task must be closed before any asynchronous response can reach it'
    );
    // The handler keeps the open tasks; a delivery to any other is refused.
    assert.ok(audioSchemeHandlerSource.includes('guard openTaskIds.contains(taskId(task)) else { return false }'), 'all native scheme deliveries must reject stopped tasks');
    assert.equal(audioSchemeHandlerSource.includes('// No-op'), false, 'the unsafe no-op scheme cancellation handler must not return');
    assert.match(audioSchemeHandlerSource, /requestedPath == "\/"[\s\S]*?"\/src\/index\.html"/, 'the atome root must resolve to the real packaged application entry');
    assert.equal(midiControllerSource.includes('Testing MIDI callback system'), false, 'normal MIDI startup must not schedule a delayed smoke-test callback');
});
