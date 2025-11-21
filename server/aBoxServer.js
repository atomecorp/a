import path from 'node:path';
import { promises as fs } from 'node:fs';
import { startFileSyncWatcher, getSyncEventBus } from './sync/fileSyncWatcher.js';

let watcherHandle = null;
let watcherLogListener = null;
let watcherSyncListener = null;
let watcherSyncConfig = null;
let watcherPathsEnsured = false;
const MIRROR_GUARD_TTL_MS = 2000;
const pendingMirrorGuards = {
    uploads: new Map(),
    monitored: new Map()
};

function resolveDirectoryFromEnv(envVarName) {
    const rawValue = typeof process.env[envVarName] === 'string'
        ? process.env[envVarName].trim()
        : '';
    if (!rawValue) {
        console.warn(`⚠️  ${envVarName} is not defined. aBox sync will stay disabled.`);
        return null;
    }
    return path.resolve(rawValue);
}

function ensureSyncConfig() {
    if (watcherSyncConfig) {
        return watcherSyncConfig;
    }

    const uploadsDir = resolveDirectoryFromEnv('SQUIRREL_UPLOADS_DIR');
    const monitoredDir = resolveDirectoryFromEnv('SQUIRREL_MONITORED_DIR');

    if (!uploadsDir || !monitoredDir) {
        return null;
    }

    if (uploadsDir === monitoredDir) {
        console.warn('⚠️  aBox sync disabled because uploads and monitored folders are identical.');
        return null;
    }

    watcherSyncConfig = { uploadsDir, monitoredDir };
    return watcherSyncConfig;
}

function isInsideFolder(targetPath, folderPath) {
    const relative = path.relative(folderPath, targetPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return false;
    }
    return true;
}

function registerMirrorGuard(map, absolutePath) {
    if (!absolutePath) {
        return;
    }

    const existing = map.get(absolutePath);
    if (existing) {
        clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
        map.delete(absolutePath);
    }, MIRROR_GUARD_TTL_MS);

    if (typeof timeout.unref === 'function') {
        timeout.unref();
    }

    map.set(absolutePath, timeout);
}

function clearMirrorGuard(map, absolutePath) {
    const timeout = map.get(absolutePath);
    if (timeout) {
        clearTimeout(timeout);
        map.delete(absolutePath);
    }
}

function shouldSkipMirror(map, absolutePath) {
    if (!absolutePath || !map.has(absolutePath)) {
        return false;
    }
    clearMirrorGuard(map, absolutePath);
    return true;
}

function describeEventLocation(fsEvent, config) {
    if (!fsEvent || !config) {
        return null;
    }

    const absolutePath = fsEvent.absolutePath
        ? path.resolve(fsEvent.absolutePath)
        : null;
    if (!absolutePath) {
        return null;
    }

    if (isInsideFolder(absolutePath, config.monitoredDir)) {
        const relativePath = path.relative(config.monitoredDir, absolutePath);
        if (!relativePath || relativePath.startsWith('..')) {
            return null;
        }
        return {
            origin: 'monitored',
            absolutePath,
            relativePath
        };
    }

    if (isInsideFolder(absolutePath, config.uploadsDir)) {
        const relativePath = path.relative(config.uploadsDir, absolutePath);
        if (!relativePath || relativePath.startsWith('..')) {
            return null;
        }
        return {
            origin: 'uploads',
            absolutePath,
            relativePath
        };
    }

    return null;
}

async function mirrorBetweenFolders(fsEvent, location, sourceDir, targetDir, guardMap, targetLabel) {
    const relativePath = location.relativePath;
    const sourcePath = path.join(sourceDir, relativePath);
    const destinationPath = path.join(targetDir, relativePath);
    const kind = fsEvent.kind;

    if (kind === 'add' || kind === 'change') {
        if (fsEvent.metadata?.isDirectory) {
            return;
        }

        registerMirrorGuard(guardMap, destinationPath);
        try {
            await fs.mkdir(path.dirname(destinationPath), { recursive: true });
            await fs.copyFile(sourcePath, destinationPath);
            console.log(`📤 Mirrored ${relativePath} to ${targetLabel} directory.`);
        } catch (error) {
            clearMirrorGuard(guardMap, destinationPath);
            if (error && error.code === 'ENOENT') {
                console.warn(`⚠️  Skipped mirroring ${relativePath} because the source vanished.`);
                return;
            }
            throw error;
        }
        return;
    }

    if (kind === 'unlink') {
        registerMirrorGuard(guardMap, destinationPath);
        try {
            await fs.unlink(destinationPath);
            console.log(`🗑️  Removed mirrored file ${relativePath} from ${targetLabel} directory.`);
        } catch (error) {
            clearMirrorGuard(guardMap, destinationPath);
            if (error && error.code === 'ENOENT') {
                return;
            }
            throw error;
        }
    }
}

