# Prompt — Correction finale du DOM Atome : empêcher les données runtime déguisées en classes ou styles

## Objectif

Corriger les derniers problèmes restants dans le DOM des atomes Atome/eVe.

Les gros attributs `data-*` ont été supprimés, mais certaines données runtime semblent maintenant réapparaître sous une autre forme, notamment dans les classes CSS ou dans les styles inline.

La correction précédente a amélioré le DOM, mais elle n’est pas encore suffisante.

Le but de cette tâche est d’empêcher définitivement que les données métier/runtime soient stockées dans le DOM, quelle que soit leur forme.

---

## Règle principale

Le DOM final peut contenir :

```txt
1. Des tags HTML/SVG nécessaires au rendu visuel.
2. Un id DOM unique et namespacé sur le host principal.
3. Des classes CSS structurelles ou visuelles.
4. Des classes d’état UI génériques.
5. Des styles inline strictement nécessaires au layout dynamique, si le moteur actuel en dépend encore.
```

Le DOM final ne doit contenir aucune donnée métier/runtime, ni sous forme de :

```txt
data-*
attribut custom
classe CSS déguisée
style inline d’état métier
commentaire DOM
id secondaire non nécessaire
```

Le DOM doit rester une projection visuelle minimale.

Le registre runtime doit rester la source de vérité.

---

## Exemples actuels problématiques

### Exemple 1 — Atome SVG

DOM observé :

```html
<div
  id="eve-atome_file_1779980567044_557b12f169aa5"
  class="eve-atome eve-matrix-tile eve-system-layer-intuition_active_drag"
  style="position: absolute; left: 373px; top: 114px; width: 275px; height: 229px; box-sizing: border-box; border: medium; border-radius: 10px; background: none; box-shadow: var(--eve-desktop-atome-shadow, 0 0 12px rgba(0, 0, 0, 0.39)); color: rgb(255, 255, 255); overflow: visible; touch-action: none;">
  <div class="eve-atome-shape-svg">
    <svg>...</svg>
  </div>
</div>
```

Problèmes :

```txt
1. eve-system-layer-intuition_active_drag est une donnée runtime déguisée en classe CSS.
2. border: medium est un style incorrect ou mal généré.
3. Trop de styles décoratifs restent en inline.
```

### Exemple 2 — Atome média/canvas

DOM observé :

```html
<div
  id="eve-atome_file_1779954925407_1a77ad439c19b"
  class="eve-atome eve-matrix-tile"
  style="position: absolute; left: 616px; top: 256px; width: 120px; height: 213px; box-sizing: border-box; border: medium; border-radius: 8px; background: none; box-shadow: rgb(0, 0, 0) 0px 0px 0px 1px, rgb(0, 0, 0) 0px 0px 12px; color: rgb(255, 255, 255); overflow: hidden; touch-action: none; outline: 1px dotted rgba(255, 255, 255, 0.96); outline-offset: 0px;">
  <div class="eve-atome-group-placeholder">
    <div class="eve-mtrax-import-preview-media">
      <canvas class="eve-media-canvas"></canvas>
    </div>
  </div>
</div>
```

Problèmes :

```txt
1. border: medium est incorrect.
2. outline inline représente probablement l’état sélectionné.
3. L’état sélectionné doit être exprimé par une classe générique is-selected.
4. Les styles décoratifs doivent être déplacés vers des classes CSS.
```

---

## Correction obligatoire 1 — Interdire les classes runtime déguisées

Il ne suffit pas de supprimer les `data-*`.

Il est interdit de transformer :

```html
data-eve-system-layer="intuition_active_drag"
```

en :

```html
class="eve-system-layer-intuition_active_drag"
```

C’est le même problème sous une autre forme.

### Classes interdites

Toute classe contenant une donnée métier ou runtime spécifique est interdite dans le DOM final.

Interdire les formes de ce type :

```txt
eve-system-layer-*
eve-project-id-*
eve-group-id-*
eve-media-kind-*
eve-renderer-*
eve-source-kind-*
eve-mtrax-import-*
eve-atome-kind-*
eve-binding-*
eve-events-bound-*
eve-drag-bound-*
eve-resize-bound-*
eve-api-ready-*
eve-selected-true
eve-selected-false
```

Exemple interdit :

```html
class="eve-system-layer-intuition_active_drag"
```

Exemple également interdit :

```html
class="eve-media-kind-video eve-renderer-webgpu"
```

### Classes autorisées

