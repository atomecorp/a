#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyDeployedSource } from './verify_deployed_source.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const updateRunId = process.env.RUN_ID || `${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z-${process.pid}`;
let activePhase = 'startup';

function nowIso() {
    return new Date().toISOString();
}

function log(message) {
    process.stdout.write(`[${nowIso()}][server_update][${updateRunId}][${activePhase}] ${message}\n`);
}

function durationMs(startedAt) {
    return Date.now() - startedAt;
}

function phase(name, fn) {
    activePhase = name;
    const startedAt = Date.now();
    log('START');
    try {
        const result = fn();
        log(`END duration_ms=${durationMs(startedAt)}`);
        activePhase = 'idle';
        return result;
    } catch (error) {
        const exitCode = typeof error?.status === 'number' ? error.status : 1;
        log(`FAIL exit_code=${exitCode} duration_ms=${durationMs(startedAt)} error=${error?.message || error}`);
        activePhase = 'idle';
        throw error;
    }
}

function skipPhase(name, reason) {
    activePhase = name;
    log(`SKIP ${reason}`);
    activePhase = 'idle';
}

function die(message) {
    log(`FAIL ${message}`);
    process.exit(1);
}

function run(command, options = {}) {
    const { cwd = projectRoot, allowFailure = false } = options;
    const startedAt = Date.now();
    log(`COMMAND start cwd=${cwd} command=${command}`);
    try {
        execSync(command, { cwd, stdio: 'inherit' });
        log(`COMMAND end exit_code=0 duration_ms=${durationMs(startedAt)} command=${command}`);
        return true;
    } catch (error) {
        const exitCode = typeof error?.status === 'number' ? error.status : 1;
        if (allowFailure) {
            log(`COMMAND allowed_failure exit_code=${exitCode} duration_ms=${durationMs(startedAt)} command=${command}`);
            return false;
        }
        log(`COMMAND fail exit_code=${exitCode} duration_ms=${durationMs(startedAt)} command=${command}`);
        throw error;
    }
}

