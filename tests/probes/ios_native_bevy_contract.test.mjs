import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const controllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/AppNativeBevyRendererController.swift', import.meta.url), 'utf8');
const webViewManagerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/WebViewManager.swift', import.meta.url), 'utf8');
const appViewControllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/application/ViewController.swift', import.meta.url), 'utf8');
const auv3ControllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift', import.meta.url), 'utf8');
const nativeRuntimeSource = await readFile(new URL('../../eVe/domains/rendering/bevy_native_renderer_runtime.js', import.meta.url), 'utf8');
const projectSource = await readFile(new URL('../../platforms/ios/atome-auv3/atome.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
const nativeRuntime = await import('../../eVe/domains/rendering/bevy_native_renderer_runtime.js');

test('iOS exposes the same native Bevy command boundary as Tauri', () => {
    assert.ok(controllerSource.includes('"bevy_native_start"'), 'iOS controller must accept native Bevy start');
    assert.ok(controllerSource.includes('"bevy_native_apply_ops"'), 'iOS controller must accept native Bevy ops');
    assert.ok(controllerSource.includes('"bevy_native_resize"'), 'iOS controller must accept native Bevy resize');
    assert.ok(
        controllerSource.includes('ios_bevy_native_rust_renderer_not_linked'),
        'iOS must fail explicitly until the Rust/Metal renderer is linked'
    );
    assert.ok(
        controllerSource.includes('"rust_linked": false'),
        'iOS Bevy diagnostics must report whether the Rust renderer is linked'
    );
    assert.ok(
        controllerSource.includes('"rust_compiled": false'),
        'iOS Bevy diagnostics must report whether the Rust renderer is compiled into the target'
    );
    assert.ok(
        controllerSource.includes('"presentable": false'),
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

test('iOS app and AUv3 dispatch native Bevy commands through swiftBridge', () => {
    assert.ok(webViewManagerSource.includes('window.__ATOME_IOS_NATIVE_INVOKE'), 'WebViewManager must install the iOS native invoke bridge');
    assert.ok(webViewManagerSource.includes("action: 'nativeInvoke'"), 'iOS native invoke must travel through swiftBridge nativeInvoke');
    assert.ok(appViewControllerSource.includes('AppNativeBevyRendererController.canHandle(command: command)'), 'main iOS app must route native Bevy commands');
    assert.ok(auv3ControllerSource.includes('AppNativeBevyRendererController.canHandle(command: command)'), 'AUv3 must route native Bevy commands');
});

test('iOS native project rendering does not fall back to the web Bevy runtime', () => {
    assert.ok(nativeRuntimeSource.includes("typeof hostWindow?.__ATOME_IOS_NATIVE_INVOKE === 'function'"), 'native runtime must detect the iOS bridge');
    assert.ok(nativeRuntimeSource.includes("platform: 'ios'"), 'native runtime must label iOS native dispatch');
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

test('iOS native startup reaches Swift before browser media texture decoding', async () => {
    const commands = [];
    const hostWindow = {
        __HOST_ENV: 'app',
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

test('Xcode synchronized Common group includes the iOS Bevy controller', () => {
    assert.ok(projectSource.includes('PBXFileSystemSynchronizedRootGroup'), 'Xcode project must use synchronized folder groups');
    assert.ok(projectSource.includes('path = Common;'), 'Common folder must be synchronized into the iOS targets');
    assert.equal(
        projectSource.includes('AppNativeBevyRendererController.swift'),
        false,
        'synchronized Common files should not require a manual PBXFileReference entry'
    );
});