Les classes sont autorisées uniquement si elles servent au style, à la structure visuelle ou à un état UI générique.

Classes autorisées par défaut :

```txt
eve-atome
eve-matrix-tile
eve-media-atome
eve-shape-atome
eve-svg-atome
eve-atome-shape-svg
eve-atome-group-placeholder
eve-mtrax-import-preview-media
eve-media-canvas
is-selected
is-dragging
is-resizing
is-hidden
is-disabled
is-focused
```

Important :

```txt
is-selected est autorisé.
eve-selected-true est interdit.

eve-media-atome est autorisé.
eve-media-kind-video est interdit.

eve-svg-atome est autorisé.
eve-renderer-svg est interdit si cela sert seulement à stocker le renderer.
```

---

## Correction obligatoire 2 — Déplacer system_layer dans le registre runtime

Supprimer du DOM :

```html
class="eve-system-layer-intuition_active_drag"
```

Et stocker l’information dans le registre :

```js
atomeRegistry.update(atome_id, {
  system: {
    layer: "intuition_active_drag"
  }
});
```

Si le besoin réel est un état visuel pendant un drag, utiliser une classe générique :

```html
class="eve-atome eve-matrix-tile is-dragging"
```

Mais ne jamais stocker le nom interne du layer système dans la classe DOM.

---

## Correction obligatoire 3 — Corriger `border: medium`

Supprimer toute génération de :

```css
border: medium;
```

Ce style est incorrect, ambigu et inutile.

Remplacement autorisé :

```css
border: none;
```

ou, si une bordure visible est réellement voulue :

```css
border: 1px solid rgba(255, 255, 255, 0.45);
```

Décision recommandée pour les atomes :

```css
border: none;
```

Puis utiliser `outline` ou `box-shadow` via classes CSS pour les états visuels.

---

## Correction obligatoire 4 — Sortir `outline` du style inline

Le DOM ne doit pas stocker l’état sélectionné par style inline.

Interdit :

```html
<div style="outline: 1px dotted rgba(255, 255, 255, 0.96); outline-offset: 0px;"></div>
```

Autorisé :

```html
<div class="eve-atome eve-matrix-tile is-selected"></div>
```

CSS correspondant :

```css
.eve-atome.is-selected {
  outline: 1px dotted rgba(255, 255, 255, 0.96);
  outline-offset: 0;
}
```

Si l’atome n’est pas sélectionné, la classe `is-selected` doit être absente.

Ne pas utiliser :

```html
class="eve-selected-true"
class="eve-selected-false"
```

---

## Correction obligatoire 5 — Ajouter des classes visuelles génériques adaptées au type d’atome

Pour un atome média/canvas, utiliser :

```html
class="eve-atome eve-matrix-tile eve-media-atome"
```

Pour un atome SVG/forme, utiliser :

```html
class="eve-atome eve-matrix-tile eve-shape-atome eve-svg-atome"
```

Ces classes sont acceptées car elles décrivent une catégorie visuelle générale.

Elles ne doivent pas contenir :

```txt
id métier
type runtime exact
renderer exact
nom de layer interne
nom de projet
état booléen métier
```

---

## Correction obligatoire 6 — Déplacer les styles décoratifs vers CSS

Les styles inline doivent être réduits.

### Styles inline tolérés temporairement

Les styles de layout dynamique peuvent rester inline :

```css
position: absolute;
left: 373px;
top: 114px;
width: 275px;
height: 229px;
```

Ces valeurs dépendent de la position et de la taille de l’atome.

### Styles à déplacer vers CSS

Déplacer vers des classes CSS :

```css
box-sizing: border-box;
border: none;
border-radius: 8px;
border-radius: 10px;
background: none;
box-shadow: var(--eve-desktop-atome-shadow, 0 0 12px rgba(0, 0, 0, 0.39));
color: rgb(255, 255, 255);
overflow: hidden;
overflow: visible;
touch-action: none;
outline: ...;
outline-offset: ...;
pointer-events: none;
display: block;
```

Si certains styles doivent rester dynamiques, ils doivent être justifiés.

---

## CSS recommandé

Ajouter ou vérifier des classes CSS centralisées :

