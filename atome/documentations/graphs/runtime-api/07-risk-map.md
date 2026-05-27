# Risk Map - runtime-api

| Niveau | Type | Fichier | Fonction | Probleme | Impact possible | Preuve | Action recommandee |
|---|---|---|---|---|---|---|---|
| Critical | GLOBAL_STATE | eVe/domains/mtrax/api/window_api_runtime.js / eVe/core/media_engine/molecule.api.js | window APIs | `window.eveMtrackApi`, `window.Molecule`, `window.eveMediaApi` sont globaux. | Owner/runtime stale ou collisions. | window_api_runtime.js:915-917; molecule.api.js:660-665 | Ajouter owner/version/clear contract. |
| High | MULTI_SOURCE_OF_TRUTH | eVe/intuition/runtime/panel_api.js / group_timeline_api.js | singletons | APIs module singletons clonées sans lifecycle owner. | Appels vers API ancienne apres reinit. | panel_api.js:10-16; group_timeline_api.js:10-16 | Stocker owner et generation. |
| High | CONFLICT | eVe/core/media_engine/molecule.api.js / eVe/intuition/tools/molecule/runtime.js | `window.Molecule` vs molecule runtime | `window.Molecule` est media API, pas timeline/session API. | Confusion API publique molecule. | molecule.api.js:660-665; molecule/runtime.js:226 | Renommer/documenter surfaces. |
| Medium | ASYNC_RISK | eVe/intuition/runtime/tool_gateway.js | `invokeToolGateway` | Gateway route vers runtime warmup/delegates async. | UI latched avant mutation terminee. | tool_gateway.js:146-151,269 | Propager et attendre resultats critiques. |
| Medium | PARTIAL_LIFECYCLE | eVe/domains/mtrax/api/window_api_runtime.js | `createMtrackWindowApiRuntime` | Pas de clear global visible pour `eveMtrackApi`. | API exposee apres dispose panneau. | window_api_runtime.js:917 | Ajouter dispose global ou statut inactive. |
| Unknown | CYCLE_RISK | eVe/intuition/tools/core/tool_runtime.js / panel_api.js | panels/tools | Tool runtime appelle panel API qui peut resynchroniser tool state. | Boucle latched/open-close. | tool_runtime.js:402; panel_api.js:64 | Tracer `eve:tool-state-changed`. |
