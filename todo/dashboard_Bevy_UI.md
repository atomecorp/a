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

- [ ] **T0.1** Seed : vérifier/re-exécuter `temp/dashboard_seed_projects_probe.mjs` (12 projets `perf_test_01..12`).
      Le nettoyage inverse (`temp/dashboard_unseed_projects_probe.mjs`) doit rester fonctionnel.
- [ ] **T0.2** Police : télécharger les TTF statiques `Roboto-Regular.ttf` (400), `Roboto-Medium.ttf` (500),
      `Roboto-Bold.ttf` (700) et les placer dans `atome/src/assets/fonts/Roboto/` (la licence y est déjà :
      `LICENSE.txt`). **Interdit : tout chargement de police par CDN au runtime** — l'app doit fonctionner en
      pleine autonomie ; les fichiers sont embarqués dans les assets et servis localement. Vérifier que le
      packaging (build PWA/Tauri) inclut bien ces fichiers.
- [ ] **T0.3** Basculer le texte dashboard actuel sur Roboto : enregistrer les 3 graisses via `FontFace` (ou
      `@font-face`) pointant sur les TTF embarqués, attendre `document.fonts.ready` avant le premier render
      dashboard, et passer le `font_family` des tokens dashboard à `'Roboto', system-ui, sans-serif`
      (défaut actuel : `bevy_media_texture_resolver.js:260`, tokens : `dashboard_tokens.js`).
      Vérifier en app réelle que tous les textes du dashboard rendent en Roboto (screenshot de contrôle),
      qu'aucune requête réseau externe n'est émise, et que le cache de textures texte est bien invalidé
      (la clé de cache inclut la police — vérifier).
- [ ] **T0.4** Baseline perf : exécuter `temp/dashboard_perf_baseline_probe.mjs`, archiver le rapport JSON en
      `temp/probe_reports/dashboard_bevy_ui/baseline_perf.json`. Consigner les chiffres dans « Mesures ».
- [ ] **T0.5** Baseline visuelle (avec Roboto actée) : probe Playwright `temp/dashboard_visual_baseline_probe.mjs`
      capturant, à viewport fixe :
      (a) projet ouvert avant dashboard ; (b) mi-fondu open ~250 ms ; (c) dashboard ouvert au repos ;
      (d) après scroll vertical d'une page ; (e) lane projets scrollée horizontalement d'une carte ;
      (f) rubrique « projets » ouverte ; (g) édition de label active (long-press) ; (h) mi-fondu close ~250 ms ;
      (i) retour projet après close. Archiver en `temp/probe_reports/dashboard_bevy_ui/visual_baseline/`.
- [ ] **T0.6** Probe de diff visuel `temp/dashboard_visual_diff_probe.mjs` : compare deux suites de captures
      pixel à pixel (seuil G1 : ≤ 1 % par image, zones dynamiques masquées et listées dans la probe).
      La valider en ROUGE d'abord : la lancer contre une capture volontairement altérée (elle doit échouer),
      puis en VERT contre la baseline elle-même.
- [ ] **T0.7** Probe d'invariants fonctionnels `temp/dashboard_functional_invariants_probe.mjs` couvrant les
      12 points de G2 (mesure réelle des durées de fade et de snap, comptage d'ops spawn/despawn pendant scroll,
      long-press, hit-test, resize, changement de projet). La passer en VERT sur l'état actuel — c'est la définition
      exécutable du « fonctionnel identique ».

## Phase 1 — Régler open/close dans le pipeline ACTUEL (quick wins, gain immédiat)

> Périmètre autorisé : `dashboard_projection_lifecycle.js`, `dashboard_records.js`, `bevy_web_renderer_runtime.js`,
> `bevy_media_resource_runtime.js`, `dashboard_runtime.js`. Rien d'autre.

