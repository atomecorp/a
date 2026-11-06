// Runs one confined vault process on this host before atome-server is (re)started:
// `target/release/atome-vault` on a throwaway vault, asked for its health, one commit
// and one read. On Linux it confines itself first (Landlock, seccomp, limits:
// atome/servers/atome-confine), so a kernel or C library it cannot run under fails
// here, not at a person's first request.
//
//   SQUIRREL_VAULT_ROOT=<vault root> node scripts/check_vault_confinement.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUEST = 1;
const RESULT = 2;
const NOBODY = 65534;

const request = (id, operation, payload) => {
    const op = Buffer.from(operation);
    const json = Buffer.from(JSON.stringify(payload));
    const head = Buffer.alloc(15);
    head.writeUInt32BE(9 + 2 + op.length + json.length, 0);
    head.writeBigUInt64BE(BigInt(id), 4);
    head.writeUInt8(REQUEST, 12);
    head.writeUInt16BE(op.length, 13);
    return Buffer.concat([head, op, json]);
};

const replies = (bytes) => {
    const answers = new Map();
    for (let offset = 0; offset + 4 <= bytes.length; ) {
        const end = offset + 4 + bytes.readUInt32BE(offset);
        const body = bytes.subarray(offset + 13, end).toString('utf8');
        answers.set(Number(bytes.readBigUInt64BE(offset + 4)), bytes.readUInt8(offset + 12) === RESULT ? { result: JSON.parse(body) } : { error: body });
        offset = end;
    }
    return answers;
};

// A vault's account crosses every folder above the vault root (atome-server refuses to start otherwise).
const untraversable = (vaultRoot) => {
    for (let folder = path.dirname(path.resolve(vaultRoot)); ; folder = path.dirname(folder)) {
        if (fs.existsSync(folder) && (fs.statSync(folder).mode & 0o001) === 0) return folder;
        if (folder === path.dirname(folder)) return null;
    }
};

export function checkVaultConfinement({ vaultRoot = path.join(ROOT, 'database_storage', 'vaults') } = {}) {
    const closed = process.platform === 'linux' ? untraversable(vaultRoot) : null;
    if (closed) throw new Error(`vault_confinement_check_failed: ${closed} cannot be crossed by a vault's account (chmod o+x)`);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atome-vault-check-'));
    // As root (the deploy), the vault runs as atome-server starts it: under an account that is not root.
    const account = process.getuid?.() === 0 ? { uid: NOBODY, gid: NOBODY } : {};
    if (account.uid) fs.chownSync(directory, NOBODY, NOBODY);
    try {
        const event = { id: 'confinement-check', kind: 'create', atome_id: 'confinement-check', ts: new Date().toISOString(),
            payload: { props: { type: 'project', name: 'check' } } };
        const run = spawnSync(path.join(ROOT, 'target/release/atome-vault'), ['confinement-check', directory], {
            input: Buffer.concat([request(1, 'health', {}), request(2, 'event:commit', { event }), request(3, 'state:get', { atome_id: 'confinement-check' })]),
            env: {},
            timeout: 30_000,
            ...account
        });
        if (run.error) throw run.error;
        const answers = replies(run.stdout);
        const failure = run.status !== 0 ? `exit ${run.status}: ${run.stderr.toString().trim()}`
            : answers.get(1)?.result?.principalId !== 'confinement-check' ? `health ${JSON.stringify(answers.get(1))}`
                : answers.get(2)?.result?.id !== 'confinement-check' ? `commit ${JSON.stringify(answers.get(2))}`
                    : answers.get(3)?.result?.properties?.name !== 'check' ? `read ${JSON.stringify(answers.get(3))}` : null;
        if (failure) throw new Error(`vault_confinement_check_failed: ${failure}`);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    checkVaultConfinement({ vaultRoot: process.env.SQUIRREL_VAULT_ROOT || undefined });
    console.log('vault confinement check: ok');
}
