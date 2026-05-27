# Open Questions - panel-lifecycle

## UNKNOWN-001

Question:
Le `MutationObserver` de diagnostic est-il deconnecte ailleurs ?

Pourquoi c'est important:
Un observer persistant peut continuer a reagir apres fermeture/reouverture.

Fichiers concernés:
- eVe/domains/mtrax/ui/panel_lifecycle_runtime.js

Comment vérifier:
Chercher `__eveMtrackDiagObserver.disconnect` et tester open/close repete en mode diag.

## UNKNOWN-002

Question:
La fermeture molecule doit-elle utiliser `close_mtrack_panel` ou un lifecycle separe ?

Pourquoi c'est important:
Le cleanup mtrax est beaucoup plus complet que `closeMoleculePanel`.

Fichiers concernés:
- eVe/intuition/tools/molecule/panel/index.js
- eVe/domains/mtrax/ui/panel_lifecycle_runtime.js

Comment vérifier:
Identifier l'API officielle appelee par les boutons/shortcuts molecule et mtrax.

## UNKNOWN-003

Question:
Les appels audio en `void` sont-ils idempotents et observes ?

Pourquoi c'est important:
La fermeture peut terminer avant la destruction audio.

Fichiers concernés:
- eVe/domains/mtrax/ui/panel_lifecycle_runtime.js
- eVe/domains/mtrax/audio/hmtracks_*runtime.js

Comment vérifier:
Verifier les promesses rejetees et les etats apres close rapide/open rapide.
