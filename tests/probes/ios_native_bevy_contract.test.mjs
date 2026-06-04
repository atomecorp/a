import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const controllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/AppNativeBevyRendererController.swift', import.meta.url), 'utf8');
const webViewManagerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/WebViewManager.swift', import.meta.url), 'utf8');
const appViewControllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/application/ViewController.swift', import.meta.url), 'utf8');
const auv3ControllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift', import.meta.url), 'utf8');
const nativeRuntimeSource = await readFile(new URL('../../eVe/domains/rendering/bevy_native_renderer_runtime.js', import.meta.url), 'utf8');
const projectSceneRuntimeSource = await readFile(new URL('../../eVe/domains/rendering/project_scene_runtime.js', import.meta.url), 'utf8');
const projectSceneBevyProjectionSource = await readFile(new URL('../../eVe/domains/rendering/project_scene_bevy_projection_runtime.js', import.meta.url), 'utf8');
const toolGenesisSource = await readFile(new URL('../../eVe/intuition/runtime/tool_genesis.js', import.meta.url), 'utf8');
const projectSource = await readFile(new URL('../../platforms/ios/atome-auv3/atome.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
const iosBevyCargoSource = await readFile(new URL('../../platforms/ios/bevy-renderer/Cargo.toml', import.meta.url), 'utf8');
const iosBevyFfiSource = await readFile(new URL('../../platforms/ios/bevy-renderer/src/lib.rs', import.meta.url), 'utf8');
const iosBevyBuildScriptSource = await readFile(new URL('../../platforms/ios/build_bevy_renderer.sh', import.meta.url), 'utf8');
const iosBevyHeaderSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/AtomeIosBevyRendererBridge.h', import.meta.url), 'utf8');
const bridgingHeaderSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/AtomeAUv3BridgingHeader.h', import.meta.url), 'utf8');
const audioSchemeHandlerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/AudioSchemeHandler.swift', import.meta.url), 'utf8');
const nativeRuntime = await import('../../eVe/domains/rendering/bevy_native_renderer_runtime.js');

test('iOS exposes the same native Bevy command boundary as Tauri', () => {
    assert.ok(controllerSource.includes('"bevy_native_start"'), 'iOS controller must accept native Bevy start');
    assert.ok(controllerSource.includes('"bevy_native_apply_ops"'), 'iOS controller must accept native Bevy ops');
    assert.ok(controllerSource.includes('"bevy_native_resize"'), 'iOS controller must accept native Bevy resize');
    assert.ok(
        controllerSource.includes('linked_no_presenter'),
        'iOS must report the linked Rust core as non-presentable until the native presenter exists'
    );
    assert.equal(
        controllerSource.includes('completion(response, "ios_bevy_native_presenter_not_linked")'),
        false,
        'iOS must use the current structured non-presentable error instead of the removed presenter-not-linked placeholder'
    );
    assert.ok(
        controllerSource.includes('ios_bevy_native_not_presentable'),
        'Missing iOS presenter must return an explicit native non-presentable error'
    );
    assert.ok(
        controllerSource.includes('log("not_presentable", response)'),
        'Missing iOS presenter must be visible in the Xcode console'
    );
    assert.ok(
        controllerSource.includes('atome_ios_bevy_renderer_status()'),
        'iOS Bevy diagnostics must call the Rust linked-status ABI'
    );
    assert.ok(
        controllerSource.includes('atome_ios_bevy_scene_probe(pointer, width, height)'),
        'iOS Bevy diagnostics must send start scenes to the Rust Bevy probe'
    );
    assert.ok(
        controllerSource.includes('"presentable"'),
        'iOS Bevy diagnostics must report native presentation availability'
    );
    assert.ok(
        controllerSource.includes('sceneSummary'),
        'iOS Bevy diagnostics must summarize start-scene nodes'
    );
    assert.ok(
        controllerSource.includes('opsSummary'),
        'iOS Bevy diagnostics must summarize native diff operations'
    );
    assert.ok(
        controllerSource.includes('[IOS_BEVY]'),
        'iOS Bevy diagnostics must be visible in the Xcode console'
    );
    assert.equal(
        controllerSource.includes('squirrel_bevy_renderer'),
        false,
        'iOS native controller must not route to the browser/WASM Bevy renderer'
    );
});

test('iOS links a Rust staticlib wrapper around the shared Bevy core', () => {
    assert.ok(
        iosBevyCargoSource.includes('crate-type = ["staticlib"]'),
        'iOS Bevy wrapper must build as a native staticlib for Xcode'
    );
    assert.ok(
        iosBevyCargoSource.includes('atome-bevy-renderer-core'),
        'iOS Bevy wrapper must depend on the shared Atome Bevy core'
    );
    assert.ok(
        iosBevyFfiSource.includes('atome_ios_bevy_renderer_status'),
        'Rust staticlib must export a linked-status symbol'
    );
    assert.ok(
        iosBevyFfiSource.includes('atome_ios_bevy_scene_probe'),
        'Rust staticlib must export a scene probe symbol'
    );
    assert.ok(
        iosBevyFfiSource.includes('AtomeBevyRendererConfig::new'),
        'Rust scene probe must instantiate the shared Bevy renderer config'
    );
    assert.ok(
        iosBevyHeaderSource.includes('AtomeIosBevySceneProbe'),
        'Swift must receive the Rust scene-probe ABI struct'
    );
    assert.ok(
        bridgingHeaderSource.includes('AtomeIosBevyRendererBridge.h'),
        'Swift bridging header must import the Rust Bevy ABI'
    );
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
        iosBevyCargoSource.includes('panic = "abort"'),
        'iOS Rust staticlib must not unwind through the Swift C ABI boundary'
    );
    assert.ok(
        iosBevyCargoSource.includes('strip = "debuginfo"'),
        'iOS Rust staticlib must not inject full Rust debuginfo into Xcode link products'
    );
    assert.ok(
        iosBevyBuildScriptSource.includes('-C force-unwind-tables=no'),
        'iOS Rust staticlib must avoid forced unwind tables that overflow ld compact unwind encoding'
    );
    assert.ok(
        projectSource.includes('-latome_ios_bevy_renderer'),
        'Xcode targets must link the Rust staticlib'
    );
});

test('iOS app and AUv3 dispatch native Bevy commands through swiftBridge', () => {
    assert.ok(webViewManagerSource.includes('window.__ATOME_IOS_NATIVE_INVOKE'), 'WebViewManager must install the iOS native invoke bridge');
    assert.ok(webViewManagerSource.includes("action: 'nativeInvoke'"), 'iOS native invoke must travel through swiftBridge nativeInvoke');
    assert.ok(appViewControllerSource.includes('AppNativeBevyRendererController.canHandle(command: command)'), 'main iOS app must route native Bevy commands');
    assert.ok(auv3ControllerSource.includes('AppNativeBevyRendererController.canHandle(command: command)'), 'AUv3 must route native Bevy commands');
});

test('iOS project rendering selects native Bevy only when the host declares a presentable renderer', () => {
    assert.ok(nativeRuntimeSource.includes("typeof hostWindow?.__ATOME_IOS_NATIVE_INVOKE === 'function'"), 'native runtime must detect the iOS bridge');
    assert.ok(nativeRuntimeSource.includes('hasPresentableIosNativeBevyRenderer'), 'iOS native Bevy selection must be gated by presentation capability');
    assert.ok(nativeRuntimeSource.includes('hostWindow?.__ATOME_NATIVE_BEVY_PRESENTABLE__ === true'), 'iOS native Bevy must require an explicit presentable host flag');
    assert.ok(nativeRuntimeSource.includes('[NativeBevy]'), 'native runtime must emit Xcode-visible bridge diagnostics');
    assert.ok(nativeRuntimeSource.includes('start:prepare'), 'native runtime must log scene preparation before native start');
    assert.ok(nativeRuntimeSource.includes('start:result'), 'native runtime must log the native start response');
    assert.equal(
        nativeRuntimeSource.includes("from './bevy_web_renderer_runtime.js'"),
        false,
        'native runtime must not depend on browser-side texture decoding'
    );
    assert.equal(
        nativeRuntimeSource.includes("import('../../../atome/src/wasm/squirrel_bevy_renderer.js')"),
        false,
        'native runtime must not import the browser/WASM renderer'
    );
});

test('iOS bridge uses the visible WebGPU canvas before native Bevy reports presentable', () => {
    const hostWindow = {
        __HOST_ENV: 'app',
        __ATOME_IOS_NATIVE_INVOKE: async () => ({ success: false }),
        console: { info() {} }
    };
    const surface = {
        tagName: 'canvas',
        id: 'eve_surface_project',
        ownerDocument: { defaultView: hostWindow }
    };
    assert.equal(nativeRuntime.shouldUseNativeBevyRenderer(surface), false);
});

test('iOS native startup reaches Swift before browser media texture decoding when native presentation is declared', async () => {
    const commands = [];
    const hostWindow = {
        __HOST_ENV: 'app',
        __ATOME_NATIVE_BEVY_PRESENTABLE__: true,
        __ATOME_IOS_NATIVE_INVOKE: async (command, payload) => {
            commands.push({ command, payload });
            return {
                success: true,
                native: true,
                presentable: true,
                renderer_mode: 'test_presentable'
            };
        },
        console: { info() {} }
    };
    const surface = {
        tagName: 'canvas',
        id: 'eve_surface_project',
        ownerDocument: { defaultView: hostWindow }
    };
    const rejectedResolver = async () => {
        throw new Error('bevy_media_texture_image_decode_failed:stale_image');
    };
    const result = await nativeRuntime.startBevyNativeRenderer({
        surface,
        width: 320,
        height: 180,
        mediaTextureResolver: rejectedResolver,
        virtualScene: {
            nodes: [{
                id: 'file_1',
                kind: 'image',
                parentId: null,
                bounds: { x: 0, y: 0, width: 120, height: 80 },
                renderLayer: 1,
                selected: false,
                material: { fill: '#ffffff' },
                content: { source: '/file/data/users/u/Downloads/0000.png' }
            }]
        }
    });
    assert.equal(result.ok, true);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].command, 'bevy_native_start');
    assert.equal(commands[0].payload.scene.nodes[0].source, '/file/data/users/u/Downloads/0000.png');
    assert.equal(commands[0].payload.scene.nodes[0].texture, undefined);
});

