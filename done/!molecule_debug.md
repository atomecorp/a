# eVe / Atome — Protocole Maître de Debug de la Molécule

## Objectif Global

Stabiliser définitivement le système de création et de gestion des molécules dans eVe.

Une molécule représente une session média complète :

* timeline ;
* transport ;
* clips ;
* moteur audio ;
* renderer WebGPU ;
* historique ;
* lecture ;
* état runtime.

Le but n’est PAS de corriger rapidement des symptômes.
Le but est :

* identifier la cause racine ;
* supprimer les routes concurrentes ;
* éliminer les états incohérents ;
* garantir une création transactionnelle fiable ;
* empêcher les sessions fantômes ;
* rendre les bugs reproductibles ;
* rendre le système observable.

---

# Règles Absolues

## Interdictions

* Pas de fallback runtime.
* Pas de correction cosmétique.
* Pas de patch temporaire.
* Pas de nouvelle architecture improvisée.
* Pas de duplication de logique.
* Pas de nouvelle source de vérité.
* Pas de refactorisation globale.
* Pas de "quick fix".
* Pas de suppression silencieuse d’erreur.
* Pas de try/catch qui masque un problème.
* Pas d’analyse du framework complet hors périmètre.

---

## Principes Obligatoires

### Une intention utilisateur = une seule molécule

Règle fondamentale :

```txt
1 intention utilisateur
→ 1 molecule_creation_id
→ 1 MoleculeSession complète
```

ou :

```txt
échec
→ rollback complet
→ aucune session résiduelle
```

---

### Toute création doit être observable

Aucune création implicite.
Aucune création silencieuse.
Aucun état caché.

Chaque étape doit être tracée.

---

### Toute création doit être transactionnelle

La molécule ne doit jamais exister partiellement.

Soit :

* complète ;
* prête ;
* cohérente.

Soit :

* rollback ;
* destruction ;
* nettoyage mémoire.

Jamais entre les deux.

---

# Pipeline Théorique de Création

## États obligatoires

```txt
requested
→ validating_source
→ creating_session
→ creating_timeline
→ attaching_media
→ initializing_audio
→ initializing_renderer
→ binding_transport
→ ready
```

En cas d’erreur :

```txt
failed
→ rollback
→ disposed
```

---

# Sources Possibles de Création

Toutes les routes suivantes doivent converger vers UNE seule factory centrale.

## Sources utilisateur

* import audio ;
* import vidéo ;
* enregistrement audio ;
* enregistrement vidéo ;
* saisie texte ;
* ouverture MTraX ;
* ouverture via atome ;
* restauration de projet ;
* duplication ;
* drag & drop ;
* ouverture historique.

---

# Factory Centrale Obligatoire

## Architecture cible

Toutes les créations doivent passer par :

```js
createMoleculeSession(request)
```

Interdiction de :

* créer une MoleculeSession ailleurs ;
* instancier une timeline directement ;
* initialiser le renderer hors pipeline ;
* initialiser l’audio hors pipeline ;
* bypasser le transport.

---

# Phase 1 — Cartographie

## Prompt Audit Principal

```md
Analyse uniquement le pipeline de création d’une molécule dans eVe.

Contexte :
Une molécule est une session média complète, pas un simple panneau UI.
Elle contient timeline, transport, clips, audio natif, renderer WebGPU et historique.

Elle peut être créée depuis :
- import média ;
- enregistrement audio ;
- enregistrement vidéo ;
- saisie texte ;
- ouverture via MTraX ;
- atome_mtrack_open_request.

Fichiers connus :
- molecule.js
- molecule.api.js
- eVeIntuition.js
- panel_lifecycle_runtime.js
- molecule_architecture_and_rebuild_plan.md
- ARCHITECTURE_MAP.md
- API_MAP.md

Objectif :
cartographier précisément le pipeline de création d’une molécule.

Ne modifie aucun code.

Produit :
1. liste des points d’entrée ;
2. ordre réel des appels ;
3. objets créés ;
4. états modifiés ;
5. sources de vérité ;
6. routes concurrentes ;
7. appels async ;
8. dépendances UI/runtime/audio/WebGPU ;
9. endroits où une création partielle peut rester en mémoire ;
10. endroits où plusieurs molécules peuvent être créées pour une seule intention utilisateur.

Interdictions :
- ne pas corriger ;
- ne pas refactoriser ;
- ne pas ajouter de fallback ;
- ne pas inventer une nouvelle architecture.

Résultat attendu :
un graphe d’exécution clair du pipeline de création de molécule.
```

