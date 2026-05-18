# Molecule - Architecture, cahier des charges et plan de reconstruction

Date: 2026-04-19
Statut: PLAN FONDATEUR
Portee: remplacement progressif de MTraX/M-Track par un moteur propre nomme `molecule`.

## 1) Decision

`molecule` remplace progressivement le M-Track actuel.

La strategie retenue est un strangler strict:

1. Le M-Track actuel reste en place comme legacy.
2. `molecule` est construit dans un nouveau perimetre isole.
3. Aucun runtime `molecule` ne doit importer l etat mutable global du M-Track actuel.
4. Les donnees existantes peuvent etre lues via un importeur explicite, jamais via un fallback runtime.
5. Les nouveaux bugs doivent etre bloques par contrats, tests et scripts de verification, pas par discipline manuelle.
6. Une fois `molecule` completement valide et migre, tout le code M-Track legacy doit etre supprime du repo.

## 2) Problemes a resoudre

### 2.1 Defauts structurels M-Track

1. Etat runtime global partage entre timelines.
2. Confusion entre plusieurs instances M-Track ouvertes.
3. Melange entre modele, DOM, media, audio, WebGPU, persistence et gestures.
4. Fallbacks silencieux entre browser, iOS, Tauri, Fastify, WebSocket, HTTP, media HTML et moteur natif.
5. Placement de panneau non ancre de maniere fiable a l atome cible.
6. Drag/resize non deterministes car le DOM et le modele sont modifies pendant les gestes.
7. Difficultes previsibles pour recording, multi-instance et nesting si le modele actuel est conserve.

Conclusion: le probleme n est pas local. Continuer par patchs augmente le risque.

### 2.2 Probleme global eVe: persistence Atome iOS

La persistance Atome non deterministe sur iOS est un probleme global eVe.

Elle ne concerne pas seulement M-Track et ne doit pas etre diagnostiquee comme un bug Molecule. `molecule` depend de cette persistence, donc le sujet doit etre traite avant ou en parallele, mais comme un chantier de socle Atome/project store.

Impact:

1. Les atomes poses sur le bureau iOS peuvent disparaitre apres reload.
2. Les positions, tailles et mutations peuvent diverger entre browser, iOS et Tauri.
3. Une timeline Molecule fiable est impossible si les atomes sources ne sont pas persistants.

Current status 2026-04-19:

1. The first task, `atome restoration fail on iOS`, is now accomplished for the mandatory project-atome restore scenario on iOS.
2. A remaining restore regression was identified in the text hydration path: the initial host bind auto-fit could overwrite persisted width and height with measured content size during reload.
3. The restore path now preserves persisted text frames during host binding and keeps auto-fit for active text editing only.
4. A second restore regression in matrix project switching was fixed: reopening a previously dezoomed project now restores the saved project view style before scene-dezoom cleanup, preventing stale `scale: 0.3` from shrinking rendered atomes and corrupting drag geometry.

## 3) Objectifs produit

`molecule` doit fournir:

1. Un editeur timeline audio/video/atome fiable.
2. Une persistence timeline stable sur browser, iOS et Tauri, appuyee sur une persistence Atome globale fiable.
3. Une edition non destructive des clips.
4. Un moteur multi-instance: plusieurs timelines ouvertes sans collision.
5. Un modele compatible avec des timelines imbriquees.
6. Une base saine pour ajouter recording.
7. Une base saine pour ajouter export et automation.
8. Une architecture testable hors DOM.
9. Une persistence media fiable, avec assets runtime prepares des l import.
10. Un historique precis de toutes les operations Molecule, compatible Atome Time Machine.

## 4) Carte des capacites a prevoir

Cette section n est pas un tri MVP. Elle liste les capacites que l architecture doit prevoir des le depart pour eviter les verrous.

### 4.1 Timeline et edition

1. Tracks.
2. Lanes.
3. Clips.
4. Split.
5. Trim in/out.
6. Crop source.
7. Move temporel.
8. Changement de piste.
9. Copy.
10. Paste.
11. Duplicate.
12. Delete.
13. Group clips.
14. Ungroup clips.
15. Snap.
16. Quantize.
17. Loop range.
18. Selection multiple.
19. Undo.
20. Redo.

### 4.2 Types de media et sources

1. Audio.
2. Video.
3. Image.
4. Text.
5. Shape.
6. Group.
7. Atome source.
8. Molecule nested.
9. External file.
10. Imported batch.
11. Generated media.
12. Recorded media.

### 4.3 Tracks mono-type et multi-type

L architecture doit prevoir:

1. Tracks audio-only.
2. Tracks video-only.
3. Tracks text-only.
4. Tracks mixed media.
5. Plusieurs types de media sur une meme track si le mode track l autorise.
6. Politique explicite de compatibilite clip/track.
7. Routing audio.
8. Z-order video.
9. Visibility.
10. Mute.
11. Solo.
12. Lock.
13. Arm recording.

### 4.4 Cells, scenes et performance live

L architecture doit prevoir:

1. Cells.
2. Scenes.
3. Clip launcher.
4. One-shot.
5. Loop cell.
6. Follow action.
7. Follow action chains.
8. Launch quantization.
9. Stop action.
10. Cell state persistence.

### 4.5 Transitions et fades

L architecture doit prevoir:

1. Cut.
2. Fade in.
3. Fade out.
4. Crossfade audio.
5. Crossfade video.
6. Overlap.
7. Transition object.
8. Transition automation.
9. Transition persistence.

### 4.6 Import et preparation media

L architecture doit prevoir:

1. Import simple.
2. Import batch.
3. Import split.
4. Probe media.
5. Conversion immediate.
6. Generation proxy.
7. Generation waveform.
8. Generation thumbnail.
9. Creation Atome source.
10. Creation MediaRef.
11. Historique complet de l import.

