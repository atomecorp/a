import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('filesystem deletion never reports success or writes tombstones before confirmed removal', () => {
    const tempRoot = path.join(repoRoot, 'temp');
    mkdirSync(tempRoot, { recursive: true });
    const directory = mkdtempSync(path.join(tempRoot, 'atome-delete-contract-'));
    const binary = path.join(directory, 'filesystem_delete_contract');
    try {
        const compiled = spawnSync('swiftc', [
            '-module-cache-path', path.join(directory, 'module-cache'),
            path.join(repoRoot, 'platforms/ios/atome-auv3/Common/FileSystemDeletionTransaction.swift'),
            path.join(repoRoot, 'tests/native/filesystem_deletion_transaction_contract.swift'),
            '-o', binary
        ], { encoding: 'utf8' });
        assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
        const executed = spawnSync(binary, [], { encoding: 'utf8' });
        assert.equal(executed.status, 0, executed.stderr || executed.stdout);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
