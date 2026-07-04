# Dashboard Bevy/WebGPU — enquête performance & plan « lightning fast »

Date d'enquête : 2026-07-03
Statut : **corrections partielles appliquées — phases 0/1, RC2 ombres, RC3 layers dashboard, et T4.3 validées côté tests** ; tâches restantes ci-dessous.
Symptômes traités : (A) ouverture beaucoup trop longue, (B) redimensionnement de fenêtre effroyablement lent, (C) scrolls horizontaux/verticaux quasi inutilisables.

Rappel des acquis de l'audit de juillet 2026 (déjà faits, ne pas refaire) : WASM 19,7 → 10,45 Mo (+ brotli 2,72 Mo), compression serveur, service worker WASM, defer des libs tierces, warm-compile WASM, chargements concurrents spark/eVe. Le « prewarm pipeline Bevy » a été testé et mesuré inutile — **ne pas re-tenter**. La conclusion de l'époque (« le 1,8 s d'upload est incompressible sans atlas ») est **invalidée par cette enquête** : le coût dominant n'est pas l'upload GPU mais le transport JS→WASM des textures (RC1 ci-dessous).

---

## 1. Architecture du rendu (chemin réel)

Chaque frame du dashboard suit ce pipeline complet :

```
wheel/pointermove/resize
  → dashboard_interaction_runtime (mutation offset) → requestRender()
  → dashboard_runtime.render()
      resolveLayout()            ← getBoundingClientRect() à chaque appel
      buildDashboardRecords()    ← reconstruit TOUS les records visibles
      diffDashboardRecords()     ← deep-compare récursif de tous les records
      reconcileProjectSceneRecordsByPrefix()
  → updateProjectSceneOverlay()
      syncRuntimeSceneFromRecords()   ← rebuild scène JS n°1 (normalize + virtual tree + render scene)
  → renderProjectScene() → renderRuntimeProjection()
      normalizeRenderAtoms + createVirtualSceneTree + createRenderScene  ← rebuild scène JS n°2 (identique !)
      diffVirtualSceneTrees()
  → applyBevyWebRendererDiffs()
      mapSpawnOp / mapTextTexturePatch  ← rasterisation canvas + transport par octet
      apply_atome_bevy_ops (WASM)       ← serde élément par élément
      waitForBevyDiffPresentation()     ← ATTEND la présentation Bevy (1-2 frames) avant de rendre la main
```

Côté Rust (atome/renderers/bevy-core), chaque op `transform`/`layer` reconstruit 3 overlays par entité, dont l'ombre **rasterisée pixel par pixel en CPU**.

---

## 2. Causes racines identifiées (par ordre d'impact)

### RC1 — Transport des textures JS→WASM octet par octet (ouverture + resize + scroll)

Chaque texture (texte, icône SVG, image de carte) traverse la frontière sous forme de **tableau JS de nombres, un élément par octet**, avec 4 passes complètes :

1. [bevy_media_texture_resolver.js:387](eVe/domains/rendering/bevy_media_texture_resolver.js:387) et [:424](eVe/domains/rendering/bevy_media_texture_resolver.js:424) : `Array.from(imageData.data)` — conversion Uint8ClampedArray → Array boxé.
2. [bevy_media_texture_cache.js:5-11](eVe/domains/rendering/bevy_media_texture_cache.js:5) : `cloneTexture` recopie l'array complet **à chaque écriture ET à chaque lecture** du cache (un hit de cache = une copie de 500 k éléments).
3. [bevy_projection_adapter.js:364-367](eVe/domains/rendering/bevy_projection_adapter.js:364) : `requireTexture` re-valide **chaque octet** (`.map` + `toFiniteNumber` + `Math.trunc` + clamp par élément).
4. [exports.rs:134-135](platforms/web/bevy-renderer/src/exports.rs:134) : `serde_wasm_bindgen::from_value` désérialise l'array **élément par élément** en `Vec<u8>` (un appel JS-interop par octet).

Une carte 200×150 @DPR2 = 480 000 octets → ~2 M d'opérations par texture. À l'ouverture (~82 textures) c'est le « 1,8 s proportionnel au nombre d'ops (~22 ms/op) » mesuré en P3 de l'audit précédent — le profil colle exactement. **C'est fixable : typed arrays + vue mémoire WASM = quasi zéro coût.**

### RC2 — Ombres reconstruites en CPU à chaque op (scroll + resize)

- Chaque carte du dashboard porte une ombre ([dashboard_records.js:462](eVe/domains/dashboard/dashboard_records.js:462) `cardShadow`, définie [:132-135](eVe/domains/dashboard/dashboard_records.js:132)).
- Côté Rust, `apply_transform` appelle `rebuild_shape_shadow_overlay` (+ selection + waveform) **à chaque op transform**, même pour une translation pure ([render_ops.rs:160-162](atome/renderers/bevy-core/src/render_ops.rs:160)).
- `rebuild_shape_shadow_overlay` ([shape_shadow_overlay.rs:110-199](atome/renderers/bevy-core/src/shape_shadow_overlay.rs:110)) : despawn de l'entité ombre + **rasterisation SDF pixel par pixel** ([:61-77](atome/renderers/bevy-core/src/shape_shadow_overlay.rs:61) — double boucle `for py/for px` avec `rounded_rect_signed_distance` par pixel) + `images.add` (nouvel asset GPU) + respawn. Une carte 200×150 = ~30 000 évaluations SDF ; 25 cartes visibles en scroll = **~750 000 évaluations SDF + 25 uploads GPU + 25 despawn/respawn par frame**, en WASM mono-thread.
- `apply_layer` fait pareil ([render_ops.rs:346-348](atome/renderers/bevy-core/src/render_ops.rs:346)) — voir RC3 pour pourquoi ça arrive en rafale.
- `apply_surface` (resize) le fait pour **toutes** les entités ([render_ops.rs:202-237](atome/renderers/bevy-core/src/render_ops.rs:202)).
- Bonus : chaque ombre porte `NoAutomaticBatching` ([shape_shadow_overlay.rs:182](atome/renderers/bevy-core/src/shape_shadow_overlay.rs:182)) → un draw call par ombre.

### RC3 — `renderLayer` = index global du nœud (scroll)

[virtual_scene_contract.js:178-180](eVe/domains/rendering/virtual_scene_contract.js:178) : le layer de chaque nœud est son **index dans la liste ordonnée**. Dès qu'un item entre ou sort du viewport (culling strict, voir RC5), l'index de tous les nœuds suivants se décale → le diff émet `setLayer` pour des dizaines de nœuds → chaque `apply_layer` reconstruit les 3 overlays (RC2) → avalanche de rasterisations SDF au moindre franchissement de bord de lane.

### RC4 — Pipeline complet + attente de présentation à chaque événement (scroll + resize)

- Un simple delta de scroll déclenche tout le pipeline du §1, dont **deux reconstructions identiques de la scène JS** (`syncRuntimeSceneFromRecords` dans [project_scene_runtime.js:329](eVe/domains/rendering/project_scene_runtime.js:329) puis `renderRuntimeProjection` dans [project_scene_engine.js:96-121](eVe/domains/rendering/project_scene_engine.js:96) qui refait exactement les mêmes `normalizeRenderAtoms` + `createVirtualSceneTree` + `createRenderScene`).
- `diffDashboardRecords` ([dashboard_render_scheduler.js:32-44](eVe/domains/dashboard/dashboard_render_scheduler.js:32)) deep-compare récursivement ~100+ records par frame.
- En fin de chaque render, `waitForBevyDiffPresentation` ([bevy_web_renderer_helpers.js:76-98](eVe/domains/rendering/bevy_web_renderer_helpers.js:76), appelé [bevy_web_renderer_runtime.js:473](eVe/domains/rendering/bevy_web_renderer_runtime.js:473)) **boucle sur rAF jusqu'à ce que Bevy ait présenté** → chaque render coûte 1 à 2 frames d'attente pure ; le scheduler ([project_scene_render_scheduler.js](eVe/domains/rendering/project_scene_render_scheduler.js)) sérialise les renders → cadence de scroll plafonnée à ~20-30 fps *avant même* le coût CPU/GPU.
- Un **fast-path existe déjà** pour les drags d'atomes : `applyDirectRuntimeTransform` → `applyBevyWebRendererTransformPatch` ([bevy_web_renderer_runtime.js:139-183](eVe/domains/rendering/bevy_web_renderer_runtime.js:139)) applique un patch transform directement au WASM sans records/diff/attente. **Le scroll ne l'utilise pas.**

### RC5 — Culling strict au viewport → spawn/despawn en bord de lane (scroll)

[dashboard_layout.js:213](eVe/domains/dashboard/dashboard_layout.js:213) (lanes) et [:235-238](eVe/domains/dashboard/dashboard_layout.js:235) (items) : seuls les items visibles produisent des records. Pendant le scroll, chaque carte qui franchit le bord = spawn/despawn de 3-5 records (fond, média, backdrop, label) → résolution + transport de textures (RC1) + ombre SDF (RC2) + décalage des layers (RC3), en plein milieu du geste.

### RC6 — Cache de textures sans dédup inter-nœuds

La clé de cache inclut `node.id` ([bevy_media_texture_resolver.js:158](eVe/domains/rendering/bevy_media_texture_resolver.js:158) et [:201](eVe/domains/rendering/bevy_media_texture_resolver.js:201)) : deux cartes affichant la **même icône SVG à la même taille** = deux rasterisations, deux entrées de cache (LRU 192), deux textures GPU. Aucun partage. Et chaque hit paie la double copie de RC1-2.

### RC7 — Ouverture : fade de 500 ms à pipeline complet + travail sériel

- Fade d'ouverture `dashboardFadeMs: 500` ([dashboard_tokens.js:51](eVe/domains/dashboard/dashboard_tokens.js:51)) : `animateDashboardRecordOpacity` ([dashboard_runtime.js:258-302](eVe/domains/dashboard/dashboard_runtime.js:258)) fait un `await render()` **complet** (§1, deep-diff inclus) par tick de rAF, avec `updateStyle` sur ~100 records par tick + attente de présentation. L'ouverture perçue = data + projection (RC1/RC2) + **0,5 s de fade incompressible**.
- Garde d'input 180 ms après ouverture ([dashboard_open_state.js:4](eVe/domains/dashboard/dashboard_open_state.js:4)) — contribue à la sensation de non-réactivité.
- Baseline mesurée (audit P3, machine au repos) : ~5 s cold = boot 0,8 s + eVe 0,64 s + compile WASM ~1 s + **projection ~1,8 s (= RC1)** + fade 0,5 s.

### RC8 — Resize : re-render par frame + re-rasterisation de tous les textes

- Le watcher ([dashboard_environment_watcher.js:25-38](eVe/domains/dashboard/dashboard_environment_watcher.js:25)) déclenche un render complet **à chaque frame de resize** (throttle rAF seulement, pas de « settle »).
- Toutes les dimensions changent → les bounds de chaque texte changent → clé de cache différente → **chaque texte est re-rasterisé en canvas + re-transporté par octet (RC1) + nouvel asset Bevy, à chaque frame du geste** ([bevy_web_renderer_runtime.js:432-439](eVe/domains/rendering/bevy_web_renderer_runtime.js:432) `updateText` → `mapTextTexturePatch`).
- Côté Rust, chaque frame de resize passe par `apply_surface` → re-transforme toutes les entités + reconstruit toutes les ombres SDF (RC2).

---

## 3. Plan de tâches

Conventions d'exécution (mémoire projet) : travailler dans le repo principal (jamais de worktree) ; une probe ciblée dans `./temp` par modification, **rouge d'abord**, puis confirmation en boot navigateur réel ; validation ESM par import de l'entry, pas seulement `node --check` ; rebuild WASM via `platforms/web/bevy-renderer/build.sh` (le `wasm-opt -Oz` doit garder `--all-features`) puis redémarrer le serveur ; probe de non-régression existante : `tests/probes/project_scene_canvas_regression_probe.test.mjs` et baseline `temp/perf_baseline_probe.mjs`.

### Phase 0 — Instrumentation & baselines (préalable, ~½ journée)

- [x] **T0.1 Baseline chiffrée des 3 symptômes.** Écrire `temp/dashboard_perf_probe.mjs` (puppeteer sur `:3001`, `?perf=1`) qui mesure : (a) clic → premier frame dashboard présenté (ms), (b) resize fenêtre 1400→900 px : nb de renders, durée totale, durée moyenne par frame, (c) 30 événements wheel verticaux + 30 horizontaux : latence par frame via `window.__squirrelPerf` (`projection.runtime.total`, `bevy.diff.applied`, `bevy.diff.presented`). Sauver le JSON dans `temp/probe_reports/dashboard_perf_baseline/`. C'est la référence avant/après de TOUTES les tâches suivantes. Probe écrite et syntaxée ; exécution live à faire serveur lancé sur `:3001`.
- [x] **T0.2 Compteurs manquants.** Ajouter aux événements perf existants : nb d'ops par type et par frame (`setLayer`, `updateText`, `spawn`), octets de textures traversant la frontière par frame, temps passé dans `waitForBevyDiffPresentation`. (Gardés par `?perf=1`, surcoût nul sinon — même pattern que l'existant.)

