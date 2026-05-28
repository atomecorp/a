Plan de correction restant — P6 / diagnostics import / acceptance media desktop-MTrack

Objectif

Ce document liste les taches restantes apres verification de `todo/atome_vital_correction_P5.md`.

P5 n'est pas termine : les garde-fous statiques passent, mais les probes runtime finales echouent encore.

Etat verifie au depart de P6

- `node check-syntax.mjs` passe.
- `node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom` passe.
- `node scripts/check_squirrel_dom_adapter_guardrails.mjs` passe.
- `node --test tests/scripts/check_dom_projection_guardrails.test.mjs tests/scripts/export_dom_subtrees.test.mjs` passe.
- `node --test atome/shared/atome_contract.test.mjs tests/eve/media_atom_integrity.test.mjs tests/eve/media_projection_state.dom_contract.test.mjs` passe.
- `node tests/probes/media_import_probe.test.mjs` echoue.
- `ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs` echoue.

Etat apres correction du 2026-05-28

- [x] Etape 1 terminee : `node tests/probes/media_import_probe.test.mjs` sort avec code 0.
  - Suite courante : `{ "ok": 4, "warning": 0, "error": 0, "missing": 0 }`.
  - Le timeout `window.eveMediaDiagnostics.runFullSuite(...)` est corrige.
  - La probe verifie maintenant explicitement les compteurs de suite et sort proprement apres le teardown navigateur.
- [x] Etape 2 terminee : `ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs` passe les 5 cas desktop.
  - `0000.png` n'est plus absent de l'inventaire desktop.
  - `Jeezs's fire.m4v` n'est plus absent de l'inventaire desktop.
- [x] Etape 3 terminee : le cas MTrack `atome.svg` passe.
- [x] Etape 4 terminee : les 5 cas MTrack passent et la restauration desktop apres fermeture reste valide.
- [ ] Etape 5 non traitee dans cette passe : verifier/corriger le prompteur texte au double click/tap projet.
- [x] Etape 6 traitee pour les probes media : le bruit WebGPU a ete reduit et le comportement d'indisponibilite WebGPU headless est documente dans `maps/`.
  - Note : `No available adapters.` peut encore apparaitre dans l'environnement headless sans adapter WebGPU, mais les probes media passent.

Validations executees avec succes apres correction

```sh
node check-syntax.mjs
node scripts/check_dom_projection_guardrails.mjs --paths tests/fixtures/dom,tests/atom_matrix_example.dom,tests/atome_project_example.dom
node scripts/check_squirrel_dom_adapter_guardrails.mjs
node --test tests/scripts/check_dom_projection_guardrails.test.mjs tests/scripts/export_dom_subtrees.test.mjs
node --test atome/shared/atome_contract.test.mjs tests/eve/media_atom_integrity.test.mjs tests/eve/media_projection_state.dom_contract.test.mjs
node tests/probes/media_import_probe.test.mjs
ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs
```

Resultats observes le 2026-05-28

`media_import_probe.test.mjs`

- L'application demarre et l'auth Fastify passe.
- L'import cree bien 4 atomes :
  - image : `0000.png`;
  - SVG : `atome.svg`;
  - video : `Jeezs's fire.m4v`;
  - audio : `test.m4a`.
- Les 4 atomes sont retrouves dans le DOM.
- `window.eveMediaDiagnostics.scan(...)` trouve les 4 entrees attendues.
- `window.eveMediaDiagnostics.runFullSuite(...)` timeout apres `180000ms`.
- Apres ce timeout, `page.screenshot(...)` timeout aussi apres `30000ms`.
- La console contient plusieurs warnings `No available adapters.`.
- Le run precedent dans `temp/probe_reports/media_import_probe/suite.json` contenait deja :
  - `{ "ok": false, "error": "page_eval_timeout_180000ms" }`.

`browser_media_acceptance_probe.test.mjs`

