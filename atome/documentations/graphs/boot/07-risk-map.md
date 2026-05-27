# Risk Map - boot

| Niveau | Type | Fichier | Fonction | Probleme | Impact possible | Preuve | Action recommandee |
|---|---|---|---|---|---|---|---|
| High | PERFORMANCE_BLOCKER | eVe/eVe.js / module_loader_runtime.js | `loadModulesSequentially` | Modules eVe charges strictement en serie. | Boot ralenti par modules non critiques. | eVe.js:7-28; module_loader_runtime.js:21-25 | Identifier modules lazy-loadables. |
| High | ASYNC_RISK | eVe/intuition/bootstrap.js | `bootstrapIntuition` | Permissions capture lancees en `void`. | Etat permissions arrive apres UI/projet. | bootstrap.js:14 | Exposer statut ou reporter hors boot critique. |
| High | CONFLICT | atome/src/squirrel/kickstart.js / project_bootstrap.js | `squirrel:ready` / auth wait | Ready UI peut arriver avant auth connue. | Projet non charge ou clear/reload successifs. | kickstart.js:42; project_bootstrap.js:819-855 | Garder auth gate comme autorite unique. |
| Medium | PARTIAL_LIFECYCLE | eVe/eVe.js | IIFE module load | Une erreur d'import stoppe le chargement complet. | Boot partiel sans recovery. | eVe.js:27-35 | Classer modules critiques vs optionnels. |
| Medium | ASYNC_RISK | atome/src/squirrel/kickstart.js | `loadRuntimeVersions` | Fetch versions reseau parallele au boot. | Logs/version globals tardifs. | kickstart.js:177-243 | Ne pas bloquer UI, garder statut observable. |
| Unknown | LEGACY_PATH | atome/src/squirrel/squirrel.js | ready/DOMContentLoaded retries | Attachements DOM peuvent se faire sur plusieurs events. | Double init UI si guards incomplets. | squirrel.js:275-300 | Verifier idempotence des helpers DOM. |
