import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['eVe', 'atome/src'];
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'temp', 'coverage']);
const SHARED_CONTRACT_IMPORT_RE = /from\s+['"`]([^'"`]*atome\/shared\/atome_contract\.js|[^'"`]*shared\/atome_contract\.js)['"`]/g;
const BROWSER_SHARED_CONTRACT_RE = /(?:^|\/)atome\/src\/shared\/atome_contract\.js$|(?:^|\/)src\/shared\/atome_contract\.js$/;

const walk = (dir, files = []) => {
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, files);
            continue;
        }
        if (!/\.(?:js|mjs|cjs)$/i.test(entry.name)) continue;
        files.push(full);
    }
    return files;
};

const lineForIndex = (text, index) => text.slice(0, index).split(/\r?\n/).length;
const normalizeImportPath = (importPath, file) => {
    const normalized = String(importPath || '').replace(/\\/g, '/');
    if (normalized.startsWith('.')) {
        const base = file && file !== '<inline>' ? path.posix.dirname(String(file).replace(/\\/g, '/')) : '';
        return path.posix.normalize(path.posix.join(base, normalized));
    }
    return normalized.replace(/^\/+/, '');
};

export function findBrowserSharedContractImportViolations(text, file = '<inline>') {
    const violations = [];
    for (const match of text.matchAll(SHARED_CONTRACT_IMPORT_RE)) {
        const importPath = normalizeImportPath(match[1], file);
        if (BROWSER_SHARED_CONTRACT_RE.test(importPath)) continue;
        violations.push({
            file,
            line: lineForIndex(text, match.index || 0),
            rule: 'browser_shared_contract_import',
            message: 'Browser-served eVe and atome/src modules must not import atome/shared/atome_contract.js; use a browser-local adapter instead.'
        });
    }
    return violations;
}

export function scanBrowserSharedContractImports(root = ROOT) {
    const violations = [];
    for (const sourceRoot of SOURCE_ROOTS) {
        for (const file of walk(path.join(root, sourceRoot))) {
            const rel = path.relative(root, file).split(path.sep).join('/');
            const text = fs.readFileSync(file, 'utf8');
            violations.push(...findBrowserSharedContractImportViolations(text, rel));
        }
    }
    return violations;
}

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '');

if (isMain) {
    const violations = scanBrowserSharedContractImports();
    if (violations.length) {
        console.error(JSON.stringify({ ok: false, violations }, null, 2));
        process.exit(1);
    }
    console.log('browser shared contract import guardrails: ok');
}
