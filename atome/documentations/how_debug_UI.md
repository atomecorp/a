# How To Debug UI With Playwright

## Problem

Playwright can appear unable to activate Atome/eVe tools when the test clicks too early or targets a non-canonical element.

The validated failure pattern was:

- `document.readyState === "complete"` was already true.
- `window.Squirrel` and `window.atome.tools` existed.
- The eVe UI had not finished mounting yet.
- `window.__DEBUG__`, `window.new_menu_v2`, and `#intuition` were not ready.
- A selector scan found no actionable tool target, so the test reported a missing tool instead of a click failure.

The root cause was not a global Playwright click failure. A debug HTML probe received trusted pointer and click events correctly.

## Validated Solution

Do not use `domcontentloaded`, `networkidle`, or `document.readyState` alone as the UI readiness gate.

Before clicking eVe tools, wait for the eVe runtime surface:

```js
await page.waitForFunction(() => (
  !!window.__DEBUG__
  || !!window.new_menu_v2
  || !!document.getElementById('intuition')
), null, { timeout: 30000 });
```

Then target the existing canonical handle:

```js
const handle = page.locator('button[data-role="eve_intuitionx-handle"]').first();
await handle.click({ timeout: 5000 });
```

This was validated with:

```bash
ATOME_PLAYWRIGHT_TOOL_SELECTOR='button[data-role="eve_intuitionx-handle"]' \
node tests/probes/atome_playwright_tool_click_debug_probe.test.mjs
```

The successful report showed:

- `debug_probe_click`: passed with a trusted Playwright click.
- `tool_attached`: `1`.
- `tool_bounding_box`: `{ x: 690, y: 297, width: 60, height: 60 }`.
- `locator_click`: passed.
- `coordinate_click`: passed.
- `errors`: empty.
- hit-test center target: the handle button itself.

Report path:

```text
temp/probe_reports/atome_playwright_tool_click_debug/report.json
```

## Ribbon Tool Activation After Login

Do not click the ribbon handle blindly after login.

A validated post-login state showed:

```js
window.new_menu_v2.openPx === 675
```

In that state, clicking the handle closes the ribbon instead of opening it. If the ribbon is already open, target the real tool or its parent palette directly.

For the Import tool, the canonical selector is:

```js
button[data-tool-id="ui.capture.import"]
```

The validated visible target after `window.new_menu_v2.reveal()` was:

```text
x=735, y=921.5, width=67, height=57
```

Import is a child of the Capture palette. The real interaction path is:

```js
await page.waitForFunction(() => (
  !!window.__DEBUG__
  || !!window.new_menu_v2
  || !!document.getElementById('intuition')
), null, { timeout: 30000 });

await page.evaluate(() => window.new_menu_v2?.reveal?.());

await page.locator('button[data-tool-id="tool.main.capture"]').first().click({ timeout: 8000 });

await page.waitForFunction(() => {
  const button = document.querySelector('button[data-tool-id="ui.capture.import"]');
  if (!(button instanceof HTMLElement)) return false;
  const rect = button.getBoundingClientRect();
  const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return button === top || button.contains(top);
}, null, { timeout: 8000 });

await page.locator('button[data-tool-id="ui.capture.import"]').first().click({ timeout: 8000 });
```

If `locator.click()` fails with an interception error, inspect the target center before assuming Playwright is blocked:

```js
const button = document.querySelector('button[data-tool-id="ui.capture.import"]');
const rect = button.getBoundingClientRect();
document.elementsFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
```

The expected top element is the Import button itself. If the top element is the project canvas, the tool is outside the actionable ribbon area. If the top element is `eve_intuitionx-track`, `tool.main.capture`, or another ribbon tool, the palette layout is intercepting the click.

The validated regression root cause was a collapsed palette child wrapper with `width: 0` while its child tools stayed visible and pointer-active. The correct product fix is to make collapsed palette children hidden and non-interactive until the palette opens. Do not use `force: true`, synthetic events, or a direct runtime invocation as the product solution.

## Import Rendering Validation

A successful Import click is not enough to prove that import works. Validate the full chain:

- the Import button logs or diagnostics reach the capture/import runtime;
- the project drop runtime uploads the file and returns a created Atome id;
- `window.eveToolBase.getProjectSceneState(projectId)` shows the new record;
- the project DOM still contains one project render canvas, no `.eve-atome` hosts, and no `img`, `video`, `audio`, or `svg` media nodes inside the project;
- the project scene projection reports `rendered: true` and `rendered_layers > 0`;
- pixels inside the imported record rectangle on the project canvas are non-uniform and match the expected media content.

For WebGPU pixel validation, do not rely on Chromium headless screenshots alone. A validated diagnostic showed `MoleculeWebGpuRenderer` returning `rendered_layers: 1` while a headless screenshot of the WebGPU canvas was fully transparent. The same renderer in visible Chromium produced the expected image pixels. For this class of checks, run Playwright with visible Chromium:

```bash
ATOME_PLAYWRIGHT_HEADLESS=0 ADOLE_TEST_URL=http://127.0.0.1:3001 node temp/import_tool_filechooser_probe.mjs
```

The validated project import fix was not in the tool click path. The tool path reached upload and Atome creation correctly; the project canvas stayed blank because `project_scene_runtime.js` created `createUnifiedWebGPUCompositor()` without a real project adapter. The compliant fix is to attach the project scene compositor to the existing `MoleculeWebGpuRenderer` WebGPU texture renderer through `eVe/domains/rendering/project_scene_webgpu_adapter.js`, not to add DOM media nodes, a 2D canvas renderer, `force: true`, or a synthetic click path.

## Required Diagnostic Order

Use this order when tool activation fails:

1. Start the official server:

```bash
./run.sh --server
```

2. Verify Playwright can click an external probe button. This proves browser event delivery before blaming Atome/eVe.

3. Wait for eVe runtime readiness with `window.__DEBUG__`, `window.new_menu_v2`, or `#intuition`.

4. Click the existing canonical handle:

```js
await page.locator('button[data-role="eve_intuitionx-handle"]').first().click();
```

5. Inspect hit-testing if the click fails:

```js
document.elementsFromPoint(x, y)
```

The expected top element at the handle center is the button, with `pointer-events: auto`, visible display, and a non-empty bounding box.

## Important Constraints

Do not add DOM proxies above the canvas or tools.

Do not add `data-*` attributes to Atomes or rendered tool surfaces just for tests.

Do not use a test-only API that activates a tool directly. It bypasses the real interaction path.

Do not keep `force: true`, coordinate clicks, `dispatchEvent`, or synthetic pointer events as the product solution. They are diagnostic only.

Do not use synthetic pointer sequences by default. In this UI, dispatching synthetic `pointerdown` can trigger:

```text
Failed to execute 'setPointerCapture' on 'Element': No active pointer with the given id is found.
```

Use real Playwright input first:

```js
await locator.click();
```

Use coordinate clicks only to classify hit-test or locator problems:

```js
const box = await locator.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
```

## Classification

If the probe button works but the tool selector is missing, the category is:

```text
runtime readiness / wrong target
```

If the selector exists but `locator.click()` fails while coordinate click succeeds, the category is:

```text
locator / accessibility / actionability
```

If the selector exists and both real click methods fail, inspect:

- `elementsFromPoint()` at the click center.
- overlays above the tool.
- `pointer-events`.
- transforms.
- bounding box size.
- frame or shadow-root boundaries.

If synthetic events fail but real clicks pass, ignore the synthetic failure for product behavior. It is not the user path.
