# Solve Bevy Perf

Objectif: retrouver un drag/resize fluide niveau professionnel avec Bevy seul renderer du canvas projet, sans rendu DOM visible, sans fallback CPU video, et sans ancien renderer WebGPU maison propriétaire du canvas.

## Priorite 1 - Stopper les copies video GPU inutiles

Probleme observe:
- Le systeme Bevy copie actuellement les frames HTMLVideoElement vers les textures Bevy pendant les redraws.
- Un drag force des redraws Bevy.
- Si des videos existent dans la scene, elles peuvent donc etre recopiees meme quand la timeline est arretee.

Action:
- Copier une texture video uniquement quand une nouvelle frame decodee est disponible.
- Utiliser le compteur `__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__`.
- Garder un cache render-world du dernier frame version copie par atome video.
- Ne jamais appeler `copy_external_image_to_texture` si la frame n'a pas change.

Validation:
- Les videos importees restent visibles.
- Timeline arretee: drag sans copies video repetitives.
- Timeline en lecture: les copies suivent uniquement les nouvelles frames.

## Priorite 2 - Supprimer les redraw primes sur les Transform

Probleme observe:
- `schedulePresentationRedrawPrime` programme plusieurs redraws retardes.
- Il est appele apres chaque diff, y compris les `Transform` de drag.
- Un drag peut donc empiler des redraws `0, 16, 64, 180 ms`.

Action:
- Garder les redraw primes uniquement pour start, resize, spawn/resource/media priming.
- Pour `updateTransform`, utiliser un seul redraw coalesce.
- Ne pas primer les redraws sur les frames de drag/resize.

Validation:
- Nombre de redraws par mouvement reduit.
- Pas de backlog de redraws apres un drag long.

## Priorite 3 - Chemin drag direct Transform

Probleme observe:
- Le drag repasse par `records -> renderAtoms -> scene -> VirtualScene -> diff`.
- C'est acceptable pour des changements structurels, pas pour un flux interactif a 60 FPS.

Action:
- Pendant `gesture_frame`, appliquer directement `apply_atome_bevy_transform`.
- Garder l'ecriture `gesture_frame` coalesce pour partage temps reel et historique.
- Synchroniser le record runtime local pour que le prochain render complet reste coherent.

Validation:
- Drag 6 secondes avec plusieurs atomes sans reconstruction complete par frame.
- Historique et partage temps reel conservent les frames de geste.

## Priorite 4 - Instrumenter si les trois points precedents ne suffisent pas

Action:
- Mesurer les temps par segment:
  - pointer event
  - `applyGestureFrame`
  - projection runtime
  - diff VirtualScene
  - appel wasm `apply_atome_bevy_transform`
  - redraw Bevy
- Ajouter des compteurs temporaires nettoyables:
  - ops par frame
  - redraws demandes
  - copies video effectuees
  - copies video sautees

Validation:
- Sortie de probe claire avec FPS drag, FPS video, nombre de copies video, nombre de redraws.

## Priorite 5 - Isoler un cas Bevy minimal si le probleme persiste

Action:
- Scene Bevy seule avec formes/images/textes, sans videos.
- Meme scene avec videos presentes mais copies desactivees.
- Meme scene avec Transform direct uniquement.
- Comparer WebKit/Tauri/Safari/Chromium.

Decision:
- Si le cas minimal rame encore, enqueter l'integration Bevy/WASM/WebKit/Tauri, le present mode, le wake loop, et la configuration window/render loop.
