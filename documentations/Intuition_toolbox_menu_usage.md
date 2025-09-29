# Toolbox Menu: Usage & Development Guide (English)

## Quick Start: Build a Toolbox Menu

1. **Pick or extend a theme**. The `Intuition_theme` object drives layout, backgrounds, icon sizing, slider behavior, and more. Each item type now has its own background key, so you can skin them independently:

  | Theme key | Applies to |
  |-----------|------------|
  | `palette_bg` | Palette entries (top-level sections)|
  | `tool_bg` / `tool_bg_active` | Tools + their active highlight|
  | `particle_bg` | Particle tiles|
  | `option_bg` | Options|
  | `zonespecial_bg` | Zone-special tiles|
  | `toolbox_icon`, `icon_*` | Toolbox trigger icon position/color|

1. **Describe your content** inside `intuition_content`. Each key represents a logical item. Reference factory helpers (`palette`, `tool`, `particle`, `option`, `zonespecial`) from `intuition_builder.js`:

  ```javascript
  const intuition_content = {
    toolbox: { children: ['file', 'tools'] },
    file: { type: palette, children: ['import', 'save'] },
    import: { type: tool, icon: 'download', children: ['audio', 'projects'] },
    audio: { type: option, touch: ({kind}) => console.log('Import audio via', kind) },
    volume: { type: particle, helper: 'slider', value: 50, unit: '%', icon: 'volume' }
  };
  ```

  **Hierarchy** is defined through the `children` array. Top-level palettes sit under the special `toolbox` definition.

  **Icons** accept a string key, use `null`/`false` to skip SVG loading, or provide custom `icon_*` overrides per item.

  **Callbacks** (`touch`, `touch_down`, `touch_up`, `lock`) receive `{ el, event, kind, nameKey, update, theme }`.

1. **Bootstrap the UI** by calling `createToolbox()` (or the broader `createIntuition()` wrapper if you are using the legacy boot sequence). The component waits for its parent container and applies the theme-defined layout.

1. **Navigate** by clicking the toolbox trigger (`#toolbox`). The system builds menu items on demand, animates them in, and keeps a navigation stack so you can drill into children and pop back out.

Use the following sections as a reference for advanced customization, navigation, and behavior.

## Part 1. Using the Toolbox Menu (Functional / User Perspective)

### 1. Overview

The toolbox is a dynamic, theme‑driven ribbon or vertical stack of interactive items ("tools", "options", "zonespecial", and "particles"). It supports:

- Horizontal and vertical layouts (`direction` theme key)
- Inline expansion of tool children
- Helper components (slider or button) bound to particle values
- Long‑press lock mode
- Semantic interaction events (`touch`, `touch_down`, `touch_up`, `lock`)
- Inline numeric value editing (double‑click)
- Adaptive zoom + relative drag editing for sliders

### 2. Item Types (Runtime Behavior)

| Type        | Description | Typical Behavior | Default Background |
|-------------|-------------|------------------|--------------------|
| Tool        | May have children; expands inline when activated | If no children: toggles active state | `currentTheme.tool_bg` |
| Option      | Simple actionable item (like a tool without expansion) | Fires semantic handlers | `currentTheme.option_bg` |
| Zonespecial | Specialised container or action surface | Fires semantic handlers | `currentTheme.zonespecial_bg` |
| Particle    | Displays a value + unit; can expose helper (slider/button) | Double‑click to edit value | `currentTheme.particle_bg` |
| Palette     | Top-level category tile | Opens nested tools | `currentTheme.palette_bg` |

### 3. Interaction Model

- **Click (touch)**:
  - Tool WITH children → toggles inline expansion (inserting its children right after itself).
  - Tool WITHOUT children → toggles simple active state.
  - Option / Zonespecial → executes its `touch` handler if defined.
- **Long press (hold pointer/finger ~450ms)** on any tool: enters/exits lock mode.
- **Lock mode**: The tool remains visually in its locked style (pulse animation). You can still click to trigger expand/close; lock does not auto-exit unless long pressed again.
- **Double‑click value (particle)**: Opens inline input to edit the numeric (or textual) value before interacting with helper controls.
- **Slider drag (zoom press)**: Pressing on the slider area can animate parent size (using `item_zoom`). If in vertical direction the slider grows in height; horizontal → width.
- **Relative drag**: While zoomed press sequence begins, pointer movement adjusts value without having to hit the handle precisely.

