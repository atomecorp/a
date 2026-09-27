#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..');

const REQUIRED_PRODUCTION_DEPENDENCIES = [
    {
        name: 'rubberband-wasm',
        runtimeFiles: [
            'dist/index.esm.js',
            'dist/rubberband.wasm',
        ],
    },
];

const REQUIRED_MARKERS = [
    {
        file: 'server/server.js',
        marker: "const eveStaticRoot = path.join(projectRoot, 'eVe');",
        label: 'server eVe static root',
    },
    {
        file: 'server/server.js',
        marker: "prefix: '/eVe/'",
        label: 'server eVe static route',
    },
    {
        file: 'run.sh',
        marker: 'RUN_ENTRYPOINT_OVERRIDE="./run.sh" exec "$ROOT_DIR/scripts/setup/run_unix.sh" "$@"',
        label: 'run.sh entrypoint',
    },
    {
        file: 'scripts/setup/run_unix.sh',
        marker: 'dispatch_service_command_if_requested "$@"',
        label: 'run_unix early dispatcher',
    },
    {
        file: 'scripts/setup/run_unix.sh',
        marker: 'abort_production_dev_mode_without_args "$#"',
        label: 'run_unix production guard',
    },
    {
        file: 'scripts/setup/service_commands.sh',
        marker: 'service_foreground_server()',
        label: 'production foreground server route',
    },
    {
        file: 'scripts/setup/service_commands.sh',
        marker: 'Production foreground server mode does not accept extra arguments.',
        label: 'production --server argument guard',
    },
    {
        file: 'scripts/server_secure_config.js',
        marker: "ensureEnvSecret(envFile, 'JWT_SECRET', log);",
        label: 'production env auth secret provisioning',
    },
    {
        file: 'scripts/server_update.js',
        marker: 'ensureProductionSecureConfig({',
        label: 'production server identity provisioning',
    },
    {
        file: 'scripts/server_update.js',
        marker: "phase('eve-source', () => ensureEveSource());",
        label: 'production eVe source update phase',
    },
    {
        file: 'update_server.sh',
        marker: 'verify_eve_http',
        label: 'production eVe HTTP postcheck',
    },
];

const REQUIRED_FILES = [
    {
        file: 'eVe/eVe.js',
        label: 'eVe browser entrypoint',
    },
    {
        file: 'eVe/version.txt',
        label: 'eVe version file',
        nonEmpty: true,
    },
];

function runGit(projectRoot, args) {
    return execSync(`git -C "${projectRoot}" ${args}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}

function printGitIdentity(projectRoot) {
    const gitPath = path.join(projectRoot, '.git');

    if (!fs.existsSync(gitPath)) {
        process.stdout.write(`[verify] root repository: no git metadata at ${projectRoot}\n`);
        return;
    }

    process.stdout.write(`[verify] root repository path: ${projectRoot}\n`);
    process.stdout.write(`[verify] git root: ${runGit(projectRoot, 'rev-parse --show-toplevel')}\n`);
    process.stdout.write(`[verify] branch: ${runGit(projectRoot, 'branch --show-current')}\n`);
    process.stdout.write(`[verify] HEAD: ${runGit(projectRoot, 'rev-parse HEAD')}\n`);
    process.stdout.write(`[verify] latest commit: ${runGit(projectRoot, "log -1 --date=iso-strict --pretty='format:%h %cd %s'")}\n`);
}

function printEveIdentity(projectRoot) {
    const eveRoot = path.join(projectRoot, 'eVe');

    if (!fs.existsSync(eveRoot)) {
        throw new Error(`[verify] missing eVe checkout: ${eveRoot}`);
    }

    process.stdout.write(`[verify] eVe path: ${eveRoot}\n`);
    process.stdout.write(`[verify] eVe git root: ${runGit(eveRoot, 'rev-parse --show-toplevel')}\n`);
    process.stdout.write(`[verify] eVe branch: ${runGit(eveRoot, 'branch --show-current') || 'detached'}\n`);
    process.stdout.write(`[verify] eVe HEAD: ${runGit(eveRoot, 'rev-parse HEAD')}\n`);
    process.stdout.write(`[verify] eVe latest commit: ${runGit(eveRoot, "log -1 --date=iso-strict --pretty='format:%h %cd %s'")}\n`);
}

function requireMarker(projectRoot, spec) {
    const filePath = path.join(projectRoot, spec.file);

    if (!fs.existsSync(filePath)) {
        throw new Error(`[verify] missing ${spec.label}: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes(spec.marker)) {
        throw new Error([
            `[verify] deployed ${spec.label} is stale.`,
            `[verify] Missing marker: ${spec.marker}`,
            `[verify] File: ${filePath}`,
        ].join('\n'));
    }
}

