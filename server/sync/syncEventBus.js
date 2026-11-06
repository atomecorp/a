import { EventEmitter } from 'node:events';

// The server's in-process bus for realtime envelopes (atome-sync, file-event,
// permission-change). It was owned by the chokidar file watcher of the aBox
// mirror; the mirror and its watcher were removed on 2026-11-06 (R-118).
const eventBus = new EventEmitter();

export function getSyncEventBus() {
    return eventBus;
}
