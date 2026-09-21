import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

// Compile the actual AiS owner; only device storage and remote transport are stubbed.
// The context-menu resolver rejects any record without `capabilities`, so the shared
// projection must travel on both read responses exactly as Axum and Fastify project it.
test('AiS state_current read responses carry the shared capability projection', { skip: process.platform !== 'darwin' }, () => {
    const directory = mkdtempSync(resolve('temp/ios-state-current-capabilities-'));
    const source = readFileSync('platforms/ios/atome-auv3/Common/LocalHTTPServer.swift', 'utf8');
    const owner = source.slice(source.indexOf('enum AiSRuntime {'));
    assert.ok(owner.startsWith('enum AiSRuntime {'));
    const stateCurrent = readFileSync('platforms/ios/atome-auv3/Common/AiSRuntimeStateCurrent.swift', 'utf8');
    const events = readFileSync('platforms/ios/atome-auv3/Common/AiSRuntimeEvents.swift', 'utf8');
    const fixture = readFileSync('tests/probes/ios_state_current_capabilities_fixture.swift', 'utf8');
    const path = resolve(directory, 'main.swift');
    writeFileSync(path, 'import Foundation\nimport CryptoKit\nimport SQLite3\n' + owner + '\n' + fixture);
    // The extension compiles as its own file so the production access-control
    // boundary stays enforced instead of being hidden by concatenation.
    const stateCurrentPath = resolve(directory, 'AiSRuntimeStateCurrent.swift');
    writeFileSync(stateCurrentPath, stateCurrent);
    const eventsPath = resolve(directory, 'AiSRuntimeEvents.swift');
    writeFileSync(eventsPath, events);
    const binary = resolve(directory, 'probe');
    execFileSync('xcrun', ['swiftc', '-module-cache-path', resolve(directory, 'modules'), path, stateCurrentPath, eventsPath, '-o', binary], { timeout: 120000, stdio: 'pipe' });
    const output = execFileSync(binary, [directory], { timeout: 30000, encoding: 'utf8' });
    assert.match(output, /AiS state_current capability checks passed/);
});
