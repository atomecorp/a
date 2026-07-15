import assert from 'node:assert/strict';

import { createDashboardRecordFadeController } from '../../eVe/domains/dashboard/dashboard_projection_lifecycle.js';

const originalWindow = globalThis.window;
let now = 1;
const frames = [];
let releaseFirstOpacity;
const firstOpacity = new Promise((resolve) => { releaseFirstOpacity = resolve; });
const state = { fadeOpacity: 0, fadeAnimationFrame: 0, fadeAnimationSerial: 0 };
const applied = [];
let rendered = 0;

try {
    globalThis.window = {
        performance: { now: () => now },
        requestAnimationFrame: (callback) => {
            frames.push(callback);
            return frames.length;
        },
        cancelAnimationFrame: () => {}
    };
    const fade = createDashboardRecordFadeController({
        state,
        render: async () => { rendered += 1; },
        applyOpacity: (opacity) => {
            applied.push(opacity);
            return applied.length === 1 ? firstOpacity : Promise.resolve();
        }
    });

    const animation = fade.animate({ to: 1, durationMs: 100 });
    while (frames.length) {
        now += 20;
        frames.shift()();
    }

    assert.equal(applied.length, 1, 'a slow projection must not accumulate one opacity update per frame');
    releaseFirstOpacity();
    await animation;
    assert.equal(applied.at(-1), 1);
    assert.equal(rendered, 1);
} finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
}
