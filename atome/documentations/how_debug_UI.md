# How To Debug eVe BevyUI With Playwright

## Readiness contract

Do not use `domcontentloaded`, `networkidle`, or `document.readyState` alone as the UI readiness gate. The HTML shell can be ready before the eVe runtime and its shared WebGPU surface are mounted.

Wait first for the eVe shell, then for the BevyUI main-menu tree:

```js
await page.waitForFunction(() => (
  !!window.__DEBUG__ || !!document.getElementById('intuition')
), null, { timeout: 30000 });

await page.waitForFunction(async () => {
  const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
  const menu = getMainMenuRuntime();
  const canvas = document.getElementById('eve_surface_project');
  const measure = menu?.measure?.();
  return !!canvas && measure?.active === true && measure?.treeMounted === true;
}, null, { timeout: 30000 });
```

The product menu and Flower have no DOM buttons, DOM proxies, browser aliases, or global runtime state. Do not wait for a legacy menu global or query an old ribbon/Flower selector.

## Real canvas interaction

BevyUI interaction targets are overlay records projected on the shared `eve_surface_project` canvas. A real Playwright pointer click at the record center is the canonical user path.

For the Atome menu item, resolve its current record in the foreground scene:

```js
const target = await page.evaluate(() => {
  const recordId = '__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_atome';
  const projectId = window.eveDashboardBevyUiRuntime?.state?.active === true
    ? window.eveDashboardBevyUiRuntime.state.projectId
    : (window.__currentProject?.id || '__eve_dashboard_workspace__');
  const records = window.eveToolBase?.getProjectSceneState?.(projectId)?.records || [];
  const record = records.find((entry) => entry?.id === recordId);
  const properties = record?.properties || {};
  return record ? {
    x: Number(properties.left || 0) + (Number(properties.width || 0) / 2),
    y: Number(properties.top || 0) + (Number(properties.height || 0) / 2)
  } : null;
});

if (!target) throw new Error('bevy_main_menu_atome_record_missing');
await page.mouse.click(target.x, target.y);
```

Use the same record-center procedure for another menu tool. Top-level tool node ids use `eve_bevy_ui_main_menu_tool_<key>` inside the `eve_bevy_ui_main_menu` tree. If a palette parent opens children, resolve the newly projected child record after the parent click instead of invoking the tool runtime directly.

## Hit-testing diagnostics

If a real pointer click does not activate the expected tool, inspect all three layers before changing product code:

1. `getMainMenuRuntime().measure()` must report `active: true` and `treeMounted: true`.
2. `window.eveBevyUiRuntime.readOverlayDiagnostics()` must report the `eve_bevy_ui_main_menu` tree with interactive nodes.
3. `window.eveBevyUiRuntime.hitTestAtClientPoint({ surface, clientX, clientY })` at the record center must return the expected node.

Also verify that the record belongs to the current foreground scene. A stale record in the previous Dashboard/project scene is not an actionable target.

## Import rendering validation

A successful Import activation is not enough to prove that import works. Validate the full chain:

- the capture/import runtime receives the intention;
- the project drop runtime uploads the file and returns a created Atome id;
- `window.eveToolBase.getProjectSceneState(projectId)` contains the new record;
- the project still uses one project render canvas and contains no DOM media projection nodes;
- the project scene reports successful rendering;
- visible-browser pixels inside the imported record rectangle match the expected media content.

For WebGPU pixel validation, use visible Chromium when a headless screenshot is transparent despite successful renderer diagnostics:

```bash
ATOME_PLAYWRIGHT_HEADLESS=0 ADOLE_TEST_URL=http://127.0.0.1:3001 node temp/import_tool_filechooser_probe.mjs
```

## Required diagnostic order

1. Start the official server with `./run.sh --server`.
2. Wait for the eVe shell and mounted BevyUI main-menu tree.
3. Resolve the expected overlay record in the foreground scene.
4. Use a real Playwright mouse or touchscreen action at its center.
5. Compare the record, overlay diagnostics, and BevyUI hit-test result if activation fails.
6. Trace the canonical tool invocation only after the interaction boundary is proven correct.

## Constraints

- Do not add DOM proxies above the canvas or tools.
- Do not add `data-*` attributes to Atomes or rendered tool surfaces for tests.
- Do not expose a browser global or test-only API to activate a tool.
- Do not use `force: true`, `dispatchEvent`, or synthetic pointer sequences as a product solution.
- Do not restore legacy ribbon/Flower selectors, factories, or runtime aliases for diagnostics.
- Keep temporary probes and reports under `temp/`, then remove them after the evidence is captured.
