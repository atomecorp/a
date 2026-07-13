# Prompt — Modifier le menu actuel avec les fonctionnalités MVP v146

## Rôle

Tu es un agent de développement senior chargé de modifier le système de menu existant d’**eVe Intuition**.

Tu dois travailler à partir de deux documents fournis dans le contexte :

1. `actual_menu.md` — audit du menu actuellement en production.
2. `ui_project_system_specification_v146_MVP_consolidated.md` — cahier des charges MVP v146 à intégrer.

Ta mission n’est **pas** de créer une maquette isolée ni de remplacer le système par un prototype monolithique. Tu dois intégrer les fonctionnalités MVP v146 dans l’architecture actuelle, en conservant les contrats fonctionnels du menu existant.

---

## Objectif principal

Modifier le menu actuel afin qu’il supporte les fonctionnalités MVP v146 suivantes :

- main toolbox verticale, transparente, avec rendu glass ;
- toolbars contextuelles par projet ;
- Flower menu en modes horizontal, vertical et arc ;
- Palettes extensibles dans tous les menus ;
- modes d’outils `momentary` et `latch` ;
- comportement global droitier/gaucher ;
- docking, minimisation, maximisation et fermeture/restauration des projets ;
- protection des projets quand le Flower est ouvert ;
- suppression des sélections et drags natifs navigateur ;
- maintien des APIs, routes, payloads et états latched déjà utilisés par le système actuel.

Le résultat attendu est une modification robuste du système existant, pas une réécriture qui perd les comportements présents.

---

## Contrat obligatoire iOS / tactile / souris / multi-input

Toutes les fonctionnalités du menu doivent fonctionner de manière équivalente sur :

```text
- desktop avec souris ;
- desktop avec trackpad ;
- mobile tactile ;
- tablette tactile ;
- iOS / iPadOS Safari / WebKit ;
- iOS / iPadOS avec souris ou trackpad externe connecté.
```

Ce contrat s’applique à **toutes** les surfaces de menu :

```text
MainToolboxSurface / main toolbox verticale
FlowerContextSurface
ProjectContextToolbarSurface
AtomeFooterSurface
InlineToolStripSurface
Palettes
Flower solo clone
contrôles globaux MVP
projets dockés / minimisés / maximisés
```

Exigence stricte : une fonctionnalité disponible à la souris doit avoir le même comportement au doigt/tactile, et inversement. Il ne doit pas exister de fonctionnalité uniquement utilisable à la souris, uniquement utilisable au hover, ou uniquement utilisable sur desktop.

### Gestes et équivalences obligatoires

Les équivalences minimales sont :

```text
click souris               = tap tactile
right click souris         = clic droit souris/trackpad externe, y compris iOS/iPadOS si disponible
long press souris/touch    = long touch iOS/Android/tablette
drag souris                = drag tactile
pointer release souris     = relâchement doigt/stylet/souris
Escape clavier             = fermeture aussi possible par tap/click hors menu
hover souris               = jamais le seul moyen d’accéder à une fonction
```

Le clic droit avec une souris ou un trackpad connecté à iOS/iPadOS doit ouvrir le Flower comme sur desktop :

```text
- ouverture au pointerdown ;
- positionnement au point d’impact ;
- menu contextuel natif bloqué ;
- aucune navigation ;
- aucune sélection native ;
- aucune action fantôme si le navigateur ne fournit pas les événements de mouvement nécessaires.
```

Le long touch iOS/iPadOS doit ouvrir le Flower sans déclencher :

```text
- loupe native ;
- callout iOS ;
- sélection texte/image ;
- drag image natif ;
- menu contextuel Safari ;
- highlight bleu/gris de tap.
```

Les Palettes ne doivent pas dépendre du hover pour être utilisables. Le ruban peut réagir au hover sur desktop, mais doit aussi réagir au tap/click/pointerdown sur mobile et tactile.

### Règles d’implémentation multi-input

Utilise prioritairement Pointer Events quand le runtime les supporte, avec fallback Touch Events/Mouse Events si nécessaire pour iOS/WebKit.

Normalise les entrées dans une couche unique, par exemple :

```text
MenuInputController / PointerGestureAdapter / équivalent existant
```

Cette couche doit produire des intentions stables :

```text
primaryTap
secondaryPress
longPress
dragStart
dragMove
dragEnd
pointerCancel
outsidePress
```

Ne disperse pas des comportements divergents `touchstart`, `mousedown`, `contextmenu`, `click` dans chaque composant. Les surfaces doivent consommer les mêmes intentions normalisées.

Les événements suivants doivent être neutralisés sur les zones de menu et de projet quand ils peuvent produire un comportement navigateur non désiré :