### 4.7 Automation et parametres

L architecture doit prevoir:

1. Automation volume.
2. Automation opacity.
3. Automation transform.
4. Automation pan.
5. Automation effect params.
6. Keyframes.
7. Curves.
8. Step automation.
9. Linear automation.
10. Bezier automation.

### 4.8 Playback et transport

L architecture doit prevoir:

1. Play.
2. Pause.
3. Stop.
4. Seek.
5. Scrub.
6. Loop.
7. Rate.
8. Audio/video sync.
9. Native Kira path.
10. WebGPU/canvas preview path.
11. Deterministic playhead.

### 4.9 Recording

L architecture doit prevoir:

1. Audio recording.
2. Video recording.
3. Overdub.
4. Takes.
5. Commit recording.
6. Cancel recording.
7. Recording media import pipeline.

### 4.10 Persistence et historique

L architecture doit prevoir:

1. Event journal append-only.
2. Snapshot acceleration.
3. Replay deterministic.
4. Gesture coalescing.
5. Transaction boundaries.
6. Branching future.
7. Undo/redo.
8. Audit trail.
9. Media import events.
10. Timeline operation events.

## 5) Non-objectifs immediats

Ces sujets sont exclus de la premiere livraison:

1. Recording complet.
2. Timelines imbriquees en production.
3. Export final.
4. Effets avances.
5. Migration automatique totale de tous les anciens projets.
6. Refonte complete d Atome/eVe.

Ils ne doivent pas etre ajoutes avant que les contrats de base soient verts.

## 6) Regles anti-fallback non negociables

Ces regles sont obligatoires dans `molecule`, `project_store` et les chemins de persistance Atome.

Regle absolue: aucun fallback runtime. Si le backend canonique echoue, l operation echoue avec une erreur typee et visible. On corrige la cause, on ne contourne pas.

1. Aucun fallback silencieux.
2. Aucune mutation ecrite dans deux backends en meme temps.
3. Aucune lecture dans un backend different du backend canonique d ecriture.
4. Aucun `try A puis B` dans le coeur metier.
5. Aucun import direct d un module legacy pour continuer une operation v2.
6. Aucun chemin media alternatif choisi pendant la lecture.
7. Aucun etat global `activeTimeline`, `activeGroupId`, `currentClips` partage entre instances.
8. Toute capacite absente doit produire une erreur typee.
9. Aucun mode degrade runtime n est autorise dans le coeur produit.
10. Les seuls choix de plateforme autorises sont faits au boot par un adapter declare.
11. Une operation Molecule non historisee est invalide.
12. Un media importe sans MediaRef canonique et assets runtime prepares est invalide.

Regles de qualite absolues:

1. Pas de rustine.
2. Toute nouvelle fonctionnalite doit etre creee dans un fichier/module dedie ou dans le module responsable existant, jamais dispersee dans un fichier global sans raison d architecture.
3. Chaque etape doit avoir une verification explicite: check syntaxique, test automatise, probe ciblee ou log diagnostic temporaire selon le cas.
4. Toute nouvelle fonction doit avoir une responsabilite unique et un contrat d entree/sortie clair.
5. Le code non maintenable est invalide meme s il corrige le symptome.

## 7) Application mecanique des regles anti-fallback

La regle ne doit pas dependre de la memoire du developpeur.

Taches obligatoires:

1. Ajouter un script `check_no_fallbacks`.
2. Bloquer les patterns interdits dans les dossiers critiques.
3. Bloquer les exceptions dans le coeur Molecule.
4. Ajouter une review checklist dans la documentation.
5. Ajouter des tests de contrat qui echouent si deux environnements divergent.

Patterns interdits par defaut dans `molecule`:

```text
fallback
legacy
mirror
requestWithWsFallback
catch (_) {}
catch (e) {}
trySecondary
useFastifyIf
useHttpIf
activeGroupId
window.__MTRACK
```

Cas hors coeur Molecule:

1. Fichiers de migration explicites.
2. Adapters de plateforme declares.
3. Tests qui verifient que les fallbacks sont bien interdits.

Ces cas ne sont pas des exceptions runtime Molecule. Ils sont hors coeur metier et doivent rester separes. Ils ne peuvent jamais servir de chemin de secours pendant une operation utilisateur.

## 8) Architecture cible

`molecule` est decoupe en couches strictes.

### 8.1 ProjectStore

Responsabilite:

1. Charger un projet.
2. Persister les atomes.
3. Persister les timelines `molecule`.
4. Fournir une API identique browser/iOS/Tauri.

Interdictions:

1. Pas de miroir automatique.
2. Pas de stockage anonyme no-op.
3. Pas de relecture dans une source non canonique.

API minimale:

```ts
loadProject(projectId): ProjectSnapshot
createAtome(projectId, payload): MutationResult
updateAtome(projectId, atomeId, patch): MutationResult
deleteAtome(projectId, atomeId): MutationResult
loadTimeline(projectId, timelineId): MoleculeTimeline
saveTimeline(projectId, timeline): MutationResult
```

### 8.2 EventStore

Responsabilite:

1. Enregistrer chaque mutation durable en append-only.
2. Fournir la base de replay pour Atome Time Machine.
3. Coalescer les interactions continues aux frontieres de geste.
4. Garantir que `state_current` est une projection, pas la source de verite.

Regle:

```text
Toute mutation durable Molecule = event append-only.
```

### 8.3 MediaStore

Responsabilite:

1. Stocker l asset original immuable.
2. Stocker les assets runtime prepares.
3. Produire un `MediaRef` stable.
4. Garantir que Molecule ne depend pas d un node HTML.

Regle:

```text
Import media valide = original_asset + runtime_assets + MediaRef + events.
```

### 8.4 MoleculeKernel

Responsabilite:

