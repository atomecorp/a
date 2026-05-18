# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# Video Recording And Preview

## Objectif

Reprendre proprement l'architecture d'enregistrement video et de preview pour tous les outils qui peuvent lancer un enregistrement video.

La cible est stricte :

- un preview 100% web pour les outils et palettes ;
- un rendu WebGPU pour afficher le flux video dans l'outil ;
- un enregistrement iOS natif uniquement responsable de produire le fichier video ;
- une seule source de verite pour le cycle de vie start/stop/state ;
- aucun rendu natif iOS superpose au DOM pour les previews d'outils ;
- aucun fallback silencieux, aucun patch opportuniste, aucune duplication de logique.
- suppression immediate de tout code deprecated ou devenu inutilise rencontre pendant l'implementation.

## Probleme Actuel

Le preview iOS natif est rendu par une `UIView`/`AVCaptureVideoPreviewLayer` placee au-dessus du `WKWebView`. Ce modele pose des problemes structurels :

- les events DOM peuvent etre interceptes par la vue native ;
- le bouton `video` peut devenir impossible a retoucher pour stopper ;
- le preview peut rester a une position absolue si la palette bouge ou se ferme ;
- la logique preview/record est eparpillee entre JS et Swift ;
- le comportement differe selon l'outil utilise.

Ce modele doit etre supprime pour les previews integrees aux outils.

## Architecture Cible

### 1. Source De Verite Unique

Creer un module unique responsable du cycle de vie video :

`src/application/eVe/domains/media/api/video_recording_controller.js`

Responsabilites :

- etat global d'enregistrement video ;
- start/stop atomiques ;
- prevention des doubles starts/stops ;
- routage vers backend iOS natif, web ou Tauri ;
- publication d'evenements de state ;
- creation du resultat final normalise.

Ce module devient le seul point d'entree autorise pour :

- outil `video` dans `.enr` ;
- quick/fast menu ;
- fullscreen capture ;
- futur outil video ;
- debug, si le debug doit representer le comportement production.

Interdit :

- appeler directement `media_video_record_start` depuis un composant UI ;
- avoir un stop local dans chaque outil ;
- dupliquer un etat `isRecording` hors du controller ;
- maintenir deux chemins iOS production/debug.

### 2. Preview Web Unique

Creer un module unique de preview web :

`src/application/eVe/domains/media/preview/video_preview_renderer.js`

Responsabilites :

- acquisition du flux preview via `getUserMedia({ video: true, audio: false })` ;
- attachement du preview a un host HTML fourni par l'outil ;
- rendu dans un vrai `<canvas>` enfant de l'outil ;
- rendu WebGPU obligatoire sur plateformes compatibles ;
- arret propre du flux preview ;
- resize propre quand l'outil bouge, change de taille ou disparait.

Le preview doit etre une partie normale du DOM. Les events restent donc geres par le navigateur et ne passent jamais par une couche native superposee.

### 3. Rendu WebGPU

Creer un renderer WebGPU dedie :

`src/application/eVe/domains/media/preview/webgpu_video_preview_renderer.js`

Responsabilites :

- initialiser `GPUDevice`, `GPUCanvasContext`, pipeline et sampler ;
- uploader la frame courante depuis un `HTMLVideoElement` cache via `importExternalTexture` ou mecanisme equivalent supporte ;
- dessiner dans le canvas avec `object-fit: cover` coherent ;
- limiter le rendu a la cadence utile de l'interface ;
- suspendre le rendu quand le host n'est plus visible ;
- liberer toutes les ressources au stop.

Le rendu doit etre concu pour iOS WebView :

- pas de readback GPU ;
- pas de conversion base64 ;
- pas de transfert frame par frame Swift vers JS ;
- pas de canvas 2D comme chemin cache ;
- pas de rendu natif iOS au-dessus du DOM.

Si WebGPU n'est pas disponible sur une plateforme ou une WebView cible, le module doit echouer explicitement avec une erreur lisible. Il ne doit pas basculer silencieusement sur un autre rendu.

### 4. Backend Recording iOS

Le backend iOS natif doit etre reduit a l'enregistrement fichier :

`platforms/ios/atome-auv3/Common/AppNativeMediaCaptureController.swift`

Responsabilites conservees :

- permissions camera/micro ;
- `AVCaptureSession` d'enregistrement ;
- `AVCaptureMovieFileOutput` ;
- orientation ;
- piste audio ;
- sortie `.mov` ;
- metadonnees finales : duree, taille, tracks audio/video, chemin.

Responsabilites a supprimer pour le mode outil/palette :

- `AVCaptureVideoPreviewLayer` ;
- `UIView` preview ;
- `previewFrame` pour `ui.capture.tool` ;
- tap gesture recognizer preview ;
- dispatch JS depuis une vue native de preview.

Le natif iOS ne doit pas connaitre la position d'un outil HTML pour le preview outil. La position appartient au DOM et au renderer WebGPU.

### 5. Outils UI

Tous les outils video doivent consommer le meme controller :

- `.enr > video` ;
- fast menu `video` ;
- fullscreen record ;
- tout futur outil video.

Le role de l'UI :

- fournir un host HTML pour le preview ;
- appeler `videoRecordingController.toggle({ sourceTool, mode })` ;
- afficher l'etat `idle`, `previewing`, `recording`, `stopping`, `error` ;
- ne jamais parler directement a Swift.

## Plan D'Implementation

