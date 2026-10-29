# Health bricks — Lot A audit (existing code vs the 45-brick specification)

Date: 2026-10-28. Source specification: `atome_eVe_briques_sante_transversales_specification_v1.md`
(15 Oct. 2026, user's Desktop, not in the repo). Scope: Lot A only (§9.1 of that spec: audit, no code).
Read-only: no source file was changed for this audit.

Method: every row below was checked in the code at the working tree of 2026-10-28 (owners, schemas, MCP
commands, tests). A doc mention, an i18n key or a catalogue name never counts as existence. Nothing was
executed: statuses describe code, not runtime acceptance. Native Swift/Kotlin/Rust were only grepped.

## 1. Verdict

- **Not done as specified.** The 45-brick library, its versioned manifest, typed context, rules referential and
  objective→brick composition do not exist. 12 of the 13 objectives run one generic programme with `bricks: []`.
- **Not a blank slate.** It succeeds the ATM-2017 programme (89 "specification bricks", Codex, 13–14 Oct.), whose
  socle and Nutrition slices were implemented: official objectives, effort/time budget, progressive collection with
  per-purpose permissions, shared activities and sessions, Nutrition v1 + consumption, then (Claude, 20–26 Oct.)
  Sport/training, the Sleep protocol and every objective's preparation cursus.
- **Integrable without redoing anything.** Every foundation the spec asks for has an existing owner to extend
  (registry, preferences, observations, health catalogue, activity links, sessions, time budget). The only
  non-additive change is a v1→v2 of the preference schema (needs a read-compatible migration).
- **Cannot be finished autonomously.** 13 bricks are S2 (clinical), several need new UI (charter rule 16: mockup
  first), and two catalogues with different IDs must be reconciled by the user (AGENTS rule 9).

Count: 4 EXISTANT, 21 PARTIEL, 20 ABSENT (details §3).

## 2. Lineage of the catalogues (A05)

| Catalogue | Where | IDs | State |
| --- | --- | --- | --- |
| 77 bricks | `todo/atome_chat_GPT_Archives/To sort/atome_Objectif_Codex.zip` → `atome/Objectif/Catalogue/Index_briques.md` | (older) | superseded |
| 89 bricks | `todo/atome_chat_GPT_Archives/To sort/atome_objectives_prompts.zip` → `objectives/pilotage/Catalogue_briques.md`, `Matrice_objectifs_briques.md`, `catalogue_briques.json` | `BR-COM/SOM/NUT/ACT/MEN/VIE/SUI/AGE/SYS/SOC/EST/CAR-nn` | audited 13 Oct. (`todo/audits/ATM-2017_P001_2026-10-13.md`), P001–P008 + P031 implemented |
| 45 bricks | the new spec | `BR-01..45` | this audit |

The spec says the 89 catalogue was "not found"; it is inside the zip above (never extracted in the repo).
The two ID schemes collide on the `BR-` prefix: one must become the alias of the other (decision D1).

89-only items (no 45 counterpart): `BR-COM-01..07` (start: intention, effort, time, consent — implemented as the
objective cursus), `BR-SYS-01..08` (orchestration, existing owners), `BR-SOC-01..05` (optional network),
`BR-CAR-01/05/06` (health notebook view, export/selective sharing, official connection), `BR-VIE-02` (leisure),
`BR-MEN-08` (safety plan with a professional). 45-only items: BR-14 digestion, BR-19 nap, BR-21 fatigue,
BR-33 anxiety, BR-43 hormonal/sexual, BR-45 sensory.

## 3. Matrix BR-01..45 (A02)

Paths: PPM = `eVe/domains/programs/project_program_model.js`, HC = `atome/src/squirrel/health/health_catalog.js`,
SRM = `eVe/domains/programs/sleep_routine_model.js`, TC = `atome/src/shared/training_catalog.js`,
BPR = `eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js`, PCC = `atome/src/shared/program_collection_contract.js`.

### 5A Medical socle

| BR | 89 alias | Status | Owner evidence | Missing |
| --- | --- | --- | --- | --- |
| 01 Contextual profile | COM-02, CAR-02 | PARTIEL | profile `bio.birth/weight/height` + `bio.biometrics` (`bevy_panel_home_view.js:15-46`, `profile_sharing.js:28`); weight/height asked in the cursus (`objective_preparation.js:41,85`); typed preferences with date/provenance/uncertain/review_after (PCC:2-13); per-purpose permission (PCC `PROGRAM_DATA_PERMISSION_SCHEMA`) | physiological situation, country; no `refused` state (preference status enum = `answered` only); no provenance/freshness on `bio.*`; no per-purpose projection |
| 02 History / risks | CAR-02 | ABSENT | only free-text `starting_state`, `OBJECTIVE_CAPACITY_VALUES` incl. `advice_needed` (PPM:25) | all |
| 03 Treatments / supplements | SUI-07, SUI-08 | ABSENT | — | all |
| 04 Symptoms / red flags | SUI-01, SUI-10 | ABSENT | `pain`/`guidance` goals are generic objectives | all |
| 05 Vitals | SUI-06, SUI-09, SYS-06 | EXISTANT (read) | HC heart rate, `hrv_sdnn` (iOS) / `hrv_rmssd` (Android) as distinct ids, respiratory rate, SpO2, BP, temperatures; method shown (`health_values.js:136`, `bevy_panel_health_detail_view.js:84`); tests `tests/eve/health_detail_panel.test.mjs`, `tests/probes/health_history.test.mjs` | manual entry; any interpretation (by design) |
| 06 Lab results | SUI-05, CAR-04 | ABSENT | only `blood_glucose` monitor | all |
| 07 Orientation to professionals | SUI-03, SUI-10, MEN-07 | ABSENT | contacts are generic | all |

### 5B Nutrition and metabolism

| BR | 89 alias | Status | Owner evidence | Missing |
| --- | --- | --- | --- | --- |
| 08 Nutrition [REG] | NUT-01/02/03/08 | PARTIEL (v1 complete) | `program_nutrition_contract.js`, `program_nutrition_model.js/_control.js/_presentation.js`; `nutrition_consume` (PPM:161,233); shopping link `shopping_list_model.js:33-60`; 5 collection questions (PPM:11); tests `tests/eve/program_nutrition.test.mjs` | contextual entries; `collectionQuestionKey` only yields `allergies` by default; no proposal engine |
| 09 Energy / trajectory | NUT-06 | PARTIEL (measures) | HC active/basal/total energy, BMR; MET estimate `eVe/domains/training/training_energy.js` | needs model; health history capped at 32 days (`health_history.js:9`) |
| 10 Macronutrients | NUT-04 | PARTIEL | Open Food Facts per 100 g (`server/ws_open_food_facts.js:69-72`), MCP `food.lookup/search`, `food_health_assessment.js` | no carbohydrates; portions not linked to products; no tests |
| 11 Micros / fibre / diversity | NUT-03, NUT-05 | ABSENT | fibre per 100 g only; `NUTRITION_FOOD_GROUPS` unused for diversity | all |
| 12 Hydration | NUT-07 | PARTIEL | `hydration` monitor (read), default target 1500 mL; declared water (§13, 28 Oct.) |  caffeine only as a sleep-routine slot |
| 13 Allergies | NUT-09 | PARTIEL | typed `allergies`/`intolerances` preferences + OFF allergen tags | nothing reads them to filter anything |
| 14 Digestion | — | ABSENT | — | all |
| 15 Weight / body composition | (SUI-06) | PARTIEL (read) | HC weight, height, body fat, lean mass, BMI, bone/water mass | profile `bio.weight` and health-store weight not reconciled; 32-day cap |

### 5C Sleep and recovery

| BR | 89 alias | Status | Owner evidence | Missing |
| --- | --- | --- | --- | --- |
| 16 Sleep journal | SOM-01 | PARTIEL | device sleep (HC, stages in `health_values.js:96-117`); declared observation vs sensor (`program_monitor_sources.js`); journal/monitor tabs (BPR:317-326) | structured diary; declaration is free text, not comparable |
| 17 Rhythm / light | SOM-02, SOM-03 | PARTIEL | wake time + hours → bedtime, `daylight` item (SRM:13-41) | regularity from device times |
| 18 Habits / environment | SOM-04, SOM-05 | PARTIEL | routine items coffee/dinner/pre_sleep/tea, static tips (SRM:36-58, `sleep_page.js:80-90`) | no record of noise/light/caffeine |
| 19 Nap [REG] | — | PARTIEL | brick (PPM:8), fixed 13:30/20 min (SRM:36), calendar + alarm (`program_routine_calendar.js`) | no payload, duration choice, wake alarm, tolerance |
| 20 Sleep disorders | SOM-06 | ABSENT | — | all (S2) |
| 21 Fatigue / recovery | (ACT-11) | PARTIEL (weak) | free-text declaration; session `note`; `cardiacRecovery` (`health_history.js:87`) | no scale |
| 22 Breathing / relaxation | MEN-01, MEN-02 | PARTIEL | action tool `relaxation` requiring a user-owned sound (`project_program_runtime.js:198-202`) | no bundled content, no breathing guide |

### 5D Movement and pain

| BR | 89 alias | Status | Owner evidence | Missing |
| --- | --- | --- | --- | --- |
| 23 Daily movement | ACT-01, ACT-12 | PARTIEL | HC steps/distances/stand/exercise minutes; default target 6000 steps | manual entry; sedentary breaks |
| 24 Endurance | ACT-02/04/05/06 | PARTIEL (strong) | TC cardio levels + zones; `training_progression.js:56` HR zones; `vo2_max`; WHO week plan | perceived effort (RPE) |
| 25 Strength | ACT-03 | EXISTANT | `sport` brick; TC levels/custom/tempo; `validateTrainingActivity` (PPM:187-214); MCP `training.*` (`atome/src/squirrel/training/contracts.js`); `dashboard_training_*.js`; HealthKit write (`health_workout.js`) | no tests under `tests/` |
| 26 Mobility | ACT-07, ACT-08 | ABSENT | `TRAINING_KINDS` = core/strength/cardio | all |
| 27 Balance / falls | ACT-09, AGE-06 | ABSENT | only `walking_speed` | all |
| 28 Pain | SUI-02 | ABSENT | `pain` goal = generic session | all (S2) |
| 29 Load without double count | ACT-11 | PARTIEL | `buildTimeBudgetPreview` dedup by event (PPM:257-315), one execution shared by several objectives (`projectActivityView`, `program_activity_link`); tests `project_program.test.mjs`, `objective_time_budget_contract.test.mjs` | physiological load / recovery model |

### 5E Psychology and daily life

| BR | 89 alias | Status | Owner evidence | Missing |
| --- | --- | --- | --- | --- |
| 30 Meditation [REG] | MEN-03 | PARTIEL | brick (PPM:9), routine slot (SRM:39), target `mindful_minutes` | no content, timer, duration choice, mindful write |
| 31 Stress | MEN-04 | PARTIEL | `mindful_minutes`, HRV (read) | stress scale |
| 32 Mood | MEN-05, MEN-06 | PARTIEL (weak) | free-text declaration shown as "feeling" (sleep only) | mood model |
| 33 Anxiety | (MEN-07) | ABSENT | — | all |
| 34 Journal | VIE-03 | EXISTANT (text) | private journal entry, follow-up off by default (BPR:64, 317-321, 422-425); journal permission source enforced (`program_collection_runtime.js:78-131`); tests `program_collection_contract.test.mjs` | audio/drawing entries; OBJ-08 has no programme |
| 35 Relations | VIE-04, SOC-01..05 | PARTIEL | Contacts/Communication; Réseau Sommeil (`eVe/domains/community/sleep_circle.js`) | objective→contact link |
| 36 Organisation / load | VIE-01/05/06, COM-03/04 | EXISTANT (mostly) | `validateTimeBudget`, `buildEngagementPreview` (`requiresAcceptance`), `buildProgramPreview` conflicts, `buildTimeBudgetPreview`; runtime cross-project conflicts (`project_program_runtime.js:190-214`); tests | cross-objective conflicts only on chosen projects; global budget not persisted |
| 37 Cognition | AGE-04 | ABSENT | — | all |

### 5F Prevention, ageing, aesthetics

| BR | 89 alias | Status | Owner evidence | Missing |
| --- | --- | --- | --- | --- |
| 38 Function / frailty | AGE-02 | ABSENT | `walking_speed` only | all |
| 39 Prevention / vaccines | AGE-01, SUI-04, CAR-03 | ABSENT | — | all (S2, per country) |
| 40 Substances / exposures | (SOM-05) | ABSENT | fixed coffee/daylight routine items | all |
| 41 Skin | AGE-03, EST-03 | ABSENT | — | all |
| 42 Aesthetics | EST-01..06 | ABSENT | OBJ-13 entry only | all |
| 43 Hormonal / sexual | — | ABSENT | `basal_body_temperature` monitor only | all (S2) |
| 44 Oral health | AGE-05 | ABSENT | — | all |
| 45 Sensory / accessibility | — | PARTIEL | `auditory`/`visual` booleans (`user_accessibility_preferences_model.js`), home panel only | not read anywhere else |

## 4. Real paths today (A03)

- Sleep: Objectifs › Mieux dormir → `dashboard_creation_actions.js` (sleep programme at creation) →
  `objective_preparation.js` plan `['sleep','program']` → `project.program.commit configure` with
  `sleep_preferences` + bricks (sleep only, `project_program_runtime.js:381`) → `buildSleepRoutine` (SRM) →
  `program_routine_calendar.js` (events + alarms) → `sleep_page.js`; monitor via `program_monitor_sources.js`.
- Every other objective: plan `['objective']` (effort, time/day, session hour) → `dashboard.objective.settings.set`
  → `dashboard.objective.schedule.set` → `configure { objective_session }` → one daily calendar session.
- Nutrition: standalone activity, brick `nutrition` (`program_activity_configuration_control.js`,
  `program_nutrition_control.js`), meal v1, `nutrition_consume`, shopping sync. Linked to objectives by
  `program_activity_link`.
No capture was taken in this audit (code reading only).

## 5. Hard-coded couplings to lift before any extension (A04)

1. `PROGRAM_BRICKS` closed set nap/meditation/nutrition/sport (PPM:7-13); `validateProgramBricks` accepts only a
   definition's own bricks (PPM:58-61); `objective.bricks: []` (PPM:20) — no non-sleep objective can hold a brick.
2. Sleep-only branches: `project_program_runtime.js:329` and `:381`; preparation `brick` operation
   (`objective_preparation.js:87`); BPR:66, 301, 323 (sensor line and tool chips); `program_monitor_sources.js:15`
   (`getHealthMonitor('sleep')`).
3. First launch brick choices fixed to `['nap','meditation','nutrition']`: `first_launch_guide_model.js:32`,
   `first_launch_template_catalog.js:260`.
4. Closed enums: action tools (PPM:107), `PROGRAM_PREFERENCE_KEYS` (PCC:2, repeated in `core_atome_types.js:188`),
   permission sources `preferences|journal`, `TRAINING_KINDS`, `TRAINING_OBJECTIVE_GOALS`
   (`training_runtime.js:20`), `WORKOUT_ACTIVITIES` (`health_workout.js:10`), `DASHBOARD_DEFAULT_TARGETS`.
5. Brick payload schemas exist only for nutrition and sport (`program_activity_contract.js`).
6. A new health measure is a catalogue entry AND a Swift/Kotlin allow-list change (HC:1-5).

## 6. Data, permissions and AI (A06)

Holds: `health_actor_gate.js` wraps MCP condition handlers (`mcp_handlers_conditions.js:16`); collection throws
`program_collection_actor_denied` (`program_collection_runtime.js:61`); progression reads health only for source
`ui`; history reader refuses denied actors; health values stay transient in `dashboard_health_modules.js`;
journal read requires purpose permission + `useInFollowup`.

Gaps against spec §3.3: observation value is the text of a text atome (`program_observation` metadata in
`core_atome_types.js:185-189`), no typed value/unit/method; preference `status` is `answered` only and its
value a string; no access audit; no purpose-scoped projection of the profile.

## 7. UI references (A07)

Reusable: Programme panel (BPR: journal, monitor, resources, activity configuration), Nutrition presentation,
`dashboard_training_*` (Sport), `sleep_page.js`, the cursus screen `first_launch_objective` (validated 26 Oct.),
`dashboard_health_modules.js` (monitors). Spec §8 speaks of "Matrice de carrés / Naturel / Liste / Finder": that
vocabulary predates the design charter (AGENTS.md rules 11–16), which governs. Any new screen = mockup first.

## 8. Where the spec meets what was already decided

| # | Point | Nature | Proposed handling |
| --- | --- | --- | --- |
| 1 | Two catalogues, colliding `BR-` IDs (89 vs 45) | conflict | D1: keep 45 as functional catalogue, 89 IDs as aliases in the manifest (spec §4.2 allows aliases) |
| 2 | Spec counts 3 registered bricks; HEAD has 4 (`sport`) | spec outdated | none: `sport` covers BR-24/25 |
| 3 | BR-36 "calendar only after confirmation" vs the cursus' calendar option ticked by default (`first_launch_model.js:30`, `dashboard_progression_runtime.js:196` `calendar ?? true`) | conflict with a validated screen | D4: user choice |
| 4 | Spec §8 UI vocabulary vs charter | charter wins | no action |
| 5 | Objectives = brick compositions vs today's generic cursus | gap, not conflict | bricks are proposed on top of the validated effort/time/session cursus, never replacing it |
| 6 | S2 bricks need clinical review (spec §10.3) | blocking | D2: reviewer; meanwhile observation-only mode |
| 7 | Spec §9: stop after Lot A | process | respected |

Defects noticed in passing (not fixed, out of Lot A): the `training` record schema in
`program_activity_contract.js:16-19` omits `tempo`/`auto`, which `validateTrainingActivity` accepts (doc drift,
no runtime effect: no `additionalProperties: false`); no tests cover `sleep_routine_model.js`,
`objective_routine_model.js`, `program_routine_calendar.js` or any training module.

## 9. Minimal architecture and order (proposal for Lot B, awaiting agreement)

Rule: extend existing owners; no new service, registry or transport.

| Step | Extends | Content | Rough size |
| --- | --- | --- | --- |
| B01+B02 Manifest | `PROGRAM_BRICKS` (moved to a `program_brick_catalog.js` beside PPM, which is at 315 lines) | id, version, family, risk S0/S1/S2, status (`candidate/supported/limited/review_required`), nature, real tools, measures (health catalogue ids), collection questions, 89 aliases; `PROGRAM_DEFINITIONS.objective` gains per-goal candidate bricks (spec §6) limited to `supported` ones | 1 session |
| Lift couplings | §5 items 1–3 | generic brick path for every objective; sleep keeps its protocol | 1 session |
| B03 Context | `program_preference` v2 | statuses answered/unknown/later/refused, typed `{value, unit}`, v1 records read as-is (absent = unknown) | 1–2 sessions incl. migration/replay tests |
| B04 Observations | `program_observation` | optional typed measure `{value, unit, method, monitor_id}`; free text kept | 1 session |
| B05 Permissions | PCC permissions | purpose per brick; gate untouched | with B03 |
| B10/B11 | existing links/sessions/time budget | already present; add cross-objective conflict check by default | 1 session |
| B07/B08 Rules | new referential | structure only; no clinical content until D2 | after D2 |
| B12 UI + Lot C | Programme panel, Sport, Nutrition | nap/meditation real activities (timer, durations, mindful write), Nutrition v2 | mockups first (charter 16), then several sessions |

Foundations B01–B05 (data and contracts, Web, no new UI): about 5–7 working sessions. The whole 45-brick
library with UI and clinical validation is a multi-week programme, gated by D2 for 13 S2 bricks.

## 10. Decisions needed from the user

- D1: catalogue of reference (45 with 89 aliases?).
- D2: who validates clinical rules (S2: BR-02..07, 13, 14, 20, 28, 39, 43)? Until then: collection and
  preparation only.
- D3: go for Lot B foundations (no new UI)?
- D4: objective sessions in the calendar ticked by default (as validated on 26 Oct.) or opt-in (spec BR-36)?

## 11. Lot B — first foundations delivered (2026-10-28)

User decisions (28 Oct.): D1 — the 45 bricks are the reference, the 89 ids are their aliases; D3 — go for the
foundations without any new screen. D2 (28 Oct.): no clinical reviewer for now — the `review_required` bricks (BR-03, 04, 06, 07, 13, 20, 28, 39, 43) stay collection and consultation preparation only; no rule, proposal or activity is built on them. D4 (28 Oct.): the objective sessions stay ticked by default (« Événements quotidiens », screen validated 26 Oct.); the visible box and the explicit Terminer count as the confirmation BR-36 asks.

Delivered: `eVe/domains/programs/program_brick_catalog.js` (B01/B02 manifest + objective compositions), objective
programmes holding the bricks of their composition (`validateProgramBricks(…, goal)`, `configure { bricks }`,
`read.composition`), collection `refused` status (B05). Evidence: `tests/eve/program_brick_catalog.test.mjs`,
`temp/health_bricks/real_app.probe.mjs` 11/11 on the real app; record in FRAMEWORK_STATE §5 of 2026-10-28.

Left on purpose: B03/B04 typed values and units arrive with the first brick that consumes them (no unused field);
B07/B08 wait for D2; B12 (bricks shown for non-sleep objectives) waits for a validated mockup.

## 12. Brick choice on an objective's preparation (2026-10-28, mockup validated)

The objective preparation screen (`first_launch_objective` v5) now offers the activity bricks of the goal's composition as ticked option cards, the same cards as the sleep programme screen, under « Événements quotidiens ». The choice is committed at « C'est parti » and restored by a later preparation. Goals whose composition has no attachable activity yet (pain, guidance, journal) show no brick and no hint. Clinical bricks (`review_required`) never become activities (D2). Probe: `temp/health_bricks/objective_bricks.probe.mjs`.

## 13. Declared water: first typed values (2026-10-28, mockup validated)

BR-12 hydration gets its write: « Verre » (+250 mL) and « Retire » in the band of the « Eau bue » detail, MCP `health_declaration.add|withdraw`. This is B04's typed measure, introduced with its first consumer: one record per actor, monitor and civil day (`atome/src/shared/health_declaration_contract.js`), entries `{ value, unit, method: 'declared', at }` in the catalogue unit (mL); a withdrawn glass stays, dated. Every reading (tile, detail, objectives' history) is measured + declared (`atome/src/squirrel/health/health_declarations.js`). B03 typed preferences still wait for their consumer. Mincir's composition does not list hydration among its start bricks, so its 1500 mL target is never shown (left as is). Probes: `temp/health_bricks/hydration/declarations.probe.mjs` 16/16, `app.probe.mjs` 19/19; record in FRAMEWORK_STATE §5.
