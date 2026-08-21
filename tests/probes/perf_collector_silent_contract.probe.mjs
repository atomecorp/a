import assert from 'node:assert/strict';
import { startPerfCollector } from '../../atome/src/utils/perf_collector_runtime.js';

const lines = [];
const listeners = new Map();
const storage = new Map([['squirrel_perf', 'logs']]);
const win = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    console: { log: (...parts) => lines.push(parts.join(' ')) },
    localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key)
    },
    performance: { now: () => 10, getEntriesByType: () => [] },
    setInterval: () => 1
};

const collector = startPerfCollector(win);
assert.ok(collector, 'the opted-in collector remains available for explicit diagnosis');
collector.record({ name: 'project_view.mount.first_paint', atMs: 10, totalMs: 4 });
collector.record({ name: 'project_view.mount.records_loaded', atMs: 1000, totalMs: 12 });
assert.equal(lines.length, 0, 'legacy logs opt-in must never print per-event or gap console noise');
assert.equal(collector.events.length, 3, 'events and the derived gap remain available through the explicit collector');

console.log('perf_collector_silent_contract.test: PASS');