1. Contenir le modele pur.
2. Appliquer les operations de timeline.
3. Retourner un nouvel etat valide.
4. Ne jamais toucher DOM, audio, WebGPU ou backend.

Operations minimales:

```ts
addTrack(state, command)
removeTrack(state, command)
addClip(state, command)
moveClip(state, command)
resizeClip(state, command)
splitClip(state, command)
deleteClip(state, command)
setPlayhead(state, command)
```

### 8.5 MoleculeSession

Responsabilite:

1. Representer une instance ouverte d une timeline.
2. Contenir son etat runtime non persistant.
3. Connecter kernel, renderer, media et transport.

Regle:

```text
1 timelineId = 1 MoleculeSession
2 timelines ouvertes = 2 MoleculeSession independantes
```

### 8.6 Renderer

Responsabilite:

1. Afficher l etat.
2. Declarer les interactions utilisateur.
3. Ne jamais posseder la verite du modele.

Regle:

```text
DOM = projection de l etat.
DOM != source de verite.
```

### 8.7 PlatformAdapters

Responsabilite:

1. Choisir les implementations au boot.
2. Fournir les ports media, audio, fichier, persistence.
3. Echouer explicitement si une capacite manque.

Adapters cibles:

1. `browserAdapter`
2. `tauriDesktopAdapter`
3. `tauriIosAdapter`
4. `nativeAudioAdapter`
5. `webAudioAdapter`

## 9) Modele de donnees canonique

### 9.1 MoleculeTimeline

```json
{
  "schema": "eve.molecule.timeline",
  "schema_version": 1,
  "timeline_id": "mol_tl_001",
  "project_id": "project_001",
  "owner_atome_id": "atome_001",
  "timebase": {
    "fps": 30,
    "ticks_per_second": 30000
  },
  "duration_seconds": 60,
  "tracks": [],
  "clips": [],
  "transport": {
    "playhead_seconds": 0,
    "loop": {
      "enabled": false,
      "start_seconds": 0,
      "end_seconds": 0
    },
    "rate": 1
  },
  "meta": {
    "created_at": "2026-04-19T00:00:00Z",
    "updated_at": "2026-04-19T00:00:00Z"
  }
}
```

### 9.2 Track

```json
{
  "track_id": "trk_001",
  "kind": "video",
  "name": "V1",
  "order": 10,
  "locked": false,
  "muted": false,
  "visible": true
}
```

### 9.3 Clip

```json
{
  "clip_id": "clip_001",
  "track_id": "trk_001",
  "kind": "video",
  "source": {
    "type": "atome",
    "atome_id": "video_001",
    "media_ref": "media_001"
  },
  "timeline": {
    "start_seconds": 4,
    "duration_seconds": 6,
    "source_in_seconds": 0,
    "source_out_seconds": 6
  },
  "presentation": {
    "gain": 1,
    "opacity": 1,
    "transform": {
      "x": 0,
      "y": 0,
      "scale_x": 1,
      "scale_y": 1,
      "rotation_deg": 0
    }
  }
}
```

### 9.4 MediaRef

```json
{
  "media_ref": "media_001",
  "source_atome_id": "video_001",
  "original_asset_id": "asset_original_001",
  "runtime_assets": {
    "audio_kira": "asset_audio_kira_001",
    "video_gpu": "asset_video_gpu_001",
    "thumbnail": "asset_thumb_001",
    "waveform": "asset_waveform_001"
  },
  "probe": {
    "duration_seconds": 12.4,
    "has_audio": true,
    "has_video": true,
    "width": 1920,
    "height": 1080,
    "sample_rate": 48000
  }
}
```

### 9.5 Objets HTML importes vs projection canvas Molecule

Question ouverte:

```text
Lors de l import d un media, doit-on conserver des objets HTML comme representation active, ou convertir directement vers une representation canvas/WebGPU Molecule?
```

Decision provisoire:

1. Les atomes de bureau restent des objets eVe/Atome semantiques.
2. Leur renderer peut rester HTML si c est le renderer courant du bureau.
3. Molecule ne doit jamais utiliser le node HTML comme source de verite.
4. Molecule doit importer une source sous forme de `MediaRef` ou `AtomeRef`.
5. Le rendu timeline Molecule doit etre une projection controlee par Molecule, idealement canvas/WebGPU.
6. Un element HTML media peut exister comme detail d implementation d un adapter, mais il ne doit pas etre persiste ni manipule comme modele.

Architecture cible:

```text
Import media -> Atome source persiste + MediaRef canonique
Atome source -> visible sur bureau via renderer eVe
Molecule clip -> reference AtomeRef/MediaRef
Molecule renderer -> canvas/WebGPU projection
```

Interdictions:

1. Ne pas glisser un node HTML existant dans la timeline comme etat.
2. Ne pas persister `element`, `videoNode`, `audioNode`, `canvasNode` ou reference DOM.
3. Ne pas laisser le DOM decider la duree, le crop, la piste ou la position.
4. Ne pas avoir un chemin "HTML clip" et un chemin "canvas clip" qui coexistent comme fallbacks.

Etude a mener:

1. Lister les types d atomes importables: video, audio, image, text, shape, group.
2. Pour chaque type, definir la source canonique: `MediaRef`, `AtomeRef`, `MoleculeRef` ou snapshot.
3. Mesurer si le rendu timeline doit etre canvas 2D, WebGPU ou hybride.
4. Verifier les contraintes iOS: autoplay, decode, seek, file path, texture upload.
5. Definir si le bureau garde HTML pendant que Molecule rend en canvas/WebGPU.
6. Definir comment synchroniser un atome source modifie avec ses clips Molecule.
7. Ajouter un test qui prouve qu aucun node HTML n est persiste dans une timeline.

Critere de sortie:

```text
Un media importe cree un Atome source persistant et un MediaRef canonique; Molecule affiche ce media sans utiliser le node HTML du bureau comme source de verite.
```

