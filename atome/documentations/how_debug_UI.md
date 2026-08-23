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

## Running the visual UI test suite

The canvas-aware harness already exists — do not write a new one. Reuse
`tests/probes/molecule_ui_acceptance_support.mjs`, which owns every helper that
can address a WebGPU canvas: `findBevyUiNodeTarget`, `clickCanvasTarget`,
`recordCenter`, `visibleMenuTool`, `waitForStableScene`, `analyzePngSignal`,
`diffPng`, `waitFor`.

### Start the server in the mode the probe expects

```bash
lsof -ti:3001 || ./scripts/run_fastify.sh
```

Check `lsof` first: `scripts/run_fastify.sh` kills whatever holds port 3001
unconditionally, so launching it blindly takes down a server someone else is using.

**Which mode matters, and the two are not interchangeable.** `--test` exports
`SQUIRREL_AUTH_OTP_BYPASS=1`; with it, `requestPhoneVerificationDelivery` returns
`{ok: true, otpBypassed: true}` and **no `code`** (`server/auth_otp.js:114`). A probe
that requires `requested.code` therefore fails on a `--test` server, while a probe
that never calls `requestPhoneVerification` fails with `phone_verification_required`
on a plain one. A probe must read `otpBypassed` and skip the verify step when it is
true — then both modes work:

```js
const requested = await api.auth.requestPhoneVerification(phone, 'enrollment', { exposeForTest: true });
if (requested?.otpBypassed !== true) {
  if (!requested?.ok || !requested?.code) throw new Error('verification_unavailable');
  await api.auth.verifyPhoneVerification(phone, requested.code, 'enrollment');
}
await api.auth.create(phone, password, username, { autoLogin: true });
```

Confirm the database is up before blaming auth — one call settles it:
`curl -fsS localhost:3001/api/db/status` returns `status: "connected"`.
`server/server.js` loads `.env` itself by absolute path, so the working directory of
the launcher is irrelevant.

### Run and read the result

```bash
MOLECULE_UI_REPORT_TAG=diag ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/molecule_eve_ui_acceptance_probe.mjs
```

Everything lands in `temp/probe_reports/molecule_eve_ui_acceptance/<TAG>/`:
`report.json` (15 checks, console errors, measurements, visual diff) and four PNGs.
**Open the PNGs.** `report.json` alone cannot distinguish "the view is broken" from
"the capture is empty" — the pixels can, in one look.

Other entry points: `npm run test:molecule:ui` (same probe, tag `default`),
`npm run test:molecule:ui:matrix` (10 viewport/DPR/handedness variants),
`MOLECULE_UI_REPEAT=n npm run test:molecule:ui:repeat`.

### Headed or headless

`HEADLESS = process.env.ATOME_PLAYWRIGHT_HEADLESS === '1'` — the probe runs **headed**
unless you opt out, which is why any run steals the screen.

**Headless does work, measured on 2026-08-22, and needs no `channel` option.** Plain
`chromium.launch({ headless: true })` with the probe's existing
`--use-angle=swiftshader --enable-features=Vulkan` arguments obtains a real WebGPU
adapter (`vendor: google`, `architecture: swiftshader`) and paints the full UI —
`non_black_pixel_ratio: 1`, `luma_range: 247`, 4096 sampled colours. Adding
`channel: 'chromium'` changes nothing measurable. The cost is speed: SwiftShader is a
software rasteriser, so a headless run is noticeably slower than a headed one on a
real GPU.

Do not take either claim on trust — hardware, drivers and Playwright versions all move.
Re-measure with `tests/probes/webgpu_headless_capability_probe.probe.mjs`, which launches
each variant (`WEBGPU_CAPABILITY_VARIANTS=A,B,C,D`, default all four: headless, headless
+ `channel`, off-screen window, visible window), applies the **production** pixel
thresholds from the acceptance probe, and names the first invisible mode that actually
paints in `recommended`. Variant C (`--window-position=-32000,-32000`) is the fallback if
headless ever regresses: the window composites for real, `Page.captureScreenshot` still
reads it, and nothing appears on the user's display.

```bash
WEBGPU_CAPABILITY_VARIANTS=A,B node tests/probes/webgpu_headless_capability_probe.probe.mjs
ATOME_PLAYWRIGHT_HEADLESS=1 node tests/probes/molecule_eve_ui_acceptance_probe.mjs
```

### Headless is slower, and slowness reads as failure

Measured on 2026-08-22 across three headless runs and two headed runs against the same
server. **Headed passed 15/15 twice**, once while a second run competed for the machine.
Headless passed every check *except* `a real Info click opens the canonical track
property panel`, which failed in all three headless runs — including after the lookup was
made patient — and passes headed every time. That one is a real headed/headless
difference and is still open; the contextual panel's `atome_contextual_tool_molecule_info`
node is never found by the hit test under SwiftShader.

Every other headless failure traced to the environment, not to headless: one run was
contaminated by a concurrent run (see below), another lost the server mid-suite
(`ERR_CONNECTION_REFUSED`, `Server unreachable`). **Check `console_errors` for
connection failures before reading any red check as a product defect** — a dead server
turns a healthy suite into a wall of unrelated red.

The lesson generalises: on SwiftShader, any probe step that looks **once** for a
projected node will intermittently miss it. Use `awaitBevyUiNodeTarget` from the support
module instead of `findBevyUiNodeTarget` whenever the node may still be being projected —
it retries the same real hit-test until a deadline, so the assertion is unchanged and only
the patience differs. Treat a lone `wait_timeout` in a headless run as a budget question
first and a bug second; confirm against a headed run before changing product code.

**Run one probe at a time.** Two acceptance runs against the same server collapsed a
13/15 headless result to 5/15, with ten `menu_tool_not_revealed` / `record_missing`
failures — while the captured pixels stayed perfect (`non_black_pixel_ratio: 1`, 4096
colours). Contention starves the gesture and projection deadlines without touching
rendering, so the report looks like a broken product and is not one. The headed run in
that same pair still passed 15/15, which is the tell: **if pixels are green and
interactions are red, suspect the machine before the code.**

### Reading a failure

| Message | What it means |
|---|---|
| `menu_tool_not_revealed:<key>` | The tool was not found after 12 scroll attempts. The message now carries `available_tool_keys` — the keys actually projected. If your key is absent from that list, it was **renamed** in the product (as `draw` → `draw_create` was); this is not a scrolling failure. |
| `capture_visually_empty` / `sampled_color_count: 1` | The canvas painted nothing. Check `console_errors` for `panicked at` **first** — a Rust panic inside the winit event loop kills the frame loop permanently, and every later capture is black. |
| `wait_timeout` with a `routing` array | A tool invocation failed. The routing trace keeps only `String(error)`; to get a stack, re-invoke the same `tool_id` yourself in the page inside a `try/catch` and read `error.stack`. |

### A fixture without video proves nothing about video

The `importExternalTexture` panic only fires when a real video element reaches the
renderer without a decoded frame. A diagnostic that creates only `shape` atomes paints
perfectly and will tell you everything is fine. Keep a video in any fixture meant to
exercise the renderer, and treat "it works in my probe" as unproven until it does.

## Constraints

- Do not add DOM proxies above the canvas or tools.
- Do not add `data-*` attributes to Atomes or rendered tool surfaces for tests.
- Do not expose a browser global or test-only API to activate a tool.
- Do not use `force: true`, `dispatchEvent`, or synthetic pointer sequences as a product solution.
- Do not restore legacy ribbon/Flower selectors, factories, or runtime aliases for diagnostics.
- Keep temporary probes and reports under `temp/`, then remove them after the evidence is captured.
