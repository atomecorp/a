#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function run(command, options = {}) {
  const { cwd = projectRoot, allowFailure = false } = options;
  process.stdout.write(`\n$ ${command}\n`);
  try {
    execSync(command, { cwd, stdio: 'inherit' });
    return true;
  } catch (error) {
    if (allowFailure) return false;
    throw error;
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

function isRoot() {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

function ensureEnvFile({ envDir, envFile, appEnvExample, appEnvFallback }) {
  ensureDir(envDir, 0o755);

  if (fileExists(envFile)) {
    process.stdout.write(`Env file exists: ${envFile}\n`);
    return;
  }

  if (fileExists(appEnvFallback)) {
    fs.copyFileSync(appEnvFallback, envFile);
    fs.chmodSync(envFile, 0o600);
    process.stdout.write(`Copied env file from ${appEnvFallback} -> ${envFile}\n`);
    return;
  }

  if (fileExists(appEnvExample)) {
    fs.copyFileSync(appEnvExample, envFile);
    fs.chmodSync(envFile, 0o600);
    process.stdout.write(`Created env file from example ${appEnvExample} -> ${envFile}\n`);
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
  process.stdout.write(`Created default env file: ${envFile}\n`);
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
    process.stdout.write(`Systemd unit up-to-date: ${unitPath}\n`);
    return;
  }

  writeText(unitPath, unit, 0o644);
  process.stdout.write(`Wrote systemd unit: ${unitPath}\n`);
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

  process.stdout.write(`Backup created: ${backupDir}\n`);
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
  run('git fetch origin');

  if (mode === 'reset') {
    run('git reset --hard origin/main');
    // DO NOT run `git clean -fd` by default; it wipes .env and node_modules.
    return;
  }

  // Safer default: fast-forward only
  run('git checkout main', { allowFailure: true });
  run('git pull --ff-only');
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

  const appEnvExample = path.join(projectRoot, '.env.example');
  const appEnvFallback = path.join(projectRoot, '.env');

  ensureEnvFile({
    envDir: opts.envDir,
    envFile: opts.envFile,
    appEnvExample,
    appEnvFallback,
  });

  backupPaths({
    backupRoot: opts.backupRoot,
    envFile: opts.envFile,
    pathsToBackup: [
      path.join(projectRoot, 'database_storage'),
      path.join(projectRoot, 'uploads'),
    ],
  });

  ensureSystemdUnit({ serviceName: opts.serviceName, envFile: opts.envFile });

  ensureRuntimeDirs();

  if (!opts.noGit) {
    gitUpdate({ mode: opts.reset ? 'reset' : 'pull' });
  }

  if (!opts.noDeps) {
    ensureNodeModules();
  }

  if (!opts.noRestart) {
    run(`systemctl restart ${opts.serviceName}`);
  }

  run(`systemctl status ${opts.serviceName} --no-pager`, { allowFailure: true });

  // Health check - if it fails, nginx will 502.
  run('curl -fsS http://127.0.0.1:3001/health', { allowFailure: true });

  // Reload nginx if present
  if (run('nginx -t', { allowFailure: true })) {
    run('systemctl reload nginx', { allowFailure: true });
  }

  process.stdout.write('\nDone.\n');
}

main().catch((error) => {
  process.stderr.write(`\nERROR: ${error?.stack || error}\n`);
  process.exit(1);
});