function readCommand(command, options = {}) {
    const { cwd = projectRoot, allowFailure = false } = options;
    try {
        return execSync(command, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (error) {
        if (allowFailure) return '';
        throw error;
    }
}

function logGitState(label) {
    const head = readCommand('git rev-parse HEAD', { allowFailure: true });
    const branch = readCommand('git branch --show-current', { allowFailure: true });
    const upstream = readCommand('git rev-parse --abbrev-ref --symbolic-full-name @{u}', { allowFailure: true });
    const status = readCommand('git status --porcelain=v1', { allowFailure: true });
    const statusCount = status ? status.split('\n').filter(Boolean).length : 0;
    log(`git_${label} head=${head || 'unknown'} branch=${branch || 'unknown'} upstream=${upstream || 'none'} status_entries=${statusCount}`);
    if (status) {
        log(`git_${label}_status=${JSON.stringify(status.split('\n'))}`);
    }
}

function ensureDir(dirPath, mode) {
    fs.mkdirSync(dirPath, { recursive: true, mode });
}

function fileExists(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

function readText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content, mode) {
    fs.writeFileSync(filePath, content, { mode });
}

function nowStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function isTrackedByGit(relativePath) {
    try {
        execSync(`git ls-files --error-unmatch '${relativePath}'`, {
            cwd: projectRoot,
            stdio: 'ignore'
        });
        return true;
    } catch {
        return false;
    }
}

function moveAsideUntrackedFilesThatBlockPull() {
    // Migration helper: older installs used to have package-lock.json ignored.
    // Once package-lock.json becomes tracked, an untracked local file with the same
    // name will cause `git pull` to fail ("would be overwritten by merge").
    const lockRel = 'package-lock.json';
    const lockAbs = path.join(projectRoot, lockRel);
    if (!fileExists(lockAbs)) return;

    if (isTrackedByGit(lockRel)) return;

    const backupName = `package-lock.json.untracked.${nowStamp()}.bak`;
    const backupAbs = path.join(projectRoot, backupName);
    fs.renameSync(lockAbs, backupAbs);
    log(`Moved aside untracked ${lockRel} -> ${backupName}`);
}

function stashIfDirty() {
    // Production servers should stay on a clean git checkout.
    // If the working tree is dirty (manual edits, generated files, etc.), a fast-forward pull will fail.
    // We auto-stash to keep updates non-blocking while preserving the local changes for inspection.
    try {
        const status = execSync('git status --porcelain=v1', { cwd: projectRoot, encoding: 'utf8' });
        const trimmed = String(status || '').trim();
        if (!trimmed) {
            return;
        }

        const stamp = nowStamp();
        const message = `server_update auto-stash ${stamp}`;
        log(`Git working tree is dirty. Creating stash: "${message}"`);
        run(`git stash push -u -m "${message}"`, { cwd: projectRoot, allowFailure: false });
        log('Stashed local changes. Continuing with update.');
    } catch (error) {
        // If git is not available or status fails, let the normal flow handle it.
        log(`Unable to check/stash dirty git state: ${error?.message || error}`);
    }
}

function isRoot() {
    return typeof process.getuid === 'function' && process.getuid() === 0;
}

function ensureEnvFile({ envDir, envFile, appEnvExample, appEnvFallback }) {
    ensureDir(envDir, 0o755);

    if (fileExists(envFile)) {
        log(`Env file exists: ${envFile}`);
        return;
    }

    if (fileExists(appEnvFallback)) {
        fs.copyFileSync(appEnvFallback, envFile);
        fs.chmodSync(envFile, 0o600);
        log(`Copied env file from ${appEnvFallback} -> ${envFile}`);
        return;
    }

    if (fileExists(appEnvExample)) {
        fs.copyFileSync(appEnvExample, envFile);
        fs.chmodSync(envFile, 0o600);
        log(`Created env file from example ${appEnvExample} -> ${envFile}`);
        return;
    }

    const defaultEnv = [
        'NODE_ENV=production',
        'HOST=127.0.0.1',
        'PORT=3001',
        `SQLITE_PATH=${path.join(projectRoot, 'database_storage/adole.db')}`,
        `SQUIRREL_UPLOADS_DIR=${path.join(projectRoot, 'uploads')}`,
        ''
    ].join('\n');

    writeText(envFile, defaultEnv, 0o600);
    log(`Created default env file: ${envFile}`);
}

function ensureSystemdUnit({ serviceName, envFile }) {
    const unitPath = `/etc/systemd/system/${serviceName}.service`;
    const nodeExec = '/usr/bin/node';
    const unit = [
        '[Unit]',
        'Description=Squirrel Node.js Server',
        'After=network.target',
        '',
        '[Service]',
        'Type=simple',
        'User=root',
        'Group=root',
        `WorkingDirectory=${projectRoot}`,
        `ExecStart=${nodeExec} ${path.join(projectRoot, 'server/server.js')}`,
        'Restart=always',
        'RestartSec=5',
        `EnvironmentFile=${envFile}`,
        'Environment=NODE_ENV=production',
        'StandardOutput=journal',
        'StandardError=journal',
        `SyslogIdentifier=${serviceName}`,
        '',
        '[Install]',
        'WantedBy=multi-user.target',
        ''
    ].join('\n');

    const needsWrite = !fileExists(unitPath) || readText(unitPath) !== unit;
    if (!needsWrite) {
        log(`Systemd unit up-to-date: ${unitPath}`);
        return;
    }

    writeText(unitPath, unit, 0o644);
    log(`Wrote systemd unit: ${unitPath}`);
    run('systemctl daemon-reload');
    run(`systemctl enable ${serviceName}`, { allowFailure: true });
}

function backupPaths({ backupRoot, envFile, pathsToBackup }) {
    ensureDir(backupRoot, 0o755);

    const stamp = nowStamp();
    const backupDir = path.join(backupRoot, stamp);
    ensureDir(backupDir, 0o755);

    const envBackup = path.join(backupDir, 'squirrel.env');
    if (fileExists(envFile)) {
        fs.copyFileSync(envFile, envBackup);
        fs.chmodSync(envBackup, 0o600);
    }

    const tarPath = path.join(backupDir, 'backup.tgz');
    const existing = pathsToBackup.filter((p) => fileExists(p));
    if (existing.length > 0) {
        const rels = existing.map((p) => path.relative(projectRoot, p));
        run(`tar -czf ${tarPath} ${rels.map((p) => `'${p}'`).join(' ')}`, { cwd: projectRoot, allowFailure: true });
    }

    log(`Backup created: ${backupDir}`);
}

function ensureNodeModules() {
    // Deterministic install based on package-lock.json
    const lockPath = path.join(projectRoot, 'package-lock.json');
    if (!fileExists(lockPath)) {
        die(`Missing ${lockPath}. Reproducible installs require a lockfile.`);
    }

    // For native modules like better-sqlite3, build tooling must exist.
    // This is safe and idempotent on Debian/Ubuntu.
    run('apt-get update');
    run('apt-get install -y ca-certificates curl git build-essential python3 make g++ pkg-config libsqlite3-dev');

    run('npm ci --omit=dev');
}

function gitUpdate({ mode }) {
    logGitState('before');
    moveAsideUntrackedFilesThatBlockPull();
    run('git fetch origin');

    if (mode !== 'reset') {
        stashIfDirty();
    }

    if (mode === 'reset') {
        run('git reset --hard origin/main');
        // DO NOT run `git clean -fd` by default; it wipes .env and node_modules.
        logGitState('after');
        return;
    }

    // Safer default: fast-forward only
    run('git checkout main', { allowFailure: true });
    run('git pull --ff-only');
    logGitState('after');
}

function ensureRuntimeDirs() {
    ensureDir(path.join(projectRoot, 'uploads'), 0o775);
    ensureDir(path.join(projectRoot, 'database_storage'), 0o755);
}

function parseArgs(argv) {
    const args = new Set(argv);
    return {
        reset: args.has('--reset'),
        noGit: args.has('--no-git'),
        noDeps: args.has('--no-deps'),
        noRestart: args.has('--no-restart'),
        serviceName: 'squirrel',
        envDir: '/etc/squirrel',
        envFile: '/etc/squirrel/squirrel.env',
        backupRoot: '/var/backups/squirrel',
    };
}

async function main() {
    if (!isRoot()) {
        die('This script must be run as root.');
    }

    const opts = parseArgs(process.argv.slice(2));
    log(`run_id=${updateRunId}`);
    log(`project_root=${projectRoot}`);
    log(`args=${JSON.stringify(process.argv.slice(2))}`);
    log(`node=${process.version}`);
    log(`npm=${readCommand('npm --version', { allowFailure: true }) || 'not found'}`);
    log(`git=${readCommand('git --version', { allowFailure: true }) || 'not found'}`);

    const appEnvExample = path.join(projectRoot, '.env.example');
    const appEnvFallback = path.join(projectRoot, '.env');

    phase('env', () => ensureEnvFile({
        envDir: opts.envDir,
        envFile: opts.envFile,
        appEnvExample,
        appEnvFallback,
    }));

    phase('backup', () => backupPaths({
        backupRoot: opts.backupRoot,
        envFile: opts.envFile,
        pathsToBackup: [
            path.join(projectRoot, 'database_storage'),
            path.join(projectRoot, 'uploads'),
        ],
    }));

    phase('systemd-unit', () => ensureSystemdUnit({ serviceName: opts.serviceName, envFile: opts.envFile }));

    phase('runtime-dirs', () => ensureRuntimeDirs());

    if (!opts.noGit) {
        phase('git-update', () => gitUpdate({ mode: opts.reset ? 'reset' : 'pull' }));
    } else {
        skipPhase('git-update', '--no-git');
    }

    phase('verify-source', () => verifyDeployedSource(projectRoot));

    if (!opts.noDeps) {
        phase('npm-ci', () => ensureNodeModules());
    } else {
        skipPhase('npm-ci', '--no-deps');
    }

    if (!opts.noRestart) {
        phase('restart', () => run(`systemctl restart ${opts.serviceName}`));
    } else {
        skipPhase('restart', '--no-restart');
    }

    phase('status', () => run(`systemctl status ${opts.serviceName} --no-pager -l`, { allowFailure: true }));

    // Health check - if it fails, nginx will 502.
    phase('health', () => run('curl -fsS http://127.0.0.1:3001/health', { allowFailure: true }));

    // Reload nginx if present
    phase('nginx-reload', () => {
        if (run('nginx -t', { allowFailure: true })) {
            run('systemctl reload nginx', { allowFailure: true });
        } else {
            log('nginx config test failed or nginx is unavailable; skipping reload');
        }
    });

    log('Done.');
}

main().catch((error) => {
    const detail = String(error?.stack || error).replace(/\n/g, '\\n');
    log(`ERROR ${detail}`);
    process.exit(1);
});
