import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_ROOT = process.cwd();

const REQUIRED_ABSENT_PATHS = Object.freeze([
    'src/application/eVe/intuition/tools/mtrack',
    'src/application/eVe/intuition/tools/mtrack.js'
]);

const DIRECTORY_PATTERNS = Object.freeze([
    {
        root: 'src/application/eVe/tests',
        regex: /^mtrack_.*\.test\.mjs$/i,
        code: 'mtrack_test_file_forbidden'
    },
    {
        root: 'tools',
        regex: /(?:^|_)mtrack_.*\.mjs$/i,
        code: 'mtrack_probe_file_forbidden'
    },
    {
        root: 'tools',
        regex: /^mtrack_.*\.mjs$/i,
        code: 'mtrack_tool_file_forbidden'
    }
]);

const SOURCE_CHECKS = Object.freeze([
    {
        file: 'src/application/eVe/eVe.js',
        regex: /mtrack/gi,
        code: 'mtrack_bootstrap_reference_forbidden'
    },
    {
        file: 'package.json',
        regex: /mtrack/gi,
        code: 'mtrack_script_reference_forbidden'
    },
    {
        file: 'src/application/eVe/intuition/panel_definitions.js',
        regex: /\.\/tools\/mtrack\.js/gi,
        code: 'mtrack_panel_module_reference_forbidden'
    }
]);

const normalizePath = (rootDir, filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/');

const walkFiles = (rootDir, relDir, files = []) => {
    const fullDir = path.resolve(rootDir, relDir);
    if (!fs.existsSync(fullDir)) return files;
    for (const entry of fs.readdirSync(fullDir)) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'target' || entry === 'headless_output') continue;
        const fullPath = path.join(fullDir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkFiles(rootDir, path.join(relDir, entry), files);
        } else if (stat.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
};

const collectAbsentPathViolations = (rootDir) => REQUIRED_ABSENT_PATHS
    .map((relPath) => path.resolve(rootDir, relPath))
    .filter((fullPath) => fs.existsSync(fullPath))
    .map((fullPath) => ({
        code: 'mtrack_runtime_path_forbidden',
        file: normalizePath(rootDir, fullPath),
        message: 'Retired M-Track runtime path must not exist.'
    }));

const collectDirectoryPatternViolations = (rootDir) => {
    const violations = [];
    for (const check of DIRECTORY_PATTERNS) {
        for (const filePath of walkFiles(rootDir, check.root)) {
            const base = path.basename(filePath);
            if (check.regex.test(base)) {
                violations.push({
                    code: check.code,
                    file: normalizePath(rootDir, filePath),
                    message: 'Retired M-Track executable test/probe file must not exist.'
                });
            }
        }
    }
    return violations;
};

const collectSourceReferenceViolations = (rootDir) => {
    const violations = [];
    for (const check of SOURCE_CHECKS) {
        const fullPath = path.resolve(rootDir, check.file);
        if (!fs.existsSync(fullPath)) continue;
        const source = fs.readFileSync(fullPath, 'utf8');
        for (const match of source.matchAll(check.regex)) {
            violations.push({
                code: check.code,
                file: check.file,
                message: 'Active bootstrap/package files must not reference the retired M-Track runtime.',
                excerpt: String(match[0] || '')
            });
        }
    }
    return violations;
};

export const checkMtrackRetired = ({ rootDir = DEFAULT_ROOT } = {}) => {
    const violations = [
        ...collectAbsentPathViolations(rootDir),
        ...collectDirectoryPatternViolations(rootDir),
        ...collectSourceReferenceViolations(rootDir)
    ];
    return Object.freeze({
        ok: violations.length === 0,
        violations
    });
};

const main = () => {
    const result = checkMtrackRetired();
    if (!result.ok) {
        console.error(`M-Track retirement guard failed with ${result.violations.length} violation(s):`);
        for (const violation of result.violations.slice(0, 80)) {
            console.error(`- [${violation.code}] ${violation.file}`);
            console.error(`  ${violation.message}`);
            if (violation.excerpt) console.error(`  ${violation.excerpt}`);
        }
        process.exit(1);
    }
    console.log('M-Track retirement guard OK');
};

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
