# Prompt — Corriger le DOM des atomes et supprimer les tags inutiles

## Objectif

Tu dois corriger le rendu DOM des atomes dans Atome/eVe.

Le résultat actuel n’est pas conforme : un atome rendu contient encore trop d’attributs `data-*`, des flags techniques, des métadonnées runtime, des informations de groupe, des informations média, des marqueurs de binding et des données métier directement injectées dans le DOM.

Ce comportement doit être corrigé à la source.

Le DOM ne doit pas servir de base de données.
Le DOM ne doit pas contenir l’état métier de l’atome.
Le DOM ne doit pas contenir les flags internes du runtime.
Le DOM ne doit pas contenir de duplication de l’identifiant Atome.
Le DOM doit uniquement afficher l’atome.
Le registre runtime doit être la source de vérité.

---

## Problème constaté

Un atome média importé est actuellement rendu avec un DOM de ce type :

```html
<div
  data-atome-id="file_1779975219260_2e17803fac43c8"
  data-atome-kind="group"
  data-project-id="2c72c974-4579-4f8b-a698-955571e7a703"
  data-atome-selected="false"
  data-group-atome="true"
  data-group-id="file_1779975219260_2e17803fac43c8"
  data-group-type="mtrax_media"
  data-mtrax-import="true"
  data-source-kind="mtrax_import"
  data-media-kind="video"
  data-eve-media-renderer="webgpu"
  data-eve-system-layer="intuition_active_drag"
  data-atome-events-bound="true"
  data-eve-drag-bound="true"
  data-eve-resize-bound="true"
  data-media-api-ready="true">
</div>
```

Ce DOM est incorrect.

Ces attributs révèlent que plusieurs couches du pipeline continuent d’utiliser le DOM comme stockage applicatif :

* pipeline d’import média ;
* pipeline MTRAX ;
* pipeline WebGPU ;
* gestion des groupes ;
* gestion des bindings drag/resize/events ;
* gestion de l’état sélectionné ;
* synchronisation entre projet, groupe, média et renderer.

La correction doit donc être faite dans toutes les couches concernées, pas seulement dans la création générique d’un atome.

---

## Décision technique obligatoire

À partir de maintenant, la règle est stricte :

```txt
Runtime = source de vérité
Registry = stockage de l’état réel
DOM = projection visuelle minimale
```

Chaque atome possède un identifiant métier brut :

```js
atome_id = "file_1779975219260_2e17803fac43c8";
```

Le registre est indexé par cet identifiant brut :

```js
atomeRegistry.set(atome_id, atomeObject);
```

Le DOM reçoit uniquement un `id` dérivé et namespacé :

```html
<div id="eve-atome_file_1779975219260_2e17803fac43c8"></div>
```

Le DOM ne doit pas recevoir :

```html
<div data-atome-id="..."></div>
```

sauf cas explicitement justifié : debug temporaire, tests, SSR ou élément secondaire sans `id` principal.

Le DOM ne doit jamais recevoir :

```html
<div atome_id="..."></div>
```

---

## Résultat DOM attendu

Pour un atome média vidéo importé, le DOM final doit ressembler à ceci :

```html
<div
  id="eve-atome_file_1779975219260_2e17803fac43c8"
  class="eve-atome eve-matrix-tile eve-media-atome">
  <canvas width="187" height="333"></canvas>
</div>
```

Ou, si une structure interne est strictement nécessaire :

```html
<div
  id="eve-atome_file_1779975219260_2e17803fac43c8"
  class="eve-atome eve-matrix-tile eve-media-atome">
  <div class="eve-atome-media-host">
    <canvas class="eve-media-canvas" width="187" height="333"></canvas>
  </div>
</div>
```

Le DOM peut contenir :

* `id` ;
* `class` ;
* `style` uniquement si le système actuel dépend encore de styles inline pour position/dimension ;
* les enfants nécessaires au rendu visuel réel : `canvas`, `video`, `img`, etc.

Le DOM ne doit pas contenir de métadonnées runtime.

---

## Attributs interdits par défaut

Supprime ces attributs du DOM final :

```txt
data-atome-id
data-atome-kind
data-project-id
data-atome-selected
data-group-atome
data-group-id
data-group-type
data-mtrax-import
data-source-kind
data-media-kind
data-eve-media-renderer
data-eve-system-layer
data-atome-events-bound
data-eve-drag-bound
data-eve-resize-bound
data-media-api-ready
data-role
class=""
```