---

# Phase 2 — Instrumentation

## Objectif

Rendre les bugs observables.

Pas les corriger.

---

## Prompt Instrumentation

```md
À partir du graphe d’exécution précédent, ajoute une instrumentation temporaire minimale pour rendre observable la création d’une molécule.

Objectif :
identifier pourquoi la création devient instable.

Règles :
- ne corrige rien ;
- ajoute uniquement des logs/probes TEMP_DEBUG ;
- chaque création de molécule doit recevoir un molecule_creation_id ;
- tracer les transitions d’état ;
- tracer les appels async ;
- tracer les créations/destructions de session ;
- tracer timeline/audio/renderer/transport séparément ;
- tracer les erreurs silencieuses ;
- tracer les doubles créations ;
- tracer les créations incomplètes.

Format obligatoire :

TEMP_DEBUG_MOLECULE {
  creation_id,
  source,
  step,
  file,
  function,
  molecule_id,
  timeline_id,
  renderer_state,
  audio_state,
  transport_state,
  timestamp,
  status,
  error
}

Logger uniquement aux bifurcations critiques.
```

---

# Phase 3 — Reproduction

## Objectif

Transformer un bug erratique en bug reproductible.

---

## Scénarios Obligatoires

### Création

* import audio ;
* import vidéo ;
* record audio ;
* record vidéo ;
* saisie texte ;
* ouverture MTraX.

### Stress

* double ouverture rapide ;
* fermeture/réouverture ;
* ouverture multiple ;
* import simultané ;
* destruction pendant init ;
* audio non disponible ;
* WebGPU non disponible ;
* timeline invalide.

---

## Vérifications Obligatoires

Pour chaque test :

```txt
1 seule MoleculeSession
1 seule timeline
1 transport cohérent
1 renderer cohérent
aucune session fantôme
aucune création partielle
aucun listener dupliqué
aucune route concurrente
aucune fuite mémoire évidente
```

---

# Phase 4 — Isolation de la Cause Racine

## Ennemis Probables

* double création ;
* ancien MTrack encore actif ;
* état UI ≠ état runtime ;
* async non await ;
* race condition ;
* renderer créé trop tôt ;
* audio prêt après timeline ;
* dispose manquant ;
* session non rollbackée ;
* listeners multiples ;
* event déclenché deux fois ;
* création recursive ;
* état partagé global ;
* cache incohérent ;
* session restaurée + recréée ;
* timeline mutable depuis plusieurs endroits.

---

# Phase 5 — Correction

## Règle Absolue

Correction minimale.

Pas de réécriture globale.

---

## Prompt Correction

```md
À partir des logs TEMP_DEBUG et des tests, identifie la cause racine du problème de création de molécule.

Corrige uniquement la cause racine prouvée.

Contraintes :
- aucune refonte globale ;
- aucun fallback runtime ;
- aucune source de vérité supplémentaire ;
- aucune route alternative ajoutée ;
- aucune correction cosmétique ;
- supprimer tous les logs TEMP_DEBUG après validation ;
- conserver ou ajouter les tests de non-régression.

Priorité absolue :
garantir qu’une intention utilisateur crée exactement une seule molécule complète ou échoue proprement sans laisser d’état partiel.

Pour chaque modification :
- fichier ;
- fonction ;
- cause corrigée ;
- comportement avant ;
- comportement après ;
- test associé.
```

---

# Signaux d’Alerte Critiques

## Extrêmement suspects

* création de MoleculeSession dans plusieurs fichiers ;
* timeline créée hors factory ;
* renderer initialisé depuis UI ;
* état global mutable ;
* singleton implicite ;
* listeners non nettoyés ;
* transport attaché plusieurs fois ;
* callbacks async sans await ;
* accès direct à window.Molecule depuis plusieurs couches ;
* état UI qui pilote directement le runtime.

---

