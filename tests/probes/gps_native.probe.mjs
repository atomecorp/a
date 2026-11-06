import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeGpsShape } from '../../atome/src/squirrel/gps/route_geometry.js';

// The actual GPS engine in JavaScriptCore, with the production controller compiled against
// its store owner's seam; the trip's versions and access are tested on the local host in Rust.
test('actual native JS engine runs the GPS route and the controller builds on the local server', { skip: process.platform !== 'darwin', timeout: 180000 }, () => {
    mkdirSync(resolve('temp'), { recursive: true });
    const directory = mkdtempSync(resolve('temp/gps-native-probe-'));
    try {
        const object = resolve(directory, 'gps_host.o');
        execFileSync('xcrun', ['clang', '-fobjc-arc', '-fmodules', '-fmodules-cache-path=' + resolve(directory, 'clang-cache'),
            '-c', 'platforms/ios/atome-auv3/Common/AtomeGPSHost.m', '-o', object], { timeout: 60000 });
        const main = resolve(directory, 'main.swift');
        writeFileSync(main, readFileSync('tests/probes/gps_native_fixture.swift', 'utf8'));
        const binary = resolve(directory, 'probe');
        execFileSync('xcrun', ['swiftc', '-module-cache-path', resolve(directory, 'modules'), main,
            'platforms/ios/atome-auv3/Common/AppNativeGpsController.swift',
            '-import-objc-header', 'platforms/ios/atome-auv3/Common/AtomeGPSHost.h', object,
            '-framework', 'CoreLocation', '-framework', 'JavaScriptCore', '-framework', 'AVFoundation', '-o', binary],
            { timeout: 150000, stdio: 'pipe' });
        const output = execFileSync(binary, [resolve('atome/src/wasm/gps_navigation_engine.js'),
            encodeGpsShape([{ lat: 48, lon: 2 }, { lat: 48, lon: 2.001 }, { lat: 48, lon: 2.002 }])], { timeout: 30000, encoding: 'utf8' });
        assert.match(output, /GPS JavaScriptCore contracts passed/);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
