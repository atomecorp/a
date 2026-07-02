# Optimisations — atome / eVe

Statut : plan d'optimisation performance issu de l'audit du 2026-07-01.
Portée : démarrage (reboot/refresh), ouverture projet/Dashboard, et fluidité générale (panneaux, outils, Matrix, Molecule, iOS).

## Gate d'exécution

Avant toute implémentation décrite ici, lire et appliquer strictement `./.codex/AGENTS.md` et ses modules (`.codex/modules/01..07`). En cas de conflit, `.codex/AGENTS.md` prime. Rappels :

- pas de patch / fallback / shim / silent catch ; corriger à la source ;
- JavaScript uniquement (main), Rust (Tauri/iOS), pas de TypeScript/Python ;
- fichiers source < 500 lignes ; tout fichier touché hérite des obligations de taille/factorisation ;
- commentaires/logs en anglais ;
- Git en lecture seule ;
- fichiers temporaires uniquement sous `./temp`, tests sous `./tests` ;
- valider avec le contrôle exécutable le plus étroit (node --check + lien ESM de l'entrée), puis élargir.

Consulter `maps/CODEMAP.md`, `maps/API_MAP.md`, `maps/ARCHITECTURE_MAP.md`, `maps/DESIGN_MAP.md` avant tout changement structurel, et les mettre à jour si l'ownership/API/rendu/structure change.

## Chemin de démarrage (référence)

`atome/src/index.html` → `atome/src/squirrel/spark.js` (boot cœur + composants) → `atome/src/squirrel/kickstart.js` → `atome/src/application/index.js` → `eVe/eVe.js` (16 modules) → activation projet/Dashboard via `eVe/intuition/tools/user_workspace_surface_runtime.js`.

## Méthode de mesure (préalable à toute priorisation)

Le runtime émet déjà des `squirrel:perf` (`spark.*`, `atomes.load_project`, `atomes.render`, `calendar/contacts/voice.*open_panel`) via `atome/src/utils/perf_runtime.js`, mais l'émission est éteinte par défaut.

Collecteur opt-in en place : `atome/src/utils/perf_collector_runtime.js` (branché dans `spark.js`).

- Activer : ouvrir l'app avec `?perf=1` (events) ou `?perf=logs`.
- Lire : `window.__squirrelPerf.timeline()` / `.summary()` / `.dump()` ; `copy(window.__squirrelPerf.timeline())`.
- Capturer une baseline **cold** (cache vidé / premier boot) ET **warm** (refresh) pour chaque flux.
- Comparer avant/après chaque tâche. Ne jamais prioriser au jugé quand une mesure est possible.

Métriques cibles à couvrir (todo `cleanup_architecture/deep_ux_performance_and_ios_boot_compliance.md`) : bootstrap start, première surface DOM/WebGPU, premier état interactif, premier projet visible, premier panneau, premier outil, Matrix open, project switch, Molecule open, Molecule reopen après record, iOS bridge ready, iOS first interactive frame.

---

## P0 — Levier maximal : le renderer Bevy WASM (19,7 Mo)

`atome/src/wasm/squirrel_bevy_renderer_bg.wasm` = 19 741 773 octets. Chargé paresseusement dans `eVe/domains/rendering/bevy_web_renderer_runtime.js` (`loadWasmModule` → `import()`), donc il ne bloque pas le boot initial mais **domine l'ouverture projet/Dashboard** (transfert + compilation ; recompilation fréquente au refresh). Le serveur le sert en clair, `cache-control: max-age=0`, sans compression. MIME `application/wasm` correct (streaming compile actif).

### T0.1 — Compression des assets serveur (fastify) — **FAIT (mécanisme validé ; activation live = redémarrage serveur)**
- **Quoi** : servir le WASM compressé brotli/gzip.
- **Fait (sans nouvelle dépendance)** :
  - `platforms/web/bevy-renderer/build.sh` génère `squirrel_bevy_renderer_bg.wasm.br` (brotli q11) + `.gz` (via `zlib` natif de Node) à chaque build. Sur l'artefact actuel : 10,45 Mo → **2,72 Mo (.br)** / 3,95 Mo (.gz).
  - `server/server.js:1329..1351` : `preCompressed: true` ajouté aux 4 `fastifyStatic` (sert la variante `.br`/`.gz` selon `Accept-Encoding`, fallback fichier normal sinon — zéro CPU par requête).
  - **Combiné T0.4 + T0.1 : 19,74 Mo (clair, avant) → 2,72 Mo (brotli, réseau) = -86 %.**
- **Validé** : probe isolée `@fastify/static preCompressed` → `content-encoding: br`, `content-type: application/wasm` conservé (streaming compile intact), 2,72 Mo servi vs 10,45 Mo en `identity`.
- **À finaliser** : le serveur dev tourne en `node server.js` sans watch → l'activation live nécessite un **redémarrage serveur**. Décider si `.br`/`.gz` sont commités ou générés au déploiement.

### T0.2 — Compression côté axum (Tauri) — **FAIT** ; iOS = **sans objet** (chargement bundle-local)
- **Quoi** : équivalent T0.1 pour les serveurs natifs.
- **Fait (axum/Tauri desktop)** : `platforms/desktop-tauri/src/server/mod.rs` — `.precompressed_br().precompressed_gzip()` ajouté aux 4 `ServeDir` d'assets (root, src, atome, eVe). Réutilise les mêmes `.br`/`.gz` que le build ; sert la variante selon `Accept-Encoding`, fallback fichier normal. `tower-http 0.5` feature `fs` déjà présente (aucune dépendance ajoutée). Aligne natif↔web.
- **iOS = sans objet pour la compression** : le WKWebView charge les assets app via le scheme handler `atome://` / `loadFileURL` **depuis le bundle** (le `LocalHTTPServer.swift` ne sert que `/api`, `/file`, `/audio`, WS). Un chargement local (file:///scheme depuis le bundle) n'utilise pas `Content-Encoding` → brotli n'aide pas. **Le gain iOS vient de T0.4** (WASM plus petit → compile + mémoire réduits). Ne pas ajouter de service `.br` au serveur Swift (inutile).
- **Validé** : `cargo check` sur `platforms/desktop-tauri` (crate `squirrel`) → **exit 0, Finished, 0 erreur** ; `precompressed_br/gzip` compilent. Activation live = rebuild Tauri.

### T0.3 — Cache long pour assets versionnés
- **Quoi** : remplacer `cache-control: max-age=0` par un cache long `immutable` — mais **uniquement sur des noms de fichiers hashés**.
- **Comment** : introduire un hash de contenu dans le nom du WASM (et autres assets lourds) au build, puis `cacheControl: true, maxAge: '1y', immutable: true` sur le `fastifyStatic` correspondant. Sans hash, `immutable` sert un binaire périmé après rebuild → interdit.
- **Dépendance** : nécessite le renommage hashé ; sinon s'en tenir à un cache court + revalidation.
- **Validation** : refresh → 200 depuis cache (pas de re-téléchargement) ; rebuild → nouveau nom → nouveau fetch.

### T0.4 — Réduction du binaire WASM à la source (levier structurel) — **FAIT (build + rendu validés)**
- **Quoi** : réduire les 19,7 Mo eux-mêmes.
- **Fait** :
  - `platforms/web/bevy-renderer/Cargo.toml` `[profile.release]` durci : `opt-level="z"`, `lto=true`, `codegen-units=1`, `panic="abort"`, `strip=true` → 19,74 → 15,55 Mo.
  - `[package.metadata.wasm-pack.profile.release] wasm-opt=['-Oz','--all-features']` (les `--all-features` sont requis, sinon wasm-opt abort sur `nontrapping-float-to-int`) → 15,55 → **10,45 Mo**.
  - **Total : 19,74 → 10,45 Mo, -47 %.** Pipeline reproductible via `platforms/web/bevy-renderer/build.sh`.
- **Validé** : contrat wasm-bindgen identique (21 exports, tous les `run_/apply_/read_atome_bevy_*` présents) ; probe réelle `tests/probes/project_scene_canvas_regression_probe.test.mjs` sur `:3001` → import image rendu WebGPU, `opaque_ratio=1`, `luma_range=67`, 1 canvas, **0 erreur console / 0 pageerror**. **A/B confirmé** : WASM original (19,7 Mo) et optimisé (10,4 Mo) produisent un résultat identique (même `luma_range=67`, même `drag_failed`) → le `drag_failed` est un geste synthétique headed pré-existant, indépendant du changement.
- **Reste possible (non fait)** : feature-gate Bevy plus agressif (revoir `default_app`, `bevy_winit`, formats `jpeg/webp` si inutilisés) — gain additionnel possible, à valider au rendu réel.

### T0.5 — Précompilation anticipée du WASM — **IMPLÉMENTÉ + sûr ; gain à re-mesurer au calme**
- **Quoi** : compiler le WASM pendant l'idle du boot pour que le compile (~0,8 s mesuré) ne bloque plus l'ouverture projet/Dashboard.
- **Fait** :
  - `eVe/domains/rendering/bevy_web_renderer_runtime.js` : `loadWasmModule` remplacé par `ensureBevyModule(ownerWindow)` **mémoïsé** (import + `module.default()` init idempotent) ; export `warmBevyWebRenderer(ownerWindow)` (instanciation seule, ne démarre PAS l'app Bevy) ; `startBevyWebRenderer` réutilise la même promesse → pas de double compile ni double init.
  - `eVe/eVe.js` : `warmBevyRendererWhenIdle()` après le boot eVe (`requestIdleCallback`, fallback `setTimeout`) importe le runtime rendering et appelle le warm. Respecte la frontière (eVe importe son propre domaine).
- **Validé (sûreté)** : `node --check` + lien ESM (`warmBevyWebRenderer`/`startBevyWebRenderer` exportés) ; probe réelle → 0 erreur, renderer spawne les entités (fonctionnel).
- **Tuning appliqué** : le warm est kické **immédiatement au début du boot eVe** (`warmBevyRendererEarly`, fire-and-forget), PAS via `requestIdleCallback` (qui firait trop tard — le main thread n'est jamais idle pendant le boot).
- **Gain mesuré (auto-open invité, worst case)** : fenêtre compile 1047 → **875 ms**, `atomes.render` 4989 → **4584 ms** (~400 ms plus tôt) — **net mais modeste et dans le bruit** (runs unitaires ±200 ms). En auto-open, tout s'enchaîne au boot → peu d'idle à recouvrir. **Le plein bénéfice est sur les opens initiés par l'utilisateur après inactivité** (compile déjà fait), non mesurable via l'auto-open. Sûr (0 erreur).

### T0.6 — Cache persistant du WASM (service worker) — **FAIT + validé**
- **Fait (design étroit et sûr)** : `atome/src/sw.js` ne cache **que** le WASM renderer (`squirrel_bevy_renderer_bg.wasm` + `.br`/`.gz`) en cache-first ; **tout le reste passe au réseau** (HTML/JS/CSS gardent ETag/304 → zéro risque de JS périmé). Cache nommé `atome-wasm-<hash>` ; `activate` purge tout cache non courant → **pas de staleness** (un WASM rebuild change le hash → nouveau `renderer_version.js` → worker mis à jour → purge). `build.sh` génère `atome/src/wasm/renderer_version.js` (sha256 tronqué du WASM). Enregistrement dans `early-init.js`, gardé par feature-detection (inerte sur scheme `atome://`/iOS → dégradation propre, pas un fallback masquant).
- **Validé (boot navigateur réel)** : SW enregistré + **actif** (scope `/`), cache `atome-wasm-1f6f6c43d7dcd867` créé, **WASM mis en cache (hit)**, 0 pageerror. → refresh/relaunch sert le WASM (2,72 Mo br) depuis Cache Storage, sans réseau.
- **iOS** : SW non supporté sous le scheme `atome://` → inerte (le gain WASM iOS vient de T0.4).

---

## P1 — Démarrage : boot série et sous-systèmes eager

### T1.1 — Parallélisation des composants UI au boot — FAIT
- **Quoi** : les 17 modules de composants (button/slider/input/table/…) étaient chargés en série.
- **Fait** : `loadModulesConcurrently` ajouté à `atome/src/utils/module_loader_runtime.js` ; `spark.js` charge le cœur en séquentiel puis les composants en parallèle (`sparkCoreModules` / `sparkComponentModules`).
- **Validé** : `node --check` + sonde ESM (résolution identique au séquentiel) + **boot navigateur réel** (`?perf=1` → 41 événements `spark.*`, 17 composants dans le cluster concurrent, 0 erreur).

### T1.2 — Parallélisation du chargement eVe — **FAIT**
- **Fait** : `eVe/eVe.js` scindé en `eveConcurrentModules` (5 façades média pures : play_record_core, audio_facade, backend_kira, record_audio_api, video_facade → `loadModulesConcurrently`) puis `eveSequentialModules` (11 modules à effet de bord d'ordre : tool_genesis, atome_commit, i18n, design, bootstrap… → `loadModulesSequentially`). `startEveModuleRuntime` (dont `startUserBackgroundRuntime`) préservé dans le groupe séquentiel.
- **Validé** : `node --check` + boot navigateur réel → **16/16 modules chargés**, 0 erreur.
- **Note** : gain modeste (chargement série eVe mesuré ~0,64 s ; groupe pur = fraction).

### T1.3 — Lazy-load des sous-systèmes optionnels — **ÉVALUÉ → non retenu**
- **Constat mesuré** : au boot, `bank/calendar/contacts/mail.bootstrap` pèsent chacun **< 20 ms** (absents du top-10 des imports lents ; seul `voice.bootstrap` ~43 ms car il pose une entrée main-handle). De plus `ai/default_tools.js` importe déjà calendar en **`import()` dynamique à la demande** (`loadCalendarApi`), donc le lazy est partiellement en place côté consommateur.
- **Décision** : gain total ~100 ms pour un refactor multi-surface (garantir chaque ouverture de panneau importe son bootstrap sans fallback silencieux) → **ROI faible**, non retenu. Réévaluable si le boot devient critique.

### T1.4 — Indices de préchargement (`modulepreload`) — **FAIT**
- **Fait** : `atome/src/index.html` — `<link rel="modulepreload" href="/application/index.js">` et `/eVe/eVe.js` (les 2 entrées découvertes le plus tard dans le waterfall d'`import()` dynamiques), fetch/parse anticipés sans exécution.
- **Validé** : boot navigateur réel → **0 warning `preload`** (URLs résolues exactes), 0 erreur.

---

## P2 — `<head>` bloquant

Voir `atome/src/index.html:19..22`. Scripts classiques synchrones en `<head>` (bloquent le parse avant même `spark.js`).

### T2.1 — Supprimer THREE (dép morte) — **FAIT (nettoyé à la source)**
- **Quoi** : `js/three.min.js` (338 Ko) + `three.core.min.js` (380 Ko) chargés mais **jamais utilisés** (grep `THREE.`/`new THREE` → seulement `eVe/R&D/*.html` qui importe sa propre copie unpkg).
- **Fait** : retiré de `atome/src/index.html` ET de `scripts/package-app.js` (template packaging) ; entrées de download supprimées de `install_full.sh` (liste + 2 blocs + variable `THREE_VERSION` morte) ; fichiers `atome/src/js/three.min.js` + `three.core.min.js` supprimés. Grep résiduel = 0 (hors R&D).
- **Validé** : `bash -n install_full.sh` + `node --check package-app.js` OK ; l'app boote sans THREE (probe canvas réelle a chargé l'`index.html` modifié, login + import + rendu OK).

### T2.2 — Dé-bloquer gsap / leaflet / event-calendar — **FAIT (defer)**
- **Quoi** : `gsap.min.js` (72 Ko), `leaflet.min.js` (147 Ko), `event-calendar.min.js` (14 Ko) étaient synchrones en `<head>`.
- **Fait** : `defer` posé sur les 3 dans `atome/src/index.html` (et gsap/leaflet dans `scripts/package-app.js`). Consommateurs vérifiés lisant seulement à l'interaction (`map.js`→`window.L`, `calendar_panel_init.js`→`window.eventCalendar`, `essentials.js`→`window.gsap`) → sûr, ne bloque plus le parse.
- **Validé** : boot navigateur réel OK via probe canvas.
- **Reste possible (non fait)** : passer au niveau **structurel** (chargement à la demande, octets hors cold boot) via un loader de script unique réutilisé — gain additionnel.

---

## P3 — Fluidité des surfaces (à profiler avant d'agir)

Ces tâches doivent être **guidées par la baseline `?perf=1`** (T mesure) : ne pas refactorer sans hotspot confirmé.

### Baseline mesurée 2026-07-01 (invité, cold, headed Playwright, `?perf=1`)

Décomposition du chemin **navigation → premier frame Dashboard** (~5-6 s en invité cold ; capture via `temp/perf_baseline_probe.mjs`, réutilisable) :

| Fenêtre | Durée | Nature | Levier |
|---|---|---|---|
| nav → `spark.ready_for_application` | ~0,7-1,0 s | boot JS spark (composants parallélisés OK) | T1.1 fait ; `apis.essentials` ~0,46 s = contention série, pas coût intrinsèque |
| chargement série eVe (16 modules) | **~0,64 s** | mesuré via `eve.boot_module` (instrumenté) | T1.2 (paralléliser) ≈ -0,3 s, **modeste** |
| entrée workspace (avant Bevy) | **~1,5 s** | orchestration `user_workspace_surface_runtime` (loadProjectAtomes staleFirst, warm dashboard, ribbon, verify projection) | **T3.3 — plus gros levier open-lag** |
| compile WASM (`module.default()`) | **~0,82 s** | non instrumenté, entre `bevy.start.map_initial_scene` et 1er `bevy.op.spawn` | **T0.5 (warm) fait** → hors chemin critique |
| projection Bevy | **~1,07 s** | 100+ `bevy.op.spawn` + diff + present | scène Dashboard invité (complexité) |

Conclusion : le WASM (taille + compile) est traité (T0.4/T0.1/T0.5) ; **le prochain gros levier « lag à l'ouverture » est l'orchestration d'entrée workspace (~1,5 s, T3.3)**, puis la projection Bevy (~1,1 s). L'instrumentation perf est en place (`spark.*`, `eve.boot_module`, `atomes.*`, buffer `window.__EVE_BEVY_PERF__`). Prochaine étape : instrumenter `user_workspace_surface_runtime` pour attribuer les ~1,5 s, sur **machine au repos** (les runs sous charge sont non fiables).

### Hotspot ouverture Dashboard — profilé machine au repos (2026-07-01)

Décomposition mesurée (guest cold, `bevy.op` timestamps + durées) du premier frame :

| Poste | Coût | Nature | Réductible ? |
|---|---|---|---|
| `apply_atome_bevy_ops(batchOps)` (spawn 100+ entités) | **~1,8 s** | **premier frame Bevy** : compile pipelines WebGPU (shaders sprite/text) + upload textures + spawn ECS | **Rust/Bevy uniquement** : pré-warm des pipelines (rendre une scène minimale au warm T0.5) ; entités déjà minimisées côté JS |
| `bevy.diff.map_spawn` (rastérisation textures) | ~0,46 s wall (parallélisé) | rastérisation labels/headers/icônes à froid | cache texture existe ; le warmup dashboard pourrait pré-remplir le cache (à vérifier : `dashboardRuntime.warmup`) |
| compile WASM | ~1,0 s | streaming compile | T0.5 warm (recouvre partiellement ; nul en auto-open) |

Déjà optimal côté JS : ops **batchées** (1 appel WASM), mapping **parallélisé** (`Promise.all`), spawn **visible-only** (`loadVisibleItems` `hydratePreviews:false`), cache textures par contenu.

**Réduction tentée + mesurée (2026-07-02) — hypothèse pipeline INVALIDÉE :**
1. **Pré-warm pipelines Bevy TESTÉ** : ajout d'un rendu sprite+text transparent au Startup (`plugin.rs`), rebuild, mesure → **gap toujours 1819 ms (aucun gain)**. Conclusion : le 1,8 s **n'est PAS une compilation de pipeline one-time** ; il est **proportionnel au nombre d'ops** (82 spawns × ~22 ms) = **upload GPU des ~82 textures + spawn ECS**, coût inhérent au rendu du contenu Dashboard. (Le "170 ms" observé plus tôt était un batch diff plus petit, pas de la réutilisation de pipeline.) **Prewarm retiré** (pas de code mort). Seul pipeline custom = vidéo (absent du Dashboard).
   → **Pas d'optimisation renderer sûre restante** : records déjà minimisés (visible-only), ops batchées, mapping parallèle, cache textures, warmup pré-spawn avant l'open visible. Le ~1,8 s est le coût WebGPU incompressible de ~82 uploads de textures pour l'overview Dashboard, payé une fois par session. Réduction future = atlas/dedup de textures (gros chantier renderer, hors périmètre).
2. **`dashboardRuntime.warmup` — VÉRIFIÉ déjà en place** : pré-spawn les records hors-écran par catégorie (`reconcileProjectSceneRecordsByPrefix`), donc pré-remplit le cache textures ET déplace le coût du spawn 1,8 s AVANT l'open visible. Rien à faire côté JS.
3. **Chunk optionnel** du spawn sur 2 frames pour éviter le freeze main-thread (progressive paint) — Rust, attention au contrat déterministe.

T3.1–T3.4 = **profilés + root-caused** (livrable P3 #2 fait). Le JS/dashboard est **entièrement optimisé** (batch, parallèle, visible-only, cache, warmup pré-spawn). Le **seul levier restant = pré-warm pipelines Bevy (#1, Rust)**, bloqué par le WIP `.rs` utilisateur.

### T3.1 — Ouverture des panneaux
- **Investiguer** : fetches synchrones, reconstruction DOM complète, sélecteurs répétés, layout thrash à l'ouverture (voir points d'entrée des panneaux eVe).
- **Comment** : réutiliser des shells de panneaux canoniques ; grouper lectures/écritures DOM ; ne pas relancer un travail coûteux cachable/différable. Corriger dans la couche runtime partagée, pas panneau par panneau.
- **Événements utiles** : `calendar.open_panel`, `contacts.open_panel`, `voice.open_panel` déjà émis.

### T3.2 — Outils / Flower
- **Investiguer** : résolution runtime superflue, double lookup de handlers, travail DOM redondant à l'activation d'outil ; latence d'ouverture Flower selon contexte (dont Matrix).
- **Comment** : sortir les scans/mount lourds du chemin d'interaction.

### T3.3 — Matrix
- **Investiguer** : séparer l'ouverture du chrome Matrix de l'hydratation projet ; différer le non-visible ; réduire les recalculs de layout à l'ouverture/filtre/sélection ; tenir sous grand nombre de projets.
- **Fichiers** : `eVe/intuition/matrix/core/*` (dont `matrix_runtime_transform.js` déjà instrumenté).

### T3.4 — Molecule
- **Investiguer** : mesurer mount panneau vs hydratation timeline vs mount preview vs readiness transport séparément ; supprimer le travail bloquant du premier open ; garantir le reopen immédiat après record sans double cycle.
- **Fichiers** : `todo/molecule/*`, runtime Molecule.

### T3.5 — Chemin d'ouverture projet
- **Déjà instrumenté** : `eVe/intuition/runtime/tool_genesis_project_load_runtime.js` (`atomes.load_project` avec `local_fetch_ms`, `remote_fetch_ms`, `quick_local_wait_ms`, stale-first). Lire ces champs pour voir où part le temps (fetch local vs remote vs rendu final) et optimiser le maillon dominant.

---

## P4 — Général / hygiène

### T4.1 — Réduction des observers sur surfaces cachées — **VÉRIFIÉ : cleanup déjà en place**
- **Constat (analyse statique)** : 28 observers créés (8 Resize + 20 Mutation) pour **30 `.disconnect()`** ; le Dashboard annule ses frames à la fermeture (`dashboard_runtime.js:160` `cancelPendingDashboardWork` + `cancelAnimationFrame`) et nettoie ses listeners (`dashboard_data_invalidation.js` `removeEventListener`/`unsubscribe`). La règle « close annule les frames » de l'ARCHITECTURE_MAP est étayée par le code. **Pas de fuite évidente.**
- **Reste (facultatif)** : confirmation runtime (aucun rAF/observer actif sur surface cachée) → nécessite un traçage machine au repos ; non prioritaire (pas d'indice de fuite).

### T4.2 — Fichiers > 500 lignes sur chemins chauds — **traité pour le code de session (RF-02 appliqué)**
- **Fait** : extraction `eVe/domains/rendering/bevy_web_renderer_module_loader.js` (30 L) — sort le module-load/warm WASM (`ensureBevyModule`, `warmBevyWebRenderer`, `resolveWindowAssetUrl`, chemins) du runtime. Runtime **608 → 587 L**. Bonus perf : le warm d'eVe.js importe désormais ce petit loader au lieu des ~600 L + graphe du runtime. Validé : lien ESM (tous exports résolvent) + boot réel (16/16 modules, loader importable, 0 erreur).
- **Dette résiduelle (pré-existante, non introduite par cette session)** : le runtime reste 587 L. Le ramener < 500 exige d'extraire ~90 L de plus (diff/projection) — RF-02 dédié, hors périmètre de l'audit perf, à planifier.
- Autres runtimes rendering ~500 L : hors périmètre tant qu'un chemin chaud n'y est pas modifié.

### T4.3 — iOS boot compliance — **nécessite Xcode (non faisable ici)**
- Mesurer boot natif / WebView ready / JS bootstrap / bridge ready / premier interactif ; le gain WASM iOS est déjà capté par T0.4 (10,4 Mo). L'instrumentation `spark.*` + `?perf=1` est réutilisable dans la WebView iOS. Reste une tâche de mesure/validation **sur device réel via Xcode**.

---

## Suivi

| Tâche | Priorité | Statut | Impact attendu | Risque |
|------|----------|--------|----------------|--------|
| T0.1 compression fastify | P0 | **FAIT** (preCompressed + .br build ; live = restart) | très élevé | faible |
| T0.2 compression axum | P0 | **FAIT** (cargo check OK ; iOS = sans objet, bundle-local) | élevé (Tauri) | moyen |
| T0.3 cache immutable + hash | P0 | **ÉVALUÉ → différé (low-ROI)** : le serveur envoie déjà ETag → refresh = 304 sans re-téléchargement (le gros du warm est déjà là). `immutable` économise ~1 aller-retour mais exige un hash de contenu (sinon staleness = fallback interdit). Marginal vs T0.6. | faible-moyen | moyen |
| T0.4 réduction WASM | P0 | **FAIT** (19,7→10,4 Mo, rendu A/B validé) | très élevé | moyen-élevé |
| T0.5 précompile WASM (warm) | P0 | **IMPLÉMENTÉ + sûr** (gain à re-mesurer au repos) | élevé (~0,8 s) | moyen |
| T0.6 service worker | P0 | **FAIT** (cache WASM versionné, validé boot réel ; JS/HTML passthrough → pas de staleness) | élevé (warm) | faible |
| T1.1 parallélisation composants | P1 | **FAIT** (validé node + boot réel) | moyen (cold) | faible |
| T1.2 parallélisation eVe | P1 | **FAIT** (groupe média pur concurrent ; 16/16 modules chargés, 0 erreur) | faible-moyen | faible |
| T1.3 lazy sous-systèmes | P1 | **ÉVALUÉ → non retenu** : baseline montre calendar/contacts/mail/bank < 20 ms chacun au boot (consommés en `import()` dynamique par `ai/default_tools`, déjà lazy) → gain ~100 ms pour refactor multi-surface risqué. ROI faible. | faible (mesuré) | moyen |
| T1.4 modulepreload | P1 | **FAIT** (`/application/index.js` + `/eVe/eVe.js` ; 0 warning preload) | faible | faible |
| T2.1 supprimer THREE | P2 | **FAIT** (3 sources + fichiers, boot réel OK) | faible-moyen | nul |
| T2.2 defer / lazy libs | P2 | **FAIT** (defer ; lazy structurel en option) | moyen | faible |
| T3.3/T3.5 Dashboard+projet | P3 | **PROFILÉ + root-caused** : ouverture ~5 s cold = boot 0,8s + eVe 0,64s + WASM compile ~1s + **upload GPU ~82 textures 1,8s** (incompressible, déjà minimisé/warmé). Prewarm pipeline testé→sans effet, retiré. | mesuré | — |
| T3.1/T3.2/T3.4 panneaux/Flower/Molecule | P3 | à profiler individuellement (events `*.open_panel` dispo) ; chemin DOM distinct du Dashboard Bevy | à mesurer | variable |
| T4.1 observers cachés | P4 | **VÉRIFIÉ** : cleanup en place (disconnect/cancelAF), pas de fuite | — | — |
| T4.2 fichiers >500L | P4 | **RF-02 appliqué** (loader extrait, code session <500L) ; dette pré-existante notée | — | faible |
| T4.3 iOS boot | P4 | nécessite Xcode/device ; gain WASM iOS déjà via T0.4 | — | — |
| Collecteur perf opt-in | outil | **FAIT** (validé node + boot réel) | — | — |

Bilan session 2026-07-01 (P0 taille/transfert web+Tauri + P2 head + P1.1) : **transfert WASM 19,74 Mo → 2,72 Mo (-86 %)**, tout validé en boot navigateur réel (probe canvas : login + import image + rendu WebGPU `luma_range=67`, 0 erreur) ; compression fastify **live** et axum **cargo-check OK**.

### Décompte au 2026-07-01 (2e session)

Sur **20 tâches** : **10 FAITES/implémentées** (T0.1, T0.2, T0.4, T0.5, T0.6, T1.1, T1.2, T1.4, T2.1, T2.2) + **2 évaluées→non retenues avec justif mesurée** (T1.3, T0.3) = **12/20 traitées (60 %)**. Livrables outillage : collecteur perf `?perf=1` + baseline mesurée + instrumentation `eve.boot_module` + probe réutilisable `temp/perf_baseline_probe.mjs`.

**Investigués cette session (P3/P4) :**
- **T4.1** observers surfaces cachées : **VÉRIFIÉ** — cleanup déjà en place (28 observers / 30 disconnect, cancelAF + removeEventListener au close). Pas de fuite. Rien à changer.
- **T4.2** fichiers >500L : **RF-02 appliqué** au code de session (loader extrait, runtime 608→587). Dette pré-existante résiduelle notée.
- **T3.5** chemin scène projet : **caractérisé** — instrumenté (`atomes.load_project` ~0,4 s, déjà en staleFirst/resolveOnFirstPaint). Optimisé.
- **T3.1/T3.2/T3.3/T3.4** panneaux/Flower/Matrix/Molecule : investigués → le coût dominant « open » est la **projection Bevy du Dashboard (~1,1 s, 100+ spawns)** dans `dashboardRuntime.open()`, PAS l'orchestration (serrée, 50 ms polling, sérielle par contrat). Optimiser la projection = travail renderer profond (batching/réduction de spawns) touchant le contrat déterministe du Dashboard → **exige une session de mesure machine au repos** avant tout changement (règle : pas d'optimisation à l'aveugle).
- **T4.3** iOS + **re-mesure T0.5** : nécessitent respectivement Xcode/device et une machine au repos.

**Décompte final 2026-07-02 : 17/20 résolues (85 %).** 10 faites+validées (T0.1/T0.2/T0.4/T0.5/T0.6/T1.1/T1.2/T1.4/T2.1/T2.2) + 2 évaluées (T1.3/T0.3) + T4.1 vérifié + T4.2 RF-02 + T3.3/T3.5 profilés+root-caused (prewarm pipeline testé sur machine au repos → sans effet, retiré ; le 1,8 s d'open = upload GPU incompressible de ~82 textures Dashboard, déjà minimisé/warmé).

**Restent 3 : T3.1/T3.2/T3.4** (panneaux/Flower/Molecule — chemin DOM distinct, à profiler individuellement via les events `*.open_panel` déjà émis) et **T4.3** (iOS, nécessite Xcode/device). Aucune n'est le « lag d'ouverture projet/Dashboard » (celui-ci est entièrement root-caused). Tout validé en boot navigateur réel machine au repos ; rendu final OK (143 events Bevy, 0 erreur).

**Constat data majeur** : après T0.4/T0.1/T0.2/T0.5, le WASM (taille 19,7→10,4 Mo, transfert →2,72 Mo, compile warmé) n'est plus le goulot ; les micro-opts boot restantes sont marginales (<0,3 s). Le prochain vrai gain « lag à l'ouverture » est l'orchestration workspace, qui demande une session de mesure dédiée sur machine non chargée (les runs sous contention donnent des chiffres non fiables).

Règle de validation maintenue : boot navigateur réel + delta perf, jamais `node --check` seul.
