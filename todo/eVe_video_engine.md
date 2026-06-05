# eVe Video Engine - Plan d'architecture, tests et controle qualite

## Objectif non negociable

Construire un moteur video eVe/Bevy/WebGPU capable de servir une solution de montage et compositing video temps reel.

Critere cible:

- 10 flux video simultanes dans le canvas Bevy.
- 60 FPS constant sur la resolution courante du canvas et au DPI reel.
- Drag et resize d'atomes sans degradation perceptible, avec ou sans lecture video.
- Aucun chemin de lecture live base sur `canvas 2D -> getImageData -> RGBA -> WASM`.
- Rendu video dans le canvas Bevy, sans overlay DOM visible.
- Nettete pleine resolution: pas de downscale cache pour masquer un probleme de performance.

## Diagnostic de depart

Le pipeline actuel est trop lent pour du montage/compositing:

```text
HTMLVideoElement
-> canvas 2D drawImage
-> getImageData
-> Uint8 RGBA
-> JS/WASM
-> Bevy Image
-> upload GPU
-> canvas Bevy
```

Ce chemin impose des copies CPU, bloque le thread principal, degrade la nettete si on reduit la texture, et entre en concurrence avec le drag/resize.

Le pipeline cible doit etre:

```text
Decode video
-> GPUExternalTexture / VideoFrame GPU
-> material/render node Bevy dedie
-> shader WGSL compositing
-> render pass Bevy canvas
```

References techniques:

- MDN `GPUDevice.importExternalTexture`: https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/importExternalTexture
- WebGPU external video textures: https://webgpufundamentals.org/webgpu/lessons/webgpu-textures-external-video.html
- WebGPU explainer `GPUExternalTexture`: https://gpuweb.github.io/gpuweb/explainer/

## Principes d'architecture

1. La video live ne doit jamais traverser `ImageData`, `Uint8Array RGBA`, ni `Vec<u8>` pour la lecture.
2. Le drag/resize est un pipeline prioritaire et independant de la video.
3. Le compositing video se fait dans Bevy/WebGPU, pas dans le DOM, pas dans un canvas 2D intermediaire.
4. Les mutations persistantes ne doivent pas etre executees pendant `pointermove`.
5. Les tests doivent mesurer le comportement reel avec Playwright et logs de timeline, pas seulement des tests unitaires.
6. Chaque optimisation doit etre conservee uniquement si elle ameliore une mesure reproductible.

## Architecture cible

### Modules

```text
eVe/domains/media/bevy_video_engine_runtime.js
eVe/domains/media/bevy_video_timeline_runtime.js
eVe/domains/media/bevy_video_probe_runtime.js
eVe/domains/rendering/bevy_web_video_bridge.js
platforms/web/bevy-renderer/src/video_external.rs
platforms/web/bevy-renderer/src/video_compositor.rs
atome/renderers/bevy-core/src/video_compositor.rs
atome/renderers/bevy-core/src/video_track.rs
atome/renderers/bevy-core/src/video_material.rs
atome/renderers/bevy-core/assets/shaders/video_external.wgsl
```

### Responsabilites

`bevy_video_engine_runtime.js`

- Gere les pistes video actives.
- Gere play/pause/stop.
- Gere le mapping `atome_id -> video source`.
- Expose une API stable au reste de eVe.
- Ne gere pas le drag/resize.

`bevy_video_timeline_runtime.js`

- Gere playhead, vitesse, loop, offset, trim in/out.
- Synchronise les pistes.
- Prepare le futur montage multipiste.

`bevy_web_video_bridge.js`

- Interface web specifique `GPUExternalTexture`.
- Cree les bind groups video par frame si necessaire.
- Gere les contraintes d'expiration des external textures.
- Ne fait aucun `getImageData`.

`video_external.rs`

- Integre les ressources video web au renderer Bevy.
- Fournit un render path dedie aux quads video.
- Isole le code web/WASM du core multiplateforme.

`video_compositor.rs`

- Gere z-order, opacity, transforms, blend modes.
- Prepare les operations de compositing.
- Doit rester compatible avec une implementation native Tauri/iOS future.

`video_external.wgsl`

- Sample `texture_external`.
- Utilise `textureSampleBaseClampToEdge`.
- Applique color space, opacity, alpha, crop, transform UV.

## Pipeline interaction canvas

Le drag/resize doit rester minimal:

```text
pointermove
-> hit test runtime
-> calcul props locales
-> apply_atome_bevy_transform
-> request redraw coalesce
```

Interdit pendant `pointermove`:

- `Atome.commit`
- `Atome.commitBatch`
- sync reseau
- rebuild complet de scene
- upload video
- `getImageData`
- decode video
- creation/destruction de textures

Commit final:

```text
pointerup
-> commit canonique unique
-> sync/realtime/history
```

## Pipeline video web cible

Par frame:

```text
requestAnimationFrame
-> lire playhead global
-> importer les videos dues via device.importExternalTexture({ source: video })
-> construire bind groups video courants
-> render Bevy video pass
-> render overlays/selection/atoms
-> present canvas
```

