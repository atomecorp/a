import chokidar from 'chokidar';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_INCLUDE = [
    'src/application/**/*.js',
    'src/squirrel/**/*.js',
    'documentations/**/*.{md,json}',
    'database/**/*.js',
    'server/**/*.js',
    'scripts_utils/**/*.js',
    'src/assets/**/*'
];

const DEFAULT_IGNORE = [
    '**/node_modules/**',
    '**/.git/**',
    '**/.idea/**',
    '**/.vscode/**',
    '**/.DS_Store',
    'dist/**',
    'target/**',
    'src-tauri/target/**',
    'src/assets/uploads/**'
];

const MAX_HASH_BYTES = 1024 * 1024; // 1 MiB safeguard
const eventBus = new EventEmitter();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveProjectRoot(customRoot) {
    if (customRoot) {
        return path.resolve(customRoot);
    }
    return path.resolve(__dirname, '..', '..');
}

function normalizeList(value, fallback) {
    if (Array.isArray(value) && value.length) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length) {
        return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    return fallback.slice();
}

async function hashFile(absPath, limitBytes = MAX_HASH_BYTES) {
    try {
        const stats = await fs.stat(absPath);
        if (!stats.isFile()) {
            return null;
        }
        if (stats.size > limitBytes) {
            return `skip:${stats.size}`;
        }
        const data = await fs.readFile(absPath);
        const hash = createHash('sha1');
        hash.update(data);
        return hash.digest('hex');
    } catch (_) {
        return null;
    }
}

function inferRuntimeTag() {
    if (process.env.SQUIRREL_RUNTIME) {
        return process.env.SQUIRREL_RUNTIME;
    }
    if (process.env.TAURI_ENV || process.env.TAURI_DEBUG || process.env.__TAURI__ === '1') {
        return 'tauri-fastify';
    }
    return 'fastify';
}

function normalizePath(projectRoot, filePath) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
    const relativePath = path.relative(projectRoot, absolutePath);
    return {
        absolutePath,
        relativePath,
        normalizedPath: relativePath.split(path.sep).join('/')
    };
}

async function buildFsEventPayload(kind, filePath, stats, projectRoot, hashLimit) {
    const { absolutePath, relativePath, normalizedPath } = normalizePath(projectRoot, filePath);
    const metadata = {
        size: stats ? stats.size : null,
        mtimeMs: stats ? stats.mtimeMs : null,
        birthtimeMs: stats ? stats.birthtimeMs : null,
        isDirectory: Boolean(stats && typeof stats.isDirectory === 'function' && stats.isDirectory()),
        hash: null
    };

    if (!metadata.isDirectory && (kind === 'add' || kind === 'change')) {
        metadata.hash = await hashFile(absolutePath, hashLimit);
    }

    return {
        kind,
        absolutePath,
        relativePath,
        normalizedPath,
        workspaceRoot: projectRoot,
        metadata
    };
}

function emitEnvelope(type, payload) {
    eventBus.emit('event', {
        type,
        version: 1,
        runtime: inferRuntimeTag(),
        timestamp: new Date().toISOString(),
        host: {
            platform: process.platform,
            release: os.release()
        },
        payload
    });
}

export function startFileSyncWatcher(options = {}) {
    const projectRoot = resolveProjectRoot(options.projectRoot);
    const watched = normalizeList(options.watch ?? process.env.SQUIRREL_SYNC_WATCH, DEFAULT_INCLUDE);
    const ignored = normalizeList(options.ignore ?? process.env.SQUIRREL_SYNC_IGNORE, DEFAULT_IGNORE);
    const rawHashLimit = options.maxHashBytes ?? process.env.SQUIRREL_HASH_LIMIT ?? MAX_HASH_BYTES;
    const parsedHashLimit = Number(rawHashLimit);
    const hashLimit = Number.isFinite(parsedHashLimit) && parsedHashLimit > 0
        ? parsedHashLimit
        : MAX_HASH_BYTES;

    const watcher = chokidar.watch(watched, {
        cwd: projectRoot,
        ignored,
        ignoreInitial: false,
        followSymlinks: true,
        persistent: true,
        awaitWriteFinish: {
            stabilityThreshold: 200,
            pollInterval: 100
        }
    });

    watcher
        .on('ready', () => {
            emitEnvelope('sync:ready', { watched, ignored });
        })
        .on('error', (error) => {
            emitEnvelope('sync:error', { message: error?.message || String(error) });
        });

    const forward = async (kind, filePath, stats) => {
        try {
            const fsEvent = await buildFsEventPayload(kind, filePath, stats, projectRoot, hashLimit);
            emitEnvelope('sync:file-event', fsEvent);
        } catch (error) {
            emitEnvelope('sync:error', {
                message: error?.message || String(error),
                context: { kind, filePath }
            });
        }
    };

    watcher
        .on('add', (filePath, stats) => forward('add', filePath, stats))
        .on('change', (filePath, stats) => forward('change', filePath, stats))
        .on('unlink', (filePath) => forward('unlink', filePath))
        .on('addDir', (filePath, stats) => forward('addDir', filePath, stats))
        .on('unlinkDir', (filePath) => forward('unlinkDir', filePath));

    const stop = async () => {
        try {
            await watcher.close();
        } finally {
            emitEnvelope('sync:stopped', { watched, ignored });
        }
    };

    return {
        bus: eventBus,
        watcher,
        config: { projectRoot, watched, ignored, hashLimit },
        stop
    };
}

export function getSyncEventBus() {
    return eventBus;
}
