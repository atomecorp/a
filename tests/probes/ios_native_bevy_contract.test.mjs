import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const controllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/AppNativeBevyRendererController.swift', import.meta.url), 'utf8');
const webViewManagerSource = await readFile(new URL('../../platforms/ios/atome-auv3/Common/WebViewManager.swift', import.meta.url), 'utf8');
const appViewControllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/application/ViewController.swift', import.meta.url), 'utf8');
const auv3ControllerSource = await readFile(new URL('../../platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift', import.meta.url), 'utf8');
const nativeRuntimeSource = await readFile(new URL('../../eVe/domains/rendering/bevy_native_renderer_runtime.js', import.meta.url), 'utf8');
const projectSource = await readFile(new URL('../../platforms/ios/atome-auv3/atome.xcodeproj/project.pbxproj', import.meta.url), 'utf8');

test('iOS exposes the same native Bevy command boundary as Tauri', () => {
    assert.ok(controllerSource.includes('"bevy_native_start"'), 'iOS controller must accept native Bevy start');
    assert.ok(controllerSource.includes('"bevy_native_apply_ops"'), 'iOS controller must accept native Bevy ops');
    assert.ok(controllerSource.includes('"bevy_native_resize"'), 'iOS controller must accept native Bevy resize');
    assert.ok(
        controllerSource.includes('ios_bevy_native_rust_renderer_not_linked'),
        'iOS must fail explicitly until the Rust/Metal renderer is linked'
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
    assert.equal(
        nativeRuntimeSource.includes("import('../../../atome/src/wasm/squirrel_bevy_renderer.js')"),
        false,
        'native runtime must not import the browser/WASM renderer'
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
