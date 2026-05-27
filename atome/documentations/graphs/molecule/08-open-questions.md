# Open Questions - molecule

## UNKNOWN-001

Question:
`window.Molecule` existe-t-il dans une autre zone que `eVe/intuition/tools/molecule` ?

Pourquoi c'est important:
Le prompt demande de verifier `window.Molecule`, mais aucune affectation directe n'a ete trouvee dans les fichiers molecule inspectes.

Fichiers concernes:
- eVe/intuition/tools/molecule/index.js
- eVe/intuition/tools/molecule/runtime.js
- eVe/domains/mtrax/api/window_api_runtime.js

Comment verifier:
Chercher globalement `window.Molecule`, `Molecule =`, `eveMoleculeTimelineApi` et les appels depuis le boot.

## UNKNOWN-002

Question:
`atome_mtrack_open_request` declenche-t-il encore une creation concurrente de molecule/mtrax ?

Pourquoi c'est important:
Le bloc molecule est cense respecter `1 intention utilisateur -> 1 molecule_creation_id -> 1 MoleculeSession complete`; l'ancien chemin mtrax peut contourner ce principe.

Fichiers concernes:
- eVe/intuition/tools/mtrack.js
- eVe/domains/mtrax/api/window_api_runtime.js
- eVe/intuition/runtime/eve_intuition/mtrax_bridge_runtime.js

Comment verifier:
Cartographier `runtime-api` et `panel-lifecycle`, puis comparer les evenements d'ouverture.

## UNKNOWN-003

Question:
Quelle route est l'autorite officielle entre `openGroupTimeline` et `createMoleculeMultiInstanceController.openInstance` ?

Pourquoi c'est important:
Les deux routes creent des sessions et ouvrent des panneaux sans partager la meme map d'instances.

Fichiers concernes:
- eVe/intuition/tools/molecule/runtime.js
- eVe/intuition/tools/molecule/multi_instance/index.js
- eVe/intuition/tools/molecule/session/registry.js

Comment verifier:
Trouver tous les imports/appels de `installMoleculeGroupTimelineRuntime`, `openGroupTimeline`, `createMoleculeMultiInstanceController` et `openInstance`.

## UNKNOWN-004

Question:
Quelle strategie doit etre appliquee quand `openMoleculePanel` echoue apres `projectStore.saveTimeline` ?

Pourquoi c'est important:
Sans rollback, une timeline peut etre persistee sans session/panneau stable.

Fichiers concernes:
- eVe/intuition/tools/molecule/runtime.js
- eVe/intuition/tools/molecule/panel/index.js

Comment verifier:
Tester les erreurs `ANCHOR_NOT_FOUND`, `TOOLS_RUNTIME_REQUIRED` et regarder l'etat persiste apres echec.

## UNKNOWN-005

Question:
La fermeture UI doit-elle fermer la session ou seulement masquer le panneau ?

Pourquoi c'est important:
Le bouton close actuel appelle `closeMoleculePanel`; `closeGroupTimeline` fait le cleanup complet.

Fichiers concernes:
- eVe/intuition/tools/molecule/panel/index.js
- eVe/intuition/tools/molecule/runtime.js

Comment verifier:
Observer le comportement attendu par les tests UX et les specs molecule.
