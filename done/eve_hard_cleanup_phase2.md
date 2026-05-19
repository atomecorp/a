# eVe hard cleanup phase 2

Date: 2026-02-09

Scope analyzed:
- `eve/application/intuition_`
- `eve/application/tool_utils`
- `eve/application/tools`

Method:
- static dependency scan (`import`, dynamic `import()`, global bridge usage),
- runtime entrypoint trace from `eve/eve/application.js` and `eve/application/intuition_/bootstrap.js`.

## Removed in phase 2

1. `eve/application/intuition_/index.js`
- Status: removed
- Reason: compatibility shim removed after replacing the entrypoint with `eve/application/intuition_/bootstrap.js`.

2. `eve/application/intuition_/toolBox.js`
- Status: removed
- Reason: replaced by `eve/application/intuition_/bootstrap.js`.

3. `eve/application/intuition_/eVeIntuitionAddonTools.js`
- Status: removed
- Reason: addon bootstrap folded into `eve/application/intuition_/bootstrap.js`.

4. `eve/application/intuition_/panel_manager.js`
- Status: removed
- Reason: global façade replaced by `eve/application/intuition_/runtime/panel_api.js`.

5. `eve/application/intuition_/group_timeline_bridge.js`
- Status: removed
- Reason: global façade replaced by `eve/application/intuition_/runtime/group_timeline_api.js`.

6. `eve/application/intuition_/mtrack_bridge.js`
- Status: removed
- Reason: unused legacy façade, no remaining in-repo consumers.

7. `eve/application/intuition_/constants.js`
- Status: removed
- Reason: no remaining references after IntuitionX consolidation.

## Already removed in phase 1

1. `eve/application/intuition_/runtime.js`
- Status: removed
- Reason: no import/reference in app runtime

2. `eve/application/intuition_/demo_menu.js`
- Status: removed
- Reason: demo helper not referenced anywhere

## Kept

- `eve/application/intuition_/goey_menu.js`
- `eve/application/intuition_/legacy_bridge.js`
- `eve/application/intuition_/css.js`
- `eve/application/intuition_/dom.js`
- `eve/application/tool_utils/tool.js`
- `eve/application/tool_utils/tool_genesis.js`
- all current runtime modules under `eve/application/tools/**` (directly imported or loaded from the Intuition bootstrap/runtime flows)
