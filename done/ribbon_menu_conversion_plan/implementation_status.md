# IntuitionX Implementation Status

## Already in place

- persisted handedness preference in the real user profile
- IntuitionX main ribbon runtime
- IntuitionX flower runtime
- IntuitionX footer runtime
- legacy footer root/style artifacts are removed when IntuitionX footer boots
- legacy footer style injection entry point is explicitly neutralized
- projection shortcut buttons no longer use `newTool(...)`
- projection shortcut buttons no longer carry legacy V2 button/skin classes
- projection shortcut button factory is now isolated in `intuition/projection/button.js`
- grouped projection toolbox containers no longer carry legacy V2 group classes
- projection grouped palette opening now reflows local reveal/scroll so children stay visible near edges while preserving the palette trigger
- IntuitionX ribbon now mirrors handedness structurally:
  - main handle and cap swap sides
  - top-level tools mirror their visual order
  - palette children expand on the correct side
- IntuitionX ribbon cap now supports:
  - click cycle
  - double-click full open
  - drag-to-resize for partial reveal
- projection grouped toolbox selectors now target IntuitionX containers instead of legacy V2 menu selectors
- IntuitionX footer open/close now uses the same elastic reveal language as the horizontal ribbon runtime
- footer inline tool button creation is now isolated in `intuition/footer/inline_button.js`
- headless main ribbon panel probe passes on the active runtime path

## In progress

- projection grouped palettes:
  - keep replacing legacy visual/runtime assumptions
  - finish grouped width/scroll behavior parity against the mockup
- footer parity:
  - validate standard footer tools
  - validate MTrack-specific controls and placement
- flower parity:
  - keep aligning micro-animation and submenu transitions with the mockup
- runtime validation:
  - targeted MTrack/footer probe is still blocked by `ui.circle` creation failure unrelated to the new menu renderer

## Remaining cleanup

- remove dead legacy footer code paths once no callers remain
- remove remaining projection assumptions tied to legacy V2 data flow where no longer needed
- run full visual validation against the mockup
- delete legacy menu renderers after parity is proven