### Phase 1 — RC1 : transport de textures zero-copy (le plus gros gain ouverture, ~1 j)

- [x] **T1.1 Uint8Array de bout en bout côté JS.** Supprimer `Array.from(imageData.data)` dans [bevy_media_texture_resolver.js:387](eVe/domains/rendering/bevy_media_texture_resolver.js:387) et [:424](eVe/domains/rendering/bevy_media_texture_resolver.js:424) — passer le `Uint8ClampedArray`/`Uint8Array` tel quel dans `texture.rgba`.
- [x] **T1.2 Supprimer la validation par octet.** Dans [bevy_projection_adapter.js:357-370](eVe/domains/rendering/bevy_projection_adapter.js:357), remplacer le `.map` par : accepter `Uint8Array`/`Uint8ClampedArray` directement, vérifier uniquement `rgba.length === width*height*4` (O(1)). Garder un fallback `Array.isArray` pour les tests existants.
- [x] **T1.3 Supprimer les copies du cache.** Dans [bevy_media_texture_cache.js](eVe/domains/rendering/bevy_media_texture_cache.js), stocker la texture gelée (`Object.freeze`) et la retourner **sans clone** (les consommateurs ne la mutent pas — l'audit d'appels de T1.5 le confirme).
- [x] **T1.4 Désérialisation typée côté Rust.** Dans [platforms/web/bevy-renderer/src/exports.rs](platforms/web/bevy-renderer/src/exports.rs) et les types de [bevy-core/src/types.rs](atome/renderers/bevy-core/src/types.rs) : faire passer `rgba` en `serde_bytes` (`#[serde(with = "serde_bytes")] Vec<u8>`) — serde_wasm_bindgen reconnaît alors les Uint8Array JS et fait une copie mémoire brute au lieu d'itérer élément par élément. Alternative plus radicale si besoin : export dédié `apply_atome_bevy_texture(id, width, height, &[u8])` via wasm-bindgen (vraie vue zero-copy) et retirer `rgba` du payload JSON.
- [x] **T1.5 Audit d'appels COMPLET** (mémoire : 4 bugs latents server.js) : recenser tous les producteurs/consommateurs de `.rgba` (`grep -rn "\.rgba" eVe atome platforms --include="*.js" --include="*.rs"`) — y compris le renderer natif ([bevy_native_renderer_runtime.js](eVe/domains/rendering/bevy_native_renderer_runtime.js)), la capture de preview ([bevy_project_preview_capture_frame.js](eVe/domains/rendering/bevy_project_preview_capture_frame.js)) et les tests — et adapter chacun.
- [ ] **T1.6 Probe + mesure.** Probe rouge d'abord : compter le temps de `bevy.diff.map_spawn` sur 82 spawns avant/après. Rebuild WASM (`build.sh`), boot réel, re-jouer T0.1. **Objectif : projection d'ouverture 1,8 s → < 300 ms.**