function ensureWatcherTargets() {
    if (!watcherHandle || watcherPathsEnsured) {
        return;
    }

    const config = ensureSyncConfig();
    if (!config) {
        return;
    }

    const targets = [];
    if (config.monitoredDir) {
        targets.push(config.monitoredDir);
    }
    if (config.uploadsDir && config.uploadsDir !== config.monitoredDir) {
        targets.push(config.uploadsDir);
    }

    if (targets.length && watcherHandle.watcher && typeof watcherHandle.watcher.add === 'function') {
        watcherHandle.watcher.add(targets);
        watcherPathsEnsured = true;
        console.log('🔄 aBox watcher tracking:', targets);
    }
}

function attachWatcherSync() {
    if (watcherSyncListener) {
        return;
    }

    ensureWatcherTargets();

    const config = ensureSyncConfig();
    if (!config) {
        return;
    }

    watcherSyncListener = (payload) => {
        if (!payload || payload.type !== 'sync:file-event') {
            return;
        }
        const location = describeEventLocation(payload.payload, config);
        if (!location) {
            return;
        }

        const sourceGuard = location.origin === 'uploads'
            ? pendingMirrorGuards.uploads
            : pendingMirrorGuards.monitored;

        if (shouldSkipMirror(sourceGuard, location.absolutePath)) {
            return;
        }

        const targetDir = location.origin === 'uploads' ? config.monitoredDir : config.uploadsDir;
        const guardMap = location.origin === 'uploads'
            ? pendingMirrorGuards.monitored
            : pendingMirrorGuards.uploads;
        const targetLabel = location.origin === 'uploads' ? 'monitored' : 'uploads';
        const sourceDir = location.origin === 'uploads' ? config.uploadsDir : config.monitoredDir;

        mirrorBetweenFolders(payload.payload, location, sourceDir, targetDir, guardMap, targetLabel)
            .catch((error) => {
                console.warn('⚠️  Failed to mirror aBox file:', error?.message || error);
            });
    };

    getSyncEventBus().on('event', watcherSyncListener);
}

function detachWatcherSync() {
    if (!watcherSyncListener) {
        return;
    }
    getSyncEventBus().off('event', watcherSyncListener);
    watcherSyncListener = null;
}

function attachWatcherLogging() {
    if (watcherLogListener) {
        return;
    }

    watcherLogListener = (payload) => {
        if (!payload || payload.type !== 'sync:file-event') {
            return;
        }

        const event = payload.payload || {};
        const targetPath = event.normalizedPath || event.relativePath || event.absolutePath;

        // Filter logs to only show events related to aBox sync (uploads or monitored dir)
        const config = ensureSyncConfig();
        if (config) {
            const isUploads = isInsideFolder(event.absolutePath, config.uploadsDir);
            const isMonitored = isInsideFolder(event.absolutePath, config.monitoredDir);

            if (isUploads || isMonitored) {
                console.log(`📂 aBox Watcher detected ${event.kind} on ${targetPath}`);
            }
        }
    };

    getSyncEventBus().on('event', watcherLogListener);
}

function detachWatcherLogging() {
    if (!watcherLogListener) {
        return;
    }

    getSyncEventBus().off('event', watcherLogListener);
    watcherLogListener = null;
}

export function startABoxMonitoring(options = {}) {
    if (watcherHandle) {
        ensureWatcherTargets();
        return watcherHandle;
    }

    watcherHandle = startFileSyncWatcher(options);
    watcherPathsEnsured = false;
    ensureWatcherTargets();
    attachWatcherLogging();
    attachWatcherSync();
    return watcherHandle;
}

export async function stopABoxMonitoring() {
    if (!watcherHandle) {
        return;
    }

    try {
        await watcherHandle.stop();
    } finally {
        detachWatcherLogging();
        detachWatcherSync();
        watcherPathsEnsured = false;
        watcherHandle = null;
    }
}

export function getABoxWatcherHandle() {
    return watcherHandle;
}

export function getABoxEventBus() {
    return getSyncEventBus();
}
