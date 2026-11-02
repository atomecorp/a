// R-108 / BUG-012/013 on the real Web app (Chromium, WebGPU): the localStorage holds the legacy sync scopes of the
// iPhone build 44 (as many of its 66 295 streams and cursors as this browser's quota holds, the rest padded until a
// write throws QuotaExceededError), the page reloads, then projects are created by the canonical `ui.new_project` tool
// and opened from the Dashboard by `ui.project.open`. Each must stay in its project with the current project written.
// Usage (isolated test server, see r108_web_session.mjs):
//   PW_HEADFUL=1 xvfb-run -a node tests/probes/r108_project_quota_web.probe.mjs
import path from 'node:path';
import { waitFor } from './molecule_ui_acceptance_support.mjs';
import { openR108Session } from './r108_web_session.mjs';

const OUT = path.resolve(process.env.R108_OUT || 'temp/probe_reports/r108_project_quota_web');
const OPENINGS = Number(process.env.R108_OPENINGS || 5);
const { page, check, presented, signIn, tool, inProject, toDashboard, finish } = await openR108Session({ out: OUT });

try {
    await check('sign_in', signIn);
    const filled = await check('fill_quota_like_iphone', () => page.evaluate(async () => {
        const key = window.Squirrel.SyncEngine.scopeKey();
        await window.Squirrel.SyncEngine.flushPersist();
        let count = 66295;
        for (;;) {
            const streams = Array.from({ length: count }, (_, i) => `9f0c${String(i).padStart(4, '0')}-6b1d-4c2e-9a3f-${String(i).padStart(12, '0')}`);
            try {
                localStorage.setItem('squirrel_sync_streams_v1', JSON.stringify({ [key]: streams }));
                localStorage.setItem('squirrel_sync_cursors_v1', JSON.stringify({ [key]: Object.fromEntries(streams.map((s, i) => [s, i + 1])) }));
                break;
            } catch (_) { localStorage.removeItem('squirrel_sync_streams_v1'); count = Math.floor(count * 0.9); }
        }
        let pad = 0, chunk = 'x'.repeat(65536);
        for (;;) { try { localStorage.setItem(`r108_pad_${pad}`, chunk); pad += 1; } catch (_) { if (chunk.length < 64) break; chunk = chunk.slice(chunk.length / 2); } }
        let blocked = '';
        try { localStorage.setItem('r108_probe_write', '1'); } catch (error) { blocked = error.name; }
        return { streams: count, pads: pad, blocked };
    }));
    if (filled?.blocked !== 'QuotaExceededError') throw new Error('quota_not_reached');
    await page.reload({ waitUntil: 'commit' });
    await check('reload_on_full_quota', presented);
    // The server then refuses these synthetic streams (`stream_access_denied`) and the engine drops them: only the
    // release is checked here; tests/eve/sync_scope_quota.test.mjs checks that every stream and cursor is kept.
    await check('legacy_scopes_released', () => waitFor(page, async () => {
        const engine = window.Squirrel.SyncEngine;
        const released = await engine.legacyRelease;
        return { ok: released !== null && localStorage.getItem('squirrel_sync_streams_v1') === null && localStorage.getItem('squirrel_sync_cursors_v1') === null,
            released, error: engine.error || null };
    }, null, 60000));
    await check('write_after_release', () => page.evaluate(() => { localStorage.setItem('r108_probe_write', '1'); return true; }));

    const projects = [];
    for (let index = 1; index <= OPENINGS; index += 1) {
        await check(`create_${index}`, async () => {
            const result = await tool({ tool_id: 'ui.new_project', action: 'pointer.click', input: { name: `TEST-R108-${index}` } });
            if (result?.ok === false) throw new Error(JSON.stringify(result).slice(0, 600));
            const state = await inProject();
            projects.push(state.id);
            return state;
        });
        await check(`create_${index}_back`, toDashboard);
    }
    for (let round = 1; round <= OPENINGS && projects.length; round += 1) {
        const id = projects[(round - 1) % projects.length];
        await check(`open_${round}`, async () => {
            const result = await tool({ tool_id: 'ui.project.open', action: 'open', input: { project_id: id } });
            if (result?.ok === false) throw new Error(JSON.stringify(result).slice(0, 600));
            return inProject(id);
        });
        await check(`open_${round}_back`, toDashboard);
    }
    await page.screenshot({ path: path.join(OUT, 'last.png') });
} finally {
    await finish();
}