### Phase 2 — RC2 : ombres sans rasterisation par frame (le plus gros gain scroll/resize, ~1 j)

- [x] **T2.1 Translation pure = déplacer l'ombre, pas la reconstruire.** Dans [render_ops.rs `apply_transform`](atome/renderers/bevy-core/src/render_ops.rs:102) : si la taille logique n'a pas changé (comparer avant d'écrire `AtomeLogicalSize`), ne PAS appeler `rebuild_shape_shadow_overlay` — mettre à jour uniquement le `Transform` de l'entité ombre existante (offset connu). Idem pour `rebuild_selection_overlay`/`rebuild_waveform_playback_overlay` (mêmes conditions). Validé pour ombres ; sélection/waveform restent reconstruits uniquement s'ils existent afin de préserver les contrats actuels.
- [x] **T2.2 `apply_layer` = mettre à jour le z de l'ombre, pas la reconstruire.** Dans [render_ops.rs:329-350](atome/renderers/bevy-core/src/render_ops.rs:329) : remplacer les 3 rebuilds par une simple mise à jour de `translation.z` des entités overlay.
- [x] **T2.3 Cache de textures d'ombre côté Rust.** Dans [shape_shadow_overlay.rs](atome/renderers/bevy-core/src/shape_shadow_overlay.rs) : cache `HashMap<(w_arrondi, h_arrondi, corner_radius, blur, color)> → Handle<Image>` (ressource World). Les cartes du dashboard partagent presque toutes la même taille → 1 seule rasterisation au lieu de N. Ne plus `images.remove` un handle partagé (compter les références ou laisser vivre le cache, taille bornée).
- [ ] **T2.4 (option, si T2.3 insuffisant au resize) Ombre 9-slice.** Une seule texture d'ombre de référence par (radius, blur, color), étirée en 9-slice (`Sprite::slice`) à n'importe quelle taille → plus AUCUNE rasterisation dépendante de la taille. Retirer `NoAutomaticBatching` si le partage de texture le permet (batching auto = 1 draw call pour toutes les ombres).
- [x] **T2.5 `apply_surface` : mêmes règles.** Dans [render_ops.rs:202-237](atome/renderers/bevy-core/src/render_ops.rs:202) : les tailles logiques des entités ne changent pas quand seule la surface change → ne pas rebuild les overlays, seulement recalculer les transforms (entité + overlays). Validé pour ombres.
- [x] **T2.6 Probe.** Test Rust (`cargo test -p atome-bevy-core`) : compter les `images.add` lors de 100 `apply_transform` translation-only → doit être 0. Rebuild WASM, boot réel, re-jouer la mesure scroll de T0.1. Test Rust ciblé ajouté pour garantir qu'une translation réutilise le même overlay/handle ; boot réel restant à exécuter avec serveur.

### Phase 3 — RC3 : layers stables (scroll, ~½ j)

- [x] **T3.1 Layer = valeur stable, pas index global.** Dans [virtual_scene_contract.js:178-180](eVe/domains/rendering/virtual_scene_contract.js:178) : remplacer `renderLayer = index` par un layer **espacé** (`index * 16` n'aide pas — il se décale pareil). Solution : le dashboard fournit déjà des layers sémantiques par record (`resolvedTokens.layers.*` dans dashboard_records.js) — propager ce `layer` du record dans le nœud virtuel et n'utiliser l'index que comme **tie-breaker à layer égal, avec un pas fractionnaire dérivé d'un ordre stable par id** (ex. rang du record dans sa catégorie), pour que l'entrée/sortie d'un item en bord de lane ne change PAS le layer des autres.
- [ ] **T3.2 Vérifier le contrat z-order.** Re-jouer les probes existantes `dashboard_z_order` et `dashboard_bevy_shadow_real` (`temp/probe_reports/`) + `tests/eve/dashboard_render_performance_contract.test.mjs`.
- [ ] **T3.3 Probe.** Compter les ops `setLayer` par frame pendant 30 wheel : doit passer de « des dizaines à chaque franchissement de bord » à ~0.

### Phase 4 — RC4/RC5 : scroll en fast-path transform (scroll « instantané », ~1 j)

- [ ] **T4.1 Overscan d'une carte.** Dans [dashboard_layout.js:229-238](eVe/domains/dashboard/dashboard_layout.js:229) : pendant `allowPartialItems`/`allowPartialLanes`, inclure 1 item (et 1 lane) au-delà de chaque bord avec clip. Les spawns se font hors écran, pas en plein milieu du geste. (Les clip rects existent déjà : `clip_rect`, `scroll_clip_rect`.)
- [ ] **T4.2 Fast-path scroll = patchs transform directs.** Pendant un geste de scroll actif (wheel ou drag), au lieu du pipeline complet : appliquer aux records déjà projetés un delta de position via `applyBevyWebRendererTransformPatch` (le fast-path des drags, [bevy_web_renderer_runtime.js:139](eVe/domains/rendering/bevy_web_renderer_runtime.js:139)) — un patch par record de la lane (ou du viewport vertical), groupés dans un seul `apply_atome_bevy_ops` batché. Le pipeline complet (layout+records+diff) ne tourne qu'à la **fin du geste** (snap) et quand un item doit spawner (bord franchi, détectable par comparaison d'offset vs `starts`). Prérequis : T2.1 (sinon chaque patch reconstruit l'ombre) et T3.1 (layers stables).
- [x] **T4.3 Ne pas attendre la présentation pour les frames interactives.** Dans [bevy_web_renderer_runtime.js:463-474](eVe/domains/rendering/bevy_web_renderer_runtime.js:463) : pour des ops transform-only/style-only, remplacer `await waitForBevyDiffPresentation(...)` par fire-and-forget (`scheduleBevyPresentationRedraw` suffit). Garder l'attente pour spawn/resource/text (elle protège la cohérence des captures et du premier affichage). Exposer un flag `quality: 'gesture'` depuis le dashboard pour choisir.
- [ ] **T4.4 Dédoublonner la reconstruction de scène JS.** `updateProjectSceneOverlay` appelle `syncRuntimeSceneFromRecords` ([project_scene_runtime.js:329](eVe/domains/rendering/project_scene_runtime.js:329)) puis `renderProjectScene` → `renderRuntimeProjection` qui refait le même travail ([project_scene_engine.js:96-121](eVe/domains/rendering/project_scene_engine.js:96)). Passer la scène déjà construite (ou un flag `sceneAlreadySynced`) pour ne la construire qu'une fois par frame. Attention : `syncRuntimeSceneFromRecords` sert aussi le hit-testing hors rendu — auditer TOUS les appelants avant (mémoire : audit complet).
- [ ] **T4.5 Probe scroll.** 60 wheel events : latence médiane événement→présentation < 17 ms, aucune rasterisation (texture/ombre) pendant le geste, `projection.runtime.total` absent des frames de geste (fast-path). Confirmer à la main dans l'app réelle (trackpad, les deux axes, les deux handedness).

### Phase 5 — RC8 : resize fluide (~½ j)

- [ ] **T5.1 Geler les textures pendant le geste.** Pendant le resize (détection : événements < 200 ms d'écart), rendre les frames en réutilisant les textures texte/média existantes (le sprite s'étire — `sprite.custom_size` est déjà mis à jour par `apply_transform`) : dans [bevy_web_renderer_runtime.js:432-439](eVe/domains/rendering/bevy_web_renderer_runtime.js:432), pendant un resize actif, transformer les `updateText` en no-op différé (queue), puis au repos (200 ms sans événement) re-rasteriser une seule fois les textes au bon bounds. Même logique déjà présente pour `deferred_texture_queue` — s'en inspirer.
- [ ] **T5.2 Layout resize = fast-path transform.** Même principe que T4.2 : pendant le geste, appliquer le nouveau layout par patchs transform (positions/tailles) sans spawn/despawn ni re-texture ; pipeline complet une fois au repos. Prérequis T2.1/T2.5 (sinon chaque frame reconstruit toutes les ombres).
- [ ] **T5.3 Probe resize.** Resize continu 1400→900→1400 : aucune rasterisation texte pendant le geste, une seule rafale au repos, frames de geste < 17 ms. Vérifier qu'au repos le texte est net (pas d'étirement résiduel) — re-jouer `dashboard_refresh_headers*` probes.

### Phase 6 — RC6/RC7 : ouverture perçue instantanée (~½ j)

- [ ] **T6.1 Dédup des textures inter-nœuds.** Retirer `id` de la clé de cache pour les kinds `image` (icônes SVG partagées) dans [bevy_media_texture_resolver.js:199-210](eVe/domains/rendering/bevy_media_texture_resolver.js:199) — la clé (source, taille, DPR, fit, radius) suffit. Pour `text`, garder id seulement si le style dépend du nœud (vérifier). Mesurer le taux de hit à l'ouverture (les ~82 textures contiennent beaucoup d'icônes répétées par lane).
- [ ] **T6.2 Fade d'ouverture en fast-path opacity.** Dans [dashboard_runtime.js:258-302](eVe/domains/dashboard/dashboard_runtime.js:258) : le tick de fade ne doit PAS refaire records+diff — émettre directement un batch d'ops `style {opacity}` sur les ids déjà projetés (ou mieux : une seule op d'opacité de groupe si on ajoute un parent/groupe côté Bevy — option v2). Premier render complet, puis ticks à ~0 coût. Ramener `dashboardFadeMs` 500 → 180-220 ms (aligné sur les animations de scroll).
- [ ] **T6.3 Affichage progressif à l'ouverture.** Dans `open()` ([dashboard_runtime.js:374-462](eVe/domains/dashboard/dashboard_runtime.js:374)) : projeter d'abord la structure (lanes, headers, fonds — textures minuscules) et faire apparaître les cartes au fil de l'hydratation (le mécanisme critical-categories + `scheduleCategoryContent` existe déjà — vérifier que le premier `await render()` n'attend pas les textures des cartes via les deferred nodes, et étendre `shouldDeferInitialTextureResolution` aux médias de cartes dashboard si besoin).
- [ ] **T6.4 Probe ouverture.** Clic → structure visible < 400 ms (warm), < 1,5 s (cold, WASM compris) ; cartes complètes < 800 ms warm. Comparer à la baseline T0.1.

