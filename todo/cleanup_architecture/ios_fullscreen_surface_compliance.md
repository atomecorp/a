# iOS Fullscreen Surface Compliance

## Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Objective

Ensure Atome and eVe on iPhone occupy the full available screen surface under iOS without persistent black bars at the top or bottom of the app.

The current iPad behavior appears correct and must not regress.

## Scope

- iPhone presentation inside the native iOS app shell.
- Native container sizing, safe-area handling, and WebView framing.
- Root web surface sizing, viewport behavior, and orientation updates.
- Atome and eVe startup surfaces that define the first visible frame.

## Required Investigation

- Identify whether the unused screen area comes from the native UIView or WKWebView frame, safe-area constraints, root layout sizing, viewport configuration, or rotation or resume handling.
- Confirm the exact owner of the bug before applying any fix.
- Verify whether the issue is limited to iPhone form factors or specific aspect ratios.

## Functional Rules

- The app must fill the full usable iPhone screen surface in portrait.
- The app must fill the full usable iPhone screen surface in landscape when that mode is supported.
- Safe areas must be respected without shrinking the application into a letterboxed frame.
- No persistent black band may remain above or below the rendered app during normal use.
- iPad rendering and sizing must remain unchanged if already correct.

## Architecture Notes

- Fix the owning layer only once the source of truth is confirmed.
- Do not patch individual panels, tools, or screens if the defect belongs to the root host or root layout.
- Do not add fallback padding or hardcoded device-specific offsets to mask the bug.
- Keep the native and web sizing contracts explicit so future iOS boot or layout work does not reintroduce the issue.

## Validation Checklist

- iPhone portrait no longer shows black bars at the top or bottom of the app.
- iPhone landscape does not introduce new letterboxing when supported.
- Safe-area zones remain respected for status bar and home indicator areas.
- Rotation, resume, and relaunch do not reintroduce the layout gap.
- iPad still renders correctly after the fix.

## Definition Of Done

- The owning cause of the iPhone black bars has been identified and fixed at the correct layer.
- Atome and eVe occupy the full intended iPhone screen surface.
- iPad behavior remains correct.
- No device-specific workaround was introduced to hide an unresolved sizing bug.