Contraintes:

- `GPUExternalTexture` cree depuis `HTMLVideoElement` expire vite; importer chaque frame ou chaque draw necessaire.
- Les bind groups video doivent etre recrees ou recycles selon validite.
- Cross-origin doit etre gere proprement: CORS valide ou source locale.
- Pas de fallback silencieux vers RGBA live.

## Phases d'implementation

### Phase 0 - Etat propre et baseline

Objectif:

- Repartir de l'etat rollback utilisateur ou drag/resize est fluide sans video.
- Ne pas reintroduire les changements experimentaux non prouves.

Actions:

- Lire `git status`.
- Identifier les fichiers modifies.
- Verifier que le drag/resize est fluide sans video.
- Lancer un probe baseline sans lecture video.

Tests:

```text
npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
npm run check:syntax
```

Probe:

```text
node temp/bevy_canvas_fluency_probe.mjs
```

Critere d'acceptation:

- Drag p95 <= 18 ms.
- Resize p95 <= 18 ms.
- Aucun `gesture_frame` ou commit pendant `pointermove`.
- Aucun appel video dans les logs pendant drag sans lecture.

Critere de refus:

- Un commit ou sync apparait pendant `pointermove`.
- Un rebuild complet de scene apparait pendant `pointermove`.

### Phase 1 - Instrumentation de diagnostic

Objectif:

- Mesurer exactement les blocages.

Actions:

- Ajouter logs de probe uniquement, pas de logs produit permanents.
- Enregistrer:
  - `pointerdown`, `pointermove`, `pointerup`;
  - gaps RAF;
  - appels Bevy transform/resource/redraw;
  - commits Atome;
  - video import/upload;
  - drawImage/getImageData si present;
  - phase active: setup, playback, drag, resize.

Sorties:

```text
temp/probe_reports/bevy_canvas_fluency_probe/report.json
temp/probe_reports/bevy_canvas_fluency_probe/timeline.json
```

Critere d'acceptation:

- Le probe produit une timeline exploitable.
- Chaque gap > 24 ms est visible et correle a une operation.

Critere de refus:

- Logs incomplets.
- Logs uniquement console sans fichier exploitable.

### Phase 2 - Decouplage interaction/video

Objectif:

- La video ne doit jamais bloquer le drag/resize.

Actions:

- Isoler le moteur video dans `bevy_video_engine_runtime.js`.
- Interdire les operations video pendant session pointer active.
- Verifier que le moteur video ne touche pas aux mutations d'atomes.
- Verifier que drag/resize n'appelle pas les APIs video.

Tests:

```text
npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs
npm run test:run -- tests/eve/project_scene_multi_selection_transform.test.mjs
npm run test:run -- tests/eve/project_scene_stale_drag_regression.test.mjs
```

Probe:

```text
BEVY_FLUENCY_VIDEO_STREAMS=1 node temp/bevy_canvas_fluency_probe.mjs
BEVY_FLUENCY_VIDEO_STREAMS=2 node temp/bevy_canvas_fluency_probe.mjs
```

Critere d'acceptation:

- Drag p95 <= 18 ms avec video active.
- Resize p95 <= 18 ms avec video active.
- Aucun upload video pendant interaction active.
- Aucun commit pendant `pointermove`.

Critere de refus:

- Un pic de drag est correle a une operation video.
- La video modifie le runtime d'interaction.

### Phase 3 - Prototype WebGPU external texture hors Bevy

Objectif:

- Prouver que 10 videos peuvent etre samplees sans copie CPU dans un canvas WebGPU minimal.

Actions:

- Creer un prototype temporaire dans `temp/`.
- Utiliser `navigator.gpu`.
- Utiliser `device.importExternalTexture({ source: video })`.
- Shader WGSL avec `texture_external`.
- Dessiner 10 quads video.
- Mesurer FPS et frame gaps.

Tests:

```text
node temp/webgpu_external_video_probe.mjs
```

Critere d'acceptation:

- 10 videos visibles dans un canvas WebGPU.
- 60 FPS p95 <= 18 ms.
- Aucun `getImageData`.
- Aucun upload RGBA.
- Nettete full canvas/DPI.

Critere de refus:

- Fallback canvas 2D.
- Downscale cache.
- 10 flux sous 60 FPS.

### Phase 4 - Integration Bevy web renderer

Objectif:

- Integrer le chemin GPU externe dans le renderer Bevy web.

Actions:

- Ajouter un type `AtomeVideoTrack`.
- Ajouter une op Bevy web:

```text
apply_atome_bevy_video_track(track)
remove_atome_bevy_video_track(id)
update_atome_bevy_video_transform(id, transform)
```

- Ajouter render node ou pipeline dedie video.
- Ajouter shader `video_external.wgsl`.
- Garder les sprites/images existants hors du chemin video.

Tests Rust:

```text
cargo check
cargo test
./platforms/web/bevy-renderer/build.sh
```

Tests JS:

```text
npm run test:run -- tests/eve/selected_project_media_playback_runtime.test.mjs
npm run test:run -- tests/eve/unified_rendering_contract.test.mjs
npm run check:syntax
```