# Objectif Final

Obtenir un système où :

```txt
Une molécule =
une transaction runtime cohérente,
atomique,
observable,
isolée,
reproductible,
rollbackable,
sans état fantôme.
```

Et où :

```txt
Toutes les routes utilisateur convergent vers une seule vérité.
```

---

# Priorités Réelles

## Priorité 1

Stabilité de création de molécule.

## Priorité 2

Suppression des routes concurrentes.

## Priorité 3

Rollback fiable.

## Priorité 4

Nettoyage mémoire et dispose.

## Priorité 5

Performance.

Les optimisations de performance ne doivent commencer qu’après stabilisation complète du pipeline.

---

# Suivi d'exécution Codex

## Phase 1 — Cartographie — TRAITÉE

Statut: traité le 2026-05-27.

Fichiers inspectés:

* `.codex/AGENTS.md`
* `maps/CODEMAP.md`
* `maps/API_MAP.md`
* `maps/ARCHITECTURE_MAP.md`
* `maps/DESIGN_MAP.md`
* `done/molecule_architecture_and_rebuild_plan.md`
* `eVe/core/media_engine/molecule.js`
* `eVe/core/media_engine/molecule.api.js`
* `eVe/core/media_engine/molecule.native.js`
* `eVe/core/media_engine/molecule.webgpu.js`
* `eVe/intuition/eVeIntuition.js`
* `eVe/domains/mtrax/ui/panel_lifecycle_runtime.js`
* `eVe/domains/mtrax/timeline/import_media_timeline.js`
* `eVe/domains/mtrax/timeline/group_timeline_load_runtime.js`
* `eVe/domains/mtrax/api/window_api_runtime.js`
* `eVe/intuition/tools/molecule/session/session.js`
* `eVe/intuition/tools/molecule/session/registry.js`
* `eVe/intuition/tools/molecule/runtime.js`
* `eVe/intuition/tools/molecule/multi_instance/index.js`
* `eVe/intuition/runtime/tool_genesis.js`
* `eVe/intuition/tools/project_drop.js`

### 1. Points d'entrée identifiés

* Atome media double-click: `eVe/intuition/eVeIntuition.js`, `handleAtomeEditFooterDblClick()` -> `requestMtrackOpenForAtome()`.
* Atome media direct open: `requestMtrackOpenForAtome()` -> `openGroupTimelineThroughMtrack()` when `normalizeImportedMtraxClipKind()` recognizes image/video/audio/svg.
* MTraX tool open: `invokeTool({ tool_id: 'ui.mtrax.open' })` -> `openGroupTimelineThroughMtrack()`.
* Event bridge: `window.addEventListener('eve:group-open-timeline')` -> `openGroupTimelineThroughMtrack()`.
* Runtime group API: `registerGroupTimelineApi({ openGroupTimeline })` -> `openGroupTimelineThroughMtrack()`.
* Project import: `invokeProjectImportFromFlower()` -> `importFilesToProjectViaCreator()`, then project atome creation; media atomes later open through the atome MTraX path.
* Project-visible media rendering: `eVe/intuition/runtime/tool_genesis.js` -> `ensureMoleculeMediaRuntime().mountVisual()`.
* User/profile media rendering path: `eVe/intuition/tools/user.js` -> `ensureMoleculeMediaRuntime().mountVisual()`.
* MTraX external file drop: `window.eveMtrackApi.handleExternalFileDrop()` -> `addClipFromEntry()`.
* MTraX capture append: `window.eveMtrackApi.appendCaptureAtomes()` -> `addClipFromEntry()`.
* MTraX record media: `window.eveMtrackApi.recordMedia()` -> `stopMediaRecordActionCapture()` / capture append.
* Legacy Molecule group runtime: `installMoleculeGroupTimelineRuntime()` -> `createMoleculeSession()` -> `openMoleculePanel()`.
* Molecule multi-instance controller: `createMoleculeMultiInstanceController().openInstance()` -> `registry.open()` -> `createMoleculeSession()`.
* Low-level media API command: `window.Molecule.execute({ command: 'createSession' })` -> `MoleculeEngine.createSession()`.

### 2. Ordre réel des appels principaux

Atome media double-click:

```txt
dblclick
-> handleAtomeEditFooterDblClick()
-> requestMtrackOpenForAtome()
-> openGroupTimelineThroughMtrack()
-> resolveMtrackGroupOpenTarget()
-> resolveMtrackMediaOpenTarget()
-> buildMediaTimelineSpecForAtomeHost()
-> resolveMoleculeDockHostForMediaAtome()
-> resolveGroupFromSelectedAtomes(... allowCreate: true)
-> buildMtrackGroupTimelinePayload()
-> buildMtrackMediaAtomeTimelinePayload()
-> buildImportedMtraxTimeline()
-> applyMtrackPanelOpen()
-> window.eveMtrackApi.loadGroupTimeline()
-> apiLoadGroupTimeline()
-> loadTimelineDescriptors()
-> createMediaElementFromDescriptor()
-> syncMtraxRendererTimeline()
-> updatePlaybackFrame()
-> open/dock panel finalization
```

Project media render:

```txt
Atome render
-> tool_genesis media branch
-> ensureMoleculeMediaRuntime()
-> MoleculeApi.mountVisual()
-> engine.getSession(id) || engine.createSession({ id })
-> session.mount(canvas)
-> probeMediaDuration()
-> session.setTimeline(single clip timeline)
-> session.prepare()
-> audio.loadAsset() or video element creation
-> session.renderFrame()
```

Legacy Molecule group runtime:

```txt
installMoleculeGroupTimelineRuntime().openGroupTimeline()
-> buildTimelineFromSteps()
-> projectStore.saveTimeline()
-> createMoleculeSession()
-> openMoleculePanel()
-> sessionsByGroup.set()
```

### 3. Objets créés

* `MoleculeEngine` singleton in `eVe/core/media_engine/molecule.js`.
* `MoleculeSession` media-engine sessions in `eVe/core/media_engine/molecule.js`.
* `MoleculeNativeAudio` per media-engine session.
* `MoleculeWebGpuRenderer` per media-engine session.
* Hidden video raster pool `[data-role="molecule-video-raster-pool"]`.
* Per-clip HTML video elements for media-engine video clips.
* Per-session runtime maps: `runtimeClips`, `voiceState`.
* MTraX panel DOM `eve_mtrack_dialog`.
* MTraX global mutable runtime state: `activeGroupId`, `tracks`, `clips`, `playhead`, renderer/audio state.
* MTraX renderer runtime via `ensureMtraxRendererRuntime()`.
* Hmtracks/native audio runtime via MTraX audio-engine sync/prewarm paths.
* Legacy tool Molecule sessions from `eVe/intuition/tools/molecule/session/session.js`.
* Legacy Molecule panels from `eVe/intuition/tools/molecule/panel`.

### 4. États modifiés

* `window.Molecule`, `window.Molecule.engine`, `window.Molecule.api`, `window.Molecule.media`.
* `window.eveMediaApi`.
* `window.eveMtrackApi`.
* `mtrackState.groupTimelineLoadSeq`, used as a stale-load guard.
* `mtrackState.activeGroupId`, `activeGroupLabel`, `activeGroupSteps`, `activeTimelineSeed`.
* `mtrackState.tracks`, `clips`, `selectedTrackIds`, `selectedClipIds`, `playhead`, `maxTime`.
* MTraX audio state: `hmtracksAudioRate`, `hmtracksAudioLoop`, audio session fingerprints.
* MTraX renderer state through `syncMtraxRendererTimeline()` and `updatePlaybackFrame()`.
* Atome footer state during docked/open MTraX flows.
* Project timeline persistence through `scheduleActiveGroupTimelinePersist()` or `projectStore.saveTimeline()`.

### 5. Sources de vérité observées

* Media-engine Molecule source of truth: `MoleculeEngine.sessions` keyed by session id.
* Media API binding source of truth: `MoleculeApi.assetBindings`.
* MTraX runtime source of truth: mutable `mtrackState`.
* Persisted MTraX source: atome properties `group_timeline`, `mtrax_timeline`, rev/hash/loop/markers.
* Legacy tool Molecule source: `createMoleculeSession()` closure state plus registry maps.
* Project store/event store source for the newer `eVe/intuition/tools/molecule` runtime.