### 4. Semantic Event Hooks & Navigation Callbacks

Each interactive item can declare handlers inside `intuition_content`:

- `touch_down`
- `touch`
- `touch_up`
- `change` (particles & helpers when value toggles)
- `lock` (invoked automatically on enter/exit with `{ phase: 'enter' | 'exit' }` context)

Handlers can be functions or strings (evaluated inside a controlled `new Function` sandbox with: `el, event, kind, nameKey, update, theme`). While handlers run, the navigation system takes care of expanding children, toggling states, and managing the `menuStack`. You can layer navigation logic (e.g., breadcrumbs) by observing `menuStack` or the data attributes described below.

### 5. Data Attributes (State Tags)

The system writes lightweight logical tags (no extra DOM nodes):

| Attribute | Meaning |
|-----------|---------|
| `data-expanded="true"` | Tool currently expanded (has visible inline children) |
| `data-inline-parent="<parentKey>"` | Child inserted inline under parent tool |
| `data-simple-active="true"` | Childless tool toggled active |
| `data-active-tag="true"` | Unified active marker (expansion OR simple active) |
| `data-locked="true"` | Tool is in lock mode |
| `data-lock-tag="true"` | Lock logical tag (same semantic as locked; used for styling targeting) |

You may use these in CSS (or logic) for custom skinning. Example selectors:

```js
[data-active-tag="true"] { /* style active tool */ }
[data-lock-tag="true"] { /* style locked */ }
[data-active-tag="true"][data-lock-tag="true"] { /* combined state */ }
```

### 6. Theme Keys (User-Relevant)

In addition to the per-type backgrounds listed earlier, the theme governs layout, icon sizing, helper behavior, and the toolbox trigger itself.

| Key | Purpose | Notes |
|-----|---------|-------|
| `direction` | Layout + orientation | e.g. `top_left_horizontal`, `bottom_right_vertical` |
| `item_size` | Base size of square tool items | Drives slider thickness, label scaling |
| `slider_length` | Horizontal slider base length (percentage or px/ratio) | Retains % for responsive zoom |
| `slider_zoom_length` | Alt length while zoomed (horizontal) | Optional |
| `slider_length_vertical` | Vertical slider length | e.g. `30%` |
| `slider_zoom_length_vertical` | Alt vertical length while zoomed | e.g. `80%` |
| `item_zoom` | Parent size animation factor/px/% | Applies to width or height based on orientation |
| `item_zoom_transition` | Transition duration | e.g. `200ms` |
| `slider_handle_size` | Handle diameter | Accepts %, px, ratio |
| `slider_handle_radius` | Corner radius of handle | CSS border-radius value |
| `slider_track_color` | Track base color | |
| `slider_revealed_track_color` | Progression bar color | |
| `handle_color` | Handle fill color | |
| `drag_sensitivity` | Pixel multiplier for relative drag | `1` → 1px = 1 unit |
| `drag_mode` | `unit` or `percent` | `unit` = px→value mapping |
| `tool_bg`, `tool_bg_active` | Base + active backgrounds for tools/options/zonespecial | Fallback ordering is used |
| `tool_active_bg` | Legacy active alternative | Used if `tool_bg_active` missing |
| `tool_lock_bg` | Second color for lock pulse | |
| `tool_lock_pulse_duration` | Animation duration | ms string |
| `particle_bg`, `option_bg`, `zonespecial_bg` | Backgrounds for respective types | Used when no per-item override provided |
| `satellite_offset` | Distance (px) between the toolbox edge and any popped-out palette | Falls back to `max(8, items_spacing)` when omitted |
| `particle_value_*` | Font & positioning for value display | bottom, font size, colors |

### 7. Editing Particle Values

1. Double-click the displayed value.
2. An inline `<input>` appears (numeric if original value is number).
3. Press Enter or blur to commit; Escape to cancel.
4. Helper components (slider/button) sync automatically.

### 8. Sliders (User Experience)

- Horizontal: value increases to the right.
- Vertical: value increases upward (dragging downward decreases value).
- Zoom press allows coarse + fine adjustment without handle precision.
- Release restores original dimensions.

### 9. Lock Mode (Behavior Summary)

