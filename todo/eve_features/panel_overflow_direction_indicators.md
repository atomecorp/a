# Panels - Visible Overflow Direction Indicators

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Objective

All panels must show a very visible upward or downward arrow whenever content overflow means part of the panel content is currently hidden.

The indicator must communicate clearly that not all content is visible.

## Scope

- Applies to all panels using the shared panel system.
- Applies whenever a panel content area has hidden content above or below the current viewport.
- The indicator must reflect the real overflow state of the active scroll container.

## Required Behavior

- Show a visible down arrow when content exists below the visible area.
- Show a visible up arrow when content exists above the visible area.
- Show both arrows when content is hidden both above and below.
- Hide the arrows when the full content is already visible.
- Update the arrows immediately on scroll, resize, layout changes, panel opening, and content mutations affecting overflow.

## Design Constraints

- The arrows must be very visible without breaking the existing panel design.
- The arrows must respect the current visual language, spacing, tokens, shadows, and chrome style.
- The arrows must look integrated into the panel system, not pasted on top as a debug artifact.
- The indicator must not block essential interactions with panel content.

## Architecture Notes

- Compute indicator visibility from the real scroll container state.
- Reuse shared panel primitives if possible.
- Do not implement per-panel decorative hacks when the behavior belongs in the canonical panel layer.
- Do not rely on silent fallback logic or timing-based guesses.

## UX Rules

- The indicator must remain legible on different panel sizes.
- Visibility changes must be immediate and stable.
- Motion, if any, must remain subtle and consistent with the existing design system.
- The indicator must clearly suggest scroll direction.

## Validation Checklist

- A panel with hidden content below shows a down arrow.
- A panel with hidden content above shows an up arrow.
- A panel with hidden content in both directions shows both arrows.
- A fully visible panel body shows no overflow arrows.
- Indicators update correctly after resize, content growth, and scroll position changes.

## Definition Of Done

- Overflow direction indicators work across the shared panel system.
- Indicators reflect the true hidden-content state.
- The arrows are visually strong and design-consistent.
- No panel-specific hack is required to keep them accurate.
