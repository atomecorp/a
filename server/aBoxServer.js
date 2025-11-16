import { startFileSyncWatcher, getSyncEventBus } from './sync/fileSyncWatcher.js';

let watcherHandle = null;
let watcherLogListener = null;

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
        watcherHandle = null;
    }
}

export function getABoxWatcherHandle() {
    return watcherHandle;
}

export function getABoxEventBus() {
    return getSyncEventBus();
}
