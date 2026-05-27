# Open Questions - runtime-api

## UNKNOWN-001

Question:
Qui possede `window.eveMtrackApi` et quand est-il invalide ?

Pourquoi c'est important:
Les consommateurs peuvent appeler une API globale apres dispose/reinit.

Fichiers concernés:
- eVe/domains/mtrax/api/window_api_runtime.js
- eVe/intuition/tools/mtrack.js

Comment vérifier:
Chercher un clear/delete de `window.eveMtrackApi` et tester reinit mtrax.

## UNKNOWN-002

Question:
`window.Molecule` doit-il exposer la media API ou la timeline/session API ?

Pourquoi c'est important:
Le nom global est ambigu avec le bloc molecule cartographie.

Fichiers concernés:
- eVe/core/media_engine/molecule.api.js
- eVe/intuition/tools/molecule/runtime.js

Comment vérifier:
Lister les appels `window.Molecule.*` dans l'application et les tests.

## UNKNOWN-003

Question:
Les singletons `panelApi` et `groupTimelineApi` peuvent-ils etre remplaces pendant que des appels sont en vol ?

Pourquoi c'est important:
Le clone d'API n'a pas d'owner/generation.

Fichiers concernés:
- eVe/intuition/runtime/panel_api.js
- eVe/intuition/runtime/group_timeline_api.js

Comment vérifier:
Tester register/clear pendant openPanelSurface/openGroupTimeline async.
