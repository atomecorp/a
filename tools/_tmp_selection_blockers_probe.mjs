// import { chromium } from 'playwright';

// const url = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
// const phone = process.env.ADOLE_TEST_PHONE || '55555555';
// const password = process.env.ADOLE_TEST_PASSWORD || '55555555';
// const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// const evalSafe = async (page, fn, arg = null) => {
//   try { return await page.evaluate(fn, arg); } catch (e) { return { ok: false, error: String(e?.message || e) }; }
// };

// const login = async (page) => {
//   await page.goto(url, { waitUntil: 'networkidle' });
//   await page.waitForFunction(() => !!window.AdoleAPI, null, { timeout: 15000 });
//   await evalSafe(page, async (creds) => {
//     const api = window.AdoleAPI;
//     try {
//       const out = await api.auth.login(creds.phone, creds.password, creds.phone);
//       if (out?.fastify?.success || out?.tauri?.success) return { ok: true };
//     } catch {}
//     try {
//       const out = await api.auth.create(creds.phone, creds.password, creds.phone, { autoLogin: true });
//       return { ok: !!(out?.fastify?.success || out?.tauri?.success || out?.login?.fastify?.success || out?.login?.tauri?.success) };
//     } catch (e) {
//       return { ok: false, error: String(e?.message || e) };
//     }
//   }, { phone, password });
//   await sleep(1200);
//   await page.reload({ waitUntil: 'networkidle' });
//   await page.waitForFunction(() => window.__authCheckComplete === true, null, { timeout: 15000 });
//   await sleep(1200);
// };

// const inspect = async (page, label) => {
//   const out = await evalSafe(page, (step) => {
//     const currentId = String(window?.eveToolBase?.getCurrentProjectId?.() || '').trim() || null;
//     const project = currentId ? document.getElementById(`project_view_${currentId}`) : document.querySelector('[id^="project_view_"]');
//     const matrix = document.getElementById('eve_project_matrix');
//     const menuRow = document.querySelector('#menu_container_v2 .eve-toolbox-v2-row');
//     const performZone = document.querySelector('[data-eve-perform-reveal="true"]') || document.getElementById('eve_perform_reveal_zone');
//     const toolPerform = document.getElementById('_intuition_v2_perform') || document.getElementById('_intuition_perform') || document.querySelector('[data-name-key="perform"]');
//     const cProject = project ? getComputedStyle(project) : null;
//     const cMatrix = matrix ? getComputedStyle(matrix) : null;
//     const cZone = performZone ? getComputedStyle(performZone) : null;
//     const selected = Array.isArray(window.__selectedAtomeIds) ? window.__selectedAtomeIds.slice() : [];
//     return {
//       label: step,
//       matrixActive: window.__eveMatrix?.isActive?.() === true,
//       performToolDataset: toolPerform ? { ...toolPerform.dataset } : null,
//       performZone: performZone ? {
//         id: performZone.id || null,
//         display: cZone?.display || null,
//         pointerEvents: cZone?.pointerEvents || null,
//         zIndex: cZone?.zIndex || null
//       } : null,
//       project: project ? {
//         id: project.id,
//         display: cProject?.display || null,
//         pointerEvents: cProject?.pointerEvents || null,
//         inlineDisplay: project.style.display || null,
//         inlinePointer: project.style.pointerEvents || null,
//         lassoBound: project.dataset?.lassoBound || null,
//         touchAction: project.style.touchAction || null
//       } : null,
//       matrix: matrix ? {
//         className: matrix.className || '',
//         display: cMatrix?.display || null,
//         pointerEvents: cMatrix?.pointerEvents || null,
//         inlineDisplay: matrix.style.display || null,
//         inlinePointer: matrix.style.pointerEvents || null
//       } : null,
//       menu: menuRow ? {
//         collapsed: menuRow.dataset?.collapsed || null,
//         expanded: menuRow.dataset?.expanded || null
//       } : null,
//       selected,
//       selectedLast: window.__selectedAtomeId || null,
//       atomeCount: project ? project.querySelectorAll('[data-atome-id]').length : document.querySelectorAll('[data-atome-id]').length
//     };
//   }, label);
//   console.log(JSON.stringify(out, null, 2));
// };

// const run = async () => {
//   const browser = await chromium.launch({ headless: true });
//   const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
//   await login(page);
//   await inspect(page, 'initial');

//   const clickRes = await evalSafe(page, () => {
//     const all = Array.from(document.querySelectorAll('[id^="project_view_"] [data-atome-id]'));
//     const host = all.find((node) => {
//       if (!node || !node.dataset) return false;
//       const role = String(node.dataset.atomeRole || '').trim().toLowerCase();
//       const kind = String(node.dataset.atomeKind || '').trim().toLowerCase();
//       if (node.dataset.toolShortcut === 'true') return false;
//       if (role === 'tool_shortcut' || role === 'system_root') return false;
//       if (kind === 'tool' || kind === 'toolbox' || kind === 'tool_block') return false;
//       return true;
//     }) || null;
//     if (!host) return { ok: false, error: 'no_atome_host' };
//     host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 21, button: 0, isPrimary: true, clientX: 140, clientY: 140 }));
//     host.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 21, button: 0, isPrimary: true, clientX: 140, clientY: 140 }));
//     host.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
//     return { ok: true, id: host.dataset.atomeId || null };
//   });
//   console.log(JSON.stringify({ clickRes }, null, 2));
//   await sleep(300);

//   await inspect(page, 'after_click');

//   const bgClickRes = await evalSafe(page, () => {
//     const currentId = String(window?.eveToolBase?.getCurrentProjectId?.() || window?.__currentProject?.id || '').trim() || null;
//     const layer = currentId ? document.getElementById(`project_view_${currentId}`) : document.querySelector('[id^="project_view_"]');
//     if (!layer) return { ok: false, error: 'no_project_layer', projectId: currentId };
//     const rect = layer.getBoundingClientRect();
//     const x = Math.max(rect.left + 8, rect.right - 12);
//     const y = Math.max(rect.top + 8, rect.bottom - 12);
//     layer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 41, button: 0, isPrimary: true, clientX: x, clientY: y }));
//     layer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 41, button: 0, isPrimary: true, clientX: x, clientY: y }));
//     layer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
//     return { ok: true, projectId: currentId, x, y };
//   });
//   console.log(JSON.stringify({ bgClickRes }, null, 2));
//   await sleep(300);
//   await inspect(page, 'after_background_click');

//   await browser.close();
// };

// run().catch((e) => {
//   console.error(e);
//   process.exit(1);
// });
