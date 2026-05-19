# IntuitionX Conversion Plan

## Source of truth

The only visual and behavioral source of truth is:

- `/Users/jean-ericgodard/RubymineProjects/a/eVe/tests/ui/ribbon_menu_prototype.html`
- `/Users/jean-ericgodard/RubymineProjects/a/eVe/tests/ui/ribbon_menu_prototype_spec.md`

No legacy menu renderer is allowed to define the new result.

## Non-negotiable constraints

- JS only
- no HTML templates
- no CSS text injection
- no `style.textContent`
- no interpolated CSS or HTML strings
- no fallback patch layer for the new system
- no reuse of legacy visual structures as a base
- modular code only
- shared tokens/constants only
- behavior parity with the mockup, pixel for pixel and animation for animation

## IntuitionX targets

The new runtime must replace:

- main ribbon
- auxiliary floating palettes
- flower menu
- double-click footer menus
- MTrack double-click footer menu

The old runtime is tolerated only as business/context data while the new visual/runtime path is being completed. It must not remain the visible renderer.

## Mandatory behavior rules

- right-handed / left-handed is a persisted user profile preference
- partial reveal and overflow cap follow the mockup rules
- overflow edge gap is 3px
- cap click cycles content without reversing direction at the end
- cap drag resizes partial reveal
- cap double-click opens to the maximum possible extent
- opening a palette near an edge must shift local ribbon reveal so its children are visible
- the palette trigger/head must remain visible and must not exit the screen on its anchor side
- flower opens on right click and long press, toggles closed on the same gesture, and supports hold navigation
- text selection is blocked on menu/system UI by default

## Runtime structure

The new implementation is split into:

- `intuition/core`
- `intuition/ribbon`
- `intuition/flower`
- `intuition/footer`

Each area must keep:

- DOM construction in JS
- visual tokens in JS
- behavior/runtime in JS

## Current direction

Current replacement strategy:

- `main ribbon`: IntuitionX visible renderer
- `flower`: IntuitionX visible renderer
- `footer`: IntuitionX visible renderer
- `projection palettes`: migration in progress toward IntuitionX buttons and grouped hosts

## Completion criteria

The migration is complete only when:

- no visible menu renderer depends on legacy toolbox/footer/flower visuals
- no legacy socket is mounted for the footer
- auxiliary palettes no longer rely on legacy button factory visuals
- mockup parity is validated on main ribbon, palettes, flower, and double-click menus
- remaining legacy menu code can be deleted instead of merely bypassed