- [ ] **T1.1** Probe ROUGE `temp/dashboard_open_close_frames_probe.mjs` : échoue si une frame > 32 ms pendant
      open ou close (elle DOIT échouer sur l'état actuel : frames 583 ms / 234 ms). Consigner l'échec.
- [ ] **T1.2** Étaler le burst d'ouverture : budget d'uploads par frame (2–3 textures/frame, cartes visibles d'abord)
      en s'appuyant sur la file « deferred » existante (`scheduleDeferredInitialNodes`,
      `bevy_media_resource_runtime.js:275`, `deferred_texture_queue`). Les records structurels (fond, table, veil,
      lanes) spawnnent immédiatement ; textes et médias suivent le budget. Aucun changement d'ordre visuel final.
- [ ] **T1.3** Pré-montage warm : après le boot, pendant l'idle (rAF idle ou `requestIdleCallback`), pré-rasteriser
      et pré-uploader les textures des labels/headers/icônes du dashboard (cache chaud), SANS spawner de records.
      L'ouverture ne paie alors que spawn + fade. Garde-fou mémoire : consigner la taille du cache dans « Mesures ».
- [ ] **T1.4** Fermeture : profiler la frame de 234 ms (probe), réduire le clear à UNE passe effective
      (`dashboard_projection_lifecycle.js:118-176` déjà simplifié — identifier ce qui reste : re-render projet,
      présentation bloquante ?) et corriger. Le fondu close reste 500 ms identique.
- [ ] **T1.5** Passer T1.1 en VERT : open et close sans frame > 32 ms, fade mesuré 500 ms ± 1 frame.
- [ ] **T1.6** Garde-fous de phase : diff visuel (T0.6) vs baseline ≤ 1 % + invariants (T0.7) verts + perf (G3) ;
      boot ESM + boot_probe + check:syntax OK. Consigner dans « Mesures ». Mettre à jour
      `todo/dashoard_optimisations.md` (T4.4/T6.1 couverts ici) et le déplacer vers `./done/` si tout y est coché.

## Phase 2 — Socle Bevy UI : parité des primitives (aucun changement visible)

- [ ] **T2.1** Inventaire exhaustif des records dashboard : lister depuis `dashboard_records.js` chaque kind de
      record produit (fond, table, veil, lane, header, icône, label, carte, média, backdrop, badge « plus »…)
      avec tous les champs de style utilisés (couleurs, corner radius, ombres, opacité, filtres, layers, rich text).
      Produire la **matrice de parité** record → nœud Bevy UI (`Node`/`Text`/`ImageNode` + composants) dans
      `todo/dashboard_bevy_ui_parity_matrix.md`. Tout champ sans équivalent Bevy UI = ligne « À implémenter ».
- [ ] **T2.2** Compléter `AtomeBevyUiPlugin` (`atome/renderers/bevy-core/src/ui/mod.rs`) avec les manques identifiés
      en T2.1 (attendus : opacité de groupe, corner radius par coin, ombre de carte, image avec fit + corner radius,
      z-index par couche, clipping de lane). Un op = un test Rust (`ui/tests.rs`). `cargo test` OK.
      Chaque nouveau champ de style : whitelist des 2 runtimes (web + natif) + validation au canvas réel.
- [ ] **T2.3** Police côté Bevy : charger les MÊMES TTF Roboto embarqués en T0.2 (Regular 400, Medium 500,
      Bold 700) comme assets Bevy (`include_bytes!` ou chargement d'asset depuis les fichiers locaux — jamais
      de fetch réseau) et les brancher via `TextFont { font: … }` (le défaut actuel `ui/mod.rs:221` n'utilise
      que `font_size`). Mapper la graisse des tokens dashboard (400/500/700) vers le bon handle de police.
- [ ] **T2.4** Probe de parité texte `temp/bevy_ui_text_parity_probe.mjs` : rendre côte à côte le même label
      (mêmes texte/taille/graisse/couleur, Roboto des deux côtés) en rasterizer JS et en Bevy UI, capturer, comparer.
      Seuil : diff ≤ 2 % de pixels sur la boîte du texte (l'anti-aliasing diffère forcément). ROUGE d'abord
      (police par défaut Bevy), VERT après T2.3. Si le seuil ne peut pas être tenu, consigner le meilleur résultat
      et les alternatives dans « Mesures » AVANT de continuer.
- [ ] **T2.5** Événements : vérifier que `drain_ui_events` (`ui/mod.rs:433`) remonte press/release/hover avec
      position et id, à latence ≤ 1 frame ; ajouter ce qui manque pour : long-press (timing côté JS), drag continu
      (deltas), molette/scroll. Probe d'événements dédiée (clic simulé → event drainé).
- [ ] **T2.6** Scroll natif : valider `Overflow::scroll` + `ScrollPosition` dans le WASM web réel (lane horizontale
      et table verticale), y compris pilotage programmatique de la position (nécessaire pour inertie/snap maison).
      Probe au canvas réel.
- [ ] **T2.7** Garde-fous de phase : l'app réelle est inchangée (diff visuel vs baseline = 0 hors probes),
      boot ESM + boot_probe OK, `cargo test` bevy-core OK, build WASM OK, taille du WASM consignée
      (avant/après ajouts UI — garde-fou : +5 % max, sinon consigner et justifier).

## Phase 3 — Dashboard Bevy UI derrière flag : structure statique

- [ ] **T3.1** Flag `dashboardBevyUi` (query param `?dashboardBevyUi=1`, défaut 0) : sélection du runtime dashboard
      à l'ouverture. À 0, strictement AUCUN code nouveau n'est exécuté (garde-fou : probe boot + diff visuel à flag 0).
- [ ] **T3.2** Nouveau module `eVe/domains/dashboard/dashboard_bevy_ui_runtime.js` (< 500 L, recette RF-02 si besoin
      de découpe) : construit l'arbre Bevy UI complet du dashboard au repos à partir des MÊMES sources de données
      (`dashboard_model.js`, `dashboard_data_controller.js`, tokens `dashboard_tokens.js`) — fond, table, lanes,
      headers, icônes, labels (Text natif), cartes, previews (`ImageNode`, décodage image existant conservé),
      badge « plus ». Layout aux MÊMES rects que `dashboard_layout.js` (réutiliser ce module, ne pas le dupliquer).
- [ ] **T3.3** Uploads de previews : brancher le budget par frame de T1.2 sur le chemin `ImageNode` (mécanisme
      permanent, previews visibles d'abord).
- [ ] **T3.4** Probe visuelle A/B `temp/dashboard_bevy_ui_ab_probe.mjs` : capturer l'état (c) de T0.5 (dashboard au repos)
      à flag 0 puis à flag 1, comparer (seuil G1). ROUGE tant que la structure n'est pas complète, VERT ensuite.
      Consigner le diff résiduel exact (typiquement l'anti-aliasing du texte).
- [ ] **T3.5** Perf structure : mesurer l'ouverture à flag 1 (sans interactions ni fade encore) — objectif :
      montage complet < 100 ms, aucune frame > 32 ms après la première.
- [ ] **T3.6** Garde-fous de phase : à flag 0, diff visuel vs baseline = 0 et invariants T0.7 verts (rien n'a fui) ;
      boot ESM + boot_probe + check:syntax OK.

## Phase 4 — Interactions iso-fonctionnelles (flag 1)

- [ ] **T4.1** Hit-test : clic carte → ouverture projet, clic header → activation rubrique, clic « plus » → action,
      via les événements T2.5. Probe : mêmes cibles cliquées à flag 0 et flag 1 → mêmes effets.
- [ ] **T4.2** Scroll vertical : inertie + snap (220/240 ms, smoothstep) en pilotant `ScrollPosition` avec les
      MÊMES fonctions d'easing/timing que l'actuel (réutiliser `dashboard_scroll_state.js`, pas de réécriture des
      timings). Probe : profil de positions echantillonné à flag 0 vs flag 1 → écart ≤ 1 px par frame.
- [ ] **T4.3** Scroll horizontal par lane : idem T4.2, plus garde-fou G2.5 : 0 spawn/despawn d'item visible
      pendant le geste (comptage d'ops UI).
- [ ] **T4.4** Long-press édition de label : reproduire le flux actuel (déclenchement, champ de saisie, validation,
      annulation, persistance via `dashboard_label_persistence.js`). Probe : cycle complet édition → reload → valeur persistée.
- [ ] **T4.5** Resize + handedness + changement de projet dashboard ouvert (invariants G2.9–11) à flag 1. Probe.
- [ ] **T4.6** Garde-fous de phase : probe d'invariants T0.7 exécutée intégralement à flag 1 → 12/12 verts ;
      à flag 0 : diff visuel = 0, invariants verts ; perf G3 tenue dans les deux modes.

## Phase 5 — Fade et transitions de rubrique (flag 1)

- [ ] **T5.1** Fondu open/close : opacité de groupe sur le nœud racine du dashboard (un seul op par frame),
      500 ms ease-out cubic, mêmes tokens. Probe : durée mesurée 500 ms ± 1 frame, 0 frame > 32 ms,
      screenshot mi-fondu comparé à la référence (b)/(h) de T0.5 (seuil G1).
- [ ] **T5.2** Ouverture/fermeture de rubrique : tween des rects (~200–250 ms) des cartes qui restent, fade-in des
      entrantes, fade-out des sortantes — comportement identique à l'actuel post-optimisations. Probe : ouverture
      « projets » avec 12 projets, 0 frame > 32 ms, 12 previews visibles, screenshot final vs référence (f).
- [ ] **T5.3** Garde-fous de phase : suite visuelle complète (9 états T0.5) à flag 1 vs baseline → tous ≤ seuil G1 ;
      probe d'invariants 12/12 ; perf G3 ; flag 0 toujours intact.

## Phase 6 — Validation complète et bascule

- [ ] **T6.1** Probe perf complète à flag 1 : open, scroll V/H 2 s, rubrique, close. Consigner le tableau
      avant (baseline T0.4) / après dans « Mesures ». Exigence : tout G3 tenu + open/close strictement meilleurs
      que la mesure post-Phase 1.
- [ ] **T6.2** Suite visuelle complète + invariants fonctionnels à flag 1 : 9/9 captures sous seuil, 12/12 invariants.
- [ ] **T6.3** Endurance : 20 cycles open/close + scrolls + rubrique enchaînés — pas de fuite (node_count et mémoire
      JS/GPU stables entre cycle 5 et cycle 20, consigner), pas de dégradation de frame time.
- [ ] **T6.4** Validation app réelle (Tauri) : dérouler manuellement-par-probe les 12 invariants au canvas réel,
      + vérifier l'absence d'événement `webgpucontextlost` dans les diagnostics.
- [ ] **T6.5** Boot complet : import ESM de l'entry, boot_probe, check:syntax, build WASM, `cargo test` des crates touchés.
- [ ] **T6.6** Bascule : flag `dashboardBevyUi` par défaut à 1. L'ancien pipeline reste sélectionnable à 0 (kill-switch).
      Re-dérouler T6.2 après bascule (le défaut a changé, rien d'autre ne doit changer).
- [ ] **T6.7** Consigner le bilan chiffré final dans « Mesures » (tableau avant/après complet).

## Phase 7 — Nettoyage (seulement si Phase 6 entièrement verte)

- [ ] **T7.1** Période d'observation : ne rien supprimer dans la même session que T6.6. À la reprise, vérifier
      qu'aucune anomalie n'a été consignée, puis seulement continuer.
- [ ] **T7.2** Audit d'appels COMPLET de l'ancien chemin dashboard→records→sprites (y compris appels intra-fichier,
      cf. mémoire) : lister ce qui n'est utilisé QUE par l'ancien dashboard vs partagé avec les scènes projet
      (`reconcileProjectSceneRecordsByPrefix`, resolver textures… sont PARTAGÉS — ne pas y toucher).
- [ ] **T7.3** Supprimer le code exclusif à l'ancien dashboard + le flag ; exercer les vraies routes après suppression
      (boot + open/close + rubrique + scroll — le boot seul ne suffit pas, cf. mémoire).
- [ ] **T7.4** Garde-fous finaux : suite visuelle + invariants + perf une dernière fois ; nettoyage des projets de
      test (unseed) ; déplacer ce fichier vers `./done/`.

---

## Mesures

### Baseline (Phase 0)
```
(à remplir : bascule Roboto T0.2/T0.3, perf T0.4, chemin des captures T0.5)
```

### Après Phase 1 (open/close pipeline actuel)
```
(à remplir)
```

### Parité texte (T2.4)
```
(à remplir)
```

### A/B structure (T3.4/T3.5)
```
(à remplir)
```

### Bilan final (T6.7)
```
(à remplir : tableau avant/après — open, close, scroll V/H, rubrique, taille WASM, mémoire)
```

## Journal
<!-- Au fil de l'eau : date, tâche, résultat probe (rouge/vert), commits eVe / bevy-core, diffs visuels résiduels. -->
