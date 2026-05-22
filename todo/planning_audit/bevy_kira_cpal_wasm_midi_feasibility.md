# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Priority Analysis Task - Bevy, Kira, CPAL, WebAssembly, And MIDI

Priority: P0
Status: Open
Type: Analysis before any structural replacement work

## Objective

Produce a decision-grade feasibility and value analysis for a possible Bevy-based runtime direction covering audio, video, timeline, track rendering, and MIDI, while first verifying the real current Kira and CPAL usage in the framework.

This task exists because the current product direction already relies on Kira-oriented runtime paths, and Kira is expected to remain aligned with CPAL-based audio I/O. The analysis must verify the real runtime state instead of assuming it.

## Mandatory Verification Scope

- Verify the current playback and recording architecture actually uses Kira and CPAL on the maintained runtime paths.
- Verify where Kira is active today on native and WebAssembly paths, and where the system still bypasses or duplicates that stack.
- Verify whether the maintained runtime direction should continue to treat CPAL as the low-level audio I/O layer paired with Kira.
- Evaluate the technical interest of Bevy as an application/runtime engine, not only as a game engine.
- Evaluate the feasibility of using Bevy in WebAssembly for audio, video, timeline, tracks, and rendering orchestration.
- Evaluate whether Bevy can realistically replace the current timeline and track system end to end, rather than only adding an isolated subsystem.
- Evaluate the MIDI implications, including device access, routing, MIDI tracks, grid editor requirements, deterministic scheduling, and interoperability with the Rust midir direction already tracked in the MIDI todo files.

## Required Questions

The analysis must answer, at minimum:

1. What is the exact current relationship between Kira and CPAL in the maintained runtime paths?
2. Which runtime surfaces already depend on Kira, CPAL, or WebAssembly audio paths today?
3. What real architectural value would Bevy add compared with the current stack?
4. Is Bevy's idle-oriented runtime model relevant for the application's energy profile on desktop, mobile, and browser/WebAssembly?
5. Can Bevy realistically own audio, video, timeline, and track orchestration without breaking the existing mutation pipeline and Atome/eVe architecture constraints?
6. Can Bevy/WebAssembly support the required MIDI scope, including input routing, MIDI tracks, a grid or piano-roll style editor, and deterministic replay?
7. Should the target architecture be full replacement, partial embedding, or explicit rejection of Bevy for these surfaces?
8. What migration cost, risk, platform gaps, and validation burden would a Bevy-based direction introduce?

## Deliverables

- A factual inventory of current Kira and CPAL usage, including native and WebAssembly paths.
- A feasibility matrix for Bevy across audio, video, timeline, rendering, energy usage, MIDI, and editor requirements.
- A recommendation: go, no-go, or phased exploration only.
- If the answer is not an immediate no-go, a staged migration outline with explicit preconditions, blockers, and validation gates.
- A list of architecture constraints that must remain non-negotiable if any Bevy path is pursued.

## Non-Goals

- Do not start implementation in this task.
- Do not introduce Bevy as an experiment branch in source code during this task.
- Do not replace the current timeline, track, audio, video, or MIDI code during this task.

## Blocking Rule

No structural Bevy-based replacement work for timeline, tracks, audio, video, or MIDI may begin before this analysis is completed and its recommendation is explicitly accepted.

## Checklist

- [ ] Verify current Kira and CPAL usage from maintained source paths and current architecture documents.
- [ ] Verify current WebAssembly audio and playback constraints relevant to Kira and CPAL.
- [ ] Evaluate Bevy as an application/runtime engine, including idle behavior and energy implications.
- [ ] Evaluate Bevy/WebAssembly feasibility for audio, video, timeline, and track replacement.
- [ ] Evaluate Bevy plus midir feasibility for MIDI input, routing, MIDI tracks, and grid editor requirements.
- [ ] Produce a decision document with recommendation, risks, blockers, and migration options.