```css
.eve-atome {
  position: absolute;
  box-sizing: border-box;
  background: none;
  color: rgb(255, 255, 255);
  touch-action: none;
}

.eve-matrix-tile {
  border: none;
  border-radius: 8px;
  box-shadow: var(--eve-desktop-atome-shadow, 0 0 12px rgba(0, 0, 0, 0.39));
}

.eve-media-atome {
  overflow: hidden;
}

.eve-shape-atome {
  overflow: visible;
}

.eve-shape-atome.eve-rounded-large {
  border-radius: 10px;
}

.eve-atome.is-selected {
  outline: 1px dotted rgba(255, 255, 255, 0.96);
  outline-offset: 0;
}

.eve-atome-shape-svg {
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.eve-atome-shape-svg svg {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.eve-atome-group-placeholder {
  position: absolute;
  inset: 0;
  background: none;
  pointer-events: none;
  overflow: hidden;
  z-index: 1;
}

.eve-mtrax-import-preview-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  background: none;
}

.eve-media-canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: none;
  pointer-events: none;
}
```

---

## DOM cible — Atome SVG

Le DOM cible pour un atome SVG doit devenir :

```html
<div
  id="eve-atome_file_1779980567044_557b12f169aa5"
  class="eve-atome eve-matrix-tile eve-shape-atome eve-svg-atome eve-rounded-large"
  style="left: 373px; top: 114px; width: 275px; height: 229px;">
  <div class="eve-atome-shape-svg">
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      x="0px"
      y="0px"
      viewBox="0 0 64 64"
      xml:space="preserve"
      preserveAspectRatio="xMidYMid meet">
      <!-- contenu SVG nécessaire au rendu -->
    </svg>
  </div>
</div>
```

Ne pas mettre :

```html
class="eve-system-layer-intuition_active_drag"
```

Ne pas mettre :

```css
border: medium;
```

---

## DOM cible — Atome média/canvas

Le DOM cible pour un atome média doit devenir :

```html
<div
  id="eve-atome_file_1779954925407_1a77ad439c19b"
  class="eve-atome eve-matrix-tile eve-media-atome is-selected"
  style="left: 616px; top: 256px; width: 120px; height: 213px;">
  <div class="eve-atome-group-placeholder">
    <div class="eve-mtrax-import-preview-media">
      <canvas class="eve-media-canvas" width="120" height="213"></canvas>
    </div>
  </div>
</div>
```

Si l’atome n’est pas sélectionné :

```html
<div
  id="eve-atome_file_1779954925407_1a77ad439c19b"
  class="eve-atome eve-matrix-tile eve-media-atome"
  style="left: 616px; top: 256px; width: 120px; height: 213px;">
```

---

## Attention aux SVG inline

Les tags SVG nécessaires au rendu sont autorisés :

```html
<svg>
<g>
<circle>
<path>
<ellipse>
```

Ne pas interdire tous les tags.

Ce qu’il faut interdire, ce sont les marqueurs runtime inutiles dans le DOM.

Les `id` internes SVG générés par le fichier source peuvent rester si le SVG en dépend, mais ils doivent être vérifiés.

Exemple :

```html
<g id="_s5t7e4g_Layer_1">
```

Acceptable si le SVG l’utilise réellement.

Mais si ces ids ne servent à rien, les supprimer ou les nettoyer.

Les classes SVG internes comme :

```html
class="st0"
class="st1"
class="st2"
```

sont acceptables si elles proviennent du SVG source ou servent au style.

---

## Tests obligatoires

Ajouter ou mettre à jour un test DOM qui interdit :

```txt
data-*
atome_id="..."
class contenant eve-system-layer-
class contenant eve-project-id-
class contenant eve-group-id-
class contenant eve-media-kind-
class contenant eve-renderer-
class contenant eve-source-kind-
class contenant eve-binding-
class contenant eve-events-bound-
class contenant eve-drag-bound-
class contenant eve-resize-bound-
class contenant eve-api-ready-
class contenant eve-selected-true
class contenant eve-selected-false
style contenant border: medium
style contenant outline si l’élément n’utilise pas is-selected
```

Exemple de test :