| Action | Result |
|--------|--------|
| Long press (not already locked) | Enters lock (`data-lock-tag`, `data-locked`) |
| Long press (already locked) | Exits lock |
| Click while locked | Will still trigger expand/toggle active but does NOT auto-unlock |

### 10. Accessibility / Practical Tips

- Because `pointerEvents: none` is set on some wrappers, only interactive sub-elements respond; be sure not to cover them with custom overlays.
- Use data attributes for theming instead of injecting extra wrappers.

---

## Part 2. Developing / Extending the Toolbox (Engineering Perspective)

### 1. Core Registries

Your item definitions reside in `intuition_content` (object keyed by logical name). Each entry can include:

```javascript
const intuition_content = {
  myTool: {
    type: tool,          // factory function (e.g., tool, option, zonespecial, particle)
    label: 'My Tool',
    icon: 'my_icon',
    children: ['childParticleA', 'childOptionB'], // optional
    helper: 'slider',    // for particles (slider | button)
    value: 42,           // particle numeric value
    unit: 'Hz',          // optional unit for value display
    ext: 2,              // decimals for number formatting
    touch: ({ el, kind }) => { /* custom click */ },
    touch_down: ({ el }) => {},
    touch_up: ({ el }) => {},
    lock: ({ phase }) => { if (phase === 'enter') {/* ... */} }
  }
};
```

Factories are thin wrappers: `tool`, `option`, `zonespecial`, `particle` (actual underlying creator: `createTool`, `createOption`, etc.).

### 2. Creating a New Menu Item Programmatically (Squirrel / JS Syntax)

All UI construction uses a DOM helper pattern like:

```javascript
$('div', {
  id: 'myDiv',
  css: { backgroundColor: '#222', color: '#fff' },
  text: 'Hello'
});
```

For a new tool:

```javascript
intuition_content.new_action = { type: tool, label: 'Action', icon: 'action', touch: ({update}) => { /* logic */ } };
```

After updating `intuition_content`, call your toolbox rebuild routine (if not automatic) or insert manually via the same loading logic used on startup.

### 3. Helper Components (Slider / Button)

For particles only:

```javascript
intuition_content.cutoff = {
  type: particle,
  label: 'Cutoff',
  helper: 'slider',
  value: 50,
  unit: '%',
  ext: 0
};
```

Helper selection logic reads `def.helper` and instantiates the appropriate component *inside an absolute wrapper* so percentage-based lengths animate smoothly.

### 4. Slider Construction Notes

- Orientation auto-detected from `currentTheme.direction` containing `vertical`.
- Length keys chosen accordingly (`slider_length[_vertical]`, `slider_zoom_length[_vertical]`).
- Value sync path: slider input → `updateParticleValue(key, newValue)` → re-renders particle label/value + helper state.
- Relative drag path bypasses library’s internal jump by stopping original event and manually updating value.

### 5. Value Synchronization

`updateParticleValue(nameKey, newValue)`:

- Clamps numeric values (0–100 for slider domain) unless custom domain introduced later.
- Updates displayed particle text + unit formatting.
- Repositions or refreshes helper components (slider progression or button coloring).

### 6. Semantic Event Dispatcher (`handleToolSemanticEvent`)

Dispatch order for a `touch` event:

1. Execute custom `def.touch` (if present).
2. If tool has children → `expandToolInline`.
3. Else → toggle simple active state (sets/removes `data-simple-active`, `data-active-tag`).

For `lock` events: auto-fired on `enter` & `exit` phases; if a handler returns quickly UI remains responsive.

### 7. Lock Behavior (`attachToolLockBehavior`)

Internal flow:

- Pointer down starts a timer (`longPressDelay` ~450 ms).
- If still pressed when timer fires → toggles lock.
- Synthetic click right after long press is suppressed to avoid unwanted toggles.
- Data attributes: `data-locked="true"`, `data-lock-tag="true"`.
- Visual pulse uses injected keyframes + CSS variables.

### 8. Active / Expanded Logic

| Scenario | Data Attributes Set | Notes |
|----------|--------------------|-------|
| Tool expands children | `data-expanded`, `data-active-tag` | Styled as active |
| Tool collapses children | (removed) | Background reset |
| Childless tool toggles on | `data-simple-active`, `data-active-tag` | Lock prevents toggling |
| Childless tool toggles off | (removed) | |

