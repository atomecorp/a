# Open Questions - media-recording

## UNKNOWN-001

Question:
Qui stoppe les recorders quand le panneau mtrax/molecule est ferme ?

Pourquoi c'est important:
Un enregistrement ouvert sans cleanup est un `PARTIAL_LIFECYCLE` critique.

Fichiers concernés:
- eVe/domains/mtrax/media/record_capture_runtime.js
- eVe/domains/mtrax/ui/panel_lifecycle_runtime.js

Comment vérifier:
Relier les appels de fermeture panneau aux fonctions `stopMediaRecorderRuntime`, `finalizeTrackSession` ou equivalents.

## UNKNOWN-002

Question:
Quel est le resultat attendu quand audio et video ne demarrent pas tous les deux ?

Pourquoi c'est important:
`startRecorderBatch` peut demarrer un runtime puis devoir stopper en cas d'echec de l'autre source.

Fichiers concernés:
- eVe/domains/mtrax/media/record_capture_runtime.js

Comment vérifier:
Tester permission audio accordee/video refusee, puis video accordee/audio refusee.

## UNKNOWN-003

Question:
Les erreurs `sourceErrors` sont-elles affichees ou uniquement journalisees ?

Pourquoi c'est important:
Un utilisateur peut croire l'enregistrement reussi alors qu'une source a echoue.

Fichiers concernés:
- eVe/domains/mtrax/media/record_capture_runtime.js

Comment vérifier:
Tracer le retour de `persistRecorderResultsToTracks` jusqu'a l'API/UI record.
