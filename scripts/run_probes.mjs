// Runs every standalone probe under ./tests — the *.test.mjs files that are NOT
// vitest suites (tests/vitest.manifest.json lists those). 345 of them were run by
// no command at all, so nothing guaranteed they still passed.
//
// Usage: node scripts/run_probes.mjs [--list] [--timeout=ms] [pattern]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const manifest = new Set(JSON.parse(fs.readFileSync('tests/vitest.manifest.json', 'utf8')));
const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const timeout = Number(args.find((a) => a.startsWith('--timeout='))?.split('=')[1] || 60000);
const pattern = args.find((a) => !a.startsWith('--')) || '';

const walk = (dir, acc = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'fixtures', 'ui'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full, acc); continue; }
        if (/\.(?:probe|test)\.mjs$/.test(entry.name)) acc.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
    return acc;
};

const probes = walk(path.join(ROOT, 'tests'))
    .filter((file) => !manifest.has(file))
    .filter((file) => !pattern || file.includes(pattern))
    .sort();

if (listOnly) {
    probes.forEach((file) => console.log(file));
    console.log(`\n${probes.length} standalone probe(s)`);
    process.exit(0);
}

const failed = [];
let passed = 0;
for (const file of probes) {
    const result = spawnSync(process.execPath, [file], { cwd: ROOT, encoding: 'utf8', timeout });
    if (result.status === 0) { passed += 1; continue; }
    const output = (result.stderr || result.stdout || '').trim().split('\n');
    failed.push({ file, reason: result.error ? String(result.error.message) : output[output.length - 1] || `exit ${result.status}` });
}

console.log(`probes: ${passed}/${probes.length} passed`);
if (failed.length) {
    console.log(`\n${failed.length} failing:`);
    for (const entry of failed) console.log(`- ${entry.file}\n    ${entry.reason}`);
    process.exit(1);
}
