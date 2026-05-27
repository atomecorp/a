# Open Questions - atome-core

## UNKNOWN-001

Question:
Quelle source doit etre consideree canonique pour lire un atome courant: `state_current`, DOM ou `window.Atome.getStateCurrent` ?

Pourquoi c'est important:
Les outils utilisent plusieurs chemins de lecture.

Fichiers concernés:
- eVe/core/atome_commit.js
- eVe/core/atome_timeline.js
- eVe/intuition/tools/core/tool_runtime.js

Comment vérifier:
Tracer un commit puis comparer DOM, state_current et API apres latence reseau.

## UNKNOWN-002

Question:
Comment detecter une divergence durable entre Tauri et Fastify apres mirror non bloquant ?

Pourquoi c'est important:
Le commit principal peut reussir alors que le mirror echoue.

Fichiers concernés:
- eVe/core/atome_commit.js
- atome/src/squirrel/apis/unified/adole.js

Comment vérifier:
Forcer Fastify offline pendant commit Tauri et inspecter reconciliation.

## UNKNOWN-003

Question:
La timeline replay peut-elle relancer des commits observes comme nouveaux events ?

Pourquoi c'est important:
Cela creerait un cycle de vie historique difficile a debugger.

Fichiers concernés:
- eVe/core/atome_timeline.js
- eVe/core/atome_commit.js

Comment vérifier:
Tracer undo/redo timeline avec `eventBus` et verifier les tx_id.
