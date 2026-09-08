# CODE_AUDIT_PROGRESS — squirrel-framework / eVe

Artefact d'audit temporaire. Statuts : TODO | IN_PROGRESS | DONE | BLOCKED | MANUAL_REVIEW

## Périmètre (Phase A2)

### SOURCE_CODE (audité)
- `eVe/` — application/framework eVe (sous-module git, ~231K LOC JS) — sauf sous-dossiers exclus ci-dessous
- `atome/src/squirrel/` — cœur du framework Squirrel (~53K LOC)
- `atome/src/application/` — applications (sauf `examples/`, `temp/`)
- `atome/src/utils/`, `atome/shared/`, `atome/security/`, `atome/engines/`
- `server/` — serveur Fastify (~15K LOC)
- `scripts/` — outillage build/guardrails (~5K LOC)

### TEST_CODE
- `tests/` (~66K LOC), `eVe/tests/`

### CONFIG_CODE_RELATED
- `package.json`, `scripts/rollup.config.*.js`, `check-syntax.mjs`

### EXCLUDED_DOCS
- `**/documentations/**`, `**/README*`, `eVe/concept/`, `eVe/eVe_essentials.md`, `todo/`, `done/`, `maps/`, `*.md`

### EXCLUDED_EXAMPLES
- `eVe/R&D/`, `atome/src/application/examples/`, `atome/src/help/`

### EXCLUDED_GENERATED
- `dist/`, `temp/`, `logs/`, `database_storage/`, `data/`, `Failed/`, `atome/src/wasm/`, `platforms/**/target/**`, fichiers `.o/.rlib/.rmeta` de `platforms/`

### EXCLUDED_VENDOR
- `node_modules/`, `atome/src/js/*.min.js` (gsap, leaflet, three…), `atome/renderers/` (4,2 Go), `atome/src/css/` vendored

### UNKNOWN_MANUAL_REVIEW
- `platforms/` code Swift/Rust (hors périmètre JS de cette passe — trop risqué sans toolchain native complète)
- `database/` (11 fichiers)

## Entrées runtime
- `atome/src/index.html` → `squirrel/early-init.js` → vendored libs → `squirrel/spark.js`
- `atome/src/application/index.js` → charge `eVe/eVe.js`
- `eVe/eVe.js` → chargement séquentiel des modules eVe
- `server/server.js` — Fastify
- Build npm : `rollup -c scripts/rollup.config.npm.js`

## Checklist

## Baseline B1 (2026-06-10)

