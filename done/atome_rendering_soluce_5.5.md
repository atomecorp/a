# Atome Rendering Soluce 5.5

## Objectif

Ce document decrit la structure ideale d'un atome dans le DOM, le probleme actuel, la solution proposee, et les points a challenger.

Il est ecrit pour une IA ou un developpeur qui ne connait pas le framework eVe/Atome. Il doit donner assez de contexte pour comprendre le systeme, evaluer la solution, la critiquer, et proposer une implementation meilleure si necessaire.

## Resume

Un atome doit etre riche dans le modele runtime, mais minimal dans le DOM.

La solution recommandee est :

```text
Atome record canonique
  -> renderer central unique
    -> host DOM minimal commun
    -> sous-renderer specialise pour le contenu visible
```

Le DOM cible d'un atome doit ressembler a ceci :

```html
<div
  id="eve-atome_atome_123"
  class="eve-atome eve-text-atome"
  style="left: 100px; top: 80px; width: 200px; height: 90px;">
  <div class="eve-atome-text">texte</div>
</div>
```

Le DOM ne doit pas contenir toute la description de l'atome. Il doit seulement afficher l'atome.

## Concepts de base

### Atome

Un atome est l'unite metier manipulable du framework. Il peut representer :

- texte ;
- image ;
- video ;
- son ;
- forme ;
- SVG ;
- groupe ;
- media importe ;
- outil projete ;
- objet compose.

Un atome possede une identite stable dans le runtime et dans la persistence.

Exemples :

```text
atome_1779874231526_e0b3af95669768
file_1779871201775_c0b39a2a4fb7f
video_recording_1779829589536_cc719ab3dcd8d8
audio_recording_1779874278950_d951d69dced14
```

### Atome record

Le record est la representation metier persistante ou canonique d'un atome.

Il contient typiquement :

```js
{
  id: 'atome_123',
  type: 'text',
  project_id: 'project_456',
  parent_id: 'project_view_project_456',
  properties: {
    left: '100px',
    top: '80px',
    width: '200px',
    height: '90px',
    text: 'hello'
  }
}
```

Le record est une source de verite. Le DOM ne l'est pas.

### Host DOM

Le host DOM est l'element principal qui represente visuellement l'atome.

Contrat cible :

```html
<div id="eve-atome_<atome_id>" class="eve-atome eve-<kind>-atome"></div>
```

Le host est une projection. Il peut etre supprime et reconstruit depuis le record.

### Runtime state

L'etat runtime contient ce qui sert aux interactions, au renderer et aux outils :

- type normalise ;
- projet courant ;
- selection ;
- drag ;
- resize ;
- bindings ;
- etat media ;
- renderer actif ;
- etat de groupe ;
- source media ;
- erreurs temporaires.

Cet etat doit vivre en memoire, par exemple dans un `WeakMap`, pas dans le DOM.

## Etat actuel du framework

Le framework possede deja une partie de la bonne architecture.

### Identite DOM centralisee

Le fichier `eVe/core/atome_dom_id.js` contient deja une base solide :

```js
const ATOME_DOM_PREFIX = 'eve-atome_';
const ATOME_RUNTIME_STATE = new WeakMap();
```

Il expose des fonctions de contrat :

```js
toDomId(atomeId)
fromDomId(domId)
getAtomeElement(atomeId)
closestAtomeElement(target)
getAtomeIdFromElement(element)
registerAtomeElement(element, state)
updateAtomeRuntimeState(element, patch)
getAtomeRuntimeState(element)
queryAtomeElements(root)
```

Cette couche indique deja la bonne direction :

```text
atome_id runtime -> id DOM namespaced -> etat runtime en WeakMap
```

### Renderer deja partiellement centralise

Le fichier `eVe/intuition/runtime/tool_genesis.js` contient le chemin principal :

```text
record
  -> buildSpecFromRecord
  -> renderAtomeRecord
  -> createAtomeElement
  -> DOM
```

Donc il existe deja une forme de renderer central.