function requireFile(projectRoot, spec) {
    const filePath = path.join(projectRoot, spec.file);

    if (!fs.existsSync(filePath)) {
        throw new Error(`[verify] missing ${spec.label}: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) {
        throw new Error(`[verify] invalid ${spec.label}: ${filePath}`);
    }

    if (spec.nonEmpty) {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (!content || content === 'unknown') {
            throw new Error(`[verify] invalid ${spec.label} content: ${filePath}`);
        }
    }
}

function readJson(filePath, label) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        throw new Error(`[verify] invalid ${label}: ${filePath}\n[verify] ${error?.message || error}`);
    }
}

export function verifyProductionDependencyLock(projectRoot = DEFAULT_PROJECT_ROOT) {
    const resolvedRoot = path.resolve(projectRoot);
    const packagePath = path.join(resolvedRoot, 'package.json');
    const lockPath = path.join(resolvedRoot, 'package-lock.json');
    const packageJson = readJson(packagePath, 'package manifest');
    const lockJson = readJson(lockPath, 'package lockfile');
    const lockedRootDependencies = lockJson.packages?.['']?.dependencies || {};

    for (const spec of REQUIRED_PRODUCTION_DEPENDENCIES) {
        const requested = packageJson.dependencies?.[spec.name];
        const lockedRequest = lockedRootDependencies[spec.name];
        const lockedPackage = lockJson.packages?.[`node_modules/${spec.name}`];

        if (!requested) {
            throw new Error(`[verify] missing production dependency declaration: ${spec.name}`);
        }
        if (lockedRequest !== requested) {
            throw new Error(`[verify] stale production dependency lock request: ${spec.name} (${lockedRequest || 'missing'} != ${requested})`);
        }
        if (!lockedPackage?.version || !lockedPackage?.integrity) {
            throw new Error(`[verify] missing locked production dependency package: ${spec.name}`);
        }
    }
}

export function verifyRuntimeDependencies(projectRoot = DEFAULT_PROJECT_ROOT) {
    const resolvedRoot = path.resolve(projectRoot);

    for (const spec of REQUIRED_PRODUCTION_DEPENDENCIES) {
        for (const relativeFile of spec.runtimeFiles) {
            requireFile(resolvedRoot, {
                file: path.join('node_modules', spec.name, relativeFile),
                label: `${spec.name} runtime asset`,
            });
        }
    }
}

export function verifyDeployedSource(projectRoot = DEFAULT_PROJECT_ROOT) {
    const resolvedRoot = path.resolve(projectRoot);

    process.stdout.write('[verify] === deployed source verification START ===\n');
    printGitIdentity(resolvedRoot);
    printEveIdentity(resolvedRoot);

    for (const spec of REQUIRED_MARKERS) {
        requireMarker(resolvedRoot, spec);
    }

    for (const spec of REQUIRED_FILES) {
        requireFile(resolvedRoot, spec);
    }

    verifyProductionDependencyLock(resolvedRoot);

    process.stdout.write('[verify] deployed source contains the expected production routing, eVe assets, and production dependency lock.\n');
    process.stdout.write('[verify] === deployed source verification END ===\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    try {
        verifyDeployedSource(process.argv[2] || DEFAULT_PROJECT_ROOT);
    } catch (error) {
        process.stderr.write(`${error?.message || error}\n`);
        process.exit(1);
    }
}
