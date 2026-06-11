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
