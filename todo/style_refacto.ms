Style Reduction And Visual System Refactor Prompt

Mission

Reduce, simplify, optimize, and factorize as aggressively as possible the style system used by Atomes, tools, panels, and shared UI surfaces across the framework. The goal is not a cosmetic refactor. The goal is a drastic code reduction, a strict consolidation of visual ownership, and the systematic deletion of useless, duplicated, dead, or local style definitions.

You must treat style reduction as a deletion-first task, not as a reorganization task.

Primary Objective

Build a full style map of the framework, identify what is already centralized, identify all duplicated or scattered style logic, and collapse the system into the smallest possible number of reusable, modular, transverse visual contracts that can later support theme creation.

Hard Outcome Requirement

This prompt is not satisfied by analysis alone.
This prompt is only satisfied if the work produces concrete deletions, measurable reduction, and an explicit proof that dead, orphan, duplicated, or useless style code was actually removed.

The assistant executing this task must behave as a reducer, not as an archivist.

Critical Strategy

Do not start by adding a new style layer.
Do not start by moving files around.
Do not preserve legacy style islands by default.
Do not replace deleted duplication with equivalent new duplication.

Keep the existing central token and visual-owner layers when they are already valid owners.
Delete local style islands family by family.
Only regroup surviving style owners after aggressive deletion and consolidation.

The assistant must prefer destroying redundant style code over preserving local feature convenience.
If a local style block exists only because a previous implementation drifted away from a valid shared owner, the local block must be deleted and the consumer must be reconnected to the shared owner.

This task must explicitly challenge whether some style families should be deleted almost entirely and rebuilt progressively from the valid shared owners, instead of being endlessly refactored in place.

Mandatory Architectural Constraints

Respect existing Atome and eVe rules.
No static product CSS source of truth.
No parallel CSS layer outside the approved JavaScript-driven style system.
No HTML or CSS file creation.
No backtick characters anywhere in produced content.
No fallback styling systems.
No local feature styling when an owner already exists.
No new visual token system if one already covers the need.
No direct DOM styling islands that bypass the approved token and visual-factory owners unless the case is explicitly justified as a temporary migration boundary.
No keeping dead style code for safety.
No commenting out dead style code instead of deleting it.
No migration note used as an excuse to keep unused style declarations alive.
No partial cleanup that leaves the old and new owners both active.
No soft recommendation language for dead-style cleanup. Dead styles must be removed.

Mandatory Deletion Rule

If a style declaration, token, preset, helper, generated rule, compatibility class, local visual wrapper, or inline style object is identified as dead, duplicated, obsolete, non-authoritative, or reducible into an existing shared owner, it must be deleted in the same execution wave unless a precise blocker is proven.

Accepted blocker types are extremely limited:

Required runtime compatibility still actively consumed by verified production paths
Verified behavior breakage with no same-task replacement path
Cross-module migration dependency that is already scheduled in the immediately following phase

Any blocker must name the exact file, consumer, reason, and deletion follow-up phase.

Known Existing Owners That Must Be Audited First

maps/DESIGN_MAP.md
eVe/elements/system_ui_tokens.js
eVe/elements/eVe_look.js
eVe/elements/design/panel_chrome_tokens.js
eVe/intuition/tools/visual/tool_visual_tokens.js
eVe/intuition/panels/visual/panel_visual_tokens.js
eVe/intuition/components/visual/component_visual_tokens.js
atome/src/squirrel/spark.js
atome/src/squirrel/components/button_builder.js
atome/src/squirrel/components/slider_builder.js
atome/src/squirrel/components/tool_slider_builder.js
atome/src/squirrel/components/input_builder.js

Audit Scope

You must inspect styles coming from:

1. Shared tokens and root variables
2. Shared presets and generated base style rules
3. Tool visual contracts
4. Panel visual contracts
5. Component visual contracts
6. Atome Squirrel component builders
7. Local inline style objects in feature modules
8. Generated style tags and runtime style injection
9. Legacy style classes kept only for compatibility
10. Style declarations that are duplicated across Atome, eVe, tools, panels, matrix, editors, menus, and media surfaces