```js
const forbiddenAttributePrefixes = [
  "data-"
];

const forbiddenClassPrefixes = [
  "eve-system-layer-",
  "eve-project-id-",
  "eve-group-id-",
  "eve-media-kind-",
  "eve-renderer-",
  "eve-source-kind-",
  "eve-mtrax-import-",
  "eve-atome-kind-",
  "eve-binding-",
  "eve-events-bound-",
  "eve-drag-bound-",
  "eve-resize-bound-",
  "eve-api-ready-"
];

const forbiddenExactClasses = [
  "eve-selected-true",
  "eve-selected-false"
];

function assertCleanAtomeDom(root) {
  const elements = [root, ...root.querySelectorAll("*")];

  for (const element of elements) {
    for (const attr of element.getAttributeNames()) {
      if (forbiddenAttributePrefixes.some(prefix => attr.startsWith(prefix))) {
        throw new Error(`Forbidden attribute found: ${attr} on ${element.tagName}`);
      }

      if (attr === "atome_id") {
        throw new Error(`Forbidden custom attribute found: ${attr} on ${element.tagName}`);
      }
    }

    for (const className of element.classList) {
      if (forbiddenExactClasses.includes(className)) {
        throw new Error(`Forbidden class found: ${className} on ${element.tagName}`);
      }

      if (forbiddenClassPrefixes.some(prefix => className.startsWith(prefix))) {
        throw new Error(`Forbidden runtime class found: ${className} on ${element.tagName}`);
      }
    }

    const style = element.getAttribute("style") || "";

    if (/border\s*:\s*medium/i.test(style)) {
      throw new Error(`Forbidden CSS found: border: medium on ${element.tagName}`);
    }

    if (/outline\s*:/i.test(style) && !element.classList.contains("is-selected")) {
      throw new Error(`Inline outline found without is-selected on ${element.tagName}`);
    }
  }
}
```

---

## Vérifications fonctionnelles obligatoires

Après correction, tester :

```txt
1. Création d’un atome SVG.
2. Création d’un atome média/canvas.
3. Import vidéo.
4. Import audio.
5. Sélection/désélection.
6. Drag.
7. Resize.
8. Refresh.
9. Reboot/reload complet.
10. Persistance du visuel.
11. Récupération de l’atome depuis un event DOM via closest('.eve-atome') puis fromDomId(host.id).
```

---

## Règle sur la récupération de l’atome depuis le DOM

Le seul lien autorisé entre DOM et runtime est l’id du host principal.

Exemple :

```js
const host = event.target.closest(".eve-atome");
if (!host) return;

const atome_id = fromDomId(host.id);
if (!atome_id) return;

const atome = atomeRegistry.get(atome_id);
```

Ne pas lire l’état depuis :

```txt
dataset
classes runtime déguisées
styles inline
attributs custom
```

---

## Critères de réussite

La tâche est réussie uniquement si :

```txt
1. Aucun data-* runtime ou métier ne reste dans le DOM final.
2. Aucun attribut custom atome_id ne reste dans le DOM final.
3. Aucune classe runtime déguisée ne reste dans le DOM final.
4. eve-system-layer-intuition_active_drag est supprimé.
5. system.layer est stocké dans le registre runtime.
6. border: medium n’apparaît plus jamais.
7. L’état sélectionné utilise is-selected au lieu d’un outline inline direct.
8. Les atomes média utilisent eve-media-atome.
9. Les atomes SVG utilisent eve-shape-atome et eve-svg-atome.
10. Les styles décoratifs principaux sont déplacés vers CSS.
11. Les fonctions existantes de drag, resize, sélection, import média, SVG et refresh continuent de fonctionner.
12. Un test automatisé échoue si une donnée runtime revient dans le DOM sous forme d’attribut, de classe ou de style.
```

---

## Rapport final attendu

À la fin de la correction, fournir :

```txt
1. Liste des fichiers modifiés.
2. Liste des anciennes injections runtime trouvées.
3. Confirmation que eve-system-layer-intuition_active_drag a été retiré du DOM.
4. Emplacement où system.layer est maintenant stocké.
5. Confirmation que border: medium a disparu.
6. Confirmation que la sélection utilise is-selected.
7. Nouveau DOM final observé pour un atome SVG.
8. Nouveau DOM final observé pour un atome média/canvas.
9. Résultat des tests automatisés.
10. Liste des éventuelles exceptions restantes, avec justification technique.
```

Si une donnée runtime est encore visible dans le DOM final, même sous forme de classe CSS, la tâche n’est pas terminée.

---

## Résumé impératif

Ne pas remplacer les `data-*` par des classes contenant les mêmes informations.

Ne pas cacher les données runtime dans le DOM.

Ne pas stocker les états métier dans les styles inline.

Ne pas interdire les tags nécessaires au rendu.

Interdire seulement les marqueurs métier/runtime dans le DOM.

La règle finale est :

```txt
Tags visuels autorisés.
Classes visuelles autorisées.
États UI génériques autorisés.
Données métier/runtime interdites dans le DOM, sous toutes leurs formes.
```

Le DOM doit être propre, lisible, minimal et uniquement visuel.

Le runtime et le registre Atome restent les seules sources de vérité.