Le probleme n'est pas l'absence totale de renderer central. Le probleme est que ce renderer n'est pas encore assez strict, pas assez minimaliste, et cohabite avec des chemins legacy ou specialises.

### Binding centralise des interactions

Le fichier `eVe/core/atome_events/host_binding_runtime.js` relie le host aux comportements :

- drag ;
- resize ;
- selection ;
- edition texte ;
- commit de position ;
- commit de taille ;
- commit de texte.

Ces bindings peuvent fonctionner avec l'id DOM et le runtime state. Ils n'ont pas besoin que le DOM stocke des attributs comme `data-eve-drag-bound` ou `data-atome-events-bound`.

## Probleme actuel

L'ancien rendu DOM d'un atome encode trop d'informations directement dans les attributs HTML.

Exemple de forme trop verbeuse :

```html
<div
  data-atome-id="file_123"
  data-atome-kind="group"
  data-project-id="project_456"
  data-atome-selected="false"
  data-group-atome="true"
  data-group-id="file_123"
  data-group-type="mtrax_media"
  data-mtrax-import="true"
  data-source-kind="mtrax_import"
  data-media-kind="video"
  data-eve-media-renderer="webgpu"
  data-eve-system-layer="view_project"
  data-atome-events-bound="true"
  data-eve-drag-bound="true"
  data-eve-resize-bound="true"
  data-media-api-ready="true"
  style="position: absolute; left: 509px; top: 88px; width: 187px; height: 333px; box-sizing: border-box; border-radius: 8px; background: none; box-shadow: var(--eve-desktop-atome-shadow); overflow: hidden; touch-action: none;">
  <div data-role="atome-group-placeholder">
    <div data-role="mtrax-import-preview-media">
      <canvas data-role="eve-media-api-webgpu-canvas"></canvas>
    </div>
  </div>
</div>
```

Ce DOM melange :

- identite metier ;
- type metier ;
- appartenance projet ;
- etat de selection ;
- etat de groupe ;
- type de media ;
- renderer actif ;
- etat de binding ;
- etat media temporaire ;
- style decoratif ;
- structure visuelle.

Le DOM devient une base de donnees partielle. C'est le coeur du probleme.

## Pourquoi c'est un probleme

### 1. Le DOM ment facilement

Si le DOM contient :

```html
data-media-api-ready="true"
```

mais que le renderer media change d'etat sans mettre a jour l'attribut, l'inspecteur affiche une fausse verite.

### 2. Les sources de verite se multiplient

Un meme fait peut exister dans :

- le record persistant ;
- le store projet ;
- un registry runtime ;
- un `WeakMap` ;
- un attribut DOM ;
- une classe CSS ;
- un style inline.

Plus il y a de copies, plus les divergences deviennent probables.

### 3. Les outils se couplent au DOM interne

Beaucoup de code legacy peut chercher :

```js
document.querySelector(`[data-atome-id="${id}"]`)
```

Cela force le DOM a garder `data-atome-id`, meme si une meilleure API existe.

La bonne approche est :

```js
getAtomeElement(id)
```

ou :

```js
closestAtomeElement(event.target)
```

### 4. Les exports DOM deviennent enormes

Les exports de body ou de sous-arbres deviennent difficiles a lire. Dans la matrix, les previews peuvent meme etre encodees en gros `data:image/png;base64` dans `background-image`, ce qui grossit enormement les snapshots.

### 5. Le renderer central n'impose pas assez son contrat

`tool_genesis.js` centralise deja beaucoup de rendu, mais il laisse encore passer :

- trop d'attributs `data-*` ;
- trop de styles inline decoratifs ;
- trop de cas speciaux ;
- des classes qui melangent parfois les domaines ;
- des chemins de compatibilite legacy.

Le renderer existe, mais il n'est pas encore une frontiere stricte entre modele et DOM.

## Solution proposee

### Principe principal

Creer ou formaliser un renderer unique centralise et minimaliste.

Mais attention : il ne doit pas etre un seul gros bloc qui sait tout faire. Il doit etre centralise pour le contrat du host, puis deleguer le contenu visible a des sous-renderers.

