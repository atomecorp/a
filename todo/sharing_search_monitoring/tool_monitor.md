# Mandatory Execution Gate

Status: Actif

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# Copilot Prompt — Active Tools Monitoring Dashboard (Atome / eVe)

## Objective

Implement a real-time **Active Tools Dashboard** inside the **Info Panel**.

The Info Panel already exists and contains an expandable internal panel. Inside this panel, we must build a **live monitoring dashboard** that:

- Displays ALL tools (Atoms used as tools)
- Displays BOTH visible and hidden tools
- Reflects activation state in real-time
- Allows activation and deactivation directly from the dashboard
- Reorders tools dynamically depending on their active state

This dashboard is a live state observer and a control surface.

---

## Functional Requirements

### 1. Location

- The dashboard must live inside the existing **Info Panel**.
- It must be rendered as a dedicated section called:

  `Active Tools Monitor`

---

### 2. What Must Be Monitored

Monitor **ALL tool Atoms**, including:

- Visible tools (e.g., select, drag, scale, color, delete)
- Implicit behavior tools (default drag, selection behavior, etc.)
- Hidden tools (not visible in UI but active internally)

Hidden tools MUST be displayed in the dashboard with a label such as:

- `Hidden Tool`
- Or an explicit property flag: `hidden: true`

They must still show their live activation state.

---

### 3. Live State Tracking

The dashboard must update automatically and in real time when:

- A tool is activated manually
- A tool is activated implicitly by behavior
- A tool is deactivated
- A hidden tool becomes active
- A tool is activated from the dashboard itself

NO refresh button.
NO polling hacks.
Use proper reactive/state-driven architecture.

---

### 4. Visual Structure

The dashboard must be divided into two dynamic sections:

## Section A — Active Tools (Top)

- All currently active tools appear here
- Sorted in activation order (latest first)
- Visually highlighted
- Clearly marked as `ACTIVE`

## Section B — Inactive Tools (Bottom)

- All inactive tools
- Sorted alphabetically (or stable order)
- Clearly marked as `INACTIVE`

When a tool becomes active:

- It moves to the Active section (top)

When a tool becomes inactive:

- It moves to the Inactive section (bottom)

This reordering must be automatic and immediate.

---

### 5. Each Tool Entry Must Display

For each tool Atom, display:

- Tool name
- Unique ID
- Hidden status (if true)
- Active status (boolean)
- Activation source (manual / implicit / system default)

Optional but recommended:

- Timestamp of activation
- Number of times activated in session

---

### 6. Control From Dashboard

Each tool row must allow:

- Activate tool
- Deactivate tool

This must:

- Trigger real tool state changes
- Not simulate state
- Update all other UI components
- Respect Atome object architecture

The dashboard is not decorative. It is a real control interface.

---

## Architectural Requirements

### 1. Source of Truth

Tool state must come from the real Atome runtime state.

Do NOT duplicate state.
Do NOT create shadow state.

The dashboard must subscribe to:

- Tool activation events
- Tool deactivation events
- Tool registration events
- Hidden flag changes

---

### 2. Tool Definition Assumptions

Each tool is an Atome with:

- id
- type: 'tool'
- properties
- active (boolean)
- hidden (boolean)

If not present, implement a consistent tool schema aligned with Atome object structure.

---

### 3. Reactivity

Use proper reactive binding or event-driven updates.

The dashboard must update when:

- State changes externally
- State changes internally
- State changes via dashboard

No fallback logic.
No patching.
No manual refresh.

---

## UX Behavior

- Clean structured list
- Clear separation between active and inactive
- Visual indicator for hidden tools
- Toggle interaction must be instant
- No page reload
- No flicker

---

## Edge Cases

- Tool activated before dashboard mounts
- Hidden tool activated automatically
- Multiple tools active simultaneously
- Default behavior tools always active
- Tool destroyed/unregistered

Dashboard must reflect all cases accurately.

---

## Deliverables

Copilot must generate:

1. Dashboard component
2. Tool state subscription mechanism
3. Rendering logic with dynamic reordering
4. Activation/deactivation handlers
5. Integration into Info Panel

All code must:

- Respect Atome architecture
- Use proper object model
- Avoid duplicated state
- Avoid patch fixes
- Be maintainable and production-ready

---

## Final Goal

Create a real-time monitoring and control dashboard that:

- Always shows which tools are active
- Shows hidden tools when active
- Allows full control from a central panel
- Remains synchronized with the runtime engine

This dashboard becomes the live diagnostic surface of the tool system.
