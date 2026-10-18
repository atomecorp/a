import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Compile the actual storage owners; authentication and device storage are explicit test seams.
export function buildAiSFixture(fixturePath, { client = false, authentication = false, extraFiles = [], compilerArgs = [] } = {}) {
    const directory = mkdtempSync(resolve('temp/ios-runtime-probe-'));
    const common = 'platforms/ios/atome-auv3/Common/';
    const source = readFileSync(common + 'LocalHTTPServer.swift', 'utf8');
    const owner = source.slice(source.indexOf('enum AiSRuntime {'));
    const auth = readFileSync(common + 'AiSRuntimeAuth.swift', 'utf8');
    const schema = auth.slice(auth.indexOf('    static func ensureLocalAuthSchema'), auth.indexOf('    static func authResponse'));
    const authSeam = `\nextension AiSRuntime {\n${schema}\nstatic func verifyToken(_ token: String) throws -> [String:Any]? { token.isEmpty ? nil : ["sub":token] }\nstatic func createToken(userId: String, username: String) throws -> String { userId }\n}\n`;
    const main = resolve(directory, 'main.swift');
    const authRuntime = authentication ? '\n' + auth + '\n' + readFileSync(common + 'AiSRuntimeAuthChallenges.swift', 'utf8') : authSeam;
    writeFileSync(main, 'import Foundation\nimport CryptoKit\nimport SQLite3\n' + owner + authRuntime + readFileSync(fixturePath, 'utf8'));
    const files = ['AiSRuntimeDatabase.swift', 'AiSRuntimeSchema.swift', 'AiSRuntimeStateCurrent.swift', 'AiSRuntimeEvents.swift', 'AiSRuntimeSync.swift', 'AiSRuntimeOutbox.swift', 'AiSRuntimeSyncRequest.swift'];
    if (authentication) files.push('AiSRuntimeAuthAccounts.swift');
    if (client) files.push('FastifySyncClient.swift', 'FastifySyncSubscriptions.swift', 'FastifySyncProgress.swift', 'FastifySyncHealth.swift', 'FastifySyncOutbox.swift', 'FastifySyncPublicRelay.swift', 'FastifySyncInbound.swift');
    const binary = resolve(directory, 'probe');
    try {
        execFileSync('xcrun', ['swiftc', '-module-cache-path', resolve(directory, 'modules'), main,
            ...files.map(file => common + file), ...extraFiles, ...compilerArgs, '-o', binary], { timeout: 120000, stdio: 'pipe' });
        return { binary, directory, dispose: () => rmSync(directory, { recursive: true, force: true }) };
    } catch (error) {
        rmSync(directory, { recursive: true, force: true });
        throw error;
    }
}

export function runAiSFixture(fixturePath, { args = [], timeout = 30000, ...options } = {}) {
    const build = buildAiSFixture(fixturePath, options);
    try { return execFileSync(build.binary, [build.directory, ...args], { timeout, encoding: 'utf8' }); }
    finally { build.dispose(); }
}
