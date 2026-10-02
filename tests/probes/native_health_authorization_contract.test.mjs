// Run: npx vitest run tests/probes/native_health_authorization_contract.test.mjs
// The catalog, the Swift allow-list, the Kotlin allow-list and the Android
// manifest must declare exactly the same monitors / permissions.
import assert from 'node:assert/strict';
import {test} from 'vitest';
import { readFileSync } from 'node:fs';
import { HEALTH_MONITORS, androidReadPermissions } from '../../atome/src/squirrel/health/health_catalog.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const swift = read('platforms/ios/atome-auv3/Common/NativeHealthTypes.swift');
const controller = read('platforms/ios/atome-auv3/Common/AppNativeHealthController.swift');
const kotlin = read('platforms/desktop-tauri/vendor/tauri-plugin-health/android/src/main/java/HealthPlugin.kt');
const manifest = read('platforms/desktop-tauri/vendor/tauri-plugin-health/android/src/main/AndroidManifest.xml');

test('native health catalogs and read-only permissions match the canonical catalog', () => {
const swiftTable = swift.slice(swift.indexOf('static let specs'), swift.indexOf('static func spec('));
const swiftIds = new Map([...swiftTable.matchAll(/"([a-z0-9_]+)": \.init\(kind: [^,]+, identifier: "([^"]+)", unitString: (?:"([^"]+)"|nil), fraction: (true|false)\)/g)]
    .map((m) => [m[1], { identifier: m[2], unit: m[3] || null, fraction: m[4] === 'true' }]));
const kotlinIds = new Map([...kotlin.matchAll(/"([a-z0-9_]+)" to Spec\((\w+)::class, "\$\{HC\}(READ_[A-Z0-9_]+)"/g)]
    .map((m) => [m[1], { record: m[2], permission: `android.permission.health.${m[3]}` }]));
const manifestPerms = [...manifest.matchAll(/android\.permission\.health\.(READ_[A-Z0-9_]+)/g)].map((m) => `android.permission.health.${m[1]}`).sort();

const iosCatalog = HEALTH_MONITORS.filter((e) => e.ios || e.direct?.host === 'ios');
const androidCatalog = HEALTH_MONITORS.filter((e) => e.android);

assert.deepEqual([...swiftIds.keys()].sort(), iosCatalog.map((e) => e.id).sort(), 'Swift ids ≠ catalog iOS ids');
iosCatalog.filter((e) => e.ios).forEach((entry) => {
    const spec = swiftIds.get(entry.id);
    assert.equal(spec.identifier, entry.ios.type, `${entry.id} HK identifier`);
    assert.equal(spec.fraction, entry.ios.scale === 'fraction', `${entry.id} fraction scale`);
    if (entry.ios.unit) assert.equal(spec.unit.toLowerCase(), entry.ios.unit.toLowerCase(), `${entry.id} unit`);
});
assert.deepEqual([...kotlinIds.keys()].sort(), androidCatalog.map((e) => e.id).sort(), 'Kotlin ids ≠ catalog Android ids');
androidCatalog.forEach((entry) => {
    const spec = kotlinIds.get(entry.id);
    assert.equal(spec.record, entry.android.record, `${entry.id} record`);
    assert.equal(spec.permission, entry.android.permission, `${entry.id} permission`);
});
assert.deepEqual(manifestPerms, androidReadPermissions(), 'manifest permissions ≠ catalog');
assert.ok(!/WRITE_|READ_HEALTH_DATA_HISTORY|READ_HEALTH_DATA_IN_BACKGROUND/.test(manifest.replace(/<!--[\s\S]*?-->/g, '')), 'forbidden permission in manifest');
assert.ok(/STEP_SENSOR_ID = "device_steps_session"/.test(kotlin));
assert.ok(!/toShare: \[[^\]]/.test(controller), 'HealthKit share set must stay empty');
});

test('capability discovery uses authorization quantity types and never requests access', () => {
    const capabilities = controller.slice(controller.indexOf('private func capabilities('), controller.indexOf('private func requestAccess('));
    assert.ok(capabilities.includes('spec.authorizationTypes()'));
    assert.ok(capabilities.includes('getRequestStatusForAuthorization(toShare: [], read: types)'));
    assert.ok(!capabilities.includes('.requestAuthorization('));
    const authorizationTypes = swift.slice(swift.indexOf('func authorizationTypes('), swift.indexOf('#endif', swift.indexOf('func authorizationTypes(')));
    assert.ok(authorizationTypes.includes('.bloodPressureSystolic'));
    assert.ok(authorizationTypes.includes('.bloodPressureDiastolic'));
    assert.ok(!authorizationTypes.includes('correlationType('));
    assert.ok(/requestAuthorization\(toShare: \[\], read: readTypes\)/.test(controller));
});