## 10) Persistance Atome globale avant Molecule

`molecule` depend d une persistance Atome fiable, mais ce chantier est global eVe.

Cette phase est obligatoire avant le coeur timeline, car elle conditionne tous les atomes sous iOS, pas seulement les clips Molecule.

Taches:

1. Cartographier les chemins actuels de creation, update, delete et reload Atome.
2. Identifier le backend canonique par environnement.
3. Supprimer les caches no-op pour les projets locaux/anonymes.
4. Garantir un `projectId` stable sur iOS.
5. Garantir que `createAtome` ne soit considere reussi qu apres confirmation de persistance.
6. Garantir que `moveAtome` et `resizeAtome` soient persistants.
7. Ajouter un test reload iOS/local.
8. Ajouter un test reload browser.
9. Ajouter un test reload Tauri desktop.
10. Verifier que les atomes media importes produisent un Atome source persistant et un MediaRef stable.

Critere de sortie:

```text
Un atome cree, deplace, recharge, retrouve le meme id et la meme position sur browser, iOS et Tauri.
```

## 11) Import media canonique et conversion immediate

L import media est une priorite de socle.

Decision:

1. Un media importe doit etre stocke comme original immuable.
2. Les assets runtime doivent etre prepares immediatement.
3. Molecule ne doit pas attendre le moment du playback pour convertir un media.
4. Un media partiellement importe n est pas valide.
5. Le HTML ne doit jamais etre la representation canonique d un media Molecule.

Pipeline obligatoire:

```text
media.import.requested
media.file.stored
media.file.probed
media.runtime_assets.started
media.runtime_asset.created.audio_kira
media.runtime_asset.created.video_gpu
media.thumbnail.created
media.waveform.created
atome.media.created
media.import.completed
```

En cas d erreur:

```text
media.import.failed
```

Sorties minimales:

1. `original_asset`.
2. `runtime_assets`.
3. `MediaRef`.
4. `Atome source`.
5. Events append-only.

Interdictions:

1. Pas de media "valide" sans `MediaRef`.
2. Pas de media "valide" sans event `media.import.completed`.
3. Pas de conversion implicite pendant playback.
4. Pas de fallback vers HTML media si l asset runtime manque.

## 12) Historique Molecule obligatoire

Molecule suit Atome Time Machine.

Regle centrale:

```text
Toute action metier durable Molecule alimente l historique append-only.
```

Actions obligatoirement historisees:

1. `molecule.clip.split`.
2. `molecule.clip.trim.start`.
3. `molecule.clip.trim.end`.
4. `molecule.clip.crop`.
5. `molecule.clip.move`.
6. `molecule.clip.move_track`.
7. `molecule.clip.copy`.
8. `molecule.clip.paste`.
9. `molecule.clip.duplicate`.
10. `molecule.clip.delete`.
11. `molecule.clip.group`.
12. `molecule.clip.ungroup`.
13. `molecule.clip.fade_in`.
14. `molecule.clip.fade_out`.
15. `molecule.crossfade.create`.
16. `molecule.crossfade.update`.
17. `molecule.crossfade.delete`.
18. `molecule.track.create`.
19. `molecule.track.delete`.
20. `molecule.track.reorder`.
21. `molecule.track.rename`.
22. `molecule.track.mute`.
23. `molecule.track.solo`.
24. `molecule.track.lock`.
25. `molecule.track.arm`.
26. `molecule.cell.create`.
27. `molecule.cell.launch`.
28. `molecule.cell.stop`.
29. `molecule.cell.follow_action.set`.
30. `molecule.cell.follow_action.clear`.
31. `molecule.media.import`.
32. `molecule.media.convert`.
33. `molecule.media.replace`.
34. `molecule.automation.keyframe.add`.
35. `molecule.automation.keyframe.update`.
36. `molecule.automation.keyframe.delete`.
37. `molecule.recording.start`.
38. `molecule.recording.stop`.
39. `molecule.recording.commit`.
40. `molecule.recording.cancel`.

Classes d historique:

1. `persistent`: mutation durable historisee.
2. `continuous`: interaction continue coalescee a `gesture.end`.
3. `ephemeral`: etat UI temporaire non persiste.

Exemple split:

```json
{
  "event_type": "molecule.clip.split",
  "history_class": "persistent",
  "tx_id": "tx_123",
  "project_id": "project_001",
  "timeline_id": "mol_tl_001",
  "clip_id": "clip_001",
  "at_seconds": 12.4,
  "result_clip_ids": ["clip_001_a", "clip_001_b"]
}
```

Exemple drag coalesce:

```text
molecule.clip.move.started
molecule.clip.move.previewed
molecule.clip.move.previewed
molecule.clip.move.committed
```

Seul `committed` modifie l etat durable. Les previews sont ephemeral ou continuous selon la politique de debug.

## 13) Plan de reconstruction

### Phase M0 - Gel et garde-fous

Statut: DONE 2026-04-21.

Objectif: empecher le legacy de contaminer `molecule`.

Taches:

1. [DONE] Declarer le M-Track actuel comme `legacy`.
2. [DONE] Ajouter le document courant comme source de verite.
3. [DONE] Ajouter `check_no_fallbacks` (`tools/check_no_fallbacks.mjs`, `npm run check:no-fallbacks`).
4. [DONE] Ajouter un blocage strict sans liste d exceptions (guardrail `tools/check_molecule_guardrails.mjs` sans whitelist).
5. [DONE] Ajouter une CI locale minimale pour executer les tests de contrat (`npm run check:m0`).
6. [DONE] Bloquer les imports legacy depuis `molecule` (pattern `mtrack_dependency_forbidden`).
7. [DONE] Bloquer toute operation Molecule non historisee (contrat event_store + media_store append-only).
8. [DONE] Bloquer tout import media sans MediaRef canonique (media_store refuse un import incomplet).

