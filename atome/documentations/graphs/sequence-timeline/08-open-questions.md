# Open Questions - sequence-timeline

## UNKNOWN-001

Question:
Quelle horloge est canonique pendant playback: hmtracks audio, RAF visuel, host follow ou media element ?

Pourquoi c'est important:
Les graphes montrent plusieurs sources qui peuvent piloter ou corriger le playhead.

Fichiers concernés:
- eVe/domains/mtrax/timeline/playback_frame_update_runtime.js
- eVe/domains/mtrax/transport/host_follow_runtime.js
- eVe/domains/mtrax/timeline/play_runtime.js

Comment vérifier:
Tracer un playback audio+video avec host follow actif et comparer les timestamps.

## UNKNOWN-002

Question:
Tous les RAF/timers timeline sont-ils annules sur close ?

Pourquoi c'est important:
Un frame update apres close peut modifier un state dormant.

Fichiers concernés:
- eVe/domains/mtrax/project/project_playback_timeline_runtime.js
- eVe/domains/mtrax/project/project_record_sampler_runtime.js
- eVe/domains/mtrax/ui/panel_lifecycle_runtime.js

Comment vérifier:
Chercher les cancel RAF correspondants et tester open/play/close rapide.

## UNKNOWN-003

Question:
Le panneau historique `timeline.js` partage-t-il l'etat avec mtrax ou un autre `window.Atome.timeline` ?

Pourquoi c'est important:
Il peut fournir une route concurrente de lecture/play/pause.

Fichiers concernés:
- eVe/intuition/tools/timeline.js
- eVe/intuition/runtime/group_timeline_api.js

Comment vérifier:
Identifier l'objet `window.Atome.timeline` installe au boot.
