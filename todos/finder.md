# Finder (Advanced Search) – Atomes + Tools

This document specifies an **advanced search system** (“Finder”) to locate **Atomes** and **tools** using structured criteria, heuristics/indices, and an optional **AI search mode** via an MCP connector.

This spec is intentionally designed to align with the existing high-level goals in `documentations/Adole finder engine.md` (scope + permissions + unified search entry point) while adding:

- a concrete filter/query model (operators, sorting, pagination)
- property-level filtering (e.g. `width > 220`, `color == red`)
- share/permission-aware filtering (e.g. “shared with user X”)
- an AI-assisted query mode that translates natural language into the structured query model

---

## 1) Goals

- Find Atomes quickly using **multi-criteria filters**.
- Support both **exact** search (structured filters) and **approximate** search (heuristics + ranking).
- Guarantee **permission-aware results** (never leak private data).
- Provide a clear path to add an AI search mode without changing the core query model.

Non-goals (v1):

- Building a full UI/UX spec.
- Cross-tenant “global private” search.
- Reinventing storage: Finder should query the existing database and/or existing list/get endpoints.

---

## 2) What is searchable

### 2.1 Entities

Finder must support at least these entity kinds:

- `atome`
- `project`
- `user` (public profiles only for global scope)
- `machine` (public machines only for global scope)
- `tool`

Where:

- “Atome” refers to stored objects with an `id`, `type`, and `particles`.
- “Tool” refers to an executable capability exposed by the platform (examples: Squirrel APIs, components, MCP tools, internal commands).

### 2.2 Atome fields

Finder must support filtering on:

- Core identifiers: `id`, `type`, `project_id`, owner/user id
- Particles: any key in `particles` (examples: `color`, `width`, `height`, `shared_with`, `tags`, `created_at`, `updated_at`)

### 2.3 Tool fields

Finder must support filtering on:

- `tool_id` / name
- `category` (e.g. calendar, sharing, audio, database, ai)
- `capabilities` (structured tags)
- `risk_level` (LOW/MEDIUM/HIGH/CRITICAL)

Note: There are existing patterns for tool metadata in the codebase (`src/squirrel/ai/default_tools.js`, `src/squirrel/ai/agent_gateway.js`). Finder should reuse those fields rather than introducing new ones.

---

## 3) Scopes (permission-aware)

Finder must support the scope selection described in `documentations/Adole finder engine.md`:

- `personal` (current user)
- `project` (current project)
- `atome` (within a specific atome / deep inspection)
- `public` (public entities only)

Rules:

- Private items must only appear for authorized users.
- Permissions are enforced at query time.
- No result should ever expose hidden fields that the caller is not allowed to read.

---

## 4) Query model (structured)

Finder uses a **single structured query object**. This object is the stable core that both the UI and the AI mode target.

### 4.1 Query shape

```jsonc
{
  "entity": "atome|tool|project|user|machine",
  "scope": {
    "kind": "personal|project|atome|public",
    "projectId": "optional",
    "atomeId": "optional"
  },
  "where": {
    "and": [
      { "path": "type", "op": "eq", "value": "shape" },
      { "path": "particles.width", "op": "gt", "value": 220 },
      { "path": "particles.color", "op": "eq", "value": "red" }
    ]
  },
  "text": {
    "query": "optional free text",
    "paths": ["id", "particles.title", "particles.description"]
  },
  "sort": [
    { "path": "particles.updated_at", "dir": "desc" }
  ],
  "page": {
    "limit": 50,
    "cursor": "opaque-or-null"
  },
  "include": {
    "particles": true,
    "shares": false
  }
}
```

### 4.2 Path semantics

- `path` is a dot-path into a normalized document:
  - `id`, `type`, `project_id`, `owner_id` (or equivalent)
  - `particles.<key>` for atome properties
- The query engine must reject unknown paths unless explicitly configured.

### 4.3 Operators

Minimum operator set:

- `eq`, `neq`
- `gt`, `gte`, `lt`, `lte` (numeric/date)
- `in`, `not_in`
- `contains` (substring), `starts_with`
- `exists` (field present)

Logical combinators:

- `and`, `or`, `not`

### 4.4 Examples

Find all atomes with the same property:

- “all red atomes”

```jsonc
{
  "entity": "atome",
  "scope": { "kind": "project" },
  "where": { "and": [ { "path": "particles.color", "op": "eq", "value": "red" } ] },
  "page": { "limit": 50 }
}
```

- “all atomes with width > 220”

```jsonc
{
  "entity": "atome",
  "scope": { "kind": "project" },
  "where": { "and": [ { "path": "particles.width", "op": "gt", "value": 220 } ] },
  "page": { "limit": 50 }
}
```

- “all atomes shared with user +33600000000”

This requires a canonical share representation (see section 6).