```text
contextmenu
auxclick
selectstart
dragstart
touch-callout
native image drag
native text selection
double-tap zoom si applicable
```

Ne bloque pas les événements nécessaires au drag, au scroll interne volontaire, ou aux interactions runtime existantes hors menu. Les garde-fous doivent être ciblés.

---

## Documents à lire avant toute modification

Lis entièrement :

- `actual_menu.md` ;
- `ui_project_system_specification_v146_MVP_consolidated.md`.

Ensuite seulement, inspecte le code source réel.

Ne te base pas sur les anciens chemins historiques mentionnés dans l’audit comme sources de vérité. Le chemin propriétaire actif est :

```text
eVe/intuition/
```

Les chemins historiques ou parallèles ne doivent servir que de référence, jamais de base d’implémentation principale.

---

## Règles de priorité en cas de conflit

En cas de conflit entre les deux documents :

1. `actual_menu.md` gagne pour les contrats de production :
   - tool IDs canoniques ;
   - APIs publiques ;
   - authentification ;
   - routage des outils ;
   - payloads ;
   - sélection atome/projet ;
   - MTraX ;
   - compatibilité ;
   - séparation des surfaces ;
   - layer contract.

2. `ui_project_system_specification_v146_MVP_consolidated.md` gagne pour les fonctionnalités MVP à ajouter :
   - rendu glass ;
   - toolbox verticale ;
   - contrôles globaux ;
   - Flower horizontal/vertical/arc ;
   - Palettes et rubans externes ;
   - modes `momentary` / `latch` ;
   - docking projet ;
   - protection interaction projet quand Flower est ouvert.

3. Si une demande MVP impose une forme visuelle différente d’un composant existant, crée une variante ou un adaptateur qui conserve l’API existante.

4. Ne fusionne pas toutes les surfaces dans un renderer unique. Le système actuel est volontairement composé de surfaces spécialisées.

---

## Invariants de production à préserver absolument

Ne casse pas les invariants suivants.

### 1. Source canonique des tools

Le modèle canonique reste basé sur `intuition_content` et les définitions de tools existantes.

Les menus visibles ne sont pas de simples boutons DOM : chaque entrée correspond à une identité outil stable, potentiellement enregistrée dans le runtime.

Conserve les IDs existants, notamment les root tools actuels :

```text
home
matrix
find
activity
capture
time
undo
perform
help
```

Ajoute les tools MVP sans supprimer ces IDs. Si une entrée MVP correspond déjà à un outil existant, mappe-la vers la définition canonique existante. Si elle n’existe pas, ajoute une définition canonique propre.

Tools MVP minimaux à exposer dans la main toolbox :

```text
Home
Draw
Grid
Shape
Audio
Play
Media
Prefs
Keys
Nodes
List
Layer
```

La Palette doit être placée au milieu des tools, pas en début ni en fin.

### 2. Séparation des surfaces

Préserve la séparation actuelle :

```text
MainRibbonSurface / MainToolboxSurface
FlowerContextSurface
AtomeFooterSurface
InlineToolStripSurface
CompatibilityFacade
```

Ne transforme pas le système en un seul composant générique qui essaie de tout faire.

### 3. Main menu auth-gated

Conserve le comportement d’authentification du main menu :

- utilisateur authentifié : tools normales visibles ;
- utilisateur déconnecté/anonyme : root children vides ;
- état déconnecté : `home` est patché en label `Atome` avec l’icône Atome ;
- long press du handle :
  - authentifié : AI panel ;
  - déconnecté : Home panel.

### 4. Invocation des tools

Conserve les dispatchers existants :

```text
invokeIntuitionXMainRibbonToolDefinition(...)
invokeIntuitionXFooterToolDefinition(...)
invokeAtomeEditFooterToolDefinitionWithContext(...)
invokeFlowerContextTool(...)
```

Conserve le chemin commun :

```text
surface dispatcher
→ invokeUnifiedContextTool(...)
→ invokeToolFromUiButton(...)
→ runtime/gateway handler
```

Ne remplace pas ce routage par des handlers DOM locaux dispersés.

### 5. Flower context runtime

Le Flower actuel ne se limite pas à une vue radiale. Préserve :

- résolution target atome/projet ;
- sélection simple/multiple ;
- mixed-kind selection ;
- perform mode ;
- blockers ;
- click suppression ;
- pointer release guard ;
- preview interaction suspension ;
- hover-release activation.

### 6. Footer / MTraX

Ne casse pas :

- double-click atome pour ouvrir/fermer le footer ;
- entrée text editing pour les atomes texte ;
- redirection MTraX pour les cibles media-like ;
- tool set MTraX élargi ;
- payloads actifs atome/sélection ;
- API `window.eveAtomeEditFooterApi`.