### 6. Routes concurrentes

* `eVe/core/media_engine/molecule.js` owns a `MoleculeSession` class and global `window.Molecule.createSession`.
* `eVe/intuition/tools/molecule/session/session.js` owns another `createMoleculeSession()` implementation.
* MTraX opening does not call either central media-engine `createSession()` or legacy tool registry session factory; it hydrates `mtrackState` directly through `apiLoadGroupTimeline()`.
* Media atome rendering creates media-engine sessions independently from MTraX opening.
* Opening the same media atome as a project visual and as MTraX can therefore involve both a media-engine session and a separate MTraX runtime timeline.
* MTraX direct open can create/wrap a group target through `resolveGroupFromSelectedAtomes(... allowCreate: true)` before timeline load is proven complete.
* `window.Molecule.execute({ command: 'createSession' })` remains a direct low-level session route.

### 7. Appels async critiques

* `requestMtrackOpenForAtome()` returns `openGroupTimelineThroughMtrack()` or `invokeTool()`.
* `openGroupTimelineThroughMtrack()` runs under `mtraxGroupOpenLock.run(groupId, runOpen)`.
* `buildMtrackGroupTimelinePayload()` reads persisted state and media specs asynchronously.
* `apiLoadGroupTimeline()` increments `groupTimelineLoadSeq` and uses `isCurrentTimelineLoad()` to ignore stale descriptor hydration.
* `createMediaElementFromDescriptor()` is awaited during timeline load and can create media nodes/resources.
* `syncMtraxRendererTimeline()` and `updatePlaybackFrame()` run after runtime state mutation.
* Media-engine `mountVisual()` awaits `session.mount()`, `probeMediaDuration()`, `session.setTimeline()`.
* Media-engine `session.prepare()` awaits audio asset loading and video element metadata.
* Media-engine video audio extraction is lazy in `#ensureVideoAudioAsset()`.
* Panel close awaits persistence flush, capture stop, preview export, renderer dispose, and then dispatches `eve:mtrack-panel-closed`.

### 8. Dépendances UI/runtime/audio/WebGPU

* UI: atome double-click runtime, Atome edit footer, MTraX panel open/close, dock controller, panel layer contract.
* Runtime: `mtrackState`, `window.eveMtrackApi`, `window.Molecule`, `window.eveMediaApi`, group timeline API.
* Audio: media-engine `MoleculeNativeAudio` -> `getPlayRecordCore(window)`; MTraX uses Hmtracks/native audio engine sync/prewarm/play paths.
* WebGPU: media-engine `MoleculeWebGpuRenderer`; MTraX renderer runtime via `syncMtraxRendererTimeline()` and renderer state APIs.
* Persistence/history: Atome commit for media-engine command history when `historyAtomeId` exists; MTraX atome timeline props; Molecule tool event store append-only events.

### 9. Créations partielles possibles

* `MoleculeEngine.createSession()` registers the session before `mount()`, `setTimeline()`, audio init, renderer init, or media preparation.
* `MoleculeApi.mountVisual()` creates or reuses a session and mounts before duration probe and timeline preparation can fail.
* Media-engine `setTimeline()` assigns `this.timeline` before `prepare()` can fail; failed `prepare()` can leave a session with updated timeline and partial runtime clips.
* `#prepareClip()` can create video DOM and load metadata before later clips fail; there is no transaction rollback around the whole timeline.
* `#ensureVideoAudioAsset()` catches load failure and clears audio source, which makes video audio failure observable only indirectly.
* `openGroupTimelineThroughMtrack()` can open the panel optimistically before payload load or `api.loadGroupTimeline()` completes; it tries to close on failure, but group creation/wrapping may already have occurred.
* `apiLoadGroupTimeline()` mutates `mtrackState` progressively: stop/reset, clear clips, set tracks, create media payloads, push clips, then commit active group. Stale-load guard exists, but the function is not transactionally staged until final commit.
* Panel close deactivates active group before persistence and preview export finish.

### 10. Doubles créations possibles pour une intention

