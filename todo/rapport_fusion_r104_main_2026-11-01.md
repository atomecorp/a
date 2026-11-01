# Rapport — fusion R-104 → main, débogage, audit design V5 (2026-11-01)

Mission : `~/Desktop/R104_MAIN_PACKAGE_2026-11-01/mission/` (00–05). Journal des commandes et codes de sortie :
`~/Documents/Sauvegarde-Claude-2026-10-31/r104-main-merge-20261101-140505/PLAN_ET_JOURNAL_CLAUDE.md`.

## 1. Où on en est

- **Phases 0 à 4 faites ; phase 5 faite sauf le push.** `main` n'est **pas** poussé : BUG-012, BUG-013 et
  BUG-014 ne se tranchent que sur un appareil iOS avec une build > 43. Le push attend ton feu vert (mission, doc 01).
- Aucune build publiée, aucun backend touché, aucune donnée réelle modifiée. Aucune branche ni worktree supprimé.
  La copie `temp/r104/bisect/wt_mainwasm` (13 Go) est intacte.

## 2. SHA

| Dépôt | Rôle | SHA |
|---|---|---|
| atome | sauvegarde `backup/main-pre-r104-20261101-140505` = `origin/main` | `515a50b05` |
| eVe | sauvegarde `backup/main-pre-r104-20261101-140505` = `origin/main` | `c77ad2ea` |
| atome | R-104 (`refonte-r104`, publié) | `49aac0d22` |
| eVe | R-104 (`refonte-r104`, publié) | `89905ebc` |
| atome | reliquat de main avant fusion (gitlink c77ad2ea + pbxproj 1.44/43) | `8e48f1ff2` |
| eVe | fusion R-104 → main | `090dab6e` |
| eVe | registre : annotations après fusion | `b2b9fd0a` |
| atome | fusion R-104 → main | `c02dcb734` |
| atome | gitlink → b2b9fd0a | `369e24c59` |
| eVe | BUG-001 caméra arrière au scan | `83556da1` |
| eVe | BUG-006 outil « en cours » | `70c845cf` |
| eVe | BUG-003 date de naissance, âge Sport, contrôle Rencontre | `fb5aa1f0` |
| atome | `normalizeBirthDate` + gitlink → fb5aa1f0 | `668f7ead7` |
| eVe | FRAMEWORK_STATE §5 | `8dfc88ed` |
| atome | registre annoté, R-107, cartes, gitlink → 8dfc88ed | `a685e537c` |
| atome | ce rapport | commit suivant |

## 3. État distant (lecture `git ls-remote`, 2026-11-01 15:4x)

- atome : `main` = `515a50b05`, `refonte-r104` = `49aac0d22`, `backup/main-pre-r104-20261101-140505` = `515a50b05`.
- eVe : `main` = `c77ad2ea`, `refonte-r104` = `89905ebc`, `backup/main-pre-r104-20261101-140505` = `c77ad2ea`.
- Aucun changement distant imprévu. Les deux `main` locaux descendent de leur `origin/main` (avance rapide possible,
  sans force) : atome 6 commits devant, eVe 7.
- Push prévu après ton feu vert : eVe `main` puis atome `main`, sans force, puis vérification `ls-remote`.

## 4. Fichiers réellement modifiés après la fusion

Code eVe : `domains/dashboard/dashboard_mystic_capture.js`, `dashboard_communication_input.js`,
`dashboard_ongoing_resume.js`, `domains/training/training_runtime.js`,
`intuition/runtime/bevy_panel/bevy_panel_home_access.js`, `bevy_panel_home_actions.js`, `bevy_panel_home_view.js`,
`bevy_panel_home_runtime.js`, **nouveau** `bevy_panel_home_birth.js`. Code atome : `atome/src/shared/meeting_contract.js`.
Docs : `eVe/documentations/FRAMEWORK_STATE.md`, `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md`,
`todo/REGISTRE_DEMANDES.md` (R-104 mis à jour, R-107 ajouté), `todo/registre_debug_r104_2026-11-01.md` (registre 03
complet, un bloc « Résultat 2026-11-01 » par entrée), ce rapport.
Fusion : eVe 206 fichiers, atome 158 fichiers (conflits résolus un par un, détail dans le journal ; moteur de rendu
identique à `515a50b05`).

## 5. Tests (Web uniquement ; appareil = toi)

