# Rapport final — Audit complet squirrel-framework / eVe (2026-06-10)

## 1. Résumé exécutif

- **Objectif : partiellement atteint** — périmètre intégralement inventorié et analysé ; corrections appliquées par lots validés ; les optimisations runtime lourdes et les hotspots de taille sont classés en recommandations (pas de mesure de perf runtime disponible sans campagne dédiée).
- Fichiers modifiés : **24** (7 parent + 17 sous-module eVe) ; fichiers créés : **2** (vitest.config.js, tests/molecule/run_molecule_tests.mjs) ; fichiers supprimés : **7**.
- Lignes supprimées : **≈ 510** ; lignes ajoutées : **≈ 105** ; réduction nette : **≈ −405 lignes** (eVe seul : −407 net au diff git).
- Bugs réels corrigés : **2 runtime** (ouverture Molecule sur groupe frais ; probing dimensions média protégé silencieusement mort) + **10 réparations de harnais/tests** (OOM vitest, runner molecule manquant, 2 chemins morts, 6 contrats de tests périmés, 1 incohérence purge dataset).
- Principaux risques : géométrie panneau Molecule (5 checks rouges documentés P1) ; convention de tests hybride (node-style vs vitest) toujours en place ; fichiers >1000 lignes non réduits (hors périmètre minimal).
- Validations réussies : check:syntax (699), check:m0, check:m1 (réparé), test:molecule (réparé, 9 suites), build:npm, probes molecule 8/8 + panel contract majoritairement vert, tests eve node 23/24, gouvernance 2/2, server suites réelles 2/2.
- Validations échouées / non disponibles : benchmarks (NON_DISPONIBLE — aucun benchmark dans le repo) ; tests UI navigateur complets (probes infra-gated :3000 Tauri NON_EXÉCUTÉE) ; adole_commit_boundary.test.mjs KO préexistant (gouvernance de frontière non alignée, hors de mes diffs).

## 2. Changements appliqués

