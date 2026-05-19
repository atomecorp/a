import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_ROOT = process.cwd();
const DEFAULT_TARGETS = [
    'eve/application/intuition/tools/molecule',
    'eve/application/core/project_store',
    'eve/application/core/event_store',
    'eve/application/core/media_store'
];
const MTRACK_STYLE_CONTRACT_FILES = [
    'eve/application/domains/mtrax/ui/styles.js',
    'eve/application/domains/mtrax/ui/preview_styles.js'
];

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.mts']);
const FORBIDDEN_TRANSPORT_PATH = `${'fall'}${'back'}`;
const FORBIDDEN_OLD_SURFACE = `${'leg'}${'acy'}`;
const REQUEST_WITH_WS_FORBIDDEN_PATH = `requestWithWs${FORBIDDEN_TRANSPORT_PATH[0].toUpperCase()}${FORBIDDEN_TRANSPORT_PATH.slice(1)}`;

const FORBIDDEN_PATTERNS = [
    {
        code: `${FORBIDDEN_TRANSPORT_PATH}_path_forbidden`,
        message: `${FORBIDDEN_TRANSPORT_PATH} execution paths are forbidden in Molecule core paths.`,
        regex: new RegExp(`\\b${FORBIDDEN_TRANSPORT_PATH}\\b`, 'gi')
    },
    {
        code: `${FORBIDDEN_OLD_SURFACE}_runtime_reference_forbidden`,
        message: `${FORBIDDEN_OLD_SURFACE} runtime references are forbidden in Molecule core paths.`,
        regex: new RegExp(`\\b${FORBIDDEN_OLD_SURFACE}\\b`, 'gi')
    },
    {
        code: 'mirror_forbidden',
        message: 'Mirror writes are forbidden in Molecule core paths.',
        regex: /\bmirror(?:ed|ing)?\b/gi
    },
    {
        code: 'ws_forbidden_path_forbidden',
        message: `${REQUEST_WITH_WS_FORBIDDEN_PATH} is forbidden in Molecule core paths.`,
        regex: new RegExp(`\\b${REQUEST_WITH_WS_FORBIDDEN_PATH}\\b`, 'g')
    },
    {
        code: 'mtrack_dependency_forbidden',
        message: 'Molecule must not import M-Track runtime code.',
        regex: /\b(?:import|from)\b[\s\S]{0,160}['"][^'"]*(?:\/|^)(?:mtrack|mtrax)(?:\/|\.js|['"])/gi
    },
    {
        code: 'mtrack_global_forbidden',
        message: 'M-Track globals are forbidden in Molecule core paths.',
        regex: /\b(?:window\.__MTRACK|__MTRACK|MTRACK_TRACE|activeGroupId|activeGroupTimeline|currentClips)\b/g
    },
    {
        code: 'molecule_active_global_forbidden',
        message: 'Implicit molecule globals (activeTimeline, activeSession, currentMoleculeSession) are forbidden. Pass sessions by explicit handle.',
        regex: /\b(?:activeTimeline|activeSession|currentMoleculeSession|__MOLECULE_ACTIVE__|window\.__MOLECULE__)\b/g
    },
    {
        code: 'silent_catch_forbidden',
        message: 'Silent catch blocks are forbidden. Fail loudly with typed errors.',
        regex: /catch\s*\([^)]*\)\s*\{\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)?\}/g
    },
    {
        code: 'dom_reference_persistence_forbidden',
        message: 'DOM node references must not appear in Molecule models or persistence paths.',
        regex: /\b(?:videoNode|audioNode|canvasNode|domNode|htmlElement|HTMLElement|HTMLVideoElement|HTMLAudioElement)\b/g
    },
    {
        code: 'local_tool_registration_forbidden',
        message: 'Molecule must consume canonical tools from the existing tool registry, not register duplicate tools locally.',
        regex: /\b(?:registerAtomeTool|registerUiAction|registerTool|registerToolHandler)\s*\(/g
    },
    {
        code: 'tool_clone_forbidden',
        message: 'Molecule must not clone tools; it must render canonical tool definitions in the integrated tools row.',
        regex: /\b(?:cloneTool|destroyToolDomClone)\s*\(/g
    },
    {
        code: 'inline_tool_definition_forbidden',
        message: 'Inline tool definitions are forbidden in Molecule; use canonical registry definitions.',
        regex: /\b(?:tool_name|tool_key|tool_id|name_key)\s*:/g
    }
];

const MTRACK_FORBIDDEN_STYLE_PATTERNS = [
    {
        code: 'mtrack_docked_host_direct_media_style_forbidden',
        message: 'Molecule docked host styles must not target direct media children; use the dedicated preview surface.',
        regex: /\.eve-mtrack-docked-host\s*>\s*(?:img|video|svg|canvas|\[data-role=["']atome-shape-svg["']\])/g
    }
];

const MTRACK_REQUIRED_STYLE_CONTRACTS = [
    {
        code: 'mtrack_preview_surface_required',
        message: 'Molecule preview media must be isolated behind the dedicated preview surface class.',
        file: 'eve/application/domains/mtrax/ui/preview_styles.js',
        needle: '.eve-mtrack-preview-surface'
    }
];

const normalizeProjectPath = (rootDir, filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/');

const walk = (fullPath, files = []) => {
    if (!fs.existsSync(fullPath)) return files;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(fullPath)) {
            if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'target') continue;
            walk(path.join(fullPath, entry), files);
        }
        return files;
    }
    if (!stat.isFile()) return files;
    if (!SOURCE_EXTENSIONS.has(path.extname(fullPath))) return files;
    files.push(fullPath);
    return files;
};

const collectFiles = (rootDir, targets) => {
    const files = [];
    for (const target of targets) {
        walk(path.resolve(rootDir, target), files);
    }
    return Array.from(new Set(files));
};

const collectExistingContractFiles = (rootDir, relativeFiles) => (
    relativeFiles
        .map((file) => path.resolve(rootDir, file))
        .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile())
);

const collectViolationsForFile = (rootDir, filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const file = normalizeProjectPath(rootDir, filePath);
    const violations = [];
    for (const pattern of FORBIDDEN_PATTERNS) {
        for (const match of source.matchAll(pattern.regex)) {
            violations.push({
                code: pattern.code,
                file,
                message: pattern.message,
                excerpt: String(match[0] || '').trim().replace(/\s+/g, ' ').slice(0, 220)
            });
        }
    }
    return violations;
};

const collectMtrackStyleViolations = (rootDir) => {
    const violations = [];
    const files = collectExistingContractFiles(rootDir, MTRACK_STYLE_CONTRACT_FILES);
    for (const filePath of files) {
        const source = fs.readFileSync(filePath, 'utf8');
        const file = normalizeProjectPath(rootDir, filePath);
        for (const pattern of MTRACK_FORBIDDEN_STYLE_PATTERNS) {
            for (const match of source.matchAll(pattern.regex)) {
                violations.push({
                    code: pattern.code,
                    file,
                    message: pattern.message,
                    excerpt: String(match[0] || '').trim().replace(/\s+/g, ' ').slice(0, 220)
                });
            }
        }
    }
    for (const contract of MTRACK_REQUIRED_STYLE_CONTRACTS) {
        const filePath = path.resolve(rootDir, contract.file);
        const source = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
        if (!source.includes(contract.needle)) {
            violations.push({
                code: contract.code,
                file: contract.file,
                message: contract.message,
                excerpt: contract.needle
            });
        }
    }
    return violations;
};

export const checkMoleculeGuardrails = ({
    rootDir = DEFAULT_ROOT,
    targets = DEFAULT_TARGETS
} = {}) => {
    const files = collectFiles(rootDir, targets);
    const violations = [
        ...files.flatMap((filePath) => collectViolationsForFile(rootDir, filePath)),
        ...collectMtrackStyleViolations(rootDir)
    ];
    return {
        ok: violations.length === 0,
        scanned_files: [
            ...files.map((filePath) => normalizeProjectPath(rootDir, filePath)),
            ...collectExistingContractFiles(rootDir, MTRACK_STYLE_CONTRACT_FILES)
                .map((filePath) => normalizeProjectPath(rootDir, filePath))
        ],
        violations
    };
};

const parseTargets = (argv) => {
    const index = argv.indexOf('--paths');
    if (index < 0 || !argv[index + 1]) return DEFAULT_TARGETS;
    return argv[index + 1].split(',').map((item) => item.trim()).filter(Boolean);
};

const main = () => {
    const result = checkMoleculeGuardrails({ targets: parseTargets(process.argv) });
    if (!result.ok) {
        console.error(`Molecule guardrails failed with ${result.violations.length} violation(s):`);
        for (const violation of result.violations.slice(0, 80)) {
            console.error(`- [${violation.code}] ${violation.file}`);
            console.error(`  ${violation.message}`);
            console.error(`  ${violation.excerpt}`);
        }
        process.exit(1);
    }
    console.log(`Molecule guardrails OK (${result.scanned_files.length} file(s))`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