### 7. Latched-state sync

Les états actifs/latched doivent rester synchronisés entre :

- main toolbox/ribbon ;
- footer ;
- inline tool rows ;
- panels Molecule / MTraX si concernés.

Le mode `latch` MVP doit utiliser ou étendre ce mécanisme, pas créer un état parallèle incompatible.

### 8. APIs publiques

Conserve les surfaces de compatibilité :

```text
window.new_menu_v2
window.new_menu
window.eveAtomeEditFooterApi
window.__DEBUG__.getFooterState()
```

Si tu dois modifier leur implémentation interne, garde leur contrat externe stable.

---

## Architecture cible recommandée

Implémente les nouveautés MVP en respectant cette structure.

### 1. `MenuToolModel`

Responsabilités :

- normaliser les keys et tool IDs ;
- résoudre les définitions de tools ;
- exposer les tools selon surface ;
- intégrer les nouveaux tools MVP ;
- attribuer les modes `momentary` / `latch` aux tools simples.

### 2. `MenuInvocationBridge`

Responsabilités :

- conserver le routage commun vers `invokeUnifiedContextTool(...)` ;
- centraliser les payloads par surface ;
- garder les special cases existants : `find`, `info`, `delete`, `import`, `perform`, `mtrack`, sliders, transports MTraX.

### 3. `MainToolboxSurface`

Responsabilités :

- présenter le main menu en toolbox verticale ;
- ancrer les tools par le bas ;
- gérer repli/dépli ;
- supporter droitier/gaucher ;
- rendre les conteneurs transparents ;
- garder les APIs équivalentes au ribbon actuel.

Si l’implémentation actuelle `createIntuitionXRibbon(...)` reste utilisée, ajoute une variante verticale compatible plutôt que de casser son contrat.

### 4. `ProjectContextToolbarSurface`

Responsabilités :

- une toolbar contextuelle par projet ;
- affichage de la toolbar du projet focalisé ;
- dock on/off ;
- alignement droitier/gaucher ;
- reuse du renderer inline si possible.

Cette surface ne remplace pas l’Atome Edit Footer. Ce sont deux surfaces différentes.

### 5. `FlowerContextSurface`

Responsabilités :

- clic droit au `pointerdown` ;
- long press / long touch ;
- modes horizontal, vertical, arc ;
- drag-select ;
- isolation Palette ;
- solo clone après activation ;
- protection des projets pendant ouverture ;
- conservation des règles de contexte actuelles.

### 6. `PaletteController`

Responsabilités :

- comportement commun des Palettes ;
- ruban externe ;
- hitbox ruban ;
- ouverture/fermeture ;
- isolation dans Flower ;
- un seul état de Palette ouverte par surface.

### 7. `ProjectController`

Responsabilités :

- moteur unique pour tous les projets ;
- focus ;
- drag ;
- resize ;
- close/restore ;
- maximize/window ;
- minimize/dock ;
- ultra-compact ;
- dock stacking ;
- relayout quand focus, dock, fermeture, restauration ou handedness changent.

---

## État global MVP à ajouter

Ajoute ou adapte un état global équivalent à :

```js
appState = {
  leftHanded: false,
  menuCollapsed: false,
  contextDocked: true,
  headerBottom: false,
  focusedProjectId: "p1",
  flowerVertical: false,
  flowerArc: false,
  externalPaletteBand: true,
  flowerOpen: false
};
```

Tous les contrôles globaux doivent refléter cet état au démarrage.

Boutons globaux requis :

```text
Droitier/Gaucher
Dock on/off
Header haut / Footer bas
Flower vertical/horizontal
Flower arc on/off
Ext. Band on/off
```

Position :

```css
position: fixed;
left: 120px;
top: 14px;
z-index: 5;
```

Le bouton `Flower arc` est sur une deuxième ligne avec `Ext. Band`.

Les contrôles globaux restent derrière les projets.

---

## Layout et projets MVP

Au chargement, créer ou adapter deux projets :

```js
project 1: { left: 80,  top: 80, width: 520, height: 260 }
project 2: { left: 660, top: 80, width: 520, height: 260 }
```

Les deux projets doivent utiliser strictement le même `ProjectController`.

Projet 1 :

- contient une image raster de démonstration ;
- image intégrée dans le projet ;
- style glass / rounded.

Projet 2 :

- contient un SVG inline de démonstration ;
- supprimer tout bouton désactivé `Projet 2`.

Z-index MVP à appliquer aux nouvelles surfaces projet :

```text
global controls        z-index 5
projet normal          z-index 10
projet focalisé        z-index 70
toolbar contextuelle   z-index 80
projet en drag         z-index 140
projet docké           z-index 220
main toolbox           couche MENU existante / équivalent visuel 300
Flower menu            couche FLOWER existante / au-dessus des projets
Flower solo tool       z-index 5000
```