Livrable:

```text
Le repo refuse les nouveaux fallbacks dans le perimetre Molecule.
```

Verifications:

```text
npm run check:m0 -> check_no_fallbacks OK + Molecule guardrails OK
```

### Phase M1 - ProjectStore, EventStore et MediaStore canoniques

Statut: CORE DONE 2026-04-21. Wirings plateforme (taches 5-8) a faire en sous-phases dediees.

Objectif: stabiliser les donnees, les medias et l historique avant la timeline.

Taches:

1. [DONE] Creer un module `project_store` (`src/application/eVe/core/project_store/`).
2. [DONE] Creer un module `event_store` (`src/application/eVe/core/event_store/`).
3. [DONE] Creer un module `media_store` (`src/application/eVe/core/media_store/`).
4. [DONE] Definir l API canonique (API figee, erreurs typees, adapter memoire de reference).
5. [TODO M1b] Brancher browser (adapter reel sur le backend canonique choisi au boot).
6. [TODO M1b] Brancher Tauri desktop.
7. [TODO M1b] Brancher iOS.
8. [TODO M1b] Supprimer ou isoler les chemins de persistence concurrents (atome_commit legacy).
9. [DONE] Ajouter tests de create/update/reload/delete (`project_store.test.mjs`).
10. [DONE] Ajouter tests event append-only/replay (`event_store.test.mjs`).
11. [DONE] Ajouter tests import media -> original + runtime assets + MediaRef (`media_store.test.mjs`).
12. [DONE] Ajouter logs d erreur types (ProjectStoreError, EventStoreError, MediaStoreError avec codes stables).

Livrable:

```text
La persistence projet/atome/media et l historique append-only sont deterministes et testes.
```

Verifications:

```text
npm run check:m1 -> check:m0 OK + molecule tests OK (3 suites: project_store, event_store, media_store)
```

### Phase M2 - MoleculeKernel

Statut: DONE 2026-04-21.

Objectif: obtenir un moteur timeline pur et testable.

Taches:

1. [DONE] Creer le dossier `src/application/eVe/intuition/tools/molecule` (sous-dossier `kernel/`).
2. [DONE] Ajouter les schemas `MoleculeTimeline`, `Track`, `Clip` (`kernel/schemas.js`).
3. [DONE] Ajouter validateurs de schema (validateTimeline/Track/Clip/ClipSource).
4. [DONE] Ajouter reducers purs pour add/move/resize/split/delete (`kernel/reducers.js`).
5. [DONE] Ajouter detection de collisions (`kernel/collisions.js`).
6. [DONE] Ajouter politique claire de collision (refus strict, pas de push silencieux).
7. [DONE] Ajouter modele `MediaRef` / `AtomeRef` sans reference DOM (CLIP_SOURCE_TYPES + rejet champs DOM).
8. [DONE] Ajouter tests unitaires sur chaque operation (`kernel.test.mjs`: schemas, overlaps, addTrack, removeTrack, addClip, moveClip, resizeClip, splitClip, deleteClip, setPlayhead, purete).

Politique de collision initiale:

1. Deux clips ne peuvent pas se chevaucher sur une meme piste sauf mode explicite.
2. Un drag invalide retourne une erreur ou une proposition refusee.
3. Aucun clip ne doit pousser silencieusement un autre clip.

Livrable:

```text
Les operations timeline sont deterministes hors DOM.
```

Verifications:

```text
npm run check:m2 -> check:m1 OK + kernel contract OK (4 suites totales)
```

### Phase M3 - MoleculeSession multi-instance

Objectif: supprimer la confusion entre timelines.

Taches:

1. Creer `MoleculeSession`.
2. Creer `MoleculeSessionRegistry`.
3. Indexer chaque session par `timelineId`.
4. Interdire les variables globales de timeline active.
5. Ajouter lifecycle open/close/dispose.
6. Ajouter tests deux timelines ouvertes.

Livrable:

```text
Deux Molecule ouvertes ne partagent aucun etat mutable.
```

### Phase M4 - UI et panel anchoring

Objectif: ouvrir le panneau au bon endroit et rendre l UI projectionnelle.

Taches:

1. Creer un panel `molecule`.
2. Exiger un `anchorAtomeId` ou `anchorRect` a l ouverture.
3. Echouer explicitement si l ancrage manque.
4. Calculer la position via un service unique.
5. Rendre tracks/clips depuis l etat.
6. Ne jamais muter le modele directement depuis un node DOM.
7. Ne jamais utiliser le node HTML du bureau comme clip timeline.
8. Ajouter tests d ancrage.

Livrable:

```text
Le panneau Molecule s ouvre sous l atome cible ou retourne une erreur explicite.
```

### Phase M4b - Panel tools SSOT

Objectif: garantir que Molecule reutilise exactement les outils canoniques du panneau, sans recreer leur code, leur design ou leur comportement.

Probleme a eviter:

1. Refaire des outils locaux.
2. Changer l interface des outils.
3. Changer le code metier des outils.
4. Changer le design.
5. Changer l ordre du footer.
6. Monter le panneau a l envers.
7. Dupliquer les definitions `tool_id`, `tool_key`, `tool_name` ou handlers.

Regle:

```text
Molecule ne cree aucun outil de footer.
Molecule demande les definitions canoniques au tool runtime existant et les affiche dans son panel.
```

Contrat de layout:

```text
panel body order = content -> controls -> tools
tools position = bas du panel
tools row role = tools
```

Contrat de sources:

1. Les definitions viennent du registry/tool runtime canonique.
2. Le rendu vient du composant de tool strip canonique.
3. L invocation passe par le gateway/tool runtime canonique.
4. Molecule ne porte que la liste ordonnee des cles attendues.