Ces informations doivent être stockées dans le registre runtime, pas dans le DOM.

---

## Données à déplacer dans le registre runtime

Toutes les informations actuellement écrites en `data-*` doivent être déplacées dans une structure mémoire claire.

Exemple :

```js
atomeRegistry.set("file_1779975219260_2e17803fac43c8", {
  atome_id: "file_1779975219260_2e17803fac43c8",
  kind: "group",
  project_id: "2c72c974-4579-4f8b-a698-955571e7a703",
  selected: false,
  group: {
    is_group_atome: true,
    group_id: "file_1779975219260_2e17803fac43c8",
    group_type: "mtrax_media"
  },
  import: {
    is_mtrax_import: true,
    source_kind: "mtrax_import"
  },
  media: {
    kind: "video",
    renderer: "webgpu",
    api_ready: true
  },
  system: {
    layer: "intuition_active_drag"
  },
  bindings: {
    events: true,
    drag: true,
    resize: true
  },
  layout: {
    x: 509,
    y: 88,
    width: 187,
    height: 333
  }
});
```

Le DOM ne doit contenir qu’une projection visuelle de ces données.

---

## Fonctions obligatoires

Implémente ou vérifie l’existence de fonctions centralisées pour transformer l’identifiant métier en identifiant DOM.

```js
const ATOME_DOM_PREFIX = "eve-atome_";

function toDomId(atome_id) {
  return `${ATOME_DOM_PREFIX}${atome_id}`;
}

function fromDomId(dom_id) {
  if (!dom_id.startsWith(ATOME_DOM_PREFIX)) return null;
  return dom_id.slice(ATOME_DOM_PREFIX.length);
}

function getAtomeElement(atome_id) {
  return document.getElementById(toDomId(atome_id));
}
```

Ces fonctions doivent être utilisées partout.

Il ne doit pas y avoir plusieurs manières concurrentes de générer un identifiant DOM.

---

## À rechercher impérativement dans le code

Tu dois chercher toutes les occurrences suivantes et les corriger :

```txt
dataset.atomeId
dataset.projectId
dataset.groupId
dataset.groupType
dataset.mediaKind
dataset.eveMediaRenderer
dataset.atomeEventsBound
dataset.eveDragBound
dataset.eveResizeBound
dataset.mediaApiReady

setAttribute("data-atome-id"
setAttribute("data-atome-kind"
setAttribute("data-project-id"
setAttribute("data-atome-selected"
setAttribute("data-group-atome"
setAttribute("data-group-id"
setAttribute("data-group-type"
setAttribute("data-mtrax-import"
setAttribute("data-source-kind"
setAttribute("data-media-kind"
setAttribute("data-eve-media-renderer"
setAttribute("data-eve-system-layer"
setAttribute("data-atome-events-bound"
setAttribute("data-eve-drag-bound"
setAttribute("data-eve-resize-bound"
setAttribute("data-media-api-ready"
setAttribute("data-role"
```

Ne te limite pas au renderer principal.

Vérifie aussi :

* import média ;
* création d’atome depuis fichier ;
* MTRAX import ;
* MTRAX media group ;
* preview média ;
* WebGPU canvas renderer ;
* drag manager ;
* resize manager ;
* event binder ;
* selection manager ;
* group manager ;
* project tile renderer ;
* tout code qui reconstruit le DOM après refresh ou reboot.

---

## Règle sur les bindings

Les flags de binding ne doivent plus être écrits dans le DOM :

```html
<div data-atome-events-bound="true"></div>
<div data-eve-drag-bound="true"></div>
<div data-eve-resize-bound="true"></div>
```

C’est interdit par défaut.

À la place, utilise un registre mémoire :

```js
const boundAtomes = new WeakMap();

function markBound(element, bindingInfo) {
  boundAtomes.set(element, bindingInfo);
}

function getBindingInfo(element) {
  return boundAtomes.get(element);
}
```

Ou dans le registre Atome :

```js
atomeRegistry.update(atome_id, {
  bindings: {
    events: true,
    drag: true,
    resize: true
  }
});
```

Le DOM n’a pas à savoir si un event listener a déjà été bindé.

---

## Règle sur les groupes

Les informations de groupe ne doivent plus être dupliquées dans le DOM :

```html
<div data-group-atome="true" data-group-id="..." data-group-type="mtrax_media"></div>
```

À la place :

