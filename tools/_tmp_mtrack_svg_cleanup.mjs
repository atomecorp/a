import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1720, height: 1040 } });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await sleep(1200);
    await page.evaluate(async (creds) => {
      const api = window.AdoleAPI || null;
      if (!api?.auth?.login) return;
      try { await api.auth.login(creds.phone, creds.password, creds.phone); } catch (_) {}
    }, { phone, password });
    await sleep(900);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1400);
    const result = await page.evaluate(async () => {
      const runtime = window.atome?.tools?.v2Runtime;
      const commit = window.Atome?.commit;
      const stateApi = window.Atome?.getStateCurrent || window.__atomeCommitApi?.getStateCurrent;
      if (!runtime?.invokeById || typeof commit !== 'function' || typeof stateApi !== 'function') {
        return { ok: false, error: 'runtime_unavailable' };
      }
      const visibleAtomes = Array.from(document.querySelectorAll('[data-atome-id]')).filter((el) => {
        const kind = String(el.dataset?.atomeKind || '').trim().toLowerCase();
        if (!kind || kind === 'tool_shortcut' || kind === 'group' || kind === 'mtrack') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0;
      });
      const target = visibleAtomes[0] || null;
      if (!target) return { ok: false, error: 'target_missing' };
      const targetId = String(target.dataset?.atomeId || '').trim();
      const opened = await runtime.invokeById({
        tool_id: 'ui.mtrax.open',
        event: 'touch',
        action: 'pointer.click',
        input: {
          action: 'open',
          toggle: false,
          atome_id: targetId,
          target_id: targetId,
          selection_ids: [targetId]
        },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'mtrack_svg_cleanup' }
      });
      const groupId = String(opened?.result?.result?.group_id || opened?.result?.group_id || '').trim();
      if (!groupId) return { ok: false, error: 'group_missing' };
      const groupState = await stateApi(groupId);
      const props = groupState?.properties && typeof groupState.properties === 'object'
        ? groupState.properties
        : {};
      const timeline = (props.mtrax_timeline && typeof props.mtrax_timeline === 'object')
        ? JSON.parse(JSON.stringify(props.mtrax_timeline))
        : ((props.group_timeline && typeof props.group_timeline === 'object')
          ? JSON.parse(JSON.stringify(props.group_timeline))
          : null);
      if (!timeline || !Array.isArray(timeline.clips)) {
        return { ok: false, error: 'timeline_missing' };
      }
      const removedClipIds = [];
      const removedAtomeIds = new Set();
      timeline.clips = timeline.clips.filter((clip) => {
        const sourceAtomeId = String(clip?.source_atome_id || clip?.sourceAtomeId || clip?.atome_id || clip?.atomeId || '').trim();
        const name = String(clip?.name || '').trim();
        const shouldRemove = sourceAtomeId.startsWith('svg_probe_')
          || sourceAtomeId.startsWith('svg_visual_probe_')
          || name === 'SVG Probe'
          || name === 'SVG Visual Probe';
        if (shouldRemove) {
          removedClipIds.push(String(clip?.id || ''));
          if (sourceAtomeId) removedAtomeIds.add(sourceAtomeId);
          return false;
        }
        return true;
      });
      if (!removedClipIds.length) {
        return { ok: true, removed: 0, group_id: groupId, already_clean: true };
      }
      await commit({
        kind: 'set',
        atome_id: groupId,
        props: {
          group_timeline: timeline,
          mtrax_timeline: timeline
        }
      });
      for (const atomeId of removedAtomeIds) {
        try {
          await commit({ kind: 'delete', atome_id: atomeId });
        } catch (_) {}
      }
      return {
        ok: true,
        removed: removedClipIds.length,
        removed_clip_ids: removedClipIds,
        removed_atome_ids: Array.from(removedAtomeIds),
        group_id: groupId
      };
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error?.message || String(error), stack: error?.stack || null }, null, 2)}\n`);
  process.exit(1);
});
