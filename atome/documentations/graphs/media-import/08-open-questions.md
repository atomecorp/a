# Open Questions - media-import

## UNKNOWN-001

Question:
Quel handler consomme officiellement un drop natif quand le curseur est au-dessus du preview mtrax dans le projet ?

Pourquoi c'est important:
Le projet, le preview et la timeline possedent des routes de drop.

Fichiers concernes:
- eVe/intuition/tools/project_drop.js
- eVe/domains/mtrax/preview/preview_file_drop_bridge.js
- eVe/domains/mtrax/media/drop_runtime.js

Comment verifier:
Tracer un drop reel et comparer `preventDefault`, `stopPropagation`, guards mtrax et logs `*_drop`.

## UNKNOWN-002

Question:
Quelle source est canonique apres upload: `mediaUrl`, `filePath`, `resolvedSource`, `playbackSource` ou `media_ref` ?

Pourquoi c'est important:
Les graphes montrent plusieurs copies utilisees par clip, preview et playback.

Fichiers concernes:
- eVe/domains/mtrax/media/element_runtime.js
- eVe/domains/mtrax/timeline/import_media_timeline.js
- eVe/intuition/tools/molecule/media/index.js

Comment verifier:
Comparer un import audio, video, image et svg dans la timeline persistee.

## UNKNOWN-003

Question:
Existe-t-il un dispose effectif des drop zones et listeners window ?

Pourquoi c'est important:
Les handlers globaux peuvent survivre a la fermeture du panneau.

Fichiers concernes:
- eVe/domains/mtrax/media/drop_runtime.js
- eVe/domains/mtrax/preview/preview_file_drop_bridge.js

Comment verifier:
Chercher les appels `destroy`, `removeEventListener`, `dropZone.destroy` autour des runtimes mtrax.
