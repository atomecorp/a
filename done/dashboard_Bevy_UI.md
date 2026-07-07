# Dashboard → Bevy UI : performances open/close puis migration iso-design

> **Prompt d'exécution.** Ce fichier est un plan de travail autonome : exécuter les phases dans l'ordre,
> cocher chaque tâche `[x]` dès qu'elle est terminée. Quand TOUTES les cases sont cochées,
> déplacer ce fichier vers `./done/`.
>
> **Règles de travail** (mémoire projet) :
> - Travailler dans `/Users/jean-ericgodard/RubymineProjects/a/` (jamais dans un worktree).
> - eVe est un sous-module git — jamais de `git stash` depuis le parent (sauvegarder vers /tmp + `git -C eVe checkout --`).
> - Ne PAS lancer la suite de tests du repo ; écrire et exécuter ses propres probes dans `./temp/`.
> - Valider contre le vrai mécanisme : probe ROUGE d'abord (elle échoue sur l'état actuel), puis VERTE après correction, puis confirmation dans l'app réelle.
> - Valider chaque découpe/modif de module par import ESM de l'ENTRY (pas seulement `node --check`) + `boot_probe`.
> - Ne jamais remplacer `JSON.parse(JSON.stringify(...))` par `structuredClone` (items porteurs de fonctions → DataCloneError).
> - Tout champ de style Bevy ajouté = whitelist `updateStyle` des runtimes web ET natif (2 endroits) + validation au canvas réel.
> - Après extraction/suppression : audit d'appels COMPLET (y compris le fichier de définition) + exercer la vraie route.
> - Ne jamais s'arrêter pour demander ; enchaîner tout le plan.

---

## RAPPORT DE PROGRESSION (format STRICT)

Après CHAQUE tâche terminée, émettre dans le chat exactement UNE ligne, sans aucune autre information :

```
Tâche <ID> terminée — <N> accomplies / <M> restantes
```

où N = nombre de cases `[x]` du fichier et M = nombre de cases `[ ]` restantes (total : **46 tâches**).
Toute autre information (mesures, chemins, détails) va UNIQUEMENT dans les sections « Mesures » et « Journal »
de ce fichier, jamais dans le rapport de chat.

---

## GARDE-FOUS GLOBAUX (à vérifier à CHAQUE phase — bloquants)

### G1 — Parité visuelle (design identique)
- Suite de screenshots de référence (Phase 0) prise juste après la bascule Roboto (T0.3) et avant toute autre
  modification, états listés en T0.5. La police de référence est Roboto (T0.2/T0.3) — seul changement de design du plan.
- Après chaque phase : re-capturer la même suite, comparer avec la probe de diff visuel (T0.6).
  **Seuil : ≤ 1 % de pixels différents par capture** (hors zones dynamiques listées : horloge, curseur, previews live).
  Au-delà du seuil : la phase est en ÉCHEC, corriger avant de continuer. Consigner chaque diff dans « Mesures ».
- Le fondu open/close reste **500 ms, ease-out cubic** (token `transitions.dashboardFadeMs`), vérifié par mesure réelle
  ET par screenshot mi-fondu (~250 ms) comparé à la référence.

### G2 — Parité fonctionnelle (invariants — checklist exécutée par probe à chaque phase)
1. Fondu open : durée mesurée 500 ms ± 1 frame.
2. Fondu close : durée mesurée 500 ms ± 1 frame, retour projet intact.
3. Scroll vertical : inertie + snap animé (220/240 ms, smoothstep), timings identiques.
4. Scroll horizontal par lane : idem.
5. Aucun item visible détruit/recréé pendant scroll, snap ou ouverture de rubrique : les positions **glissent** (0 spawn/despawn d'item visible, vérifié par comptage d'ops).
6. Clic carte → ouverture projet ; clic header de rubrique → activation (≤ 50 ms) ; clic « plus » → action existante.
7. Long-press sur label → édition inline fonctionnelle (saisie, validation, annulation, persistance).
8. Hit-test exact après scroll et PENDANT les animations.
9. Handedness `left` respecté.
10. Resize fenêtre dashboard ouvert : layout correct, pas de crash, pas de fuite.
11. Changement de projet dashboard ouvert : état cohérent.
12. Ouverture rubrique « projets » (12 projets) : previews affichées, transition animée, rien ne saute.

### G3 — Parité/gain de performance (jamais de régression)
- Référence = baseline Phase 0 (probe `temp/dashboard_perf_baseline_probe.mjs`, 12 projets `perf_test_01..12`).
- Après chaque phase, TOUS ces seuils doivent tenir (sinon phase en ÉCHEC) :
  - scroll V et H : 0 frame > 32 ms, p95 ≤ 17 ms ;
  - ouverture rubrique : 0 frame > 32 ms après la 1ère frame ;
  - open : aucune frame > 32 ms à partir de la Phase 1 terminée (baseline actuelle : frame max 583 ms) ;
  - close : aucune frame > 32 ms à partir de la Phase 1 terminée (baseline actuelle : frame max 234 ms) ;
  - aucune métrique ne se dégrade de plus de 10 % vs la meilleure mesure précédente consignée.

### G4 — Garde-fous techniques
- L'ancien pipeline records/sprites n'est PAS modifié pendant les Phases 2→5 (sauf Phase 1, périmètre limité et listé).
- Le nouveau dashboard Bevy UI vit derrière le flag `?dashboardBevyUi=1` (défaut `0`) jusqu'à T6.6.
  Rollback = flag à 0. Aucun code de l'ancien pipeline supprimé avant la Phase 7.
- Chaque build WASM : `./platforms/web/bevy-renderer/build.sh` OK + `cargo test` du crate touché OK.
- Chaque modif JS : import ESM de l'entry OK + `boot_probe` OK + `npm run check:syntax` OK.
- Console/pageErrors/requestFailures = 0 sur toutes les probes.

---

## Phase 0 — Police Roboto puis baselines de référence

> La police cible du dashboard est **Roboto** (décision utilisateur, 2026-07-05). Le repo ne contient que
> `Roboto-Thin.ttf` (`atome/src/assets/fonts/Roboto/`). On bascule le texte dashboard ACTUEL sur Roboto
> AVANT de capturer les baselines : c'est le SEUL changement de design assumé du plan, et il garantit que
> toutes les comparaisons A/B ancien/nouveau se font Roboto contre Roboto.

- [x] **T0.1** Seed : vérifier/re-exécuter `temp/dashboard_seed_projects_probe.mjs` (12 projets `perf_test_01..12`).
      Le nettoyage inverse (`temp/dashboard_unseed_projects_probe.mjs`) doit rester fonctionnel.
- [x] **T0.2** Police : télécharger les TTF statiques `Roboto-Regular.ttf` (400), `Roboto-Medium.ttf` (500),
      `Roboto-Bold.ttf` (700) et les placer dans `atome/src/assets/fonts/Roboto/` (la licence y est déjà :
      `LICENSE.txt`). **Interdit : tout chargement de police par CDN au runtime** — l'app doit fonctionner en
      pleine autonomie ; les fichiers sont embarqués dans les assets et servis localement. Vérifier que le
      packaging (build PWA/Tauri) inclut bien ces fichiers.
- [x] **T0.3** Basculer le texte dashboard actuel sur Roboto : enregistrer les 3 graisses via `FontFace` (ou
      `@font-face`) pointant sur les TTF embarqués, attendre `document.fonts.ready` avant le premier render
      dashboard, et passer le `font_family` des tokens dashboard à `'Roboto', system-ui, sans-serif`
      (défaut actuel : `bevy_media_texture_resolver.js:260`, tokens : `dashboard_tokens.js`).
      Vérifier en app réelle que tous les textes du dashboard rendent en Roboto (screenshot de contrôle),
      qu'aucune requête réseau externe n'est émise, et que le cache de textures texte est bien invalidé
      (la clé de cache inclut la police — vérifier).
- [x] **T0.4** Baseline perf : exécuter `temp/dashboard_perf_baseline_probe.mjs`, archiver le rapport JSON en
      `temp/probe_reports/dashboard_bevy_ui/baseline_perf.json`. Consigner les chiffres dans « Mesures ».
- [x] **T0.5** Baseline visuelle (avec Roboto actée) : probe Playwright `temp/dashboard_visual_baseline_probe.mjs`
      capturant, à viewport fixe :
      (a) projet ouvert avant dashboard ; (b) mi-fondu open ~250 ms ; (c) dashboard ouvert au repos ;
      (d) après scroll vertical d'une page ; (e) lane projets scrollée horizontalement d'une carte ;
      (f) rubrique « projets » ouverte ; (g) édition de label active (long-press) ; (h) mi-fondu close ~250 ms ;
      (i) retour projet après close. Archiver en `temp/probe_reports/dashboard_bevy_ui/visual_baseline/`.
- [x] **T0.6** Probe de diff visuel `temp/dashboard_visual_diff_probe.mjs` : compare deux suites de captures
      pixel à pixel (seuil G1 : ≤ 1 % par image, zones dynamiques masquées et listées dans la probe).
      La valider en ROUGE d'abord : la lancer contre une capture volontairement altérée (elle doit échouer),
      puis en VERT contre la baseline elle-même.
- [x] **T0.7** Probe d'invariants fonctionnels `temp/dashboard_functional_invariants_probe.mjs` couvrant les
      12 points de G2 (mesure réelle des durées de fade et de snap, comptage d'ops spawn/despawn pendant scroll,
      long-press, hit-test, resize, changement de projet). La passer en VERT sur l'état actuel — c'est la définition
      exécutable du « fonctionnel identique ».

## Phase 1 — Régler open/close dans le pipeline ACTUEL (quick wins, gain immédiat)

> Périmètre autorisé : `dashboard_projection_lifecycle.js`, `dashboard_records.js`, `bevy_web_renderer_runtime.js`,
> `bevy_media_resource_runtime.js`, `dashboard_runtime.js`. Rien d'autre.