test('iOS native projection does not report visible rendering before the presenter exists', () => {
    assert.ok(
        nativeRuntimeSource.includes('presentable: result?.presentable'),
        'native renderer results must expose host presentability'
    );
    assert.ok(
        projectSceneRuntimeSource.includes('const nativePresentable = !useNativeBevy || renderResult?.presentable !== 0'),
        'project projection must treat presentable=0 as not visually rendered'
    );
    assert.ok(
        projectSceneRuntimeSource.includes('if (projectionOk) runtime.virtualScene = virtualScene'),
        'failed native presentation must not mark the virtual scene as successfully started'
    );
    assert.ok(
        projectSceneBevyProjectionSource.includes("logProjectRenderDiag('projection:error'"),
        'project projection must log native renderer errors without pretending the import failed before commit'
    );
    assert.ok(
        projectSceneBevyProjectionSource.includes("logProjectRenderDiag('projection:restart_required'"),
        'stale native projection state must retry a full native start instead of applying diffs to a missing renderer'
    );
    assert.ok(
        projectSceneRuntimeSource.includes('ok: projectionOk'),
        'project projection must use the presentability-aware ok flag'
    );
    assert.ok(
        toolGenesisSource.includes('rendered: rendered?.ok === true'),
        'created atome diagnostics must not treat any projection object as a visible render'
    );
    assert.ok(
        toolGenesisSource.includes('view?.ok === true'),
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
});

test('Xcode synchronized Common group includes the iOS Bevy controller', () => {
    assert.ok(projectSource.includes('PBXFileSystemSynchronizedRootGroup'), 'Xcode project must use synchronized folder groups');
    assert.ok(projectSource.includes('path = Common;'), 'Common folder must be synchronized into the iOS targets');
    assert.equal(
        projectSource.includes('AppNativeBevyRendererController.swift'),
        false,
        'synchronized Common files should not require a manual PBXFileReference entry'
    );
});
