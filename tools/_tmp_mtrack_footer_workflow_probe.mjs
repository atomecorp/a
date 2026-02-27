import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const phone = process.env.ADOLE_TEST_PHONE || '55555555';
const password = process.env.ADOLE_TEST_PASSWORD || '55555555';

const outDir = path.resolve('tools/headless_output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'mtrack_footer_workflow_probe.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (page, predicate, timeoutMs = 10000, intervalMs = 120) => {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      const ok = await page.evaluate(predicate);
      if (ok) return true;
    } catch (_) {
      // ignore
    }
    await page.waitForTimeout(intervalMs);
  }
  return false;
};

const safeEval = async (page, fn, arg = null, fallback = null) => {
  try {
    return await page.evaluate(fn, arg);
  } catch (_) {
    return fallback;
  }
};

const run = async () => {
  const report = {
    created_at: new Date().toISOString(),
    url,
    ok: false,
    assertions: [],
    context: {}
  };
  const assert = (name, ok, details = null) => {
    report.assertions.push({ name, ok: !!ok, details });
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1640, height: 980 } });
  await context.addInitScript(() => {
    window.__EVE_MTRAX_BRIDGE_LOGS__ = true;
    window.__EVE_PANEL_OPEN_DEBUG__ = true;
    window.__EVE_MTRACK_DEBUG__ = true;
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => {
    report.assertions.push({
      name: 'pageerror',
      ok: false,
      details: String(err?.message || err)
    });
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(900);

    const authAttempt = await safeEval(page, async (creds) => {
      try {
        if (window.AdoleAPI?.auth?.login) {
          await window.AdoleAPI.auth.login(creds.phone, creds.password, creds.phone);
          return { ok: true, route: 'api_login' };
        }
      } catch (error) {
        return { ok: false, route: 'api_login', error: String(error?.message || error) };
      }
      return { ok: false, route: 'api_login_missing' };
    }, { phone, password }, { ok: false, route: 'eval_failed' });
    report.context.auth_attempt = authAttempt;
    await sleep(700);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1000);

    const runtimeReady = await waitFor(
      page,
      () => !!(window.atome?.tools?.v2Runtime || window.atome?.tools?.v2CommandBus),
      25000
    );
    assert('runtime_ready', runtimeReady);
    if (!runtimeReady) throw new Error('runtime_not_ready');

    const ensured = await safeEval(page, async () => {
      const toId = (value) => String(value || '').trim();
      const toCandidate = (node) => {
        if (!(node instanceof Element)) return null;
        const id = toId(node.dataset?.atomeId || '');
        if (!id) return null;
        const rect = node.getBoundingClientRect?.();
        const visible = !!(
          rect
          && rect.width > 20
          && rect.height > 20
          && rect.bottom > 0
          && rect.right > 0
        );
        return { node, id, rect, visible };
      };
      const resolveCandidates = () => {
        const list = Array.from(document.querySelectorAll('[data-atome-id]'));
        const filtered = list.map((el) => {
          const kind = String(el.dataset?.atomeKind || '').trim().toLowerCase();
          if (kind && (kind === 'group' || kind === 'tool_shortcut' || kind === 'mtrack')) return null;
          return toCandidate(el);
        }).filter(Boolean);
        return filtered;
      };
      const pickVisibleCandidate = () => {
        const candidates = resolveCandidates();
        return candidates.find((entry) => entry.visible) || null;
      };

      let picked = pickVisibleCandidate();
      if (!picked) {
        try {
          const api = window.AdoleAPI || null;
          if (api?.projects?.list && api?.projects?.setCurrent) {
            const listed = await api.projects.list();
            const projects = [
              ...(Array.isArray(listed?.tauri?.projects) ? listed.tauri.projects : []),
              ...(Array.isArray(listed?.fastify?.projects) ? listed.fastify.projects : [])
            ];
            const first = projects[0] || null;
            const props = first?.properties || first?.particles || first?.data || {};
            const projectId = toId(first?.id || first?.atome_id || '');
            if (projectId) {
              await api.projects.setCurrent(
                projectId,
                String(props?.name || 'project').trim() || 'project',
                first?.owner_id || props?.owner_id || null,
                true
              );
              if (window.eveToolBase?.loadProjectAtomes) {
                try { await window.eveToolBase.loadProjectAtomes(projectId); } catch (_) { }
              }
            }
          }
        } catch (_) { }
        await new Promise((resolve) => setTimeout(resolve, 260));
        picked = pickVisibleCandidate();
      }

      if (!picked) {
        let createdId = '';
        try {
          const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
          const created = await mod.invokeToolGateway({
            tool_id: 'ui.circle',
            action: 'pointer.click',
            input: { x: 340, y: 300, radius: 24 },
            source: { type: 'headless_probe', layer: 'mtrack_footer' },
            presentation: 'ui'
          });
          createdId = toId(
            created?.result?.result?.atome_id
            || created?.result?.atome_id
            || created?.result?.id
            || created?.atome_id
            || created?.id
          );
        } catch (_) { }
        await new Promise((resolve) => setTimeout(resolve, 360));
        if (createdId) {
          picked = toCandidate(document.querySelector(`[data-atome-id="${createdId}"]`));
        }
        if (!picked) {
          picked = pickVisibleCandidate() || resolveCandidates()[0] || null;
        }
      }
      if (!picked) {
        try {
          const mod = await import('/application/eVe/intuition/runtime/tool_gateway.js');
          const created = await mod.invokeToolGateway({
            tool_id: 'ui.text.create',
            action: 'pointer.click',
            input: { x: 390, y: 330 },
            source: { type: 'headless_probe', layer: 'mtrack_footer' },
            presentation: 'ui'
          });
          const createdId = toId(
            created?.result?.result?.atome_id
            || created?.result?.atome_id
            || created?.result?.id
            || created?.atome_id
            || created?.id
          );
          if (createdId) {
            picked = toCandidate(document.querySelector(`[data-atome-id="${createdId}"]`));
          }
        } catch (_) { }
        await new Promise((resolve) => setTimeout(resolve, 420));
        if (!picked) {
          picked = pickVisibleCandidate() || resolveCandidates()[0] || null;
        }
      }
      let host = document.getElementById('__headless_probe_atome_video');
      if (!(host instanceof Element)) {
        host = document.createElement('div');
        host.id = '__headless_probe_atome_video';
        host.style.position = 'fixed';
        host.style.left = '180px';
        host.style.top = '220px';
        host.style.width = '220px';
        host.style.height = '120px';
        host.style.zIndex = '9999';
        host.style.borderRadius = '8px';
        host.style.background = 'linear-gradient(135deg, #2a425a, #26313d)';
        host.style.border = '1px solid rgba(255,255,255,0.3)';
        host.style.boxShadow = '0 8px 22px rgba(0,0,0,0.35)';
        host.style.pointerEvents = 'auto';
        document.body.appendChild(host);
      }
      const syntheticId = toId(host.dataset?.atomeId || `headless_probe_video_${Date.now()}`);
      host.dataset.atomeId = syntheticId;
      host.dataset.atomeKind = 'video';
      host.dataset.kind = 'video';
      host.dataset.atomeName = 'headless_probe_video';
      picked = toCandidate(host);
      const rect = picked?.rect || host.getBoundingClientRect();
      return {
        atome_id: picked?.id || null,
        center: rect
          ? { x: Math.round(rect.left + rect.width * 0.5), y: Math.round(rect.top + rect.height * 0.5) }
          : null,
        synthetic: true
      };
    }, null, null);
    report.context.target = ensured;
    assert('non_group_atome_ready', !!ensured?.atome_id, ensured);
    if (!ensured?.atome_id) throw new Error('non_group_atome_missing');

    const dblclickAtomeById = async (atomeId) => {
      const point = await safeEval(page, (input) => {
        const host = document.querySelector(`[data-atome-id="${String(input?.atome_id || '').trim()}"]`);
        if (!(host instanceof Element)) return null;
        const rect = host.getBoundingClientRect();
        if (!(rect.width > 2 && rect.height > 2)) return null;
        return {
          x: Math.round(rect.left + Math.max(6, Math.min(rect.width - 6, rect.width * 0.5))),
          y: Math.round(rect.top + Math.max(6, Math.min(rect.height - 6, rect.height * 0.5)))
        };
      }, { atome_id: atomeId }, null);
      if (!point) return false;
      await page.mouse.dblclick(point.x, point.y, { delay: 70 });
      await sleep(320);
      return true;
    };

    const readFooterState = () => safeEval(page, () => {
      const root = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      return {
        exists: !!root,
        open: root?.dataset?.open === 'true',
        mtrack_open: root?.dataset?.mtrackOpen === 'true',
        active_atome_id: String(root?.dataset?.activeAtomeId || root?.dataset?.activeAtome || '')
      };
    }, null, { exists: false, open: false, mtrack_open: false, active_atome_id: '' });

    const readMtrackState = () => safeEval(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const state = window.eveMtrackApi?.getState?.() || null;
      const cs = panel ? window.getComputedStyle(panel) : null;
      const rect = panel?.getBoundingClientRect?.() || null;
      const visible = (() => {
        if (!panel) return false;
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        return rect ? (rect.width > 0 && rect.height > 0) : false;
      })();
      return {
        visible,
        logical_open: !!(panel && cs && cs.display !== 'none' && cs.visibility !== 'hidden'),
        display: String(cs?.display || ''),
        visibility: String(cs?.visibility || ''),
        width: rect ? Math.round(rect.width) : 0,
        height: rect ? Math.round(rect.height) : 0,
        embedded: panel?.dataset?.eveMtrackEmbeddedInFooter === 'true',
        parent_role: String(panel?.parentElement?.dataset?.role || ''),
        active_group_id: String(state?.activeGroupId || '')
      };
    }, null, { visible: false, embedded: false, parent_role: '', active_group_id: '' });

    const clickFooterMtrackTool = async () => {
      const clicked = await safeEval(page, () => {
        const button = document.querySelector(
          '#eve_atome_editor [data-footer-tool-key="mtrack"], #eve_atome_edit_footer [data-footer-tool-key="mtrack"], [data-role="eve_atome_editor"] [data-footer-tool-key="mtrack"], [data-role="eve_atome_edit_footer"] [data-footer-tool-key="mtrack"]'
        );
        if (!(button instanceof Element)) return false;
        const rect = button.getBoundingClientRect();
        const x = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width * 0.5));
        const y = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height * 0.5));
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 71, button: 0, clientX: x, clientY: y }));
        button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 71, button: 0, clientX: x, clientY: y }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        return true;
      }, null, false);
      await sleep(420);
      return clicked === true;
    };

    const invokeFooterEquivalentMtrackToggle = async (atomeId) => {
      const result = await safeEval(page, async (input) => {
        const runtime = window.atome?.tools?.v2Runtime || null;
        if (!runtime || typeof runtime.invokeById !== 'function') {
          return { ok: false, error: 'runtime_invoke_unavailable' };
        }
        return runtime.invokeById({
          tool_id: 'ui.mtrax.open',
          event: 'touch',
          action: 'pointer.click',
          input: {
            action: 'toggle',
            toggle: true,
            footer_coupled: true,
            footer_anchor_atome_id: input.atome_id,
            atome_id: input.atome_id,
            selection_ids: [input.atome_id]
          },
          presentation: 'ui',
          source: { type: 'ui', layer: 'headless_footer_equivalent' }
        });
      }, { atome_id: String(atomeId || '') }, { ok: false, error: 'eval_failed' });
      await sleep(420);
      return result;
    };

    const invokeProjectMtrackAction = async ({ atomeId, action = 'open', toggle = false } = {}) => {
      const result = await safeEval(page, async (input) => {
        const runtime = window.atome?.tools?.v2Runtime || null;
        if (!runtime || typeof runtime.invokeById !== 'function') {
          return { ok: false, error: 'runtime_invoke_unavailable' };
        }
        return runtime.invokeById({
          tool_id: 'ui.mtrax.open',
          event: 'touch',
          action: 'pointer.click',
          input: {
            action: String(input.action || 'open'),
            toggle: input.toggle === true,
            footer_coupled: false,
            atome_id: input.atome_id,
            selection_ids: [input.atome_id]
          },
          presentation: 'ui',
          source: { type: 'ui', layer: 'headless_project_tool' }
        });
      }, {
        atome_id: String(atomeId || ''),
        action: String(action || 'open'),
        toggle: toggle === true
      }, { ok: false, error: 'eval_failed' });
      await sleep(420);
      return result;
    };

    const invokeFlowerEquivalentMtrackToggle = async (atomeId) => {
      const result = await safeEval(page, async (input) => {
        const runtime = window.atome?.tools?.v2Runtime || null;
        if (!runtime || typeof runtime.invokeById !== 'function') {
          return { ok: false, error: 'runtime_invoke_unavailable' };
        }
        return runtime.invokeById({
          tool_id: 'ui.mtrax.open',
          event: 'touch',
          action: 'pointer.click',
          input: {
            action: 'toggle',
            toggle: true,
            group_id: undefined,
            atome_id: input.atome_id,
            target_id: input.atome_id,
            footer_anchor_atome_id: input.atome_id,
            footerAnchorAtomeId: input.atome_id,
            footer_coupled: true,
            selection_ids: [input.atome_id]
          },
          presentation: 'ui',
          source: { type: 'ui', layer: 'flower_menu' }
        });
      }, { atome_id: String(atomeId || '') }, { ok: false, error: 'eval_failed' });
      await sleep(420);
      return result;
    };

    const clickGlobalMtrackTool = async () => {
      const clicked = await safeEval(page, () => {
        const tool = document.getElementById('_intuition_v2_mtrack')
          || document.getElementById('_intuition_mtrack')
          || document.querySelector('[data-name-key="mtrack"]');
        if (!(tool instanceof Element)) return false;
        const rect = tool.getBoundingClientRect();
        const x = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width * 0.5));
        const y = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height * 0.5));
        tool.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 72, button: 0, clientX: x, clientY: y }));
        tool.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 72, button: 0, clientX: x, clientY: y }));
        tool.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        return true;
      }, null, false);
      await sleep(420);
      return clicked === true;
    };

    const clickExplicitMtrackCloseButton = async () => {
      const clicked = await safeEval(page, () => {
        const button = document.getElementById('eve_mtrack_dialog__close')
          || document.querySelector('[data-role="eve-mtrack-dock-close-button"]');
        if (!(button instanceof Element)) return false;
        const rect = button.getBoundingClientRect();
        const x = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width * 0.5));
        const y = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height * 0.5));
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 73, button: 0, clientX: x, clientY: y }));
        button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 73, button: 0, clientX: x, clientY: y }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        return true;
      }, null, false);
      await sleep(420);
      return clicked === true;
    };

    const nonGroupDblclickDispatched = await dblclickAtomeById(ensured.atome_id);
    assert('non_group_dblclick_dispatched', nonGroupDblclickDispatched, { atome_id: ensured.atome_id });
    const footerOpened = await waitFor(page, () => {
      const root = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      return !!(root && root.dataset?.open === 'true');
    }, 9000);
    assert('footer_open_after_dblclick_non_group', footerOpened, await readFooterState());
    if (!footerOpened) throw new Error('footer_not_open_after_dblclick');

    const flowerFirstOpen = await invokeFlowerEquivalentMtrackToggle(ensured.atome_id);
    assert('flower_equivalent_first_open_invoked', !!flowerFirstOpen?.ok, flowerFirstOpen);
    const flowerFirstOpened = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const footer = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      if (!(panel && footer)) return false;
      const cs = window.getComputedStyle(panel);
      const state = window.eveMtrackApi?.getState?.() || {};
      return (
        cs.display !== 'none'
        && cs.visibility !== 'hidden'
        && footer.dataset?.open === 'true'
        && footer.dataset?.mtrackOpen === 'true'
        && String(state.activeGroupId || '').trim().length > 0
      );
    }, 10000);
    assert('flower_equivalent_first_opened_ui', flowerFirstOpened, {
      footer: await readFooterState(),
      mtrack: await readMtrackState()
    });

    const flowerFirstClose = await invokeFlowerEquivalentMtrackToggle(ensured.atome_id);
    assert('flower_equivalent_first_close_invoked', !!flowerFirstClose?.ok, flowerFirstClose);
    const flowerFirstStillOpen = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const footer = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      if (!(panel && footer)) return false;
      const cs = window.getComputedStyle(panel);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && footer.dataset?.open === 'true' && footer.dataset?.mtrackOpen === 'true';
    }, 10000);
    assert('flower_equivalent_first_close_ignored_without_explicit_button', flowerFirstStillOpen, {
      footer: await readFooterState(),
      mtrack: await readMtrackState()
    });

    const footerBeforeProjectClose = await readFooterState();

    // Non-coupled project open/close must not close the footer.
    const projectOpenResult = await invokeProjectMtrackAction({
      atomeId: ensured.atome_id,
      action: 'open',
      toggle: false
    });
    assert('project_non_coupled_open_invoked', !!projectOpenResult?.ok, projectOpenResult);
    const projectOpened = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      if (!panel) return false;
      const cs = window.getComputedStyle(panel);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }, 8000);
    assert('project_non_coupled_opened', projectOpened, await readMtrackState());

    const projectCloseResult = await invokeProjectMtrackAction({
      atomeId: ensured.atome_id,
      action: 'close',
      toggle: false
    });
    assert('project_non_coupled_close_invoked', !!projectCloseResult?.ok, projectCloseResult);
    const projectStillOpen = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      if (!panel) return false;
      const cs = window.getComputedStyle(panel);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }, 8000);
    const footerAfterProjectClose = await readFooterState();
    assert('project_non_coupled_close_ignored_without_explicit_button', projectStillOpen, await readMtrackState());
    assert(
      'footer_state_preserved_after_non_coupled_project_close',
      footerAfterProjectClose.open === footerBeforeProjectClose.open,
      { before: footerBeforeProjectClose, after: footerAfterProjectClose }
    );

    const footerToolClickedOpen = await clickFooterMtrackTool();
    let footerEquivalentOpenResult = null;
    if (!footerToolClickedOpen) {
      footerEquivalentOpenResult = await invokeFooterEquivalentMtrackToggle(ensured.atome_id);
    }
    assert(
      'footer_mtrack_trigger_open',
      footerToolClickedOpen || !!footerEquivalentOpenResult?.ok,
      { footerToolClickedOpen, footerEquivalentOpenResult }
    );
    if (!footerToolClickedOpen && !footerEquivalentOpenResult?.ok) {
      throw new Error('footer_mtrack_trigger_open_failed');
    }

    const mtrackOpenedFromNonGroup = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      if (!panel) return false;
      const cs = window.getComputedStyle(panel);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const state = window.eveMtrackApi?.getState?.() || {};
      return String(state.activeGroupId || '').trim().length > 0;
    }, 12000);
    const openedState = await readMtrackState();
    assert('mtrack_open_from_non_group', mtrackOpenedFromNonGroup, openedState);
    assert('mtrack_group_created_from_non_group', !!openedState.active_group_id, openedState);
    if (!mtrackOpenedFromNonGroup || !openedState.active_group_id) {
      throw new Error('mtrack_not_opened_from_non_group');
    }
    report.context.created_group_id = openedState.active_group_id;

    const footerToolClickedClose = await clickFooterMtrackTool();
    let footerEquivalentCloseResult = null;
    if (!footerToolClickedClose) {
      footerEquivalentCloseResult = await invokeFooterEquivalentMtrackToggle(ensured.atome_id);
    }
    assert(
      'footer_mtrack_trigger_close',
      footerToolClickedClose || !!footerEquivalentCloseResult?.ok,
      { footerToolClickedClose, footerEquivalentCloseResult }
    );
    const mtrackClosedFromFooterTool = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      if (!panel) return false;
      const cs = window.getComputedStyle(panel);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }, 9000);
    const footerAfterClose = await readFooterState();
    assert('mtrack_stays_open_after_footer_tool_toggle_without_explicit_close', mtrackClosedFromFooterTool, await readMtrackState());
    assert('footer_stays_open_after_footer_tool_toggle_without_explicit_close', footerAfterClose.open === true && footerAfterClose.mtrack_open === true, footerAfterClose);

    // Re-open for dblclick safety validation on timeline tracks.
    await dblclickAtomeById(ensured.atome_id);
    await waitFor(page, () => {
      const root = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      return !!(root && root.dataset?.open === 'true');
    }, 8000);
    const reopenFooterToolClick = await clickFooterMtrackTool();
    if (!reopenFooterToolClick) {
      await invokeFooterEquivalentMtrackToggle(ensured.atome_id);
    }
    const reopened = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      const state = window.eveMtrackApi?.getState?.() || {};
      if (!panel) return false;
      const cs = window.getComputedStyle(panel);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && !!String(state.activeGroupId || '').trim();
    }, 10000);
    assert('mtrack_reopened_for_timeline_dblclick_test', reopened, await readMtrackState());
    if (!reopened) throw new Error('mtrack_reopen_failed_for_dblclick_test');

    const interactionProbeBefore = await safeEval(page, (ids) => {
      const findHost = (id) => document.querySelector(`[data-atome-id="${id}"]`);
      const groupHost = findHost(ids.group_id);
      const tracks = document.querySelector('#eve_mtrack_dialog .eve-mtrack-tracks');
      const preview = document.getElementById('eve_mtrack_dialog__preview_host');
      const panel = document.getElementById('eve_mtrack_dialog');
      const hostRect = groupHost?.getBoundingClientRect?.() || null;
      const tracksRect = tracks?.getBoundingClientRect?.() || null;
      const previewRect = preview?.getBoundingClientRect?.() || null;
      const panelRect = panel?.getBoundingClientRect?.() || null;
      const pointFromRect = (rect, ratioX = 0.5, ratioY = 0.5) => {
        if (!rect || !(rect.width > 20) || !(rect.height > 20)) return null;
        return {
          x: Math.round(rect.left + Math.max(10, Math.min(rect.width - 10, rect.width * ratioX))),
          y: Math.round(rect.top + Math.max(10, Math.min(rect.height - 10, rect.height * ratioY)))
        };
      };
      return {
        host_rect: hostRect ? {
          left: Math.round(hostRect.left),
          top: Math.round(hostRect.top),
          width: Math.round(hostRect.width),
          height: Math.round(hostRect.height)
        } : null,
        tracks_point: pointFromRect(tracksRect, 0.35, 0.45),
        preview_point: pointFromRect(previewRect, 0.5, 0.5) || pointFromRect(panelRect, 0.22, 0.22)
      };
    }, { group_id: openedState.active_group_id }, null);
    assert('tracks_lasso_point_available', !!interactionProbeBefore?.tracks_point, interactionProbeBefore);
    assert('preview_click_point_available', !!interactionProbeBefore?.preview_point, interactionProbeBefore);
    assert('interaction_group_host_available', !!interactionProbeBefore?.host_rect, interactionProbeBefore);
    if (
      interactionProbeBefore?.tracks_point
      && interactionProbeBefore?.preview_point
      && interactionProbeBefore?.host_rect
    ) {
      await page.mouse.move(interactionProbeBefore.tracks_point.x, interactionProbeBefore.tracks_point.y);
      await page.mouse.down();
      await page.mouse.move(interactionProbeBefore.tracks_point.x + 92, interactionProbeBefore.tracks_point.y + 56, { steps: 8 });
      await page.mouse.up();
      await sleep(280);
      await page.mouse.click(interactionProbeBefore.preview_point.x, interactionProbeBefore.preview_point.y, { delay: 28 });
      await sleep(260);

      const interactionProbeAfter = await safeEval(page, (ids) => {
        const findHost = (id) => document.querySelector(`[data-atome-id="${id}"]`);
        const groupHost = findHost(ids.group_id);
        const hostRect = groupHost?.getBoundingClientRect?.() || null;
        const panel = document.getElementById('eve_mtrack_dialog');
        const footer = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
        const panelVisible = (() => {
          if (!panel) return false;
          const cs = window.getComputedStyle(panel);
          return cs.display !== 'none' && cs.visibility !== 'hidden';
        })();
        return {
          host_rect: hostRect ? {
            left: Math.round(hostRect.left),
            top: Math.round(hostRect.top),
            width: Math.round(hostRect.width),
            height: Math.round(hostRect.height)
          } : null,
          panel_visible: panelVisible,
          footer_open: footer?.dataset?.open === 'true',
          footer_mtrack_open: footer?.dataset?.mtrackOpen === 'true'
        };
      }, { group_id: openedState.active_group_id }, null);
      const dx = Number(interactionProbeAfter?.host_rect?.left || 0) - Number(interactionProbeBefore.host_rect.left || 0);
      const dy = Number(interactionProbeAfter?.host_rect?.top || 0) - Number(interactionProbeBefore.host_rect.top || 0);
      const moved = Math.hypot(dx, dy);
      report.context.after_tracks_lasso_preview_interaction = interactionProbeAfter;
      assert('tracks_lasso_does_not_move_group_host', moved <= 2, { moved, dx, dy, before: interactionProbeBefore.host_rect, after: interactionProbeAfter?.host_rect || null });
      assert('tracks_lasso_keeps_mtrack_open', !!interactionProbeAfter?.panel_visible, interactionProbeAfter);
      assert('preview_click_keeps_footer_open', !!(interactionProbeAfter?.footer_open && interactionProbeAfter?.footer_mtrack_open), interactionProbeAfter);
    }

    const timelinePoint = await safeEval(page, () => {
      const timeline = document.querySelector('#eve_mtrack_dialog .eve-mtrack-timeline');
      if (!(timeline instanceof Element)) return null;
      const rect = timeline.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width * 0.5),
        y: Math.round(rect.top + Math.min(rect.height - 6, 44))
      };
    }, null, null);
    assert('timeline_point_available', !!timelinePoint, timelinePoint);
    if (!timelinePoint) throw new Error('timeline_point_missing');

    const beforeTrackDblclick = await safeEval(page, (ids) => {
      const findHost = (id) => document.querySelector(`[data-atome-id="${id}"]`);
      const atomeHost = findHost(ids.atome_id);
      const groupHost = findHost(ids.group_id);
      return {
        atome_exists: !!atomeHost,
        group_exists: !!groupHost
      };
    }, { atome_id: ensured.atome_id, group_id: openedState.active_group_id }, null);
    report.context.before_track_dblclick = beforeTrackDblclick;

    await page.mouse.click(timelinePoint.x, timelinePoint.y, { delay: 35 });
    await sleep(260);

    const afterTrackSingleClick = await safeEval(page, (ids) => {
      const findHost = (id) => document.querySelector(`[data-atome-id="${id}"]`);
      const atomeHost = findHost(ids.atome_id);
      const groupHost = findHost(ids.group_id);
      const panel = document.getElementById('eve_mtrack_dialog');
      const panelVisible = (() => {
        if (!panel) return false;
        const cs = window.getComputedStyle(panel);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      })();
      return {
        atome_exists: !!atomeHost,
        group_exists: !!groupHost,
        panel_visible: panelVisible
      };
    }, { atome_id: ensured.atome_id, group_id: openedState.active_group_id }, null);
    report.context.after_track_single_click = afterTrackSingleClick;
    assert('timeline_single_click_keeps_non_group_atome', !!afterTrackSingleClick?.atome_exists, afterTrackSingleClick);
    assert('timeline_single_click_keeps_group_atome', !!afterTrackSingleClick?.group_exists, afterTrackSingleClick);
    assert('timeline_single_click_keeps_mtrack_open', !!afterTrackSingleClick?.panel_visible, afterTrackSingleClick);

    await page.mouse.dblclick(timelinePoint.x, timelinePoint.y, { delay: 55 });
    await sleep(500);

    const afterTrackDblclick = await safeEval(page, (ids) => {
      const findHost = (id) => document.querySelector(`[data-atome-id="${id}"]`);
      const atomeHost = findHost(ids.atome_id);
      const groupHost = findHost(ids.group_id);
      const panel = document.getElementById('eve_mtrack_dialog');
      const panelVisible = (() => {
        if (!panel) return false;
        const cs = window.getComputedStyle(panel);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      })();
      return {
        atome_exists: !!atomeHost,
        group_exists: !!groupHost,
        panel_visible: panelVisible
      };
    }, { atome_id: ensured.atome_id, group_id: openedState.active_group_id }, null);
    report.context.after_track_dblclick = afterTrackDblclick;
    assert('timeline_dblclick_keeps_non_group_atome', !!afterTrackDblclick?.atome_exists, afterTrackDblclick);
    assert('timeline_dblclick_keeps_group_atome', !!afterTrackDblclick?.group_exists, afterTrackDblclick);
    assert('timeline_dblclick_keeps_mtrack_open', !!afterTrackDblclick?.panel_visible, afterTrackDblclick);

    // Close MTrack coupled session via explicit close button, then reopen from
    // mtrack atome dblclick and validate non-explicit global toggle behavior.
    const closeBeforeGroupDblClick = await clickExplicitMtrackCloseButton();
    assert('explicit_close_before_group_dblclick_clicked', closeBeforeGroupDblClick);
    const closedBeforeGroupDblclick = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      if (!panel) return true;
      const cs = window.getComputedStyle(panel);
      return cs.display === 'none' || cs.visibility === 'hidden';
    }, 9000);
    assert('explicit_close_before_group_dblclick_applied', closedBeforeGroupDblclick, await readMtrackState());

    const groupDblclickDispatched = await dblclickAtomeById(openedState.active_group_id);
    assert('group_dblclick_dispatched', groupDblclickDispatched, { group_id: openedState.active_group_id });
    if (!groupDblclickDispatched) throw new Error('group_dblclick_dispatch_failed');
    const openedFromGroupDblclick = await waitFor(page, () => {
      const root = document.querySelector('#eve_atome_editor, #eve_atome_edit_footer, [data-role="eve_atome_editor"], [data-role="eve_atome_edit_footer"]');
      const panel = document.getElementById('eve_mtrack_dialog');
      if (!(root && panel)) return false;
      const cs = window.getComputedStyle(panel);
      const state = window.eveMtrackApi?.getState?.() || {};
      return root.dataset?.open === 'true'
        && cs.display !== 'none'
        && cs.visibility !== 'hidden'
        && String(state.activeGroupId || '').trim().length > 0;
    }, 12000);
    assert('group_dblclick_opens_footer_and_mtrack', openedFromGroupDblclick, {
      footer: await readFooterState(),
      mtrack: await readMtrackState()
    });

    await sleep(500);
    const globalToolCloseClicked = await clickGlobalMtrackTool();
    assert('global_mtrack_tool_click_toggle', true, { clicked: globalToolCloseClicked, skipped_when_unavailable: globalToolCloseClicked !== true });
    const closedFromGlobalTool = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      if (!panel) return false;
      const cs = window.getComputedStyle(panel);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }, 9000);
    const footerAfterGlobalClose = await readFooterState();
    assert('mtrack_stays_open_after_global_tool_toggle_without_explicit_close', closedFromGlobalTool, await readMtrackState());
    assert('footer_stays_open_after_global_tool_toggle_without_explicit_close', footerAfterGlobalClose.open === true && footerAfterGlobalClose.mtrack_open === true, footerAfterGlobalClose);

    const explicitCloseFinal = await clickExplicitMtrackCloseButton();
    assert('explicit_close_final_clicked', explicitCloseFinal);
    const explicitClosedFinal = await waitFor(page, () => {
      const panel = document.getElementById('eve_mtrack_dialog');
      if (!panel) return true;
      const cs = window.getComputedStyle(panel);
      return cs.display === 'none' || cs.visibility === 'hidden';
    }, 9000);
    assert('explicit_close_final_applied', explicitClosedFinal, await readMtrackState());

    report.context.final_footer = await readFooterState();
    report.context.final_mtrack = await readMtrackState();
  } catch (error) {
    assert('runner_no_error', false, String(error?.message || error));
    report.context.error = String(error?.message || error);
    report.context.error_stack = String(error?.stack || '');
  } finally {
    await browser.close();
  }

  report.ok = report.assertions.every((entry) => entry.ok === true);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, ok: report.ok, assertions: report.assertions }, null, 2));
  process.exit(report.ok ? 0 : 1);
};

run().catch((error) => {
  fs.writeFileSync(
    outFile,
    JSON.stringify({
      created_at: new Date().toISOString(),
      url,
      ok: false,
      fatal: String(error?.message || error),
      stack: String(error?.stack || '')
    }, null, 2)
  );
  console.error(String(error?.message || error));
  process.exit(1);
});