```jsonc
{
  "entity": "atome",
  "scope": { "kind": "project" },
  "where": {
    "and": [
      { "path": "shares.targets", "op": "contains", "value": "+33600000000" }
    ]
  },
  "page": { "limit": 50 }
}
```

---

## 5) Output model

### 5.1 Response shape

```jsonc
{
  "ok": true,
  "items": [
    {
      "entity": "atome",
      "id": "...",
      "type": "...",
      "projectId": "...",
      "score": 0.87,
      "summary": "optional short summary",
      "particles": { "optional": true }
    }
  ],
  "page": {
    "nextCursor": "opaque-or-null"
  }
}
```

### 5.2 Ranking

- Structured filters are deterministic.
- Free-text search produces a relevance `score`.
- AI mode can also provide a `score_explanation` for debugging (optional).

---

## 6) Shares / permissions filtering

Finder must be able to answer:

- “items I own”
- “items shared with me”
- “items shared with user X” (when the caller is authorized)

To do this reliably, Finder needs a canonical share index. Two acceptable approaches:

1) **Join-based**: query the sharing table/collection directly (preferred).
2) **Denormalized particles**: store share metadata in particles (acceptable but must stay in sync).

Minimum normalized share metadata:

- `shares.targets`: array of user identifiers (phone/user id)
- `shares.permissions`: `{ read, alter, delete, create }`
- `shares.share_type`: `linked|copy|...`
- `shares.updated_at`

Security requirement:

- If the caller lacks permission to see share data, Finder must filter by shares internally but not return share metadata in results.

---

## 7) Indices and performance

### 7.1 Why indices are needed

Filters like `particles.width > 220` and `particles.color == 'red'` must not require scanning every atome when the dataset is large.

### 7.2 Minimal index strategy (v1)

- Index by:
  - `type`, `project_id`, `owner_id`
  - `created_at`, `updated_at`
  - high-cardinality text fields for full-text search (title/description)
- “Hot particles” index list (config-driven):
  - `particles.color`
  - `particles.width`
  - `particles.height`
  - `particles.tags`

### 7.3 Optional advanced indexing (v2)

- Numeric range indexing for common numeric particles.
- Vector index for semantic search (AI mode) if needed.

---

## 8) AI search mode (MCP connector)

### 8.1 Principle

AI search mode does not replace the structured query model.

Instead, it converts a natural language prompt into:

- a structured Finder query (section 4)
- plus optional ranking hints

### 8.2 Suggested tools

Expose two high-level tools:

- `finder.search(queryObject)`
- `finder.ai_search(prompt, context)`

Where:

- `finder.search(...)` is deterministic and validates the schema.
- `finder.ai_search(...)` calls an MCP connector (LLM) to propose a query object.

### 8.3 AI safety requirements

- AI output must be treated as untrusted input.
- Always validate:
  - entity type
  - allowed paths
  - operator set
  - scope restrictions
  - pagination limits
- Do not execute destructive operations in search tools.

### 8.4 AI input/output shape

Input:

```jsonc
{
  "prompt": "Find all red atomes wider than 220px shared with Jean",
  "scope": { "kind": "project", "projectId": "..." },
  "constraints": {
    "maxLimit": 50,
    "allowedEntities": ["atome", "tool"],
    "allowedPaths": ["id", "type", "project_id", "particles.*", "shares.*"]
  }
}
```

Output (proposal):

```jsonc
{
  "query": { "...structured query..." },
  "human_summary": "Searching project atomes where color=red, width>220, shared with Jean",
  "confidence": 0.78,
  "warnings": ["Ambiguous user name: Jean"]
}
```

---

## 9) Finder for tools (capability search)

Examples:

- “Find all tools that can record audio”
- “Find high-risk tools”
- “Find MCP tools related to calendar scheduling”

This implies a registry that lists tools with metadata:

- `tool_id`, `name`, `category`
- `capabilities` (tags)
- `risk_level`
- `inputs_schema` / `outputs_schema` (optional)

Finder must treat tool results similarly to atomes:

- supports structured filters
- supports free-text
- supports AI search mode

---

## 10) Acceptance criteria (v1)

- Can filter atomes by a particle equality (e.g. `color == red`).
- Can filter atomes by a numeric particle comparison (e.g. `width > 220`).
- Can filter atomes by “shared with user” (permission-safe).
- Can search tools by category/capabilities/risk_level.
- AI search mode can translate a prompt into a structured query and returns a safe validated result.

---

## 11) Implementation notes (non-binding)

- Prefer implementing Finder as a single backend entry point that works in both Fastify (remote) and Tauri (local) modes.
- Keep the query schema stable; the UI and the AI connector should not depend on storage internals.
- Avoid implicit fallbacks: invalid queries must return explicit errors.
