# URGENT — vue Liste / Matrice : le glisser est cassé, et mes corrections ont empiré

## État au 22 août 2026 — défauts A, B, C corrigés, plus la cause réelle du symptôme 1

| # | Défaut | État | Preuve |
|---|---|---|---|
| A | le rendu meurt sur un libellé vide | **fait** | `temp/drag_preview_never_throws_probe.mjs` (rouge avant) |
| B | l'aperçu est peint loin du curseur, hors écran | **fait** | `temp/drag_preview_geometry_probe.mjs` (rouge avant : +550 px, coupé) |
| C | l'écart d'insertion montre le mauvais côté | **fait** | `temp/insertion_gap_side_probe.mjs` (rouge avant) |
| — | la minuterie mesurait le SURVOL, pas l'immobilité | **fait** | `temp/reorder_survives_slow_drag_probe.mjs` (rouge avant) |
| — | une timeline sans `clips` tuait `load()` de la liste | **fait** | `temp/play_whole_list_probe.mjs` (rouge avant : `TypeError` dans `moleculeSectionRows`) |
| D | un rafraîchissement en plein geste tue la session de pointeur | **non prouvé** | `preserveNodeId` en place, invérifiable sans pixels |

### Ce qui a été trouvé en plus, et qui explique le symptôme 1

« La liste ne se réordonne plus » n'était **pas** un effet de bord du rendu : la
minuterie d'absorption ne mesurait pas l'immobilité du doigt, elle mesurait la
durée du **survol**. Traverser une liste en plus d'une demi-seconde sans jamais
s'arrêter — le geste ordinaire — armait donc l'absorption, et le lâcher créait une
molécule au lieu de déplacer la ligne. `armStationaryAbsorb` reçoit désormais le
POINT et se réarme dès que le doigt dépasse 6 px ; un micro-tremblement, lui, ne
désarme rien.

### Le trou de géométrie est bouché

Le calque flottant — ce qu'on tient — est désormais rendu par la SURFACE, à la
racine de l'arbre, seul repère qui coïncide avec celui du pointeur. La
composition de l'arbre est sortie de `buildTree` dans une fonction **pure**,
`projectViewSurfaceRoot` (`project_view_surface_layout.js`), et la sonde de
géométrie résout la boîte absolue de l'aperçu avec le **vrai** moteur de
disposition — celui qui sert au hit-test. C'est la première sonde du dépôt qui
regarde où le pixel atterrit.

### Ce qui reste, et pourquoi