Architecture cible :

```text
AtomeRenderer
  render(record, parent)
    normalize record
    create/update host commun
    register runtime state
    apply frame
    apply visual state
    delegate content renderer

Content renderers
  renderText(host, spec)
  renderMedia(host, spec)
  renderAudio(host, spec)
  renderShape(host, spec)
  renderGroup(host, spec)
  renderToolShortcut(host, spec)
```

Le renderer central doit etre responsable de tout ce qui est commun :

- identite DOM ;
- classe `.eve-atome` ;
- classe de type ;
- frame ;
- selection visuelle ;
- raccord au runtime state ;
- appel au binding interaction ;
- nettoyage des anciens attributs.

Les sous-renderers doivent seulement gerer le contenu visible.

## Contrat DOM cible

### Host commun obligatoire

Tout atome visible doit avoir :

```html
<div id="eve-atome_<atome_id>" class="eve-atome"></div>
```

Le selecteur officiel d'un host est :

```css
.eve-atome[id^="eve-atome_"]
```

### Id runtime

L'id runtime reste brut :

```text
atome_123
```

L'id DOM est derive :

```text
eve-atome_atome_123
```

Il ne faut pas utiliser l'id runtime brut comme `id` DOM, car certains identifiants peuvent mal se comporter avec CSS/querySelector et le namespace evite les collisions.

### Classes

Classes recommandees :

```html
class="eve-atome eve-text-atome"
class="eve-atome eve-media-atome"
class="eve-atome eve-audio-atome"
class="eve-atome eve-shape-atome"
class="eve-atome eve-svg-atome"
class="eve-atome eve-group-atome"
class="eve-atome eve-tool-atome"
```

Etat visuel simple :

```html
class="eve-atome eve-text-atome is-selected"
```

Les classes doivent exprimer le rendu ou l'etat visuel. Elles ne doivent pas stocker tout le modele.

### Styles inline autorises

Inline acceptable :

```html
style="left: 100px; top: 80px; width: 200px; height: 90px;"
```

Acceptable selon les cas :

```text
z-index
display
pointer-events
transform temporaire pendant animation
```

A eviter en inline par defaut :

```text
position
box-sizing
border
border-radius
background
box-shadow
color
overflow
touch-action
user-select
```

Ces proprietes doivent etre definies par CSS.

### Attributs `data-*`

Interdits en rendu normal pour l'etat atome :

```text
data-atome-id
data-atome-kind
data-project-id
data-atome-selected
data-group-atome
data-group-id
data-media-kind
data-eve-media-renderer
data-media-api-ready
data-atome-events-bound
data-eve-drag-bound
data-eve-resize-bound
```

Autorises seulement si une raison est explicite :

- debug volontaire ;
- migration legacy temporaire ;
- test temporaire ;
- integration HTML externe ;
- attribut natif ou ARIA necessaire ;
- element secondaire qui ne peut pas porter d'id unique.

## Structure cible par type

### Texte

```html
<div
  id="eve-atome_atome_123"
  class="eve-atome eve-text-atome"
  style="left: 100px; top: 80px; width: 200px; height: 90px;">
  <div class="eve-atome-text" contenteditable="false">example de texte</div>
</div>
```

Runtime state associe :

```js
{
  atome_id: 'atome_123',
  kind: 'text',
  project_id: 'project_456',
  layout: { x: 100, y: 80, width: 200, height: 90 },
  text: { editable: false, bound: true }
}
```

### Image ou video

```html
<div
  id="eve-atome_file_123"
  class="eve-atome eve-media-atome"
  style="left: 100px; top: 80px; width: 333px; height: 187px;">
  <canvas class="eve-media-canvas" width="600" height="300"></canvas>
</div>
```

Runtime state associe :

```js
{
  atome_id: 'file_123',
  kind: 'video',
  media: {
    kind: 'video',
    renderer: 'webgpu',
    api_ready: true,
    source: '...'
  }
}
```