### Phase 7 — Finitions & non-régression (~½ j)

- [ ] **T7.1 Micro-coûts du chemin chaud** : mémoïser `resolveLayout`/`getBoundingClientRect` par frame ([dashboard_runtime.js:85-106](eVe/domains/dashboard/dashboard_runtime.js:85)) ; court-circuiter `diffDashboardRecords` pendant les gestes (fast-path) ; `JSON.stringify` des effects par render ([project_scene_runtime.js:59](eVe/domains/rendering/project_scene_runtime.js:59)) → comparaison structurelle ou signature.
- [ ] **T7.2 Suite de probes complète.** Re-jouer : `temp/perf_baseline_probe.mjs`, `tests/probes/project_scene_canvas_regression_probe.test.mjs` (luma_range, 0 erreur), probes dashboard existantes (z_order, handle_stability, reload_stability, workspace_stress), + T0.1 final. Exercer les vraies routes : ouvrir/fermer/rouvrir, changer de projet, scroll les deux axes, resize, édition de label, mode gaucher.
- [ ] **T7.3 Rapport final chiffré** dans ce fichier : tableau avant/après par symptôme (ouverture ms, latence scroll ms, latence resize ms), et déplacer ce fichier vers `./done` quand tout est coché.

---

## 4. Estimation des gains

