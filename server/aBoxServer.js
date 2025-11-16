import path from 'node:path';
import { promises as fs } from 'node:fs';
import { startFileSyncWatcher, getSyncEventBus } from './sync/fileSyncWatcher.js';

let watcherHandle = null;
let watcherLogListener = null;
let watcherSyncListener = null;
let watcherSyncConfig = null;

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

function isInsideMonitoredFolder(targetPath, monitoredDir) {
    const relative = path.relative(monitoredDir, targetPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return false;
    }
    return true;
}

async function mirrorFileIntoUploads(fsEvent, config) {
    if (!fsEvent || !config) {
        return;
    }

    const { monitoredDir, uploadsDir } = config;
    const absolutePath = fsEvent.absolutePath
        ? path.resolve(fsEvent.absolutePath)
        : null;
    if (!absolutePath || !isInsideMonitoredFolder(absolutePath, monitoredDir)) {
        return;
    }

    const relativePath = path.relative(monitoredDir, absolutePath);
    if (!relativePath || relativePath.startsWith('..')) {
        return;
    }

    const destinationPath = path.join(uploadsDir, relativePath);
    const kind = fsEvent.kind;

    if (kind === 'add' || kind === 'change') {
        if (fsEvent.metadata?.isDirectory) {
            return;
        }
        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        try {
            await fs.copyFile(absolutePath, destinationPath);
            console.log(`📤 Mirrored ${relativePath} to uploads directory.`);
        } catch (error) {
            if (error && error.code === 'ENOENT') {
                console.warn(`⚠️  Skipped mirroring ${relativePath} because the source vanished.`);
                return;
            }
            throw error;
        }
        return;
    }

    if (kind === 'unlink') {
        try {
            await fs.unlink(destinationPath);
            console.log(`🗑️  Removed mirrored file ${relativePath} from uploads directory.`);
        } catch (error) {
            if (error && error.code === 'ENOENT') {
                return;
            }
            throw error;
        }
    }
}

function attachWatcherSync() {
    if (watcherSyncListener) {
        return;
    }

    const config = ensureSyncConfig();
    if (!config) {
        return;
    }

    watcherSyncListener = (payload) => {
        if (!payload || payload.type !== 'sync:file-event') {
            return;
        }
        mirrorFileIntoUploads(payload.payload, config).catch((error) => {
            console.warn('⚠️  Failed to mirror monitored file:', error?.message || error);
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
        console.log(`📂 Watcher detected ${event.kind} on ${targetPath}`);
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
        return watcherHandle;
    }

    watcherHandle = startFileSyncWatcher(options);
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
        watcherHandle = null;
    }
}

export function getABoxWatcherHandle() {
    return watcherHandle;
}

export function getABoxEventBus() {
    return getSyncEventBus();
}
