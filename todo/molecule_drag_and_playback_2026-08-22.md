# Liste / Matrice — glisser lisible, molécule par superposition, molécule jouable
_22 août 2026 — livré, non commité_

## Ce qui était cassé, et pourquoi

Quatre causes empilées, dont trois invisibles depuis l'interface.

1. **Une ligne de molécule ne portait pas son propriétaire.**
   `atomeRows()` tamponnait `molecule_entity: 'molecule'` mais jamais
   `owner_atome_id`. Or `ensureMoleculeTimelineOpen`, `presentMoleculeInfo`,
   `selectEntry`, `persistProjectViewEntryName` et `focusEntry` le lisent tous :
   sélectionner une molécule sortait en erreur, le rail restait vide, le
   renommage commitait sur `atome_id: undefined`. C'est le « ça bloque ».
   → `project_view_molecule_list_model.js`

2. **L'absorption n'était armée par rien.**
   `e810cf3` avait supprimé la minuterie ; le geste avait été recâblé sur une
   durée relue au relâchement. Mais `bevy_ui_pointer_runtime` n'émet `drag`
   **que sur mouvement** : doigt immobile = plus aucun événement, donc une
   immobilité déduite d'un silence. Minuterie rétablie dans le propriétaire
   partagé, et l'aperçu annonce désormais l'issue avant le lâcher.
   → `project_view_reorder_runtime.js`, `project_view_list_drag_runtime.js`,
     `project_view_matrix_content.js`

3. **La couche de mutation canonique était aveugle à l'enveloppe du magasin.**
   `listStateCurrent` rend des atomes canoniques : `{id, type, meta:{project_id,
   parent_id}, properties}`. `resolveStateProjectId` / `resolveStateParentId` ne
   lisaient ni `meta` ni l'ordre du produit, donc **chaque** absorption sortait
   en `molecule_cross_project_forbidden` et `directChildrenOf` ne voyait aucun
   membre. Les vues, elles, aplatissaient `meta` de leur côté — hiérarchie juste
   à l'écran, mutation aveugle en dessous.
   → `tool_runtime_atome_mutation.js`

4. **Un reparentage ne pouvait pas être persisté.**
   Deux verrous en série : le serveur refuse un `set` au patch de propriétés vide
   (`missing_property_patch`), et `upsertAtomeFromEvent` n'assignait un parent que
   si l'atome n'en avait **pas encore**. Un objet rangé dans un projet ne pouvait
   donc plus jamais changer de conteneur — et grouper n'est rien d'autre que
   reparenter.
   → `tool_runtime_atome_mutation.js` (le parent déclaré traverse le nettoyage),
     `database/adole.js` (un événement qui NOMME un parent le pose)

## Ce qui a été ajouté

- L'objet glissé **est** la ligne : l'aperçu est construit par
  `hierarchicalSelectableListNode` avec la géométrie de la vue. La Matrice, qui
  n'en dessinait aucun, a maintenant sa tuile flottante.
- La cible armée se distingue de la cible survolée : cadre complet + teinte
  « ça joue » pour « ça rentre dedans », écart d'insertion pour « ça se pose ici ».
- Une molécule dans une file de lecture est un **niveau** : `layer` (défaut, et
  ce que le moteur fait vraiment) reste délégué à son transport ; `sequential` et
  `random` enchaînent ses membres. La file attend sa fin et repart.
- Le Visuel suit le membre qui joue à l'intérieur : les records voyagent avec les
  identifiants annoncés.
- Le défaut d'une molécule passe de `sequential` à `layer` — l'étiquette cessait
  de décrire le moteur.

## Vérification

Six sondes dans `./temp`, toutes rouges avant / vertes après :

| sonde | ce qu'elle tient |
|---|---|
| `molecule_row_owner_probe` | la ligne porte `owner_atome_id` et sa timeline s'ouvre |
| `canonical_molecule_mutation_probe` | create / absorb / merge / ungroup sur des records canoniques |
| `drag_preview_shape_probe` | l'aperçu a la structure et la géométrie de la ligne |
| `absorb_gesture_probe` | geste complet Liste + Matrice, rapide = réordonne, immobile = absorbe |
| `molecule_queue_playback_probe` | la file traverse une molécule et **avance** |
| `absorb_real_store_probe` | **vrai serveur, vrai compte, vrai magasin** : le geste crée une molécule persistée dont les deux atomes sont bien dedans |

La première version d'`absorb_gesture_probe` passait aussi sur le HEAD d'origine :
elle aplatissait `meta` elle-même. C'est en lui donnant la forme réelle du magasin
qu'elle est devenue rouge — et c'est `absorb_real_store_probe` qui a révélé les
deux verrous de persistance que rien de stubbé ne pouvait voir.

