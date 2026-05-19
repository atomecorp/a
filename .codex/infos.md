# AGENTS.md Coverage Summary

This summary is based on [.codex/AGENTS.md](AGENTS.md).

## Main Topics

| Topic | Status | Evidence |
|---|---|---|
| Mobile iOS | Explicitly present | [iOS MODE](AGENTS.md#L600) |
| Desktop Tauri / Axum | Explicitly present | [TAURI MODE](AGENTS.md#L581) |
| Web Browser / Fastify | Explicitly present | [WEB BROWSER MODE](AGENTS.md#L570) |
| Synchronization | Explicitly present | [OFFLINE AND SYNCHRONIZATION POLICY](AGENTS.md#L531) |
| Source of truth for synchronization | Explicitly present | [Fastify is the canonical source of truth for all user accounts and synchronized data](AGENTS.md#L534) |
| Internationalization | Explicitly present | [INTERNATIONALIZATION POLICY](AGENTS.md#L746) |
| Source of truth for internationalization | Not explicitly stated | The file requires [eveT()](AGENTS.md#L751) and the existing Atome/eVe internationalization system, but it does not define an i18n canonical source of truth in the same way it does for Fastify and synchronization |
| APIs | Explicitly present | [Every new feature MUST be exposed through a properly defined API](AGENTS.md#L355) |
| MCP | Explicitly present | [be MCP-compatible](AGENTS.md#L362) |
| "Everything is historized" | Strongly implicit | [Event logs are append-only](AGENTS.md#L510), [immutable history](AGENTS.md#L522), and [state derives from snapshots and deterministic replay](AGENTS.md#L512) |

## Other Important Contexts Covered

| Other important context | Status | Evidence |
|---|---|---|
| AUv3 | Explicitly present | [AUv3 MODE](AGENTS.md#L619) |
| FreeBSD Pure OS | Explicitly present | [PURE OS FREEBSD MODE](AGENTS.md#L638) |
| Realtime communication architecture | Explicitly present | [COMMUNICATION ARCHITECTURE](AGENTS.md#L382) |
| Command Bus | Explicitly present | [All effectful operations must pass through](AGENTS.md#L371) |
| WebGPU rendering pipeline | Explicitly present | [RENDERING PIPELINE](AGENTS.md#L398) |
| Squirrel-only UI policy | Explicitly present | [UI AND COMPONENT POLICY](AGENTS.md#L425) |
| Canonical Atome object model | Explicitly present | [ATOME MODEL POLICY](AGENTS.md#L475) |
| Sharing and ACL rules | Explicitly present | [SHARING AND ACL POLICY](AGENTS.md#L787) |
| Fallback rules | Explicitly present | [FALLBACK POLICY](AGENTS.md#L724) |
| Execution environment as an architecture constraint | Explicitly present | [FINAL OPERATIONAL RULE](AGENTS.md#L799) |

## Bottom Line

Yes, [.codex/AGENTS.md](AGENTS.md) clearly covers the requested topics: execution modes, synchronization, API and MCP policy, and the history model.

The only meaningful nuance is that a canonical source of truth is stated explicitly for synchronization data through Fastify, but not stated with the same wording for internationalization.