### Audio

```html
<div
  id="eve-atome_audio_recording_123"
  class="eve-atome eve-media-atome eve-audio-atome"
  style="left: 100px; top: 80px; width: 333px; height: 109px;">
  <div class="eve-media-audio-host">
    <canvas class="eve-media-canvas"></canvas>
  </div>
</div>
```

### Groupe

```html
<div
  id="eve-atome_group_123"
  class="eve-atome eve-group-atome"
  style="left: 100px; top: 80px; width: 333px; height: 187px;">
  <div class="eve-atome-group-placeholder"></div>
</div>
```

### Import MTraX media

```html
<div
  id="eve-atome_file_123"
  class="eve-atome eve-group-atome eve-media-atome eve-mtrax-import-atome"
  style="left: 100px; top: 80px; width: 187px; height: 333px;">
  <div class="eve-atome-group-placeholder">
    <div class="eve-mtrax-import-preview-media">
      <canvas class="eve-media-canvas"></canvas>
    </div>
  </div>
</div>
```

### SVG

```html
<div
  id="eve-atome_shape_123"
  class="eve-atome eve-shape-atome eve-svg-atome"
  style="left: 100px; top: 80px; width: 120px; height: 120px;">
  <div class="eve-atome-shape-svg">
    <svg></svg>
  </div>
</div>
```

## Matrix : cas separe

La matrix affiche des projets, pas des atomes generiques.

Une tuile matrix cible :

```html
<div
  id="eve-project-tile_29e26b0b-e986-4809-a6d5-8c559376e5a3"
  class="eve-matrix-tile is-filled is-current">
  <div class="eve-matrix-tile__preview"></div>
  <div class="eve-matrix-tile__label-row">
    <div class="eve-matrix-tile__label">untitled</div>
  </div>
</div>
```

Important : eviter d'utiliser `eve-matrix-tile` sur les atomes de projet si ce n'est pas indispensable.

Probleme actuel possible :

```html
class="eve-atome eve-matrix-tile eve-media-atome"
```

Cette classe melange deux domaines :

- `eve-atome` = objet manipulable dans un projet ;
- `eve-matrix-tile` = cellule de grille de projets.

Alternative preferable :

```html
class="eve-atome eve-project-atome eve-media-atome"
```

ou simplement :

```html
class="eve-atome eve-media-atome"
```

Avant de retirer `eve-matrix-tile`, verifier si des animations de matrix/dezoom dependent volontairement de cette classe.

## Renderer unique : bonne solution ou deja present ?

Reponse courte :

```text
Oui, un renderer unique centralise et minimaliste est la bonne solution.
Mais le framework en possede deja une ebauche.
Le probleme est qu'elle n'est pas encore assez stricte.
```

Le renderer central existe deja partiellement avec :

```text
renderAtomeRecord
createAtomeElement
registerAtomeElement
bindAtomeHost
```

Mais il marche imparfaitement parce qu'il :

- accepte encore des conventions legacy ;
- laisse trop de details runtime dans le DOM ;
- gere beaucoup de cas speciaux dans une meme zone ;
- ne verrouille pas assez le contrat de sortie ;
- ne force pas tous les outils a passer par `atome_dom_id.js`.

Il ne faut donc pas forcement tout reecrire. Il faut transformer l'existant en frontiere stricte.

## Architecture cible du renderer

### AtomeRenderer

Responsabilites :

```text
normalizeRecord(record)
resolveKind(record)
resolveFrame(record)
createOrReuseHost(atomeId)
applyHostIdentity(host, atomeId)
applyHostClasses(host, kind, visualState)
applyHostFrame(host, frame)
registerRuntimeState(host, state)
sanitizeLegacyDom(host)
delegateContent(host, kind, spec)
bindInteractions(host)
```

### Sous-renderers

Responsabilites limitees :

