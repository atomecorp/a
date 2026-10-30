import assert from 'node:assert/strict';
import { startPerfCollector } from '../../atome/src/utils/perf_collector_runtime.js';

const createHost = () => {
    const frames = new Map(), intervals = new Map(), listeners = new Map(), storage = new Map();
    let id = 0, clock = 0, frameCalls = 0;
    const host = {
        location: { search: '' },
        performance: { now: () => clock, getEntriesByType: () => [] },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        },
        addEventListener: (name, callback) => {
            const group = listeners.get(name) || new Set();
            group.add(callback);
            listeners.set(name, group);
        },
        removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
        setInterval: callback => { intervals.set(++id, callback); return id; },
        clearInterval: key => intervals.delete(key),
        requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
        cancelAnimationFrame: key => frames.delete(key)
    };
    const resources = () => ({ frames: frames.size, intervals: intervals.size,
        listeners: [...listeners.values()].reduce((sum, group) => sum + group.size, 0) });
    const tick = () => {
        clock += 100;
        for (const callback of intervals.values()) callback();
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) { frameCalls++; callback(clock); }
    };
    const emit = detail => {
        for (const callback of listeners.get('squirrel:perf') || []) callback({ detail });
    };
    return { host, resources, tick, emit, frameCalls: () => frameCalls, advance: ms => { clock += ms; } };
};

const fixture = createHost();
assert.equal(startPerfCollector(fixture.host), null);
assert.deepEqual(fixture.resources(), { frames: 0, intervals: 0, listeners: 0 }, 'disabled startup owns no scheduled work');
fixture.host.__squirrelPerfEnable();
const collector = fixture.host.__squirrelPerf;
assert.deepEqual(fixture.resources(), { frames: 1, intervals: 1, listeners: 2 });
fixture.emit({ name: 'first', atMs: 0 });
fixture.tick();
fixture.emit({ name: 'second', atMs: 100 });
assert.equal(collector.events.length, 2);
fixture.host.__squirrelPerfDisable();
const afterDisable = fixture.resources();
const calls = fixture.frameCalls();
for (let index = 0; index < 60; index++) fixture.tick();
console.log(JSON.stringify({ after_disable: afterDisable,
    unwanted_frame_callbacks_after_disable: fixture.frameCalls() - calls }));
assert.deepEqual(afterDisable, { frames: 0, intervals: 0, listeners: 0 }, 'disabling must release all owned work');
assert.equal(fixture.frameCalls(), calls, 'a stopped collector must not wake on future frames');
assert.equal(collector.events.length, 2, 'disable retains the captured buffer');

for (let cycle = 0; cycle < 100; cycle++) {
    fixture.host.__squirrelPerfEnable();
    fixture.host.__squirrelPerfEnable();
    assert.equal(fixture.host.__squirrelPerf, collector, 'enable reuses the same bounded collector');
    assert.deepEqual(fixture.resources(), { frames: 1, intervals: 1, listeners: 2 }, 'enable is idempotent');
    fixture.tick();
    fixture.emit({ name: `cycle-${cycle}`, atMs: cycle * 1000 });
    collector.stop();
    collector.stop();
    assert.deepEqual(fixture.resources(), { frames: 0, intervals: 0, listeners: 0 }, 'stop is idempotent');
    fixture.advance(10000);
}
assert.equal(collector.events.filter(event => event.name === 'perf.gap').length, 0,
    'disabled time must not become a reported stall after resuming');
console.log('perf_collector_lifecycle: PASS');