### 9. Extending Behavior

Possible safe extension points:

- Add `tool_state_observer` that scans mutation of data attributes (MutationObserver) and dispatches app-level logic.
- Introduce a consolidated state attribute (e.g. `data-state="idle|active|locked|active-locked"`).
- Provide an adapter to map tool interactions into MIDI / OSC / WebSocket events.

### 10. Performance Considerations

- Inline expansion inserts existing or newly created child nodes—avoid heavy reflows in handlers.
- Keep semantic handlers idempotent & fast (no deep layouts).
- Avoid long-running code inside `lock` or pointer event handlers; delegate to `requestIdleCallback` if needed.

### 11. Error Handling / Safety

- All custom handler executions are wrapped in try/catch.
- Missing definitions fail silently (defensive checks).
- Slider operations guard against NaN and bounds bleed.

### 12. Adding New Theme Keys

When adding a new key, follow the pattern:

1. Define default value in theme object.
2. Safely access via `currentTheme.<key>` with fallback.
3. Document it (update this file and any theme reference doc).

### 13. Debugging Tips

| Symptom | Check |
|---------|-------|
| Slider not appearing | `def.helper === 'slider'` & factory `window.Slider` loaded |
| Value not updating | Confirm `updateParticleValue` invoked (console log) |
| Lock never engages | Long press duration: verify no premature pointerup/cancel |
| Active state not styling | Inspect element → ensure dataset attributes present |

### 14. Minimal Example (Palette with Hierarchy & Slider Particle)

```javascript
Intuition_theme.basic = {
  ...Intuition_theme.basic,
  palette_bg: '#3e3e3ecc',
  tool_bg: 'linear-gradient(180deg, #565656 0%, #2f2f2f 100%)',
  option_bg: '#454545cc',
  particle_bg: '#3a3a3acc',
  zonespecial_bg: '#353535cc'
};

Object.assign(intuition_content, {
  toolbox: { children: ['sound'] },
  sound: { type: palette, children: ['filter', 'mod'] },
  filter: { type: tool, icon: 'filter', children: ['cutoff', 'resonance'] },
  cutoff: { type: particle, helper: 'slider', value: 42, unit: '%', icon: 'cutoff' },
  resonance: {
    type: particle,
    label: 'Res',
    helper: 'slider',
    value: 25,
    ext: 0,
    unit: '%',
    touch: ({ el }) => { /* optional custom tap */ }
  },
  mod: {
    type: zonespecial,
    label: 'Mod Wheel',
    icon: null,
    touch: () => console.log('Open modulation zone')
  }
});

createToolbox();
```

### 15. Style Strategy

Rather than modifying creation code, prefer CSS authored against data attributes and existing classes:

```js
/* Active emphasis */
[data-active-tag="true"] { filter: brightness(1.15); }
/* Locked overlay hue */
[data-lock-tag="true"] { box-shadow: 0 0 6px 2px rgba(255,80,80,0.5); }
```

### 16. Checklist Before Shipping a New Tool Definition

- [ ] Has a unique key in `intuition_content`
- [ ] Factory (`type`) set correctly
- [ ] Optional handlers tested (`touch`, `lock`)
- [ ] Theme keys referenced exist (or have safe fallbacks)
- [ ] Value domain (0–100) respected (or custom logic added)
- [ ] No blocking loops or heavy sync code in handlers

---

## Appendix A. Quick Reference (Cheat Sheet)

```js
Touch lifecycle: touch_down -> touch -> touch_up
Lock phases: lock { phase: 'enter' } / { phase: 'exit' }
Data tags: data-active-tag, data-lock-tag, data-simple-active, data-expanded, data-inline-parent
Orientation: direction contains 'vertical' => vertical slider orientation
Zoom: item_zoom + item_zoom_transition + slider_zoom_length[_vertical]
Drag modes: drag_mode = 'unit' | 'percent'
```

## Appendix B. Future Extensions (Ideas)

- Unified state attribute `data-state` (composed state machine value)
- Accessibility: ARIA roles + keyboard navigation
- Gesture aggregator for multi-tool macros
- Persistence layer (save last active/locked state to localStorage)

---

If you extend or refactor behavior (e.g., new helper types), update this document to keep parity between runtime capabilities and developer expectations.