```text
TextRenderer      -> cree/met a jour .eve-atome-text
MediaRenderer     -> cree/met a jour canvas/img/video
AudioRenderer     -> cree/met a jour audio visual host
ShapeRenderer     -> cree/met a jour forme/SVG
GroupRenderer     -> cree/met a jour placeholder/preview
ToolRenderer      -> cree/met a jour representation d'un outil
```

Chaque sous-renderer doit respecter ces regles :

- ne pas creer d'identite atome ;
- ne pas binder drag/resize ;
- ne pas stocker l'etat global dans le DOM ;
- ne pas ecrire de `data-atome-*` ;
- ne creer que les enfants necessaires au rendu.

## Migration recommandee

### Phase 1 : declarer le contrat

Documenter officiellement :

```text
Host atome = .eve-atome[id^="eve-atome_"]
DOM id = eve-atome_<atome_id>
Runtime id = atome_id brut
Runtime state = WeakMap / registry
DOM = projection, jamais source de verite
```

### Phase 2 : verrouiller les helper APIs

Tout code doit passer par :

```js
getAtomeElement(atomeId)
closestAtomeElement(target)
getAtomeIdFromElement(host)
getAtomeKindFromElement(host)
getAtomeRuntimeState(host)
updateAtomeRuntimeState(host, patch)
```

### Phase 3 : compatibilite temporaire

Pendant la migration seulement :

```js
function resolveAtomeElementCompat(atomeId) {
  return getAtomeElement(atomeId)
    || document.querySelector(`[data-atome-id="${CSS.escape(atomeId)}"]`)
    || document.getElementById(`atome_${atomeId}`)
    || document.getElementById(atomeId);
}
```

Le nouveau code ne doit plus utiliser `[data-atome-id]`.

### Phase 4 : nettoyer la sortie DOM

Dans le renderer central :

- supprimer les `data-atome-*` ;
- supprimer les `data-eve-*-bound` ;
- supprimer les `data-media-api-*` ;
- supprimer les styles decoratifs inline ;
- remplacer `data-role` par des classes quand le role est purement interne ;
- conserver seulement les vrais attributs HTML utiles.

### Phase 5 : tests de densite DOM

Ajouter des tests/probes qui echouent si :

- un atome normal contient `data-atome-id` ;
- un atome normal contient `data-atome-kind` ;
- un atome normal contient `data-eve-drag-bound` ;
- un atome normal contient `data-eve-resize-bound` ;
- un atome normal contient trop de styles inline ;
- un atome media expose son renderer via attribut DOM ;
- la matrix exporte des previews base64 enormes sans mode debug/troncature.

### Phase 6 : tests comportementaux

Verifier apres nettoyage :

- creation texte ;
- edition texte ;
- drag ;
- resize ;
- selection ;
- suppression ;
- restauration ;
- creation image ;
- creation video ;
- creation audio ;
- import MTraX ;
- groupe media ;
- shape SVG ;
- ouverture matrix ;
- retour projet ;
- preview projet ;
- persistence/reload.

## Points a challenger

### 1. Le DOM minimal rend-il le debug plus difficile ?

Oui, potentiellement. Mais le debug doit etre un mode explicite.

Option :

```js
if (window.__EVE_DEBUG_DOM_STATE__ === true) {
  host.dataset.atomeId = atomeId;
  host.dataset.atomeKind = kind;
}
```

En production ou rendu normal, ces attributs ne doivent pas exister.

### 2. Faut-il utiliser des custom elements ?

Alternative :

```html
<eve-atome id="eve-atome_atome_123"></eve-atome>
```

Avantages :

- semantique claire ;
- cycle de vie natif ;
- encapsulation possible.

Inconvenients :

- migration lourde ;
- risque d'incompatibilite avec les outils existants ;
- complexite inutile pour le probleme actuel.

Position recommandee :

- garder `div.eve-atome` maintenant ;
- reevaluer plus tard.

### 3. Faut-il tout mettre dans Shadow DOM ?

Non pour l'instant.

Le Shadow DOM pourrait isoler certains renderers, mais il complique :

- selection ;
- edition texte ;
- CSS global ;
- event delegation ;
- outils contextuels ;
- inspection.