Critere d'acceptation:

- Une video Bevy utilise le chemin external texture.
- Le chemin RGBA n'est pas appele pour la lecture live.
- Rendu dans `canvas#eve_surface_project`.

Critere de refus:

- `getImageData` appele pendant lecture live.
- Texture video convertie en `Image`.
- Rendu hors canvas Bevy.

### Phase 5 - Multipiste et compositing

Objectif:

- 10 pistes video simultanees avec compositing.

Actions:

- Ajouter z-index par piste.
- Ajouter opacity.
- Ajouter blend mode normal/add/multiply/screen si supporte.
- Ajouter crop/UV rect.
- Ajouter transform par piste.
- Ajouter preparation timeline: start, duration, trim in/out.

Tests:

```text
BEVY_FLUENCY_VIDEO_STREAMS=1 node temp/bevy_canvas_fluency_probe.mjs
BEVY_FLUENCY_VIDEO_STREAMS=2 node temp/bevy_canvas_fluency_probe.mjs
BEVY_FLUENCY_VIDEO_STREAMS=4 node temp/bevy_canvas_fluency_probe.mjs
BEVY_FLUENCY_VIDEO_STREAMS=10 node temp/bevy_canvas_fluency_probe.mjs
```

Critere d'acceptation:

- 10 flux visibles.
- 60 FPS: p95 <= 18 ms, max acceptable documente.
- Aucun trou RAF > 34 ms en lecture stable.
- Drag/resize pendant lecture: p95 <= 18 ms.
- Pas de perte de nettete vs canvas DPI.

Critere de refus:

- Une seule frame > 50 ms correlee au moteur video.
- Tout fallback CPU pendant lecture.
- Video pixelisee par downscale interne.

### Phase 6 - Qualite, regression et nettoyage

Objectif:

- Stabiliser et nettoyer.

Actions:

- Supprimer probes temporaires inutiles.
- Garder uniquement les probes utiles sous `temp/` si la convention projet l'accepte.
- Mettre a jour:
  - `maps/CODEMAP.md`;
  - `maps/API_MAP.md`;
  - tests de contrat.
- Documenter les limites navigateur.

Tests finaux:

```text
cargo test
cargo check
./platforms/web/bevy-renderer/build.sh
npm run test:run -- tests/eve/project_scene_gesture_performance.test.mjs tests/eve/project_scene_multi_selection_transform.test.mjs tests/eve/project_scene_stale_drag_regression.test.mjs
npm run test:run -- tests/eve/unified_rendering_contract.test.mjs tests/eve/render_surface_size_contract.test.mjs tests/eve/selected_project_media_playback_runtime.test.mjs
npm run check:syntax
BEVY_FLUENCY_VIDEO_STREAMS=10 node temp/bevy_canvas_fluency_probe.mjs
```

Critere d'acceptation final:

- Tests automatises verts.
- Probe 10 flux vert.
- Timeline sans `getImageData`.
- Timeline sans commit pendant drag/resize.
- Canvas unique Bevy.
- Pas de DOM video visible dans la scene.
- DPI respecte.

## Controle qualite obligatoire

### Metrics a publier dans chaque rapport

- FPS moyen.
- Frame p50/p95/p99.
- Nombre de frames > 24 ms.
- Nombre de frames > 34 ms.
- Nombre de frames > 50 ms.
- Nombre de `pointermove`.
- Nombre de transform patches.
- Nombre de commits pendant mouvement.
- Nombre de video imports.
- Nombre de readbacks CPU.
- Nombre de redraws.
- DPI canvas CSS/pixel.

### Definition de "fluide"

Lecture seule:

- p95 <= 18 ms.
- aucun gap > 34 ms sur 10 secondes.
- aucun readback CPU.

Drag/resize:

- p95 <= 18 ms.
- aucun commit pendant mouvement.
- aucune operation video pendant interaction active.
- aucune perte de suivi entre pointeur et atome.

Qualite image:

- pas de downscale cache.
- video samplee a la resolution source ou a la resolution necessaire au canvas DPI.
- aucune pixelisation introduite par le moteur.

## Risques connus

- `GPUExternalTexture` n'est pas disponible partout et depend du navigateur.
- Les external textures expirent vite; il faut recreer/importer dans la frame courante.
- CORS peut bloquer les sources distantes.
- Bevy peut ne pas exposer directement toute l'API necessaire; il faudra peut-etre un render node wgpu specifique web.
- Tauri/iOS auront un chemin natif different.

## Decision d'architecture

Le chemin RGBA actuel peut rester uniquement comme fallback de debug ou poster frame, jamais comme moteur de lecture live.

La solution professionnelle est un moteur video GPU-first:

```text
GPUExternalTexture pour web
texture native decodee pour Tauri/iOS
compositing Bevy/WGSL
interaction canvas isolee
tests Playwright instrumentes
```

Tant que cette architecture n'est pas en place, 10 flux a 60 FPS net et stable ne peut pas etre considere comme livre.
