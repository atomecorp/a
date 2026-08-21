// Syntax check for the repository's JS/MJS sources.
//
// It used to spawn one `node --check` process per file: 1 161 processes, and the
// vendored bundles under atome/src/js (opal.min.js, gsap.min.js, …) were parsed
// for nothing while eVe/ — the largest JS surface in the project — was not in
// scope at all. This runs in a single process through esbuild's parser.
//
// Reminder: a syntax check is per-file. It never sees an export that a sibling
// module stopped providing. Validate an extraction by importing the entry (see
// temp/link_check.mjs and temp/boot_probe.mjs), not by this script.
import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';

const ROOT = process.cwd();
const ROOTS = ['atome/src', 'eVe', 'server', 'scripts', 'database', 'dev', 'tests'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'target', 'build', 'coverage', 'temp']);
// Vendored, pre-minified third-party bundles: not ours, and parsing them is pure cost.
const SKIP_PATHS = [/^atome\/src\/js\//, /\.min\.js$/, /\.bundle\.js$/];
const MAX_REPORTED = 25;

const walk = (dir, acc) => {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return acc;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) walk(full, acc);
            continue;
        }
        if (!entry.isFile()) continue;
        if (!/\.(?:js|mjs)$/.test(entry.name)) continue;
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (SKIP_PATHS.some((pattern) => pattern.test(rel))) continue;
        acc.push(rel);
    }
    return acc;
};

const files = ROOTS
    .map((root) => path.join(ROOT, root))
    .filter((dir) => fs.existsSync(dir))
    .reduce((acc, dir) => walk(dir, acc), []);

if (files.length === 0) {
    console.log('✅ No JS files found to check.');
    process.exit(0);
}

const failures = [];
for (const file of files) {
    try {
        transformSync(fs.readFileSync(path.join(ROOT, file), 'utf8'), {
            loader: 'js',
            format: 'esm',
            sourcefile: file
        });
    } catch (error) {
        failures.push({ file, message: String(error?.message || error).trim() });
    }
}

if (failures.length > 0) {
    console.error(`❌ Syntax errors found in ${failures.length} file(s):`);
    for (const failure of failures.slice(0, MAX_REPORTED)) {
        console.error('\n---');
        console.error(failure.file);
        console.error(failure.message);
    }
    if (failures.length > MAX_REPORTED) console.error(`\n...and ${failures.length - MAX_REPORTED} more.`);
    process.exit(1);
}

console.log(`✅ Syntax OK (${files.length} file(s))`);
