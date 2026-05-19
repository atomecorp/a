# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Ace Step Integration In eVe

This document defines the architecture and product-integration task for integrating Ace Step into eVe.

This chantier must not start with code-first improvisation.

The first goal is to determine whether Ace Step belongs inside the existing eVe AI, runtime, MCP, editor, media, or tool architecture, and under which exact ownership and execution model it should exist.

## Purpose

Define a clean, maintainable, and architecturally coherent integration model for Ace Step in eVe.

The outcome must explain:

- what Ace Step is expected to do inside eVe;
- which user workflows it should support;
- whether it is a tool, an AI surface, a runtime service, an editor capability, or a mixed product surface that must be split;
- which existing APIs, MCP surfaces, runtime layers, or UI systems it must reuse;
- where it should live in the folder architecture once the Atome/eVe boundary is clarified.

## Non-negotiable rules

- Do not add Ace Step through an isolated feature island.
- Do not create a parallel AI stack for Ace Step.
- Do not create a second MCP model if the existing one can host it.
- Do not create direct runtime shortcuts that bypass the canonical eVe / Atome APIs.
- Do not decide the integration only from UI convenience.
- Do not implement before the integration model is documented and validated.

## Required analysis

Before implementation, the task must answer at minimum:

1. What exact product role Ace Step has inside eVe.
2. Whether Ace Step is user-facing UI, tool logic, AI orchestration, runtime service, content generation, or a combination of several responsibilities.
3. Which existing eVe AI files, MCP files, runtime APIs, and editor layers overlap with the intended Ace Step behavior.
4. Which parts can reuse existing architecture directly.
5. Which parts require extension points rather than duplicate systems.
6. Which runtime, server, storage, MCP, or cross-platform constraints apply.
7. How Ace Step must respect the Atome open / eVe closed architecture boundary.

## Required source files to inspect

- `todo/ai_voice/eVe_AI.md`
- `todo/ai_voice/AI_integration_problems_to_solve.md`
- `todo/ai_voice/Full_vocal_AI_integration.md`
- `todo/ai_voice/eVe_MCP_APIS_Tools.md`
- `todo/cleanup_architecture/eve_atome_master_cleanup_plan.md`
- `todo/execution_order.md`

Add more files as soon as real overlap is discovered.

## Required deliverables

- A short architectural summary of where Ace Step belongs in eVe.
- A dependency map listing what existing code must be reused.
- A boundary decision: UI, tool, API, MCP, runtime, server, storage, or mixed split.
- A proposed folder location aligned with the Atome/eVe architecture.
- A list of forbidden duplicate paths that must not be created.
- A phased implementation proposal only after the architecture is validated.

## Validation checklist

- Ace Step integration role is explicitly defined.
- Existing overlapping systems are identified.
- Reuse candidates are listed before any implementation starts.
- No parallel AI, MCP, or runtime system is proposed without architectural proof.
- Proposed location is consistent with the current Atome/eVe architecture rules.
- The integration plan is understandable without hidden assumptions.

## Definition of done

- Ace Step has a validated architectural home inside eVe.
- The integration model is documented.
- Reuse points and forbidden duplicate paths are explicit.
- A future implementation task can start from this document without reopening the whole architecture from scratch.