| Commande / sonde | Code | Résultat |
|---|---|---|
| `temp/r104merge/probes/project_open_real.probe.mjs` (BUG-012/013) | 0 | 0 échec (création, forme, rechargement, 2 réouvertures) |
| `temp/r104merge/probes/project_tools_real.probe.mjs` (BUG-015) | 0 | 18/18 |
| `temp/r104merge/probes/project_shape_color.probe.mjs` | 0 | Couleur appliquée, stockée, rendue |
| `temp/r104merge/probes/sport_countdown_real.probe.mjs` (BUG-014) | 0 | 0 échec sur main et sur R-104 |
| `temp/r104merge/probes/birth_rollers.probe.mjs` (BUG-003) | 0 | 4/4 |
| `agents/products_scan/scan.probe.mjs` + `camera_side.probe.mjs` (BUG-001, REG-002) | 0 | 7/7 ; caméra arrière rouge avant, vert après |
| `agents/sport_ongoing/a_home_and_back.probe.mjs` (BUG-006) | 0 | 9/9 |
| `agents/sport_ongoing/d_variants.probe.mjs RELOAD=1` | 0 | 8/8 |
| `npm run check:syntax` | 0 | 3845 fichiers |
| `npm run check:no-fallbacks` | 0 | OK |
| `npm run check:component-reuse-guardrails` | 0 | 9 règles OK |
| `npm run check:browser-shared-contract-imports` | 0 | OK |
| `npm run check:mutation-ownership-guardrails` | 0 | OK |
| `npm run check:dom-projection-guardrails` | 0 | OK |
| `npm run check:empty-catch-budget` | 0 | 356 / 437 |
| `npm run check:map-paths` | 0 | 0/0 |
| `npm run registry:check` | 1 puis 0 | `beauty.open` non annoté après fusion → annoté (`b2b9fd0a`) → OK |
| `./scripts/XCode_testflight_generator --dry-run` | 0 | 1.45 (43) → **1.46 (44)**, rien modifié, aucun archive/envoi |

Journaux : `temp/r104merge/verify/`. Échecs restants : aucun.

## 6. Non vérifié

- **Appareil iOS** : BUG-012/013 (cause établie : moteur de rendu `cb26d7cb` de la build 43 ; main a le correctif),
  BUG-014 (non reproduit sur Web), lecture de code-barres native (pas de `BarcodeDetector` dans WKWebView).
- **Montre** (BUG-007/008) : revue de code seulement ; correctifs E1–E4 / S1–S3 décrits, non appliqués (Swift, build
  nécessaire) ; protocole `temp/r104merge/agents/watch/protocole_montre.md`.
- Tauri, Android, Basic vs Pro pour les outils de projet.

## 7. Décisions attendues (aucune n'est codée)

Détail : R-107 de `todo/REGISTRE_DEMANDES.md` et `todo/registre_debug_r104_2026-11-01.md`.

1. **Push** de `main` (eVe puis atome) : maintenant, ou après ton essai d'une build 1.46 (44) ?
2. **Design V5** D1–D6 : `temp/r104merge/design_v5/AUDIT_DESIGN_V5.md`, maquette `mockups/m1_tuiles_v5.png`.
3. BUG-005 « En direct » sans Stop : (a) Stop au pied de « En direct », (b) l'outil ▶ ouvre la fiche.
4. BUG-006 : outil ▶ recouvert par un panneau sur téléphone.
5. BUG-010 : 6 outils impossibles à 402/393 pt : (1) bande hors pied, (2) bord à bord, (3) 3+3.
6. BUG-011 : Retouche ouvre l'import avec Médias déplié et Images allumé (change la règle 18) ?
7. BUG-004 : poids/taille en rouleaux (la règle 14 dit ligne-curseur) ?
8. REG-002 : case Photo aussi dans les catégories de Prod. ?
9. BUG-002 : sélection multiple (nouvelle fonction), appui long en vue Liste, Compléments sans appui long.
10. REG-001 : quel « numéro de série » (jamais affiché dans l'historique) ?
11. BUG-009 : page refusant l'encadrement (contrôle serveur ou autre moteur).
12. TÂCHE-002, 003, 009, 010–014 : maquettes à produire.

## 8. Notes de version proposées pour 1.46 (44)

Le dépôt n'a pas de fichier de notes de version iOS (seulement Android) ; texte proposé pour TestFlight « À tester » :

- Ouvrir et créer un projet ne renvoie plus au Dashboard (moteur de rendu corrigé).
- Scan de code-barres : toujours avec la caméra arrière.
- Date de naissance réglée sur des rouleaux jour / mois / année ; l'âge du Sport et l'accès à Rencontre la lisent correctement.
- L'outil « en cours » apparaît dès qu'une activité tourne, même démarrée pendant le chargement ; une reprise échouée est retentée.
- Fusion de la refonte R-104 (registre global, MCP, Santé, Carnet).
- À tester : décompte Sport (BUG-014), ouverture de projet (BUG-012/013), montre (protocole joint).
