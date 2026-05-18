# Vector Editing Layer

## But
Permettre l'edition SVG par calque (layer) dans le preview et sur les SVG du projet, avec workflow non destructif, historise, et compatible avec les outils existants (couleur, taille, etc.).

## Probleme actuel
- L'edition vectorielle cible un seul element editable SVG.
- Pas de notion de calque selectionne dans le runtime.
- Les outils visuels (ex: couleur) s'appliquent au niveau atome/clip, pas au niveau calque interne.
- Pas de structure d'historique operationnelle par calque.

## Resultat attendu
- Un outil `Layer` affiche la liste des calques SVG d'un clip selectionne.
- Selection d'un calque actif.
- Les outils contextuels (vector, couleur, etc.) agissent sur ce calque actif.
- Historique non destructif par operations (undo/redo).
- Compatible preview + edition des SVG du projet.

## Architecture cible

### 1) Selection sub-atome
Ajouter un contexte de selection interne SVG:
- `selected_clip_id`
- `selected_svg_layer_id`
- `selected_svg_layer_path`
- `selected_svg_layer_ids` (prepare multi-select)
- `selected_svg_layer_kind`

Ce contexte devient la source de verite pour les outils SVG.

### 2) Layer Manifest
Introduire un modele `svg_layer_model`:
- Parse le SVG complet.
- Extrait les couches/groupes (`<g>`) et formes editables (`path`, `polygon`, `polyline`, `line`, puis `rect/circle/ellipse`).
- Genere une arborescence stable:
  - `layer_id` (stable)
  - `parent_layer_id`
  - `depth`
  - `name` (id, inkscape:label, fallback)
  - `kind`
  - `visible`, `locked` (si metadata presente)
  - `editable`

### 3) Edition vectorielle ciblee
Le runtime vector doit:
- Charger le `layer_id` actif.
- Construire les handles uniquement pour ce layer.
- Emettre `svg_markup` modifie globalement, mais avec diff logique par layer.

### 4) Bridge outils
Pour chaque outil visuel:
- Si `selected_svg_layer_id` existe: appliquer au layer.
- Sinon: fallback comportement actuel.

Priorite immediate:
- `vector` -> layer cible.
- `couleur` -> layer cible.

### 5) Historique non destructif
Table d'operations (ou structure equivalente):
- `id`
- `group_id` / `timeline_id`
- `clip_id`
- `atome_id`
- `layer_id`
- `op_type` (`move_point`, `set_fill`, `set_stroke`, `set_path_data`, etc.)
- `payload_json`
- `ts`
- `author` (optionnel)

Snapshots periodiques:
- `svg_markup_snapshot`
- cadence configurable (ex: toutes N operations)

Undo/redo:
- rejouer les operations depuis snapshot le plus proche.

## Outil Layer (UX)
- Nom outil: `Layer`.
- Tool id propose:
  - main: `tool.main.layer`
  - panel: `ui.layer.panel`
- Au clic:
  - si aucun SVG selectionne: etat vide.
  - sinon: panneau arborescent des calques.
- Interaction:
  - click layer -> set layer actif.
  - highlight layer actif.
  - option future: lock/hide.

## Flux evenementiel propose
- `eve:svg-layer-manifest-request`
- `eve:svg-layer-manifest-ready`
- `eve:svg-layer-selected`
- `eve:svg-layer-selection-cleared`
- `eve:svg-layer-operation`

Le preview et les outils abonnent a `eve:svg-layer-selected`.

## Phasage implementation

### Phase 1 - Fondation Layer (sans edition)
- Creer `svg_layer_model`.
- Extraire manifest depuis `svg_markup`.
- Ajouter panel `Layer`.
- Selection d'un layer dans le contexte runtime.

### Phase 2 - Vector par layer
- Brancher l'editeur vector pour cibler `selected_svg_layer_id`.
- Handles et drag limites au layer actif.
- Commit global `svg_markup` + operation `move_point`.

### Phase 3 - Couleur par layer
- Outil couleur lit la selection layer.
- Application fill/stroke sur layer cible.
- Historisation `set_fill`/`set_stroke`.

### Phase 4 - Historique complet
- Table operations + snapshots.
- Undo/redo par operations.
- Rebuild deterministe depuis snapshot + log.

### Phase 5 - Extension et robustesse
- Multi-select layer.
- Locks/visibility.
- Support formes supplementaires (`rect`, `circle`, `ellipse`).
- Performance gros SVG.

## Criteres d'acceptation
- Le panneau `Layer` liste correctement les calques d'un SVG multi-couches.
- Un layer selectionne devient la cible des outils vector et couleur.
- Une edition de point modifie effectivement le SVG final.
- Undo/redo restaure correctement les etats.
- Pas de freeze UI pendant drag/edition.
- Fonctionne dans preview et sur SVG du projet.

## Tests a prevoir
- Unit:
  - parse manifest simple/complexe.
  - stabilite `layer_id`.
  - mapping operations -> markup.
- Integration:
  - `Layer` selection -> `vector` cible le bon layer.
  - `Layer` selection -> `couleur` cible le bon layer.
  - historique replay stable.
- E2E:
  - SVG multi-calques, selection layer, edition, undo/redo, reload et verification persist.

## Risques
- `layer_id` instable si reconstruction naive du DOM.
- SVG heterogenes (groupes imbriques, transforms locales, styles inline vs classes).
- Cout CPU sur gros SVG si parse/rebuild complet a chaque input.

## Mitigations
- IDs stables derives d'un chemin structurel canonical + fallback hash.
- Commit throttle/debounce en `input`, commit fort en `end`.
- Snapshots periodiques + diff operationnel.

## Hors scope (pour l'instant)
- Animation par layer.
- Edition booleenne complexe (union/subtract).
- Edition de texte SVG avancee.

