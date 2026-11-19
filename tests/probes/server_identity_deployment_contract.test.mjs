// The deployment's own checks (scripts/verify_deployed_source.js, scripts/server_update.js). The server identity
// itself (its key pair made once, kept, backed up, a mismatch refused) is atome-server's admin tool
// (src/server_identity/secure_config.rs, tests/atome_server/admin_tools.rs).
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
    verifyProductionDependencyLock,
    verifyRuntimeDependencies
} from '../../scripts/verify_deployed_source.js';

const tempRoots = [];
const testTempRoot = fileURLToPath(new URL('../../temp/', import.meta.url));

function createDependencyFixture({ includeRuntime = false } = {}) {
    mkdirSync(testTempRoot, { recursive: true });
    const root = mkdtempSync(path.join(testTempRoot, 'squirrel-server-dependencies-'));
    tempRoots.push(root);
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({
        dependencies: { 'rubberband-wasm': '^3.3.0' }
    }));
    writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
        lockfileVersion: 3,
        packages: {
            '': { dependencies: { 'rubberband-wasm': '^3.3.0' } },
            'node_modules/rubberband-wasm': {
                version: '3.3.0',
                integrity: 'sha512-test'
            }
        }
    }));
    if (includeRuntime) {
        const dist = path.join(root, 'node_modules', 'rubberband-wasm', 'dist');
        mkdirSync(dist, { recursive: true });
        writeFileSync(path.join(dist, 'index.esm.js'), 'export {};\n');
        writeFileSync(path.join(dist, 'rubberband.wasm'), 'wasm');
    }
    return root;
}

afterEach(() => {
    while (tempRoots.length > 0) rmSync(tempRoots.pop(), { recursive: true, force: true });
});

describe('production server identity deployment', () => {
    it('provisions and backs up the identity through the native admin tool before the restart', () => {
        const updater = readFileSync(new URL('../../scripts/server_update.js', import.meta.url), 'utf8');
        const verifier = readFileSync(new URL('../../scripts/verify_deployed_source.js', import.meta.url), 'utf8');
        expect(updater).toContain("server-identity ensure --env-file");
        expect(updater).toContain("server-identity backup --env-file");
        expect(updater.indexOf("phase('secure-config'")).toBeLessThan(updater.indexOf("phase('identity-backup'"));
        expect(updater.indexOf("phase('identity-backup'")).toBeLessThan(updater.indexOf("phase('restart'"));
        expect(verifier).toContain('production server identity provisioning');
    });
});

describe('production server dependency deployment', () => {
    it('validates production dependencies semantically without npm layout markers', () => {
        const root = createDependencyFixture();
        expect(() => verifyProductionDependencyLock(root)).not.toThrow();
    });

    it('fails before restart when installed runtime assets are missing', () => {
        const missingRuntimeRoot = createDependencyFixture();
        const installedRuntimeRoot = createDependencyFixture({ includeRuntime: true });

        expect(() => verifyRuntimeDependencies(missingRuntimeRoot))
            .toThrow('missing rubberband-wasm runtime asset');
        expect(() => verifyRuntimeDependencies(installedRuntimeRoot)).not.toThrow();

        const updater = readFileSync(new URL('../../scripts/server_update.js', import.meta.url), 'utf8');
        expect(updater.indexOf("phase('npm-ci'"))
            .toBeLessThan(updater.indexOf("phase('verify-runtime-dependencies'"));
        expect(updater.indexOf("phase('verify-runtime-dependencies'"))
            .toBeLessThan(updater.indexOf("phase('restart'"));
    });
});