Ne viole pas le `layer_contract.js` de production. Si les valeurs numériques MVP entrent en conflit avec les couches nommées existantes, mappe les nouvelles surfaces projet dans le layer contract actuel au lieu de réordonner brutalement MENU/FLOWER/PANEL/COMPONENT.

---

## Système droitier / gaucher

Le bouton droitier/gaucher agit globalement.

Mode droitier :

```text
main toolbox à droite
close à gauche
grip à droite
contextual toolbar alignée à droite
Flower horizontal en row-reverse
Flower vertical à gauche du point d’impact
```

Mode gaucher :

```text
main toolbox à gauche
grip à gauche
close à droite
contextual toolbar alignée à gauche
Flower horizontal en row
Flower vertical à droite du point d’impact
```

Le changement doit affecter tous les projets, la main toolbox, les toolbars contextuelles, les Palettes et le Flower.

---

## Rendu glass et thème

Ajouter un thème piloté par une variable principale de type :

```js
MASTER_THEME
```

Les couleurs dérivées doivent alimenter :

- fonds projets ;
- headers/footers ;
- boutons ;
- rubans Palette ;
- ombres ;
- glow ;
- backgrounds glass des tools.

Les toolboxes globales doivent être transparentes :

```css
.main-toolbox-shell,
.main-toolbox-strip,
.vertical-toolbox,
.vertical-toolbox-inner,
.horizontal-toolbox,
.flower-menu {
  background: transparent;
  background-color: transparent;
}
```

Chaque tool individuel reçoit son propre rendu glass :

```css
.tool,
.main-tool,
.palette-tool,
.palette-content .tool {
  background: var(--theme-tool-glass-bg);
  backdrop-filter: blur(12px) saturate(1.08);
  -webkit-backdrop-filter: blur(12px) saturate(1.08);
}
```

Le bouton close est seulement une icône :

- pas de background ;
- pas de rectangle visible ;
- pas de box-shadow sur le bouton ;
- uniquement les deux traits du X, avec léger glow possible sur les traits.

---

## Suppression sélection et drag natifs

Ajouter globalement :

```css
user-select: none;
-webkit-user-select: none;
-webkit-touch-callout: none;
-webkit-tap-highlight-color: transparent;
```

Ajouter côté JS :

```js
selectstart.preventDefault();
dragstart.preventDefault();
```

Tous les boutons doivent avoir :

```html
type="button"
```

Neutraliser sur les zones interactives :

```text
auxclick
contextmenu
clic molette
clic droit
clic tool pouvant provoquer navigation/reload
```

Aucune action ne doit naviguer vers un fichier local ou un ancien prototype.

---

## Header / footer projet

Le contrôle global `Header haut / Footer bas` inverse la position du chrome projet :

```text
header en haut
footer en bas
```

Cette option est globale.

Le grip change d’orientation selon :

- header/footer ;
- droitier/gaucher ;
- coin réel où il est placé.

Double-click zones :

Mode droitier :

```text
close = gauche
grip = droite
double-clic côté grip, entre label et grip => maximize/window
double-clic côté close, entre close et label => minimize/dock
```

Mode gaucher :

```text
grip = gauche
close = droite
double-clic côté grip, entre grip et label => maximize/window
double-clic côté close, entre label et close => minimize/dock
```

Interdiction :

```text
minimize/dock ne se déclenche jamais sur clic simple
```

Le header/footer reste draggable. Les zones de double-clic ne doivent pas empêcher le drag normal.

---

## Fermeture et restauration projet

Clic close :

- masque le chrome ;
- masque la toolbar contextuelle ;
- masque les outils associés ;
- ne déplace pas le projet d’un pixel.

Double-clic dans le contenu du projet fermé :

- restaure le chrome ;
- replace le header/footer à l’extérieur du projet ;
- ne place pas le header/footer à l’intérieur ni à cheval.

Même fermé, le projet doit rester manipulable/dockable selon les règles MVP.

---

## Maximisation, minimisation et docking

Maximize progressif quand le projet est poussé :

- vers le haut ;
- vers le côté de la main toolbox.

Mode droitier : pousser vers la droite maximise.

Mode gaucher : pousser vers la gauche maximise.

Minimize/dock progressif quand le projet est poussé :

- vers le bas ;
- vers le côté opposé à la main toolbox.

Mode droitier : côté opposé = gauche.

Mode gaucher : côté opposé = droite.

Dock final :

```js
ultraCompact = true
```

Dimensions ultra-compactes :

```text
width = ULTRA_COMPACT_WIDTH
height = HALF_TOOL
```

