Plan de correction restant — P5 / import fichiers / placement du prompteur texte

Objectif

Ce document liste les tâches restantes après le traitement partiel de `todo/atome_vital_correction_P4.md`.

Les corrections P4 DOM/export et plusieurs corrections runtime MTrack/Molecule ont été appliquées, mais la validation finale n'est pas encore complète.

Etat vérifié au départ de P5

- Les garde-fous DOM passent sur les fixtures maintenues.
- Les exports `.dom` d'exemple ont été ramenés à des sous-arbres auditables.
- La fermeture MTrack ne bloque plus indéfiniment.
- Molecule résout mieux le type média réel quand l'hôte DOM est un `group`.
- La fin naturelle de lecture Molecule ne doit plus remettre la position à `0`.
- `stopVoice()` doit être idempotent quand la voix audio est déjà absente.
- La probe d'acceptance media a été ajustée pour ne pas attendre au-delà de la durée réelle des médias courts.

Blocage restant observé

La validation Chrome/Fastify finale échoue encore dans `tests/probes/browser_media_acceptance_probe.test.mjs`.

Symptôme principal :

- après fermeture MTrack de `0000.png`, le panneau MTrack est bien fermé ;
- `closeGroupTimeline()` retourne `ok: true` ;
- mais le groupe desktop n'est pas retrouvé visible ensuite ;
- le cas suivant (`atome.svg`) timeout en attendant son host desktop.

Il faut corriger la restauration desktop après `eve:mtrack-panel-closed`, pas simplement augmenter les délais de la probe.

Commandes de validation déjà utiles

```sh
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
node scripts/check_squirrel_dom_adapter_guardrails.mjs
node --test tests/scripts/check_dom_projection_guardrails.test.mjs tests/scripts/export_dom_subtrees.test.mjs
node check-syntax.mjs
ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs
node tests/probes/media_import_probe.test.mjs
```

Regle de travail

Ne pas contourner les garde-fous.

Chaque correction doit :

1. traiter la cause racine ;
2. préserver le modele canonique Atome ;
3. eviter de faire du DOM une source de verite ;
4. verifier la console Chrome apres les changements frontend/runtime ;
5. documenter toute decision d'architecture dans `maps/` si le comportement change.

---

Etape 1 — Terminer la restauration desktop apres fermeture MTrack

Objectif

Quand un media est ouvert dans MTrack puis ferme, le groupe desktop correspondant doit reapparaitre correctement et immediatement dans le projet.

Symptome observe

Dans `browser_media_acceptance_probe.test.mjs`, le premier cas image echoue cote MTrack :

- `open`: ok ;
- `ready`: ok ;
- `close`: ok ;
- `closed`: ok ;
- `desktop_after_close_visible`: false.

Hypotheses a verifier

- `eve:mtrack-panel-closed` declenche bien `cleanupClosedMtrackGroupHost(closedGroupId)`, mais le refresh visuel ne restaure pas le host attendu.
- `persistGroupPreviewSnapshotById()` ou `refreshGroupVisual()` peut etre trop lent, non deterministe, ou peut echouer silencieusement.
- Le dock/undock MTrack peut detacher le panneau sans reattacher/restaurer le host projet attendu.
- Le host existe peut-etre mais reste invisible, sous un layer, ou hors viewport.

Fichiers a inspecter

