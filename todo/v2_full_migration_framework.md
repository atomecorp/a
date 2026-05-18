# Tache - Migration complete framework eVe vers V2

## Constat audit (code actif)

Le framework n est pas encore 100% V2.
Les traces V1 encore actives sont principalement des bridges de compatibilite:

1. API legacy menu encore referencee: `window.eveGoeyMenuApi`
2. Alias menu legacy encore reference: `new_menu` / `window.new_menu`
3. IDs DOM legacy encore utilises: `_intuition_*` (hors `_intuition_v2_*`)
4. Contrats encore nommes V1: `TOOL_INSTANCE_CONTRACT_V1`, `TOOL_SKIN_CONTRACT_V1`
5. Cles de persistance nommees `*_v1` encore presentes

## Fichiers detectes (prioritaires)

1. `src/application/eVe/intuition/eVeIntuition.js`
2. `src/application/eVe/intuition/matrix/core/matrix_runtime.js`
3. `src/application/eVe/intuition/tools/user.js`
4. `src/application/eVe/intuition/tools/infos.js`
5. `src/application/eVe/intuition/tools/communication.js`
6. `src/application/eVe/intuition/tools/activities.js`
7. `src/application/eVe/intuition/tools/mtrack.js`
8. `src/application/eVe/intuition/tools/core/tool_reveal_behavior.js`
9. `src/application/eVe/intuition/tools/perform.js`
10. `src/application/eVe/intuition/tools/capture.js`
11. `src/application/eVe/intuition/tools/debug.js`
12. `src/application/eVe/intuition/tools/project_drop.js`
13. `src/application/eVe/intuition/tools/core/tool_runtime.js`
14. `src/application/eVe/intuition/contracts/contracts.js`
15. `src/application/eVe/intuition/contracts/index.js`

## Plan de finalisation V2 (a faire)

## 1. Supprimer les bridges `eveGoeyMenuApi`

[ ] Remplacer tous les appels `window.eveGoeyMenuApi.*` par `window.new_menu_v2.*` ou par les events runtime V2.
[ ] Supprimer les branches `if (window.eveGoeyMenuApi)` dans:
`eVeIntuition.js`, `user.js`, `infos.js`, `communication.js`, `matrix_runtime.js`, `tool_reveal_behavior.js`, `mtrack.js`, `activities.js`.
[ ] Garder un unique point d acces menu: `new_menu_v2`.

## 2. Supprimer alias legacy `new_menu`

[ ] Arreter d exporter/consommer `new_menu` et garder uniquement `new_menu_v2`.
[ ] Migrer les appels dans:
`perform.js`, `activities.js`, `capture.js`, `debug.js`, `project_drop.js`, `eVeIntuition.js`.
[ ] Supprimer `window.new_menu = new_menu_v2` si plus aucun consommateur legacy.

## 3. Normaliser tous les IDs tools en `_intuition_v2_*`

[ ] Retirer les fallback `document.getElementById('_intuition_*')` legacy.
[ ] Uniformiser les `dom_id` des tools en `_intuition_v2_*`.
[ ] Corriger en priorite:
`eVeIntuition.js`, `communication.js`, `clock.js`, `capture.js`, `tool_runtime.js`, `matrix_runtime.js`, `user.js`, `infos.js`.
[ ] Ajouter une passe de migration DOM si necessaire (mapping ancien id -> nouveau id), puis supprimer le mapping.

## 4. Nettoyer les APIs clone/outils legacy

[ ] Remplacer les fallback `toolClone` legacy dans:
`communication.js`, `mtrack.js`.
[ ] Utiliser uniquement l API clone V2 (`eveToolCloneApi`/pipeline V2 officiel).

## 5. Renommer les contrats V1 encore exposes

[ ] Renommer `TOOL_INSTANCE_CONTRACT_V1` et `TOOL_SKIN_CONTRACT_V1`
en noms neutres/V2 coherents dans:
`contracts/contracts.js`, `contracts/index.js`.
[ ] Mettre a jour les imports consommateurs.

## 6. Migrer les cles de persistance `*_v1`

[ ] Inventorier et migrer les cles en suffixe `v2`:
`public_user_directory_cache_v1`, `eve.goey.desktop.v1`, etc.
[ ] Ajouter migration one-shot a la lecture (v1 -> v2), puis ecriture uniquement en v2.
[ ] Supprimer la lecture v1 apres une fenetre de transition definie.

## 7. Isoler ou retirer le legacy hors runtime

[ ] Verifier que `src/application/eVe/intuition___prev` n est jamais importe en runtime.
[ ] Deplacer en archive/documentation si necessaire pour eviter toute confusion.

## 8. Ajouter garde-fous CI anti regression V1

[ ] Ajouter un check CI qui echoue si un nouveau code introduit:
`eveGoeyMenuApi`, `window.new_menu`, `_intuition_` legacy, `TOOL_*_V1`.
[ ] Ajouter une commande audit unique (npm script) pour valider le statut V2.

## Definition of Done (100% V2)

Les commandes suivantes doivent retourner 0 occurrence dans `src/application/eVe/intuition` (hors `intuition_prev`):

1. `rg "eveGoeyMenuApi" src/application/eVe/intuition --glob '!src/application/eVe/intuition___prev/**'`
2. `rg "\\bnew_menu\\b|window\\.new_menu\\b" src/application/eVe/intuition --glob '!src/application/eVe/intuition___prev/**'`
3. `rg -P "_intuition_(?!v2_)" src/application/eVe/intuition --glob '!src/application/eVe/intuition___prev/**'`
4. `rg "TOOL_INSTANCE_CONTRACT_V1|TOOL_SKIN_CONTRACT_V1" src/application/eVe/intuition --glob '!src/application/eVe/intuition___prev/**'`

En complement:

5. Smoke test UI: ouverture/fermeture des panels principaux, drag/drop tools, palettes, toolboxes dynamiques, matrix open/close.
6. Verification persistence: changement projet => restauration correcte des tools/toolboxes du projet courant uniquement.
