# Risk Map - media-recording

| Niveau | Type | Fichier | Fonction | Probleme | Impact possible | Preuve | Action recommandee |
|---|---|---|---|---|---|---|---|
| Critical | ASYNC_RISK | eVe/domains/mtrax/media/record_capture_runtime.js | `stopMediaRecorderRuntime` | Stop/finalize depend d'events async ou d'un timeout. | Clip vide, resultat partiel ou sourceErrors. | record_capture_runtime.js:402-468 | Auditer tous les chemins stop/timeout et rendre l'etat final observable. |
| High | PARTIAL_LIFECYCLE | eVe/domains/mtrax/media/record_capture_runtime.js | recorder sessions | Pas de lien prouve avec fermeture panneau/session. | Micro/camera/native recorder actif apres close. | start runtime.js:632; close path UNKNOWN | Appeler stop/cancel depuis le lifecycle panneau. |
| High | MULTI_SOURCE_OF_TRUTH | eVe/domains/mtrax/media/record_capture_runtime.js | `persistRecorderResultsToTracks` | Resultat vit dans stream, runtime, blob, clip et persistence. | Divergence entre enregistrement capture et timeline. | record_capture_runtime.js:741-854 | Definir un etat canonique par phase. |
| Medium | ASYNC_RISK | eVe/domains/mtrax/media/record_capture_runtime.js | `persistRecorderResultsToTracks` | `void flushActiveGroupTimelinePersist`. | Clip visible avant persistence confirmee. | record_capture_runtime.js:852-854 | Await ou exposer un statut pending. |
| Medium | SILENT_ERROR | eVe/domains/mtrax/media/record_capture_runtime.js | `persistRecorderResultsToTracks` | `sourceErrors` accumules sans forcement echouer globalement. | Enregistrement partiellement perdu. | record_capture_runtime.js:752-806 | Remonter les erreurs par UI/API. |
| Unknown | CONFLICT | eVe/domains/mtrax/media/record_capture_runtime.js | audio/video simultaneous | Audio browser + video native/browser peuvent partager une intention. | Tracks desynchronises. | record_capture_runtime.js:641-724 | Verifier le contrat audio+video pour une seule intention. |
