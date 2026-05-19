import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_ROOT = process.cwd();

const CANONICAL_FILE_PATHS = [
    'atome/src/squirrel/ai',
    'atome/src/squirrel/atome/mcp.js',
    'atome/src/squirrel/voice/ai_planner.js',
    'atome/src/squirrel/voice/orchestrator.js',
    'atome/src/squirrel/voice/tool_router.js',
    'atome/src/squirrel/voice/service.js',
    'atome/src/squirrel/voice/semantic_contract.js'
];

const DIRECT_RUNTIME_MUTATION_PATTERNS = [
    {
        code: 'direct_runtime_property_mutation',
        message: 'Direct property mutation on a likely runtime object is forbidden in canonical AI/runtime files.',
        regex: /\b(?:atome|atomeObj|atomeObject|selectedAtome|targetAtome|runtimeObject|instance)\s*\.\s*[A-Za-z_$][\w$]*\s*=/g
    }
];

const SEMANTIC_REGEX_PATTERNS = [
    {
        code: 'regex_business_understanding',
        message: 'Regex-based business understanding is forbidden in canonical AI/planning files.',
        regex: /\/(?:\\\/|[^/\n])*(?:mail|mails|contact|contacts|calendar|calendrier|message|messages)(?:\\\/|[^/\n])*(?:create|update|delete|read|search|list|reply|send|archive|mark|unread|read_contact|read_event)(?:\\\/|[^/\n])*\/[gimsuy]*/gi
    }
];

const shouldSkipFile = (filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.includes('/node_modules/')
        || normalized.includes('/.git/')
        || normalized.includes('/dist/')
        || normalized.includes('/target/')
        || normalized.includes('.test.');
};

const toProjectPath = (rootDir, filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/');

const walk = (fullPath, acc = []) => {
    let stats;
    try {
        stats = fs.statSync(fullPath);
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
        return acc;
    }
    if (stats.isDirectory()) {
        for (const entry of fs.readdirSync(fullPath)) {
            walk(path.join(fullPath, entry), acc);
        }
        return acc;
    }
    if (!stats.isFile()) return acc;
    if (!fullPath.endsWith('.js') && !fullPath.endsWith('.mjs')) return acc;
    if (shouldSkipFile(fullPath)) return acc;
    acc.push(fullPath);
    return acc;
};

const collectCanonicalFiles = (rootDir = DEFAULT_ROOT, explicitPaths = CANONICAL_FILE_PATHS) => {
    const files = [];
    for (const relativePath of explicitPaths) {
        const absolutePath = path.resolve(rootDir, relativePath);
        walk(absolutePath, files);
    }
    return Array.from(new Set(files));
};

const collectViolationsForFile = ({
    rootDir = DEFAULT_ROOT,
    filePath,
    semanticRegexEnforced = false
} = {}) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const violations = [];
    for (const pattern of DIRECT_RUNTIME_MUTATION_PATTERNS) {
        for (const match of source.matchAll(pattern.regex)) {
            violations.push({
                code: pattern.code,
                message: pattern.message,
                file: toProjectPath(rootDir, filePath),
                excerpt: String(match[0] || '').trim()
            });
        }
    }
    if (semanticRegexEnforced) {
        for (const pattern of SEMANTIC_REGEX_PATTERNS) {
            for (const match of source.matchAll(pattern.regex)) {
                violations.push({
                    code: pattern.code,
                    message: pattern.message,
                    file: toProjectPath(rootDir, filePath),
                    excerpt: String(match[0] || '').trim()
                });
            }
        }
    }
    return violations;
};

export const checkEveAiGuardrails = ({
    rootDir = DEFAULT_ROOT,
    canonicalPaths = CANONICAL_FILE_PATHS
} = {}) => {
    const files = collectCanonicalFiles(rootDir, canonicalPaths);
    const violations = [];
    for (const filePath of files) {
        const projectPath = toProjectPath(rootDir, filePath);
        const semanticRegexEnforced = projectPath.startsWith('atome/src/squirrel/ai/')
            || projectPath.endsWith('atome/src/squirrel/voice/ai_planner.js');
        violations.push(...collectViolationsForFile({
            rootDir,
            filePath,
            semanticRegexEnforced
        }));
    }
    return {
        ok: violations.length === 0,
        scanned_files: files.map((filePath) => toProjectPath(rootDir, filePath)),
        violations
    };
};

const main = () => {
    const result = checkEveAiGuardrails();
    if (!result.ok) {
        console.error(`❌ eVe AI guardrails failed with ${result.violations.length} violation(s):`);
        result.violations.slice(0, 50).forEach((violation) => {
            console.error(`- [${violation.code}] ${violation.file}`);
            console.error(`  ${violation.message}`);
            console.error(`  ${violation.excerpt}`);
        });
        process.exit(1);
    }
    console.log(`✅ eVe AI guardrails OK (${result.scanned_files.length} file(s))`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
