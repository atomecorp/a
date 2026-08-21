// Guards the canonical DOM attribute spelling.
//
// `data-tool-id` and `data-tool_id` were both written, so every new selector had
// to remember two spellings (three, counting a `data-eve-intuitionx-footer-tool-id`
// nothing ever wrote). Forgetting one produced a silently dead button.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ROOTS = ['eVe', 'atome/src'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'target', 'build', 'temp']);
const FORBIDDEN = [
    { pattern: /data-tool_id/, message: 'use the canonical `data-tool-id` attribute' },
    { pattern: /dataset\s*\??\.\s*tool_id/, message: 'use the canonical `dataset.toolId`' },
    { pattern: /data-eve-intuitionx-footer-tool-id/, message: 'dead third spelling; nothing writes it' }
];

const walk = (dir, acc = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, acc);
        else if (/\.(?:js|mjs|css|html)$/.test(entry.name)) acc.push(full);
    }
    return acc;
};

const violations = [];
for (const root of ROOTS) {
    const dir = path.join(ROOT, root);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
        const rel = path.relative(ROOT, file).split(path.sep).join('/');
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
            for (const rule of FORBIDDEN) {
                if (rule.pattern.test(line)) violations.push({ file: rel, line: index + 1, message: rule.message });
            }
        });
    }
}

if (violations.length) {
    console.error('canonical DOM attribute guard failed:');
    for (const violation of violations) console.error(`- ${violation.file}:${violation.line}: ${violation.message}`);
    process.exit(1);
}
console.log('canonical DOM attribute guard passed.');