* A media atome can be rendered through `MoleculeApi.mountVisual()` and opened through MTraX, producing two independent runtime representations.
* A direct atome double-click on media calls `openGroupTimelineThroughMtrack()` directly, while non-direct tool invocation remains another path to the same open function.
* `resolveMoleculeDockHostForMediaAtome()` can create or resolve a group target for a single media atome before MTraX timeline load success is guaranteed.
* `MoleculeApi.mountVisual()` uses `engine.getSession(id) || engine.createSession({ id })`, while direct `window.Molecule.execute(createSession)` can also create a session for the same logical id if invoked separately.
* Legacy `installMoleculeGroupTimelineRuntime()` creates `createMoleculeSession()` sessions independently from the current MTraX open flow and from `MoleculeEngine`.

Conclusion Phase 1:

* La factory centrale cible `createMoleculeSession(request)` n'est pas encore l'unique point d'entrée réel.
* Le pipeline réel est partagé entre au moins trois systèmes: media-engine Molecule, MTraX runtime, and `eVe/intuition/tools/molecule/session`.
* Le prochain point à traiter est la Phase 2: ajouter une instrumentation temporaire minimale `TEMP_DEBUG_MOLECULE` aux bifurcations critiques observées ci-dessus, sans corriger encore le comportement.

## Phase 2 — Instrumentation — TRAITÉE

Statut: traité le 2026-05-27.

Instrumentation temporaire ajoutée:

* `eVe/intuition/eVeIntuition.js`
  * `requestMtrackOpenForAtome()`: génération et propagation de `molecule_creation_id` pour l'ouverture atome -> MTraX.
  * `openGroupTimelineThroughMtrack()`: trace `requested`, `validating_source`, erreurs de payload/API/load, puis `ready`.
* `eVe/domains/mtrax/timeline/group_timeline_load_runtime.js`
  * `apiLoadGroupTimeline()`: trace `creating_session`, `validating_source`, `binding_transport`, `creating_timeline`, `attaching_media`, `initializing_renderer`, `ready`.
* `eVe/domains/mtrax/ui/panel_lifecycle_runtime.js`
  * `open_mtrack_panel()`: trace d'ouverture panel/renderer.
  * `close_mtrack_panel()`: trace `rollback` puis `disposed`.
* `eVe/core/media_engine/molecule.api.js`
  * `mountVisual()`: trace validation, session créée/réutilisée, renderer monté, timeline prête.
* `eVe/core/media_engine/molecule.js`
  * `MoleculeSession` / `MoleculeEngine`: trace création, mount renderer, timeline, media attach, dispose, unregister.
* `eVe/intuition/tools/molecule/session/session.js`
  * `createMoleculeSession()`: trace création et dispose de la factory legacy Molecule.
* `eVe/intuition/tools/molecule/session/registry.js`, `runtime.js`, `multi_instance/index.js`
  * Propagation de `molecule_creation_id` quand disponible.

Format appliqué:

```txt
TEMP_DEBUG_MOLECULE {
  creation_id,
  source,
  step,
  file,
  function,
  molecule_id,
  timeline_id,
  renderer_state,
  audio_state,
  transport_state,
  timestamp,
  status,
  error
}
```

Validations exécutées:

* `node --check eVe/core/media_engine/molecule.js` — OK.
* `node --check eVe/core/media_engine/molecule.api.js` — OK.
* `node --check eVe/intuition/eVeIntuition.js` — OK.
* `node --check eVe/domains/mtrax/timeline/group_timeline_load_runtime.js` — OK.
* `node --check eVe/domains/mtrax/ui/panel_lifecycle_runtime.js` — OK.
* `node --check eVe/intuition/tools/molecule/session/session.js` — OK.
* `node --check eVe/intuition/tools/molecule/session/registry.js` — OK.
* `node --check eVe/intuition/tools/molecule/runtime.js` — OK.
* `node --check eVe/intuition/tools/molecule/multi_instance/index.js` — OK.
* `npm run check:syntax` — OK.
* `npm run check:m0` — OK.
* `npm run test:molecule` — BLOQUÉ: le script référence `eVe/tests/molecule/run_molecule_tests.mjs`, absent du checkout courant.

Remarque stricte:

* Les logs `TEMP_DEBUG_MOLECULE` sont temporaires et devront être supprimés après l'isolation et la correction de la cause racine.
* Plusieurs fichiers touchés sont déjà au-dessus des seuils de taille définis par `.codex/AGENTS.md`; cette instrumentation est volontairement minimale et devra disparaître en Phase 5.

## Phase 3 — Reproduction — TRAITÉE

Statut: traité le 2026-05-27.

Reproductions exécutées:

* `tests/probes/media_fixture_import_playback_probe.test.mjs` — OK après exécution Playwright hors sandbox; import et playback média valides, sans requête média brute fautive.
* `tests/probes/molecule_open_raw_media_request_probe.test.mjs` — OK avec le compte de test `55555556`; import/ouverture `Vampire.m4v`, panneau visible, clips vidéo/audio présents, aucune requête brute vers le média.
* Probe temporaire ciblé `temp/molecule_partial_session_probe.mjs` — reproduction de la création partielle sur échec WebGPU:
  * avant correction: `before_sessions: 0`, puis `after_sessions: 2` après deux appels `mountVisual()` échoués;
  * erreur observée: `Unable to acquire a WebGPU adapter`;
  * état résiduel: sessions Molecule enregistrées malgré l'échec d'initialisation renderer.

Résultat:

* Le bug reproductible est une session Molecule partielle conservée après échec de `mountVisual()`.

## Phase 4 — Isolation cause racine — TRAITÉE

Statut: traité le 2026-05-27.

Cause racine isolée:

* `MoleculeApi.mountVisual()` créait/enregistrait une session via `engine.createSession({ id })` avant que le renderer WebGPU, le média, la durée et la timeline soient complètement prêts.
* Si `session.mount()` échouait pendant l'acquisition WebGPU, aucune transaction ne supprimait la session nouvellement créée.
* `MoleculeSession.dispose()` pouvait lui-même échouer sur une session jamais montée, car le chemin de stop/render passait par `renderFrame()` avec un renderer non monté.

Conclusion:

* La création n'était pas transactionnelle sur la route `mountVisual()`.
* L'échec WebGPU laissait une session fantôme dans `engine.sessions`.

## Phase 5 — Correction et nettoyage TEMP_DEBUG — TRAITÉE

Statut: traité le 2026-05-27.

Corrections appliquées:

* `eVe/core/media_engine/molecule.api.js`
  * `mountVisual()` est maintenant transactionnel pour les créations nouvelles.
  * En cas d'échec, le binding ajouté, la session créée et le noeud de mount créé sont supprimés.
  * Les bindings/sessions préexistants ne sont pas supprimés aveuglément.
* `eVe/core/media_engine/molecule.js`
  * `MoleculeSession.dispose()` ne passe plus par le chemin `stop()`/`renderFrame()` quand le renderer n'a jamais été monté.
  * Le dispose d'une session partiellement initialisée nettoie transport, voix, vidéos, boucle RAF, clips runtime et renderer.
* `tests/probes/molecule_mount_visual_transaction.test.mjs`
  * Test de régression permanent ajouté.
  * Vérifie qu'un échec WebGPU de `mountVisual()` ne laisse ni session, ni binding asset.

Nettoyage appliqué:

* Toute l'instrumentation temporaire `TEMP_DEBUG_MOLECULE` ajoutée en Phase 2 a été supprimée du code.
* Le probe temporaire `temp/molecule_partial_session_probe.mjs` et son rapport temporaire ont été supprimés.

Validation ciblée après correction:

* Probe temporaire avant suppression — OK:
  * `before_sessions: 0`;
  * `after_sessions: 0`;
  * `session_exists_after_failure: false`;
  * `second_session_exists_after_failure: false`.

Validations finales:

* `node tests/probes/molecule_mount_visual_transaction.test.mjs` — OK.
* `node --check` sur les fichiers Molecule/MTraX touchés — OK.
* `rg TEMP_DEBUG_MOLECULE/createTempDebugMoleculeCreationId/logTempDebugMolecule eVe tests` — OK, aucune instrumentation temporaire restante dans le code ou les tests.
* `npm run check:syntax` — OK.
* `npm run check:m0` — OK.
* `npm run test:molecule` — BLOQUÉ: `eVe/tests/molecule/run_molecule_tests.mjs` est absent du checkout courant.