### Phase 1 - Audit Et Suppression Des Chemins Dupliques

- Lister tous les appels a `startVideoRecording`, `stopVideoRecording`, `toggleVideoRecording`, `media_video_record_start`, `media_camera_preview_show`, `media_camera_preview_update`.
- Identifier les chemins outil, fast menu, fullscreen et debug.
- Decider du mapping exact vers le nouveau controller.
- Supprimer le rendu preview natif pour `ui.capture.tool`.
- Garder le backend iOS d'enregistrement, mais le rendre ignorant du preview outil.

Critere de sortie :

- un seul module est responsable du state recording ;
- aucun outil UI n'appelle directement une commande native video.

### Phase 2 - Controller Unique

- Creer `video_recording_controller.js`.
- Definir un state machine stricte :
  - `idle`
  - `previewing`
  - `starting`
  - `recording`
  - `stopping`
  - `completed`
  - `error`
- Implementer des transitions explicites et refusees si invalides.
- Centraliser `start`, `stop`, `toggle`, `attachPreviewHost`, `detachPreviewHost`.
- Normaliser les resultats de tous les backends.

Critere de sortie :

- impossible de lancer deux records concurrents ;
- impossible d'avoir un stop qui ne sait pas quel record il stoppe ;
- l'etat UI vient du controller, pas des composants.

### Phase 3 - Preview WebGPU

- Creer un canvas dans le host HTML fourni par l'outil.
- Creer un `HTMLVideoElement` interne, non visible, source du `MediaStream`.
- Initialiser WebGPU une fois par preview session.
- Rendre le flux dans le canvas via une boucle controlee.
- Gerer resize et detach via `ResizeObserver` et `IntersectionObserver`.
- Nettoyer strictement stream, tracks, GPU resources et observers.

Critere de sortie :

- le preview est visible dans le bouton/outil ;
- le preview suit le DOM ;
- les events pointer/click restent DOM ;
- aucun overlay natif ne recouvre le bouton.

### Phase 4 - Backend iOS Minimal

- Retirer du chemin outil iOS :
  - `previewFrame`
  - `previewSource=ui.capture.tool`
  - `media_camera_preview_update` pendant record outil
  - `AVCaptureVideoPreviewLayer` pour outil
  - `UIView` preview tool
- Conserver uniquement l'enregistrement natif.
- Garder des logs natifs utiles :
  - start request ;
  - permission status ;
  - session configured ;
  - recording started ;
  - stop requested ;
  - recording finished ;
  - file stats.

Critere de sortie :

- aucun log `preview_installed source=ui.capture.tool` ne doit apparaitre ;
- le record iOS produit un fichier valide avec audio/video ;
- le stop vient du controller JS.

### Phase 5 - Integration Des Outils

- Rebrancher `.enr > video` sur le controller.
- Rebrancher fast menu `video` sur le controller.
- Rebrancher fullscreen sur le controller, avec un host preview fullscreen web si ce mode doit aussi etre unifie.
- Supprimer les anciens handlers locaux de stop/start.
- Supprimer les timers de resynchronisation preview natif outil.

Critere de sortie :

- meme code pour demarrer/stoper depuis tous les outils ;
- meme preview renderer pour tous les hosts HTML ;
- aucune divergence debug/production.

### Phase 6 - Validation

Tests manuels obligatoires sur iPad :

- lancer record depuis `.enr > video`, stopper en retapant le meme outil ;
- lancer record depuis fast menu, stopper en retapant ;
- ouvrir/fermer palette pendant preview/record ;
- deplacer ou redimensionner l'outil pendant preview ;
- enregistrer plusieurs videos successives ;
- verifier audio present ;
- verifier lecture, scrub et import timeline ;
- verifier orientation.

Logs attendus :

- JS controller : transition `idle -> previewing -> recording -> stopping -> completed`;
- native iOS : `media_video_record_start`, `recording_start`, `media_video_record_stop`, `video_done`;
- aucun `preview_installed source=ui.capture.tool`.

Checks automatises :

- `node --check` sur les modules modifies ;
- build iOS avec `xcodebuild`;
- test de non-regression web/Tauri sur l'API video existante.

## Contraintes Non Negotiables

- Le preview outil/palette est web, pas natif.
- Le rendu preview cible est WebGPU.
- Le record iOS reste natif pour produire un fichier fiable.
- Une seule source de verite pour l'etat video.
- Aucun fallback silencieux.
- Aucun patch local dans un outil.
- Aucun rendu natif superpose au DOM pour les outils.
- Aucun transfert frame par frame Swift vers JS.
- Aucun code debug separe qui diverge de la production.
- Tout code deprecated, mort ou rendu inutile par cette refonte doit etre efface au moment ou il est rencontre.
- Ne pas laisser de wrappers, handlers, timers, bridges ou helpers obsoletes "au cas ou".

## Definition Of Done

La tache est terminee quand :

- tous les outils video utilisent le meme controller ;
- le preview est un canvas DOM rendu en WebGPU ;
- l'enregistrement iOS ne rend plus aucun preview natif pour les outils ;
- start/stop fonctionne depuis `.enr > video`, fast menu et fullscreen ;
- plusieurs enregistrements consecutifs fonctionnent ;
- les fichiers produits sont lisibles, scrubables, avec audio et orientation correcte ;
- les anciens chemins dupliques sont supprimes, pas seulement contournes.
- le code deprecated ou inutilise rencontre pendant la tache a ete supprime.