- L'import initial cree 5 atomes.
- La console ne rapporte pas d'erreurs applicatives dans `report.json`.
- `report.summary.ok` vaut `false`.
- Desktop :
  - total : 5;
  - failed : 2;
  - failed cases : `0000.png`, `Jeezs's fire.m4v`;
  - erreur principale : `desktop_entry_missing`.
- MTrack :
  - total : 5;
  - failed : 3;
  - failed cases : `0000.png`, `atome.svg`, `Jeezs's fire.m4v`.
- Pour `atome.svg`, la fermeture MTrack retourne `ok: true`, le panneau est ferme, et le desktop redevient visible, mais la validation MTrack echoue car `playback_evidence_ready:false`.

Rapports utiles

- `temp/probe_reports/media_import_probe/run.log`
- `temp/probe_reports/media_import_probe/import_result.json`
- `temp/probe_reports/media_import_probe/scan.json`
- `temp/probe_reports/media_import_probe/suite.json`
- `temp/probe_reports/browser_media_acceptance_probe/run.log`
- `temp/probe_reports/browser_media_acceptance_probe/report.json`
- Screenshots dans :
  - `temp/probe_reports/media_import_probe/`
  - `temp/probe_reports/browser_media_acceptance_probe/`

Regle de travail

Ne pas contourner les garde-fous.

Chaque correction doit :

1. traiter la cause racine ;
2. preserver le modele canonique Atome ;
3. eviter de faire du DOM une source de verite ;
4. verifier la console Chrome apres les changements frontend/runtime ;
5. documenter toute decision d'architecture dans `maps/` si le comportement change.

---

Etape 1 — Debloquer `media_import_probe.test.mjs`

Objectif

La probe d'import doit terminer proprement et produire un `suite.json` avec `ok:true`.

Symptome observe

`window.eveMediaDiagnostics.runFullSuite({ atome_ids })` ne retourne pas avant le timeout de `180000ms`.

Fichiers et zones a inspecter

- `tests/probes/media_import_probe.test.mjs`
- `eVe/domains/media/media_diagnostics.js`
- `eVe/domains/media/asset_box.js`
- `eVe/intuition/tools/project_drop.js`
- `eVe/domains/media/api/audio_api.js`
- `eVe/domains/media/api/video_api.js`
- `eVe/core/media_engine/molecule.api.js`
- `eVe/core/media_engine/molecule.js`
- `server/` si upload ou resolution `/api/uploads/*` intervient dans le timeout.

A faire

1. Relancer `node tests/probes/media_import_probe.test.mjs`.
2. Identifier quelle sous-etape de `runFullSuite(...)` ne resout jamais.
3. Ajouter une instrumentation temporaire ou un journal structure dans le rapport de probe si necessaire.
4. Verifier si le blocage vient :
   - de l'image ;
   - du SVG ;
   - de la video ;
   - de l'audio ;
   - d'une attente WebGPU/Molecule ;
   - d'une attente media decode/playback ;
   - d'un screenshot ou d'une capture visuelle.
5. Corriger la cause racine.
6. Supprimer les logs temporaires non autorises.
7. Verifier que `suite.json` est reecrit par le run courant et contient un succes.

Validation

```sh
node tests/probes/media_import_probe.test.mjs
```

La commande doit sortir avec code 0.

---

Etape 2 — Corriger les entrees desktop manquantes dans `browser_media_acceptance_probe.test.mjs`

Objectif

Les 5 medias importes doivent etre retrouves dans l'inventaire desktop initial de la probe.

Symptome observe

Dans `temp/probe_reports/browser_media_acceptance_probe/report.json` :

- `desktop_inventory.entries` ne contient pas `0000.png`;
- `desktop_inventory.entries` ne contient pas `Jeezs's fire.m4v`;
- les cas desktop correspondants echouent avec `desktop_entry_missing`;
- les cas MTrack correspondants echouent aussi avec `desktop_entry_missing`, car ils dependent de l'entree desktop.