## Reste à faire (par l'utilisateur)

Le contrôle **visuel** n'a pas pu être fait : dans le navigateur intégré, la
surface WebGPU ne présente rien (arbres montés, zéro pixel) — indépendant de ces
changements. À vérifier dans un vrai navigateur : l'aperçu de glisser, la teinte
de la cible armée, et l'image du membre qui joue pendant une molécule.

---

## Correction du 22 août — une régression que j'avais introduite

Retour utilisateur : aperçu vide, écart d'insertion qui se referme aussitôt,
lâcher sans effet, et lecture de la liste qui ne démarre plus. Trois de ces
quatre symptômes avaient **une seule** cause, et elle était de moi.

**La minuterie tuait le geste qu'elle annonçait.** Quand l'absorption s'armait,
elle appelait `requestRefresh()` — sans `preserveNodeId`. Or c'est exactement ce
drapeau qui garde le nœud pressé en vie d'un rendu à l'autre. Le nœud d'ancrage
était donc recréé en plein glisser, le pointeur perdait sa session, et tout
s'écroulait d'un coup : `dragPreview` effacé (« on déplace du vide »), écart
refermé, session détruite donc lâcher sans effet. Le contrôleur de la vue
Liste avalait en plus les options (`requestRefresh: () => requestRefresh()`),
si bien que rien ne pouvait les faire passer.

**L'écart d'insertion ne doit pas se refermer.** Je le fermais à l'armement pour
le remplacer par l'anneau. C'était une mauvaise idée : ce qu'on regarde sous le
doigt doit tenir en place. L'anneau s'AJOUTE désormais à l'écart.

**La lecture.** Deux façons dont mon code pouvait bloquer la file :
- `return startMolecule(...)` sans `await` sortait la promesse du `try/catch` :
  un échec de molécule devenait un rejet orphelin qui emportait la file entière.
- le chemin par défaut lisait tout le projet (membres) **et** relisait la règle
  depuis le magasin **avant** de jouer la moindre note. La règle se lit
  maintenant sur le record déjà en main (`readPlaybackRuleOverride`), et l'image
  du membre visible se résout après le démarrage.

Sonde `temp/drag_session_survives_refresh_probe.mjs` : rouge sur la version
livrée (rendu sans préservation, écart 78 → 68), verte maintenant. Sonde
`molecule_queue_playback_probe` complétée d'une garde : une molécule qui échoue
ne doit pas empêcher la file de démarrer ni d'aller au bout.

---

## Correction finale — Lecture armée et intentions de dépôt exclusives

La règle produit validée remplace le partage historique « déplacement pendant
le mouvement / absorption après immobilité » par une partition géométrique
explicite :

- Liste : quart supérieur/inférieur = insertion avant/après ; moitié centrale =
  recouvrement potentiel.
- Matrice : centre 50 % × 50 % = recouvrement ; bordure = slot d'insertion le
  plus proche.
- Un slot annule immédiatement le minuteur et n'illumine jamais la ligne ou la
  tuile voisine.
- Un centre reste sans effet jusqu'à 2 000 ms, s'illumine ensuite, puis fusionne
  uniquement au relâchement. Un relâchement avant 2 000 ms ne fait rien.

Le réordonnancement écrit le slot exact par un unique `Atome.commitBatch`. Une
transaction partagée projet/conteneur protège temporairement la projection
Liste/Matrice : un rechargement canonique ancien ne peut plus restaurer l'ordre
précédent ; l'attente disparaît dès que tous les `hierarchy_order` confirment le
nouvel ordre. La Molécule créée ou absorbante reprend la position hiérarchique
de la cible.

La lecture contextuelle distingue désormais `armed` de `playing`. Une fin
naturelle (dont une image après deux secondes) libère le transport et les
couleurs vivantes, mais laisse le rail sur Stop. Sélectionner une autre ligne la
lit immédiatement. Seul Stop manuel, un changement/une fermeture de projet ou
la sortie de Liste/Matrice désarme ce mode ; les lectures de conteneur restent
inchangées.

### Preuves finales

- contrats playback, Liste, Matrice, stale-read, 1 999/2 000 ms et fusion :
  **31/31** ;
- syntaxe : **1 857 fichiers** ; component reuse et M0 : **OK** ;
- suite Infos : **30/31**, seul l'échec `ui.duplicate` déjà présent et hors
  périmètre subsiste ;
- Web rendu : **À vérifier** (navigateur intégré bloquant localhost et aucun
  Chrome connecté) ; Tauri et iPhone physique : **À vérifier**.