Ordre initial obligatoire:

```text
play
split
join
mtrack_loop_cells
mtrack_clone
mtrack_follow
mtrack_delete
```

Taches:

1. Extraire les cles d outils du footer dans un contrat `molecule/footer_tools_contract`.
2. Ajouter un test qui verifie l ordre exact.
3. Ajouter un test qui verifie `content -> controls -> tools`.
4. Ajouter un test qui verifie que les definitions sont resolues via le runtime canonique.
5. Ajouter un guardrail qui interdit `registerAtomeTool`, `registerUiAction`, `registerTool`, `cloneTool` et les definitions inline dans Molecule.
6. Interdire tout bouton outil hardcode dans Molecule.
7. Interdire toute copie de design outil dans Molecule.

Livrable:

```text
Double-click media -> panel Molecule -> footer en bas -> outils canoniques dans le bon ordre, sans code outil duplique.
```

### Phase M5 - Gestures drag/resize

Objectif: edition fiable.

Taches:

1. Implementer pointer down -> draft operation.
2. Pendant pointer move, produire un etat preview non persiste.
3. A pointer up, valider via kernel.
4. Commit uniquement si operation valide.
5. Annuler sans effet si operation invalide.
6. Ajouter tests drag, resize, track change, crop.

Livrable:

```text
Drag/resize ne modifient jamais directement le DOM comme source de verite.
```

### Phase M6 - MediaResolver et playback

Objectif: lecture audio/video deterministe.

Taches:

1. Definir un `MediaRef` canonique.
2. Definir un `MediaResolver` par plateforme.
3. Resoudre les paths au chargement de session.
4. Interdire les chemins alternatifs pendant la lecture.
5. Definir le role exact des elements HTML media: decoder technique autorise ou interdit selon plateforme.
6. Brancher audio browser.
7. Brancher audio iOS/Tauri natif.
8. Brancher preview video canvas/WebGPU.
9. Ajouter tests resolution media.
10. Ajouter diagnostics typees.

Livrable:

```text
Une source media a un chemin de lecture officiel par plateforme.
```

### Phase M7 - Persistence Molecule

Objectif: sauver et relire une timeline.

Taches:

1. Persister `MoleculeTimeline` via `ProjectStore`.
2. Commit sur operation valide.
3. Debounce uniquement au niveau persistence, pas au niveau modele.
4. Ajouter reload timeline.
5. Ajouter migration minimale depuis M-Track legacy.
6. Ajouter tests reload.

Livrable:

```text
Une timeline editee puis rechargee conserve tracks, clips, crops et positions.
```

### Phase M8 - Multi-instance en production

Objectif: plusieurs Molecule simultanees.

Taches:

1. Ouvrir deux atomes avec deux timelines.
2. Modifier timeline A sans toucher B.
3. Lire A sans modifier transport B.
4. Fermer A sans detruire B.
5. Reload projet avec A et B.

Livrable:

```text
Deux Molecule ouvertes sont independantes en UI, modele, audio et persistence.
```

### Phase M9 - Recording

Objectif: ajouter l enregistrement apres stabilite.

Prerequis:

1. ProjectStore stable.
2. MediaResolver stable.
3. Session stable.
4. Timeline persistence stable.

Taches:

1. Definir `RecordingSession`.
2. Definir format de capture.
3. Creer media ref apres capture confirmee.
4. Ajouter clip depuis media ref.
5. Ajouter tests record -> persist -> reload.

### Phase M10 - Nested Molecule

Objectif: Molecule dans Molecule.

Prerequis:

1. Multi-instance stable.
2. Persistence timeline stable.
3. Media/session lifecycle stable.

Taches:

1. Ajouter clip source `type: molecule`.
2. Ajouter resolution de sous-timeline.
3. Ajouter contraintes anti-cycle.
4. Ajouter render preview nested.
5. Ajouter tests nesting.

### Phase M11 - Suppression complete du legacy M-Track

Objectif: supprimer definitivement le code M-Track une fois Molecule valide.

Prerequis:

1. Molecule couvre toutes les capacites retenues.
2. Les projets existants utiles sont migres ou explicitement abandonnes.
3. Les tests Atome, media, historique, single-instance, multi-instance et nesting sont verts.
4. Aucun import runtime ne pointe encore vers `mtrack`.
5. Les utilisateurs n ont plus besoin du panneau legacy.

Taches:

1. Supprimer les fichiers runtime M-Track legacy.
2. Supprimer les tests M-Track legacy devenus inutiles.
3. Supprimer les flags de compatibilite M-Track.
4. Supprimer les adapters et bridges uniquement dedies a M-Track.
5. Supprimer la documentation legacy remplacee.
6. Conserver uniquement les docs de migration si necessaire.
7. Ajouter un guardrail qui interdit toute reintroduction de `mtrack`.

Livrable:

```text
Le repo ne contient plus de code M-Track executable; Molecule est le seul moteur timeline actif.
```

## 14) Tests de contrat obligatoires

### Atome persistence

1. Create atome -> reload -> atome present.
2. Move atome -> reload -> position identique.
3. Resize atome -> reload -> taille identique.
4. Delete atome -> reload -> absent.

### Molecule single instance

1. Open from atome -> anchored below target.
2. Add track -> persisted.
3. Add clip -> persisted.
4. Move clip -> persisted.
5. Resize clip -> persisted.
6. Reload -> identical timeline.

### Molecule multi-instance

1. Open timeline A and B.
2. Edit A -> B unchanged.
3. Play A -> B transport unchanged.
4. Close A -> B remains valid.
5. Reload project -> A and B valid.

### Media

1. Resolve video media browser.
2. Resolve video media iOS.
3. Resolve video media Tauri.
4. Resolve audio media browser.
5. Resolve audio media iOS.
6. Missing media -> typed error.
7. Imported media -> persistent Atome source + stable MediaRef.
8. Molecule timeline snapshot contains no DOM node reference.

