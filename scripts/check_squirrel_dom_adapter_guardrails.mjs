import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['atome/src/squirrel/atome'];
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'temp', 'coverage']);

export const FORBIDDEN_ELEMENT_STATE_KEYS = [
    'properties',
    'props',
    'state',
    'model',
    'data',
    'meta',
    'timeline',
    'history',
    'permissions',
    'sync',
    'mediaSource',
    'mediaIdentifier',
    'sourceRef',
    'sourceUrl',
    'waveform',
    'thumbnail',
    'groupMembers',
    'groupSteps',
    'groupTimeline'
];

const FORBIDDEN_KEY_PATTERN = FORBIDDEN_ELEMENT_STATE_KEYS.join('|');
const DIRECT_ELEMENT_STATE_WRITE_RE = new RegExp(
    String.raw`\b(?:this\.element|element)\s*\.\s*(?:${FORBIDDEN_KEY_PATTERN})\s*=`,
    'g'
);
const SERIALIZED_DATASET_STATE_RE = /\b(?:this\.element|element)\.dataset\.[A-Za-z0-9_$]+\s*=\s*JSON\.stringify\s*\(/g;
const SET_ATTRIBUTE_STATE_RE = /\b(?:this\.element|element)\.setAttribute\s*\(\s*['"`]data-(?:properties|props|state|model|data|meta|timeline|history|permissions|sync|media-source|media-identifier|source-ref|source-url|waveform|thumbnail|group-members|group-steps|group-timeline)['"`]/g;

const toRelative = (filePath) => path.relative(ROOT, filePath).split(path.sep).join('/');

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

const collectMatches = (text, regex, file, rule, message) => {
    const violations = [];
    for (const match of text.matchAll(regex)) {
        violations.push({
            file,
            line: lineForIndex(text, match.index || 0),
            rule,
            message
        });
    }
    return violations;
};

export function findSquirrelDomAdapterViolations(text, file = '<inline>') {
    return [
        ...collectMatches(
            text,
            DIRECT_ELEMENT_STATE_WRITE_RE,
            file,
            'element_business_state_write',
            'Squirrel Atome business state must stay on the Atome instance/model, not on HTMLElement properties.'
        ),
        ...collectMatches(
            text,
            SERIALIZED_DATASET_STATE_RE,
            file,
            'element_serialized_dataset_state',
            'Squirrel Atome DOM projection may expose short references, but must not serialize business state into data-* attributes.'
        ),
        ...collectMatches(
            text,
            SET_ATTRIBUTE_STATE_RE,
            file,
            'element_data_attribute_state',
            'Squirrel Atome DOM projection must not use data-* attributes as canonical business state.'
        )
    ];
}

export function scanSquirrelDomAdapter(root = ROOT) {
    const violations = [];
    for (const sourceRoot of SOURCE_ROOTS) {
        for (const file of walk(path.join(root, sourceRoot))) {
            const rel = path.relative(root, file).split(path.sep).join('/');
            const text = fs.readFileSync(file, 'utf8');
            violations.push(...findSquirrelDomAdapterViolations(text, rel));
        }
    }
    return violations;
}

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '');

if (isMain) {
    const violations = scanSquirrelDomAdapter();
    if (violations.length) {
        console.error(JSON.stringify({ ok: false, violations }, null, 2));
        process.exit(1);
    }
    console.log('squirrel DOM adapter guardrails: ok');
}
