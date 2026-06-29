#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..');

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
        file: 'package-lock.json',
        marker: 'node_modules/@rolldown/binding-wasm32-wasi/node_modules/@emnapi/core',
        label: 'package-lock @emnapi resolution',
    },
    {
        file: 'package-lock.json',
        marker: 'node_modules/@rolldown/binding-wasm32-wasi/node_modules/@emnapi/runtime',
        label: 'package-lock @emnapi runtime resolution',
    },
    {
        file: 'package-lock.json',
        marker: '"node_modules/@emnapi/core"',
        label: 'package-lock top-level @emnapi core peer resolution',
    },
    {
        file: 'package-lock.json',
        marker: '"node_modules/@emnapi/runtime"',
        label: 'package-lock top-level @emnapi runtime peer resolution',
    },
    {
        file: 'scripts/server_update.js',
        marker: "ensureProductionEnvSecrets(envFile);",
        label: 'production env auth secret provisioning',
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

    process.stdout.write('[verify] deployed source contains the expected production routing, eVe assets, and lockfile markers.\n');
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