- `eVe/intuition/eVeIntuition.js`
- `eVe/domains/mtrax/ui/panel_lifecycle_runtime.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `tests/probes/browser_media_acceptance_probe.test.mjs`
- `temp/probe_reports/browser_media_acceptance_probe/0000.png_mtrack.json`

A faire

1. Instrumenter proprement le chemin de fermeture si necessaire, sans logs permanents non autorises.
2. Verifier l'etat du host desktop juste apres :
   - `closeGroupTimeline()`;
   - evenement `eve:mtrack-panel-closed`;
   - `cleanupClosedMtrackGroupHost()`;
   - `persistGroupPreviewSnapshotById()`;
   - `refreshGroupVisual()`.
3. Corriger le chemin qui laisse le host invisible ou non restaure.
4. Ajouter ou ajuster un test/probe ciblé pour verrouiller la regression.

Validation

```sh
ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs
```

La probe doit passer les 5 cas desktop et les 5 cas MTrack.

---

Etape 2 — Verifier et reparer l'import de fichiers

Objectif

L'import de fichiers ne fonctionne plus correctement. Il faut verifier tout le flux d'import et corriger la cause racine.

Scenarios a verifier

- import image ;
- import SVG ;
- import video `.m4v` ;
- import audio `.m4a` ;
- import multiple dans la meme session ;
- import apres fermeture MTrack ;
- import apres login/auth Fastify ;
- import avec `localhost`, `127.0.0.1:3000` et `127.0.0.1:3001` si les probes ciblent plusieurs serveurs.

Fichiers et zones probables

- `tests/probes/media_import_probe.test.mjs`
- `tests/probes/browser_media_acceptance_probe.test.mjs`
- `eVe/domains/media/media_diagnostics.js`
- `eVe/domains/media/asset_box.js`
- `eVe/intuition/tools/project_drop.js`
- `eVe/domains/media/api/audio_api.js`
- `eVe/domains/media/api/video_api.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/core/media_engine/molecule.api.js`
- `eVe/core/media_engine/molecule.js`
- `server/` si l'upload ou la resolution `/api/uploads/*` echoue.

A faire

1. Relancer `media_import_probe.test.mjs` et lire :
   - `temp/probe_reports/media_import_probe/run.log`;
   - `temp/probe_reports/media_import_probe/suite.json`;
   - les screenshots si disponibles.
2. Distinguer :
   - echec d'auth/login ;
   - echec upload ;
   - echec creation Atome ;
   - echec projection DOM ;
   - echec montage Molecule ;
   - echec acceptance visuelle.
3. Corriger les chemins d'import obsoletes ou incoherents.
4. Verifier qu'aucun chemin `/eve/application/...` obsolete ne reste dans les probes ou modules actifs.
5. Verifier que les imports creent des Atomes canoniques et que le DOM reste une projection.

Validation

```sh
node tests/probes/media_import_probe.test.mjs
ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs
```

La console Chrome ne doit pas contenir d'erreur ni warning applicatif.

---

Etape 3 — Corriger le placement initial du prompteur texte au double click/tap projet

Objectif

Quand l'utilisateur double click/double tap sur le projet pour creer un nouveau texte, le prompteur de texte doit apparaitre immediatement au point double clique.

Bug observe

Au premier rendu, le prompteur est cree avec un decalage en haut a gauche du point de double click/tap.

Ensuite seulement, il se repositionne au bon endroit.

Le comportement cible est :

- aucun saut visuel ;
- aucune position intermediaire incorrecte ;
- le prompteur apparait directement au point clique/tape ;
- desktop souris et mobile/tactile doivent etre coherents.

Fichiers et zones probables

- `eVe/intuition/eVeIntuition.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/intuition/tools/project_drop.js`
- modules de creation texte ou edition inline dans `eVe/intuition/tools/`
- handlers double click / double tap projet
- logique de conversion coordonnees viewport -> projet/layer
- logique de focus/selection apres creation texte.

Hypotheses a verifier

- Le texte est d'abord cree avec une position par defaut, puis repositionne apres mesure du DOM.
- La conversion coordonnees client/projet est appliquee apres creation au lieu d'etre dans la commande initiale.
- Le host projet ou le layer de montage utilise un offset different du layer final.
- Le prompteur est cree avant que le scale/transform du projet soit pris en compte.
- Le double tap mobile et le double click desktop ne passent pas par le meme normaliseur de coordonnees.

A faire

1. Identifier le handler exact du double click/double tap projet.
2. Tracer les coordonnees disponibles :
   - `clientX/clientY`;
   - rect du projet ;
   - rect du layer ;
   - scroll ;
   - scale/zoom ;
   - position canonique envoyee a `createAtome`.
3. Corriger la commande de creation pour passer la position finale des le premier rendu.
4. Eviter tout repositionnement apres coup si la position peut etre calculee avant creation.
5. Ajouter une probe Playwright ou un test ciblé qui double click/tap et verifie que la premiere position visible est correcte.

Validation minimale

```sh
node check-syntax.mjs
```

Validation attendue avec navigateur

- Ouvrir l'app dans Chrome de test.
- Double click sur plusieurs points du projet.
- Verifier que le prompteur texte apparait directement au point clique.
- Verifier la console : aucune erreur ni warning.
- Repeter sur un viewport mobile/tactile si possible.

---

Etape 4 — Validation finale globale

Objectif

Considerer P5 termine seulement quand les validations suivantes passent.

Commandes

```sh
node check-syntax.mjs
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
node scripts/check_squirrel_dom_adapter_guardrails.mjs
node --test tests/scripts/check_dom_projection_guardrails.test.mjs tests/scripts/export_dom_subtrees.test.mjs
node --test atome/shared/atome_contract.test.mjs tests/eve/media_atom_integrity.test.mjs tests/eve/media_projection_state.dom_contract.test.mjs
node tests/probes/media_import_probe.test.mjs
ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs
```

Validation navigateur

A chaque etape runtime/frontend :

- lancer un Chrome de test ;
- verifier la console ;
- aucune erreur ni warning applicatif ne doit rester ;
- noter explicitement les logs autorises, par exemple les logs de version.

Definition de termine

P5 est termine seulement si :

- la restauration desktop apres fermeture MTrack fonctionne ;
- l'import de fichiers fonctionne a nouveau pour image/SVG/video/audio ;
- le prompteur texte apparait directement au point double clique/tape ;
- les probes finales passent ;
- les garde-fous DOM restent au vert ;
- la console Chrome est propre.
