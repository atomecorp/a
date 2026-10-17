# Matrix drag throws `px is not defined`

## Symptom

Dragging a tile in the Matrix logs
`ReferenceError: px is not defined at tileMediaCardNode`.

## Confirmed cause

`bevy_panel_media_card.js#tileMediaCardNode` used `px(3)` for the drop/absorb
border, but `px` was only defined in another function of the module.

## Durable correction

`tileMediaCardNode` defines `const px = panelTokens.unitScalePx`.

## Regression checks

- Acceptance « the browser console and page error channels are clean ».