- **La validation visuelle en navigateur reste impossible.** Le volet intégré ne
  présente aucun pixel WebGPU, et ce serveur-ci refuse le compte invité
  (`remote_account_not_provisioned` : `start-guest` n'existe plus côté serveur,
  le provisionnement explicite n'a pas été refait). `mountTree` reste en attente
  tant que le volet ne repeint pas. Constaté à nouveau, inchangé.
- **Défaut D non prouvé.** `preserveNodeId` traverse bien tous les rendus déclenchés
  pendant le geste (`temp/drag_session_survives_refresh_probe.mjs` le vérifie), mais
  « la session de pointeur survit » ne se démontre qu'avec un vrai pointeur.
- **Étape 4 du plan — la création de molécule par superposition** — est verte en
  sonde (geste, mutations, magasin réel) mais n'a jamais été vue à l'écran.

### Fichiers touchés par cette reprise

`intuition/runtime/bevy_panel/bevy_panel_selectable_list.js`,
`domains/rendering/project_view_list_view.js`,
`domains/rendering/project_view_list_content.js`,
`domains/rendering/project_view_list_drag_runtime.js`,
`domains/rendering/project_view_matrix_content.js`,
`domains/rendering/project_view_reorder_runtime.js`,
`domains/rendering/project_view_molecule_list_model.js`,
`domains/rendering/project_view_surface_layout.js`,
`domains/rendering/project_view_surface_runtime.js`.

---

## En une phrase

Le glisser-déposer de la vue Liste et de la vue Matrice ne fonctionne plus du tout.
Une session précédente (moi) a tenté de réparer la création de molécule par
superposition et a introduit des régressions sur du code qui marchait. **Commencer
par restaurer un glisser qui fonctionne, avant toute autre chose.**

## Symptômes constatés par l'utilisateur, après mes corrections

1. **La liste ne se réordonne plus.** Ça marchait avant mes modifications.
2. **Déposer une ligne sur une autre ne crée pas de molécule.** Ça n'a jamais
   marché ; c'était la demande initiale.
3. **Le décalage entre deux lignes ne se fait pas au bon endroit.**
4. **On ne voit pas la ligne — ni la cellule en Matrice — se déplacer
   physiquement.** Avant, un bloc suivait le curseur ; maintenant on déplace du
   vide.
5. **Lire la liste complète ne démarre pas.**

Bilan : c'est pire qu'avant les corrections.

## Ce que j'ai changé (à connaître avant de toucher quoi que ce soit)

Rien n'est commité. Le sous-module `eVe` était **déjà** porteur du travail d'une
autre session avant que je commence : un `git checkout` global détruirait ce travail.

**Fichiers que j'ai modifiés, dans `eVe/` :**

| Fichier | Intention |
|---|---|
| `intuition/runtime/bevy_panel/bevy_panel_selectable_list.js` | aperçu de glisser reconstruit à partir du vrai constructeur de ligne ; état « cible armée » |
| `domains/rendering/project_view_list_view.js` | géométrie de ligne partagée, passage de `absorbTarget` |
| `domains/rendering/project_view_list_drag_runtime.js` | minuterie d'absorption, aperçu portant l'entrée |
| `domains/rendering/project_view_reorder_runtime.js` | `trackStationaryOverlap` remplacé par `armStationaryAbsorb` / `clearStationaryAbsorb` |
| `domains/rendering/project_view_matrix_content.js` | même câblage + aperçu de tuile flottante (absent auparavant) |
| `domains/rendering/project_view_list_content.js` | `requestRefresh` transmet ses options |
| `domains/rendering/project_view_molecule_list_model.js` | `owner_atome_id` / `timeline_id` sur une ligne de molécule |
| `domains/rendering/project_view_playback_runtime.js` | branche molécule dans la file, records annoncés |
| `domains/rendering/project_view_playback_rules.js` | défaut molécule `sequential` → `layer` |
| `intuition/runtime/bevy_panel/bevy_panel_media_card.js` | état « cible armée » sur une tuile |
| `intuition/tools/core/tool_runtime_atome_mutation.js` | lecture de l'enveloppe `meta`, parent déclaré transmis au patch |

**Deux fichiers contiennent mes modifications ET celles d'une autre session** —
ne pas les restaurer en bloc, extraire à la main :
`domains/rendering/project_view_surface_runtime.js`,
`domains/rendering/project_view_surface_events.js`
(mes ajouts s'y limitent à `state.playingRecords` et au repli de
`syncVisualSubject` sur les records annoncés).

**Dans le dépôt parent :** `database/adole.js` (un événement qui nomme un parent
peut désormais le poser même si l'atome en avait déjà un) et
`tests/eve/project_view_playback_regressions.test.mjs` (import mis à jour).

## Défauts prouvés dans le code

### A. Le rendu entier peut mourir dès le premier frame de glisser — cause probable de « rien ne marche »

`selectableListDragPreviewNode` construit désormais l'aperçu en appelant
`hierarchicalSelectableListNode`, qui passe par `normalizeSelectPresentation`.
Ce contrat **jette** quand le libellé est vide :

```
label ""    -> JETTE : squirrel_select_option_label_required
label "   " -> JETTE : squirrel_select_option_label_required
```

Or cet appel est sur le chemin de rendu :
`content.build()` → `buildTree()` → `render()`. Une exception y rejette la promesse
de rendu, l'arbre n'est plus monté, et **plus aucune interaction n'aboutit** — ni
réordonnancement, ni dépôt, ni repeinte. Avant, cette fonction ne faisait que
composer des nœuds et ne pouvait rien jeter.

**Règle à rétablir : un élément décoratif ne valide rien sur le chemin de rendu.**
L'aperçu doit être construit défensivement (libellé de repli, `try/catch`), ou
revenir à une composition de nœuds sans contrat.

### B. L'aperçu est peint loin du curseur, souvent hors écran

`previewPosition()` (dans `bevy_panel_selectable_list_drag.js`) calcule la position
**relative à la surface** :

```js
[point.x - rect.left + 12, point.y - rect.top + 12]
```

Mais le nœud d'aperçu est un enfant de `project_view_list_frame`, lui-même dans
`…_body` puis `…_content`, positionnés dans `project_view_surface_runtime.js` à :

- x : `layout.contentX`
- y : `PADDING + visualHeight + visualGap` puis `bodyOffsetY`

Le panneau Visuel occupe **1/3 de la hauteur** par défaut, et `bodyOffsetY` ancre la
liste en bas (plusieurs centaines de pixels quand la liste est courte). L'aperçu est
donc peint très en dessous du curseur, et la racine a `overflow: 'hidden'` : il
disparaît. Le même défaut vaut pour la tuile flottante de la Matrice que j'ai
ajoutée.

**À corriger : ramener l'aperçu et le point de pointeur dans le même repère** — soit
en soustrayant l'origine du corps, soit en sortant l'aperçu au niveau de la racine
de l'arbre. C'est un défaut préexistant que j'ai rendu visible, pas un que j'ai créé.

### C. L'écart d'insertion montre le mauvais côté

`hierarchicalSelectableListNode` décale toutes les lignes d'index **supérieur** à la
cible :

```js
position: [0, index * (rowHeight + gap) + (index > dropTargetIndex ? insertionGap : 0)]
```

L'écart s'ouvre donc toujours **après** la ligne survolée. Or `orderedIdsAfterMove`
insère la source **avant** la cible quand on remonte :

```js
next.splice(next.indexOf(target) + (from < to ? 1 : 0), 0, source);
```

Descendre : l'écart est juste. Remonter : l'écart est du mauvais côté, et l'objet ne
se pose pas là où l'écart le promettait.

### D. Un rafraîchissement en plein geste peut tuer la session de pointeur

`render()` annule un rendu déjà en vol (`cancelTreeRender`) — le fichier documente
lui-même que « une annulation interrompt la réconciliation en plein parcours de
l'arbre ». Mon ajout d'une minuterie qui repeint pendant que le doigt est immobile
multiplie ces rendus concurrents. `preserveNodeId` a été ajouté depuis, mais **cela
reste à valider dans un vrai navigateur** : si la session de pointeur meurt, le
lâcher n'arrive jamais — ce qui expliquerait à la fois la perte du
réordonnancement et l'absence de molécule.

## Ce qui n'a jamais été vérifié, et pourquoi

**Aucune de mes modifications n'a été vue à l'écran.** Dans le navigateur intégré,
la surface WebGPU d'atome ne présente aucun pixel : les arbres BevyUI sont montés
(`readDiagnostics()` répond, 18 nœuds interactifs), l'application est authentifiée,
mais le canvas reste uni. Constaté **avant** toute modification.

Conséquence directe : tout ce qui touche à la géométrie, à la visibilité et au
geste a été livré sans preuve. Les sondes écrites tiennent la **logique** et les
**écritures**, pas le rendu. C'est l'origine de ces régressions.

**Toute reprise doit être validée dans un vrai navigateur, à la main, avant d'être
annoncée comme faite.**

## Marche à suivre recommandée

1. **Restaurer un glisser qui fonctionne d'abord.** Remettre
   `selectableListDragPreviewNode` dans sa forme simple (composition de nœuds, aucun
   contrat, aucun risque d'exception) et vérifier dans le navigateur que le
   réordonnancement de la liste remarche. Ne rien faire d'autre tant que ce point
   n'est pas revenu.
2. **Corriger le repère de l'aperçu (défaut B)** et vérifier à l'œil que l'objet
   glissé colle au curseur, en Liste comme en Matrice.
3. **Corriger le côté de l'écart d'insertion (défaut C)** en le dérivant de la même
   règle que `orderedIdsAfterMove`, pas d'une seconde règle.
4. **Puis seulement** reprendre la création de molécule par superposition, en
   vérifiant à chaque étape dans le navigateur que le geste survit au
   rafraîchissement (défaut D).

## Ce qui, en revanche, est solidement établi et mérite d'être conservé

Ces points sont vérifiés contre un **vrai serveur, un vrai compte, un vrai magasin**
(`temp/absorb_real_store_probe.mjs`, rouge avant / verte après) et n'ont rien à voir
avec le rendu :

- `listStateCurrent` rend des atomes **canoniques** : `{ id, type, meta: { project_id,
  parent_id }, properties }`. La couche de mutation ne lisait ni `meta` ni l'ordre du
  produit, donc **chaque** absorption répondait `molecule_cross_project_forbidden`.
- Le serveur refuse un `set` au patch de propriétés vide (`missing_property_patch`) :
  un reparentage `props: {}` ne part jamais.
- `upsertAtomeFromEvent` (`database/adole.js`) n'assignait un parent que s'il était
  **vide** : un objet rangé dans un projet ne pouvait plus jamais changer de
  conteneur. Or grouper n'est rien d'autre que reparenter.
- Une ligne de molécule ne portait pas `owner_atome_id`, ce que lisent
  `ensureMoleculeTimelineOpen`, `presentMoleculeInfo`, `selectEntry` et le renommage.

Ces quatre points sont la raison pour laquelle la molécule ne se créait pas et
restait inerte. Ils sont indépendants du glisser et devraient survivre à tout retour
en arrière sur la partie visuelle.

## Sondes disponibles dans `./temp`

| sonde | couvre | ne couvre pas |
|---|---|---|
| `absorb_real_store_probe.mjs` | chaîne complète contre un vrai serveur | le geste, le rendu |
| `absorb_gesture_probe.mjs` | machine à états du geste, Liste + Matrice | la géométrie, la survie de la session pointeur |
| `drag_session_survives_refresh_probe.mjs` | le rendu armé préserve le nœud pressé | ce que voit réellement l'utilisateur |
| `drag_preview_shape_probe.mjs` | structure de l'aperçu | sa position à l'écran |
| `molecule_queue_playback_probe.mjs` | file de lecture, molécule séquentielle/ensemble | le démarrage réel dans l'app |
| `molecule_row_owner_probe.mjs`, `canonical_molecule_mutation_probe.mjs` | modèle et mutations | — |
| `drag_preview_geometry_probe.mjs` | **la position ABSOLUE de l'aperçu**, clip compris, par le vrai moteur de disposition | ce que présente WebGPU |
| `drag_preview_never_throws_probe.mjs` | l'aperçu ne jette jamais sur le chemin de rendu | — |
| `insertion_gap_side_probe.mjs` | le côté de l'écart, dérivé d'`orderedIdsAfterMove` | — |
| `reorder_survives_slow_drag_probe.mjs` | glisser lent = réordonner, immobile = absorber | — |
| `play_whole_list_probe.mjs` | lire un niveau entier : fixes, média, molécule, liste vide | le son |

Le trou de géométrie est bouché ; il reste celui du PIXEL, que seul un vrai
navigateur qui présente peut fermer.
