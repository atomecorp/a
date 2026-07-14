import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['eVe', 'atome/src', 'server', 'database', 'scripts', 'tests'];
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'temp', 'coverage']);
const MUTATING_METHOD_RE = /method\s*:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/i;
const STATE_CURRENT_RE = /\/api\/state_current\b/;
const EVENTS_COMMIT_RE = /\/api\/events\/commit(?:-batch)?\b/;
const TIMELINE_DOM_BASELINE_RE = /\breadDomState\b/;
const TIMELINE_PREVIEW_FILE_RE = /(?:atome_timeline|molecule|timeline)/i;
const TIMELINE_PREVIEW_DOM_COMMIT_RE = /\b(?:preview|replay)\b[\s\S]{0,1200}\b(?:querySelector|getElementById|getAttribute|dataset)\b[\s\S]{0,1200}\b(?:commitBatch|Atome\.commit|\/api\/events\/commit)/i;

const ALLOWED_STATE_CURRENT_WRITERS = new Set([
    'server/atomeRoutes.orm.js'
]);

const ALLOWED_EVENT_COMMIT_CALLERS = new Set([
    'eVe/core/atome_commit.js',
    'eVe/core/atome_commit_effects.js',
    'eVe/core/atome_commit_url.js',
    'atome/src/squirrel/apis/unified/adole.js',
    'server/atomeRoutes.orm.js',
    'server/atomeEventRoutes.js',
    'server/server.js'
]);

const toRelative = (root, filePath) => path.relative(root, filePath).split(path.sep).join('/');

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
        if (!/\.(?:js|mjs|cjs|ts|jsx|tsx)$/i.test(entry.name)) continue;
        files.push(full);
    }
    return files;
};

const readWindow = (lines, index, radius = 8) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(lines.length, index + radius + 1);
    return lines.slice(start, end).join('\n');
};

export const scanMutationOwnership = ({ root = ROOT, sourceRoots = SOURCE_ROOTS } = {}) => {
    const violations = [];
    for (const sourceRoot of sourceRoots) {
        for (const file of walk(path.join(root, sourceRoot))) {
            const rel = toRelative(root, file);
        const text = fs.readFileSync(file, 'utf8');
        const lines = text.split(/\r?\n/);
        if (rel === 'eVe/core/atome_timeline.js' && TIMELINE_DOM_BASELINE_RE.test(text)) {
            violations.push({
                file: rel,
                line: 1,
                rule: 'timeline_dom_baseline',
                message: 'Timeline replay baselines must come from events or state_current, never from DOM projection state.'
            });
        }
        if (TIMELINE_PREVIEW_FILE_RE.test(rel) && TIMELINE_PREVIEW_DOM_COMMIT_RE.test(text)) {
            violations.push({
                file: rel,
                line: 1,
                rule: 'timeline_preview_dom_commit',
                message: 'Timeline preview/replay code must not combine DOM projection reads with backend commits; use ReplayState -> commands -> commitBatch.'
            });
        }
            lines.forEach((line, index) => {
                if (STATE_CURRENT_RE.test(line)) {
                    const context = readWindow(lines, index);
                    if (MUTATING_METHOD_RE.test(context) && !ALLOWED_STATE_CURRENT_WRITERS.has(rel)) {
                        violations.push({
                            file: rel,
                            line: index + 1,
                            rule: 'state_current_write_bypass',
                            message: 'state_current is a projection and must not be mutated directly; use window.Atome.commit or commitBatch.'
                        });
                    }
                }
                if (EVENTS_COMMIT_RE.test(line) && !ALLOWED_EVENT_COMMIT_CALLERS.has(rel)) {
                    violations.push({
                        file: rel,
                        line: index + 1,
                        rule: 'event_commit_owner_bypass',
                        message: 'Direct event commit transport calls must stay inside the canonical atome commit owner.'
                    });
                }
            });
        }
    }
    return violations;
};

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
    const violations = scanMutationOwnership();
    if (violations.length) {
        console.error(JSON.stringify({ ok: false, violations }, null, 2));
        process.exit(1);
    }

    console.log('mutation ownership guardrails: ok');
}
