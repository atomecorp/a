# eVe hard cleanup phase 2

Date: 2026-02-09

Scope analyzed:
- `eVe/intuition_`
- `eVe/tool_utils`
- `eVe/tools`

Method:
- static dependency scan (`import`, dynamic `import()`, global bridge usage),
- runtime entrypoint trace from `eve/eVe.js` and `eVe/intuition_/bootstrap.js`.

## Removed in phase 2

1. `eVe/intuition_/index.js`
- Status: removed
- Reason: compatibility shim removed after replacing the entrypoint with `eVe/intuition_/bootstrap.js`.

2. `eVe/intuition_/toolBox.js`
- Status: removed
- Reason: replaced by `eVe/intuition_/bootstrap.js`.

3. `eVe/intuition_/eVeIntuitionAddonTools.js`
- Status: removed
- Reason: addon bootstrap folded into `eVe/intuition_/bootstrap.js`.

4. `eVe/intuition_/panel_manager.js`
- Status: removed
- Reason: global façade replaced by `eVe/intuition_/runtime/panel_api.js`.

5. `eVe/intuition_/group_timeline_bridge.js`
- Status: removed
- Reason: global façade replaced by `eVe/intuition_/runtime/group_timeline_api.js`.

6. `eVe/intuition_/mtrack_bridge.js`
- Status: removed
- Reason: unused legacy façade, no remaining in-repo consumers.

7. `eVe/intuition_/constants.js`
- Status: removed
- Reason: no remaining references after IntuitionX consolidation.

## Already removed in phase 1

1. `eVe/intuition_/runtime.js`
- Status: removed
- Reason: no import/reference in app runtime

2. `eVe/intuition_/demo_menu.js`
- Status: removed
- Reason: demo helper not referenced anywhere

## Kept

- `eVe/intuition_/goey_menu.js`
- `eVe/intuition_/legacy_bridge.js`
- `eVe/intuition_/css.js`
- `eVe/intuition_/dom.js`
- `eVe/tool_utils/tool.js`
- `eVe/tool_utils/tool_genesis.js`
- all current runtime modules under `eVe/tools/**` (directly imported or loaded from the Intuition bootstrap/runtime flows)
