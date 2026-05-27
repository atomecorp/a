# Risk Map - user-login

| Niveau | Type | Fichier | Fonction | Probleme | Impact possible | Preuve | Action recommandee |
|---|---|---|---|---|---|---|---|
| High | MULTI_SOURCE_OF_TRUTH | atome/src/squirrel/apis/unified/adole_api/session.js / auth.js / project_bootstrap.js | auth state | Session existe dans local state, storage, window globals, adapters, cookies. | UI/projet charge pour mauvais user. | session.js:87-109,145-190; auth.js:592-599 | Definir une autorite et propager par events idempotents. |
| High | ASYNC_RISK | atome/src/squirrel/apis/unified/adole_api/auth.js | `login` | Sync locale vers Fastify lancee en `.catch` detache. | Projets locaux pas migres au moment du chargement. | auth.js:585 | Exposer pending sync au bootstrap projet. |
| High | CONFLICT | atome/src/squirrel/apis/unified/adole_api/auth.js / project_bootstrap.js | anonymous/login | Migration anonymous et bootstrap projet peuvent se chevaucher. | Projet welcome/anonyme conserve ou duplique. | auth.js:516,573; project_bootstrap.js:668-724 | Serialiser login/migration/bootstrap. |
| Medium | ASYNC_RISK | eVe/intuition/tools/project_bootstrap.js | auth wait | Timeout auth peut produire unauth avant reponse tardive. | Vue projet vide temporaire ou retry. | project_bootstrap.js:170 | Suivre un numero de generation auth. |
| Medium | PARTIAL_LIFECYCLE | atome/src/squirrel/apis/unified/adole_api/session.js | `setSessionState` | Changement user emet logout puis login; handlers peuvent interagir. | Clear-view apres login si ordre mal gere. | session.js:170-190 | Auditer ordre des listeners. |
| Unknown | SILENT_ERROR | server/auth.js | server auth routes | Plusieurs catch/logs serveur nettoient sans remonter certains details. | Debug login difficile. | server/auth.js:1182,1203 et zones catch | Verifier reponses client standardisees. |
