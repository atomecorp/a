# Panels - Move Tools Above Footer Band

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Objective

Invert the vertical order between:

- the footer band containing the resize grip and close control
- the attached tools band

After the change, panel tools must render above the footer band instead of below it.

## Target Layout

The canonical vertical order must become:

1. Header
2. Body
3. Tools band
4. Footer band with title, close control, and resize grip

## Scope

- This applies to the canonical panel contract, not to a single panel only.
- All panels using the shared dialog structure must converge to the same order.
- Complex panels with attached tools must follow the same layout once migrated.

## Functional Rules

- The tools band must stay visually attached to the panel chrome.
- The footer band must remain the bottom-most chrome band.
- The close control and right resize grip must stay in the footer band.
- Drag, resize, close, and attached tool interactions must keep their current behavior.
- Scrolling must remain isolated to the panel body unless a tool area explicitly needs its own controlled overflow behavior.

## Architecture Notes

- Update the canonical panel contract first.
- Reconcile this task with the current contract documented in related panel refactor todos.
- Do not special-case one panel with a local inversion if the shared panel factory is the real source of truth.

## UX Rules

- The new order must look intentional, not like two bands accidentally swapped.
- Spacing, shadows, separators, and hit areas must stay coherent.
- The tools band must remain easy to scan and interact with.
- The footer band must still read as the final closing band of the panel.

## Validation Checklist

- Attached tools render above the footer band.
- The footer still contains title, close control, and resize grip.
- Close behavior still routes through the correct panel handlers.
- Resize behavior still works from the footer grip.
- The visual hierarchy remains consistent across panels.

## Definition Of Done

- The canonical panel layout places tools above the footer band.
- Panels using the shared contract follow the same order.
- No duplicated local chrome workaround is introduced.
- Footer controls remain functional and visually clear.
