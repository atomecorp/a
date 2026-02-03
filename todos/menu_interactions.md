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

2) Momentary (lock)
- Activated by “press + drag” behavior (momentary lock).
- While locked, the icon pulses (shape + color) until a second click or a reverse drag unlocks it.

3) Drag (repositioning)
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

Deliverables
- Implement the interaction logic described above.
- Keep the current gooey visual style, but respect the new behaviors.
