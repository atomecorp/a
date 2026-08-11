import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    createServerIdentityKeyPair,
    validateServerIdentityKeyPair
} from '../../server/serverIdentity.js';
import { ensureServerIdentity } from '../../scripts/server_secure_config.js';

const tempRoots = [];

function createFixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'squirrel-server-identity-'));
    tempRoots.push(root);
    const envDir = path.join(root, 'etc', 'squirrel');
    mkdirSync(envDir, { recursive: true });
    const envFile = path.join(envDir, 'squirrel.env');
    writeFileSync(envFile, 'NODE_ENV=production\n', { mode: 0o600 });
    return { root, envDir, envFile, identityDir: path.join(envDir, 'identity') };
}

function envValues(envFile) {
    return Object.fromEntries(readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
            const separator = line.indexOf('=');
            return [line.slice(0, separator), line.slice(separator + 1)];
        }));
}

afterEach(() => {
    while (tempRoots.length > 0) rmSync(tempRoots.pop(), { recursive: true, force: true });
});

describe('production server identity deployment', () => {
    it('creates one persistent validated identity and preserves it on rerun', () => {
        const fixture = createFixture();
        const options = {
            envFile: fixture.envFile,
            identityDir: fixture.identityDir,
            projectRoot: fixture.root
        };
        const first = ensureServerIdentity(options);
        const firstPrivate = readFileSync(first.privateKeyPath, 'utf8');
        const firstPublic = readFileSync(first.publicKeyPath, 'utf8');
        const firstEnv = envValues(fixture.envFile);

        expect(first.generated).toBe(true);
        expect(firstEnv.SERVER_ID).toMatch(/^squirrel-server-[a-f0-9]{16}$/);
        expect(firstEnv.SERVER_NAME).toBe('Squirrel Server');
        expect(firstEnv.SERVER_PRIVATE_KEY_PATH).toBe(first.privateKeyPath);
        expect(firstEnv.SERVER_PUBLIC_KEY_PATH).toBe(first.publicKeyPath);
        expect(statSync(first.privateKeyPath).mode & 0o777).toBe(0o600);
        expect(statSync(first.publicKeyPath).mode & 0o777).toBe(0o644);
        expect(validateServerIdentityKeyPair(firstPrivate, firstPublic).fingerprint).toBe(first.fingerprint);

        const second = ensureServerIdentity(options);
        expect(second.generated).toBe(false);
        expect(second.fingerprint).toBe(first.fingerprint);
        expect(readFileSync(second.privateKeyPath, 'utf8')).toBe(firstPrivate);
        expect(readFileSync(second.publicKeyPath, 'utf8')).toBe(firstPublic);
        expect(envValues(fixture.envFile).SERVER_ID).toBe(firstEnv.SERVER_ID);
    });

    it('fails closed for incomplete configured paths', () => {
        const fixture = createFixture();
        writeFileSync(fixture.envFile, 'SERVER_PRIVATE_KEY_PATH=/missing/server.key\n', { mode: 0o600 });
        expect(() => ensureServerIdentity({
            envFile: fixture.envFile,
            identityDir: fixture.identityDir,
            projectRoot: fixture.root
        }))
            .toThrow('server_identity_key_paths_incomplete');
    });

    it('preserves configured keys and adds stable missing identity metadata', () => {
        const fixture = createFixture();
        const pair = createServerIdentityKeyPair();
        const privateKeyPath = path.join(fixture.root, 'configured.key');
        const publicKeyPath = path.join(fixture.root, 'configured.pub');
        writeFileSync(privateKeyPath, pair.privateKey, { mode: 0o644 });
        writeFileSync(publicKeyPath, pair.publicKey, { mode: 0o600 });
        writeFileSync(fixture.envFile, [
            `SERVER_PRIVATE_KEY_PATH=${privateKeyPath}`,
            `SERVER_PUBLIC_KEY_PATH=${publicKeyPath}`,
            ''
        ].join('\n'), { mode: 0o600 });

        const first = ensureServerIdentity({
            envFile: fixture.envFile,
            identityDir: fixture.identityDir,
            projectRoot: fixture.root
        });
        const firstEnv = envValues(fixture.envFile);
        const second = ensureServerIdentity({
            envFile: fixture.envFile,
            identityDir: fixture.identityDir,
            projectRoot: fixture.root
        });

        expect(first.generated).toBe(false);
        expect(second.fingerprint).toBe(first.fingerprint);
        expect(firstEnv.SERVER_ID).toMatch(/^squirrel-server-[a-f0-9]{16}$/);
        expect(envValues(fixture.envFile).SERVER_ID).toBe(firstEnv.SERVER_ID);
        expect(firstEnv.SERVER_NAME).toBe('Squirrel Server');
        expect(statSync(privateKeyPath).mode & 0o777).toBe(0o600);
        expect(statSync(publicKeyPath).mode & 0o777).toBe(0o644);
    });

    it('fails closed when configured public and private keys do not match', () => {
        const fixture = createFixture();
        const first = createServerIdentityKeyPair();
        const second = createServerIdentityKeyPair();
        const privateKeyPath = path.join(fixture.root, 'configured.key');
        const publicKeyPath = path.join(fixture.root, 'configured.pub');
        writeFileSync(privateKeyPath, first.privateKey, { mode: 0o600 });
        writeFileSync(publicKeyPath, second.publicKey, { mode: 0o644 });
        writeFileSync(fixture.envFile, [
            `SERVER_PRIVATE_KEY_PATH=${privateKeyPath}`,
            `SERVER_PUBLIC_KEY_PATH=${publicKeyPath}`,
            ''
        ].join('\n'), { mode: 0o600 });

        expect(() => ensureServerIdentity({
            envFile: fixture.envFile,
            identityDir: fixture.identityDir,
            projectRoot: fixture.root
        }))
            .toThrow('server_identity_key_pair_mismatch');
    });

    it('keeps deployment verification and backup on the same identity owner', () => {
        const updater = readFileSync(new URL('../../scripts/server_update.js', import.meta.url), 'utf8');
        const secureConfig = readFileSync(new URL('../../scripts/server_secure_config.js', import.meta.url), 'utf8');
        const verifier = readFileSync(new URL('../../scripts/verify_deployed_source.js', import.meta.url), 'utf8');
        const generator = readFileSync(new URL('../../scripts/generate-server-keys.js', import.meta.url), 'utf8');

        expect(updater).toContain('ensureProductionSecureConfig({');
        expect(updater).toContain('backupServerIdentity({ envFile, backupDir, projectRoot });');
        expect(secureConfig).toContain('export function ensureServerIdentity');
        expect(verifier).toContain('production server identity provisioning');
        expect(generator).toContain('createServerIdentityKeyPair');
        expect(generator).not.toContain("crypto.generateKeyPairSync('rsa'");
    });
});
