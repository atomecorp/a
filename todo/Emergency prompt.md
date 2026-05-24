# Emergency Prompt - Atome Structure And Storage Audit

Use this prompt as a strict audit request. Do not implement code while answering it.

```text
You are auditing the current Atome architecture, with priority on the Atome data model, database/storage structure, documentation, and runtime separation between data, logic, rendering, and actions.

Do not write code.
Do not refactor.
Do not propose quick fixes.
Do not define a new architecture yet.
Do not focus on Molecule, MTraX, thumbnails, posters, or preview bugs except as secondary symptoms of a deeper Atome architecture issue.

Primary objective:
Find out whether the project already defines a proper Atome architecture, where every atome is represented by a consistent structured model stored in database/storage, and where rendering, actions, UI, tools, and runtime sessions are projections or consumers of that model rather than being mixed into it.

Mandatory rules:
- Read `.codex/AGENTS.md` first and follow it strictly.
- Search documentation before judging the implementation.
- Search for any file named `AGENTS.md`, `Jones.md`, architecture map, codemap, design map, API map, schema document, persistence document, Atome model document, storage document, or database document.
- Use Git only for read-only inspection.
- Do not mutate Git state.
- If temporary probes are required, create them only under `temp/`.
- If producing an audit artifact, create it only after explicit request.

Core audit questions:
1. Is there an existing documented Atome architecture?
2. Is there an existing documented canonical Atome data structure?
3. Is there an existing documented database/storage schema for atomes?
4. Does `.codex/AGENTS.md` impose a rule about how atomes must be structured?
5. Do other docs impose a rule that all atomes must share one coherent structure?
6. Is the documented structure actually implemented?
7. Are all atomes persisted in the same shape, or are there many incompatible shapes?
8. Is there a clean separation between:
   - persisted Atome record;
   - runtime Atome model/state;
   - action/controller/event flow;
   - project/UI rendering;
   - editor/session-specific runtime state?
9. Does the DOM ever become the source of truth for Atome data?
10. Are UI-only or rendering-only fields persisted into the Atome model?
11. Is the current implementation closer to a Model/View/Controller architecture, or is it structurally mixed?

Documentation search requirements:
Inspect and summarize all relevant documentation from:
- `.codex/AGENTS.md`
- all `AGENTS.md` files
- any `Jones.md` if present
- `maps/*.md`
- `atome/documentations/**`
- `eVe/documentations/**`
- `todo/**`
- `done/**`
- `Failed/file.md`
- `README.md`
- database/schema/migration documentation
- any file that mentions Atome structure, Atome model, particles, properties, state, commit, storage, persistence, schema, record, view, rendering, actions, events, or controllers.

For each document found:
- Provide the file path.
- Summarize what it says about Atome architecture.
- Identify whether it defines a mandatory rule or only a vague intention.
- Identify whether it defines a canonical Atome structure.
- Identify whether it defines storage/database shape.
- Identify whether code appears to follow or violate it.

Implementation audit requirements:
Inspect the current code paths that define, mutate, store, load, and render atomes. At minimum, inspect areas related to:
- Atome core APIs.
- Atome commit/event flow.
- Atome state/current-state management.
- Atome persistence adapters.
- Database schemas and migrations.
- Server/Fastify persistence routes.
- Tauri persistence/storage code.
- Local cache/local storage adapters.
- Project loading.
- Project atome rendering.
- Tool-generated atomes.
- Media atomes only as examples of whether the model remains consistent.
- Group/composite atomes only as examples of whether the model remains consistent.

Storage/database audit requirements:
Find every place where atomes are stored or retrieved, including:
- SQL schemas or migrations.
- state/current-state tables.
- JSON stores.
- local cache.
- Tauri-side storage.
- server routes.
- project atome list/load APIs.
- event logs or commit logs.

For each storage mechanism, answer:
- What exact Atome record shape is stored?
- Which fields are top-level?
- Which fields are inside `properties`, `particles`, `data`, or equivalent bags?
- Are fields typed or arbitrary?
- Is there a schema/version?
- Is the kind/type validated?
- Is there a single canonical identity field?
- Are owner/project/parent fields normalized?
- Are view/rendering fields mixed with domain data?
- Are action/session/UI fields persisted?
- Are there duplicated aliases for the same concept?
- Are there different shapes between Tauri, server, browser, local cache, and database?

Atome structure questions:
Answer these directly:
1. What is an Atome, structurally, in the current implementation?
2. What is the canonical persisted Atome shape, if any?
3. Where is this shape defined?
4. Where is this shape enforced?
5. Where is this shape bypassed?
6. What is the difference between an Atome record, Atome properties, Atome particles, Atome state, and Atome DOM?
7. Are `kind`, `type`, `media_type`, `visualType`, and similar fields consistently defined or confused?
8. Are atomes normalized or stored as loose property bags?
9. Are all atomes created through one canonical creation path?
10. Are all atomes updated through one canonical mutation path?
11. Are all atomes rendered through one canonical rendering projection?
12. Does the architecture allow the same persisted atome to have multiple independent views?
13. Does the architecture allow a virtual/non-rendered atome?
14. Does the architecture distinguish persisted data from transient runtime/editor/session state?

Model/View/Controller-style assessment:
Determine whether the system has clear equivalents of:
- Model: Atome persisted data and runtime state.
- View: Project rendering and visual representation.
- Controller/Actions: tools, gestures, commits, events.

For each layer:
- Identify owning files.
- Identify public APIs.
- Identify whether the boundary is clean.
- Identify where the boundary is violated.
- Identify whether the DOM is used as model.
- Identify whether controllers directly mutate views instead of mutating model state.
- Identify whether views persist data directly.

Risk audit:
List architectural risks by severity:
- P0: corrupts or loses Atome data, makes storage inconsistent, or blocks reliable architecture.
- P1: causes rendering/session bugs because data and view are coupled.
- P2: maintainability, duplicate aliases, unclear ownership, oversized files.
- P3: documentation or naming debt.

For each risk:
- Provide file path and line references.
- Explain the current behavior.
- Explain why it is architecturally risky.
- Identify whether documentation already forbids it.
- Identify the likely symptoms it causes.

Oversized and coupling hotspot audit:
Identify files that are too large or own too many responsibilities. For each:
- File path.
- Line count.
- Current responsibilities.
- Why it is too coupled.
- Whether `.codex/AGENTS.md` permits or forbids adding more logic there.
- What should be audited before any future change.

Required output format:

1. Executive Summary
   - State clearly whether the Atome architecture is clean, partially clean, or structurally mixed.
   - State whether a canonical Atome model exists.
   - State whether that model is documented.
   - State whether that model is enforced.
   - State whether database/storage is coherent.

2. Documentation Inventory
   - List every relevant document found.
   - Explain what each says.
   - Mark each as: canonical, partial, outdated, contradicted by code, or irrelevant.

3. Canonical Atome Model Assessment
   - Describe the documented model, if it exists.
   - Describe the implemented model.
   - Compare them.
   - State gaps and contradictions.

4. Storage And Database Shape
   - Describe every storage mechanism.
   - Show representative record shapes.
   - Identify inconsistencies and duplicated fields.

5. Creation, Mutation, Loading, Rendering Flow
   - Trace how an atome is created.
   - Trace how an atome is mutated.
   - Trace how an atome is stored.
   - Trace how an atome is loaded.
   - Trace how an atome is rendered.
   - Identify where data/view/action boundaries cross.

6. MVC Separation Assessment
   - Identify model files.
   - Identify view files.
   - Identify controller/action files.
   - Identify violations and mixed responsibilities.

7. Structural Risks
   - List risks by severity with exact file/line evidence.

8. Documentation Gaps
   - What is missing from `.codex/AGENTS.md`?
   - What is missing from maps?
   - What is missing from Atome/eVe docs?
   - What needs to be clarified before any rewrite?

9. Verification Gaps
   - What tests/probes would prove a clean Atome model?
   - What tests/probes would prove storage consistency?
   - What tests/probes would prove rendering is a projection of data and not source of truth?

10. Final Judgment
   - If the architecture is already defined and implemented, say so.
   - If it is defined but not implemented, say exactly where it diverges.
   - If it is not defined, say so clearly.
   - If it is structurally wrong, say so clearly.
   - Do not propose implementation yet. Recommend only the next audit/documentation step.

Tone:
Be direct, factual, and evidence-based. Do not soften architectural problems. Do not exaggerate. Every major claim must cite files and lines.
```

