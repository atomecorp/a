# Feature Work, Cleanup And Framework Reuse

Read this module for implementation, reuse, cleanup, refactoring, migration, or maintenance. The [root instructions](../../AGENTS.md) own the composition and explicit missing-component authorization rules. The [common method](07-future-code-guardrails.md) owns the reuse audit, status classifications, implementation gate, blockers, and reporting. This module supplies concrete owners, cleanup obligations, and map maintenance.

## Canonical component owners

These are named single owners, not permission to create an equivalent implementation. Inspect the owner's current contract and actual availability before use. Source existence alone does not prove runtime mounting or compatibility.

| Responsibility | Single owner, relative to the main repository root |
| --- | --- |
| Inline text editing: session, caret, selection, commit | `eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js` |
| Text field node: paint, focus, alignment | `eVe/intuition/runtime/bevy_panel/bevy_panel_editable_text.js` |
| Text geometry, word and line ranges | `eVe/domains/rendering/text_editing_layout.js` |
| Hidden text / IME service | `eVe/domains/rendering/hidden_text_service_runtime.js` |
| List row, hierarchy, selection, drag | `eVe/intuition/runtime/bevy_panel/bevy_panel_selectable_list.js` |
| Virtualized scrolling window | `eVe/intuition/runtime/bevy_panel/bevy_panel_virtual_window.js` |
| Table column geometry | `atome/src/squirrel/components/table_contract.js` |
| Sortable column header | `eVe/intuition/runtime/bevy_panel/bevy_panel_sortable_header.js` |
| Media card and tile | `eVe/intuition/runtime/bevy_panel/bevy_panel_media_card.js` |
| Panel shell, footer, scroll area | `eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js` |
| Empty / loading / error state | `eVe/intuition/runtime/bevy_panel/bevy_panel_state.js` |
| Visual tokens | `EVE_PANEL_SKIN_TOKENS` in `eVe/elements/skin/panel_skin.js` |
| Project name write | `updateProjectName` in `eVe/intuition/matrix/core/project_data.js` |

`npm run check:component-reuse-guardrails` enforces this ownership and is included in `check:m0`.

- A compatible consumer may use the verified existing contract within the authorized task. Writing a second owner is forbidden.
- If the contract cannot serve the need, use the root missing-component gate. An additive parameter is a proposal requiring bounded authorization, not an automatic remedy; preserve existing behavior by default when such an extension is authorized.
- Do not create files such as `*_editing.js` or `*_virtual_window.js` that announce a responsibility already owned; the guardrail rejects duplicated ownership.
- Surface-specific labels, injections, or panel differences do not justify a copy.
- Converge discovered copies to the owner when authorized and verifiable; otherwise report the prerequisite and bounded migration proposal before feature growth.

The guardrail allowlist records remaining copies. It may shrink and must never grow. Remove an entry only after validated convergence; adding a new entry or leaving parallel implementations does not satisfy the rule.

## Legacy cleanup and dependency verification

For any task, analyze legacy files, modules, paths, adapters, wrappers, bypasses, or obsolete implementations on the relevant controlling path as architectural liabilities. Do not ignore them because the original request emphasized another surface, preserve them by habit, or defer them merely because they are large or central.

The target is safe removal through the canonical owner, rather than coexistence. Within the authorized scope, perform the necessary migration, call-site and dependency cleanup, ownership transfer, structural refactor, and validation. If completion requires broader scope or an unavailable internal component, report evidence and a bounded proposal through the common method; do not expand implementation automatically or claim the unresolved prerequisite is repaired.

Before deleting or replacing a legacy file, verify every import, runtime reference, dynamic loading path, test, synchronization dependency, generated output, and map/documentation contract depending on it, including rendering, API/MCP, history and replay dependencies. Run the narrowest relevant executable checks after removal, widening as needed to prove no regression.

Forbidden: deletion without dependency proof, dormant legacy backups in production, compatibility copies, fallback safety paths, historical duplicates, and parallel old/new implementations that can safely converge. An evidence-backed blocker must explain any legacy surface that remains in the controlling path.

## Architectural contracts and maps

Authoritative contracts live under `atome/documentations/`, `eVe/documentations/`, and `maps/`. Inspect applicable contracts and relevant maps, then verify the actual implementation before code changes. Maps and historical graphs guide inspection; they are not proof of availability or runtime behavior.

Update relevant maps in the same authorized task when source structure, files, module placement, ownership, code/API surfaces, runtime exposure, design tokens, JavaScript-generated styling, visual factories, product design behavior, lifecycle, or dependency boundaries change:

| Map | Responsibility |
| --- | --- |
| [CODEMAP](../../maps/CODEMAP.md) | Source structure, owners, reusable modules, entry points, and major responsibilities. |
| [API_MAP](../../maps/API_MAP.md) | API families, exposure, public/internal surfaces, and open/closed ownership. |
| [DESIGN_MAP](../../maps/DESIGN_MAP.md) | JavaScript design, tokens, presets, factories, injected styles, assets, and CSS exceptions. |
| [ARCHITECTURE_MAP](../../maps/ARCHITECTURE_MAP.md) | Cross-layer architecture, dependency direction, lifecycle, and open/closed boundaries. |

Creating or moving an architectural surface while leaving its maps stale is forbidden. A documentation-only instruction refactor that changes no application architecture does not require inventing a framework map change; explain the actual impact in the common report.

## Factorization and capacity recovery

Apply the root composition rule, the common reuse audit, and [module 02's simplicity gate](02-coding-standards-and-prohibitions.md). Search thoroughly before proposing any file, API, component, helper, adapter, service, utility, token, style generator, visual factory, runtime surface, or documentation-driven architectural contract.

Within authorization:

- connect and compose verified existing owners rather than recreating available functionality;
- factorize similar code into the canonical owner instead of adding a version, isolated implementation, wrapper, fallback, or redundant adapter;
- restore a single source of truth for touched responsibility, state, configuration, rendering, and business rules;
- simplify redundant branches, conditions, aliases, conversions, indirection, feature flags, configuration, and unused imports, exports, dependencies, comments, or documentation claims;
- remove obsolete, dead, redundant, duplicated, transitional, and experimental code when dependency checks prove removal safe;
- verify whether legacy `MTrax` naming, identifiers, labels, comments, modules, or references for Molecule-owned behavior can migrate coherently, and rename or remove them when safe and verifiable;
- release resources, subscriptions, timers, listeners, caches, workers, retained media, and GPU objects at their explicit owner and lifecycle boundary;
- keep persistent regression tests under `tests/`, and remove product-injected tests, temporary debug code, probes, traces, and logs according to [module 03](03-debugging-testing-and-ui-validation.md).

Do not preserve dead code as a backup, example, dormant option, or historical copy. Use version control and documentary evidence for history. Do not finalize a touched ownership path with competing sources of truth or unresolved prerequisites disguised as a completed change.

The pre-edit gate in the common method must identify inspected files, reusable contracts, the canonical owner, proposed reuse or authorized extension, legacy/Molecule implications, complexity and capacity impact, validations, and map impact. If architectural ownership remains uncertain, continue read-only inspection or stop with the precise blocker; do not guess.
