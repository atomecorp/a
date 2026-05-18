# Matrix Flower Context Menu

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Objective

When the Flower menu opens while the current context is Matrix, it must show a dedicated action set instead of the default Flower entries.

## Required Matrix Actions

The Matrix Flower menu must expose exactly these actions:

- Copy
- Paste
- Duplicate
- Delete
- Rename

## Scope

- This behavior applies only when the active UI context is Matrix.
- Outside Matrix, the Flower menu keeps its normal context behavior.
- The action list must be driven by the real runtime context, not by decorative UI state.

## Functional Rules

- Opening Flower in Matrix must resolve the active context before rendering the menu.
- The Matrix-specific Flower menu must not include unrelated project tools.
- `Rename` must target the selected Matrix project tile or the current explicit Matrix target.
- `Copy`, `Paste`, `Duplicate`, and `Delete` must use the real command path already used by the corresponding runtime tools.
- If no valid Matrix target exists, unavailable actions must be visibly disabled instead of silently failing.

## UX Rules

- Keep the current Flower visual identity and motion language.
- Keep the interaction fast and deterministic.
- The Matrix-specific menu must remain compact and readable.
- Labels and ordering must be stable across openings.

## Integration Notes

- Reuse the existing Flower menu infrastructure instead of creating a second menu system.
- Reuse the existing tool routing for `copy`, `paste`, `duplicate`, `delete`, and `rename` where those commands already exist.
- Respect the existing Matrix selection and target resolution model.
- Do not introduce a fallback menu branch that hides missing command wiring.

## Validation Checklist

- Opening Flower in Matrix shows `Copy`, `Paste`, `Duplicate`, `Delete`, and `Rename`.
- Opening Flower outside Matrix does not show this forced Matrix action set.
- Each action routes to the real runtime behavior.
- Disabled states are explicit when no valid Matrix target is available.
- The visual style stays aligned with the current Flower design.

## Definition Of Done

- Flower detects Matrix context reliably.
- The Matrix Flower menu exposes the expected five actions only.
- Actions operate on the correct Matrix target.
- No silent failure or decorative no-op remains in the Matrix action path.