Required Deliverables

1. Framework style state report

Produce a precise design-system audit of the current framework state.
Identify what is already centralized.
Identify what is pretending to be centralized but is bypassed in practice.
Identify the true current style owners.
Identify style responsibilities that are duplicated across multiple layers.

2. Full style map

Build a clear map of style ownership with at least these categories:

Shared root tokens
Theme variables
Base presets
Panel chrome
Tool visuals
Atome visuals
Input and control visuals
Matrix and menu visuals
Feature-local exceptions
Legacy compatibility layers
Dead or orphan style paths

For each category, list:

Current owner
Files involved
Consumers
Duplications
Whether the owner should survive, shrink, merge, or be deleted

3. Dead and useless style audit

Identify all unused, obsolete, redundant, conflicting, or low-value style definitions.
This must include:

Unused variables
Unused presets
Unused generated rules
Unused compatibility classes
Duplicated inline style objects
Repeated shadows, radii, color values, paddings, and dimensions that should become shared tokens or be deleted
Feature-local declarations that merely restate an existing shared contract

These useless styles must be deleted completely from the code, not documented as future work unless deletion is technically blocked.

Dead Style Enforcement

This section is mandatory and must be executed literally.

The assistant must:

Prove whether each suspect style artifact is live, duplicated, compatibility-only, or dead
Delete dead artifacts immediately
Delete duplicated artifacts immediately when an owner already exists
Merge surviving live artifacts into the smallest valid owner surface
Report exact deletions by file and category
Report blockers only when deletion is truly impossible in the same phase

It is forbidden to keep unused style code because it might be useful later.
It is forbidden to preserve duplicate style paths for comfort.
It is forbidden to leave orphan style declarations in place after centralization.

4. Reduction plan

Define a strict deletion and consolidation plan ordered by highest code-reduction impact.

The plan must prioritize:

Highest duplication density first
Lowest risk deletions with highest line reduction first
Families that can be collapsed into an existing owner without redesign risk
Families that should be reset locally and rebuilt from shared owners

This reduction plan must be executable, not conceptual.
Each phase must end with actual deletions and a reduced code surface.

Required execution phases:

Phase 0: Baseline measurement
Count style owners, token sources, generated style modules, local inline-style islands, repeated literals, compatibility-only selectors, and known feature-local visual wrappers.

Phase 1: Owner confirmation
Confirm the small set of valid style owners that are allowed to survive.
Everything else becomes a deletion or merge candidate.

Phase 2: Dead-style purge
Delete unused variables, presets, dead selectors, dead generated rules, dead helper functions, dead compatibility classes, and unreachable local style objects.

Phase 3: High-duplication collapse
Collapse repeated shadows, radii, panel chrome rules, tool surface rules, input rules, spacing values, and common state colors into the surviving owners.
Delete all replaced local declarations in the same phase.

Phase 4: Feature-island demolition
Identify modules that still own local styling without justification.
Reconnect them to shared owners and delete the local style islands.

Phase 5: Theme-ready minimization
Reduce the surviving token set to the minimum semantic surface needed for theming.
Delete decorative or one-off token drift.

Phase 6: Verification and anti-regression proof
Show that code volume, owner count, token count, and duplication count have all been reduced.

5. Cross-framework naming system

Define a clear, transverse, modular naming system for visual tokens and style contracts.

The naming system must:

Minimize the number of tokens
Separate semantic role from feature context
Work across Atomes, tools, panels, and shared controls
Support theming later without exploding token count
Avoid one-off feature names when a semantic role already exists

The nomenclature must explicitly normalize:

Shadows
Radii
Tints and surfaces
Border strengths
Spacing and padding scales
Input heights
Tool sizes
Panel chrome metrics
Text emphasis levels
State colors

The nomenclature must also explicitly reject:

Feature-specific token names when a semantic token exists
Visual-token aliases that only rename the same value in another module
Separate radius systems for panels, tools, inputs, and atoms unless functionally required
Separate shadow vocabularies that differ only by tiny numeric drift
Ad hoc color names that encode implementation history instead of semantic purpose

6. Strategic challenge

At the end, you must explicitly challenge the current direction and answer these two questions:

Would it be better to brutally delete some of the current scattered style systems and progressively reintroduce only the minimum shared modular contracts?

If not, why exactly, and which surviving style owners justify preservation?

Also answer this:

If scattered styles are not deleted immediately, would regrouping them into a single analysis folder create real reduction value, or would that just centralize clutter without reducing code?

The answer must be critical, explicit, and justified by concrete duplication evidence.

Required hard challenge

The assistant must not assume that preserving the current visual spread is safer.
It must explicitly test the stronger hypothesis that entire style families should be removed and rebuilt progressively from the surviving owners.
If the assistant rejects that stronger hypothesis, it must justify the rejection with concrete evidence, not caution language.

Execution Rules

Deletion first.
Each time you mutualize a style contract, delete the replaced local styles in the same task.
Do not leave parallel owners alive without an explicit temporary migration reason.
Do not create a new abstraction if an existing owner can absorb the responsibility.
Do not keep multiple shadow scales, radius scales, or tint systems when one shared scale can replace them.
Do not preserve feature-local visual identity if it is only accidental drift.
Do not widen theme surface area unless it reduces duplication.
Do not invent token families without proving repeated consumption.

Hard execution rules

Do not stop after auditing.
Do not stop after mapping.
Do not stop after proposing a naming system.
Do not produce a refactor plan that postpones all deletions.
Do not create a migration backlog in place of current deletion.
Do not mark dead styles as deprecated and keep them alive.
Do not leave no-op wrappers or pass-through token adapters alive after consolidation.
Do not preserve compatibility selectors that have no verified consumers.
Do not preserve repeated literals after introducing the shared token that replaces them.

Every execution wave must end with both of these:

Net deletion of style code
Explicit proof of what disappeared

If a phase does not delete code, the phase is incomplete.

Success Criteria

The result must show measurable reduction, not just cleaner wording.

Success means:

Fewer style owners
Fewer tokens
Fewer repeated literals
Fewer generated style islands
Fewer local inline style objects
Fewer compatibility-only selectors
Clearer ownership
Easier theming
Lower total style code volume

Success must be measured, not implied.

Minimum required metrics before and after execution:

Number of style-owner modules
Number of token definitions
Number of generated style-entry modules
Number of local inline-style islands
Number of compatibility-only style hooks
Count of repeated literal shadows
Count of repeated literal radii
Count of repeated literal surface colors
Approximate total lines dedicated to style logic

Target expectation

The assistant must aim for drastic reduction, not marginal cleanup.
If the result is a small percentage reduction, it must explain why larger deletion was blocked.
If no measurable reduction table is produced, the task is incomplete.

Required reduction scoreboard

Produce a compact before and after table showing:

Metric
Before
After
Delta
Reason for delta

At minimum, the assistant must report:

Deleted files or modules fully removed
Deleted token definitions
Deleted local style objects
Deleted compatibility selectors
Deleted repeated literals through consolidation

Required Output Format

Return a structured report with these sections in order:

Executive verdict
Current centralized foundations worth keeping
Current duplication and fragmentation map
Dead and useless style inventory
Deletion-first reduction plan
Executable phase plan with deletion checkpoints
Reduction scoreboard before and after
Transverse naming proposal
Theme readiness proposal with minimal token surface
Strategic challenge and final recommendation

The Dead and useless style inventory section must explicitly distinguish:

Deleted immediately
Merged then deleted
Blocked but scheduled for next deletion phase

The Executable phase plan section must list, for every phase:

Targets
Files or module families touched
Expected deletions
Validation proof

The Reduction scoreboard must be mandatory, numeric, and blunt.
No qualitative-only summary is acceptable.

Non-Negotiable Final Requirement

This is not a preservation mission.
This is not a documentation-only mission.
This is not a move-files-around mission.

Your job is to reduce style code drastically, delete what should not exist, keep only the valid shared owners, and force the framework toward a much smaller, modular, coherent visual system.

Final enforcement clause

If dead styles, orphan styles, duplicated owners, compatibility-only no-op style hooks, or unused token layers remain in place without a proven blocker, the task must be considered failed.