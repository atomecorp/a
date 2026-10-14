import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAiSFixture } from './ios_runtime_probe_support.mjs';
import { encodeGpsShape } from '../../atome/src/squirrel/gps/route_geometry.js';

test('actual native JS engine and AiS retain GPS history and reject stale versions', { skip: process.platform !== 'darwin', timeout: 180000 }, () => {
    const directory = resolve('temp/gps_integration/native'); mkdirSync(directory, { recursive: true });
    const object = resolve(directory, 'gps_host.o');
    execFileSync('xcrun', ['clang', '-fobjc-arc', '-fmodules', '-fmodules-cache-path=' + resolve(directory, 'clang-cache'),
        '-c', 'platforms/ios/atome-auv3/Common/AtomeGPSHost.m', '-o', object], { timeout: 60000 });
    const output = runAiSFixture('tests/probes/gps_native_fixture.swift', {
        extraFiles: ['platforms/ios/atome-auv3/Common/AppNativeGpsController.swift'],
        compilerArgs: ['-import-objc-header', 'platforms/ios/atome-auv3/Common/AtomeGPSHost.h', object,
            '-framework', 'CoreLocation', '-framework', 'JavaScriptCore', '-framework', 'AVFoundation'],
        args: [resolve('atome/src/wasm/gps_navigation_engine.js'), encodeGpsShape([{ lat: 48, lon: 2 }, { lat: 48, lon: 2.001 }, { lat: 48, lon: 2.002 }])]
    });
    assert.match(output, /GPS JavaScriptCore and AiS contracts passed/);
});
