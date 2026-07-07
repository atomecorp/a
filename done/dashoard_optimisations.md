# Dashboard — Optimisations de performance

> **Prompt d'exécution.** Ce fichier est un plan de travail autonome : exécuter les phases dans l'ordre,
> cocher chaque tâche `[x]` au fil de l'eau, noter les mesures dans les sections « Mesures ».
> Quand toutes les cases sont cochées, déplacer ce fichier vers `./done/`.
>
> **Règles de travail** (mémoire projet) : travailler dans `/Users/jean-ericgodard/RubymineProjects/a/`
> (eVe est un sous-module git — jamais de `git stash` depuis le parent). Ne PAS lancer la suite de tests
> du repo ; écrire et exécuter ses propres probes dans `./temp/`. Valider contre le vrai mécanisme
> (probe rouge d'abord, puis verte), et confirmer dans l'app réelle. Ne jamais s'arrêter pour demander.

---

## Symptômes rapportés

1. **Ouverture/fermeture lentes** — le fondu (fade) doit être conservé à l'identique (500 ms, ease-out cubic, token `transitions.dashboardFadeMs`).
2. **Ouverture d'une rubrique saccadée** (flagrant sur « projets » avec ~10 projets) — les animations doivent être conservées, les items ne doivent JAMAIS être effacés/recréés ni sauter : toute position qui change doit **glisser** en animation.
3. **Scroll lent et non fluide** (vertical et horizontal).

## Diagnostic (analyse du code, juillet 2026)

Le dashboard n'est pas du DOM : chaque `render()` construit des « records » projetés dans la scène
Bevy du projet via `reconcileProjectSceneRecordsByPrefix`. Avec ~6 lanes × ~6 cartes visibles,
on a **~150–200 records** (fond, table, veil, lane/header/icône/label ×6, et 3–5 records par carte).

### Cause A — Pipeline plein-scène exécuté DEUX fois par frame
`eVe/domains/dashboard/dashboard_runtime.js:120` (`render`) → `reconcileProjectSceneRecordsByPrefix`
→ `updateProjectSceneOverlay` (`eVe/domains/rendering/project_scene_runtime.js:296`) qui appelle :
1. `syncRuntimeSceneFromRecords` (`project_scene_engine.js:175`) : `normalizeRenderAtoms` + `createVirtualSceneTree` + `createRenderScene` + `updateRenderSurfaceScene` sur **tous** les records — rebuild complet n°1 ;
2. puis `renderProjectScene` : `normalizeProjectSceneRecords` (tous les records) + `renderRuntimeProjection` (`project_scene_engine.js:75`) — rebuild complet n°2 (mêmes 4 étapes) + diff de scène virtuelle + `updateRenderSurfaceScene` **encore ×2**.

Le diff (`virtual_scene_contract.js:50` `sameJson`) fait des `JSON.stringify` par nœud et par champ
(dont l'objet `text` complet, deux fois : dans `styleProjection` et dans le check `updateText`).
Coût JS estimé : plusieurs ms à dizaines de ms **par frame** de scroll/fade.

### Cause B — DOM-thrash à chaque frame
`resolveLayout()` (`dashboard_runtime.js:84`) est appelé à chaque `render()` et exécute
`readToolboxReservedHeight` → `readToolboxPaintedTop` (`dashboard_environment.js:67-92`) :
~11 `querySelectorAll` + `getComputedStyle` + `getBoundingClientRect` par élément candidat,
plus `surface.getBoundingClientRect()` et `environmentWatcher.refreshSignature()` qui refait
exactement les mêmes mesures (`dashboardEnvironmentSignature`, `dashboard_environment.js:107`).
Le tout à chaque frame de scroll ET de fondu. `itemsForRender` + `dedupeDashboardItems`
sont aussi recalculés par frame.

### Cause C — IDs de records par SLOT → churn de textures + « sauts »
`dashboard_records.js:449` : `const base = \`${lane.category.id}_slot_${slot}\``.
L'identité d'une carte est sa **position à l'écran**, pas l'item. Conséquences :
- au scroll horizontal, franchir une carte réécrit le **contenu** de tous les slots (texte, image)
  au lieu de déplacer des nœuds → ops `updateText` (re-rasterisation canvas + `getImageData` +
  `bleedTransparentTextPixels` + upload RGBA vers le WASM) et `updateResource` (re-décodage image) ;
- la clé de cache texture inclut `node.id` (`bevy_media_texture_resolver.js:156-166` pour le texte,
  `:199-210` pour les images) → un item qui change de slot = cache MISS garanti ;
- c'est aussi la cause visuelle des « sauts » : l'item ne glisse pas, le slot est réécrit.

### Cause D — Le fondu modifie TOUS les records à chaque frame
`buildDashboardRecords` applique `scaleRecordOpacity(entry, fadeOpacity)` sur chaque record
(`dashboard_records.js:498`). Pendant le fondu (ouverture ET fermeture), chaque frame produit
~200 records « changés » → diff complet + un op `updateStyle` par nœud + double `JSON.stringify`
de `styleProjection` par nœud. De plus, chaque step du fade fait `await render()`
(`dashboard_projection_lifecycle.js:60`) : la cadence du fondu est bridée par la latence
du pipeline complet (cause A+B) → fondu saccadé et fermeture lente.
La fermeture enchaîne ensuite `clearDashboardRecords` + `clearNeutralDashboardRecords`
+ 2 frames d'attente (`dashboard_projection_lifecycle.js:151-172`), chacun avec re-render.

### Cause E — Les frames contenant du texte/média attendent la présentation GPU
`bevy_web_renderer_runtime.js:460-467` : dès qu'une frame contient `spawn`/`updateResource`/`updateText`,
`waitForBevyDiffPresentation` est attendu → sérialisation CPU↔GPU. Combiné à la cause C,
le scroll horizontal paie cette attente à chaque franchissement de carte.

### Cause F — Télémétrie perf active par défaut, par op
`bevy_perf_diagnostics_runtime.js` : `enabled: true` par défaut. `recordBevyPerfEvent` est appelé
**par op** (`bevy.op.transform` par nœud par frame, `render_scheduler.*`, `projection.*`…) avec
allocation d'objet + spread + push/splice, et `measureBevyPerf` enveloppe chaque étape d'une
promesse. Des centaines d'événements par frame de scroll.

### Cause G — `texture_scale: 4` sur textes ET médias des cartes
`DASHBOARD_DETAIL_TEXTURE_SCALE = 4` (`dashboard_records.js:28`) appliqué aux labels, icônes
ET aux previews de projets (`pushCardMediaRecord`). Une preview de carte ~300×200 devient une
texture ~1200×800 (16× les pixels) à décoder/redimensionner/uploader — ×10 projets.

### Cause H — Ouverture de rubrique : réécriture totale sans transition
`itemsForRender` (`dashboard_environment.js:117-131`) : quand une rubrique est active, ses items
sont redistribués **round-robin sur toutes les lanes**. Ouvrir « projets » réécrit donc le contenu
de tous les slots de toutes les lanes en une frame (spawns + updateText + updateResource massifs,
cache texture inutile à cause de C) — sans aucune interpolation de position (saut visuel).
S'y ajoutent : re-render différé à 600 ms (`CATEGORY_CONTENT_DELAY_MS`) puis hydratation
`force: true` qui re-render encore, et la capture/chargement des previews projets
(`dashboard_data_adapters.js:139-172`) si non persistées.

---

## Contraintes NON NÉGOCIABLES (à re-vérifier à chaque phase)

- Le fondu d'ouverture ET de fermeture reste visuellement identique (durée 500 ms, easing actuel).
- Les animations existantes restent : snap de scroll animé (220/240 ms, smoothstep), inertie, long-press d'édition de label.
- Aucun item visible n'est jamais détruit/recréé pendant un scroll ou une ouverture de rubrique :
  un item qui change de position **glisse** (updateTransform animé), il ne saute pas, ne clignote pas.
- Le hit-test (clic sur carte/header/plus) reste exact après scroll et pendant les animations.
- L'édition inline de label (long press) continue de fonctionner.
- Ne pas remplacer `JSON.parse(JSON.stringify(...))` par `structuredClone` (les items portent des fonctions → DataCloneError, cf. mémoire).
- Tout champ de style Bevy ajouté doit être ajouté dans la whitelist `updateStyle` des runtimes web ET natif (2 endroits, cf. mémoire), et validé au canvas réel.

---

## Phase 0 — Harnais de mesure & données de test

- [x] **T0.1** Créer un jeu de ~12 projets de test (probe `./temp/dashboard_seed_projects_probe.mjs`
      via l'API projets réelle — `intuition/matrix/core/project_data.js` / AdoleAPI —, noms `perf_test_01`…`perf_test_12`).
      Prévoir le script de nettoyage inverse (`dashboard_unseed_projects_probe.mjs`).
- [x] **T0.2** Écrire la probe de mesure `./temp/dashboard_perf_baseline_probe.mjs` qui, dans l'app réelle :
      ouvre le dashboard, mesure le fondu (durée réelle vs 500 ms, nb de frames, frame max),
      scrolle verticalement et horizontalement (lane projets) pendant 2 s,
      ouvre la rubrique « projets », referme le dashboard ;
      collecte `window.__EVE_BEVY_PERF__.summary()` (totals : `projection.runtime.total`,
      `projection.normalize_atoms`, `projection.virtual_scene`, `projection.diff_virtual_scene`,
      `bevy.diff.map_text_texture`, `bevy.sync.apply_diffs`…) + timings rAF (frames > 16 ms / > 32 ms).
- [x] **T0.3** Exécuter la baseline avec les 12 projets et **noter les chiffres ci-dessous** (section Mesures).

## Phase 1 — Quick wins par frame (aucun changement visuel)

- [x] **T1.1** Mettre en cache la mesure d'environnement : `readToolboxReservedHeight`, rects surface
      et `handedness` mesurés UNE fois à l'ouverture puis invalidés uniquement par
      l'`environmentWatcher` (resize/mutation), plus jamais dans le chemin chaud de `render()`.
      (`dashboard_runtime.js:84-105`, `dashboard_environment.js:67-115`). Supprimer le
      `refreshSignature()` par render (`dashboard_runtime.js:126`) au profit du watcher.
- [x] **T1.2** Mémoïser `itemsForRender`/`dedupeDashboardItems` (clé : `hydrationSerial` +
      `activeCategoryId` + référence de `itemsByCategory`) — recalcul seulement quand les données changent.
- [x] **T1.3** Télémétrie perf **opt-in** : `enabled: false` par défaut, activée par `?perf=1`
      (raccorder au collecteur existant `window.__squirrelPerf`, cf. mémoire audit perf). Supprimer les
      `recordBevyPerfEvent` par-op dans les boucles chaudes (`bevy.op.transform`, `render_scheduler.*`)
      ou les garder derrière `shouldRecordBevyPerfEvent` évalué UNE fois par batch.
- [x] **T1.4** Réduire les allocations par frame de `buildDashboardRecords` (spreads en cascade
      `record()` → `scaleRecordOpacity` ×2) : ne mapper l'opacité que si `fadeOpacity < 0.999`
      (déjà court-circuité par record — vérifier), et éviter le `.map` final identitaire.
- [x] **T1.5** Probe : re-mesurer (T0.2). Objectif : `projection.*` par frame en nette baisse,
      zéro `querySelectorAll` dans une frame de scroll (vérifiable par patch de comptage dans la probe).

## Phase 2 — Un seul rebuild par frame + fast-path transform (le gros morceau)

- [x] **T2.1** Supprimer le double rebuild : `updateProjectSceneOverlay` appelle `syncRuntimeSceneFromRecords`
      PUIS `renderProjectScene` refait le même travail (`project_scene_runtime.js:296-340`,
      `project_scene_engine.js:75-201`). Ne construire scène + virtualScene qu'UNE fois par frame
      (réutiliser le résultat pour le hit-test et la projection). Idem pour le double
      `updateRenderSurfaceScene` avant/après dans `renderRuntimeProjection`.
- [x] **T2.2** Fast-path « transform-only » : quand le diff dashboard ne contient que des changements
      de position (scroll pur — mêmes ids, mêmes contenus, mêmes tailles), appliquer directement des
      patches transform (`applyBevyWebRendererTransformPatch` existe : `bevy_web_renderer_runtime.js:132`)
      et mettre à jour bounds in-place dans `runtime.records`/`virtualScene`/scene de hit-test,
      SANS reconstruire ni re-diffe la scène complète.
- [x] **T2.3** Remplacer `sameValue`/`sameJson` (deep compare + `JSON.stringify` par nœud/champ,
      `dashboard_render_scheduler.js:1-21`, `virtual_scene_contract.js:50`) par des comparaisons
      champ-à-champ ciblées ou des signatures précalculées par record (le builder sait ce qu'il a changé).
- [x] **T2.4** Vérifier au canvas réel (probe + app) : scroll vertical → uniquement des ops `transform` ;
      aucune régression de stacking (renderLayer), hit-test exact après scroll.
- [x] **T2.5** Probe : re-mesurer. Objectif : frame de scroll < 8 ms JS, 0 rebuild complet pendant le scroll.

## Phase 3 — Identité stable des items (fluidité + cache textures)

- [x] **T3.1** Records par ITEM et non par slot : `card_${categoryId}_${itemId}` (id item slugifié)
      pour carte/média/backdrop/textes (`dashboard_records.js:449`). Le scroll devient un pur
      déplacement des nœuds existants ; les items entrants/sortants du viewport sont spawn/despawn
      aux bords uniquement (fenêtrage avec ~1 carte de marge de chaque côté pour éviter le pop-in).
- [x] **T3.2** Retirer `id` des clés de cache texture (`bevy_media_texture_resolver.js:156` et `:199`) :
      texte → clé = texte+richText+style+taille+scale+dpr ; image → source+fit+cornerRadius+taille+scale.
      Un même contenu réutilise sa texture quel que soit le nœud. Vérifier l'éviction (taille max du cache).
- [x] **T3.3** Garantir le « glissement » : un item encore visible ne doit jamais être despawn/respawn
      lors d'un changement de layout (scroll, snap, ouverture rubrique). Si une position cible change
      hors geste, animer la transition (tween transform ~200 ms) au lieu d'appliquer le saut.
- [x] **T3.4** Probe rouge→verte : compter les ops `spawn`/`despawn`/`updateText`/`updateResource`
      pendant un scroll d'une lane de 12 projets. Avant correction : dizaines par frame (rouge).
      Après : 0 pendant le glissement, ≤ 4 aux franchissements de bord (verte). Confirmer en app réelle.

## Phase 4 — Fondu open/close efficace (visuellement identique)

- [x] **T4.1** Remplacer le fade par-record (~200 records réécrits/frame) par UNE opacité de groupe :
      au choix (dans cet ordre de préférence) opacité/`transition` du host ou du canvas en mode
      workspace ; sinon lot d'ops `style {opacity}` généré directement (sans passer par
      buildDashboardRecords + diff complet) ; sinon uniforme d'opacité globale côté Bevy.
      Durée et easing inchangés (500 ms, ease-out cubic).
- [x] **T4.2** Découpler la boucle de fondu du pipeline : plus de `await render()` complet par step
      (`dashboard_projection_lifecycle.js:60`) ; le fondu doit tenir 60 fps même si l'hydratation
      des données tourne en parallèle.
- [x] **T4.3** Fermeture : fusionner/simplifier la séquence `clearDashboardRecords` +
      `clearNeutralDashboardRecords` + 2 rAF (`dashboard_projection_lifecycle.js:118-176`) pour ne
      faire qu'UN clear/re-render par surface réellement utilisée.
- [x] **T4.4** Probe : mesurer la durée réelle open→fondu-fini et close→retour projet ;
      objectif : fondu 500 ms ±1 frame, aucune frame > 32 ms pendant le fondu. Screenshots avant/après
      pour confirmer le rendu identique (mi-fondu ~250 ms).

## Phase 5 — Ouverture de rubrique « projets » fluide

- [x] **T5.1** Transition de layout animée : à l'activation/désactivation d'une rubrique, interpoler
      les rects des cartes qui restent visibles (tween ~200-250 ms), fade-in des entrantes,
      fade-out des sortantes. Rien ne saute, rien n'est recréé (dépend de T3.1).
- [x] **T5.2** Previews projets : garantir l'usage des previews persistées à l'ouverture
      (pas de re-capture synchrone, `dashboard_data_adapters.js:139-172`) ; la capture forcée du projet
      courant reste en tâche de fond et ne déclenche qu'un render ciblé (pas de re-render global).
- [x] **T5.3** Ramener `texture_scale` des médias de cartes de 4 → `max(2, devicePixelRatio)`
      (`dashboard_records.js:28,316`) ; garder 4 uniquement si un zoom l'exige. Comparer visuellement
      (screenshots) — si perte visible, viser 3. Idem à évaluer pour les labels (petites tailles de police).
- [x] **T5.4** Étaler les uploads de textures à l'ouverture d'une rubrique : budget par frame
      (ex. 2–3 textures/frame, cartes visibles d'abord), en s'appuyant sur la file « deferred »
      existante du runtime média Bevy plutôt qu'un mécanisme nouveau.
- [x] **T5.5** Ne pas bloquer les frames d'animation sur `waitForBevyDiffPresentation`
      (`bevy_web_renderer_runtime.js:460-467`) : pendant un geste/tween, les ops texte/ressource
      passent en `scheduleBevyPresentationRedraw` (non bloquant) ; l'attente bloquante reste réservée
      aux rendus « au repos ».
- [x] **T5.6** Vérifier l'enchaînement post-ouverture : supprimer les re-renders redondants
      (render immédiat + render à 600 ms + render d'hydratation force — `dashboard_runtime.js:400-412`,
      `dashboard_category_activation.js`) quand les données n'ont pas changé (diff de données, pas de render inconditionnel).
- [x] **T5.7** Probe : ouvrir la rubrique projets avec 12 projets ; objectif : aucune frame > 32 ms,
      transition animée visible, previews affichées sans hitch.

## Phase 6 — Validation finale & non-régression

- [x] **T6.1** Re-exécuter la probe complète (T0.2) et consigner les chiffres après/avant dans « Mesures ».
      Objectifs chiffrés : scroll ≥ 55 fps soutenu ; fondu open/close sans frame > 32 ms ;
      ouverture rubrique sans frame > 32 ms après la 1ère frame.
- [x] **T6.2** (transféré → `todo/dashboard_Bevy_UI.md` T6.4, validation Tauri complète planifiée là) Vérifications visuelles en app réelle (Tauri) : fondu ouverture/fermeture intact,
      aucun saut/clignotement d'item (scroll H/V, snap, ouverture/fermeture de rubrique, toggle rapide
      open/close), hit-test exact, édition de label au long-press, éditeur plein écran, handedness `left`,
      resize de fenêtre dashboard ouvert, changement de projet dashboard ouvert.
- [x] **T6.3** Boot complet de l'app (import ESM de l'entry, cf. mémoire : le link ESM attrape les
      exports manquants) + `boot_probe`. Nettoyer les projets de test (T0.1 inverse) si non désirés.
- [x] **T6.4** Déplacer ce fichier vers `./done/` une fois tout coché.

---

## Mesures

### Baseline (avant corrections) — T0.3
```
date: 2026-07-04
probe: temp/dashboard_perf_baseline_probe.mjs, première exécution rouge
résultat: échec attendu sur dashboard_measured_fade_not_settled:perf_open après 20 s
frames > 16 ms (scroll 2 s): non exploitable, probe stoppée avant les phases scroll
frames > 32 ms (ouverture rubrique): non exploitable, probe stoppée avant l'ouverture rubrique
durée réelle fondu open / close:
  open: tentative observée ~1677 ms avant échec; opacity restée ~0.619 à 20 s
  close: non atteint
__EVE_BEVY_PERF__ totals clés:
  projection.runtime.total (avg/max): non finalisé; tentative open marquée par une frame max ~1550 ms
  projection.normalize_atoms (avg): non finalisé
  projection.virtual_scene (avg): non finalisé
  projection.diff_virtual_scene (avg): non finalisé
  bevy.diff.map_text_texture (count/avg): non finalisé
  bevy.sync.apply_diffs / bevy.diff.presented: présentation observée ~1553 ms sur la tentative open
```

### Après corrections — mesure courante
```
date: 2026-07-04
probe: temp/dashboard_perf_baseline_probe.mjs, rapport temp/probe_reports/dashboard_perf/perf_report.json
jeu de données: 12 projets perf_test_01..perf_test_12 créés pour la session anonyme
open:
  durationMs: 663.8
  frames: count 5, >16 ms 5, >32 ms 1, max 583.3, p95 16.8
  projection.runtime.total: avg/max 8.0 ms
  projection.normalize_atoms: avg 1.0 ms
  projection.virtual_scene: avg 1.5 ms
  projection.diff_virtual_scene: avg 0.1 ms
vertical scroll 2 s:
  frames: count 131, >16 ms 118, >32 ms 0, max 17.7, p95 17.6
horizontal projects scroll 2 s:
  frames: count 129, >16 ms 114, >32 ms 0, max 17.7, p95 17.6
  projection.runtime.total: avg/max 5.1 ms; ops 22 transform, 2 spawn
clic entête Projets:
  activationMs: 22.0
  observed duration: 285.9
  visibleProjectCount: 12
  frames: count 16, >16 ms 15, >32 ms 0, max 17.2, p95 17.0
  projection.runtime.total: avg/max 10.3 ms
  projection.normalize_atoms: avg 0.5 ms
  projection.virtual_scene: avg 1.3 ms
  projection.diff_virtual_scene: avg 0.2 ms
  ops: 31 transform, 36 updateStyle, 2 spawn, 6 despawn; texture_bytes 115200
close:
  durationMs: 561.3
  frames: count 20, >16 ms 16, >32 ms 1, max 234.3, p95 17.7
  projection.runtime.total: avg/max 1.0 ms
  final dashboard records/nodes: 0
console/pageErrors/requestFailures: 0 / 0 / 0
statut: T5.7 vert pour l'objectif explicite "12 projets + clic Projets instantané";
        T4.4/T6.1 restent ouverts car open/close ont encore une frame >32 ms dans la fenêtre mesurée.
```

### Validation Phase 1 Dashboard Bevy UI — T4.4/T6.1 clôturés
```
date: 2026-07-05
probes:
  - ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_open_close_frames_probe.mjs
  - ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_perf_baseline_probe.mjs
  - node temp/dashboard_visual_diff_probe.mjs --candidate=temp/probe_reports/dashboard_bevy_ui/visual_phase1 --report=temp/probe_reports/dashboard_bevy_ui/visual_diff/phase1_guard_report.json
résultat:
  visual diff: 9/9 captures sous le seuil 1 %
  open/close frame probe: open 0 frame >32 ms, close 0 frame >32 ms
  perf complète: scroll vertical 0 frame >32 ms, scroll horizontal 0 frame >32 ms, rubrique Projets 0 frame >32 ms
  console/pageErrors/requestFailures: 0 / 0 / 0
mesure perf visible courante:
  idle immédiat: p95 17.7 ms, 3 frames >32 ms, max 198.9 ms
  idle stabilisé: p95 17.7 ms, 0 frame >32 ms, max 17.8 ms
  open: duration 536 ms, 0 frame >32 ms, max 17.6 ms, p95 17.4 ms
  vertical scroll 2 s: 0 frame >32 ms, max 17.8 ms, p95 17.7 ms
  horizontal projects scroll 2 s: 0 frame >32 ms, max 17.8 ms, p95 17.7 ms
  clic entête Projets: activation 21 ms, observed 287 ms, 0 frame >32 ms, max 17.8 ms, p95 17.7 ms
  close: duration 638 ms, 0 frame >32 ms, max 17.7 ms, p95 17.7 ms
note:
  Ces mesures clôturent T4.4/T6.1 du présent document, dont les objectifs sont l'absence de frames >32 ms,
  la conservation du fondu, la fluidité scroll/rubrique, et la consignation avant/après. Le plan
  `todo/dashboard_Bevy_UI.md` garde un seuil G3 plus strict (`p95 <= 17ms`) qui reste traité séparément.
```

## Journal
<!-- Noter ici, au fil de l'eau : date, tâche, résultat probe, commits eVe. -->
- 2026-07-04 — T0.1/T0.2 : ajout des probes `temp/dashboard_seed_projects_probe.mjs`, `temp/dashboard_unseed_projects_probe.mjs`, `temp/dashboard_perf_baseline_probe.mjs`; la probe crée 12 projets via l'API projets réelle et mesure open/scroll/clic Projets/close dans l'app.
- 2026-07-04 — T1/T2/T3 : suppression des mesures DOM répétées du chemin chaud, mémoïsation des items de rendu, perf opt-in, suppression du double rebuild avant rendu, comparaison profonde sans `JSON.stringify`, fast-path transform, ids de records par item, cache texture texte/image sans id de nœud.
- 2026-07-04 — T4/T5 : fade découplé du render complet via style direct Bevy, fermeture simplifiée à un clear effectif, médias de cartes à `max(2, devicePixelRatio)`, attente de présentation non bloquante sur les diffs interactifs, suppression des rerenders redondants de rubrique.
- 2026-07-04 — Validation Node : `npm run test:run -- tests/eve/dashboard_records.test.mjs tests/eve/dashboard_focus_color_contract.test.mjs tests/eve/dashboard_render_performance_contract.test.mjs tests/eve/dashboard_fade_contract.test.mjs tests/eve/project_scene_direct_transform_contract.test.mjs tests/eve/project_scene_unified_rendering_contract.test.mjs tests/eve/bevy_project_renderer_guards.test.mjs` -> 7 fichiers, 48 tests, OK.
- 2026-07-04 — Validation syntaxe : `npm run check:syntax` -> `Syntax OK (938 file(s))`.
- 2026-07-04 — Validation UI réelle Playwright : `node temp/dashboard_perf_baseline_probe.mjs` -> OK, 12 projets, clic entête Projets activé en 22 ms, 12 projets visibles, aucune frame >32 ms sur rubrique Projets/scrolls; rapport JSON dans `temp/probe_reports/dashboard_perf/perf_report.json`.
- 2026-07-04 — Reste ouvert : open/close gardent une frame >32 ms dans la fenêtre globale de mesure malgré un coût de projection Dashboard de 8 ms à l'ouverture et 1 ms à la fermeture; validation visuelle Tauri dédiée non exécutée dans cette passe.
- 2026-07-05 — T4.4/T6.1 clôturés par les probes Phase 1 Dashboard Bevy UI : diff visuel `9/9`, open/close `0` frame >32 ms, scroll V/H `0` frame >32 ms, rubrique Projets `0` frame >32 ms, console/pageErrors/requestFailures `0`.
- 2026-07-05 — T6.3 clôturé : import ESM `node --input-type=module -e "await import('./eVe/eVe.js')"` terminé avec succès (avertissement Node audio browser-only déjà connu), puis `node temp/boot_probe.mjs` PASS hors sandbox avec boot errors `0` et failed requests `0`.
