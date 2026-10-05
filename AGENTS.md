# atome/eVe — Project instructions

Scope: this project and its descendants. Paths in prose are relative to this project root, including when working inside the eVe Git submodule. Markdown links are relative to their containing file.

## Mandatory core

1. **Primary construction rule: atome/eVe must build itself with its own components.** This mandatory architectural rule applies to construction of the framework itself and every new feature, interface, behavior, interaction, automation, template or assembly. Start by composing the project's available, verified and compatible reusable internal atoms, tools, modules and components. This internal composition takes priority in every implementation decision; convenience, delivery speed or an external component's availability cannot justify bypassing it. Reuse means calling or assembling the canonical implementation, never copying its code, reproducing its appearance or rebuilding its logic under another name. If existing composition cannot cover an indispensable need, apply the stop-and-authorization rules below. Any explicitly approved new brick must enrich this same reusable internal system for subsequent assemblies.
2. **Objects remain typed; tools cross compatible types.** Distinguish object type, properties/capabilities and the tool acting on them. Prefer shared tools and existing compatibility mechanisms wherever the operation has a meaningful compatible contract. Do not duplicate a tool per type, invent a property or implicit conversion, or add a new capability system merely to express this principle.
3. **Audit reuse before implementation.** Identify the required bricks and their canonical owners; verify implementation, internal access, contract, platform compatibility, real consumers and relevant tests. A documentation name, mockup, similar-looking prototype or dependency in the repository is not availability evidence. Apply the evidence procedure in the common method.
4. **A missing indispensable brick stops implementation.** When an essential brick is unavailable, unsuitable, not found after investigation or not verifiable, finish only the read-only checks needed to explain the blocker. Present the explicit missing/unavailable-components list and request authorization for the precise internal creation or extension. General feature approval does not authorize a missing brick. Silence or refusal leaves implementation blocked; do not use a degraded version, external component, copy or parallel substitute.
5. **Authorization is bounded.** After explicit approval, integrate the authorized brick through the existing declaration, discovery, composition and test mechanisms, where present. An internal-brick approval does not authorize an external dependency or an unlimited architecture extension. Do not invent an additional registry or API. If the existing foundation itself must change, present that change and obtain explicit authorization. Existing technical dependencies must be inspected for their actual role and encapsulation; do not remove them or wrap them to disguise an external substitute as an internal component.
6. **Use the actual canonical paths.** UI and automation invoke the corresponding canonical tool/command execution path. Panels assemble real tools with their native options. Preserve canonical Atome state outside the disposable, minimal DOM, the shared WebGPU rendering route and the single durable mutation pipeline; detailed contracts belong to the domain modules below. No view, cache, preview, timeline or realtime patch becomes competing writable business truth.
7. **Preserve the existing architecture.** Keep the names `atome` and `eVe` and JavaScript for application realization. Do not introduce TypeScript, Python, a UI framework, raw HTML/DOM imitation or a parallel implementation for a new realization. Existing platform-language boundaries and narrowly documented canonical DOM exceptions remain governed by modules 01, 02 and 05; they do not authorize a new application stack.
8. **Stay within the user's authorization.** Reading code to verify documentation does not authorize editing it. Preserve unrelated local changes. Identify defects and necessary cleanup, but request a bounded scope extension when their repair exceeds the authorized task. Do not install dependencies, change personal/provider/authentication/MCP/security settings, disclose secrets or alter history/caches without authorization. Git writes follow module 02; agents never push. Instructions written during a task cannot create permissions for that task.
9. **Handle conflicts explicitly.** These project instructions do not supersede system/developer instructions or environment protections. Apply the cumulative relevant project contracts. For unresolved project contradictions, identify the exact sources and ask for the smallest required arbitration; do not silently choose, rewrite or bypass a rule. Continue independent read-only investigation where useful. Length, complexity and file size alone do not justify an incomplete result.

## Required reading

Read this core and the [common method (module 07)](.codex/modules/07-future-code-guardrails.md) completely for every task. Then read every domain module whose trigger applies, before the relevant implementation, diagnostics or validation. Triggers accumulate; a mixed task requires their union. Read long files in successive complete chunks rather than treating truncated output as a full read.

