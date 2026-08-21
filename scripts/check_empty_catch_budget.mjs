// Ratchet on totally empty `catch {}` blocks.
//
// The audit measured 891 of them. A catch with no body and no comment destroys
// the trace of a real failure -- that is what hid the Rubber Band outage and made
// every interaction bug invisible. They cannot all be fixed in one pass, so this
// guard freezes the count: the number may go DOWN, never up. Each one you touch
// becomes either `reportRuntimeError(error, tag)` (atome/src/squirrel/runtime_errors.js)
// or a comment inside the block explaining why the failure is expected.
//
// Lower BUDGET whenever you bring the count down.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BUDGET = 502;
const ROOTS = ['atome/src', 'eVe', 'server'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'target', 'build', 'temp']);
const SKIP_PATHS = [/^atome\/src\/js\//, /\.min\.js$/, /\.bundle\.js$/];
const EMPTY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;

const walk = (dir, acc = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full, acc); continue; }
        if (!/\.js$/.test(entry.name)) continue;
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (SKIP_PATHS.some((pattern) => pattern.test(rel))) continue;
        acc.push(rel);
    }
    return acc;
};

let total = 0;
const perFile = [];
for (const root of ROOTS) {
    const dir = path.join(ROOT, root);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
        const count = (fs.readFileSync(path.join(ROOT, file), 'utf8').match(EMPTY_CATCH) || []).length;
        if (count) { total += count; perFile.push({ file, count }); }
    }
}

if (total > BUDGET) {
    console.error(`empty-catch budget exceeded: ${total} > ${BUDGET}`);
    perFile.sort((a, b) => b.count - a.count).slice(0, 10)
        .forEach((entry) => console.error(`- ${entry.count}  ${entry.file}`));
    process.exit(1);
}
if (total < BUDGET) {
    console.log(`empty-catch budget: ${total} (budget ${BUDGET}) — lower BUDGET in this file to ${total}.`);
} else {
    console.log(`empty-catch budget: ${total}/${BUDGET}`);
}
