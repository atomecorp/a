# eVe hard cleanup phase 2

Date: 2026-02-09

Scope analyzed:
- `src/application/eVe/intuition`
- `src/application/eVe/tool_utils`
- `src/application/eVe/tools`

Method:
- static dependency scan (`import`, dynamic `import()`, global bridge usage),
- runtime entrypoint trace from `src/application/eVe/eVe.js` and `src/application/eVe/toolBox.js`.

## Candidate files (file-by-file)

1. `src/application/eVe/tools/intuition/index.js`
- Status: `REMOVE`
- Reason: compatibility shim only, no remaining references after moving bootstrap to `src/application/eVe/intuition/index.js`.
- Confidence: high

## Already removed in phase 1

1. `src/application/eVe/intuition/runtime.js`
- Status: removed
- Reason: no import/reference in app runtime

2. `src/application/eVe/intuition/demo_menu.js`
- Status: removed
- Reason: demo helper not referenced anywhere

## Kept (no safe deletion now)

- `src/application/eVe/intuition/goey_menu.js`
- `src/application/eVe/intuition/legacy_bridge.js`
- `src/application/eVe/intuition/constants.js`
- `src/application/eVe/intuition/css.js`
- `src/application/eVe/intuition/dom.js`
- `src/application/eVe/intuition/index.js`
- `src/application/eVe/tool_utils/tool.js`
- `src/application/eVe/tool_utils/tool_genesis.js`
- all current runtime modules under `src/application/eVe/tools/**` (directly imported, dynamically imported from toolbox, or used via project/matrix/user flows)