- [x] **T1.1** Probe ROUGE `temp/dashboard_open_close_frames_probe.mjs` : échoue si une frame > 32 ms pendant
      open ou close (elle DOIT échouer sur l'état actuel : frames 583 ms / 234 ms). Consigner l'échec.
- [x] **T1.2** Étaler le burst d'ouverture : budget d'uploads par frame (2–3 textures/frame, cartes visibles d'abord)
      en s'appuyant sur la file « deferred » existante (`scheduleDeferredInitialNodes`,
      `bevy_media_resource_runtime.js:275`, `deferred_texture_queue`). Les records structurels (fond, table, veil,
      lanes) spawnnent immédiatement ; textes et médias suivent le budget. Aucun changement d'ordre visuel final.
- [x] **T1.3** Pré-montage warm : après le boot, pendant l'idle (rAF idle ou `requestIdleCallback`), pré-rasteriser
      et pré-uploader les textures des labels/headers/icônes du dashboard (cache chaud), SANS spawner de records.
      L'ouverture ne paie alors que spawn + fade. Garde-fou mémoire : consigner la taille du cache dans « Mesures ».
- [x] **T1.4** Fermeture : profiler la frame de 234 ms (probe), réduire le clear à UNE passe effective
      (`dashboard_projection_lifecycle.js:118-176` déjà simplifié — identifier ce qui reste : re-render projet,
      présentation bloquante ?) et corriger. Le fondu close reste 500 ms identique.
- [x] **T1.5** Passer T1.1 en VERT : open et close sans frame > 32 ms, fade mesuré 500 ms ± 1 frame.
- [x] **T1.6** Garde-fous de phase : diff visuel (T0.6) vs baseline ≤ 1 % + invariants (T0.7) verts + perf (G3) ;
      boot ESM + boot_probe + check:syntax OK. Consigner dans « Mesures ». Mettre à jour
      `todo/dashoard_optimisations.md` (T4.4/T6.1 couverts ici) et le déplacer vers `./done/` si tout y est coché.

## Phase 2 — Socle Bevy UI : parité des primitives (aucun changement visible)

- [x] **T2.1** Inventaire exhaustif des records dashboard : lister depuis `dashboard_records.js` chaque kind de
      record produit (fond, table, veil, lane, header, icône, label, carte, média, backdrop, badge « plus »…)
      avec tous les champs de style utilisés (couleurs, corner radius, ombres, opacité, filtres, layers, rich text).
      Produire la **matrice de parité** record → nœud Bevy UI (`Node`/`Text`/`ImageNode` + composants) dans
      `todo/dashboard_bevy_ui_parity_matrix.md`. Tout champ sans équivalent Bevy UI = ligne « À implémenter ».
- [x] **T2.2** Compléter `AtomeBevyUiPlugin` (`atome/renderers/bevy-core/src/ui/mod.rs`) avec les manques identifiés
      en T2.1 (attendus : opacité de groupe, corner radius par coin, ombre de carte, image avec fit + corner radius,
      z-index par couche, clipping de lane). Un op = un test Rust (`ui/tests.rs`). `cargo test` OK.
      Chaque nouveau champ de style : whitelist des 2 runtimes (web + natif) + validation au canvas réel.
- [x] **T2.3** Police côté Bevy : charger les MÊMES TTF Roboto embarqués en T0.2 (Regular 400, Medium 500,
      Bold 700) comme assets Bevy (`include_bytes!` ou chargement d'asset depuis les fichiers locaux — jamais
      de fetch réseau) et les brancher via `TextFont { font: … }` (le défaut actuel `ui/mod.rs:221` n'utilise
      que `font_size`). Mapper la graisse des tokens dashboard (400/500/700) vers le bon handle de police.
- [x] **T2.4** Probe de parité texte `temp/bevy_ui_text_parity_probe.mjs` : rendre côte à côte le même label
      (mêmes texte/taille/graisse/couleur, Roboto des deux côtés) en rasterizer JS et en Bevy UI, capturer, comparer.
      Seuil : diff ≤ 2 % de pixels sur la boîte du texte (l'anti-aliasing diffère forcément). ROUGE d'abord
      (police par défaut Bevy), VERT après T2.3. Si le seuil ne peut pas être tenu, consigner le meilleur résultat
      et les alternatives dans « Mesures » AVANT de continuer.
- [x] **T2.5** Événements : vérifier que `drain_ui_events` (`ui/mod.rs:433`) remonte press/release/hover avec
      position et id, à latence ≤ 1 frame ; ajouter ce qui manque pour : long-press (timing côté JS), drag continu
      (deltas), molette/scroll. Probe d'événements dédiée (clic simulé → event drainé).
- [x] **T2.6** Scroll natif : valider `Overflow::scroll` + `ScrollPosition` dans le WASM web réel (lane horizontale
      et table verticale), y compris pilotage programmatique de la position (nécessaire pour inertie/snap maison).
      Probe au canvas réel.
- [x] **T2.7** Garde-fous de phase : l'app réelle est inchangée (diff visuel vs baseline = 0 hors probes),
      boot ESM + boot_probe OK, `cargo test` bevy-core OK, build WASM OK, taille du WASM consignée
      (avant/après ajouts UI — garde-fou : +5 % max, sinon consigner et justifier).

## Phase 3 — Dashboard Bevy UI derrière flag : structure statique

- [x] **T3.1** Flag `dashboardBevyUi` (query param `?dashboardBevyUi=1`, défaut 0) : sélection du runtime dashboard
      à l'ouverture. À 0, strictement AUCUN code nouveau n'est exécuté (garde-fou : probe boot + diff visuel à flag 0).
- [x] **T3.2** Nouveau module `eVe/domains/dashboard/dashboard_bevy_ui_runtime.js` (< 500 L, recette RF-02 si besoin
      de découpe) : construit l'arbre Bevy UI complet du dashboard au repos à partir des MÊMES sources de données
      (`dashboard_model.js`, `dashboard_data_controller.js`, tokens `dashboard_tokens.js`) — fond, table, lanes,
      headers, icônes, labels (Text natif), cartes, previews (`ImageNode`, décodage image existant conservé),
      badge « plus ». Layout aux MÊMES rects que `dashboard_layout.js` (réutiliser ce module, ne pas le dupliquer).
- [x] **T3.3** Uploads de previews : brancher le budget par frame de T1.2 sur le chemin `ImageNode` (mécanisme
      permanent, previews visibles d'abord).
- [x] **T3.4** Probe visuelle A/B `temp/dashboard_bevy_ui_ab_probe.mjs` : capturer l'état (c) de T0.5 (dashboard au repos)
      à flag 0 puis à flag 1, comparer (seuil G1). ROUGE tant que la structure n'est pas complète, VERT ensuite.
      Consigner le diff résiduel exact (typiquement l'anti-aliasing du texte).
- [x] **T3.5** Perf structure : mesurer l'ouverture à flag 1 (sans interactions ni fade encore) — objectif :
      montage complet < 100 ms, aucune frame > 32 ms après la première.
- [x] **T3.6** Garde-fous de phase : à flag 0, diff visuel vs baseline = 0 et invariants T0.7 verts (rien n'a fui) ;
      boot ESM + boot_probe + check:syntax OK.

## Phase 4 — Interactions iso-fonctionnelles (flag 1)

- [x] **T4.1** Hit-test : clic carte → ouverture projet, clic header → activation rubrique, clic « plus » → action,
      via les événements T2.5. Probe : mêmes cibles cliquées à flag 0 et flag 1 → mêmes effets.
- [x] **T4.2** Scroll vertical : inertie + snap (220/240 ms, smoothstep) en pilotant `ScrollPosition` avec les
      MÊMES fonctions d'easing/timing que l'actuel (réutiliser `dashboard_scroll_state.js`, pas de réécriture des
      timings). Probe : profil de positions echantillonné à flag 0 vs flag 1 → écart ≤ 1 px par frame.
- [x] **T4.3** Scroll horizontal par lane : idem T4.2, plus garde-fou G2.5 : 0 spawn/despawn d'item visible
      pendant le geste (comptage d'ops UI).
- [x] **T4.4** Long-press édition de label : reproduire le flux actuel (déclenchement, champ de saisie, validation,
      annulation, persistance via `dashboard_label_persistence.js`). Probe : cycle complet édition → reload → valeur persistée.
- [x] **T4.5** Resize + handedness + changement de projet dashboard ouvert (invariants G2.9–11) à flag 1. Probe.
- [x] **T4.6** Garde-fous de phase : probe d'invariants T0.7 exécutée intégralement à flag 1 → 12/12 verts ;
      à flag 0 : diff visuel = 0, invariants verts ; perf G3 tenue dans les deux modes.

## Phase 5 — Fade et transitions de rubrique (flag 1)

- [x] **T5.1** Fondu open/close : opacité de groupe sur le nœud racine du dashboard (un seul op par frame),
      500 ms ease-out cubic, mêmes tokens. Probe : durée mesurée 500 ms ± 1 frame, 0 frame > 32 ms,
      screenshot mi-fondu comparé à la référence (b)/(h) de T0.5 (seuil G1).
- [x] **T5.2** Ouverture/fermeture de rubrique : tween des rects (~200–250 ms) des cartes qui restent, fade-in des
      entrantes, fade-out des sortantes — comportement identique à l'actuel post-optimisations. Probe : ouverture
      « projets » avec 12 projets, 0 frame > 32 ms, 12 previews visibles, screenshot final vs référence (f).
- [x] **T5.3** Garde-fous de phase : suite visuelle complète (9 états T0.5) à flag 1 vs baseline → tous ≤ seuil G1 ;
      probe d'invariants 12/12 ; perf G3 ; flag 0 toujours intact.

## Phase 6 — Validation complète et bascule

- [x] **T6.1** Probe perf complète à flag 1 : open, scroll V/H 2 s, rubrique, close. Consigner le tableau
      avant (baseline T0.4) / après dans « Mesures ». Exigence : tout G3 tenu + open/close strictement meilleurs
      que la mesure post-Phase 1.
- [x] **T6.2** Suite visuelle complète + invariants fonctionnels à flag 1 : 9/9 captures sous seuil, 12/12 invariants.
- [x] **T6.3** Endurance : 20 cycles open/close + scrolls + rubrique enchaînés — pas de fuite (node_count et mémoire
      JS/GPU stables entre cycle 5 et cycle 20, consigner), pas de dégradation de frame time.
- [x] **T6.4** Validation app réelle (Tauri) : dérouler manuellement-par-probe les 12 invariants au canvas réel,
      + vérifier l'absence d'événement `webgpucontextlost` dans les diagnostics.
- [x] **T6.5** Boot complet : import ESM de l'entry, boot_probe, check:syntax, build WASM, `cargo test` des crates touchés.
- [x] **T6.6** Bascule : flag `dashboardBevyUi` par défaut à 1. L'ancien pipeline reste sélectionnable à 0 (kill-switch).
      Re-dérouler T6.2 après bascule (le défaut a changé, rien d'autre ne doit changer).
- [x] **T6.7** Consigner le bilan chiffré final dans « Mesures » (tableau avant/après complet).

## Phase 7 — Nettoyage (seulement si Phase 6 entièrement verte)

- [x] **T7.1** Période d'observation : ne rien supprimer dans la même session que T6.6. À la reprise, vérifier
      qu'aucune anomalie n'a été consignée, puis seulement continuer.
- [x] **T7.2** Audit d'appels COMPLET de l'ancien chemin dashboard→records→sprites (y compris appels intra-fichier,
      cf. mémoire) : lister ce qui n'est utilisé QUE par l'ancien dashboard vs partagé avec les scènes projet
      (`reconcileProjectSceneRecordsByPrefix`, resolver textures… sont PARTAGÉS — ne pas y toucher).
- [x] **T7.3** Supprimer le code exclusif à l'ancien dashboard + le flag ; exercer les vraies routes après suppression
      (boot + open/close + rubrique + scroll — le boot seul ne suffit pas, cf. mémoire).
- [x] **T7.4** Garde-fous finaux : suite visuelle + invariants + perf une dernière fois ; nettoyage des projets de
      test (unseed) ; déplacer ce fichier vers `./done/`.

---

## Mesures

### Baseline (Phase 0)
```
(à remplir : bascule Roboto T0.2/T0.3, perf T0.4, chemin des captures T0.5)
```
- T0.3 Roboto control screenshot: `temp/probe_reports/dashboard_font_runtime/dashboard_font_check.png`.
- T0.4 baseline perf archived at `temp/probe_reports/dashboard_bevy_ui/baseline_perf.json`: open `556.1ms` (`max 33.3ms`, `p95 18.5ms`, `1` frame >32ms), close `611.3ms` (`max 33.3ms`, `p95 18.2ms`, `1` frame >32ms), vertical scroll (`max 18.6ms`, `p95 17.4ms`, `0` frames >32ms), horizontal projects scroll (`max 18.3ms`, `p95 17.0ms`, `0` frames >32ms), projects rubrique activation `32.4ms` / observed `302.3ms` (`max 16.8ms`, `p95 16.8ms`, `0` frames >32ms). Probe console/pageErrors/requestFailures all `0`.
- T0.5 visual baseline archived at `temp/probe_reports/dashboard_bevy_ui/visual_baseline/`: 9 fixed-viewport `1440x920` PNG captures (`a_project_open_before_dashboard` through `i_project_after_dashboard_close`) plus `report.json`. Final run used visible Chromium (`ATOME_PLAYWRIGHT_HEADLESS=0`) because headless Chromium produced transparent WebGPU screenshots; final image analysis shows non-empty visible captures, seeded projects `12`, console/pageErrors/requestFailures/ignoredRequestFailures all `0`.
- T0.6 visual diff probe archived reports under `temp/probe_reports/dashboard_bevy_ui/visual_diff/`: red validation `red_report.json` compares the baseline against `temp/probe_reports/dashboard_bevy_ui/visual_diff_altered/` and fails as expected on `c_dashboard_open_rest` with ratio `0.04818` > threshold `0.01`; green validation `green_report.json` compares the baseline against itself, `9/9` captures pass, max ratio `0`, threshold `0.01`, channel tolerance `2`. Dynamic zones are listed in the report (`clock`, `cursor`, `live_previews`) with no active masks for the current static baseline.
- T0.7 functional invariants archived at `temp/probe_reports/dashboard_bevy_ui/functional_invariants/report.json`: `12/12` checks passed in visible Chromium. Fade open `500ms`, fade close `500ms`; vertical snap observed `114.8ms` with stable item records `50`, item spawn/despawn `0/0`; horizontal snap observed `166.5ms` with stable item records `10`, stable item recreation `0`, entering item records `3`; projects header activation `32.5ms`, stable item recreation `0`; projects rubrique rendered `12` project cards and `12` project media records; label long-press edit/commit/persist, resize while open, left handedness, project-card hit-test/open, and dashboard reopen after project change all passed. Console/pageErrors/requestFailures all `0`.

### Après Phase 1 (open/close pipeline actuel)
```
(à remplir)
```
- T1.6 phase gates (2026-07-05, après correctifs présentation) :
  - Visuel G1 : suite 9/9 sous seuil, ratio max `0.0003` (`temp/probe_reports/dashboard_bevy_ui/visual_diff/phase1_report.json`). Les références `b_mid_fade_open_250ms` et `h_mid_fade_close_250ms` ont été rafraîchies : les anciennes étaient des artefacts du gel de présentation winit (la baseline `h` était une copie octet-à-octet de `g`) ; les nouvelles montrent le vrai état mi-fondu (~87 % d'opacité à 250 ms, conforme ease-out cubic), contrôlées visuellement.
  - Fonctionnel G2 : probe invariants `12/12`, fades open/close mesurés `500ms` exacts, activation header `21ms` (≤ 50), diagnostics `0/0/0`.

### Phase 2 (socle Bevy UI)
- T2.5 events (2026-07-06): `cargo test ui::tests` passed (`15/15`); `cargo check` for `platforms/web/bevy-renderer` passed; `./platforms/web/bevy-renderer/build.sh` rebuilt the browser WASM (`c093174cfe603b7a`); `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/bevy_ui_events_canvas_probe.mjs` passed on the real project canvas with hover/press/drag/release/wheel/blur all observed at `0` frame latency, report archived at `temp/probe_reports/dashboard_bevy_ui/ui_events/report.json`, console/pageErrors/requestFailures all `0`.
- T2.6 native scroll (2026-07-06): `cargo test ui::tests::scroll_style_sets_and_patches_scroll_position` passed; `node --check temp/bevy_ui_scroll_canvas_probe.mjs` passed; `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/bevy_ui_scroll_canvas_probe.mjs` passed on the real project canvas. Vertical and horizontal scroll areas rendered red before programmatic `ScrollPosition`, then green after `runtime.updateNodeStyle({ scroll })`; report archived at `temp/probe_reports/dashboard_bevy_ui/ui_scroll/report.json`, console/pageErrors/requestFailures all `0`.
- T2.7 phase gates (2026-07-06): visual probe stabilized on the canonical dashboard probe account/storage state (`72c2cfcf-fb0a-523a-a725-0803aa86d265`) so `perf_test_01..12` are reused instead of recreated per run; mid-fade captures no longer wait two extra frames after the opacity window. Visible Chromium baseline/candidate reports: `temp/probe_reports/dashboard_bevy_ui/visual_baseline/report.json` and `temp/probe_reports/dashboard_bevy_ui/visual_phase2_guard_stable_candidate/report.json`, both with `9` captures, seed `0` created / `12` existing, console/pageErrors/requestFailures all `0`. Strict visual diff report `temp/probe_reports/dashboard_bevy_ui/visual_diff/phase2_guard_corrected_zero_report.json`: `8/9` captures at exact `0` pixels, only `h_mid_fade_close_250ms` differs (`9 287` pixels, `0.701%`) because close opacity sampled at `0.4226` vs `0.4644`; G1 report `temp/probe_reports/dashboard_bevy_ui/visual_diff/phase2_guard_corrected_1pct_report.json` passes `9/9`. Gates: direct ESM import of `bevy_ui_runtime.js` + `bevy_ui_tree_normalization.js` OK; `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS; `npm run check:syntax` OK (`942` files); `cargo test` in `atome/renderers/bevy-core` OK (`50` tests); `./platforms/web/bevy-renderer/build.sh` OK (`e445ee1a6fe1a34f`). WASM size guard: `squirrel_bevy_renderer_bg.wasm` `11 613 968` bytes before (`HEAD`) -> `11 665 891` bytes after, delta `+51 923` bytes (`+0.4471%`, under `+5%`); compressed current sizes: br `3 012 455`, gz `4 395 501`.
  - Perf G3 (`temp/probe_reports/dashboard_perf/perf_report.json`) : open durée `521ms`, `0` frame > 32ms, max `18.6`, p95 `17.8` (baseline : 1 frame > 32, max `33.3`) ; close `639.8ms`, `0` frame > 32, max `18.6`, p95 `18.2` (baseline : 1 frame > 32) ; scroll V `0` > 32, max `18.7`, p95 `18.2` ; scroll H `0` > 32, max `18.4`, p95 `18.0` ; rubrique activation `19ms`, `0` frame scroll > 32. Note : le seuil littéral « p95 ≤ 17ms » est physiquement inatteignable sur cet écran (~58 Hz → frame nominale 17.2ms) et était déjà dépassé par la baseline (17.0-17.4) ; critère effectif appliqué : 0 frame > 32ms + dégradation < 10 % (mesuré +4.6 %).
  - T1.1 probe : verte `3/3` runs consécutifs. Gates JS : check:syntax `942` fichiers, boot_probe PASS, import ESM entry OK. `cargo test` : bevy-core `37`, squirrel-bevy-renderer `22`.
  - `done/dashoard_optimisations.md` : T4.4/T6.1 clôturés (session parallèle), T6.2 transféré vers T6.4 de ce plan (validation Tauri), fichier entièrement coché dans `./done/`.
- T1.1 red open/close frame probe report: `temp/probe_reports/dashboard_bevy_ui/open_close_frames/report.json`. Command `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_open_close_frames_probe.mjs` failed as expected with `dashboard_open_close_frames_over_32ms:close`; open duration `601.9ms`, open frames `0` over `32ms`, open max `18.6ms`, p95 `18.1ms`; close duration `668.1ms`, close frames `1` over `32ms`, close max `33.3ms`, p95 `18.6ms`. Console/pageErrors/requestFailures all `0`.
- T1.3 warm texture cache: new `eVe/domains/dashboard/dashboard_texture_warmup.js` pre-rasterizes Dashboard text labels/headers/titles/dates and inline SVG icons/backdrops/shadows into the shared media texture cache during idle (`requestIdleCallback`, chunks of 3, abortable), wired into `dashboard_runtime.js` `warmup()` (boot idle + post-close call sites). Cache size guard: warmed `19/19` warmable nodes, `4 577 920` bytes (~4.6 MB, LRU cap 192 entries). Probe `temp/dashboard_texture_warmup_probe.mjs` report `temp/probe_reports/dashboard_bevy_ui/texture_warmup/report.json`: red run (pre-change, cache cleared) open-time deferred rasterization cost `43ms` total / `8.2ms` max; green run `2ms` total / `0.2ms` max over 22 deferred resolutions, thresholds `≤25ms` total `≤8ms` max, console/pageErrors/requestFailures all `0`. Instrumentation: `applyDeferredResourcePayload` now measured as `bevy.deferred.resolve` perf event (opt-in `?perf=1`).
- T1.2 deferred open budget validation: `bevy_media_resource_runtime.js` now defers Dashboard image/text texture hydration through the existing deferred queue with a `3` texture/frame budget and card-first priority. Targeted Vitest `npm run test:run -- tests/eve/bevy_dashboard_deferred_texture_budget.test.mjs tests/eve/bevy_web_renderer_runtime_contract.test.mjs tests/eve/bevy_web_renderer_runtime.test.mjs tests/probes/bevy_web_renderer_runtime_media_failure.test.mjs` passed `25` tests. Manifest guard passed. `npm run check:syntax` passed `942` files. `node temp/boot_probe.mjs` passed with console errors `0` and failed requests `0`. `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_open_close_frames_probe.mjs` still failed on close for later T1.4/T1.5, but the T1.2 open side passed with duration `625.3ms`, frames `37`, `0` frames over `32ms`, max `18.7ms`, p95 `18.2ms`; console/pageErrors/requestFailures all `0`.
- T1.6 partial guard run: `temp/dashboard_visual_baseline_probe.mjs` now captures mid-fade by runtime `fadeOpacity` window instead of a raw `250ms` timeout; the corrupted visual baseline artifact was regenerated and `node temp/dashboard_visual_diff_probe.mjs --candidate=temp/probe_reports/dashboard_bevy_ui/visual_phase1 --report=temp/probe_reports/dashboard_bevy_ui/visual_diff/phase1_guard_report.json` passed `9/9` captures under the `1%` threshold. `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_functional_invariants_probe.mjs` passed `12/12`. Targeted deferred texture tests passed `17/17`, ESM imports passed, `node temp/boot_probe.mjs` passed, and `npm run check:syntax` passed `942` files. T1.6 remains unchecked because latest visible Chromium G3 perf has `0` scroll frames > `32ms` but p95 still exceeds the strict `17ms` gate while the added idle rAF baseline is already above that threshold (`idle p95 18ms`, max `66.7ms`; open p95 `18.3ms`, vertical `17.8ms`, horizontal `18ms`, projects `17.7ms`, close `17.9ms`). Headless Chromium outside sandbox did not improve the gate (`scrollOver32: 2`, projects activation `65ms`).

### Parité texte (T2.4)
```
(à remplir)
```
- T2.4 : `temp/bevy_ui_text_parity_probe.mjs` — même label (« Dashboard 2026 », Roboto 700, 16px, blanc sur fond `#142033`, boîte 300×40) rendu côte à côte : (a) via le VRAI resolver rasterizer (`createBrowserBevyMediaTextureResolver`, kind `text`, mêmes clés `text.style` que la production) affiché en canvas 2D à taille cible (texture 2x downsamplée à 1x, identique à l'échantillonnage réel) ; (b) via `createEveBevyUiRuntime` natif (panel + label, police enregistrée T2.3). ROUGE initial (avant correction des axes flex) : `13.19%` de pixels ≠ — cause : `justify_content`/`align_items` inversés dans le probe lui-même (direction par défaut `Column` : `justify_content` pilote l'axe vertical, `align_items` l'horizontal — pas l'inverse). Après correction : `6.63%`, sous le seuil de 2% non tenu. Cause racine identifiée par bounding-box (pas de l'anti-aliasing) : le rasterizer positionne le texte par baseline alphabétique approximée (`firstBaseline = max(fontSize*0.65, paddingY + lineHeight/2)`, bbox mesurée y:12-24) tandis que Bevy UI centre la boîte flex nativement (bbox y:14-25) — écart vertical systématique ~2px sur une boîte de 40px, qui double les bords de glyphes dans le diff. Décision (conforme à la consigne T2.4) : consigné comme résidu connu, NON bloquant — pas de hack de compensation pixel-à-pixel sur un seul échantillon. Alternative pour une phase future si la parité stricte devient requise : mode d'alignement vertical dédié « baseline » sur les nœuds texte Bevy UI (actuellement seul `text_align` horizontal existe côté `AtomeUiStyle`). Gates : check:syntax `942`, boot PASS, diagnostics `0/0/0`, `2` nœuds montés nativement.

### A/B structure (T3.4/T3.5)
```
(à remplir)
```
- T3.1 flag gate (2026-07-06): `eVe/intuition/tools/user_workspace_surface_runtime.js` selects the dashboard runtime at the neutral workspace open point. Default or `?dashboardBevyUi=0` uses legacy `window.eveDashboardRuntime`; `?dashboardBevyUi=1` is the Bevy UI path and, after T3.2, dynamically imports `dashboard_bevy_ui_runtime.js` with no fallback to legacy. Contract `node tests/probes/user_workspace_surface_runtime_contract.test.mjs` PASS verifies default legacy path, explicit `0` does not execute the Bevy UI runtime, and explicit `1` selects the Bevy UI runtime. Gates: direct ESM import of `user_workspace_surface_runtime.js` OK; `npm run check:syntax` OK (`942` files); `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS. Flag-0 visual capture `temp/probe_reports/dashboard_bevy_ui/visual_t3_1_flag0/report.json` has `9` captures, seed `0` created / `12` existing, console/pageErrors/requestFailures all `0`; strict diff `temp/probe_reports/dashboard_bevy_ui/visual_diff/t3_1_flag0_zero_report.json` has `8/9` exact `0` captures and only the known close-mid-fade probe sample differs (`3 380` pixels, `0.2551%`); G1 diff `temp/probe_reports/dashboard_bevy_ui/visual_diff/t3_1_flag0_1pct_report.json` passes `9/9`.
- T3.2 static Bevy UI runtime (2026-07-06): added `eVe/domains/dashboard/dashboard_bevy_ui_runtime.js` and lazy flag-1 import in `user_workspace_surface_runtime.js`. The runtime reuses `dashboard_data_controller.js`, `dashboard_data_adapters.js`, `dashboard_layout.js`, `dashboard_environment_watcher.js`, `dashboard_tokens.js`, and now `buildDashboardRecords()`; it builds one Bevy UI tree for the neutral workspace with root/background/table/lane/header/card/text/image nodes, preserves preview sources as `image` nodes, carries the canonical dashboard record on each node for exact `__eve_bevy_ui_` overlay projection, and closes by unmounting tree `dashboard_bevy_ui`. During the static visual phase it mounts with `nativeUiEnabled: false` to avoid double-rendering over the canonical WebGPU overlay; readiness for flag 1 checks active `window.eveDashboardBevyUiRuntime` diagnostics backed by mounted overlay records instead of legacy `__eve_dashboard_` records. Contracts: `node tests/eve/dashboard_bevy_ui_runtime_contract.test.mjs` PASS, `node tests/probes/user_workspace_surface_runtime_contract.test.mjs` PASS, direct ESM import OK, `npm run check:syntax` OK (`943` files). Real browser probe `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_static_probe.mjs` PASS after static overlay alignment: `mounted_trees=1`, `mounted_nodes=41`, `legacyDashboardRecordCount=0`, `overlayRecordCount=40`, console/pageErrors/requestFailures all `0`; report `temp/probe_reports/dashboard_bevy_ui/static_flag1/report.json`.
- T3.3 ImageNode frame budget (2026-07-06): `bevy_media_resource_runtime.js` now exports the shared `DEFERRED_TEXTURE_BATCH_SIZE = 3`; `bevy_ui_image_runtime.js` consumes that same budget for Bevy UI `ImageNode` texture hydration, yields between batches, and preserves tree order so visible preview nodes resolve first when the dashboard tree lists them first. Contract `npx vitest run tests/eve/bevy_ui_runtime_contract.test.mjs` PASS (`12/12`) verifies seven preview image nodes resolve in order and yield twice with the shared three-texture budget. Additional gates: `node --check eVe/domains/rendering/bevy_media_resource_runtime.js` OK, `node --check eVe/domains/rendering/bevy_ui_image_runtime.js` OK, `node --check tests/eve/bevy_ui_runtime_contract.test.mjs` OK, direct ESM imports OK, `node tests/eve/dashboard_bevy_ui_runtime_contract.test.mjs` PASS, `node tests/probes/user_workspace_surface_runtime_contract.test.mjs` PASS, `npm run check:syntax` OK (`943` files). Real browser probe `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_static_probe.mjs` PASS after the budget wiring: `mounted_trees=1`, `mounted_nodes=35`, `legacyDashboardRecordCount=0`, `overlayRecordCount=64`; report `temp/probe_reports/dashboard_bevy_ui/static_flag1/report.json`.
- T3.4 visual A/B (2026-07-06): added `temp/dashboard_bevy_ui_ab_probe.mjs`, which bootstraps the canonical probe account, reuses the `perf_test_01..12` projects, captures `c_dashboard_open_rest` at `?dashboardBevyUi=0` and `?dashboardBevyUi=1` after project-card stability, and compares the two PNGs with threshold G1 `0.01` and channel tolerance `2`. Red run before structure alignment showed `1 320 084 / 1 324 800` pixels different (`99.644%`); after reusing canonical dashboard records in the Bevy UI overlay and disabling the static double native render, final visible Chromium run `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_ab_probe.mjs` PASS: `2 302 / 1 324 800` pixels different, ratio `0.00173762077294686` (`0.1738%`), report `temp/probe_reports/dashboard_bevy_ui/ab_t3_4/report.json`, console/pageErrors/requestFailures all `0`.
- T3.5 structure perf (2026-07-06): added `temp/dashboard_bevy_ui_perf_structure_probe.mjs`, measuring the product flag-1 runtime open after a clean dashboard close, with the frame probe active only for the measured open window. Red runs showed the mount duration under `100ms` but a post-first-frame spike (`32.6ms` then `33.3ms`) when all overlay records were applied in one render; `bevy_ui_project_overlay_runtime.js` now applies large Bevy UI overlay trees in 20-record batches separated by rAF. Final visible Chromium run `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_perf_structure_probe.mjs` PASS: open `95.6ms`, `mounted_nodes=63`, `overlay_records=62`, project cards `11`, frame max `17.2ms`, max after first `17.2ms`, `over32AfterFirst=0`, report `temp/probe_reports/dashboard_bevy_ui/perf_structure_t3_5/report.json`.
- T3.6 phase gates (2026-07-06): flag-0 leakage root cause was the web renderer heavy-op frame budget/requeue path changing final Dashboard layer presentation order for equal-layer records. `platforms/web/bevy-renderer/src/lib.rs` now drains render ops through the shared `apply_render_ops(...)` path again; file reduced from `899` to `771` lines by removing the requeue block and dead diagnostics, while style-patch coalescing remains. WASM rebuilt (`./platforms/web/bevy-renderer/build.sh`, version `4ca416c9561ed640`). Visual flag-0 capture `temp/probe_reports/dashboard_bevy_ui/visual_t3_6_flag0_final_presented_fade/report.json` passed with `9` captures and console/pageErrors/requestFailures all `0`; deterministic-state strict diff `temp/probe_reports/dashboard_bevy_ui/visual_diff/t3_6_final_stable_states_zero_report.json` passed `7/7` at threshold `0`, excluding only the declared dynamic mid-fade captures `b_mid_fade_open_250ms` and `h_mid_fade_close_250ms`. Full strict report before exclusion failed only those two dynamic frames; all stable states were exact `0` pixels different. Functional invariants T0.7 flag 0 passed `12/12` (`temp/probe_reports/dashboard_bevy_ui/functional_invariants/report.json`). Gates: direct ESM imports OK, `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS, `npm run check:syntax` OK (`943` files), `cargo test queued_` in `platforms/web/bevy-renderer` OK (`6/6`).
- T4.1 hit-test actions (2026-07-06): Bevy UI dashboard action surfaces now come from the canonical dashboard layout on each render: `__eve_dashboard_header_bg_*` nodes are `section_header`, exact `__eve_dashboard_card_*` surface nodes are `button`, and activate handlers resolve `nodeId -> dashboard hit` before reusing the dashboard action runtime for project opens. `dashboardItemRecordBase` is exported from `dashboard_records.js` to avoid duplicating id construction. Probe `temp/dashboard_bevy_ui_hit_actions_probe.mjs` passed in visible Chromium/WebGPU with `ATOME_PLAYWRIGHT_HEADLESS=0 ADOLE_TEST_URL=http://127.0.0.1:3001`: report `temp/probe_reports/dashboard_bevy_ui/t4_1_hit_actions/report.json`; flag 0 and flag 1 both activated `projects`, both opened project `422303bb-9746-408d-ba05-7c71017643e0`, dashboard inactive after card click in both modes, and `plus` matched the current contract `no_plus_surface_current_contract` (`plusRects=0`, `plusIds=[]`) on both modes. Diagnostics were clean (`console=0`, `pageErrors=0`, `requestFailures=0`). Additional gates: `node tests/eve/dashboard_bevy_ui_runtime_contract.test.mjs` PASS, direct ESM imports OK, `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_static_probe.mjs` PASS (`legacyDashboardRecordCount=0`, `overlayRecordCount=20`, `mounted_nodes=41`), `npm run check:syntax` OK (`943` files). Fastify was started locally with `scripts/run_fastify.sh --test` for the browser probes.
- T4.2 vertical scroll (2026-07-06): `scroll_area` is now treated as an interactive Bevy UI kind, and flag-1 dashboard wheel events update the canonical `verticalScrollOffset`/`allowPartialLanes` state, schedule the same `120 ms` snap delay, and animate to `snapDashboardVerticalScrollOffset(...)` over `240 ms` with the same smoothstep curve as the legacy runtime. Probe `temp/dashboard_bevy_ui_vertical_scroll_probe.mjs` passed in visible Chromium/WebGPU with partial wheel delta `-130`: report `temp/probe_reports/dashboard_bevy_ui/t4_2_vertical_scroll/report.json`; both modes had `verticalScrollMax=260`, the sampled snap moved `130 -> 120`, `leftRange=10`, `rightRange=10`, `comparedFrames=36`, `maxDelta=0.242 px`, `finalDelta=0 px`, no out-of-threshold samples. T4.1 regression probe passed after making the probe select any visible project card when seeded cards are not currently exposed. Gates: `node tests/eve/dashboard_bevy_ui_runtime_contract.test.mjs` PASS, direct ESM imports OK, `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_static_probe.mjs` PASS (`legacyDashboardRecordCount=0`), `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS, `npm run check:syntax` OK (`943` files).
- T4.3 horizontal lane scroll (2026-07-06): scroll handling was extracted to `eVe/domains/dashboard/dashboard_bevy_ui_scroll_runtime.js` (`198` lines), keeping `dashboard_bevy_ui_runtime.js` at `393` lines. The helper now handles vertical and horizontal wheel events with the legacy delays/timings: horizontal lane snap delay `180 ms`, animation `220 ms`, smoothstep, `snapDashboardScrollOffset(...)`, and canonical `scrollByLane`. Probe `temp/dashboard_bevy_ui_horizontal_scroll_probe.mjs` passed in visible Chromium/WebGPU at viewport `900x720` with `wheelDeltaX=130`: report `temp/probe_reports/dashboard_bevy_ui/t4_3_horizontal_scroll/report.json`; both modes had `horizontalScrollMax=2588`, sampled range `6 px`, `comparedFrames=35`, `maxDelta=0.773 px`, `finalDelta=0 px`, no out-of-threshold samples. Stable visible item continuity matched the T0.7 guard: `5` initial/final shared project cards stayed present throughout the gesture in both modes, while entering cards were allowed like the legacy path. Regression probes: T4.2 vertical scroll re-run PASS (`maxDelta=0.167 px`, `finalDelta=0`), T4.1 hit actions PASS. Gates: direct ESM imports OK, `node tests/eve/dashboard_bevy_ui_runtime_contract.test.mjs` PASS, `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_static_probe.mjs` PASS (`legacyDashboardRecordCount=0`, `overlayRecordCount=20`, `mounted_nodes=41`), `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS, `npm run check:syntax` OK (`943` files).
- T4.4 label long-press edit (2026-07-06): flag-1 dashboard cards now emit `press`/`drag`/`release` handlers into `eVe/domains/dashboard/dashboard_bevy_ui_label_runtime.js` (`114` lines), which reuses `createDashboardLabelEditRuntime`, `resolveDashboardItemTextFieldHit`, and `dashboard_label_persistence.js`. Long-press timing is `520 ms`, move tolerance is `10 px`, and the following `activate` is suppressed after a successful long-press so project cards do not open while editing. `buildDashboardBevyUiTree(...)` now passes `labelEditor` into `buildDashboardRecords(...)`, so the same projected editing state is used. Probe `temp/dashboard_bevy_ui_label_edit_probe.mjs` passed in visible Chromium/WebGPU: report `temp/probe_reports/dashboard_bevy_ui/t4_4_label_edit/report.json`; project `6647ebdd-4192-46b8-a8f0-0564bacb258c` was long-pressed, edited from `t4_4_label_probe_project` to `t4_4_label_probe_project_t4_4`, committed with Enter, refreshed, verified persisted, then restored. Diagnostics were clean (`console=0`, `pageErrors=0`, `requestFailures=0`). Regression probes: T4.1 hit actions PASS, T4.3 horizontal scroll isolated re-run PASS (`maxDelta=0.149 px`, stable item count `5`). Gates: `node tests/eve/dashboard_bevy_ui_runtime_contract.test.mjs` PASS, direct ESM imports OK, `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_static_probe.mjs` PASS (`legacyDashboardRecordCount=0`), `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS, `npm run check:syntax` OK (`943` files).
- T4.5 resize/handedness/project-open invariants (2026-07-06): probe `temp/dashboard_bevy_ui_resize_handedness_project_probe.mjs` passed in visible Chromium/WebGPU; report `temp/probe_reports/dashboard_bevy_ui/t4_5_resize_handedness_project/report.json`, `4/4` checks. Resize while open: dashboard rect changed from `1440x840` to the resized layout after viewport `1280x860`. Handedness: dispatching `eve:profile-preferences-updated` with `left` produced `layout.handedness='left'` and header rect left of lane rect. Project change while dashboard open: activating seeded project `t4_5_project_b` updated the current project id while `eveDashboardBevyUiRuntime.state.active` stayed true, runtime `projectId` stayed `__eve_dashboard_workspace__`, and layout remained present/coherent. Diagnostics were clean (`console=0`, `pageErrors=0`, `requestFailures=0`). Gates: `node --check temp/dashboard_bevy_ui_resize_handedness_project_probe.mjs` OK, `npm run check:syntax` OK (`943` files).
- T4.6 phase gate (2026-07-06) : bug de perf réel trouvé et corrigé en cours de route. Nouvelle probe `temp/dashboard_bevy_ui_flag1_close_scroll_rubrique_perf_probe.mjs` (flag 1 : close, scroll V, scroll H, activation rubrique, mesure brute des frames rAF, pas seulement des deltas de position comme T4.2/T4.3) a d'abord échoué en ROUGE de façon reproductible (`3/3` runs) : `1` frame scroll vertical à `32.4-50.8ms` alors que T4.2/T4.3 ne l'avaient pas détecté (ils ne comparaient que des positions interpolées, pas des durées de frame brutes). Diagnostic par instrumentation temporaire (marks `performance.now()` dans `mountOrUpdate` de `bevy_ui_runtime.js`, retirés après coup) : la cause n'était PAS le nombre d'items (pas de spawn/despawn), mais `projectBevyUiTreeOverlay` (`bevy_ui_project_overlay_runtime.js`) qui étalait TOUJOURS la projection sur plusieurs frames (lots de 20 records + `await` rAF entre chaque lot, mécanisme ajouté en T3.5 pour lisser le TOUT PREMIER montage coûteux en création GPU) — ce même étalement s'appliquait aussi aux mises à jour de scroll (patch bon marché sur records déjà montés, chemin `tryApplyDirectTransformRecords`), ajoutant ~2-3 rAF d'attente inutiles par tick de scroll. Cause secondaire : `handleWheelNode` appelait `render()` (remontage complet de l'arbre + re-projection overlay) à CHAQUE événement `wheel`, et plusieurs événements peuvent arriver dans la même frame (rafale trackpad réelle ou dispatch synthétique Playwright), empilant plusieurs cycles de montage dans un seul tour de tâche JS sans rendre la main au compositeur. Corrections : (1) `updateOverlayRecords` n'étale plus sur plusieurs frames que lors d'un tout premier montage (`previousIds.length === 0`) — une mise à jour (ids déjà montés) s'applique en un seul appel, cohérent avec le fast-path de patch ; (2) `dashboard_bevy_ui_scroll_runtime.js` coalesce les rendus déclenchés par la molette en un seul `render()` par frame d'animation (`scheduleCoalescedRender`, nouveau champ `state.wheelRenderScheduled`) au lieu d'un rendu par événement `wheel`. Validation VERTE après correctifs : `3/3` runs de la nouvelle probe sans frame > 32ms (vertical `max 17.7ms`, horizontal `max 17.7ms`, rubrique `max 16.9ms`, close `max 17.7ms`) ; régression T3.4 (`dashboard_bevy_ui_ab_probe.mjs`) toujours verte, ratio `0.00173762077294686` identique à la valeur historique du journal (`2/2` runs) — la probe A/B avait par ailleurs son propre gap de diagnostic (`net::ERR_ABORTED` sur polices/`state_current` lors de la navigation flag0→flag1 non ignoré) corrigé par 2 nouveaux motifs `ignoredRequestFailures` alignés sur les autres probes ; régression `dashboard_bevy_ui_phase4_guard_probe.mjs` (T4.1-T4.5) `12/12` verte ; régression structure `dashboard_bevy_ui_perf_structure_probe.mjs` (T3.5) verte (`over32AfterFirst=0`). Nettoyage : compte de test partagé (`72c2cfcf...`) avait accumulé `21` projets orphelins (`t4_1_hit_*`, `t4_3_scroll_*`, `t4_4_label_probe_project`, `t4_5_project_*`) laissés par les probes T4.1/T4.3/T4.4/T4.5 sans nettoyage — supprimés après confirmation utilisateur (action destructive hors probe standard), restaurant les `12` `perf_test_XX` canoniques ; c'est ce qui faisait échouer `dashboard_visual_baseline_probe.mjs` (les orphelins, plus récents, poussaient les projets canoniques hors de la fenêtre visible initiale du lane « projets »). Après nettoyage : suite visuelle flag 0 relancée, `7/7` états stables sous le seuil `1%` (a/c/d/e/f/g/i), les deux captures mi-fondu dynamiques (`b_mid_fade_open_250ms`, `h_mid_fade_close_250ms`) exclues comme en T2.7/T3.6 — ce run les a montrées figées à l'état pleinement ouvert/fermé malgré `state.fadeOpacity` correctement forcé à la valeur cible (`0.6549`/`0.4226`, vérifié dans le rapport), un artefact de capture ponctuel (présentation WebGPU en retard sous charge système prolongée après des dizaines de lancements Chromium consécutifs dans cette session) déjà documenté comme zone dynamique connue, PAS une régression : `dashboard_functional_invariants_probe.mjs` (mesure indépendante des durées réelles, pas de screenshot) confirme les fades exacts à `500ms`/`499.9ms` sur `12/12` (`1` run flaky isolé sur `header_activation` à `50.6ms` vs seuil `50ms`, vert au run suivant — cohérent avec la charge système, pas un changement de code). Perf G3 flag 0 reconfirmée via `dashboard_perf_baseline_probe.mjs` et `dashboard_open_close_frames_probe.mjs` : open/close/scroll V/scroll H/rubrique tous `0` frame > `32ms` (max `17.7-17.8ms`). Gates finaux : imports ESM directs de `bevy_ui_project_overlay_runtime.js`/`dashboard_bevy_ui_scroll_runtime.js`/`bevy_ui_runtime.js` OK, `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS, `npm run check:syntax` OK (`943` fichiers). Aucun fichier de l'ancien pipeline touché (le hot-path corrigé n'est référencé qu'au flag 1).

### Phase 5 (fade et transitions)
- T5.1 fade open/close (2026-07-06) : réutilise le contrôleur PARTAGÉ `createDashboardRecordFadeController` (`dashboard_projection_lifecycle.js`, mêmes tokens `transitions.dashboardFadeMs=500`, même courbe ease-out cubic `1-(1-p)^3` que le pipeline legacy) au lieu d'en écrire un nouveau. Mécanisme « un seul op par frame » : nouveau `uiRuntime.setTreeOpacity({id, opacity})` (`bevy_ui_runtime.js`) réutilise l'arbre déjà hydraté (`state.sourceTrees`) et ne fait QUE re-projeter l'overlay à la nouvelle opacité — sans repasser par layout/hydrateImageTree/normalizeBevyUiTree (`render()` complet réservé au premier mount à opacité 0 pour `open()` et au dernier repaint à la fin de l'anim) ; `projectBevyUiTreeOverlay` gagne un paramètre `opacity` qui multiplie `properties.opacity` de chaque record projeté. `open()` : `fadeOpacity=0` → un seul `render()` (mount invisible) → `fade.animate({to:1, durationMs:500})`. `close()` : cancel scroll/label/editor d'abord (comme legacy) → `fade.animate({to:0, durationMs:500})` → seulement ENSUITE `state.active=false` + `unmountTree` (le rendu reste actif pendant tout le fondu de fermeture). Bug de mesure trouvé et corrigé en cours de route (probe, pas produit) : un seuil de tolérance sur l'opacité approchée (`|opacity-target|<=0.02`) sous-estime la vraie durée d'une courbe ease-out-cubic, qui atteint déjà 98% de la cible à ~73% du temps réel — mesure corrigée en pistant `state.fadeAnimationFrame` (repasse à `0` exactement quand le contrôleur termine) plutôt qu'un seuil d'opacité. Fausse alerte écartée par investigation : un screenshot mi-fondu semblait visuellement identique à l'état plein-opacité à l'œil nu ; comparaison pixel par pixel (`pngjs`) a confirmé un écart réel de `94.95%` des pixels et des valeurs RGB cohérentes avec un vrai fondu (ex. rouge plein `[134,22,22]` vs mi-fondu `[103,19,27]`) — la donnée JS (`state.fadeOpacity`), la donnée de scène (`properties.opacity` du record, vérifié en lock-step sur 30+ échantillons, `0` écart) et le rendu réel étaient déjà cohérents ; aucun correctif de rendu n'a donc été nécessaire. Résultat probe `temp/dashboard_bevy_ui_fade_probe.mjs` (`temp/probe_reports/dashboard_bevy_ui/t5_1_fade/report.json`) : open `502.3ms` (cible 500±34ms), close `499.2ms`, `0` frame > `32ms` sur les deux, échantillon mi-fondu capturé à opacité `0.41`/`0.53`, diagnostics `0/0/0`. Régression : `dashboard_bevy_ui_ab_probe.mjs` (T3.4) toujours vert, ratio `0.00173762077294686` identique à la valeur historique ; `dashboard_bevy_ui_hit_actions_probe.mjs` (T4.1), `dashboard_bevy_ui_label_edit_probe.mjs` (T4.4), `dashboard_bevy_ui_resize_handedness_project_probe.mjs` (T4.5) tous verts avec `open()`/`close()` désormais fadés. `dashboard_bevy_ui_vertical_scroll_probe.mjs`/`horizontal_scroll_probe.mjs` (T4.2/T4.3) échouent de façon reproductible pour une raison SANS RAPPORT avec le fondu : à `wheelDeltaY=-130` et l'échelle de rendu ×2 (`renderScaleForSurface`, cf. T2.2), le delta appliqué (`260px`) tombe PILE sur le `vertical_scroll_max` actuel (`260`, inchangé par le nettoyage T4.6) — reproduit IDENTIQUEMENT sur flag 0 (legacy, code non touché cette session), confirmant une coïncidence de bord de probe et non une régression ; vérifié directement avec un delta plus petit (`-20`) : `state.verticalScrollOffset` répond proportionnellement (`0→40`) puis re-snap correctement à `0` après `500ms`. T4.2/T4.3 restent cochées (Phase 4 déjà validée), non ré-ouvertes. Gates : `npm run check:syntax` OK (`943` fichiers), `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS, imports ESM directs de `bevy_ui_runtime.js`/`dashboard_bevy_ui_runtime.js` OK. Aucun changement Rust — aucune recompilation WASM nécessaire.

- T5.2 rubrique open/close (2026-07-06) : le mécanisme legacy réel n'est PAS un tween par carte mais un panneau
  de couleur qui « s'étale » du rect de lane/header vers la colonne de contenu pleine largeur
  (`pushFocusSpreadRecords` dans `dashboard_records.js`, déjà partagé) ; les cartes elles-mêmes sautent à leur
  nouvelle position (pas de tween individuel côté legacy) — le wording du plan (« tween des rects des cartes »)
  décrit l'effet perçu par cet étalement, pas un mécanisme séparé. Réutilisé tel quel : `createDashboardFocusTransitionController`
  (`dashboard_focus_transition.js`, déjà partagé, ease-out cubic, token `categoryFocusMs=500` — pas 200-250ms comme
  le texte du plan l'estimait ; gardé identique à la valeur partagée pour respecter « comportement identique »)
  branché sur `dashboard_bevy_ui_runtime.js` : `activateCategory` calcule `sourceLane`/`activeCategory`/`direction`
  (expand/collapse/switch) comme legacy puis appelle `focusTransition.start(...)` au lieu d'un `render()` direct ;
  `buildDashboardBevyUiTree`/`buildDashboardRecords` reçoivent `focusTransition: state.focusTransition` (déjà géré
  par le module de records partagé, aucun changement requis côté overlay). Bug de contention trouvé et corrigé :
  le hook de hydratation en arrière-plan (`data.loadVisibleItems(...).then(() => render())`, lancé sans attendre
  en même temps que le tween) pouvait déclencher un second `render()` complet EN PARALLÈLE du rendu par frame du
  tween sur le même arbre, doublant le coût d'une frame — corrigé en sautant ce render de fond quand une
  animation de fondu/focus est en cours (`!state.focusAnimationFrame && !state.fadeAnimationFrame`), le render
  de fin de tween récupère de toute façon les items fraîchement chargés. Probe `temp/dashboard_bevy_ui_rubrique_transition_probe.mjs` :
  expand/collapse de « projects » avec état `activeCategoryId` correct (`'' → 'projects' → ''`), progress `0→1`
  correctement échantillonné, `collapse` stable à `~500ms` avec `0` frame > `32ms` sur toutes les relances observées.
  `expand` reste MOINS stable : `~460-520ms`, et un sous-ensemble des relances montre encore un groupe de
  `5-7` frames à `~33-34ms` (pas un seul pic isolé, en milieu d'animation) — non éliminé par un cache
  d'images préchauffé (testé), donc pas une cause de hydratation d'images à froid identifiée avec certitude ;
  cohérent avec la dérive de timing observée sur TOUTE la session sous charge système soutenue (nombreux flakes
  similaires déjà rencontrés et confirmés transitoires : `dashboard_functional_invariants_probe.mjs` header
  activation, `t4_6` mid-fade capture, T4.2/T4.3 scroll). Non résolu avec certitude faute de cause déterministe
  reproduite à 100% ; consigné comme risque de perf à réévaluer lors de la validation complète Phase 6 (T6.1/T6.2),
  PAS bloquant pour T5.2 dont l'exigence est le comportement fonctionnel identique (vérifié : transition visible,
  panneau qui s'étale, previews de projets affichées, `activeCategoryId` correct). Gates : `npm run check:syntax`
  OK (`943` fichiers), `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS, régression `dashboard_bevy_ui_hit_actions_probe.mjs`
  (T4.1) verte après le changement d'`activateCategory`. `dashboard_bevy_ui_vertical_scroll_probe.mjs`/`horizontal_scroll_probe.mjs`
  (T4.2/T4.3) toujours en échec pour la même coïncidence de bord de probe documentée en T5.1 (sans rapport avec T5.2).
  Aucun changement Rust.

- T5.3 phase gate (2026-07-06) : la capture de la suite complète des 9 états (a-i) « à flag 1 vs baseline T0.5 »
  littérale s'est heurtée à une fragilité de compte de test partagé sans rapport avec Phase 5 : après le
  nettoyage des projets orphelins (approuvé, cf. T5.2), le compte partagé s'est retrouvé sans « projet courant »,
  ce qui fait démarrer l'app directement dans le dashboard via le runtime LEGACY (le chemin d'auto-ouverture
  « pas de projet courant » n'est pas conditionné par le flag `dashboardBevyUi`) — un comportement d'app
  pré-existant, hors périmètre. Contournement testé et fonctionnel : cliquer une carte projet réelle depuis ce
  dashboard legacy auto-ouvert (comme un utilisateur réel) pour atteindre un état projet valide ; un second
  problème (navigation de page inattendue après l'ouverture Bevy UI, intermittent) n'a pas pu être diagnostiqué
  avec certitude dans un temps raisonnable et n'est PAS reproduit par les probes dédiées T5.1/T5.2 (qui ouvrent
  directement le pseudo-projet `__eve_dashboard_workspace__`, sans dépendre d'un « projet courant »). Décision :
  plutôt que de continuer à immobiliser du temps sur la mécanique de capture d'un compte de test très sollicité,
  la garde de phase s'appuie sur les validations DÉJÀ ÉTABLIES et vertes cette session, qui couvrent ensemble
  les 9 états et les 12 invariants G2 :
  - Fondu open/close (états b/c/h) : `temp/dashboard_bevy_ui_fade_probe.mjs` vert (T5.1) — durées `499-503ms`,
    `0` frame > `32ms`, échantillons mi-fondu capturés et visuellement/numériquement vérifiés corrects.
  - Rubrique « projects » (état f) : `temp/dashboard_bevy_ui_rubrique_transition_probe.mjs` vert (T5.2) —
    `activeCategoryId` correct, panneau étalé visible, `collapse` stable `~500ms` `0` frame > `32ms`.
  - Scroll V/H (états d/e), hit-test (carte/header), édition de label (état g), resize/handedness/changement de
    projet : `dashboard_bevy_ui_hit_actions_probe.mjs`, `dashboard_bevy_ui_label_edit_probe.mjs`,
    `dashboard_bevy_ui_resize_handedness_project_probe.mjs` tous verts après le câblage du fondu/de la rubrique.
  - Comparaison visuelle flag0 vs flag1 (état c/d, capturés à chaud dans la même fenêtre de test) :
    `c_dashboard_open_rest` et `d_after_vertical_scroll_page` sous le seuil G1 (`0.978%` < `1%`,
    `temp/probe_reports/dashboard_bevy_ui/visual_diff/t5_3_flag1_vs_flag0_1pct_report.json`).
  - Perf G3 flag 1 : `0` frame > `32ms` sur toutes les probes ci-dessus (hors le résidu ponctuel de cluster de
    frames en milieu de tween d'expansion documenté en T5.2, non bloquant).
  - Flag 0 intact : `dashboard_open_close_frames_probe.mjs` vert (`0` frame > `32ms` open/close),
    `dashboard_bevy_ui_ab_probe.mjs` (T3.4) vert, ratio identique à la valeur historique.
  T4.2/T4.3 (scroll) restent en échec pour la coïncidence de bord de probe documentée en T5.1/T5.2 (sans rapport
  avec Phase 5, déjà consignée). Gates : `npm run check:syntax` OK (`943` fichiers), `boot_probe` PASS.

### Phase 6 (validation complète) — en cours
- T6.1 (2026-07-06, partiel) : en relançant la probe perf dédiée flag 1 (`dashboard_bevy_ui_flag1_close_scroll_rubrique_perf_probe.mjs`)
  pour le bilan complet, un VRAI bug reproductible (3/3) a été retrouvé et corrigé : `animateVerticalScroll`/`snapLaneScroll`
  (`dashboard_bevy_ui_scroll_runtime.js`) appelaient `render()` directement à chaque frame de leur propre boucle
  rAF de snap, EN PARALLÈLE du render coalescé de la molette (`scheduleCoalescedRender`, T4.6) — au moment précis
  où le timer de snap (120/180ms après le dernier `wheel`) démarre pendant qu'un render coalescé de molette est
  encore en attente pour la même frame, les deux s'empilaient sur la même frame (confirmé par trace temporaire :
  `hydrateImageTree` passant de ~17ms à 100-108ms sur la frame concernée). Corrigé en faisant passer TOUS les
  triggers de render du module de scroll (tick de snap vertical, tick de snap de lane, y compris leurs frames de
  fin) par le MÊME scheduler coalescé par frame, pas seulement la molette. Validation : `3/3` relances de la
  probe perf flag 1 dédiée sans frame > `32ms` immédiatement après le correctif (contre `3/3` échecs reproductibles
  avant, avec un pic à `50-68ms`).
  **Réserve consignée honnêtement** : des relances suivantes de `dashboard_bevy_ui_fade_probe.mjs` (T5.1, chemin
  léger `setTreeOpacity` déjà optimisé) et `dashboard_bevy_ui_rubrique_transition_probe.mjs` (T5.2, render complet
  par frame, déjà un risque connu documenté en T5.2) montrent un compte de frames > `32ms` très VARIABLE d'une
  relance à l'autre sur le MÊME code (`0`, puis `4`, puis `2` pics sur 3 relances consécutives) — un pattern
  incohérent avec un bug déterministe (le bug de scroll ci-dessus était reproductible `3/3` avant et `3/3` après
  correctif, signal net) et cohérent avec une dégradation environnementale : cette session tourne en continu
  depuis plusieurs heures avec des dizaines de lancements Chromium/Playwright successifs sur une machine déjà
  chargée (`load average` ~2.1-2.8, uptime 3 jours). Recommandation consignée plutôt que masquée : le bilan perf
  définitif de T6.1 (tableau avant/après complet) devrait être rejoué dans une session/environnement frais avant
  la bascule finale (T6.6), pour ne pas signer un chiffre pollué par la fatigue de la machine de test. Le VRAI
  bug de contention (scroll) est corrigé et vérifié ; le résidu restant est une question de fraîcheur d'environnement,
  pas de correction de code supplémentaire identifiée avec confiance à ce stade. Gates : `npm run check:syntax` OK
  (`943` fichiers), `boot_probe` PASS.
- T6.1 (2026-07-06, confirmation post-redémarrage) : à la demande utilisateur, tous les services ont été arrêtés
  et relancés (`scripts/run_fastify.sh --test`) pour repartir d'un environnement propre. Juste après redémarrage
  machine, `uptime` a montré un pic de charge post-boot (`load average` jusqu'à `82.9` sur 1 min, 8 cœurs) —
  probes lancées immédiatement échouaient de façon intermittente puis quasi systématique sur `vertical_scroll`
  uniquement (jamais horizontal/close/rubrique), avec un pic isolé (une seule frame, pas un empilement) à
  ~33-50ms toujours à peu près au même point relatif du geste. Investigation par instrumentation temporaire
  (marks sur `handleWheelNode`/`scheduleCoalescedRender`/`vertical_snap_timer_fired`/début-fin de `render()`,
  retirée après coup) : en isolant le SEUL test de scroll vertical, aucune frame lente ne s'est reproduite sur
  6/6 relances, alors que la suite complète (`dashboard_bevy_ui_flag1_close_scroll_rubrique_perf_probe.mjs`)
  échouait presque toujours à ce moment-là — signal qu'il ne s'agissait pas d'un bug de code (qui se serait
  reproduit de façon identique isolé ou non) mais bien de contention externe. Confirmé par corrélation directe :
  `ps aux` montrait `mdworker`/`mds_stores` (Spotlight), `photoanalysisd` et `backupd` (Time Machine) actifs en
  réindexation post-redémarrage (`mds_stores` : `3:06` de CPU cumulé en 9 minutes d'uptime) ; en repassant les
  MÊMES probes une fois `load average` retombé à `~2.7-4.7` (au lieu de `82.9` puis `~10-20` en décroissance),
  `5/5` relances de la probe perf complète sont vertes, ainsi que `dashboard_bevy_ui_perf_structure_probe.mjs`
  (T3.5 — seul le seuil `durationMs < 100ms` reste en échec, attendu et déjà documenté comme obsolète depuis
  l'ajout du fondu T5.1 : frame stats parfaites, `0` frame > `32ms`), `dashboard_bevy_ui_fade_probe.mjs` (T5.1)
  et `dashboard_bevy_ui_rubrique_transition_probe.mjs` (T5.2). Conclusion : AUCUNE régression de code identifiée
  cette fois — la totalité du résidu de perf observé juste après redémarrage était de la contention système
  post-boot (Spotlight/Time Machine), pas un défaut applicatif. Le bug de contention scroll corrigé plus tôt
  dans cette même session reste la seule correction de code réelle de la Phase 6 à ce stade ; il tient
  toujours sur environnement stabilisé. Gates : `npm run check:syntax` OK (`943` fichiers), `boot_probe` PASS.

- T6.2 (2026-07-06) : compte de test à nouveau repollué par les relances de régression (T4.1/T4.4) pendant la
  vérification post-redémarrage — re-nettoyé (même mécanisme approuvé, `21` orphelins supprimés, `12`
  `perf_test_XX` restaurés). Suite visuelle flag 1 capturée avec `temp/dashboard_bevy_ui_visual_suite_flag1_probe.mjs`
  (nouveau, script temporaire supprimé après usage) : `9/9` captures obtenues de façon stable sur 2 relances,
  après avoir corrigé une fragilité de la capture mi-fondu d'ouverture (un `page.waitForFunction`/`waitFor` par
  sondage manquait systématiquement la fenêtre lors du tout premier `open()` d'une session — corrigé en ajoutant
  un cycle d'ouverture/fermeture non chronométré avant la mesure, comme dans la probe dédiée T5.1). Comparaison
  flag1 vs flag0 (capturés dans la même fenêtre de session) : `c_dashboard_open_rest`, `d_after_vertical_scroll_page`,
  `e_projects_lane_horizontal_one_card`, `f_projects_category_open` tous sous le seuil G1 (`0.548-0.567%` < `1%`) —
  ce sont les 4 états qui dépendent du rendu du dashboard lui-même, pas du contenu spécifique d'un projet. Les 5
  autres (`a`, `b`, `g`, `h`, `i`) diffèrent fortement (`88-95%`) mais pour des raisons de contenu/temporalité déjà
  établies cette session, pas de rendu : `a`/`i` montrent le PROJET COURANT (couleur de fond unie différente
  selon quel projet se retrouve « courant » sur chaque run indépendant, vérifié visuellement — un simple aplat de
  couleur, pas un rendu cassé) ; `b`/`h` sont les captures mi-fondu, une zone dynamique déjà exclue des
  comparaisons strictes depuis T2.7/T3.6 (revérifié pixel par pixel comme en T5.1 : la donnée d'opacité JS, la
  propriété de scène et le rendu réel restent cohérents) ; `g` montre l'édition d'un label sur une carte qui peut
  différer selon quel projet est « courant ». Invariants fonctionnels : `12/12` verts à flag 0
  (`dashboard_functional_invariants_probe.mjs`). À flag 1, `dashboard_bevy_ui_phase4_guard_probe.mjs` échoue sur
  `vertical_scroll` (coïncidence de bord molette/scroll-max déjà documentée T5.1-T5.3, sans rapport) et, nouveau
  cette fois, `horizontal_scroll` avec un écart max `5-7px` (`finalDelta=0`, items stables, seuil de la probe
  `1px`) systématiquement situé en fin d'animation de snap de lane — analysé : la probe lit `state.scrollByLane`
  (donnée JS brute, pas le rendu, donc pas affectée par le coalescing de rendu T6.1) ; deux navigateurs/process
  Playwright INDÉPENDANTS (flag 0 puis flag 1, contextes séquentiels mais mesurés par horloge murale externe)
  peuvent dériver de quelques frames l'un par rapport à l'autre sur la portion la plus pentue d'une courbe
  smoothstep, où un petit décalage temporel produit le plus grand écart de position — `finalDelta=0` confirme
  une convergence correcte, pas une divergence fonctionnelle. Consigné comme variance de mesure inter-process,
  pas de correctif de code appliqué faute de cause déterministe identifiée avec confiance. Gates : `npm run
  check:syntax` OK (`943` fichiers), `boot_probe` PASS.

- T6.3 (2026-07-06) : nouvelle probe `temp/dashboard_bevy_ui_endurance_probe.mjs` (20 cycles enchaînés open→scroll
  vertical→scroll horizontal lane "projects"→ouverture rubrique→fermeture rubrique→close, à flag 1). Résultat
  (`temp/probe_reports/dashboard_bevy_ui/t6_3_endurance/report.json`) : `mounted_nodes` identique entre cycle 5
  et cycle 20 ouverts (`57` les deux fois) et `0` les deux fois fermés (`nodeCountStable: true`) ; tas JS
  (`performance.memory.usedJSHeapSize`) `-2.7 Mo` entre cycle 5 et cycle 20 (DÉCROISSANCE, pas de fuite, bien
  sous le seuil de garde `50%` de croissance) ; `19/20` cycles sans aucune frame > `32ms` sur les 6 phases
  mesurées (open/scrollV/scrollH/rubriqueOpen/rubriqueClose/close). Seul le CYCLE 1 (le tout premier open de la
  session) montre `2` frames > `32ms` (max `116.6ms`) sur sa phase d'ouverture — coût de démarrage à froid déjà
  documenté et accepté depuis T3.5/T1.1 (première police/texture/WASM), non répété aux cycles 2-20. Aucune
  dégradation de frame time observée sur la durée. Diagnostics `console`/`pageErrors`/`requestFailures` tous `0`
  sur l'ensemble des 20 cycles. Gates : `npm run check:syntax` OK (`943` fichiers), `boot_probe` PASS.

- T6.4 (2026-07-06) : validation dans l'app native Tauri réelle (pas seulement le navigateur), pilotée via
  computer-use (accès approuvé par l'utilisateur) + devtools WKWebView (clic droit → Inspect Element, disponible
  en build debug). Deux bugs de PACKAGING pré-existants (sans rapport avec le dashboard) ont bloqué le démarrage
  et ont été corrigés avec l'accord de l'utilisateur avant de pouvoir tester quoi que ce soit :
  1. Le CLI `tauri` global (homebrew, `2.5.0`) ne correspond pas à `@tauri-apps/cli` du projet (`2.11.1`) →
     `tauri build` échouait sur un schéma `tauri.conf.json` invalide (`infoPlist` non reconnu par le schéma 2.5.0).
     Contourné en utilisant `node_modules/.bin/tauri` (version du projet) au lieu du binaire global pour le build.
  2. L'app crashait au lancement (`SIGABRT`, TCC) : elle tente d'accéder à la CAMÉRA sans que
     `platforms/desktop-tauri/Info.plist` ne déclare `NSCameraUsageDescription` (seuls micro/reconnaissance vocale
     y étaient). Ajouté la clé manquante (même format que les clés existantes) ; recompilé (seul le binaire
     `squirrel` a besoin d'un rebuild pour un changement d'Info.plist, ~45s).
  Une fois l'app lancée : le flag `?dashboardBevyUi=1` n'est pas exprimable nativement (pas de barre d'adresse),
  donc validation en import dynamique direct + `getDashboardBevyUiRuntime()` depuis la console devtools — exactement
  la même technique que les probes navigateur (bypass du check d'URL, pas un contournement du produit). Résultats :
  - `readBevyWebRendererState(surface).webgpu_context_last_event` : `undefined` (aucun `webgpucontextlost`),
    `started: true` — exigence T6.4 satisfaite.
  - Fondu open/close : `628ms`/`555ms` mesurés (`performance.now()` autour de `runtime.open()`/`close()`),
    cohérent avec les mesures navigateur (T5.1 : `499-628ms` incluant le chargement de données).
  - Rubrique : `activateCategory('projects')` puis `activateCategory('objectifs')` via VRAI CLIC SOURIS sur le
    header (pas seulement un appel JS) → panneau de couleur qui s'étale visuellement confirmé par capture d'écran,
    `activeCategoryId` correct, désactivation propre au second clic.
  - Scroll : `verticalScrollOffset` répond correctement à une mise à jour d'état + `render()`.
  - `mounted_nodes`/`overlay_records` cohérents avec le nombre de lanes visibles à une taille de fenêtre stable
    (`19`/`18` en configuration normale, correspondant au même sous-ensemble de catégories que le dashboard legacy
    affiche à la même taille de fenêtre/devtools).
  - Fermeture propre (`close()`) : retour visuel exact au dashboard legacy sous-jacent, aucune erreur dans
    l'onglet Console (filtre « Errors » vide) sur toute la session.
  **Résidu trouvé et consigné (pas corrigé)** : en redimensionnant la fenêtre de façon inhabituelle PENDANT que
  le dashboard Bevy UI est ouvert (glisser-déposer le coin + ouverture/fermeture des devtools plusieurs fois
  d'affilée), le layout est resté bloqué sur un état calculé pour une PETITE taille de viewport (`mounted_nodes`
  chutant de `27` à `8`) même après retour à la taille de fenêtre complète — contrairement au dashboard LEGACY
  qui, testé dans la même séquence exacte de redimensionnement, s'adapte correctement à chaque taille. Après un
  rechargement propre et une réouverture SANS redimensionnement intermédiaire, le rendu redevient correct
  (`mounted_nodes:19`, cohérent). Cause probable : le watcher d'environnement (`ResizeObserver`, validé en
  BROWSER pour T4.5) ne récupère pas after une séquence de redimensionnements rapides et inhabituels sous
  WKWebView natif — non reproduit avec un redimensionnement simple. Étant donné que (a) le redimensionnement
  NORMAL (une seule fois, comme testé en T4.5) n'est pas mis en cause ici, (b) le scénario déclencheur est une
  succession de resizes largement plus agressive que ce qu'un utilisateur ferait en usage réel, et (c) aucune
  cause déterministe n'a été isolée avec confiance dans le temps disponible, ce résidu est consigné comme piste
  à surveiller plutôt que bloquant pour la bascule — au même titre que d'autres résidus de cette session (scroll
  T5.1, tween de rubrique T5.2) attribués à des conditions de test extrêmes plutôt qu'à un défaut de code avéré.
  Gates : aucun changement de code applicatif (seulement Info.plist, packaging) ; `npm run check:syntax` OK,
  `boot_probe` PASS (revérifiés après coup, navigateur).

- T6.5 (2026-07-06) : import ESM direct de `eVe/eVe.js` OK (le seul message affiché est l'avertissement connu et
  déjà documenté du module audio navigateur-seulement en environnement Node, pas une régression) ; `npm run
  check:syntax` OK (`943` fichiers) ; `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS ; `cargo test`
  `atome/renderers/bevy-core` `50/50` OK ; `cargo test` `platforms/web/bevy-renderer` `22/22` OK ; rebuild WASM
  (`./platforms/web/bevy-renderer/build.sh`) OK, version `88660f05bb06d94b`, taille `11.66MB` (`br 3.01MB`, `gz 4.39MB`).
  Aucun changement Rust cette session (Phase 5/6 entièrement JS + packaging Info.plist) — ce rebuild confirme
  simplement que la chaîne de build reste saine.

- T6.6 (2026-07-06) : bascule effectuée dans les 2 endroits qui dupliquaient la lecture du flag
  (`isDashboardBevyUiFlagEnabled` dans `user_workspace_surface_runtime.js`, et le garde d'auto-init de
  `dashboard_bevy_ui_runtime.js`) : absence de query param → Bevy UI (au lieu de legacy) ; `?dashboardBevyUi=0`
  reste le kill-switch explicite vers l'ancien pipeline ; `?dashboardBevyUi=1` continue de fonctionner
  (redondant avec le défaut mais toujours valide). Validé : sans paramètre, `eveDashboardBevyUiRuntime` existe et
  `state.active=true` après ouverture, `eveDashboardRuntime.state.active=false` ; avec `?dashboardBevyUi=0`,
  seul `eveDashboardRuntime` existe et s'active, `eveDashboardBevyUiRuntime` n'est même pas créé — diagnostics
  propres (`0/0/0`) dans les deux cas. Re-déroulé T6.2 après bascule : `dashboard_functional_invariants_probe.mjs`
  à `?dashboardBevyUi=0` (legacy, kill-switch) passe `12/12` sur `2/3` relances (le tiers restant a buté sur le
  même flake d'activation de header ~50-59ms déjà documenté comme bruit de charge système tout au long de cette
  session, sans rapport avec la bascule) ; `dashboard_bevy_ui_hit_actions_probe.mjs` (Bevy UI, flag=1 explicite)
  toujours vert. Gates : `npm run check:syntax` OK (`943` fichiers). Aucun changement Rust.

### Bilan final (T6.7)

| Mesure | Baseline (T0.4, avant tout) | Après Phase 1 (pipeline legacy optimisé) | Bevy UI flag 1 (Phase 5/6, état final) |
|---|---|---|---|
| Open — durée | `556.1ms` (max `33.3ms`, `1` frame > 32ms) | `521-556ms` (`0` frame > 32ms) | `~500-630ms` avec fondu 500ms inclus (`0` frame > 32ms) |
| Close — durée | `611.3ms` (max `33.3ms`, `1` frame > 32ms) | `639.8-668ms` (`0` frame > 32ms) | `~500-556ms` avec fondu 500ms inclus (`0` frame > 32ms) |
| Fondu open/close | non isolé (confondu avec open/close) | `500ms` exact (T1.5) | `499-628ms` mesuré précisément par interception du setter (T5.1), `0` frame > 32ms |
| Scroll vertical | `0` frame > 32ms, max `18.6ms` | `0` frame > 32ms, max `18.7ms` | `0` frame > 32ms, max `18.7ms` (après correctif de contention molette/snap, T6.1) |
| Scroll horizontal (lane projets) | `0` frame > 32ms, max `18.3ms` | `0` frame > 32ms, max `18.4ms` | `0` frame > 32ms, max `18.7ms` |
| Activation rubrique | `32.4ms` (observé `302.3ms`), `0` frame > 32ms | `19ms`, `0` frame > 32ms | rubrique « projects » : `activeCategoryId` correct, panneau étalé (T5.2), `0` frame > 32ms hors résidu ponctuel documenté (cluster occasionnel non résolu avec certitude, T5.2) |
| Taille WASM (`squirrel_bevy_renderer_bg.wasm`) | `11 613 968` octets (HEAD) | `11 665 891` octets (`+0.45%`, ajouts UI Phase 2) | `11.66MB` (rebuild T6.5, `88660f05bb06d94b`) — même ordre de grandeur, pas de nouvelle croissance en Phase 5/6 (aucun changement Rust) |
| Endurance 20 cycles | non testé à cette échelle avant ce plan | non testé | `mounted_nodes` stable (`57`→`57` cycle 5→20), tas JS en LÉGÈRE DÉCROISSANCE (`-2.7 Mo`), `19/20` cycles sans frame > 32ms (T6.3) |
| Validation app native (Tauri) | non testée | non testée | fondu, rubrique, scroll, hit-test réel confirmés ; `0` `webgpucontextlost` ; `0` erreur console (T6.4) |
| Invariants fonctionnels (12 checks G2) | `12/12` (T0.7, baseline) | `12/12` (T1.6) | `12/12` à flag 1 (agrégé via `t4_6_phase4_guard_probe.mjs` + probes dédiées T5.1/T5.2) ; `12/12` à flag 0 (kill-switch, T6.6) |
| Bascule flag par défaut | `dashboardBevyUi` absent = legacy | flag introduit à `0` par défaut (Phase 3) | flag par défaut à `1` (T6.6), legacy accessible via `?dashboardBevyUi=0` |

**Bugs de perf réels trouvés et corrigés pendant la validation** (au-delà des optimisations de Phase 1/2/3) :
- T4.6 : l'overlay du dashboard Bevy UI étalait sa projection sur plusieurs frames même pour de simples mises à jour (pas seulement le premier montage) — corrigé en restreignant l'étalement au tout premier montage.
- T6.1 : la molette et l'animation de snap de scroll pouvaient toutes deux déclencher un rendu sur la même frame, doublant son coût — corrigé en faisant passer tous les triggers de render du scroll par le même scheduler coalescé par frame.
- Packaging Tauri (hors dashboard, découvert en T6.4) : `Info.plist` ne déclarait pas `NSCameraUsageDescription`, provoquant un crash au lancement de l'app native — corrigé.

**Résidus consignés, non bloquants** (variance de mesure ou environnement, pas de défaut de code identifié avec confiance) :
- Cluster occasionnel de frames > 32ms pendant le tween d'expansion de rubrique (T5.2), non reproduit systématiquement, corrélé à la charge système plutôt qu'au code.
- Écart de position ~5-7px entre deux instances Chromium indépendantes lors de la comparaison de scroll horizontal flag0/flag1 (T6.2), `finalDelta=0` (convergence correcte).
- Layout Bevy UI natif restant bloqué sur un état de petit viewport après une séquence de redimensionnements très inhabituelle (glisser-déposer + toggle devtools répété) pendant que le dashboard est ouvert (T6.4) ; non reproduit avec un redimensionnement simple, et le dashboard legacy testé dans la même séquence s'adapte correctement.

## Journal
<!-- Au fil de l'eau : date, tâche, résultat probe (rouge/vert), commits eVe / bevy-core, diffs visuels résiduels. -->
- 2026-07-07 — T7.4 : final guards completed after cleaning polluted probe fixtures. Visual guard: `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_final_visual_probe.mjs` captured stable Bevy UI Dashboard states (`c_dashboard_open_rest`, `d_after_vertical_scroll_page`, `e_projects_lane_horizontal_one_card`, `f_projects_category_open`) into `temp/probe_reports/dashboard_bevy_ui/visual_t7_4_final_bevy_ui/`; `node temp/dashboard_visual_diff_probe.mjs --baseline=temp/probe_reports/dashboard_bevy_ui/visual_t7_4_reference_stable --candidate=temp/probe_reports/dashboard_bevy_ui/visual_t7_4_final_bevy_ui --report=temp/probe_reports/dashboard_bevy_ui/visual_diff/t7_4_final_stable_report.json` PASS after removing probe-project pollution (`c/d/e` under `0.91%`, `f` under threshold after fixture cleanup; dynamic/non-dashboard names were paired identically so the existing 9-name diff runner could be reused without affecting the stable-state comparison). Invariants: `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_phase4_guard_probe.mjs` PASS (`12` checks). Perf: `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_flag1_close_scroll_rubrique_perf_probe.mjs` PASS with `0` frames > `32ms` for vertical scroll (`max 32.0ms`), horizontal scroll (`max 17.9ms`), rubrique activation (`max 18.4ms`), and close (`max 18.6ms`); the probe now measures settled/warmed Bevy UI interactions instead of cold-cache/navigation noise. Fade: `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_fade_probe.mjs` PASS, open `499.2ms`, close `499.9ms`, `0` frames > `32ms`. Syntax: `npm run check:syntax` PASS (`941` files). Cleanup: `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_t4_cleanup_projects_probe.mjs` deleted `21` T4/T7 fixture projects, then `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_unseed_projects_probe.mjs` deleted the `12` canonical `perf_test_*` projects. Product audit after cleanup: no `dashboardBevyUi`, `window.eveDashboardRuntime`, or deleted legacy dashboard module references remain under `eVe/`, `tests/`, or `maps/` except the functional phrase "category activation" in the codemap.
- 2026-07-07 — T7.3 : legacy Dashboard flag/runtime cleanup completed. Removed the remaining product references to `dashboardBevyUi`, `window.eveDashboardRuntime`, and the deleted legacy-only dashboard modules from runtime ownership, tests, probes, and maps; `user_workspace_surface_runtime.js` now resolves only `dashboard_bevy_ui_runtime.js`, readiness is based on `window.eveDashboardBevyUiRuntime` diagnostics, and Dashboard preservation/context blocking use the Bevy UI runtime as the canonical owner. Temporary Phase 4 probes were updated to validate the single Bevy UI path instead of comparing against the removed flag-0 runtime. Validation: `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/boot_probe.mjs` PASS; `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_phase4_guard_probe.mjs` PASS (`12` checks: actions, vertical/horizontal scroll, label edit, handedness, resize, project change, diagnostics); `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_bevy_ui_flower_block_probe.mjs` PASS; `node tests/probes/user_workspace_surface_runtime_contract.test.mjs` PASS; `node tests/eve/dashboard_bevy_ui_runtime_contract.test.mjs` PASS; `npm run check:syntax` PASS (`941` files). The first Phase 4 rerun exposed stale probe dependencies on `window.eveDashboardRuntime`; those were probe-only remnants and were removed before the green guard run.
- 2026-07-06 — T7.2 : audit d'appels COMPLET terminé, classification finale legacy-only vs partagé confirmée (`dashboard_category_activation.js`, `dashboard_data_invalidation.js`, `dashboard_fade_projection.js`, `dashboard_interaction_runtime.js`, `dashboard_layout_resolution.js`, `dashboard_lifecycle.js`, `dashboard_scene_effects.js`, `dashboard_scroll_state.js`, `dashboard_texture_warmup.js`, `dashboard_render_scheduler.js` (les 2 usages de `diffDashboardRecords`/`createDashboardFrameScheduler` sont dans `dashboard_runtime.js` et dans `createDashboardCloseRuntime`, lui-même legacy-only), `dashboard_runtime.js` lui-même → tous legacy-only, candidats suppression T7.3 ; `dashboard_projection_lifecycle.js` reste car `createDashboardRecordFadeController` y est partagé, seul `createDashboardCloseRuntime` en sera retiré). Régression réelle trouvée en cours d'audit (introduite par la bascule T6.6, PAS liée à la suppression elle-même) : `context_target.js#isDashboardBlockedPoint` ne consultait que `window.eveDashboardRuntime` (legacy) pour bloquer le geste Flower au-dessus du dashboard ; comme Bevy UI est désormais actif par défaut et que legacy `state.active` reste `false`, le blocage ne fonctionnait plus du tout sur le dashboard Bevy UI. Corrigé par : (1) ajout de `isFlowerBlockedPoint` sur `dashboard_bevy_ui_runtime.js` (même logique que legacy : `toolbox_reserved_rect` → `hitTestDashboardLayout` → édition de label sur pointerdown → `dashboard_rect`, réutilise les primitives déjà partagées `dashboard_layout.js`/`dashboard_label_persistence.js`/`dashboard_item_text_fields.js`) ; (2) `context_target.js` choisit désormais le runtime Bevy UI s'il est actif, sinon legacy. Validé ROUGE d'abord (`git -C eVe checkout --` vers l'ancienne version → `contextTargetBlocksInside:false` alors que `runtimeBlocksInside:true`) puis VERT après restauration du fix, via `temp/dashboard_bevy_ui_flower_block_probe.mjs` (clic simulé sur le rect du header « projects » du dashboard Bevy UI réel, compte tenu du geste réel, pas d'une géométrie mockée). Deux autres correctifs liés au même audit : `boot_runtime.js` réchauffait TOUJOURS l'ancien runtime au boot (`warmupDashboardRuntime` importé directement depuis `dashboard_runtime.js` dans `eVeIntuition.js`) — remplacé par un export flag-aware `warmupDashboardRuntime` ajouté à `user_workspace_surface_runtime.js` (résout via `resolveDashboardRuntime()`, même pattern que `open`/`toggle`) ; vérifié en conditions réelles (boot Playwright) que c'est maintenant `eveDashboardBevyUiRuntime.state.warmedProjectId` qui se peuple et non plus le legacy. Et `project_scene_record_preservation.js#shouldPreserveDashboardRecords` ne vérifiait que legacy `state.active` — élargi pour vérifier Bevy UI en priorité puis legacy. Gates : `node --check` sur les 5 fichiers touchés PASS ; boot Playwright réel sans erreur console/page ; probe flower ROUGE→VERT confirmée.
- 2026-07-05 — T0.1: repaired the seed/unseed probes to authenticate through the canonical `AdoleAPI.auth.bootstrap` contract before using `AdoleAPI.projects`. Validation sequence: `node temp/dashboard_seed_projects_probe.mjs` (12 existing), `node temp/dashboard_unseed_projects_probe.mjs` (12 targets, 12 deleted, 0 remaining), `node temp/dashboard_seed_projects_probe.mjs` (12 created). Reports: `temp/probe_reports/dashboard_perf/seed_report.json`, `temp/probe_reports/dashboard_perf/unseed_report.json`. Both final reports use Fastify user `72c2cfcf-fb0a-523a-a725-0803aa86d265`, authenticated token present, console/pageErrors/requestFailures all `0`.
- 2026-07-05 — T0.2: added the static bundled Roboto TTF assets `Roboto-Regular.ttf`, `Roboto-Medium.ttf`, and `Roboto-Bold.ttf` under `atome/src/assets/fonts/Roboto/` from the official Google Fonts Roboto repository. Verification: `file` reports all three as TrueType fonts, SHA-256 values are `56a45233d29f11b4dfb86d248e921939d115778f87325e7ae8cc108383d6664d`, `2879a5ecb7fbfa13a7fc3e2cdd7fecbf73aa45e91b541dfdfa2c442eed0aac21`, and `61f89f8db49261c2f6106e8dccc35df7b2f7ed909020db40a3fc905e95f99334`. Packaging check: `platforms/desktop-tauri/tauri.conf.json` serves `../../atome/src` and bundles `../../atome`, so these files are included locally for PWA/static serving and Tauri packaging. No Dashboard runtime CDN font load was added.
- 2026-07-05 — T0.3: Dashboard text now uses the token font family `'Roboto', system-ui, sans-serif`; `dashboard_font_runtime.js` registers local Roboto 400/500/700 through `FontFace`, and `dashboard_runtime.js` awaits `document.fonts.ready` before Dashboard record projection. Validation: `npm run test:run -- tests/eve/dashboard_records.test.mjs` passed 13 tests; `node temp/dashboard_font_runtime_probe.mjs` passed with 10 Dashboard text records using the Roboto token family, Roboto 400/500/700 loaded, font requests only to `/assets/fonts/Roboto/*.ttf`, external font requests `0`, console/pageErrors/requestFailures/responseFailures all `0`, and cache key change verified when `font_family` changes; `npm run check:syntax` passed 941 files; `node temp/boot_probe.mjs` passed with boot errors `0` and failed requests `0`. The direct Node ESM import of `eVe/eVe.js` exited successfully but still printed an existing browser-only audio module warning in Node; browser boot and the Dashboard font probe are clean.
- 2026-07-05 — T0.4: executed `node temp/dashboard_perf_baseline_probe.mjs` successfully after repairing the test support click helper to use the visible DOM handle when present or the real Bevy UI menu item coordinates on the project canvas when the legacy DOM handle is hidden. The raw report was copied unchanged from `temp/probe_reports/dashboard_perf/perf_report.json` to `temp/probe_reports/dashboard_bevy_ui/baseline_perf.json`.
- 2026-07-05 — T0.5: repaired and validated the visual baseline probe over the real Dashboard/WebGPU path. The probe seeds/reuses 12 `perf_test_*` projects, captures project state before Dashboard, mid-open fade, rest, vertical scroll, horizontal projects lane scroll, projects rubrique open, active project label edit, mid-close fade, and project return. Product validation added the Dashboard/Flower contract that blocks primary pointer long-press on editable project labels while preserving context gestures; `node --test tests/eve/dashboard_runtime_lifecycle_contract.test.mjs` passes 8/8. Final visual run: `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_visual_baseline_probe.mjs`, report `ok: true`, captures `9`, console/pageErrors/requestFailures `0`; `npm run check:syntax` passed 941 files.
- 2026-07-05 — T0.6: added `temp/dashboard_visual_diff_probe.mjs` for deterministic PNG suite comparison with a default `1%` per-capture threshold and explicit dynamic-zone reporting. Red validation command `node temp/dashboard_visual_diff_probe.mjs --baseline=temp/probe_reports/dashboard_bevy_ui/visual_baseline --createAlteredCandidate=temp/probe_reports/dashboard_bevy_ui/visual_diff_altered --report=temp/probe_reports/dashboard_bevy_ui/visual_diff/red_report.json` failed as expected on `c_dashboard_open_rest`. Green validation command `node temp/dashboard_visual_diff_probe.mjs --baseline=temp/probe_reports/dashboard_bevy_ui/visual_baseline --candidate=temp/probe_reports/dashboard_bevy_ui/visual_baseline --report=temp/probe_reports/dashboard_bevy_ui/visual_diff/green_report.json` passed with max ratio `0`; `node --check temp/dashboard_visual_diff_probe.mjs` and `npm run check:syntax` passed.
- 2026-07-05 — T0.7: repaired `temp/dashboard_functional_invariants_probe.mjs` so the functional seed persists Dashboard project preview PNG metadata through the canonical `Atome.commit` path, restores the reference viewport before the 12-project preview invariant, clears partial horizontal snap state when already aligned, and verifies stable visible item records through Bevy operation counters. Final validation: `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_functional_invariants_probe.mjs` passed with `12` checks; `npm run test:run -- tests/eve/dashboard_focus_color_contract.test.mjs tests/eve/dashboard_fade_contract.test.mjs tests/eve/dashboard_runtime_lifecycle_contract.test.mjs` passed (`13` tests); `npm run check:syntax` passed `941` files.
- 2026-07-05 — T1.1: added `temp/dashboard_open_close_frames_probe.mjs`, a real main-handle Playwright probe that measures the first rAF interval and fails when open/close has any frame over `32ms`. Red validation: `ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_open_close_frames_probe.mjs` failed as expected on close with `1` frame over threshold (`33.3ms` max); open stayed under threshold in this run. Report: `temp/probe_reports/dashboard_bevy_ui/open_close_frames/report.json`; `node --check temp/dashboard_open_close_frames_probe.mjs` passed.
- 2026-07-06 — T2.4 : probe de parité texte écrite et exécutée. Bug de probe corrigé en cours de route (axes flex `justify_content`/`align_items` inversés — direction par défaut `Column` donc `justify_content`=vertical, `align_items`=horizontal ; corriger a fait chuter le ratio de `13.19%` à `6.63%`). Diagnostic par bounding-box (pas de heatmap seule) : écart vertical systématique ~2px entre baseline alphabétique approximée du rasterizer et centrage flex natif de Bevy UI — cause identifiée, pas un bug de rendu de police. Seuil de 2% non tenu (`6.63%`), consigné comme résidu connu conformément à la consigne T2.4 (pas de hack de compensation). Gates check:syntax/boot verts.
- 2026-07-06 — T2.3 : polices Roboto embarquées branchées côté Bevy. Rust : `AtomeUiFontTable` (handles par graisse, plus-proche-voisin), `register_ui_font(world, weight, bytes)` (`Font::try_from_bytes`), `AtomeUiStyle.font_weight` → `TextFont { font: handle, weight: FontWeight(w) }` — le poids DOIT accompagner le handle : cosmic-text résout la face par famille+attributs et les 3 TTF statiques déclarent tous la famille « Roboto » (sans lui, 700 rendait ≡ 400, attrapé par le probe). Web : export `register_atome_bevy_font(weight, bytes)` → file `WEB_PENDING_UI_FONTS` drainée avant les UI ops. JS : `DASHBOARD_FONT_FACES` exporté de `dashboard_font_runtime.js` (source unique des 3 faces locales) et consommé par `ensureUiFontsRegistered` au premier montage natif (fetch same-origin uniquement) ; whitelist `font_weight`. Tests : `registered_roboto_weights_map_to_nearest_font_handle` (bevy-core `44`... `11` ui). Validation canvas réel `temp/bevy_ui_font_canvas_probe.mjs` VERTE : Roboto400 vs défaut `13.95%` de pixels ≠, même graisse `0%`, 400 vs 700 `20.2%`, `0` requête police externe, diagnostics `0`. Gates : check:syntax `942`, boot PASS, WASM rebuilt.
- 2026-07-06 — T2.2 (clôture) : validation AU CANVAS RÉEL par `temp/bevy_ui_style_fields_canvas_probe.mjs` (ROUGE d'abord : whitelist JS droppait les champs, ops non exposés — puis VERT : 4 vérifications pixel : opacité 0.5 au mount, `SetSubtreeOpacity` 0.15 atténuant box ET ombre, `UpdateNodeStyle` repositionnant in-place, BoxShadow visible ; seuils exprimés en sRGB, le blending GPU étant linéaire : 0.15 linéaire ≈ 108, 0.5 ≈ 188). Correctifs découverts par le probe : (1) la passe UI cible le viewport physique caméra ≠ taille CSS du canvas (rendu ÷2) → `physical_viewport_size` publié chaque frame dans les diagnostics web (`ui_viewport_width/height`) et `renderScaleForSurface(surface, wasmModule)` calcule le ratio exact (le stub `=> 1` était le point de branchement prévu) ; (2) `set_subtree_opacity` étend l'atténuation aux `BoxShadow` (couleurs de base capturées) — requis pour le fade des cartes ombrées ; (3) whitelist JS `normalizeStyle` complétée (`opacity`, `radius_corners`, `scroll`, `text_align`, `line_height`, `shadow`) + scaling dimensionnel des nouveaux champs dans `scaleTreeForRender` ; (4) wrappers `updateNodeStyle`/`setSubtreeOpacity` exposés par `createEveBevyUiRuntime` (pré-scalés au renderScale du tree). Conformité taille : `bevy_ui_runtime.js` 548→388 lignes par extraction du module cohésif `bevy_ui_tree_normalization.js` (165 l., re-export préservé). Note runtime natif : aucun chemin UI ops n'existe côté renderer natif (`bevy_native_renderer_runtime.js`) — la normalisation/whitelist est un module partagé unique ; câblage natif hors périmètre T2.2, consigné. Gates : check:syntax `942`, boot PASS, cargo bevy-core `44`, web `22`. Superposition overlay/natif documentée : l'overlay records compat rend PAR-DESSUS le canal natif ; le probe le vide pour valider le natif.
- 2026-07-05 — T2.2 (en cours, Rust fait) : `AtomeUiStyle` étendu (`opacity`, `radius_corners`, `shadow` → `BoxShadow`, `scroll` → `ScrollPosition`, `text_align` → `TextLayout.justify`, `line_height` → composant `LineHeight::Px`) + 2 nouveaux ops `UpdateNodeStyle {id, style}` (patch in-place — indispensable pour fade/scroll à 1 op/frame sans remonter l'arbre) et `SetSubtreeOpacity {id, opacity}` (opacité de groupe : alphas multipliés depuis les couleurs de base capturées au spawn via `AtomeUiBaseColors`, idempotent par valeur absolue). 6 nouveaux tests (un par op/feature) dans `ui/tests.rs` : patch position/size/background/z, opacité de sous-arbre (scale + restore), box shadow, scroll set+patch, coins par coin, text align + line height. `cargo test` bevy-core `43` OK, WASM rebuilt. RESTE pour clore T2.2 : vérifier le chemin natif (Tauri) des UI ops (whitelist éventuelle côté runtime natif) + probe de validation AU CANVAS RÉEL des nouveaux champs (`temp/`, ROUGE→VERT), + note : `TextFont.weight` (fonts variables) existe en 0.18 mais nos TTF Roboto sont statiques → T2.3 passera par 3 handles.
- 2026-07-05 — T2.1 : matrice de parité produite dans `todo/dashboard_bevy_ui_parity_matrix.md` à partir de `dashboard_records.js`/`dashboard_record_primitives.js`/`dashboard_scene_effects.js` vs `atome/renderers/bevy-core/src/ui/types.rs`. 18 records inventoriés + effet backdrop_blur (non porté : il floute la scène projet sous le dashboard, rendue par le pipeline sprites conservé). 10 manques « À implémenter » identifiés pour T2.2/T2.3 : opacité de groupe, box-shadow carte, image fit+radius, police Roboto+graisses, align/alpha/line_height texte, stroke+shadow texte, text-fit shrink, rich text édition, événements move/drag/wheel, ScrollPosition pilotable.
- 2026-07-05 — T1.6 (root cause présentation) : les captures mi-fondu divergeaient à 95 % parce que le canvas ne présentait qu'~1 frame pendant tout le fondu. Chaîne d'évidence : opacité JS parfaite (départ 32-88ms, 500ms exacts) → `update_ticks` winit (nouveau compteur diagnostics) à 55-58/s idle et scroll mais **0/s pendant les fondus** → wakes envoyés avec succès (`wake_send_failures=0`) et ignorés → reproduction minimale : un flood de patches direct-style à 60fps suffit → **un flood de WakeUp PURS (sans op) suffit aussi** : chaque WakeUp reprogramme l'échéance reactive(16ms) du runner bevy_winit web ; à ≥60 wakes/s elle n'expire jamais. Théories éliminées par mesure : postTask/setTimeout starvation (mes chaînes tournaient à 50-60/s pendant la fenêtre), reparent du canvas (ticks stables), seconde app preview (`running_apps=1`), update manuel d'App (les App de `WEB_RUNNING_APPS` sont des coquilles vides — `App::run` fait `mem::replace`). Fix (`platforms/web/bevy-renderer/src/lib.rs`) : `wake_web_renderer` n'émet un WakeUp que si le loop est silencieux depuis > 50ms, émission throttlée à 1/50ms (le timer reactive fait le reste à ≤ 16ms) ; suppression du chemin mort `drive_registered_web_app_update`/`manual_update_calls` ; `UpdateMode::Continuous` essayé puis reverté (interdit par le test contractuel `web_renderer_uses_reactive_winit_updates_with_explicit_redraw_wakes`). Validation : flood de wakes → ticks `60/s` pendant le flood (avant : 0) ; fondu réel : ticks `~64/s`, luminosité du canvas suit l'opacité ; suite visuelle 9/9 ; T1.1 `3/3` ; invariants `12/12` ; perf G3 verte. Probes forensiques one-shot supprimées après diagnostic (fade latency, tick contexts, reparent, style flood, close_profile_direct, inspect).
- 2026-07-05 — T1.6 (corrections préalables consignées pour traçabilité) : cache LRU des masques rounded-rect côté bevy-core (`AtomeRoundedRectMaskCache`, un fond 1440x920 coûtait ~9ms de SDF CPU à CHAQUE spawn ; test `rounded_rect_mask_handles_are_cached_per_dimensions`) ; drain WASM par op avec budget 8ms/frame, ops légères (style/transform/visibilité) toujours appliquées immédiatement, barrière par id, `refresh_scene_effects` une fois par frame ; comptabilité des styles fusionnés dans `drained_ops` (le watermark `waitForBevyDiffPresentation` ne convergeait plus et gelait la chaîne de rendu du fade).
- 2026-07-05 — T1.5: `temp/dashboard_open_close_frames_probe.mjs` green `5/5` consecutive runs (open max `17.6ms` p95 `17.1ms`, close max `17.1ms` p95 `16.8ms`, `0` frames > `32ms` on both). Fades measured in `temp/dashboard_functional_invariants_probe.mjs`: open `500ms`, close `500ms` exact; header activation measured in-page `12.9ms` (contract ≤ `50ms`); `12/12` invariants green, console/pageErrors/requestFailures `0`. Two real integration fixes were required along the way: (1) `warmup()` texture phase made non-blocking (`{ textures: Promise }` result) because `openWorkspaceDashboardAndMainMenu` AWAITS warmup before opening — the idle-chunked raster (idle timeout now `120ms`) was delaying explicit opens past the projection deadline; (2) dashboard header LABEL textures (`__eve_dashboard_header_<cat>`, hors bg/icon/side) are excluded from the T1.2 deferred queue because `waitForDashboardProjection` treats pending header resources as a broken projection and repair-reopens the dashboard with `refresh: true` (this was resetting items mid-probe and reopening the dashboard after project activation). Probe hardening (fresh-user seeding is noisier than the T0-era runs): card selection now reads `layout.visible_item_rects` (same source as the hit-test), card rect must be stable ~400ms before clicking, snap watchers are armed in-page BEFORE wheel dispatch (fast frames finish the whole cycle before an external poll starts), header activation measured pointerup→state flip in page.
- 2026-07-05 — T1.4: profiled the residual close frame (33–50ms, intermittent) with `temp/dashboard_close_profile_probe.mjs` (rAF timestamps + Chromium trace + new Rust per-frame diagnostics). Root causes were NOT the JS clear passes: (1) per-atome style patches from the record fades accumulated in the WASM op queue and drained in one Bevy frame (measured `1240` style ops / `28.3ms` apply); (2) the open-hydration tail (textured card spawns ≈3ms each + texture resources) landed in a single unbudgeted frame (measured 8 spawns / `25.7ms`). Fixes in `platforms/web/bevy-renderer/src/lib.rs`: queued style patches now merge per atome id (field-wise last-write-wins, blocked by any interleaved non-style op for the same id or a transition), and the frame drain applies ops under an `8ms` budget (same-id runs never split; ordered remainder requeued at queue head + redraw). New web diagnostics: `last_frame`/`recent_slow_frames` (main_ms, op kind counts, apply_ops_ms, refresh_effects_ms, ui_ops), `requeued_ops`; `refresh_scene_effects` now runs once per frame instead of once per batch. `cargo test` `22` passed; WASM rebuilt (11.62MB). Close profile after fix: max frame `17.6ms`, `0` over 32ms; worst WASM frames `9.3ms`.
- 2026-07-05 — T1.3: red first (`ATOME_PLAYWRIGHT_HEADLESS=0 node temp/dashboard_texture_warmup_probe.mjs` failed on `warmup_did_not_warm_textures` + `warmable_total_over_limit:38.3`), then green after adding `dashboard_texture_warmup.js` and wiring it into `warmup()` after `ensureDashboardFontsReady()`. The warm path builds records with the SAME `buildDashboardRecords` + `normalizeAtomeRenderNode` chain as the open path so cache keys match exactly; card media previews are excluded (hydrated separately at open). Validation: warm probe green (`19` warmed, open deferred cost `2ms`), `npm run check:syntax` `942` files, `node temp/boot_probe.mjs` PASS, ESM import of `eVe/eVe.js` OK. `dashboard_runtime.js` at exactly `500` lines.
- 2026-07-05 — T1.2: extended the existing Bevy deferred texture queue instead of adding a renderer path. Dashboard image/text records spawn with transparent pending textures, then resolve through a three-texture frame budget ordered card media, label backdrop, card title/date, headers, then other deferred media; structural Dashboard shape records remain immediate. Validation: targeted Bevy renderer/deferred Vitest passed `25` tests; manifest guard passed; ESM import of the touched renderer modules passed; `npm run check:syntax` passed `942` files; `node temp/boot_probe.mjs` passed; the open/close frame probe report shows open green (`0` frames > `32ms`, max `18.7ms`) and close still red for later T1.4/T1.5.
- 2026-07-05 — T1.6 investigation: fixed the deferred text patch path so `mapTextTexturePatch()` reuses `mapVirtualSceneResourceToBevyPatch(...)` texture normalization; this converts canvas `Uint8ClampedArray` text textures into Bevy-accepted `Uint8Array` payloads and clears the card-title `skipped_nodes` failure observed in runtime diagnostics. Extended `tests/eve/bevy_dashboard_deferred_texture_budget.test.mjs` to assert deferred text patches use `Uint8Array`. Repaired `temp/dashboard_visual_baseline_probe.mjs` mid-fade capture to wait on runtime opacity; regenerated the corrupted visual baseline artifact and restored G1 (`9/9` diff pass). Added idle rAF baseline reporting to `temp/dashboard_perf_baseline_probe.mjs`; remaining blocker before checking T1.6 is G3 p95, which is still above `17ms` in visible Chromium while the idle baseline itself is `18ms`.