```js
atomeRegistry.set(atome_id, {
  group: {
    is_group_atome: true,
    group_id: atome_id,
    group_type: "mtrax_media"
  }
});
```

Si un élément enfant doit retrouver son host principal, il doit utiliser :

```js
const host = event.target.closest(".eve-atome");
const atome_id = fromDomId(host.id);
```

Pas des duplications `data-group-*`.

---

## Règle sur les médias

Les informations média ne doivent plus être écrites dans le DOM :

```html
<div data-media-kind="video" data-eve-media-renderer="webgpu"></div>
```

À la place :

```js
atomeRegistry.set(atome_id, {
  media: {
    kind: "video",
    renderer: "webgpu"
  }
});
```

Le canvas doit être un élément de rendu, pas une base de données.

Exemple acceptable :

```html
<canvas class="eve-media-canvas" width="187" height="333"></canvas>
```

Exemple à éviter :

```html
<canvas
  data-role="eve-media-api-webgpu-canvas"
  data-renderer="molecule"
  data-media-api-ready="true">
</canvas>
```

---

## Règle sur `data-role`

`data-role` est interdit par défaut dans le DOM final.

Remplacer :

```html
<div data-role="atome-group-placeholder"></div>
<div data-role="mtrax-import-preview-media"></div>
<canvas data-role="eve-media-api-webgpu-canvas"></canvas>
```

par des classes propres :

```html
<div class="eve-atome-group-placeholder"></div>
<div class="eve-mtrax-import-preview-media"></div>
<canvas class="eve-media-canvas"></canvas>
```

Si le rôle est uniquement utilisé par JavaScript pour retrouver un élément, utiliser une classe stable.

Si le rôle contient une information métier, le déplacer dans le registre runtime.

---

## Règle sur les classes vides

Ne jamais générer :

```html
class=""
```

Si aucune classe n’est nécessaire, ne pas écrire l’attribut `class`.

Si l’élément est un host Atome, il doit au minimum recevoir :

```html
class="eve-atome"
```

Pour un média :

```html
class="eve-atome eve-media-atome"
```

Pour une tuile projet :

```html
class="eve-atome eve-matrix-tile"
```

---

## Règle sur les styles inline

Les styles inline sont tolérés temporairement uniquement pour les propriétés strictement nécessaires au layout actuel :

```css
position
left
top
width
height
box-sizing
transform
z-index
```

Mais les styles décoratifs doivent progressivement passer en classes CSS :

```css
border
border-radius
background
box-shadow
color
overflow
touch-action
pointer-events
```

Correction minimale acceptable dans cette tâche : ne pas casser le rendu visuel.

Correction idéale : réduire aussi les styles inline si possible.

Mais la priorité absolue de cette tâche est la suppression des attributs `data-*` inutiles.

---

## DOM final attendu pour le cas fourni

À partir du DOM non conforme, le rendu final doit devenir proche de ceci :

```html
<div
  id="eve-atome_file_1779975219260_2e17803fac43c8"
  class="eve-atome eve-matrix-tile eve-media-atome"
  style="position: absolute; left: 509px; top: 88px; width: 187px; height: 333px; box-sizing: border-box;">
  <div class="eve-atome-media-host">
    <canvas class="eve-media-canvas" width="187" height="333"></canvas>
  </div>
</div>
```

Aucun des attributs suivants ne doit rester :

```txt
data-atome-id
data-atome-kind
data-project-id
data-atome-selected
data-group-atome
data-group-id
data-group-type
data-mtrax-import
data-source-kind
data-media-kind
data-eve-media-renderer
data-eve-system-layer
data-atome-events-bound
data-eve-drag-bound
data-eve-resize-bound
data-media-api-ready
data-role
data-renderer
```

---

## Validation obligatoire

Tu ne dois pas considérer la tâche terminée tant que ces vérifications ne passent pas.

### 1. Inspection DOM manuelle

Après import d’un média vidéo, inspecter le DOM final.

Le host principal doit avoir :

```html
id="eve-atome_<atome_id>"
```

Il ne doit pas avoir :

```html
data-atome-id="..."
```

### 2. Test automatisé DOM

Créer ou adapter un test qui échoue si un atome rendu contient des attributs interdits.

Exemple :

