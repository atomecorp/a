# Atome – Tool & Code Model

## Goal

Define how **tools (UI)** and **code (behavior)** work together in Atome/Squirrel to provide:

* interactive creative tools (click, drag, double‑click, etc.)
* reactive scripting
* controlled execution (Command Bus)
* compatibility with AI/MCP/voice control
* deterministic & secure behavior

---

## Core Concepts

### 1. `type: "tool"` — UI Tool Object

Represents an **interactive tool** in the UI.

A `tool` defines:

* visual identity (label, icon, group)
* interaction mode (one‑shot, continuous, double click)
* gesture triggers (click, drag, drag_selection)
* links to **code atoms** for behavior
* optional exposure to AI

**Structure:**

```js
atome({
  type: 'tool',
  id: 'tool_id',             // unique id
  label: 'Scale',             // text label
  icon: 'scale',              // icon reference or atome
  group: 'transform',         // toolbar group/category

  mode: 'continuous',         // 'one_shot' | 'continuous' | 'double_click'
  gesture: 'drag_selection',  // interaction pattern

  handlers: {
    on_click: 'code_id_click',
    on_drag_start: 'code_id_drag_start',
    on_drag_move: 'code_id_drag_move',
    on_drag_end: 'code_id_drag_end'
  },

  ai_exposed: true,            // optional: available to AI
  ai_name: 'ui.scale_selection'// alias used by AI/MCP
})
```

---

### 2. `type: "code"` — Behavior Logic

Represents executable behavior **triggered by tools**.

A `code` atome:

* runs in a **sandbox**
* can **read** state via `ctx.get`
* can **emit intents** (commands) to the Command Bus
* **never** modifies state directly
* may hold internal state between interactions (optional)

**Structure:**

```js
atome({
  type: 'code',
  id: 'code_id',
  language: 'javascript',

  capabilities: ['atome.write'], // optional: for policy engine
  risk_level: 'LOW',              // optional: policy decision

  code: async ({ ctx, event, input, state }) => {
    // ctx: access to command bus, queries, etc.
    // event: 'on_click', 'on_drag_move', etc.
    // input: UI/AI payload (selection, drag, cursor, etc.)
    // state: local memory for continuity (optional)

    // RETURN INTENTIONS, not direct effects:
    return {
      action: 'BATCH' | 'PATCH' | 'NOOP',
      commands: [...],
      newState: {...} // optional
    }
  }
})
```

---

## Execution Model

### Flow

```
User Input / Voice / AI
        ↓
Active Tool (type: tool)
        ↓ triggers
Code Atome (type: code)
        ↓ returns INTENTIONS
Command Bus (ADOLE)
        ↓ executes
State Change + Audit + Policy
```

### Rules

* No state mutation outside the Command Bus
* Every result is auditable
* Policy engine can ALLOW / REQUIRE_CONFIRM / DENY
* Voice & AI use same contract as UI

---

## Example — Scale Tool (drag to resize selection)

### Tool UI

```js
atome({
  id: 'ui_scale_tool',
  type: 'tool',
  label: 'Scale',
  icon: 'scale',
  group: 'transform',
  mode: 'continuous',
  gesture: 'drag_selection',
  handlers: {
    on_drag_move: 'code_scale_drag'
  },
  ai_exposed: true,
  ai_name: 'ui.scale_selection'
})
```

### Code Logic

```js
atome({
  id: 'code_scale_drag',
  type: 'code',
  language: 'javascript',

  code: async ({ ctx, event, input }) => {
    const { selection, drag, pivot } = input
    if (!selection?.length) return { action: 'NOOP' }

    const scale = 1 + (drag.dx || 0) / 200
    if (scale <= 0) return { action: 'NOOP' }

    const objs = await ctx.getMany(selection, ['id', 'position', 'size'])
    const commands = []

    for (const o of objs) {
      const [w, h] = o.size || [0, 0]
      const cx = o.position?.x || 0
      const cy = o.position?.y || 0
      const px = pivot?.x ?? cx
      const py = pivot?.y ?? cy

      commands.push({
        action: 'PATCH',
        target: { atome_id: o.id },
        patch: {
          size: [w * scale, h * scale],
          position: {
            x: cx + (cx - px) * (scale - 1),
            y: cy + (cy - py) * (scale - 1)
          }
        }
      })
    }

    return { action: 'BATCH', commands }
  }
})
```

---

## AI / Voice / MCP Integration

### Generic UI Event Tool

Provides a bridge for AI/voice to "act like a user":

```js
tool.define({
  name: 'ui.tool_event',
  capabilities: ['atome.write'],
  params: {
    tool_id: 'string',
    event: 'string',
    payload: 'object'
  },
  handler(ctx, { tool_id, event, payload }) {
    // resolve tool, find handler, run code
  }
})
```

### Example Voice Command

"Agrandis la sélection de 200%" →

```jsonc
{
  "tool": "ui.tool_event",
  "params": {
    "tool_id": "ui_scale_tool",
    "event": "on_drag_move",
    "payload": { "selection": ["logo"], "drag": { "dx": 200 } }
  }
}
```

---

## Benefits

* Separation of concerns: UI vs Logic
* Tools are visual & ergonomic, Code is pure behavior
* Hot‑reload & modding: change behavior by patching code atom
* Uniform Command Bus pipeline
* AI & voice use same interfaces as UI
* Works offline/local or remote/AI/cloud

---

## Future Extensions

* `type: toolset` to group multiple tools
* `type: gesture` objects to declare custom gestures
* `tool states` for multi-step interactions
* param hints + UI docs auto-generated from tool atoms

---

## Status

**Draft v1** — pending integration into `AI.md` and Squirrel runtime.