Position recommandee :

- ne pas utiliser Shadow DOM pour les atomes generiques ;
- l'envisager seulement pour des composants tres isoles.

### 4. Faut-il supprimer tous les wrappers ?

Non.

Un wrapper est acceptable s'il sert au rendu ou a l'interaction.

Acceptable :

```html
<div class="eve-atome-text"></div>
<canvas class="eve-media-canvas"></canvas>
<div class="eve-atome-group-placeholder"></div>
```

Suspect :

```html
<div data-role="runtime-state-holder"></div>
```

Le critere est simple : si le wrapper existe seulement pour stocker de l'etat, il doit disparaitre.

### 5. Faut-il zero `data-*` ?

Non. Il faut zero `data-*` inutiles dans la representation normale de l'atome.

Certains `data-*` peuvent rester utiles pour :

- ARIA ou integration ;
- composants generiques ;
- debug explicite ;
- tests temporaires ;
- migration.

Mais il faut une justification claire.

### 6. Le renderer central risque-t-il de devenir trop gros ?

Oui. C'est le risque principal.

Pour l'eviter, le renderer central ne doit gerer que le contrat commun. Les details de contenu doivent etre dans des sous-renderers.

Mauvais modele :

```text
un seul fichier enorme qui connait tous les details de tous les types
```

Bon modele :

```text
un orchestrateur central strict
plus des sous-renderers petits et specialises
```

## Invariants a respecter

1. Un atome visible a exactement un host principal.
2. Le host principal porte `id="eve-atome_<atome_id>"`.
3. Le host principal porte `.eve-atome`.
4. Le DOM ne contient pas l'etat runtime complet.
5. Le runtime peut retrouver un host par `getAtomeElement`.
6. Un evenement DOM peut remonter au host par `closestAtomeElement`.
7. Les bindings ne dependent pas de `data-atome-id`.
8. Les styles decoratifs viennent du CSS.
9. Les sous-renderers ne changent pas l'identite du host.
10. Le DOM peut etre reconstruit depuis le modele.

## Definition du succes

Un atome inspecte dans le DOM doit etre lisible immediatement.

Exemple :

```html
<div id="eve-atome_atome_123" class="eve-atome eve-text-atome is-selected" style="left: 100px; top: 80px; width: 200px; height: 90px;">
  <div class="eve-atome-text">Hello</div>
</div>
```

Une IA ou un developpeur doit pouvoir deduire :

- c'est un atome ;
- son id runtime est `atome_123` ;
- c'est un atome texte ;
- il est selectionne ;
- il est positionne en `100,80` ;
- il mesure `200x90` ;
- son contenu visible est `Hello`.

Tout le reste doit etre lu via le runtime, pas dans le HTML.

## Decision recommandee

Adopter cette architecture :

```text
Atome model/store = source de verite
AtomeRenderer central = frontiere unique modele -> DOM
Host DOM minimal = projection visuelle commune
Sous-renderers = contenu visible specialise
WeakMap/registry = etat runtime technique
CSS = styles decoratifs
DOM inline = frame dynamique seulement
```

Le framework n'a pas besoin d'un nouveau concept completement different. Il a besoin de rendre strict ce qui existe deja.

La cible n'est pas :

```text
plus de DOM dans les atomes
```

La cible est :

```text
moins de responsabilites dans le DOM
```

## Conclusion

Un renderer unique centralise et minimaliste est une bonne solution. Le framework en possede deja une ebauche, mais elle n'est pas encore assez disciplinee.

Le travail principal consiste a transformer `renderAtomeRecord/createAtomeElement` en frontiere stricte :

- entree : record/spec atome ;
- sortie : host DOM minimal ;
- etat technique : WeakMap/registry ;
- contenu visible : sous-renderers ;
- interactions : binding centralise ;
- aucun etat runtime inutile dans le DOM.

Cette solution conserve toutes les possibilites du framework tout en reduisant la complexite, le poids du DOM, les divergences d'etat, et le couplage des outils a la structure HTML interne.