Dock stacking :

```text
mode droitier : gauche vers droite
mode gaucher : droite vers gauche
```

Position verticale des projets dockés :

- bas de la webview si aucune toolbar contextuelle dockée n’est réellement visible ;
- au-dessus de la toolbar contextuelle si elle est visible.

Visibilité réelle :

```js
appState.contextDocked &&
!focusedProject.chromeHidden &&
!focusedProject.compact &&
!focusedProject.ultraCompact
```

Tout changement de focus, fermeture, restauration, dock on/off, ultra-compact ou handedness doit relayout les projets dockés.

---

## Contextual toolbars

Chaque projet possède sa propre toolbar contextuelle :

```text
project 1 → contextTools1
project 2 → contextTools2
```

Quand le projet focalisé change, la toolbar dockée affiche uniquement les tools du projet focalisé.

Dock on :

```text
toolbar contextuelle dockée en bas
```

Dock off :

```text
toolbar contextuelle liée au projet
```

Même en Dock off, le projet ne doit jamais passer sous la main toolbox.

Chaque toolbar contextuelle contient une Palette au milieu des tools.

---

## Main toolbox verticale

La main toolbox MVP est verticale.

Comportements requis :

- placée à droite en mode droitier ;
- placée à gauche en mode gaucher ;
- tools ancrés par le bas ;
- bouton principal en bas pour replier/déplier ;
- conteneur transparent ;
- tools avec glass blur ;
- Palette au milieu des tools ;
- conservation du système de tool definitions, invocation, latched state et auth gate existants.

Ne perds pas les fonctionnalités du menu actuel :

- reveal/collapse ou équivalent cohérent ;
- palettes ;
- sliders ;
- drag payload outil ;
- delete preview si un drag de tool est actif ;
- external open state ;
- latched state ;
- `containsTarget` et autres APIs publiques.

Si le ruban bas actuel doit rester disponible pour compatibilité, garde-le derrière une variante ou un facade. Le mode MVP doit utiliser la toolbox verticale par défaut.

---

## Flower menu MVP

### Déclenchement

Le Flower s’ouvre par :

- long press / long touch ;
- clic droit.

Le clic droit doit ouvrir le Flower au `pointerdown`, pas au `mouseup` ni au `contextmenu`.

Le menu natif navigateur doit être bloqué.

Conserve les blockers actuels : le Flower ne doit pas s’ouvrir sur main toolbox, footer, panels, dialogs, tool buttons, embedded rows, projection handles ou Flower déjà ouvert.

### Modes

Trois modes :

```text
horizontal
vertical
arc
```

Options globales :

```text
Flower vertical/horizontal
Flower arc on/off
```

Par défaut :

```text
Flower horizontal
Flower arc off
```

Horizontal :

```js
x = clickX - menuWidth / 2;
y = clickY - 39 - menuHeight;
```

Ordre :

```text
droitier → row-reverse
gaucher → row
```

Vertical :

```text
droitier → à gauche du point d’impact
gaucher → à droite du point d’impact
```

Arc :

- tools directs répartis régulièrement sur un demi-cercle ;
- tools internes des Palettes exclus du calcul ;
- Palette fermée circulaire, même taille que les autres tools ;
- ruban au sommet, clippé par le cercle.

Quand on quitte le mode arc, nettoyer les inline styles :

```text
left
top
position
width
height
```

afin que les modes horizontal/vertical rouvrent correctement.

### Drag-select

Flux long press principal :

1. long press ;
2. Flower s’ouvre ;
3. l’utilisateur maintient ;
4. drag sur tool ou Palette ;
5. relâchement déclenche l’action selon la cible.

Clic droit :

- utiliser les mouvements fournis par le navigateur si disponibles ;
- ne jamais inventer de trajectoire reconstruite ;
- si les événements ne sont pas fournis, ne pas déclencher d’action fantôme.

Long press sans déplacement :

```text
Flower reste ouvert
aucun tool n’est activé
aucune Palette n’est ouverte
```

Relâchement sur tool simple :

```text
Flower disparaît
un clone fixe du tool reste visible à la position d’origine
momentary → flash puis disparition
latch → pulse jusqu’au clic suivant sur le clone
```

Relâchement sur corps Palette :

```text
Palette s’ouvre
Flower reste ouvert
les autres tools Flower sont masqués
seule la Palette ouverte reste visible
```

Hover ruban Palette :

```text
ouvre/ferme Palette
```

Interdit :

```text
hover corps Palette ouvre Palette
hover icône Palette ouvre Palette
hover label Palette ouvre Palette
```

Fermeture Flower :

- clic hors Flower ;
- `Escape` ;
- activation d’un tool simple ;
- changement d’option globale ;
- toggle main menu.

