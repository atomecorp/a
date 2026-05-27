# Open Questions - project-loading

## UNKNOWN-001

Question:
`loadProjectAtomes(... staleFirst)` verifie-t-il encore l'utilisateur/projet courant au moment du rendu ?

Pourquoi c'est important:
La promesse est detachee et peut finir apres logout ou changement de projet.

Fichiers concernés:
- eVe/intuition/tools/project_bootstrap.js
- module qui definit `window.eveToolBase.loadProjectAtomes`

Comment vérifier:
Trouver `loadProjectAtomes` et inspecter ses guards de generation/projet.

## UNKNOWN-002

Question:
Quelle source est canonique pour le projet courant apres `setCurrent` ?

Pourquoi c'est important:
Le code indique que `window.__currentProject` est gere par `adole_apis.js`, mais le bootstrap lit aussi saved/list/meta.

Fichiers concernés:
- eVe/intuition/tools/project_bootstrap.js
- atome/src/squirrel/apis/unified/adole_apis.js

Comment vérifier:
Tracer `setCurrent`, `persistCurrentProjectId` et la mutation `window.__currentProject`.

## UNKNOWN-003

Question:
Le reload remote mtrax doit-il attendre la fin du bootstrap projet ?

Pourquoi c'est important:
Le commit bridge peut recharger une timeline pendant que le projet charge ses atomes.

Fichiers concernés:
- eVe/domains/mtrax/project/commit_bridge_runtime.js
- eVe/intuition/tools/project_bootstrap.js

Comment vérifier:
Simuler un atome changed pendant `ensureCurrentProject`.
