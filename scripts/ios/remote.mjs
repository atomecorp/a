#!/usr/bin/env node
// SSH authenticates the caller; no command, script or environment payload is accepted.
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const take = flag => { const i = args.indexOf(flag); if (i < 0 || !args[i + 1]) throw new Error(`${flag}_required`); return args.splice(i, 2)[1]; };
try {
    const host = take('--host');
    const repo = take('--repo');
    if (!/^[\w.@-]+$/.test(host) || host.startsWith('-') || !/^\/[\w/ .-]+$/.test(repo)) throw new Error('invalid_remote_target');
    if (!args.includes('--adhoc') || args.some(arg => !['--adhoc', '--prepare', '--dry-run'].includes(arg))) throw new Error('only_adhoc_prepare_dry_run_allowed');
    const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
    const result = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', host,
        `cd ${quote(repo)} && exec ./scripts/XCode_testflight_generator ${args.map(quote).join(' ')}`], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
} catch (error) { process.stderr.write(`Remote release failed: ${error.message}\n`); process.exitCode = 1; }
