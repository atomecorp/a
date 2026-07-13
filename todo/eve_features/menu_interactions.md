# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

Copilot prompt (English) — Menu Interactions Specification

You are implementing a professional, modular, and extensible “gooey” tool menu. Follow the specification below exactly. Do not invent extra behaviors.

Core concepts

- MainToolBox: the immutable primary palette. It never moves.
- Instances: clones extracted from MainToolBox. They are movable, mergeable, and can form toolboxes.
- Toolbox: a group of two or more tools that are attached/adjacent and behave as a unit for certain actions.

User interactions

1) Click (one-shot)

- Triggers the tool’s one-shot action immediately.
- Visual feedback: icon slightly rounds and changes color, then returns to normal.

1) Momentary (lock)

- Activated by “press + drag” behavior (momentary lock).
- While locked, the icon pulses (shape + color) until a second click or a reverse drag unlocks it.

1) Drag (repositioning)

- Drag only starts after a minimal distance threshold.
- Below threshold, the tool snaps back to its original position.
- Dragged tools can be attached, inserted between tools, merged, or used to create new toolboxes.

MainToolBox behavior

- MainToolBox is immutable and cannot be dragged.
- Dragging a MainToolBox tool extracts a movable clone (instance) after the threshold distance.
- Clicking a MainToolBox tool triggers its one-shot action.

Toolbox behavior

- A toolbox is formed when two tools are adjacent/attached.
- Toolbox-specific insertion and movement rules apply to grouped tools.

Grip (all toolboxes, including MainToolBox)

- Each toolbox has a visible “grip”.
- Drag on grip: moves the toolbox as a whole EXCEPT MainToolBox (which remains fixed).
- Click on grip: “compact/aspire” all tools toward the grip with a gooey animation (applies to all toolboxes, including MainToolBox).
- Long-press on grip: deletes the toolbox (EXCEPT MainToolBox, which cannot be deleted).

Deletion

- Toolbox deletion is via long-press on its grip (not available for MainToolBox).

Feedback / UI

- Visual states are clear: press, drag, toolbox active, momentary lock.
- No keyboard shortcuts (avoid confusion). Prioritize MCP/AI + voice assistance.

Constraints

- Do not add keyboard shortcuts.
- Do not allow MainToolBox to move or be deleted.
- Keep behaviors deterministic and consistent.

Mandatory Bevy Main Menu and Flower Hold Contract

This is a behavioral migration, not a request to reproduce the historical DOM implementation. Bevy is the sole visible product path.

Main bottom menu

- Tool definitions must expose their children and explicit interaction metadata, including expandable/palette, latch, and long-press behavior. Bevy consumes this canonical definition directly.
- A normal leaf invokes its declared action once. An expandable item opens or toggles its palette and never implicitly invokes a child action.
- A tool may define a dedicated hold action or request palette opening on hold. The configured hold delay and drag-cancellation threshold apply consistently to mouse, pen, and touch.
- A press converted into drag, scroll, or pointer cancellation cannot invoke a long-press action. Visual active state remains a projection of canonical tool state.
- The Bevy menu must replace the current flattened projection and remove the legacy menu entry/bridge after parity is verified.

Flower

- Long press opens the Flower while retaining the pointer session. A stationary release does not invoke a tool.
- After deliberate radial movement, palette and Back items activate immediately on hover while the press is still held. Back returns one level; at root it closes the Flower.
- Leaf items only preview on hover. The selected leaf invokes exactly once when the pointer is released over it.
- Palette/Back navigation cannot cause an additional leaf action on release. Cancellation clears the temporary selection without changing a tool.
- These rules are implemented through Bevy hit testing and canonical commands, with no DOM event proxy, browser-side state authority, or legacy fallback.

Deliverables

- Implement the interaction logic described above.
- Keep the current gooey visual style, but respect the new behaviors.

Copilot Prompt — Menu Navigation & Submenu Behavior

Goal

- Define and implement a hierarchical menu navigation system with animated submenu transitions and clear grip-based controls.

Core Principles

- Not all menu items trigger actions.
- Some menu items are navigation items that open a submenu instead of executing a command.
- Submenus visually replace the current menu using a gooey-style transition (icons appear to emerge from the clicked icon).

Submenu Transition

- When a navigation item is clicked:
  - The current menu is replaced by a new submenu.
  - All submenu icons visually emerge from the clicked icon (gooey effect).
  - The transition must be smooth, readable, and intuitive.

Grips and Navigation Logic

Left Grip (Toolbox Grip)

- Located on the left side of the toolbox.
- Used to:
  - Move the toolbox.
  - Collapse or expand the toolbox.
- This grip is global to the toolbox and is NOT part of hierarchical navigation.

Right Grip (Navigation Grip)

- Located on the right side of the toolbox.
- Used only for hierarchical navigation.
- Behavior:
  - When clicked, it navigates back one level in the menu hierarchy.
  - It does NOT:
    - Close the menu completely.
    - Jump directly to the root menu.
  - It always steps back one level at a time.

Menu End Behavior

- At the end of each submenu:
  - A navigation grip is visible.
  - This grip allows returning to the previous menu level.

Collapse / Expand Behavior

- When a submenu opens:
  - The left grip can visually reduce in size.
  - The right side of the menu retracts to align with visible icons.
- When clicking the left grip:
  - The menu expands again.
  - A minimal grip remains visible at the edge.

Constraints

- Navigation grip (right side) must only affect hierarchy.
- Toolbox grip (left side) must only affect toolbox position and visibility.
- These two grips must never share behavior.

Implementation Requirements

- Support unlimited submenu depth.
- Maintain clear hierarchy state.
- Preserve smooth gooey transitions.
- Ensure visual consistency between all levels.

Summary

- Implement a hierarchical menu where:
  - Some items open submenus.
  - Submenus replace the current menu using a gooey transition.
  - Right grip = step back one level in hierarchy.
  - Left grip = move / collapse toolbox only.
  - No direct jump to root unless explicitly implemented elsewhere.
- This logic must be strict and unambiguous.
