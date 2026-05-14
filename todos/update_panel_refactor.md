# Update Panel Refactor

## Target Contract

- Every eVe panel uses one canonical container created by `createEveDialog`.
- The canonical panel container has a top header, a body, a bottom footer, and a tools dock below the footer.
- Header and footer heights are derived from the shared tool size token.
- Header and footer share the same color and shadow tokens.
- The header is empty by default and remains draggable.
- The footer contains the panel title, close control, and the right resize grip.
- Attached panel tools mount below the footer, never inside the body and never above the footer.

## Migration Steps

1. Centralize panel chrome metrics and theme tokens.
2. Refactor `createEveDialog` to emit the canonical structure.
3. Keep panel content scroll behavior isolated to the body.
4. Move panel-specific attached tool hosts into the canonical tools dock.
5. Validate simple panels first, then migrate complex panels.

## Panel Inventory

- home / user
- contact
- info
- ai
- finder
- communicate
- delete
- undo
- paste
- timeline
- calendar
- background
- couleur
- size
- font
- detail
- layer
- mtrack

## Validation Checklist

- Header exists on every panel.
- Footer exists on every panel.
- Header and footer heights equal half the shared tool size.
- Header and footer use the same centralized color and shadow tokens.
- Footer contains title, close control, and one right resize grip.
- Header and footer both support dragging.
- Resize behavior still works.
- Close behavior still routes through each panel close handler.
- Panel body remains the only scrollable content area.
- Attached tools render below the footer.

## Progress Log

- Centralized panel chrome variables under the existing system UI token layer.
- Updated the canonical dialog container to emit a top header, body, bottom footer, and tools dock.
- Moved the shared close control and resize grips into the footer.
- Kept header and footer heights tied to the shared tool-size variable.
- Moved the User Contact tool and MTraX panel tools into the canonical tools dock below the footer.