Fichiers et zones a inspecter

- `tests/probes/browser_media_acceptance_probe.test.mjs`
- `eVe/domains/media/media_diagnostics.js`
- `eVe/domains/media/asset_box.js`
- `eVe/intuition/tools/project_drop.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/core/media_engine/molecule.api.js`
- `eVe/core/media_engine/molecule.js`

A faire

1. Comparer `import_result.results` et `desktop_inventory.entries`.
2. Verifier pourquoi certains medias importes ne sont pas inventoriés comme entrees desktop.
3. Distinguer :
   - atome non cree ;
   - atome cree mais absent du DOM ;
   - host DOM present mais filtre par l'inventaire ;
   - nom/source non resolu ou normalise differemment ;
   - host masque, detache, membre de groupe, ou hors viewport ;
   - rendu Molecule non pret au moment du scan.
4. Corriger le chemin runtime ou la probe si la probe attend une propriete obsolete.
5. Ne pas masquer l'echec en augmentant seulement les timeouts.

Validation

```sh
ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs
```

Les cas desktop `0000.png` et `Jeezs's fire.m4v` ne doivent plus echouer avec `desktop_entry_missing`.

---

Etape 3 — Corriger l'acceptance MTrack SVG

Objectif

Le cas MTrack `atome.svg` doit fournir une evidence media/playback suffisante pour passer la probe.

Symptome observe

Pour `atome.svg` :

- `wait_ready_ok:true`;
- `observed_ready_ok:true`;
- `observed_clip_count:1`;
- `media_ready_ok:true`;
- `close.ok:true`;
- `closed.ok:true`;
- `desktop_after_close_visible:true`;
- mais `playback_evidence_ready:false`.

Interpretation

La restauration desktop apres fermeture MTrack semble fonctionner pour ce cas, mais l'evidence de lecture/rendu attendue par la probe n'est pas satisfaite.

Fichiers et zones a inspecter

- `tests/probes/browser_media_acceptance_probe.test.mjs`
- `eVe/domains/mtrax/ui/panel_lifecycle_runtime.js`
- `eVe/domains/mtrax/media/atome_runtime.js`
- `eVe/domains/mtrax/media/drop_runtime.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/core/media_engine/molecule.api.js`
- `eVe/core/media_engine/molecule.js`

A faire

1. Lire dans le rapport complet la section `mtrack["atome.svg"]`.
2. Identifier la condition exacte qui produit `playback_evidence_ready:false`.
3. Verifier si un SVG doit produire une evidence de lecture, une evidence de frame rendue, ou une evidence de preview stable.
4. Corriger le runtime si le SVG est effectivement pret mais ne publie pas le bon etat.
5. Corriger la probe seulement si elle impose une evidence video/audio inadaptee a un media statique.
6. Confirmer que la fermeture MTrack garde `desktop_after_close_visible:true`.

Validation

```sh
ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs
```

Le cas MTrack `atome.svg` doit passer.

---

Etape 4 — Revalider la restauration desktop apres fermeture MTrack

Objectif

La correction P5 sur la restauration desktop ne doit pas regresser.

A verifier

Pour chaque cas MTrack :

- `close.ok:true`;
- `closed.ok:true`;
- `desktop_after_close_wait.ok:true`;
- `desktop_after_close_visible:true`;
- aucun host desktop ne reste masque, detache, hors viewport, ou bloque sous un layer MTrack.

Fichiers et zones a inspecter