| Symptôme | Aujourd'hui | Causes | Après (objectif) |
|---|---|---|---|
| Ouverture (warm) | ~2,5-3 s (projection 1,8 s + fade 0,5 s) | RC1, RC6, RC7 | **< 0,5 s** (structure < 400 ms) |
| Ouverture (cold) | ~5 s | + WASM/boot (déjà optimisés) | **< 2 s** |
| Resize | plusieurs centaines de ms/frame (re-raster tout) | RC8, RC2, RC1 | **< 17 ms/frame** pendant le geste |
| Scroll | ~20-30 fps théorique max, gel au bord de lane | RC4, RC2, RC3, RC5, RC1 | **< 17 ms/frame**, spawns invisibles (overscan) |

Ordre d'exécution recommandé : **Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7**. Les phases 1 et 2 sont indépendantes et attaquables en parallèle ; les phases 4 et 5 dépendent de 2 et 3.

---

## 5. Rapport d'exécution partiel — 2026-07-03

Corrections appliquées :

- transport texture JS→WASM : producteurs RGBA en typed arrays, cache sans clone, validation O(1), `serde_bytes` côté Rust ;
- instrumentation perf : `op_counts`, `texture_bytes`, durée de `waitForBevyDiffPresentation`, probe `temp/dashboard_perf_probe.mjs` ;
- ombres Bevy : cache de textures partagé, translation/layer/surface sans rasterisation d'ombre quand la taille ne change pas ;
- layers Dashboard : `render_layer` stable propagé depuis les records Dashboard, sans modifier l'ordre dense des scènes projet génériques ;
- frames interactives : attente de présentation supprimée pour les diffs sans spawn/resource/text.