### Historique Molecule

1. Split -> event append-only.
2. Trim -> event append-only.
3. Move -> event append-only.
4. Change track -> event append-only.
5. Delete -> event append-only.
6. Copy/paste -> events append-only.
7. Crossfade -> event append-only.
8. Cell follow action -> event append-only.
9. Gesture drag -> previews coalesced + committed durable event.
10. Replay events -> state identical.

### Partage temps reel et multi-session

Ces tests sont obligatoires a chaque phase qui touche Atome, persistence, gestures, Molecule ou media. Ils verifient que le code existant de partage et multi-session ne regresse pas.

1. Create atome/session A -> visible dans session B apres partage autorise.
2. Move atome/session A -> mouvement visible en temps reel dans session B, pendant le drag, pas seulement apres relache.
3. Resize atome/session A -> resize visible en temps reel dans session B.
4. Delete atome/session A -> suppression visible dans session B et historisee.
5. Undo/redo ou replay historique -> etat identique dans session A et session B.
6. Deux sessions locales ouvertes sur le meme projet -> mutations synchronisees sans collision.
7. Deux timelines Molecule ouvertes -> isolation des sessions, mais partage des mutations persistantes quand elles concernent le meme objet partage.
8. Une operation non partageable doit retourner une erreur typee, jamais etre ignoree silencieusement.

### Validation croisee humaine et agent

1. A chaque modification durable, Codex verifie les tests unitaires et de contrat du perimetre touche.
2. A chaque modification durable, le developpeur humain doit pouvoir verifier le scenario dans l app sans etape cachee.
3. Les scenarios critiques doivent etre listes dans le message de fin: historique, reload, partage temps reel, multi-session.
4. Si une phase touche une mutation Atome ou Molecule, elle n est pas terminee tant que create/move/delete/history/share/realtime ont ete verifies ou explicitement marques comme non touches.
5. Une regression sur historique, partage temps reel ou multi-session bloque la phase, meme si la fonctionnalite nouvelle semble fonctionner.

### Anti-fallback

1. Forbidden pattern in `molecule` fails.
2. Legacy import in `molecule` fails.
3. Double backend write fails.
4. Silent catch fails.

## 15) Observabilite

Logs obligatoires:

1. `molecule.session.open`
2. `molecule.session.close`
3. `molecule.timeline.load`
4. `molecule.timeline.save`
5. `molecule.kernel.operation`
6. `molecule.media.resolve`
7. `molecule.media.import`
8. `molecule.history.append`
9. `molecule.error`

Chaque log critique doit inclure:

1. `project_id`
2. `timeline_id`
3. `session_id`
4. `operation_id`
5. `platform`
6. `ok`
7. `error_code`
8. `event_id`
9. `tx_id`

Interdiction:

```text
Pas de log "ok" si la persistance canonique n a pas confirme.
```

### 15.1 Logs de diagnostic iOS/JS temporaires

Regle obligatoire pendant tout chantier Molecule, media import, persistence Atome ou bug iOS:

1. Des qu un probleme est investigue, ajouter des logs de diagnostic explicites avant de modifier le comportement.
2. Les logs doivent etre visibles dans la console JS et, sur iOS, dans Xcode via `window.webkit.messageHandlers.console.postMessage(...)` ou le bridge natif equivalent.
3. Les logs doivent identifier la source exacte du probleme: module, operation, atome, projet, media, session, backend canonique, entree, sortie et erreur typee.
4. Les logs doivent encadrer les frontieres critiques: import, conversion, ecriture persistence, lecture reload, rendu, gesture, playback, sync audio/video.
5. Les logs doivent etre suffisamment nombreux au debut du debug pour reconstituer le chemin complet d une operation.
6. Un log de diagnostic temporaire doit etre marque comme temporaire dans son message ou dans son bloc de code.
7. Une fois le probleme resolu et couvert par test ou validation explicite, les logs temporaires doivent etre supprimes.
8. Aucun log temporaire ne doit rester dans le code final d une tache fermee.
9. Les seuls logs conserves en production sont les logs critiques definis dans cette section, avec format stable et utilite durable.
10. Si un bug ne peut pas etre reproduit, les logs temporaires restent limites au perimetre du bug et sont retires des que le diagnostic est termine.

Objectif: diagnostiquer vite sur iOS sans accumuler du bruit permanent dans le code.

### 15.2 Surface de debug UI obligatoire

Le fichier de reference est:

```text
src/application/eVe/documentations/debug_UI.md
```

Regle:

1. Codex doit utiliser `window.__DEBUG__` quand c est possible pour diagnostiquer UI, selection, footer, timeline, renderer, atomes visibles et snapshots.
2. Les probes automatises doivent preferer `window.__DEBUG__.getAppState()`, `getObjectTree()`, `getPersistenceState()`, `getSelectionState()`, `getFooterState()` et `exportSnapshot()` avant d ajouter un nouveau mecanisme de diagnostic.
3. Sur iOS, les logs JS et snapshots issus de `window.__DEBUG__` doivent etre utilises pour comparer etat attendu, DOM visible, persistence et reload.
4. Si `window.__DEBUG__` ne donne pas l information necessaire, la tache doit ajouter un diagnostic temporaire cible, puis le retirer quand le probleme est resolu.
5. Pour la persistence Atome iOS, le scenario minimal obligatoire est: User panel > Debug > Random atome > refresh/relaunch iOS > l atome doit etre recharge avec le meme projet, id, position et taille.
6. Pour ce scenario, `await window.__DEBUG__.getPersistenceState()` doit etre capture avant creation, apres creation, puis apres refresh/relaunch afin de distinguer clairement: objet DOM seulement, objet persiste dans `state_current`, projet courant incoherent, ou utilisateur/session incoherent.
7. Si la matrice contient les projets mais que l ouverture d un projet affiche un bureau vide, utiliser `await window.__DEBUG__.runProjectOpenDiagnostic()` pour verifier simultanement `state_current`, le layer `project_view_*`, le filtrage owner/projet et le rendu effectif. Les logs temporaires doivent remonter dans Xcode avec le prefixe `[eVe:persistence:temporary]`.