- `eVe/intuition/eVeIntuition.js`
- `eVe/domains/mtrax/ui/panel_lifecycle_runtime.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `tests/probes/browser_media_acceptance_probe.test.mjs`

Validation

```sh
ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs
```

Les 5 cas MTrack doivent passer.

---

Etape 5 — Verifier le prompteur texte au double click/tap projet

Objectif

Confirmer que le bug P5 du prompteur texte est corrige ou, si ce n'est pas le cas, le corriger dans P6.

Comportement cible

- Le prompteur texte apparait directement au point double clique/tape.
- Aucun saut visuel.
- Aucune position intermediaire incorrecte.
- Desktop souris et mobile/tactile coherents.

Fichiers et zones probables

- `eVe/intuition/eVeIntuition.js`
- `eVe/intuition/tools/project_drop.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/intuition/tools/core/tool_runtime.js`
- `eVe/core/atome_events/text_creation_session.js`
- handlers double click / double tap projet.

A faire

1. Identifier le handler exact du double click/double tap projet.
2. Verifier la position canonique envoyee a la creation texte.
3. Verifier la premiere position visible du host texte.
4. Ajouter ou ajuster une probe Playwright ciblee si aucune validation automatique n'existe.
5. Confirmer la console Chrome sans erreur ni warning applicatif.

Validation minimale

```sh
node check-syntax.mjs
```

Validation navigateur attendue

- Double click sur plusieurs points du projet.
- Verifier que le prompteur texte apparait directement au point clique.
- Repeter en viewport mobile/tactile si possible.

---

Etape 6 — Nettoyer la console Chrome

Objectif

Les validations navigateur ne doivent pas contenir d'erreur ni warning applicatif non autorise.

Warnings observes

- `No available adapters.`

Logs autorises observes

- `eVe Version : 0.OO5`
- `atome version : 1.5.0.19`
- `[squirrel-audio-wasm] Audio engine initialized`

A faire

1. Identifier la source de `No available adapters.`.
2. Determiner si le warning est normal dans l'environnement de test ou signale un vrai fallback non desire.
3. Si normal, le documenter explicitement dans la probe ou dans un fichier `maps/`.
4. Si anormal, corriger la cause.

---

Validation finale globale

P6 est termine seulement quand toutes les commandes suivantes passent :

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

- Lancer un Chrome de test.
- Verifier la console.
- Confirmer qu'aucune erreur ni warning applicatif non autorise ne reste.
- Verifier manuellement ou par probe le double click/tap de creation texte.

Definition de termine

P6 est termine seulement si :

- `media_import_probe.test.mjs` termine sans timeout ;
- `browser_media_acceptance_probe.test.mjs` passe les 5 cas desktop et les 5 cas MTrack ;
- `0000.png` et `Jeezs's fire.m4v` ne sont plus absents de l'inventaire desktop ;
- `atome.svg` passe l'acceptance MTrack ;
- la restauration desktop apres fermeture MTrack reste valide ;
- le prompteur texte apparait directement au point double clique/tape ;
- les garde-fous DOM restent au vert ;
- la console Chrome est propre ou les logs acceptes sont explicitement documentes.

---

Prompt de reprise conseille

```text
Lis `todo/atome_vital_correction_P6.md` et traite la tache de bout en bout.

Commence par relancer :

1. `node tests/probes/media_import_probe.test.mjs`
2. `ADOLE_TEST_URL=http://127.0.0.1:3001 node tests/probes/browser_media_acceptance_probe.test.mjs`

Utilise les rapports dans `temp/probe_reports/media_import_probe/` et `temp/probe_reports/browser_media_acceptance_probe/`.

Objectifs prioritaires :

- trouver pourquoi `window.eveMediaDiagnostics.runFullSuite(...)` timeout ;
- trouver pourquoi `0000.png` et `Jeezs's fire.m4v` sont absents de `desktop_inventory.entries` ;
- corriger l'echec MTrack `atome.svg` ou `playback_evidence_ready:false` ;
- confirmer ou corriger le placement initial du prompteur texte au double click/tap projet ;
- garder le modele Atome canonique et ne pas faire du DOM une source de verite.

Ne considere la tache terminee que si toutes les validations finales de P6 passent, console Chrome incluse.
```
