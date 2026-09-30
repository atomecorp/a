# Panel scroll hover and backdrop flicker

## Symptom

Two independent defects can look like panel scroll flicker:

- successive rows can briefly gain an outline or shadow as they cross a stationary pointer;
- rows, fixed buttons and footer bands can become pale or transparent for a frame while scrolling, even when the pointer is elsewhere.

The second signature matters: if a fixed control such as `home_session_exit` flashes while only the body moves, the defect is material presentation, not hit testing or layout.

## Confirmed owner and root cause

`eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js#decoratePanelSweepTree` is the canonical interaction decorator for every mounted BevyUI panel tree.

The decorator used to inject `hover` and `hover_leave` into every activatable node. Each enter/leave changed `mounted.hoverNodeId`, scheduled a full panel refresh and painted `BEVY_PANEL_TOKENS.actionButton.focusShadow` on the current node. During scrolling, rows move through the unchanged pointer coordinate, so the pointer runtime announces a rapid sequence of different targets. The injected refresh-and-shadow path turned that ordinary hit-test sequence into visible flicker.

Feature-local panel hover handlers created the same class of visual response, so removing only the generic ring would not establish the requested invariant for all panels.

`eVe/elements/skin/panel_skin.js` is the canonical paint owner. Panel shells, controls and fixed bands previously reused `EVE_COMMON_SKIN_TOKENS.bevy.systemSurface`, including its live `backdrop`. A panel therefore stacked backdrop consumers on its shell, rows, buttons and footer. A scroll reprojection could present different capture generations across those nested consumers for one frame, making an otherwise fixed button flash and a row appear transparent.

## Durable correction

The shared panel decorator removes `hover` and `hover_leave` from the complete mounted tree and no longer stores `hoverNodeId` or schedules hover refreshes. It still derives `palette_choose` from each control's existing `activate` handler, so press-and-slide quick mode applies exactly once and closes the panel as before. Press, focus, activation, scrolling and keyboard editing remain separate and unchanged.

The footer Close control returns from pressed to idle on release and has no hover route.

Panel paint now derives one immutable stable surface from the shared system surface: it retains the same opaque background and exterior shadow but omits `backdrop`. The shell, neutral controls and footer use that stable material. Menus and other top-level system surfaces keep the shared workspace glass; only nested panel presentation is made capture-free. Pressed, focused, selected and semantic accent states remain explicit and unchanged.

## Rejected alternatives

- Debouncing hover refreshes still leaves row paint changing during scroll and only hides some frames.
- Disabling hover in Home alone leaves the same defect in every other panel and list.
- Suppressing pointer movement during scroll would couple generic hit testing to panel policy and could break drag, quick-mode and scrollbar behavior.
- Debouncing or rebuilding the panel tree cannot synchronize several independent backdrop consumers and still leaves fixed controls exposed to capture-generation changes.
- Making only `Déconnecter` opaque treats one visible witness, not the shared material used by every panel control.

## Regression check

Run:

```bash
./node_modules/.bin/vitest run tests/eve/bevy_panel_sweep_contract.test.mjs -t "every panel control answers quick mode without hover handlers or hover refreshes"
```

The mounted fixture includes both an activate-only control and a control that declares its own hover callbacks. The assertion walks the complete mounted tree and requires zero `hover` or `hover_leave` handlers while retaining `activate` and `palette_choose`.

The panel material contract additionally requires `material`, `controlMaterial` and `footerMaterial` to contain no `backdrop`, while retaining the common system background and shadow. A constructed panel tree is also walked to ensure neither scrolling content nor fixed actions leak a backdrop consumer.

## Real-runtime acceptance

In Web, Tauri and iOS, open Home and continuously scroll across the identity fields, accordion rows (`Profile` included), guest-project attachment section and `Disconnect`. No row, fixed action or footer band may pale, become transparent, disappear or gain paint merely because content scrolls. Pressed, focused and selected states must remain visible and functional.