```js
const forbiddenAttributes = [
  "data-atome-id",
  "data-atome-kind",
  "data-project-id",
  "data-atome-selected",
  "data-group-atome",
  "data-group-id",
  "data-group-type",
  "data-mtrax-import",
  "data-source-kind",
  "data-media-kind",
  "data-eve-media-renderer",
  "data-eve-system-layer",
  "data-atome-events-bound",
  "data-eve-drag-bound",
  "data-eve-resize-bound",
  "data-media-api-ready",
  "data-role",
  "data-renderer"
];

function assertCleanAtomeDom(root) {
  const elements = root.querySelectorAll("*");

  for (const element of elements) {
    for (const attributeName of forbiddenAttributes) {
      if (element.hasAttribute(attributeName)) {
        throw new Error(
          `Forbidden DOM attribute found: ${attributeName} on ${element.tagName}`
        );
      }
    }

    if (element.getAttribute("class") === "") {
      throw new Error(`Empty class attribute found on ${element.tagName}`);
    }
  }
}
```

### 3. Test d’import média

Tester au minimum :

* import vidéo ;
* import audio ;
* refresh après import ;
* reboot ou reload complet ;
* drag de l’atome ;
* resize de l’atome ;
* sélection/désélection ;
* récupération de l’atome depuis un event DOM ;
* rendu du canvas WebGPU ;
* persistance du visuel après refresh.

### 4. Vérification fonctionnelle

Après nettoyage du DOM, les fonctionnalités suivantes doivent toujours marcher :

* affichage du média ;
* canvas WebGPU ;
* sélection ;
* déplacement ;
* redimensionnement ;
* récupération de l’objet Atome depuis le DOM ;
* sauvegarde/restauration ;
* refresh ;
* reboot ;
* import multiple de fichiers audio/vidéo.

---

## Interdiction de correction superficielle

Ne fais pas une correction cosmétique en supprimant seulement les attributs au dernier moment avec un post-traitement du DOM.

Ce type de correction est interdit :

```js
element.removeAttribute("data-atome-id");
element.removeAttribute("data-project-id");
```

s’il sert seulement à masquer le problème après coup.

La vraie correction doit être faite à la source :

* ne pas créer ces attributs ;
* déplacer les données dans le registre ;
* remplacer les recherches DOM par des recherches dans le registre ;
* utiliser `id` uniquement pour relier host DOM et atome runtime.

Un nettoyage final peut être ajouté comme garde-fou, mais il ne doit pas être la correction principale.

---

## Critère de réussite

La tâche est réussie uniquement si :

```txt
1. Un atome importé possède un id DOM namespacé.
2. Le registre runtime reste indexé par atome_id brut.
3. Aucun attribut data-* métier/runtime n’est présent dans le DOM final.
4. Aucun flag de binding n’est présent dans le DOM final.
5. Aucun data-role n’est présent dans le DOM final.
6. Aucun class="" vide n’est généré.
7. L’import vidéo fonctionne toujours.
8. L’import audio fonctionne toujours.
9. Le canvas WebGPU fonctionne toujours.
10. Le visuel reste présent après refresh ou reboot.
11. Les tests automatisés échouent si les attributs interdits réapparaissent.
```

Si un attribut `data-*` doit absolument rester, il faut le justifier explicitement dans un commentaire de code et dans le rapport final, avec la raison technique précise.

Par défaut, aucun `data-*` n’est autorisé sur un atome final.

---

## Résultat attendu du rapport final

À la fin, fournir un rapport court avec :

```txt
1. Fichiers modifiés.
2. Anciennes sources d’injection des data-* trouvées.
3. Données déplacées dans le registre runtime.
4. Nouveau DOM final observé pour un import vidéo.
5. Nouveau DOM final observé pour un import audio.
6. Tests ajoutés ou modifiés.
7. Résultat des tests.
8. Liste des éventuels data-* restants avec justification obligatoire.
```

Si le DOM final contient encore les attributs interdits listés plus haut, la tâche n’est pas terminée.

---

## Résumé impératif

Ne corrige pas seulement l’apparence du DOM.

Corrige l’architecture.

L’atome ne doit plus transporter son état métier dans le HTML.

Le DOM doit être une projection minimale.

Le runtime doit être la source de vérité.

Le registre doit contenir les informations métier, média, groupe, projet, sélection, bindings et renderer.

Le host DOM principal doit contenir uniquement :

```html
id="eve-atome_<atome_id>"
```

plus les classes et éléments strictement nécessaires au rendu visuel.

Tout le reste doit être supprimé du DOM ou déplacé dans le registre runtime.