Ne pas fermer Flower sur :

- long press sans déplacement ;
- relâchement sur corps Palette ;
- survol ruban Palette.

---

## Protection des projets quand Flower est ouvert

Quand :

```js
appState.flowerOpen === true
```

Les projets sous-jacents ne reçoivent plus :

- drag ;
- resize ;
- drag header/footer ;
- drag contenu fermé.

Ajouter dans `ProjectController.startDrag()` et `ProjectController.startResize()` :

```js
if (appState.flowerOpen) return;
```

Ajouter aussi une garde globale en capture sur `pointerdown`.

Les interactions dans Flower restent autorisées.

Quand Flower se ferme, les projets redeviennent automatiquement draggables/resizables.

---

## Palettes

Chaque menu contient une Palette :

- main toolbox ;
- contextual toolbar projet 1 ;
- contextual toolbar projet 2 ;
- Flower menu.

La Palette est un conteneur, pas un tool simple :

- pas `momentary` ;
- pas `latch` ;
- pas activable directement.

Les tools révélés dans `.palette-content` sont de vrais tools et peuvent être `momentary` ou `latch`.

Design fermé :

- même taille qu’un tool normal ;
- icône calée comme les autres ;
- label en bas ;
- aucun déplacement vertical à l’ouverture.

Ruban coloré :

- plus sombre et plus coloré ;
- dérivé du thème ;
- visible même avec conteneurs transparents.

`Ext. Band on` par défaut.

Horizontal :

```text
hauteur menu = TOOL_SIZE + bandSize
tool face = TOOL_SIZE
band = externe au-dessus
```

Vertical :

```text
largeur menu = TOOL_SIZE + bandSize
gouttière latérale réservée
band externe côté droit/gauche selon handedness
```

Arrondis :

```css
/* horizontal */
border-radius: 3px 3px 0 0;

/* vertical droitier */
border-radius: 3px 0 0 3px;

/* vertical gaucher */
border-radius: 0 3px 3px 0;
```

Ouverture Palette :

Horizontal droitier :

```text
contenu révélé vers la gauche
carré Palette ancré à droite
```

Horizontal gaucher :

```text
carré Palette à gauche
contenu révélé vers la droite
```

Vertical :

```text
ouverture vers le haut
bord bas Palette stable
tools au-dessus repoussés vers le haut
```

Clic sur ruban : ouvre/ferme Palette dans tous les contextes.

Clic sur tool révélé : active le tool et ne ferme pas la Palette par propagation.

---

## Modes d’outils

Deux modes MVP seulement :

```text
momentary
latch
```

Attribution :

- les tools simples reçoivent un mode stable pseudo-aléatoire ;
- le hash est basé sur :

```js
icon + "::" + label
```

- les containers Palette sont exclus ;
- les tools internes de Palette sont inclus.

Momentary :

```text
pointerdown => active
pointerup / pointercancel / pointerleave => inactive
style => flash court
Flower => clone visible le temps du flash puis disparition
```

Latch :

```text
click => toggle active/inactive
style => pulse lent éteint → allumé → éteint
Flower => clone visible qui pulse
clic sur clone => disparition
```

Style actif piloté par :

```js
TOOL_INTERACTION_STYLE
```

Variables minimales :

```text
activeBackground
activeGlow
activeGlowSoft
activeInsetColor
activeBrightness
activePulseBrightness
activeFlashBrightness
activeIconColor
activeIconShadow
activeLabelColor
transition
momentaryFlashDuration
latchPulseDuration
```

Les tools actifs ne changent jamais de taille ni de position.

---

## Fichiers et zones probables à inspecter

Inspecte d’abord ces zones, puis adapte selon le code réel :

```text
eVe/intuition/eVeIntuition.js
eVe/intuition/menu/index.js
eVe/intuition/ribbon/menu.js
eVe/intuition/ribbon/reveal.js
eVe/intuition/flower/menu.js
eVe/intuition/tools/contextual/flower_menu_context.js
eVe/intuition/flower/context_target.js
eVe/intuition/flower/context_selection.js
eVe/intuition/footer/runtime.js
eVe/intuition/footer/tool_row_runtime.js
eVe/intuition/runtime/layer_contract.js
eVe/intuition/runtime/eve_intuition/tool_latched_state_runtime.js
eVe/intuition/tools/molecule/footer_tools_contract.js
eVe/intuition/tools/molecule/panel/index.js
eVe/domains/mtrax/ui/tool_keys.js
eVe/intuition/tools/core/tool_interaction.js
```

Ne traite pas ces chemins comme une liste limitative. Cherche les dépendances réelles avant de patcher.

---

## Séquence de travail obligatoire