Validations exécutées :

- `npm run test:run -- tests/eve/dashboard_render_performance_contract.test.mjs tests/eve/bevy_projection_adapter_contract.test.mjs tests/eve/bevy_web_renderer_runtime.test.mjs` : 26 tests OK ;
- `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml` : 34 tests OK ;
- `./platforms/web/bevy-renderer/build.sh` : build WASM OK, brotli/gzip régénérés ;
- `npm run test:run -- tests/eve/bevy_web_renderer_runtime_contract.test.mjs tests/eve/project_scene_gesture_performance.test.mjs tests/eve/dashboard_render_performance_contract.test.mjs tests/eve/project_scene_unified_rendering_contract.test.mjs` : 37 tests OK ;
- `npm run test:run -- tests/eve/virtual_scene_phase1_contract.test.mjs tests/eve/project_scene_hit_order_contract.test.mjs tests/eve/bevy_web_renderer_runtime_contract.test.mjs tests/eve/dashboard_render_performance_contract.test.mjs tests/eve/dashboard_records.test.mjs` : 39 tests OK ;
- `npm run test:run -- tests/eve/bevy_web_renderer_runtime.test.mjs tests/eve/bevy_web_renderer_runtime_contract.test.mjs tests/eve/project_scene_gesture_performance.test.mjs tests/eve/bevy_web_renderer_redraw_contract.test.mjs` : 33 tests OK ;
- `cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml` : 20 tests OK ;
- `npm run check:syntax` : 935 fichiers OK ;
- `npm run check:m0` : OK.

Mesures live restantes :

- lancer l'application sur `:3001`, exécuter `node temp/dashboard_perf_probe.mjs`, puis comparer `temp/probe_reports/dashboard_perf_baseline/report.json` avant/après ;
- compléter les phases 4.1/4.2/4.4/4.5, 5, 6, et 7 avant déplacement vers `./done`.
