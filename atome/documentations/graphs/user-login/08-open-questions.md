# Open Questions - user-login

## UNKNOWN-001

Question:
Le bootstrap projet attend-il la fin de `syncLocalProjectsToFastify` apres login ?

Pourquoi c'est important:
Un projet local migre trop tard peut ne pas apparaitre dans `projects.list`.

Fichiers concernés:
- atome/src/squirrel/apis/unified/adole_api/auth.js
- eVe/intuition/tools/project_bootstrap.js

Comment vérifier:
Tracer login depuis anonymous avec projets locaux, puis l'ordre `syncLocalProjectsToFastify` / `api.projects.list`.

## UNKNOWN-002

Question:
Quelle est la source canonique du user courant: sessionState ou `window.__currentUser` ?

Pourquoi c'est important:
Plusieurs modules lisent les globals window.

Fichiers concernés:
- atome/src/squirrel/apis/unified/adole_api/session.js
- eVe/core/project_security.js

Comment vérifier:
Lister tous les lecteurs de `__currentUser` et `getSessionState`.

## UNKNOWN-003

Question:
Les adapters Tauri/Fastify peuvent-ils diverger apres login partiel ?

Pourquoi c'est important:
Le login choisit un backend actif, mais tente aussi le backend secondaire.

Fichiers concernés:
- atome/src/squirrel/apis/unified/adole_api/auth.js
- server/auth.js

Comment vérifier:
Tester primary OK/secondary KO, primary KO/secondary OK, et lire `auth.current`.