1. Lire les deux documents fournis.
2. Inspecter les fichiers propriétaires actifs dans `eVe/intuition/`.
3. Identifier les écarts entre l’état actuel et le MVP v146.
4. Créer un plan de patch court avant de modifier.
5. Implémenter par petites étapes :
   - état global et contrôles ;
   - thème glass ;
   - main toolbox verticale ;
   - project controller ;
   - contextual toolbars ;
   - palettes ;
   - Flower modes/drag-select ;
   - tool modes ;
   - protections interaction ;
   - compatibilité APIs.
6. Tester après chaque groupe de modifications.
7. Ajouter ou adapter les tests automatisés nécessaires pour couvrir souris, tactile, iOS/WebKit, long press, long touch, clic droit, Palettes, Flower et protections projet.
8. Exécuter les tests d’intégration/E2E, pas seulement les tests unitaires.
9. Fournir un résumé final des fichiers modifiés, des comportements couverts, des environnements testés et des limites éventuelles.

---

## Tests de validation obligatoires

Les tests ne sont pas optionnels. Après implémentation, il faut exécuter les tests existants et ajouter/adapter des tests d’intégration/E2E couvrant explicitement les nouvelles fonctionnalités MVP.

Le rapport final doit mentionner :

```text
- les commandes exécutées ;
- les environnements testés ;
- les tests ajoutés ou modifiés ;
- les résultats obtenus ;
- les limitations exactes si un vrai device iOS n’est pas disponible dans l’environnement.
```

Si l’environnement CI ne donne pas accès à un vrai iPhone/iPad, utiliser au minimum WebKit + profils viewport/touch iPhone/iPad via Playwright ou outil équivalent, puis fournir une checklist manuelle iOS à exécuter sur appareil réel. Ne pas prétendre qu’un test iOS réel a été exécuté si seul un simulateur ou WebKit desktop a été utilisé.

### Matrice multi-input obligatoire

Tester chaque comportement critique sur cette matrice minimale :

```text
1. Desktop Chromium/WebKit avec souris
2. Desktop WebKit avec trackpad ou événements équivalents
3. Mobile viewport tactile iPhone / iOS WebKit
4. Tablet viewport tactile iPad / iPadOS WebKit
5. iPadOS/iOS avec clic droit souris/trackpad externe si l’environnement le permet
```

Pour chaque environnement, vérifier :

```text
- tap/click sur tools simples ;
- long press / long touch ;
- clic droit / secondary press ;
- drag-select Flower ;
- relâchement sur tool simple ;
- relâchement sur corps Palette ;
- tap/click ruban Palette ;
- hover ruban Palette quand hover existe ;
- absence de dépendance au hover sur tactile ;
- drag projet ;
- resize projet ;
- dock/minimize/maximize ;
- close/restore ;
- main toolbox collapse/reveal ;
- bascule droitier/gaucher ;
- absence de sélection native, callout iOS, drag image natif et menu contextuel navigateur.
```

### Tests automatisés à ajouter ou adapter

Ajouter des tests E2E/integration pour :

```text
- Flower ouvert par clic droit au pointerdown, pas au contextmenu ;
- Flower ouvert par long touch sur WebKit mobile ;
- contextmenu natif empêché sur les surfaces menu/projet ;
- long touch sans déplacement : Flower reste ouvert, aucun tool activé ;
- drag-select tactile : activation au relâchement sur tool ;
- drag-select souris : activation au relâchement sur tool ;
- clic droit sans événements de mouvement exploitables : aucune action fantôme ;
- Palette utilisable par tap/click sur ruban, sans hover ;
- Palette hover ruban uniquement sur devices hover-capable ;
- hover corps/icône/label Palette n’ouvre rien ;
- bascule droitier/gaucher repositionne main toolbox, Flower, toolbars, Palettes et grips ;
- Flower ouvert bloque drag/resize projet sur souris et tactile ;
- tools momentary/latch gardent la même taille et position sur mouse/touch ;
- clone Flower momentary/latch fonctionne au clic et au tap ;
- iOS/WebKit ne déclenche ni sélection native, ni callout, ni drag image natif.
```

Les tests doivent échouer si une fonctionnalité marche à la souris mais pas au tactile, ou marche en hover desktop mais n’a pas d’alternative tap/touch.

### Accueil

- deux projets visibles ;
- projet 1 avec image ;
- projet 2 avec SVG ;
- boutons globaux en haut à `left: 120px`, `top: 14px` ;
- boutons globaux derrière les projets ;
- `Ext. Band on` au démarrage ;
- main toolbox ouverte au démarrage ;
- mode droitier au démarrage ;
- projet focalisé = `p1`.

### Projet