## 16) Migration depuis M-Track legacy

La migration est explicite.

Taches:

1. Lire un snapshot M-Track legacy.
2. Convertir en `MoleculeTimeline`.
3. Valider le schema.
4. Sauver comme nouvelle timeline Molecule.
5. Conserver l original legacy sans mutation.
6. Signaler les donnees non migrables.

Interdiction:

```text
Si la migration echoue, Molecule ne doit pas ouvrir le legacy comme fallback.
```

## 17) Definition of Done

Une phase est terminee seulement si:

1. Le code est isole dans le bon perimetre.
2. Les tests unitaires passent.
3. Les tests de contrat passent.
4. `check_no_fallbacks` passe.
5. Les erreurs sont typees.
6. Les logs critiques existent.
7. Les events append-only existent pour les mutations durables.
8. Les medias importes ont original asset, runtime assets et MediaRef.
9. Aucune regression legacy critique n est introduite.
10. L historique create/move/delete/replay est verifie pour le perimetre touche.
11. Le partage temps reel est verifie si le perimetre touche Atome, gestures, media ou Molecule.
12. Le multi-session est verifie si le perimetre touche session, project store, timeline, gestures ou playback.
13. Les verifications faites par Codex et celles attendues du developpeur humain sont explicites.
14. La validation humaine est recue.
15. Le document est mis a jour si le contrat change.

## 18) Protocole de validation a chaque etape

Ce protocole est obligatoire pour chaque tache Molecule, persistence Atome, import media, historique, partage ou multi-session.

### 18.1 Statuts autorises

Chaque tache doit avoir un statut explicite:

1. `todo`: pas commencee.
2. `in_progress`: implementation ou diagnostic en cours.
3. `agent_verified`: Codex a implemente et execute les tests automatisables.
4. `user_validation_pending`: Codex a donne les tests manuels a realiser et attend le retour humain.
5. `done`: le developpeur humain a valide explicitement.
6. `blocked`: la tache ne peut pas avancer sans decision, log ou environnement manquant.

Interdiction:

```text
Une tache ne passe jamais a done sans validation humaine explicite.
```

### 18.2 Procedure Codex obligatoire

A chaque etape, Codex doit:

1. Identifier le perimetre touche: persistence, media, Molecule, historique, partage, multi-session, UI, Tauri/iOS, browser.
2. Lister les risques de regression associes.
3. Ajouter ou mettre a jour les tests automatises pertinents avant de declarer la tache verifiee.
4. Executer les tests automatisables du perimetre touche.
5. Executer les guardrails applicables.
6. Verifier qu aucun chemin interdit n a ete ajoute.
7. Supprimer les logs temporaires quand le probleme est resolu.
8. Indiquer clairement les tests manuels que le developpeur humain doit realiser.
9. Mettre le statut en `user_validation_pending` tant que le retour humain n est pas donne.
10. Mettre le statut en `done` uniquement apres validation humaine.

### 18.3 Tests manuels a fournir au developpeur humain

Pour chaque etape livree, Codex doit fournir une liste courte et executable de tests manuels.

La liste doit inclure, selon le perimetre touche:

1. Creation d atome.
2. Move/resize d atome.
3. Delete d atome.
4. Reload page/app.
5. Verification historique create/move/delete/replay.
6. Partage de l element avec un autre utilisateur ou une autre session.
7. Mouvement temps reel visible pendant le drag dans la session partagee.
8. Deux sessions ouvertes sur le meme projet.
9. Deux Molecule ouvertes si Molecule est touche.
10. Import media et reload si media/import est touche.
11. Verification iOS si le bug ou la fonctionnalite concerne iOS.

### 18.4 Format de fin d etape

A chaque fin d etape, Codex doit indiquer:

1. `Statut`: `agent_verified`, `user_validation_pending`, `done` ou `blocked`.
2. `Tests Codex executes`: commandes et resultat.
3. `Tests humains a faire`: liste concrete.
4. `Historique`: verifie / non touche / bloque.
5. `Partage temps reel`: verifie / non touche / bloque.
6. `Multi-session`: verifie / non touche / bloque.
7. `Logs temporaires`: supprimes / conserves avec raison / non utilises.
8. `Prochaine etape`: action suivante seulement si la validation le permet.

## 19) Ordre de travail recommande

Ordre strict:

1. M0 - Gel et garde-fous.
2. M1 - ProjectStore, EventStore et MediaStore canoniques.
3. M2 - MoleculeKernel.
4. M3 - MoleculeSession.
5. M4 - UI et panel anchoring.
6. M5 - Gestures.
7. M6 - MediaResolver et playback.
8. M7 - Persistence Molecule.
9. M8 - Multi-instance.
10. M9 - Recording.
11. M10 - Nested Molecule.
12. M11 - Suppression complete du legacy M-Track.

Ne pas avancer vers M9/M10 tant que M0-M8 ne sont pas verts.
Ne pas lancer M11 tant que M0-M10 ne sont pas verts.

## 20) Regle de gouvernance

Toute modification future qui ajoute un chemin alternatif doit repondre a ces questions:

1. Est-ce un choix de plateforme fait au boot?
2. Est-ce teste?
3. Est-ce visible dans les logs?
4. Est-ce impossible a confondre avec le chemin canonique?

Si une reponse est non, la modification est refusee.

Il n y a pas de liste d exceptions pour autoriser un contournement dans le coeur Molecule.
