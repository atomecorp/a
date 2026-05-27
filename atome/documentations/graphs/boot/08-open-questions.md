# Open Questions - boot

## UNKNOWN-001

Question:
Quels modules de `eveModules` peuvent etre lazy-loades sans casser l'API publique ?

Pourquoi c'est important:
Le chargement sequentiel bloque chaque module derriere le precedent.

Fichiers concernés:
- eVe/eVe.js
- atome/src/utils/module_loader_runtime.js

Comment vérifier:
Mesurer les temps `onModuleLoaded` et mapper les premiers consommateurs.

## UNKNOWN-002

Question:
Le boot doit-il attendre les permissions capture ?

Pourquoi c'est important:
L'appel est actuellement detache, donc les tools peuvent etre visibles avant statut permissions.

Fichiers concernés:
- eVe/intuition/bootstrap.js
- eVe/domains/media/api/video_api.js

Comment vérifier:
Tester refus/lenteur permission camera au lancement.

## UNKNOWN-003

Question:
Quel evenement definit officiellement "app ready": `squirrel:ready`, fin `eVe.js`, auth checked ou projet charge ?

Pourquoi c'est important:
Plusieurs blocs declenchent du travail sur des notions differentes de readiness.

Fichiers concernés:
- atome/src/squirrel/kickstart.js
- eVe/eVe.js
- eVe/intuition/tools/project_bootstrap.js

Comment vérifier:
Tracer les timestamps de ces quatre etats.