| Validation | Résultat |
|---|---|
| `npm run check:syntax` | ✅ OK (700 fichiers) |
| `npm run check:m0` (no-fallbacks + tauri-fs-boundary + molecule-guardrails) | ✅ OK |
| `npm run build:npm` (rollup) | ✅ OK — dist/squirrel.js 295 993 o en 346 ms |
| `npm run test:molecule` | ❌ KO préexistant — `eVe/tests/molecule/run_molecule_tests.mjs` absent (runner supprimé, script package.json obsolète) → `check:m1`/`check:m2` KO |
| `npm run test:run` (vitest complet) | ❌ inutilisable préexistant — vitest sans config balaie `platforms/ios/**/build/**` (copies de l'app) → OOM/kill ; 107/169 `*.test.mjs` sont des scripts node directs (pas des suites vitest) → faux échecs « No test suite » / « process.exit called » |
| vitest `tests/shared` | ✅ 1/1 |
| vitest `tests/governance` | ❌ 3 échecs préexistants — chemins `todos/*` déplacés vers `todo/cleanup_architecture/` (commit e822f7e3) ; `eve_master_cleanup_findings.json` + file_tree supprimés volontairement (commit 882bb75b) |
| vitest `tests/server` (suites réelles) | ❌ 2 échecs préexistants : notification_stack, state_current_shared (assertions) |
| node direct `tests/eve` (21 scripts) | 15 ✅ / 6 ❌ dont `media_source.test.mjs` (import mort `eve/application/...`) et `capture_export_geometry` (assertion géométrie) |

## Mesures B2 (BEFORE)

| Métrique | Valeur | Méthode |
|---|---:|---|
| LOC eVe/ | 230 897 | wc -l *.js/*.mjs |
| LOC atome/src/squirrel/ | 52 925 | wc -l |
| LOC server/ | 15 019 | wc -l |
| LOC scripts/ | 5 224 | wc -l |
| LOC tests/ | 65 940 | wc -l |
| dist/squirrel.js | 295 993 o | ls -la |
| Temps build npm | 346 ms | rollup |
| Fichiers syntax-checked | 700 | check-syntax.mjs |

## Checklist

| ID | Statut | Tâche | Fichiers | Preuve / validation | Résultat | Risque |
|---|---|---|---|---|---|---|
| A1 | DONE | Identifier structure projet | racine, eVe/, atome/ | inspection | OK | Faible |
| A2 | DONE | Périmètre réel du code | ce fichier | classification ci-dessus | OK | Faible |
| A3 | IN_PROGRESS | Carte imports/exports | eVe/, squirrel/ | — | — | Faible |
| B1 | DONE | Baseline validations | tests/, check:* | voir tableau Baseline | OK (échecs préexistants documentés) | Faible |
| B2 | DONE | Mesures initiales | — | wc/ls | OK | Faible |
| C1 | DONE | Graphe imports (1040 fichiers, 0 import template-literal) | temp/audit_import_graph.mjs | exécution script | 221 orphelins dont ~58 hors tests | Faible |
| C2 | DONE | Classification code mort | voir section Phase C | greps croisés + git log + maps | 7 SAFE_REMOVE, reste MANUAL_REVIEW | Faible |
| C3 | DONE | Conformité Bevy (famille legacy absente) | eVe/domains/rendering | grep 8 noms legacy = 0 réf | OK | Faible |
| C4 | DONE | Duplication | md5 + greps | 1 paire identique, isTauriRuntime ×3 prod | à factoriser | Faible |
| E1 | DONE | Fix test:molecule (runner recréé tests/molecule/) | package.json, tests/molecule/run_molecule_tests.mjs | npm run test:molecule → OK (9 suites) ; check:m1 OK | OK | Faible |
| E2 | DONE | vitest.config.js exclut platforms/** etc. | vitest.config.js | run complet 368 s sans OOM (avant : kill) | OK | Faible |
| E3 | DONE | Governance test aligné sur artefacts survivants | tests/governance/master_cleanup_governance.test.mjs | vitest 2/2 PASS | OK | Faible |
| E4 | DONE | 8 tests réels réparés/adaptés (chemins morts eve/application ×2, contrats périmés ×6) | tests/eve ×6, tests/server ×2 | node/vitest ciblés tous PASS | OK | Faible |
| E5 | DONE | BUG ouverture Molecule groupe frais (group_host_missing) | eVe/intuition/eVeIntuition.js | probe live rouge→vert (8 checks), 8/8 probes non-régression | OK | Moyen |
| E6 | DONE | Tests molecule.test.mjs alignés contrats sécurité + command bus | eVe/core/media_engine/molecule.test.mjs | 12/12 PASS (avant 9/12) | OK | Faible |
| E7 | DONE | BUG probing dimensions média protégé mort (gate token obsolète) | eVe/intuition/tools/core/tool_runtime.js | gate media_user_id aligné serveur (resolveMediaDownloadIdentity) | OK | Moyen |
| F0 | DONE | Option morte tokenParam supprimée (10 sites) | 9 fichiers eVe | grep=0, syntax, m0 | OK | Faible |
| F1 | DONE | isTauriRuntime factorisé (asset_box → canonique) | eVe/domains/media/asset_box.js | syntax 699, m0 | OK | Faible |
| F2 | DONE | Purge dataset legacy steps alignée sur timeline | eVe/intuition/shared/group_state_runtime.js | test dom_contract PASS | OK | Faible |
| D1 | DONE | 7 fichiers morts supprimés + maps à jour | cf. rapport §4 | syntax 699, m0 ×3, build 352 ms, flower probe OK | OK | Faible |
| J1 | DONE | Validation finale complète | — | m1 OK, build OK, vitest 37/120 verts (vs 34/116) | OK | Faible |
| B1b | DONE | BUG drag texte lent pendant lecture audio | virtual_scene_contract.js, bevy_web_renderer_runtime.js | A/B mesuré app live : re-rasterisations texte 596 ms→0, rendu max 303→3,2 ms | OK | Faible |
| B2b | DONE | BUG flower long-clic se ferme au relâchement | surface_runtime.js (3× stopImmediatePropagation retirés des branches flower-active) | reproduit (reload authentifié) rouge→vert + 8 scénarios non-régression | OK | Faible |
| P1a | DONE | Convention de tests : manifest vitest explicite + garde bidirectionnelle | vitest.config.js, tests/vitest.manifest.json, tests/governance/vitest_manifest_guard.test.mjs, README | signal 309 fichiers rouges→13 (tous réels, zone rendering) ; la garde a attrapé une suite tierce non déclarée | OK | Faible |
| P1b | DONE | Runner molecule + manifest + garde whitelistés dans .gitignore | .gitignore | check-ignore négatif ×3, test:molecule 9/9 | OK | Faible |
| P1c | DONE | Contrat panneau Molecule 32/32 vert (était bloqué au check 3) | eVeIntuition.js (hôte dock synthétique route canvas + re-résolution au dock), header_title_runtime.js (gesture rename non exclusive), mtrack_dock_controller.js (taille utilisateur mémorisée prioritaire sur planchers restore), cleanup.test aligné | molecule_panel_contract_probe 32/32 ; dock cleanup test ✓ ; m1 ✓ ; panel_layout_policy ✗ préexistant (échouait avant modifs) | OK | Moyen |
| B3 | DONE | BUG picking z-order : hit-test aligné sur l'ordre affiché Bevy | scene_graph.js (option layerOrderById), project_scene_runtime.js (2 producteurs de scène alimentés par le renderLayer du virtual scene) | contrat hit_order rouge→vert 3/3 ; z_order_media (IA tierce) 5/5 inchangé ; probes live hierarchy+creator_import OK ; vitest 31 verts (+2), 13 rouges = baseline préexistante | OK | Faible |
| B3b | NOTE | Volet « média importé dessous » : déjà corrigé par l'IA tierce (project_scene_stack_runtime + câblage ui.creator, commit 12:16) — validé en réel via gateway (z persisté, affiché dessus, picking OK) | — | probe creator_import 3× vert | OK | — |

## Phase C — Résultats d'analyse statique

### SAFE_REMOVE (preuve : 0 référence statique, 0 import dynamique template-literal dans le scope, recherche repo-globale du basename négative, remplaçant canonique identifié)
1. `eVe/intuition/shared/slider_direct_drag.js` — shim de ré-export 3 lignes laissé par le refactor slider SSOT (3c0990a) ; canonique : `atome/src/squirrel/components/tool_slider_builder.js`
2. `eVe/intuition/shared/slider_tool_values.js` — 65 l., helpers dupliqués ; `slider_tool_content.js` importe le builder canonique squirrel
3. `eVe/intuition/tools/contextual/flower_menu_visual.js` — 326 l., ancien visuel flower remplacé par `eVe/intuition/flower/*` (consommé par eVeIntuition.js et flower_menu.js)
4. `atome/src/squirrel/apis/runtime_env.js` — 22 l., copie périmée de `apis/unified/adole_api/runtime.js` (canonique, qui a en plus la règle localhost:3000)
5. `atome/src/application/ui/filerEvents.js` — 19 l., stub no-op « disabled », jamais chargé par aucun HTML/JS
6. `eVe/intuition/components/ui/index.js` — barrel orphelin, contenu md5-identique à panels/ui/index.js
7. `eVe/intuition/panels/ui/index.js` — idem (les deux à vérifier mutuellement avant suppression)

### PUBLIC_API_KEEP / DYNAMIC_USAGE_POSSIBLE
- `atome/src/squirrel/apis/update_atome.js` — importé par `application/examples/update.js` (exemples intouchables)
- Barrels squirrel `mail|contacts|calendar|bank|security|voice/index.js` — `atome/src/squirrel/` est dans package.json `files` (surface npm publiée) ; sous-modules actifs, barrels jamais importés en interne → DEPRECATION_CANDIDATE, décision produit
- `atome/src/squirrel/components/intuition_builder/` (7 761 l.) — importé uniquement par 2 exemples ; documenté CODEMAP « Minimal Intuition builder » → DEPRECATION_CANDIDATE majeure (décision produit)

### MANUAL_REVIEW (architecture documentée non câblée ou décision produit)
- `eVe/core/{event_store,media_store,project_store}/` + `browser_store|tauri_store|ios_store` + `molecule_store_bootstrap.js` — 0 importeur externe, mais documentés CODEMAP comme contrats canoniques (« Should not be duplicated by: New product stores outside eve/core/*_store/ »)
- `atome/security/cloudSync.js` (362 l., 0 réf) — module sécurité sync comptes, possiblement planifié
- `atome/src/application/vie/vie.js` (166 l.), `eVe/domains/mtrax/timeline/persist_bootstrap_runtime.js` (174 l., zone migration MTrax→Molecule)
- `scripts/phase9_*.mjs`, `scripts/{axum_mail_sync_bridge,mtrack_perf_guard,mtrack_perf_suite_summary,package-app,purge_webview_storage,server_update,test_contracts}` — outillage CLI lancé à la main
- ~60 `*.test.mjs` colocalisés dans `atome/src/squirrel/**` — violent la politique « tests sous ./tests » (décision : déplacement massif = churn, à arbitrer)
- `atome/src/application/audio_runtime/demo.example.js` — exemple dans dossier source

### Duplication détectée
- `isTauriRuntime()` : canonique `adole_api/runtime.js` + copies locales dans `aBox/index.js:446`, `eVe/domains/media/asset_box.js:495` (+ exemples, intouchables)
- `components/ui/index.js` ≡ `panels/ui/index.js` (md5 identiques)

### Hotspots taille (politique : >500 non conforme, >1000 interdit sans plan)
`eVeIntuition.js` 17 389 l. ; `project_drop.js` 7 900 ; `intuition_builder/index.js` 7 129 ; `tool_runtime.js` 6 079 ; `user.js` 5 938 ; `server.js` 5 061 ; `communication.js` 4 994 ; `mtrax_renderer_webgpu_adapter.js` 4 551 (WebGPU réel, le getContext('2d') l.584 est un readback texture)

### Logs interdits
307 `console.log/warn/debug` en code production (politique : seuls logs de version autorisés) — nettoyage global = churn massif, traité dans fichiers touchés uniquement, reste en recommandation

## Plan d'exécution numéroté (phases D-F)
1. E2 — vitest.config.js : exclure platforms/** et artefacts (corrige OOM du run complet)
2. E1 — réparer script test:molecule (runner supprimé)
3. E3 — réparer test gouvernance (chemins todos/ → emplacements réels survivants)
4. D1 — supprimer les 7 fichiers SAFE_REMOVE, validation complète après lot
5. E4 — investiguer/corriger échecs réels : notification_stack, state_current_shared, capture_export_geometry, media_source (chemin mort eve/application), group_state_runtime, import_media_timeline, media_fixture_restore_contract, media_projection_state
6. F1 — factoriser isTauriRuntime (aBox, asset_box → canonique adole_api/runtime.js)
7. J — re-validation complète + comparaison BEFORE/AFTER
8. K — rapport final


## Documentary audit — 2026-09-08 — first bounded pass

This phase is separate from the historical code audit above, which excluded documentation. It does not inherit its DONE statuses. The user mission and approved plan authorize documentary evidence, factual link corrections and a non-normative UI draft only. No code, test, dependency, configuration, normative rule, Git state, account or runtime data changes are authorized by this phase.

### Baseline and instruction provenance

- Parent revision: d8137e4a231765cd3be0c1afa256cda15f7c33b9.
- eVe submodule revision: b6dfa0ec9dfea67e97cf9f6b5c27914ce8b8891a; initially clean. Atome is a directory of the parent repository, not a listed submodule.
- Existing parent modifications: the iOS project.pbxproj and user workspace UserInterfaceState.xcuserstate. Preserve both.
- The conversation supplied the v3.0 rule entrypoint. Explicit disk reads found the global ~/.codex/AGENTS.md v3.0 and local .codex/AGENTS.md v3.1 plus modules 01–07, infos.md and the canonical UI procedure. Automatic file-loading behavior was not observed or verified. Ancestor AGENTS.md/AGENTS.override.md checks and local nested instruction-name search found no additional applicable file; this is an inspection result, not proof about host injection.
- Existing owners: maps/{CODEMAP,API_MAP,ARCHITECTURE_MAP,DESIGN_MAP}.md, documentation README indexes, audit graphs, and eVe/documentations/FRAMEWORK_STATE.md §5. This registry stores evidence/coverage; it is not a replacement architecture or rulebook.
- Mission-specific limits take precedence for this audit: modules 03/04/07 otherwise demand repairs, legacy deletion or new tests. Those scope conflicts are recorded, not used to expand this documentary mission. No normative rule text is changed.

Preserved local files (initial SHA-256):

- `platforms/ios/atome-auv3/atome.xcodeproj/project.pbxproj`: `527ba371241bb4348535546b2c9916702fc6611e2584654c9772e77ff7ab8f34`.
- `platforms/ios/atome-auv3/atome.xcodeproj/project.xcworkspace/xcuserdata/jean-ericgodard.xcuserdatad/UserInterfaceState.xcuserstate`: `bfd4fb1249e425da55343ce8cf2c6d73e34a83bda20315745a10295b14dfd5e6`.

### Lot 1 — lightweight inventory

217 regular files found by directory traversal (atome/documentations: 185; eVe/documentations: 32). No directories were created to match dictated names. Titles, explicit status lines and Markdown link targets below are mechanically extracted navigation metadata, not substantive validation. HTML titles are extracted when available; non-Markdown links and plain-text path references are not a complete link graph. Theme is a navigation hint from path/title. Every file starts **not audited**; only the precise sections listed in later evidence entries gain coverage. Archive location is a declared historical classification, not proof that every idea is superseded.

| Path | Title / theme hint | Declared status / placement | Markdown link targets | Coverage |
| --- | --- | --- | --- | --- |
| `atome/documentations/aBox.md` | aBox Dropbox-Style Workflow | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/Adole apis.md` | ADOLE API v3.0 Documentation | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/Adole finder engine.md` | ADOLE Global Search Engine | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/Adole messaging_system.md` | Specifications: ADOLE Messaging System | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/ADOLE.md` | ADOLE.md | Status: Spécification conceptuelle; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/AI.md` | Atome / Squirrel — AI Control via Agent | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/audits/atome_usage.md` | Atome Usage Audit | No inline status extracted; archive | ../graphs/GRAPH_INDEX.md; ../../shared/atome_contract.js#L1; ../../../database/schema.sql#L1; ../../../database/adole.js#L1; ../../../eVe/core/atome_commit.js#L1749; ../../../database/adole.js#L1485; ../../../eVe/intuition/runtime/tool_genesis.js#L4220; ../../../eVe/core/atome_timeline.js#L559; ../../../eVe/core/media_engine/molecule.js#L298; ../../../eVe/core/media_engine/molecule.api.js#L393; ../../shared/atome_contract.js#L105; ../../shared/atome_contract.js#L165; ../../shared/atome_contract.js#L54; ../../../database/schema.sql#L37; ../../../database/schema.sql#L67; ../../../database/schema.sql#L95; ../../../database/schema.sql#L121; ../../../database/schema.sql#L145; ../../../database/schema.sql#L165; ../../../database/schema.sql#L180; ../../../database/schema.sql#L208; ../../../database/schema.sql#L233; ../../../database/adole.js#L494; ../../../server/atomeRoutes.orm.js#L434; ../../../server/atomeRoutes.orm.js#L473; ../../src/squirrel/apis/unified/adole_api/atomes.js#L338; ../../src/squirrel/apis/unified/adole_api/atomes.js#L374; ../../../eVe/core/atome_commit.js#L2128; ../../../eVe/core/atome_commit.js#L1923; ../../../eVe/core/atome_commit.js#L2078; ../../../eVe/core/atome_commit.js#L2122; ../../../server/atomeRoutes.orm.js#L362; ../../../database/adole.js#L1536; ../../../database/adole.js#L1400; ../../../database/adole.js#L1417; ../../../database/adole.js#L249; ../../../database/adole.js#L1443; ../../../database/adole.js#L1042; ../../../database/adole.js#L1108; ../../src/squirrel/atome/atome.js#L1399; ../../src/squirrel/atome/atome.js#L1478; ../../../eVe/core/atome_timeline.js#L12; ../../../eVe/intuition/runtime/tool_genesis.js#L4560; ../../src/squirrel/atome/atome.js#L1417; ../../../eVe/core/atome_timeline.js#L239; ../../../eVe/core/atome_timeline.js#L260; ../../../eVe/core/atome_timeline.js#L424; ../../../database/adole.js#L1256; ../../../database/adole.js#L1268; ../../../eVe/core/atome_timeline.js#L1; ../../../eVe/core/atome_timeline.js#L1037; ../../../eVe/core/atome_timeline.js#L447; ../../../eVe/core/atome_timeline.js#L644; ../../../eVe/core/atome_timeline.js#L655; ../../../eVe/core/atome_timeline.js#L872; ../../../eVe/core/atome_timeline.js#L1110; ../../../eVe/core/atome_timeline.js#L1144; ../../../eVe/core/atome_timeline.js#L1259; ../../../database/adole.js#L1310; ../../../database/adole.js#L1343; ../../../database/adole.js#L1733; ../../../eVe/core/media_engine/molecule.js#L502; ../../../eVe/core/media_engine/molecule.api.js#L40; ../../../eVe/core/media_engine/molecule.api.js#L72; ../../../eVe/core/media_engine/molecule.api.js#L242; ../../../eVe/core/media_engine/molecule.api.js#L258; ../../../eVe/core/media_engine/molecule.api.js#L414; ../../../eVe/core/media_engine/molecule.js#L47 | not audited; see section evidence below |
| `atome/documentations/archive/audits/benchmark_en.html` | HyperSquirrel Performance Benchmark | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/audits/developer_experience_analysis_en.md` | 🎯 HyperSquirrel Developer Experience - Detailed Analysis (8/10) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/audits/framework_comparison_audit_en.md` | 🏆 HyperSquirrel vs Modern Frameworks - Comparative Audit | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/audits/performance_final_report_en.md` | 🚀 HyperSquirrel Final Optimization Report | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/audits/performance_optimizations_en.md` | performance_optimizations_en.md | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/audits/performance_optimizations.md` | performance_optimizations.md | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/audits/performance_protocol_en.md` | 🎯 HyperSquirrel Performance Test - Benchmark Protocol | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/audits/safe_optimizations.md` | SAFE OPTIMIZATIONS - ZERO BREAKING CHANGES | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/deprecated-contracts/Adole Time Machine.md` | Atome / ADOLE — Historical Model & Time Manipulation | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/deprecated-contracts/atome_object.md` | Atome Syntax Spec v1 (Tool/AI-Ready) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/deprecated-contracts/libraries_management_complete.md` | 📚 Libraries Management - Complete Guide | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/deprecated-contracts/libraries_management.md` | 📚 Gestion des Librairies Locales | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/incident-fixes/Auto_test_and _debug_atome_usage.md` | How To Use Test & Debug System | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/incident-fixes/Auto_test_and _debug_atome.md` | Atome Debug & QA Architecture | status: TODO; status: TODO; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/incident-fixes/auv3_sample_rate_detection.md` | AUv3 Host Sample Rate Detection - Solution Documentation | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/incident-fixes/get_tempo.md` | Comment Obtenir le Tempo Correctement dans un Plugin AUv3 | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/incident-fixes/ios_file_system_integration.md` | iOS File System Integration: iCloud & Local Storage | No inline status extracted; archive | #architecture-overview; #ios-configuration; #swift-implementation; #javascript-bridge; #user-interface; #api-reference; #file-structure; #migration-system; #testing--deployment; #troubleshooting | not audited; see section evidence below |
| `atome/documentations/archive/incident-fixes/tempo_regression_fix.md` | Tempo Button Regression Fix | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/legacy-ui/button_usage.md` | Squirrel Button Usage Guide | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/legacy-ui/calendar_ui.md` | Calendar UI demo (EventCalendar Lab) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/legacy-ui/components.md` | Component Format Guide | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/legacy-ui/console_api.md` | 🖥️ Console Component API | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/legacy-ui/html5_drag_drop_tauri_guide.md` | HTML5 Drag & Drop in Tauri: Complete Implementation Guide | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/legacy-ui/Intuition_toolbox_menu_usage.md` | Toolbox Menu: Usage & Development Guide (English) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/legacy-ui/new intuition menu.md` | New Intuition Menu | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/AI_debug.md` | AI_debug.md | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/CORRECTIONS_APPLIED.md` | ✅ Corrections Appliquées - platforms/ios/atome-auv3_crash | **Status :** ✅ CORRECTIONS APPLIQUÉES; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/EXTERNAL_DISPLAY_MIGRATION_NOTES.md` | External Display & AUv3 Stability Migration Notes | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/LOOPY_PRO_CRASH_FIX.md` | 🔧 Solution au Crash AUv3 dans Loopy Pro | **Status :** ✅ PROBLÈME RÉSOLU; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/medias_not_accessible.md` | Report: 403 Error When Playing Media Recorded from Fastify in Tauri | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/MIDI_CRASH_ANALYSIS.md` | Analyse du Crash AUv3 - Loopy Pro vs AUM | **Status :** Solutions identifiées, correction requise; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/MTRACK_AUDIO_DURATION_NATIVE_REGRESSION.md` | mTrack — Audio track duration wrong in native runtime (Tauri / iOS) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/MTRACK_PURE_AUDIO_RECORDING_DURATION_NATIVE_REGRESSION.md` | mTrack — Pure audio recording produces a few-frames clip in native runtime (Tauri / iOS) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/no_sound_in_Tauri.md` | Prompt: Fix No Sound in Tauri Playback | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/SRC_AUV3_LAST_FIX.md` | ✅ Correction Appliquée - platforms/ios/atome-auv3_last | **Status :** ✅ CORRECTION APPLIQUÉE; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/archive/problem-solving/TAURI_VIDEO_STUTTER_FIX.md` | Tauri Native — Video Playback Stutter Fix | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `atome/documentations/atome_audio_engine.md` | Atome Audio Engine — Unified Audio Contract | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/atome_structur_to_respect.md` | Atome Structure To Respect | No inline status extracted; outside archive | ../../eVe/documentations/atome_persistence_contract.md; ../../eVe/documentations/eVe_canvas.md; ./ADOLE.md; ../../database/schema.sql | not audited; see section evidence below |
| `atome/documentations/atomeOS_usage.md` | Atome OS usage | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/audio_engine_migration_synthesis.md` | Audio Engine Migration — Synthesis Note | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/audio_engine_system_dependencies.md` | Audio Engine System Dependencies | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/audio_multitracks.md` | Atome Audio – Multitrack MVP Usage & Specs | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/AUv3_API_Reference.md` | AUv3 API Reference - Documentation Complète | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/auv3_deployment.md` | AUv3 Deployment Script | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/auv3_midi_output_troubleshooting_guide.md` | Guide Complet : Résoudre l'Invisibilité des Sorties MIDI AUv3 | No inline status extracted; outside archive | https://developer.apple.com/documentation/audiotoolbox/audio_unit_v3_plug-ins; https://developer.apple.com/documentation/coremidi; https://docs.swift.org/swift-book/LanguageGuide/Protocols.html | not audited; see section evidence below |
| `atome/documentations/auv3_url_opening_and_squirrel_ui.md` | AUv3 URL Opening + Squirrel UI — Architecture, Setup, and Usage | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/auv3_webview_audio_injection.md` | AUv3 WebView → AU Audio Injection: fixes and best practices | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/bevy_integration.md` | Bevy Integration | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/calendar_api.md` | Calendar API | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/code&tools.md` | Atome – Tool & Code Model | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/communication_auv3_app.md` | AUv3 ⇄ App communication and passing params on launch | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/conditions.md` | Conditions | Status: dynamic transverse core implemented; focused validation complete on 2026-08-14. Physical HealthKit acceptance remains to verify.; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/CRUD_apis.md` | Atome application API | Status: Implemented and guarded; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/database_architecture.md` | ADOLE v3.0 — Architecture unifiee (Axum / Fastify / AiS) | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/debug_mode.md` | Debug Mode (centralisé) | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/Eden atome Database.md` | Eden atome Database.md | Status: Spécification conceptuelle; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/env_setup.md` | .env and .env.example | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/github_token_configuration.md` | GitHub Token Configuration | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/.DS_Store` | .DS_Store | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/atome-core/01-call-graph.md` | Call Graph - atome-core | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/atome-core/02-event-graph.md` | Event Graph - atome-core | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/atome-core/03-state-graph.md` | State Graph - atome-core | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/atome-core/04-source-of-truth-graph.md` | Source-of-Truth Graph - atome-core | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/atome-core/05-async-graph.md` | Async Graph - atome-core | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/atome-core/06-lifecycle-graph.md` | Lifecycle Graph - atome-core | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/atome-core/07-risk-map.md` | Risk Map - atome-core | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/atome-core/08-open-questions.md` | Open Questions - atome-core | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/atome-core/README.md` | Graphs - atome-core | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/01-call-graph.md` | Call Graph - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/02-event-graph.md` | Event Graph - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/03-state-graph.md` | State Graph - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/04-source-of-truth-graph.md` | Source-of-Truth Graph - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/05-async-graph.md` | Async Graph - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/06-lifecycle-graph.md` | Lifecycle Graph - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/07-risk-map.md` | Risk Map - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/08-open-questions.md` | Open Questions - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/09-boot-timeline.md` | Boot Timeline - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/boot/README.md` | Graphs - boot | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/GRAPH_INDEX.md` | Graph Index | No inline status extracted; outside archive | ./molecule/README.md; ./media-import/README.md; ./media-recording/README.md; ./panel-lifecycle/README.md; ./sequence-timeline/README.md; ./project-loading/README.md; ./user-login/README.md; ./boot/README.md; ./runtime-api/README.md; ./atome-core/README.md; ./boot/09-boot-timeline.md | not audited; see section evidence below |
| `atome/documentations/graphs/media-import/01-call-graph.md` | Call Graph - media-import | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-import/02-event-graph.md` | Event Graph - media-import | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-import/03-state-graph.md` | State Graph - media-import | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-import/04-source-of-truth-graph.md` | Source-of-Truth Graph - media-import | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-import/05-async-graph.md` | Async Graph - media-import | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-import/06-lifecycle-graph.md` | Lifecycle Graph - media-import | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-import/07-risk-map.md` | Risk Map - media-import | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-import/08-open-questions.md` | Open Questions - media-import | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-import/README.md` | Graphs - media-import | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-recording/01-call-graph.md` | Call Graph - media-recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-recording/02-event-graph.md` | Event Graph - media-recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-recording/03-state-graph.md` | State Graph - media-recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-recording/04-source-of-truth-graph.md` | Source-of-Truth Graph - media-recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-recording/05-async-graph.md` | Async Graph - media-recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-recording/06-lifecycle-graph.md` | Lifecycle Graph - media-recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-recording/07-risk-map.md` | Risk Map - media-recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-recording/08-open-questions.md` | Open Questions - media-recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/media-recording/README.md` | Graphs - media-recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/molecule/01-call-graph.md` | Call Graph - Molecule Recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/molecule/02-event-graph.md` | Event Graph - Molecule Recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/molecule/03-state-graph.md` | State Graph - Molecule Recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/molecule/04-source-of-truth-graph.md` | Source-of-Truth Graph - Molecule Recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/molecule/05-async-graph.md` | Async Graph - Molecule Recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/molecule/06-lifecycle-graph.md` | Lifecycle Graph - Molecule Recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/molecule/07-risk-map.md` | Risk Map - Molecule Recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/molecule/08-open-questions.md` | Open Questions - Molecule Recording | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/molecule/README.md` | Graphs - Molecule | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/panel-lifecycle/01-call-graph.md` | Call Graph - panel-lifecycle | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/panel-lifecycle/02-event-graph.md` | Event Graph - panel-lifecycle | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/panel-lifecycle/03-state-graph.md` | State Graph - panel-lifecycle | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/panel-lifecycle/04-source-of-truth-graph.md` | Source-of-Truth Graph - panel-lifecycle | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/panel-lifecycle/05-async-graph.md` | Async Graph - panel-lifecycle | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/panel-lifecycle/06-lifecycle-graph.md` | Lifecycle Graph - panel-lifecycle | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/panel-lifecycle/07-risk-map.md` | Risk Map - panel-lifecycle | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/panel-lifecycle/08-open-questions.md` | Open Questions - panel-lifecycle | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/panel-lifecycle/README.md` | Graphs - panel-lifecycle | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/project-loading/01-call-graph.md` | Call Graph - project-loading | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/project-loading/02-event-graph.md` | Event Graph - project-loading | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/project-loading/03-state-graph.md` | State Graph - project-loading | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/project-loading/04-source-of-truth-graph.md` | Source-of-Truth Graph - project-loading | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/project-loading/05-async-graph.md` | Async Graph - project-loading | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/project-loading/06-lifecycle-graph.md` | Lifecycle Graph - project-loading | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/project-loading/07-risk-map.md` | Risk Map - project-loading | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/project-loading/08-open-questions.md` | Open Questions - project-loading | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/project-loading/README.md` | Graphs - project-loading | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/runtime-api/01-call-graph.md` | Call Graph - runtime-api | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/runtime-api/02-event-graph.md` | Event Graph - runtime-api | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/runtime-api/03-state-graph.md` | State Graph - runtime-api | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/runtime-api/04-source-of-truth-graph.md` | Source-of-Truth Graph - runtime-api | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/runtime-api/05-async-graph.md` | Async Graph - runtime-api | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/runtime-api/06-lifecycle-graph.md` | Lifecycle Graph - runtime-api | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/runtime-api/07-risk-map.md` | Risk Map - runtime-api | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/runtime-api/08-open-questions.md` | Open Questions - runtime-api | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/runtime-api/README.md` | Graphs - runtime-api | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/sequence-timeline/01-call-graph.md` | Call Graph - sequence-timeline | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/sequence-timeline/02-event-graph.md` | Event Graph - sequence-timeline | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/sequence-timeline/03-state-graph.md` | State Graph - sequence-timeline | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/sequence-timeline/04-source-of-truth-graph.md` | Source-of-Truth Graph - sequence-timeline | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/sequence-timeline/05-async-graph.md` | Async Graph - sequence-timeline | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/sequence-timeline/06-lifecycle-graph.md` | Lifecycle Graph - sequence-timeline | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/sequence-timeline/07-risk-map.md` | Risk Map - sequence-timeline | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/sequence-timeline/08-open-questions.md` | Open Questions - sequence-timeline | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/sequence-timeline/README.md` | Graphs - sequence-timeline | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/user-login/01-call-graph.md` | Call Graph - user-login | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/user-login/02-event-graph.md` | Event Graph - user-login | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/user-login/03-state-graph.md` | State Graph - user-login | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/user-login/04-source-of-truth-graph.md` | Source-of-Truth Graph - user-login | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/user-login/05-async-graph.md` | Async Graph - user-login | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/user-login/06-lifecycle-graph.md` | Lifecycle Graph - user-login | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/user-login/07-risk-map.md` | Risk Map - user-login | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/user-login/08-open-questions.md` | Open Questions - user-login | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/graphs/user-login/README.md` | Graphs - user-login | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/host_voice_recognition.md` | Atome / Squirrel Voice Abstraction Spec (Capture + STT) | status: (): Promise<VoicePermissions>,; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/host_voice_synthesis.md` | OS Native Text-to-Speech (TTS) Integration Guide | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/how_debug_UI.md` | How To Debug eVe BevyUI With Playwright | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/how_to_read_atome_from_base.md` | How to Read an Atome from the Base (Tauri/Fastify) | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/human_handshake.md` | Atome / ADOLE | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/instructions_for_ai.md` | Instructions for AI Code Assistants: Using Squirrel.js | No inline status extracted; outside archive | ./using_squirrel.md | not audited; see section evidence below |
| `atome/documentations/media_capture_apis.md` | Media Capture APIs (audio, video, camera, playback) | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/media-url-contract.md` | Media URL Contract | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/post_quantum_encrypting.md` | Post-Quantum Cryptography Integration Plan for Atome / Squirrel | Status: Specification; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/purchasekit_doc.md` | PurchaseKit -- Documentation | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/pwa_packaging_guide_en.md` | PWA Packaging Guide | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/README_auv3_file_handling.md` | AUv3 File Handling - Guide d'utilisation | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/README.md` | Atome Documentation Index | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/routing_midi_to_host.md` | Routing MIDI to Host - AUv3 Effect Plugin (aumf) MIDI Output | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/security_architecture.md` | Security Architecture Documentation | Status: Partiel; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/server_installation.md` | Server Installation & Management Guide | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/set_github_address_to_monitor.md` | Configuring the GitHub Repository to Monitor | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/set_main_server_address.md` | Configuring the Main Fastify Server Address | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/shell.md` | Shell API (WS) | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/stream_webview_auv3.md` | Streaming Audio from WebView to AUv3 Host | No inline status extracted; outside archive | https://github.com/michaeltyson/TPCircularBuffer | not audited; see section evidence below |
| `atome/documentations/sync_protocol.md` | Canonical Sync Protocol (`/ws/api` + `/ws/sync`) | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/teleport.md` | Téléportation — contrat développeur | Statut : **socle implémenté et couvert par probes ; non vérifié en application réelle.**; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/time_position_stream_creation.md` | Guide Technique : Récupération Continue de la Position de Lecture (Playhead) AUv3 → JavaScript | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/tools_api_and_coding.md` | Tools API and Coding (v2) | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/transport_creation.md` | Guide Technique : Récupération et Diffusion du Transport (Play/Stop + Position) AUv3 vers JavaScript | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `atome/documentations/using_squirrel.md` | Using Squirrel.js: Complete English Guide | No inline status extracted; outside archive | #introduction; #installation; #quick-start-example; #core-concepts; #beginner-tutorial; #advanced-usage; #component-system; #custom-components; #system-abstraction; #performance-tips; #internationalization; #faq; #resources; https://github.com/atomecorp/a; https://cdn.jsdelivr.net/gh/atomecorp/a@latest/dist/squirrel.min.js; https://www.npmjs.com/package/squirreljs; ./Core-API.md | not audited; see section evidence below |
| `atome/documentations/Voice_recog.md` | Whisper Integration in Squirrel (Tauri + Axum + Browser) | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/atome_concepts.md` | ATOME - Source of Truth (Consolidated) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/atome_object.md` | Atome Syntax Spec v1 (Tool/AI-Ready) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/done.md` | DONE - Rapport d'avancement refonte Tools/Atome | Statut:; Statut:; Statut:; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/eve_structure_audit.md` | eVe Structure Audit | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/Good practices.md` | Good practices.md | Status: Active – Strict Enforcement; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/int8.md` | eVe i18n (int8) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/Molecules.md` | MTraX - Format canonique timeline, automation, effets | Statut: SPEC V1; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/strangler.md` | eVe - Plan de transition Strangler (step by step) | Statut: DEMARRE; Statut: EN COURS; Statut: EN COURS (avance 2026-02-18); archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/tool_reveal_behavior.md` | Tool Horizontal Reveal (SSOT) | Status: active; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/tools_cahier_des_charges.md` | Cahier des charges - Systeme de tools (V2) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/archive/legacy-runtime/tools.md` | Tools Runtime and History (v2) | No inline status extracted; archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/Atome Time Machine.md` | Atome Time Machine | Status:; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/atome_persistence_contract.md` | Atome Persistence Contract | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/bank_v1_architecture.md` | Bank v1 architecture | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/calendar_v1_architecture.md` | Calendar architecture | Status: Bevy/WebGPU implementation complete with focused quick-create and deep-scroll contracts; real native interaction parity and product-owner acceptance pending.; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/debug_UI.md` | UI Debug | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/desktop_manual_validation_checklist.md` | Desktop Manual Validation Checklist | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/eVe_canvas.md` | eVe Canvas Rendering Guide | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/failure_modes_v1.md` | Failure Modes V1 | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/FRAMEWORK_STATE.md` | Framework State | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/latency_targets_v1.md` | Latency Targets V1 | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/live_icloud_smoke_tests.md` | Live iCloud Smoke Tests | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/mail_contact_calendar_and AI.md` | Mail, Calendar, Contacts and AI - Current User Procedure | No inline status extracted; outside archive | https://account.apple.com/ | not audited; see section evidence below |
| `eVe/documentations/mail_v1_architecture.md` | Mail V1 Architecture | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/Offline Online explanations.md` | Atome – Clear Offline / Online Architecture (Ambiguity-Free) | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/panel_html_inventory.md` | eVe HTML Panel Inventory | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/README.md` | eVe Documentation Index | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/realtime_sync_architecture.md` | Real-Time Sync Architecture | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/remote_control_test_harness.md` | Remote control and test harness | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/runtime_ai_mcp_entrypoints.md` | Runtime AI MCP Entrypoints | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/Security_and_sharing.md` | Atome Security and Sharing | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |
| `eVe/documentations/v1_scope_freeze_and_v2_backlog.md` | V1 Scope Freeze And V2 Backlog | No inline status extracted; outside archive | None extracted | not audited; see section evidence below |

### Lots 1–2 — section evidence and foundation coverage

Evidence conventions: **D** = documentary intent, **S** = static code inspection, **T** = executed isolated test. No browser, Tauri, iOS, AUv3 or FreeBSD behavior was observed. All entries below use the baseline revisions above; none of their source files had pre-existing local changes. Test references T1–T4 are defined below. An unlisted section remains **not audited**, including sections of a file with one audited claim. The original user mission, approved in this task on 2026-09-08, is a normative input for principles; examples below illustrate it and are not additional product decisions.

| ID / subject | Original documentary reference and expected intent | Code / symbol and observed behavior | Documentary status | Implementation status / evidence | Action, counter-check and uncertainty |
| --- | --- | --- | --- | --- | --- |
| D01 / entrypoint locations | `.codex/modules/04-feature-work-cleanup-and-framework-reuse.md`, Architectural authority; module 07 §6 names `eve/application/documentations/` and `documentations/` | Actual roots are `atome/documentations/`, `eVe/documentations/`, and `maps/`; global v3.0 and local v3.1 instructions differ | partially valid; stale path references | S: filesystem inventory; no runtime claim | Keep rule wording unchanged. Add factual navigation from README indexes. Verify exact casing and link resolution, not existence of a similarly named path. |
| D02 / UI procedure | Global `~/.codex/AGENTS.md`, Mandatory UI debugging adjunct names a DOM button; local `.codex/AGENTS.md` and `atome/documentations/how_debug_UI.md`, Readiness/Real canvas interaction require mounted BevyUI records | Procedure explicitly says product menu has no DOM buttons; local entrypoint points to this procedure | contradictory across instruction copies | D/S: procedure read, no UI run | Do not rewrite global/local normative instructions. Refer operational readers to the current repository procedure; automatic loading remains unverified. |
| D03 / graph fidelity | `atome/documentations/graphs/atome-core/README.md`, Main entry points; `01-call-graph.md` still locates commit at 1760; `04-source-of-truth-graph.md` depicts DOM/realtime as an observed risk | `eVe/core/atome_commit.js`: `commit` is at 70, `commitBatch` at 151; WebSocket operations delegate to both SQL and vault owners | partially valid; historical graph risk labels are not current proof | S: symbol positions and controlling calls | Correct verified symbol locations in README only. Preserve graph and mark its historical projection/risk assertions unverified; full graph reconciliation is next-lot work. |
| F01 / agnostic object | `atome/documentations/atome_structur_to_respect.md` §§1–4; `ADOLE.md` §§1–2 (explicit conceptual status); `eVe/concept/eVe.html`, Outillage | `atome/src/shared/atome_contract.js`: normalization, reserved property keys and schema sanitation; `atome_universal_contract.js`: capability and composition normalization | valid on inspected separation; envelope completeness only partially valid | S: minimal description and disposable projection mechanisms exist | The source also supports universal fields beyond the document's envelope; see ARCHITECTURE_MAP universal-format owner. Do not remove those fields or redefine the envelope in this audit. Validate call-site schemas before asserting strict rejection everywhere. |
| F02 / durable property history | Structure §§5–7; persistence contract Property lifecycle and history | `database/adole_event_mutation.js:createAdoleEventMutationApi.prepare/applyDeletes`; `database/adole.js:appendEvent`; preimages, base versions and tombstone versions; events and projection inside transaction | valid on inspected SQL path | S + T2/T3/T4, bounded tests | Existing tests cover version listing, snapshot append restoration and transaction grouping. They do not prove disk restart, arbitrary property restoration UI or native parity. |
| F03 / operation versus tool | `.codex/modules/05-api-rendering-and-ui.md`, API and MCP; `eVe/concept/eVe.html`, Outillage; archive `atome_concepts.md` §18 distinguishes tool and tool_instance | `eVe/intuition/runtime/tool_gateway.js` resolves tool identity; `command_bus.js:CommandBusV2.dispatch` validates envelopes; `eVe/core/atome_commit.js:commit` submits events | valid as intended separation; archive retained as historical explanation | S: sampled owners, not every tool/caller | A command-bus in-memory log is not independently proof of durable history. Direct permission SQL in F07 is a counterexample to a blanket all-actions guarantee. |
| F04 / present restore versus branches | `eVe/documentations/Atome Time Machine.md` §§2,4,7; `todo/ai_voice/time_machine_historical_branching.md` Product decision/Task 1 | `server/atomeHistoryCommands.js:executeAtomeHistoryCommand` builds inverse events for one source transaction and reauthorizes via commit batch; `database/state_snapshot_restore.js:buildStateSnapshotRestoreEvents` writes new `set` events to existing IDs | valid distinction; “copy mode” must not be read as a new object identity | S + T3/T4; persistent historical branch implementation not verified and explicitly documented as not implemented | Restoring snapshot properties and undoing a transaction do not prove arbitrary subset selection, new-object creation or branch merge. Keep the active branch requirement, and its existing model-validation gate. |
| F05 / property ACL and current history access | `Security_and_sharing.md` §§2.6–2.8; persistence contract Consumer projection | `server/atomePropertySecurity.js:authorizeAtomeEventWrite` checks touched keys; `projectEventForRead` filters with current canRead and removes inverse payload; `database/adole_permissions.js:checkPermissionFlag` exact key overrides global key, checks expiry/conditions | valid for inspected SQL event path | S + T1 passing conditions/history tests; first T1 case aborts before its remaining assertions | Current-state masking is not merely UI hiding. Do not claim the unexecuted assertions after the first realtime failure passed. Vault share filtering uses another path (F09). |
| F06 / snapshot read boundary | Structure §7 and sharing §2.6 require fine property access; persistence Rename and restoration requires authorization | `server/wsAtomeOperations.js:handleSnapshot/requireSnapshotAccess` checks object/project canRead, then returns the entire snapshot for get; `database/adole.js:getStateSnapshot` parses state_blob. Event history uses per-key filtering instead | indeterminate concerning snapshot access granularity; no documented permission exception found in inspected sources | S: protection gap candidate, not a demonstrated live leak | A global read grant plus a denied property may expose that property's snapshot value on this handler. Counter-check: event filtering is separate and restore reauthorizes writes, neither proves snapshot get safe. Reproduce against an isolated snapshot with a denied key before security-completion claims; production vault reachability also needs validation. |
| F07 / share audit trail and SQL boundary | Sharing §§2.1,2.4: decisions persisted; mission: history of shares; persistence Database boundary: SQL belongs in database layer | `server/sharingPermissionService.js:createShare/revokeShare` directly UPDATE/INSERT/DELETE permissions via db.query; `emitPermissionChange` emits only when ABox event bus exists | partially valid for persisted current ACL; contradicted SQL-location rule; share-history completeness indeterminate | S + T1 exact/global grant separation and revocation test | Do not equate current permission rows with immutable grant/revoke history. Counter-check shared invitation/policy workflows in `server/sharing.js` and sync requests: they persist some decisions, but do not establish an append-only journal for this direct service path. No code cleanup in this mission. |
| F08 / obsolete realtime description | Persistence Server entry points and atome-core call graph describe authorized non-durable `atome:realtime` preview | Entire `server/wsAtomeRealtimeOperation.js` validates inputs then returns `canonical_event_commit_required` | contradictory description versus observed implementation; replacement semantics not fully audited | S + T1 FAIL at line 52 (`false !== true`) | Add localized discrepancy notice, not a new preview protocol. Counter-check `eVe/core/atome_commit.js` and event commit path; do not restore a disabled endpoint just to pass its old test. Whether the refusal is the intended product behavior requires decision provenance. |
| F09 / batch and vault/history continuity | Persistence Property lifecycle says transaction commits/rolls back as a whole; eVe essentials §4.4 assigns business state to per-user vault | `server/server.js` attaches `_wsApiVaultRouter`; `wsAtomeOperations.js:handleEvents` delegates batches to it; `userVaultRouter.js:commitBatch` loops and awaits independent `commit`s. `handleHistoryCommand` and `handleSnapshot` still use shared db/SQL helpers without the connection's vault router | partially valid; unconditional batch atomicity conflicts with selected route | S: partial-commit risk and split history ownership; no production failure reproduced | Counter-check SQL `commitAtomeEvents` really is transactional, so its tests do not validate vault batches. Next: isolated failing-second-event batch and history lookup for a vault-only object. Do not mark all-runtime history or atomicity verified. |
| F10 / jail boundary | `eVe/eVe_essentials.md` §4.4 and ARCHITECTURE_MAP Sync: per-user runtime/database/files/socket, FreeBSD target; concept `synthese_solution_auth_securite_zero_knowledge.md` header and §7: definitive Kata/Firecracker microVM | `server/userVaultProvider.js:UserVaultProvider.ensure` forks Node per principal with separate path/socket and random IPC secret; `userVaultProcess.js` selects vault.db and validates actor | contradictory technology claims; user isolation principle consistent | S: process implementation inspected; hostile tenant isolation, production deployment, FreeBSD/microVM not tested | Do not infer an OS jail or independent OS UID from a process or folder: fork supplies no uid/gid here. Existing vault probe uses a hardcoded /tmp socket path; not run because this task confines temporary artifacts to ./temp. Ask scope/authority of the competing conceptual reference, not preferred technology from scratch. |
| F11 / multiple and view-local history | `eVe/concept/eVe.html`, Vue: simultaneous views, eVe root, separately identified view histories; mission preserves this | `project_view_mode_state.js` caches by project and persists `view_mode` through commitBatch on project; universal composition supports references but is not proof of per-view histories | valid as intended requirement; current coverage incomplete | S: one project mode owner inspected; simultaneous independent view-history implementation indeterminate | Natural/List/Matrix exclusivity within one project surface does not refute multiple simultaneous views elsewhere. Inspect view identity/history owners next; do not decide propagation from current project preference storage. |

#### Concept definitions recovered (bounded)

| Concept | Definition and source | Concrete compliant example / invariant | Counterexample and implementation limit |
| --- | --- | --- | --- |
| Atome | Canonical typed description, not its renderer; Structure §§1–2 | One object ID can feed a text or preview projection; identity survives view destruction | A DOM node treated as the sole object. Normalizer inspected; entire type registry not audited. |
| Property / particle | Schema-authorized object value; one particle_key in persistence; Structure §§2,5–7 and persistence Consumer projection | Change color while width remains unchanged; property versions remain traceable | Granting `collection` is not proven nested `collection.0.value` ACL. Atomic key versus semantic aspect must be respected. |
| Operation | Validated intent targeting object/property, with effects using event pipeline; module 05 and persistence Canonical flow | A color set emits an authorized event | A widget mutating durable state directly. Common entry read; every operation not audited. |
| Capability / tool | Capability says what an object supports; tool applies an operation; tool_instance is contextual projection; Structure §2 traits, concept Outillage, archive §18 | A color operation targets compatible capabilities across media | One app-specific color implementation per media. Shared gateway found; universality of all tools not proven. |
| Composition / molecule | Composition connects objects; archived §18 calls molecule a logical grouping; current universal normalizeComposition preserves dependencies/children/ports | A molecule references member Atomes without replacing their identity | Flattening all children into one opaque visual snapshot. Broad philosophical meaning and current timeline-specific Molecule semantics must not be silently equated. |
| View / representation | Disposable contextual presentation of an object; Structure §3; concept Vue | Same identity shown differently, subject to authorization | Calling an independent duplicated object a linked view. Per-view durable history remains unverified. |
| Context / root | Concept Vue names eVe the spatial/temporal root; tool_instance has panel/project/desktop context in archive §18 | The same object is referenced in different documents/contexts | Assuming current project_id defines the only possible object identity. Exact universal context schema not established by this pass. |
| Reference / independent copy | Sharing §2.5 distinguishes linked source identity from detached new Atome | Linked recipient observes owner state; detached copy has a new identity | Treating a snapshot restore to the same ID as a detached copy. Copy pipeline and creator metadata not audited end to end. |
| Jail | User-isolated execution/data environment; essentials §4.4 and mission | Dedicated runtime, DB, file root and access mediation | Merely naming a folder jail. Current process provider does not prove hardware/OS isolation. |
| Fine history / branch | Property/action trace and immutable replay; Time Machine §§1–4 | Restore color by new event without rewriting past events | Editing original historical event rows. Branch identity, merge, recomputation remain awaiting the existing product model. |

#### Executed evidence

Commands were run sequentially with `env -u LIBSQL_URL -u TURSO_DATABASE_URL TMPDIR="$PWD/temp/documentation-audit-20260908" SQUIRREL_SYNC_REMOTE=0 node <probe>`. Each SQLite probe chooses a unique file below that TMPDIR; logs confirmed those paths. No live server, account, shared database, fixture replacement or snapshot update was used. `vitest.config.js` explicitly assigns `.probe.mjs` to standalone Node, unlike `.test.mjs` Vitest suites.

- **T1** `tests/server/atome_property_security.probe.mjs`: **6 passed, 1 failed**. Failure: first case, line 52, realtimeAllowed.success is false, expected true. Source handler returns `canonical_event_commit_required`. Subsequent assertions in that first case were not reached. The six passing cases cover conditions, dynamic read/write/history/sync re-evaluation, exact/global ACL identity and revocation, batch parent creation and parent mutation. This does not prove the production vault path.
- **T2** `tests/database/adole.particle_history_invariants.probe.mjs`: **1 passed**. Color version ordering and stored change columns; no process restart test.
- **T3** `tests/database/adole.snapshot_restore_invariants.probe.mjs`: **1 passed**. Snapshot restore appends events, preserves IDs and sanitizes projection. Database helper test, not snapshot authorization or UI acceptance.
- **T4** `tests/database/adole_history_transactions.probe.mjs`: **5 passed**. Gesture grouping, redo reconstruction from supplied events/cursor, missing tx IDs, non-contiguous tx reuse and history-control classification. Restart is simulated by rebuilding from an array, not a restarted process.
- Total: **13/14 passed; baseline not green**. No test/code edits. Database initialization/close messages were inspected; no additional warning/error was emitted by these four runs.
- Not run: full suite (unnecessary for documentary edits), vault provider probe (hardcoded temporary socket outside ./temp), native/browser visual suites (no UI repair or live acceptance claim). Failed probe remains recorded, not repaired to fit the documentation.

### Lot 3 — UI and cross-check findings

| ID / subject | Documentary intent and source | Observed implementation / precise evidence | Documentary status | Implementation / tests | Action and counter-check |
| --- | --- | --- | --- | --- | --- |
| D04 / HTTP sharing and numeric permissions | `Security_and_sharing.md` §§3.2–3.4 lists HTTP business routes and ADMIN=3; module 05 forbids HTTP business operations | `server/server.js` registers my-files/accessible/share/unshare HTTP handlers; share reaches shareFile. `sharingPermissionService.js:PERMISSION` defines ADMIN=31 and separate bits | contradictory application-transport guidance; numeric table indeterminate for separate file-resource model | S only, handlers not exercised | Added localized warnings; did not call live routes or replace the table with another model. Counter-check: HTTP byte transfers are permitted, but these handlers manage metadata/permissions, not just bytes. A full file-resource audit remains open. |
| U01 / layout and unit | Mission UI principles; DESIGN_MAP Dashboard and main-menu sections | `tool_skin.js` toolSizePx/toolboxSquareSizePx 60; `bevy_ui_main_menu_model.js:resolveBevyMainMenuLayout` bottom and handed edge; shared geometry | partially valid, global ratio/spacing policy indeterminate | S only; no pixels | Added draft UI01–UI05. Dashboard multiplier and differing field geometry are counterexamples to assuming every number must equal 60. Scope question remains open. |
| U02 / popup and floating surfaces | Mission bans popups/floating palettes; DESIGN_MAP Panel Lab Select and global ordering describe both | `bevy_panel_select.js:selectNode` creates shadowed options at controlHeight + menuGap and popupZIndex; root height grows | contradictory to mission; detailed flow claim requires consumer check | S only; no visual validation | Added draft UI06/known discrepancy. Parent root growth means “never expands body flow” cannot be accepted from map text alone. No exception to the mission is inferred. |
| U03 / modes and multiple | Mission distinguishes execution modes from object display modes; concept Vue demands separate view histories | `project_view_mode_state.js` is per-project presentation persistence; no separately identified view-history owner established here | valid intent, partially established mapping | S only; all Edit/Consultation/Performance combinations not audited | Added draft UI07–UI10. Exclusive modes of one surface do not disprove multiple views; do not use current implementation to settle propagation policy. |

The filesystem traversal counted **217 regular files: 216 documentary files plus one `.DS_Store` artifact** (`atome/documentations/graphs/.DS_Store`). The earlier rg count omitted that artifact. It was inventoried but not substantively read or validated; no file was deleted. Documentary totals remain 184 Atome + 32 eVe. Mechanically extracted metadata is intentionally left distinct from manual section review.

### Coverage and next reading boundary

First-pass substantive coverage is the **18 entries D01–D04, F01–F11, U01–U03** above. These are claims/sections, not 18 fully validated documents. All inventory rows remain not audited except their explicitly named claims. Source statements with “valid” mean valid only on the inspected perimeter; implementation statuses and test outcomes are independent.

- Read for entrypoint policy: global and local AGENTS, local modules 01–07, infos, root README opening, both documentation README indexes, current UI procedure, relevant map entries and atome-core graph entry/source/call sections. The global and local instruction copies are not rewritten.
- Foundation sections examined: Atome Structure §§1–9; ADOLE conceptual status and §§1–2; persistence flow/server/property/consumer/database/snapshot/restore sections; Time Machine §§1–7; sharing §§1–4; concept eVe Outillage/Collaboration/History/Vue; eVe essentials §4.4; conflicting security concept header/§7; archive atome_concepts §18; historical branching Product decision/Task 1. Only the listed claims are evaluated, not every sentence in those sections.
- Current code read by targeted ownership chain: canonical normalization → client commit → WS events routing → SQL commit/ACL/history helpers and vault commit route → database event preimages/projection → history/event read filtering; plus share create/revoke/emitter, shared-root ancestry and vault process boundaries. UI reads are limited to mode persistence, menu geometry/tokens and Select projection.
- Not audited: remaining inventory contents; all code call sites; complete type-schema enforcement; manual publication/copy media lifecycle; sound-without-image file-byte authorization; full grant/revoke historical journal; project/vault snapshot and history integration; hostile tenant OS isolation; persistent per-view histories; branch model details; native parity; production account flow; actual UI pixels and thumb access.
- Risk escalation is evidence-specific: T1's failed realtime expectation is reproduced; vault atomicity and snapshot filtering findings are static discrepancies/risks, not reproduced production incidents.

### Open product questions — maximum four, answers pending

1. **Isolation-reference scope.** Established: one isolated user environment. Missing: whether the self-declared definitive Kata/Firecracker reference is an approved replacement for eVe, a separate ThermUSS variant, or an unvalidated proposal. Example: one user environment may run as a FreeBSD jail or a microVM without changing its object/ACL philosophy. Consequence: different references become operational entrypoints. No technology recommendation is treated as approved.
2. **Unit, ratios and spacing.** Established: square structuring and coherent ratios; observed tool unit 60 and Dashboard multiplier 2. Missing: universal allowed unit/ratio/spacing set. Example: a 32 px input and 10 px gap may be a permitted role-specific relation or a deviation. Consequence: different geometry passes/fails the future charter. Non-validated suggestion: explicit named module unit and allowed relations; current numbers remain observations.
3. **Square scope.** Established: square is structural. Missing: exact roles and exceptions. Example: closed tool square, text field or original-ratio video rectangle. Consequence: which rectangles are design violations. Non-validated suggestion: distinguish closed tool geometry, layout module and content aspect ratio before declaring exceptions.
4. **View-local versus shared presentation.** Established: common identity and separately identifiable view histories. Missing: ownership/propagation of zoom, placement and display mode. Example: two references to one object in separate documents; the current project persists view_mode. Consequence: local history versus canonical shared mutation and recipient updates. No presumed propagation policy is applied.

The four questions were sent in the current task. No answer was available when this section was written. No question asks the user to reread the corpus. The no-popup ban and existence of fine sharing/history are already established and were not reopened as preference questions.

### Safe documentary changes

- Added this bounded phase to the existing registry; preserved its earlier audit history.
- Added navigation from both documentation indexes to existing maps, registry, charter draft and canonical UI procedure.
- Corrected the two verified commit/batch line references in the atome-core graph README and scoped the unverified graph claims.
- Added localized discrepancy notices to persistence and sharing documents; preserved normative requirements and historical content.
- Added the non-normative charter preparation to DESIGN_MAP; no token or product behavior changes.
- Added a concise current evidence record and verification backlog link to FRAMEWORK_STATE. No API/CODEMAP/ARCHITECTURE_MAP contract was rewritten because ownership and runtime behavior were not changed.

### Compact resumption point

1. Re-read applicable instructions and this phase, then inspect parent/eVe revisions and diffs. Recheck the hashes/changed symbols of dependent owners; the old baseline does not automatically apply after ongoing development.
2. Normative routing by subject: object → Atome Structure; mutation/history → persistence + Time Machine + module 06; sharing → Security_and_sharing + module 06; jail → essentials §4.4 with the unresolved conceptual-reference conflict; multiple → concept Vue + mission; UI → mission principles + DESIGN_MAP draft (draft questions not rules); diagnostics → how_debug_UI.
3. Lots completed as bounded documentary work: entrypoint/inventory, sampled foundations and critical interactions, UI diagnostic/draft. None establishes full-framework coherence. Failed/absent validations remain visible above.
4. Next lot: UI/API and history/permission consumers, prioritized by F06/F08/F09. Trace the selected per-user vault through history/undo/snapshot reads; run existing isolated coverage for failing-second-event batches if available; inspect schema-level property restoration and live gesture replacement provenance. Follow the existing maps and original owners, not this summary alone.
5. Dependency invalidation: changes to atome_contract/core type registry invalidate F01 and property assumptions; ACL/share ancestry changes invalidate F05–F10 and UI10; event/preimage/snapshot/vault routing changes invalidate F02/F04/F06/F08/F09; project-view identity changes invalidate F11/U03; token/menu/control changes invalidate U01/U02. Also recheck downstream sync/export/history conclusions even if their docs did not change.
6. Preserve unresolved decisions, failed tests and archive ideas. Reuse this registry and the existing State File; do not create another documentation system.

### Final documentary validation

- Parent and eVe `git diff --check`: passed.
- 14 relevant navigation links and their local section anchors: resolved; no missing target. This is not an audit of every link in the corpus.
- Both pre-existing iOS file SHA-256 values still match the baseline above. Only eight existing Markdown files were changed by this task; no persistent file was created, moved or removed.
- All four test logs were read for warnings/errors and actual database paths. The sole failed assertion remains T1 as recorded above. Generated logs were then removed; the four probes removed their isolated databases themselves.
- DOM budget, WebGPU, text service, Matrix preview and native rendering: not exercised; documentary edits introduce no runtime/DOM/state changes.
- Documentation work is complete on the bounded first-pass perimeter; framework acceptance is not green (T1 fails and listed runtime risks remain To verify). No rule, test, production code or data repair was performed.

Dependency fingerprints for a cheap resumption check (SHA-256, code-inspected owners):

- `atome/src/shared/atome_contract.js`: `d29ad0dd9096a6d435b428216bce5b9cba00c89f19c6ef8321b0ac84549032b5`.
- `eVe/core/atome_commit.js`: `ad1b3f85c06f0df4835d92b476c8276e7a25bf99a814c82395e92aa6594f201e`.
- `server/wsAtomeOperations.js`: `cd324183408caa4d11ec00d18e35a803f82b26c2f304a00bffcf1ded1bfd2bf9`.
- `server/atomePropertySecurity.js`: `ffd3ed9ae3e61fadd2b6088f078674c2d10f915de9548946833d3c8583bf2284`.
- `server/atomeHistoryCommands.js`: `715512a148a9d9dac1a76db462539e05b1ba7093ab747346159c20ba7fce70be`.
- `server/userVaultRouter.js`: `1891c1cdec86536b8698e1e324583bc3f77b7f956fb682577a43fce3bbe6504d`.
- `server/sharingPermissionService.js`: `fb0ddba164184100bccd2688a779ed4c3b6b44f369e532199e4eea4b232257f9`.
- `database/adole_event_mutation.js`: `e42e8a9ac39ccae4fca76ea0f829ca82856f721001c3f16b531e4eeab7fe24ab`.
- `eVe/domains/rendering/project_view_mode_state.js`: `147560a85cb5c3bdaac7c7ed0c0ef67ee0fd807e078bb08c149e9dc0549fe852`.
