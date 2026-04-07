# eVe hard cleanup phase 2

Date: 2026-02-09

Scope analyzed:
- `src/application/eVe/intuition_`
- `src/application/eVe/tool_utils`
- `src/application/eVe/tools`

Method:
- static dependency scan (`import`, dynamic `import()`, global bridge usage),
- runtime entrypoint trace from `src/application/eVe/eVe.js` and `src/application/eVe/intuition_/bootstrap.js`.

## Removed in phase 2

1. `src/application/eVe/intuition_/index.js`
- Status: removed
- Reason: compatibility shim removed after replacing the entrypoint with `src/application/eVe/intuition_/bootstrap.js`.

2. `src/application/eVe/intuition_/toolBox.js`
- Status: removed
- Reason: replaced by `src/application/eVe/intuition_/bootstrap.js`.

3. `src/application/eVe/intuition_/eVeIntuitionAddonTools.js`
- Status: removed
- Reason: addon bootstrap folded into `src/application/eVe/intuition_/bootstrap.js`.

4. `src/application/eVe/intuition_/panel_manager.js`
- Status: removed
- Reason: global façade replaced by `src/application/eVe/intuition_/runtime/panel_api.js`.

5. `src/application/eVe/intuition_/group_timeline_bridge.js`
- Status: removed
- Reason: global façade replaced by `src/application/eVe/intuition_/runtime/group_timeline_api.js`.

6. `src/application/eVe/intuition_/mtrack_bridge.js`
- Status: removed
- Reason: unused legacy façade, no remaining in-repo consumers.

7. `src/application/eVe/intuition_/constants.js`
- Status: removed
- Reason: no remaining references after IntuitionX consolidation.

## Already removed in phase 1

1. `src/application/eVe/intuition_/runtime.js`
- Status: removed
- Reason: no import/reference in app runtime

2. `src/application/eVe/intuition_/demo_menu.js`
- Status: removed
- Reason: demo helper not referenced anywhere

## Kept

- `src/application/eVe/intuition_/goey_menu.js`
- `src/application/eVe/intuition_/legacy_bridge.js`
- `src/application/eVe/intuition_/css.js`
- `src/application/eVe/intuition_/dom.js`
- `src/application/eVe/tool_utils/tool.js`
- `src/application/eVe/tool_utils/tool_genesis.js`
- all current runtime modules under `src/application/eVe/tools/**` (directly imported or loaded from the Intuition bootstrap/runtime flows)
