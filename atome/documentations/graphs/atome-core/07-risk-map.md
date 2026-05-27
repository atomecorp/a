# Risk Map - atome-core

| Niveau | Type | Fichier | Fonction | Probleme | Impact possible | Preuve | Action recommandee |
|---|---|---|---|---|---|---|---|
| Critical | MULTI_SOURCE_OF_TRUTH | eVe/core/atome_commit.js / database/schema.sql / selection.js | atome state | Events, state_current, particles, DOM, selection globals et timeline cache coexistent. | Etat fantome ou UI stale. | schema.sql:147-175; atome_commit.js:1885; selection.js:107-110 | Definir projection canonique et invalidation. |
| High | ASYNC_RISK | eVe/core/atome_commit.js | `commit` / `commitBatch` | Fastify mirror non bloquant apres commit Tauri. | Backends divergents. | atome_commit.js:1846-1865,2008 | Exposer statut mirror ou reconciliation. |
| High | PERFORMANCE_BLOCKER | eVe/core/atome_commit.js | gesture commit | Gesture frames broadcast/mirror/throttle/batch. | Saturation commit/replay. | atome_commit.js:63-87,1778 | Mesurer debit et backpressure. |
| Medium | CONFLICT | eVe/intuition/runtime/selection.js | selection | SelectionAPI et globals window sont tous deux sources. | Mauvais atome cible pour outils. | selection.js:7,107-110,288 | Unifier lecture selection. |
| Medium | SILENT_ERROR | eVe/core/event_bus.js | `emit` | Erreurs handlers avalees. | Listener casse sans diagnostic. | event_bus.js:45-55 | Log en mode debug avec compteur. |
| Unknown | CYCLE_RISK | eVe/core/atome_timeline.js / atome_commit.js | timeline replay | Timeline peut appliquer commits qui emettent events relus. | Boucle replay/commit. | atome_timeline.js imports commitBatch; atome_commit.js eventBus | Verifier guards `previewApplyInFlight` et scopes. |
