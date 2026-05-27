# Risk Map - project-loading

| Niveau | Type | Fichier | Fonction | Probleme | Impact possible | Preuve | Action recommandee |
|---|---|---|---|---|---|---|---|
| High | ASYNC_RISK | eVe/intuition/tools/project_bootstrap.js | `ensureCurrentProject` | `loadProjectAtomes` est lance en stale-first detache. | Ancien projet rendu apres changement auth/logout. | project_bootstrap.js:645,775 | Ajouter generation/user guard autour du rendu asynchrone. |
| High | MULTI_SOURCE_OF_TRUTH | eVe/intuition/tools/project_bootstrap.js | project selection | Projet courant vient de saved, list, window, setCurrent. | Mauvais projet actif ou duplication. | project_bootstrap.js:636-765 | Definir une autorite unique apres auth. |
| High | CONFLICT | eVe/domains/mtrax/project/commit_bridge_runtime.js | `handleRemoteAtomeChanged` | Reload remote peut concurrencer commit local. | Perte de mutation locale ou reload stale. | commit_bridge_runtime.js:43-72,161 | Verifier garde local tx et queue remote. |
| Medium | ASYNC_RISK | eVe/intuition/tools/project_bootstrap.js | `waitForAuthCheck` | Timeout force unauth apres 4s. | Aucun projet charge si auth lente. | project_bootstrap.js:170 | Rendre l'etat timeout visible et relancer apres auth tardive. |
| Medium | PARTIAL_LIFECYCLE | eVe/intuition/tools/project_bootstrap.js | logout/clear | Clear peut arriver pendant load/list/create. | DOM vide puis rehydrate par promesse ancienne. | project_bootstrap.js:921-992 | Annuler ou tagger les operations par session auth. |
| Unknown | LEGACY_PATH | server/githubSync.js | offline changes | Offline conflict resolution signale indisponible. | Sync online/offline non resolue. | githubSync.js:419-424 | Cartographier la sync si elle impacte projets. |