| Type | Fichiers | Changement | Justification | Validation | Risque |
|---|---|---|---|---|---|
| BUG_FIXED | eVe/intuition/eVeIntuition.js | Ouverture Molecule d'un groupe sans host DOM ni timeline persistée : gate accepte le payload d'état canonique ; readGroupStateFromAtome renvoie null si l'atome n'existe pas | Route canvas Bevy = pas de host DOM par Atome ; groupe frais légitime sans timeline ; reproduit sur app live (group_host_missing) | Probe panel_contract : open + chrome + dock + timeline verts ; 8/8 probes non-régression ; m0 | Moyen |
| BUG_FIXED | eVe/intuition/tools/core/tool_runtime.js | hasCreatorMediaAuthQuery vérifie media_user_id (contrat serveur actuel) au lieu des tokens query supprimés | Depuis la release sécurité c2e7120 la fonction renvoyait toujours '' → probing dimensions désactivé | Serveur accepte media_user_id (resolveMediaDownloadIdentity) ; syntax ; m0 | Moyen |
| DEAD_CODE_REMOVED | 7 fichiers (cf. §4) | Suppression | 0 référence prouvée (graphe imports + grep global + git) | syntax 699, m0, build, flower probe | Faible |
| REDUNDANCY_REMOVED | molecule.api.js, molecule.js, authorized_playback_runtime.js, media_persistence_service.js, eVeIntuition.js, communication.js, media_hydration_runtime.js, media_source_runtime.js, tool_runtime.js | Option morte tokenParam supprimée (10 sites) — le récepteur ne la lit plus depuis la release sécurité | appendStreamingMediaAuthQuery supprime les tokens query (l.183) | grep tokenParam = 0 ; molecule tests 12/12 | Faible |
| DUPLICATION_FACTORIZED | eVe/domains/media/asset_box.js | isTauriRuntime local (copie verbatim) → import du canonique adole_api/runtime.js | Canonique documenté CODEMAP (l.826, règle localhost:3000) | syntax, m0 | Faible |
| RUNTIME_BEHAVIOR_FIXED | eVe/intuition/shared/group_state_runtime.js | setGroupStepsOnHost purge les data-* legacy (groupSteps/group_steps/groupMembers), aligné sur setGroupTimelineOnHost | Contrat projection DOM : pas d'état métier en data-* | test dom_contract PASS | Faible |
| BOTTLENECK_FIXED (TEST_TIME) | vitest.config.js (créé) | Exclusion platforms/**, temp, done, todo, Failed, logs, renderers, build, target | vitest balayait les copies d'app dans les artefacts Xcode → OOM/kill | run complet 368 s au lieu de kill | Faible |
| BUG_FIXED (config) | package.json, tests/molecule/run_molecule_tests.mjs (créé) | test:molecule pointait sur un runner supprimé à l'extraction du sous-module → runner recréé sous ./tests | check:m1/m2 cassés en chaîne | test:molecule OK (9 suites) ; check:m1 OK | Faible |
| TEST_ADAPTED | tests/governance/master_cleanup_governance.test.mjs | Chemins todos/* → emplacements réels survivants ; checks des artefacts volontairement supprimés (commits e822f7e3, 882bb75b) retirés | Réorganisation délibérée des dossiers todo | vitest 2/2 | Faible |
| TEST_ADAPTED | tests/eve/media_source.test.mjs, tests/eve/import_media_timeline.test.mjs | Chemins morts eve/application/ → eVe/ | Restructuration eVe en sous-module | node PASS ×2 | Faible |
| TEST_ADAPTED | tests/eve/capture_export_geometry.test.mjs | Aligné sur le placement actuel (dock au-dessus de la toolbar, commit eVe 7cad191) ; paramètre toolRect disparu retiré | Contrat produit changé délibérément | node PASS | Faible |
| TEST_ADAPTED | tests/eve/media_projection_state.dom_contract.test.mjs, tests/eve/group_state_runtime.dom_contract.test.mjs | data-* legacy n'est plus une autorité de lecture | Contrat projection DOM (interdiction data-*) | node PASS ×2 | Faible |
| TEST_ADAPTED | tests/eve/media_fixture_restore_contract.test.mjs | Rendu assert via scène Bevy (findProjectSceneByAtomeId) au lieu du callback DOM legacy renderAtomeRecord | Route de rendu = scène projet Bevy | node PASS (5 fixtures) | Faible |
| TEST_ADAPTED | eVe/core/media_engine/molecule.test.mjs | 3 tests alignés : URLs sans token query (release sécurité) ; mock command bus v2 (architecture Command Bus obligatoire) | Contrats actuels | 12/12 PASS | Faible |
| TEST_ADAPTED | tests/server/notification_stack.test.js, tests/server/state_current_shared.test.js | Forme canonique getAtome → properties ; listStateCurrent → id (contrat { id, type, kind, … } documenté ARCHITECTURE_MAP) | Projection canonique ADOLE | vitest 3/3 + 1/1 PASS | Faible |
| ARCHITECTURE_CLEANUP | maps/API_MAP.md, maps/DESIGN_MAP.md, maps/CODEMAP.md | Références aux fichiers supprimés retirées | Politique maps = contrats actifs | relecture | Faible |

## 3. Bugs trouvés et corrigés

1. **E5 — group_host_missing à l'ouverture Molecule d'un groupe frais** — eVe/intuition/eVeIntuition.js. Cause : sur la route canvas Bevy (zéro host DOM par Atome), le gate hostless exigeait une timeline persistée ; un groupe fraîchement créé n'en a pas. Reproduction : probe Playwright sur app live (création shape+groupe, invoke ui.mtrax.open → {ok:false, error:'group_host_missing'}). Correction minimale : payload d'état canonique accepté comme preuve d'existence (null si état absent). Validation : probe rouge→vert sur molecule_open_invoked, chrome canonique, dock, timeline synthétique ; 8/8 probes molecule non-régression ; existence toujours exigée (id bidon → erreur conservée). Risque résiduel : 5 checks géométrie/visibilité du panneau restent rouges (défaut distinct, P1).
2. **E7 — probing de dimensions des médias protégés silencieusement mort** — tool_runtime.js. Cause : gate hasCreatorMediaAuthQuery exigeait token/access_token/auth_token en query, que la release sécurité c2e7120 supprime systématiquement → retour '' permanent → probeImageDimensionsFromSource toujours null pour les médias protégés (erreur avalée). Correction : gate aligné sur le contrat serveur actuel (media_user_id, accepté par resolveMediaDownloadIdentity). Validation : statique + syntax + m0 (le chemin live exige un média protégé en session).
3. **Incohérence purge dataset (effet de bord)** — group_state_runtime.js : le setter steps laissait les data-* legacy en place alors que le setter timeline les purgeait. Corrigé + test.
4. **Chaîne de validation cassée (config)** — test:molecule → runner inexistant → check:m1/m2 KO ; vitest sans config → OOM sur artefacts iOS. Corrigés (runner + vitest.config.js).

Détectés non corrigés (documentés) : géométrie panneau Molecule (P1, preuves temp/probe_reports/molecule_panel_contract_probe.json) ; adole_commit_boundary KO préexistant (P2) ; convention de tests hybride (P2) ; console.log ×307 en production (P2, interdit par la politique du repo) ; fallback legacy de lecture dataset.groupTimeline encore actif (migration en cours, P3).

## 4. Code mort supprimé

| Fichier | Élément | Preuve d'inutilisation | Statut API publique | Validation |
|---|---|---|---|---|
| eVe/intuition/shared/slider_direct_drag.js | shim ré-export 3 l. (refactor slider SSOT 3c0990a) | graphe imports + grep global = 0 réf | interne eVe (closed) | syntax+m0+build |
| eVe/intuition/shared/slider_tool_values.js | 65 l. helpers dupliqués | 0 réf ; slider_tool_content consomme le builder squirrel canonique | interne | idem |
| eVe/intuition/tools/contextual/flower_menu_visual.js | 326 l. ancien visuel flower | 0 réf ; remplacé par eVe/intuition/flower/* | interne | idem + flower probe |
| atome/src/squirrel/apis/runtime_env.js | 22 l. copie périmée de adole_api/runtime.js | 0 réf | non exposé par exports npm | idem |
| atome/src/application/ui/filerEvents.js | 19 l. stub no-op « disabled » | jamais chargé (aucun HTML/JS) | interne | idem |
| eVe/intuition/components/ui/index.js + panels/ui/index.js | barrels orphelins md5-identiques | 0 réf ; dossiers devenus vides supprimés | interne | idem |

Maps mises à jour en conséquence (API_MAP, DESIGN_MAP, CODEMAP).

## 5. Factorisations réalisées

- **isTauriRuntime** : asset_box.js (copie verbatim, −18 l.) → import du canonique `adole_api/runtime.js` ; bénéfice : la règle documentée localhost:3000→Tauri s'applique désormais aussi à asset_box. `aBox/index.js:446` volontairement non convergé (sémantique différente port-générique→Tauri, plausiblement nécessaire iOS/AUv3 — MANUAL_REVIEW, validation device requise).
- **tokenParam** : 10 sites passaient une option morte → supprimée (cohérence avec le propriétaire unique appendStreamingMediaAuthQuery).

## 6. Optimisations réalisées

| Goulot | Catégorie | Changement | Avant | Après | Validation |
|---|---|---|---|---|---|
| vitest balaye platforms/ios/**/build (copies complètes de l'app) | TEST_TIME / RAM | vitest.config.js excludes | run tué (OOM, exit 137) | run complet 368 s, 346 fichiers | npm run test:run |

Aucune optimisation CPU/RAM runtime appliquée : pas de benchmark dans le repo (NON_MESURÉ) ; les candidats (fichiers >4000 l., 307 logs console, getContext 2d UI) sont en recommandations.

## 7. Mesures avant/après

| Métrique | Avant | Après | Différence | Méthode |
|---|---:|---:|---:|---|
| LOC eVe/ | 230 897 | 230 490 | −407 | cat\|wc -l (git diff : 39+/446−) |
| LOC atome/src/squirrel/ | 73 045* | 73 023 | −22 | cat\|wc -l (*baseline corrigée, 1re mesure tronquée par lots xargs) |
| LOC tests/ | ~65 940 | 66 068 | ≈ +128 | cat\|wc -l (runner + adaptations) |
| dist/squirrel.js | 295 993 o | 295 993 o | 0 | ls (aucun module bundlé touché) |
| Temps build npm | 346 ms | 352–607 ms | bruit machine | rollup |
| vitest run complet | killed (OOM) | 368 s, 120 tests verts | réparé | vitest |
| Fichiers vitest verts | 34 | 37 | +3 | vitest |
| Tests verts / rouges | 116 / 37 | 120 / 32 | +4 / −5 | vitest |
| tests/eve node directs | 15/21 verts | 23/24 verts | +8 | node |
| check:m1 | KO | OK | réparé | npm |
| RAM/CPU scénario principal | NON_MESURÉ | NON_MESURÉ | — | aucun benchmark disponible |

## 8. Éléments non modifiés volontairement

- `eVe/core/{event_store,media_store,project_store,browser_store,tauri_store,ios_store}/` + molecule_store_bootstrap.js — 0 importeur externe MAIS contrats canoniques documentés CODEMAP → **NEEDS_PRODUCT_DECISION** (câbler ou retirer du contrat puis supprimer).
- `atome/src/squirrel/components/intuition_builder/` (7 761 l.) — consommé uniquement par 2 exemples ; documenté « Minimal Intuition builder » → **NEEDS_PRODUCT_DECISION** (DEPRECATION_CANDIDATE majeure).
- Barrels squirrel mail/contacts/calendar/bank/security/voice/index.js — jamais importés en interne ; `atome/src/squirrel/` est publié dans package.json files → **PUBLIC_API_KEEP / DYNAMIC_USAGE_POSSIBLE**.
- `atome/security/cloudSync.js` (362 l., 0 réf), `vie/vie.js`, `persist_bootstrap_runtime.js`, `scripts/phase9_*` et autres CLI — **MANUAL_REVIEW**.
- `apis/update_atome.js` — référencé par un exemple (exemples intouchables) → **KEEP**.
- `aBox/index.js` isTauriRuntime local — **RISK_TOO_HIGH** sans validation device iOS/AUv3.
- ~60 *.test.mjs colocalisés dans atome/src/squirrel/** (politique « tests sous ./tests » violée) — déplacement massif → **NEEDS_PRODUCT_DECISION**.
- 307 console.log/warn/debug en production — nettoyage global = churn massif → traités uniquement dans les fichiers touchés, reste **MANUAL_REVIEW**.
- eVeIntuition.js (17 389 l.) et 19 autres fichiers >2000 l. — réduction structurelle = chantier dédié (plan : extraire d'abord les domaines mtrack-bridge/group-timeline/preview-media d'eVeIntuition vers eVe/intuition/runtime/*, déjà partiellement amorcé par le repo).

## 9. Vérifications finales

- tests : **OK partiel** — suites réelles touchées toutes vertes ; 309 « failed files » vitest = scripts node-style (convention hybride préexistante documentée) + probes infra ; adole_commit_boundary KO préexistant.
- build : **OK** (build:npm, 295 993 o inchangé). lint : **NON_DISPONIBLE** (aucun linter configuré). typage : **NON_DISPONIBLE** (JS pur, politique no-TS). benchmarks : **NON_DISPONIBLE**.
- API publique : **STABLE** (aucun export npm touché ; dist identique ; suppressions = fichiers à 0 référence non exposés par la map exports).
- docs/examples modifiés : **NON** (maps mises à jour = contrats architecture obligatoires, exigés par la politique du repo, pas de la documentation narrative).
- fichiers générés modifiés : **NON** (dist/ régénéré par build uniquement).
- Git : **strictement read-only respecté** — aucune commande git d'écriture exécutée ; tous les changements sont en working tree non commités.
- Conformité Bevy (contrainte utilisateur) : famille legacy de renderers absente (8 noms × 0 réf) ; route projet = Bevy/WebGPU confirmée ; usages getContext('2d') restants = readback/génération de textures pour Bevy + surfaces UI chrome (clock, lasso, ruler MTraX — fallback DOM tick documenté « toléré »).
- Self-check guardrails (module 07 §8) : aucun DOM par Atome ajouté, aucun canvas par Atome, aucun fallback de rendu, aucune mutation hors commit, pas de TS/Python, temp sous ./temp, tests persistants sous ./tests, commentaires/logs en anglais, fichiers touchés non agrandis (eVeIntuition −2 l. net).

## 10. Recommandations restantes

- **P0_CRITICAL** : aucune (rien de bloquant en l'état du working tree).
- **P1_HIGH** : (a) géométrie/visibilité panneau Molecule — 5 checks rouges du contrat maintenu (rows_visible=0, fullscreen edges, splitter ×3), preuves dans temp/probe_reports/ ; effort 1-2 j ; non fait : défaut distinct nécessitant cycle interaction réelle dédié. (b) Décision stores eVe/core/*_store (câbler ou supprimer ~1 500 l. mortes documentées) ; effort décision produit + 0,5 j.
- **P2_MEDIUM** : (a) unifier la convention de tests (node-style vs vitest : 107 fichiers) — soit séparer par glob/nommage, soit migrer ; élimine ~300 faux échecs ; effort 1-2 j. (b) adole_commit_boundary.test.mjs à réaligner sur l'ownership actuel de la sanitization. (c) purge des 307 console.* production (politique du repo) — par lots avec validation. (d) tracker tests/molecule/run_molecule_tests.mjs (gitignore whitelist) sinon le script npm casse sur un clone neuf. (e) statuer sur intuition_builder (7,7 K l. pour 2 exemples).
- **P3_LOW** : (a) réduction des fichiers >2000 l. (eVeIntuition 17,4 K en tête) selon le plan §8. (b) retirer le fallback de lecture dataset.groupTimeline une fois la migration finie. (c) déplacer demo.example.js vers les exemples. (d) basculer clock/lasso/capture 2D vers la route WebGPU à terme (politique « tout rendu WebGPU »).

---
Artefacts d'audit : `.audit/CODE_AUDIT_PROGRESS.md` (checklist complète), `temp/audit_import_graph.mjs` (outil graphe d'imports, rejouable), `temp/probe_reports/molecule_panel_contract_probe.json` (preuves bug Molecule).
