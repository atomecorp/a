import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

// Compile the actual AiS owner; only device storage and remote transport are stubbed.
test('AiS events commit journal and projection together, including nested sync rollback', { skip: process.platform !== 'darwin' }, () => {
    const directory = mkdtempSync(resolve('temp/ios-event-transaction-'));
    const source = readFileSync('platforms/ios/atome-auv3/Common/LocalHTTPServer.swift', 'utf8');
    const owner = source.slice(source.indexOf('enum AiSRuntime {'));
    assert.ok(owner.startsWith('enum AiSRuntime {'));
    const events = readFileSync('platforms/ios/atome-auv3/Common/AiSRuntimeEvents.swift', 'utf8');
    const fixture = readFileSync('tests/probes/ios_event_transaction_fixture.swift', 'utf8');
    const path = resolve(directory, 'main.swift');
    writeFileSync(path, 'import Foundation\nimport CryptoKit\nimport SQLite3\n' + owner + '\n' + events + '\n' + fixture);
    const binary = resolve(directory, 'probe');
    execFileSync('xcrun', ['swiftc', '-module-cache-path', resolve(directory, 'modules'), path, '-o', binary], { timeout: 120000, stdio: 'pipe' });
    const output = execFileSync(binary, [directory], { timeout: 30000, encoding: 'utf8' });
    assert.match(output, /AiS transaction checks passed/);
});