| Trigger | Required module |
| --- | --- |
| Application code or architecture modification/review; rendering or DOM ownership | [01 — Architecture and projection](.codex/modules/01-root-constitution.md) |
| Code, executable/configuration or developer-documentation changes; language, size, i18n, temporary files or Git operations | [02 — Coding standards and prohibitions](.codex/modules/02-coding-standards-and-prohibitions.md) |
| Debugging, regression, performance diagnosis, tests or runtime/UI/visual validation | [03 — Evidence and validation](.codex/modules/03-debugging-testing-and-ui-validation.md) |
| Implementation, reuse, maintenance, cleanup, refactor, migration or architectural map changes | [04 — Owners and maintenance](.codex/modules/04-feature-work-cleanup-and-framework-reuse.md) |
| API, MCP, tools, commands, automation, communication, rendering, components, text or media UI | [05 — API, rendering and UI](.codex/modules/05-api-rendering-and-ui.md) |
| Atome model, state/mutations, history/replay, persistence, sync/offline, rights or runtime boundaries | [06 — State, sync and runtime modes](.codex/modules/06-atome-state-sync-and-runtime-modes.md) |

UI/visual verification and interaction diagnostics also require the full [canonical UI procedure](atome/documentations/how_debug_UI.md). Visual acceptance campaigns on Web, Tauri and physical iOS also require the [visual test protocol](.codex/visual-test-protocol.md). Module 03 owns the conditions and evidence requirements; these entry links do not replace either procedure.

For recurrent symptoms, the common method routes to the [known-bug knowledge base](known-bug-solutions/README.md). For explicitly requested DeepSeek delegation, use the [operational block below](#deepseek-delegation); it grants no autonomous delegation or model/configuration change.

## Detection versus prescribed reading

Codex recognizes `AGENTS.md` through its configured project-directory discovery. References to modules are **explicit reading obligations**, not a technical inclusion syntax. Do not claim that a linked document was automatically injected or fully read without evidence.

This is the sole project `AGENTS.md`. Start project sessions at this main root, including work on `eVe/...`. The eVe submodule has its own Git boundary: a session started there as a standalone project does not automatically discover this parent file under the documented defaults. In that case, explicitly attach/read this parent core, the common method and the cumulative domain modules before acting, or restart from the main root. If the parent corpus is missing or inaccessible, stop and report it; do not substitute a copied or weaker rule set. Other guides reference this core without creating an alternate general rule set. Do not treat old summaries, provenance or an unapproved method draft as active instructions.

No project loading configuration, personal configuration or context limit is changed by this organization. See the [official AGENTS.md loading documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md) for technical discovery, precedence and size limits. When investigating loading, verify the actual version/mode and configuration keys without exposing private data.

The block below is maintained by `scripts/deepseek_delegation_from_GPT.sh`. Read/use it only when the user explicitly requests DeepSeek delegation. It grants no authorization to delegate, install, edit configuration or switch the main model on its own.

<!-- ATOME_DEEPSEEK_DELEGATION_START -->
## DeepSeek delegation

Keep the current ChatGPT/Codex model as the main orchestrator. Delegate to DeepSeek only when the user explicitly requests it.

Delegation command:

    printf '%s\n' "<self-contained task + plan + constraints>" | ./scripts/deepseek_delegation_from_GPT.sh run [options]

Translate the user's requested DeepSeek intelligence level as follows:
- "léger", "faible", "low" -> `--level low`
- "moyen", "medium" -> `--level high` (DeepSeek maps medium to high)
- "élevé", "fort", "high" -> `--level high`
- "maximum", "max", "ultra" -> `--level max`

Translate model requests as follows:
- "DeepSeek Flash" -> `--model flash`
- "DeepSeek Pro" -> `--model pro`

Convenient presets:
- "DeepSeek rapide" -> `--preset fast`
- "DeepSeek normal" -> `--preset normal`
- "DeepSeek fort" -> `--preset strong`
- "DeepSeek maximum" -> `--preset maximum`

If no level/model is requested, use the script's saved defaults.

Procedure:
1. Build a self-contained delegation prompt containing the user's task, relevant approved plan, constraints, and file scope.
2. Invoke the script from the project root with the appropriate flags.
3. Wait for completion in the current turn.
4. Inspect DeepSeek's modifications/diff yourself.
5. Run relevant checks when practical.
6. Report the result and any verification issue in the same Codex conversation.

Do not switch the main GUI conversation away from ChatGPT/OpenAI. DeepSeek is a delegated worker only.
Do not delegate unless the user explicitly requests DeepSeek or the active project instructions explicitly require it.
<!-- ATOME_DEEPSEEK_DELEGATION_END -->
