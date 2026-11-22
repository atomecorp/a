// R-212 — a connected screen's page shares its storage with the device's page and shows the project read only (in
// Consultation): it must never note that mode for the device, nor take the device's own note (user, 19 Nov. 2026).
// Run: node tests/probes/external_display/external_display_work_mode.probe.mjs
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const PENDING_CLOSE_KEY = 'eve_work_mode_pending_close';

{
    const previousLocation = globalThis.location, previousWindow = globalThis.window;
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/src/index.html?display=follower' });
    const win = dom.window;
    // The role is read once, from this page's address, when its module loads.
    globalThis.location = win.location;
    globalThis.window = win;
    // Node's own `localStorage` (no file) stores nothing: the page's is the one shared with the device.
    Object.defineProperty(globalThis, 'localStorage', { value: win.localStorage, configurable: true });
    try {
        const { isExternalDisplayFollower } = await import('#squirrel/external_display_role.js');
        assert.equal(isExternalDisplayFollower(), true);
        const { installProjectWorkModeCloseTracking, restoreProjectWorkMode } = await import('../../../eVe/domains/rendering/project_work_mode_persistence.js');
        const { setProjectReadOnly, getProjectWorkMode } = await import('../../../eVe/domains/rendering/project_work_mode_state.js');

        // The device left its project in Édition; the screen shows the same project read only.
        win.localStorage.setItem(PENDING_CLOSE_KEY, JSON.stringify({ p1: 'edit' }));
        win.__eveWorkspaceMode = { mode: 'project', projectId: 'p1' };
        setProjectReadOnly('p1', true);
        assert.equal(getProjectWorkMode('p1'), 'consultation');

        assert.equal(installProjectWorkModeCloseTracking(win), false);
        win.dispatchEvent(new win.Event('pagehide'));
        assert.deepEqual(JSON.parse(win.localStorage.getItem(PENDING_CLOSE_KEY)), { p1: 'edit' }, 'no Consultation noted for the device');

        // Opening the project on the screen reads the record, never the device's note, and leaves that note.
        await restoreProjectWorkMode('p1', { persisted: Promise.resolve(null), windowRef: win });
        assert.deepEqual(JSON.parse(win.localStorage.getItem(PENDING_CLOSE_KEY)), { p1: 'edit' }, 'the device’s note is kept for the device');
        assert.equal(getProjectWorkMode('p1'), 'consultation', 'read only on the screen whatever the record says');
    } finally {
        globalThis.location = previousLocation;
        globalThis.window = previousWindow;
        dom.window.close();
    }
}
console.log('ALL OK');
// The runtimes it loads keep timers: the verdict is in.
process.exit(0);