- drag projet fonctionne ;
- resize fonctionne ;
- projet focalisé passe au-dessus ;
- maximize par poussée haut/côté main toolbox ;
- minimize par poussée bas/côté opposé ;
- dock stack correct en droitier et gaucher ;
- header/footer global fonctionne ;
- close icône seule ;
- close ne déplace pas le projet ;
- double-clic contenu restaure le chrome.

### Context toolbar

- chaque projet a ses tools propres ;
- le focus change la toolbar dockée affichée ;
- Dock on/off fonctionne ;
- alignement droitier/gaucher fonctionne ;
- Palette au milieu.

### Main toolbox

- verticale ;
- côté droit en droitier ;
- côté gauche en gaucher ;
- tools ancrés bas ;
- repli/dépli via bouton principal en bas ;
- glass OK ;
- auth gate existant conservé ;
- tool IDs et dispatchers existants conservés.

### Palette

- ruban externe visible ;
- intérieur calé comme tool normal ;
- ouverture horizontale/verticale correcte ;
- hover corps Palette ne fait rien ;
- hover ruban Palette toggle ;
- clic ruban toggle ;
- clic tool révélé active sans fermer par propagation ;
- un seul état Palette ouvert par surface.

### Flower

- long press ouvre Flower ;
- clic droit ouvre Flower au `pointerdown` ;
- menu natif navigateur bloqué ;
- drag-select long press active tool au relâchement ;
- long press sans déplacement garde Flower ouvert ;
- release sur corps Palette isole Palette ;
- Flower arc répartit uniquement les tools directs ;
- Flower horizontal centré au point d’impact ;
- Flower vertical côté correct selon handedness ;
- changement option globale ferme Flower ;
- Flower ouvert bloque drag/resize projet ;
- context resolution actuelle atome/projet/sélection conservée.

### Tool modes

- `momentary` flash court ;
- `latch` pulse lent réellement alterné ;
- clone Flower momentary disparaît après flash ;
- clone Flower latch pulse jusqu’au clic sur clone ;
- tools actifs ne bougent pas et ne changent pas de taille ;
- latched-state sync existant non cassé.

### Compatibilité

- `window.new_menu_v2` existe encore ;
- `window.new_menu` existe encore ;
- `window.eveAtomeEditFooterApi` existe encore ;
- `window.__DEBUG__.getFooterState()` fonctionne encore ;
- MTraX redirect sur double-click media-like fonctionne encore ;
- Molecule / MTraX inline menus ne perdent pas leurs adapters.

---

## Interdictions strictes

Ne fais pas ceci :

- réécrire tout le menu en prototype indépendant ;
- supprimer les IDs canoniques existants ;
- casser l’auth gate ;
- mettre des handlers tool dispersés hors invocation bridge ;
- fusionner main menu, Flower, footer et inline rows dans un seul renderer ;
- ouvrir une Palette au hover du corps, de l’icône ou du label ;
- activer le container Palette comme tool ;
- fermer Flower sur long press sans déplacement ;
- inventer une trajectoire de clic droit ;
- remettre des backgrounds opaques aux toolboxes ;
- mettre les boutons globaux devant les projets ;
- redonner un background au bouton close ;
- laisser un projet bouger pendant que Flower est ouvert ;
- déclencher minimize/dock sur clic simple ;
- compter les tools internes Palette dans le Flower arc ;
- laisser les labels ou icônes Palette se décaler à l’ouverture ;
- modifier les couches globales sans respecter `layer_contract.js` ;
- supprimer les APIs publiques pendant la migration ;
- utiliser une dépendance externe ;
- livrer une fonctionnalité menu qui marche seulement à la souris ;
- livrer une fonctionnalité menu qui marche seulement au tactile ;
- livrer une fonctionnalité accessible seulement par hover ;
- ignorer iOS/iPadOS WebKit ;
- prétendre que le support iOS réel est validé si seuls des tests desktop ont été exécutés ;
- utiliser `contextmenu` comme seul déclencheur du clic droit ;
- casser le clic droit avec souris/trackpad externe sur iOS/iPadOS ;
- laisser le long touch iOS ouvrir le callout, la sélection native ou le drag image natif.

---

## Format de réponse attendu après implémentation

À la fin, réponds avec :

1. une synthèse courte des changements ;
2. la liste des fichiers modifiés ;
3. les comportements MVP validés ;
4. les invariants existants préservés ;
5. les tests exécutés, avec commandes et résultats ;
6. les environnements vérifiés : desktop souris, desktop WebKit, mobile/tactile, iOS/iPadOS WebKit, clic droit souris/trackpad externe si disponible ;
7. les limites restantes, uniquement s’il y en a.

Ne réponds pas seulement avec des conseils. Modifie réellement les fichiers du projet.
