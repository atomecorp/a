import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

function walk(dir, acc) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return acc;
    }

    for (const ent of entries) {
        const full = path.join(dir, ent.name);

        // Skip noisy/irrelevant directories
        if (ent.isDirectory()) {
            if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'target') {
                continue;
            }
            walk(full, acc);
            continue;
        }

        if (!ent.isFile()) continue;

        // Only check JS modules (repo is ESM)
        if (full.endsWith('.js') || full.endsWith('.mjs')) {
            acc.push(full);
        }
    }

    return acc;
}

function checkFile(filePath) {
    const res = spawnSync(process.execPath, ['--check', filePath], {
        encoding: 'utf8'
    });

    if (res.status === 0) return null;

    const stderr = (res.stderr || '').trim();
    const stdout = (res.stdout || '').trim();
    const msg = stderr || stdout || `Syntax check failed: ${filePath}`;
    return msg;
}

function main() {
    const roots = [
        path.join(ROOT, 'src'),
        path.join(ROOT, 'server'),
        path.join(ROOT, 'scripts_utils'),
        path.join(ROOT, 'tests')
    ].filter(p => fs.existsSync(p));

    const files = [];
    for (const r of roots) walk(r, files);

    if (files.length === 0) {
        console.log('✅ No JS files found to check.');
        process.exit(0);
    }

    const failures = [];
    for (const f of files) {
        const err = checkFile(f);
        if (err) failures.push({ file: f, err });
    }

    if (failures.length > 0) {
        console.error(`❌ Syntax errors found in ${failures.length} file(s):`);
        for (const x of failures.slice(0, 25)) {
            console.error('\n---');
            console.error(x.file);
            console.error(x.err);
        }
        if (failures.length > 25) {
            console.error(`\n...and ${failures.length - 25} more.`);
        }
        process.exit(1);
    }

    console.log(`✅ Syntax OK (${files.length} file(s))`);
}

main();
