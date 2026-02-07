# New Intuition Menu

## 1) Objectif

Ce document décrit le menu `goey` actuel:

- architecture visuelle et couches (DOM + SVG),
- états d'interaction (`momentary`, `latching`, `locked`),
- règles de drag/fusion (notamment sous-menus),
- APIs publiques pour ouvrir/fermer/naviguer,
- points de configuration (CSS vars / options init),
- check-list de debug.

Code source principal:

- `src/application/eVe/intuition/goey_menu.js`
- `src/application/eVe/elements/eVe_look.js`

---

## 2) Architecture (résumé)

Le système combine:

- **DOM interactif** (`.tool`, `.toolbox-split`, `rail`, `split-half`, etc.).
- **SVG de rendu** pour ombres/goo/gradients (`shadowIdleGroup`, `shadowActiveGroup`, `baseGroup`, `gooGroup`).

Racine de scène:

- `#menu_container` (dans la couche `intuition`),
- `#uiLayer` (DOM),
- `#svgLayer` (SVG rendu).

Le menu principal et les palettes dynamiques sont des `toolbox-split` pilotées par état (`toolboxStates`).

---

## 3) Etats des tools

### 3.1 `momentary` (pulse de clic)

Usage: feedback rapide de clic.

Implémentation:

- `flashToolClick(it)`
- `getClickPulse(it, now)`
- `data-clicked="true"` temporaire + tween radius/scale.

Effet:

- icone devient blanche (via style),
- radius augmente temporairement,
- retour automatique à l'état normal.

### 3.2 `latching` (outil conteneur de sous-menu)

Usage: un tool conteneur reste visuellement actif tant que son sous-menu est ouvert.

Implémentation:

- `setToolLatched(it, bool)`
- flag interne `it._clickLatched`
- conservation de `data-clicked="true"` tant que ouvert.

Effet:

- host sous-menu reste actif (icone blanche + radius actif),
- fermeture du sous-menu => host redevient inactif.

### 3.3 `locked`

Usage: verrouillage manuel par long press (interaction existante).

Implémentation:

- `setToolLocked(it, locked, dir)`
- `data-locked="true"` + style dédié.

---

## 4) Sous-menus: comportement

Un tool conteneur (`hasSubmenu=true`) ouvre un sous-menu en mode standalone (dans le tool lui-même).

Mécanisme:

- largeur visuelle pilotée par `--submenu-open-anim` (depuis `_submenuStandaloneOpenPx`),
- enfants créés/maintenus dans `_submenuStandaloneChildren`,
- fade d'apparition/disparition des enfants,
- host en `latching` pendant ouverture.

### Règles importantes

- Le host ouvert ne doit pas fusionner avec d'autres tools.
- Les enfants d'un sous-menu ouvert ont des protections selon contexte (main menu / dynamique).
- Dans le main menu, comportement immutable renforcé des enfants (pas de fusion toolbox-dans-toolbox).

---

## 5) Règles drag/fusion

Le moteur applique plusieurs garde-fous:

- `isMergeBlockedSubmenuHost(tool)`:
  - bloque fusion/insertion si host sous-menu ouvert.
- `isProtectedSubmenuChild(tool)`:
  - protège les enfants de sous-menu ouvert selon contexte.
- `isBlockedDropTarget(tool)`:
  - union des cas bloqués.

Résultat attendu:

- drop interdit => rejet,
- pas de création de toolbox dans toolbox,
- pas de duplication persistante lors des rejets.

---

## 6) Couches et rendu (important pour le goey)

Objectif:

- goey visible **au-dessus** des bonnes couches,
- host conteneur de sous-menu sans artefacts d'arrondi.

Décision actuelle:

- le host sous-menu conserve le rendu CSS (bevel/ombre),
- ses ombres/goo SVG sont neutralisés pour éviter double contour/déformation.

Conséquence:

- arrondis du conteneur plus stables pendant les animations de largeur.

---

## 7) API publique

L'API est exposée dans:

- `window.eveGoeyMenuApi`

Retour de `initGoeyMenu(options)`:

- le même objet API.

### 7.1 Méthodes menu principal

1. `ensureMenu()`
   - Initialise le main menu si absent.
2. `openMainMenu({ animate = true } = {})`
   - Ouvre le main menu.
3. `closeMainMenu({ animate = true } = {})`
   - Ferme le main menu.
4. `toggleMainMenu({ animate = true } = {})`
   - Toggle open/close.

### 7.2 Méthodes sous-menu

1. `openSubmenu({ toolboxId = 'main', toolId?, label?, index? } = {})`
   - Ouvre explicitement le sous-menu de l'outil ciblé.
   - **Idempotent**: si déjà ouvert, ne le referme pas.
2. `closeSubmenu({ toolboxId = 'main', toolId?, label?, index? } = {})`
   - Ferme explicitement le sous-menu ciblé.
   - **Idempotent**: si déjà fermé, ne fait rien.
3. `toggleSubmenu({ toolboxId = 'main', toolId?, label?, index? } = {})`
   - Toggle du sous-menu ciblé.
4. `backSubmenu({ toolboxId = 'main' } = {})`
   - Retour au niveau précédent (stack de submenu).
5. `canGoBackSubmenu({ toolboxId = 'main' } = {})`
   - `true` si un retour est possible.

### 7.3 Méthode état

`getMenuState({ toolboxId = 'main' } = {})` renvoie:

- `exists: boolean`
- `toolboxId: string`
- `compact: boolean`
- `animating: boolean`
- `menuDepth: number`
- `dir: 'left' | 'right' | null` (si existant)

### 7.4 Helpers globaux debug

- `window.applySvgParams()`
  - Réapplique les paramètres SVG depuis les CSS vars.
- `window.__goeyMenuPause()`
- `window.__goeyMenuResume()`
- `window.__goeyMenuTogglePause()`
  - Contrôle du moteur animation.

---

## 8) Options de `initGoeyMenu(options)`

Options supportées:

- `mainMenuStart: { x, y }`
- `mainMenuCount: number`
- `mainMenuIcon: string (markup SVG)`
- `mainMenuAction: function`
- `submenuResolver: function(tool, state) -> specs`

Specs submenu attendues (normalisées):

- `label`
- `svg`
- `svgB` (optionnel)
- `action` (optionnel)
- `submenu` (optionnel, nested)

---

## 9) Paramètres de timing clés (CSS vars)

Définis dans `eVe_look.js`:

- `--menu-toggle-transition`
  - timing open/close menu + base timing submenu.
- `--tool-click-transition`
  - timing pulse momentary.
- `--tool-click-radius`
  - radius max du pulse.
- `--tool-click-scale-min`
  - scale mini durant pulse.
- `--toolbox-split-transition`
  - transition split/rail.

Recommandation:

- garder un seul driver temporel cohérent (`--menu-toggle-transition`) pour éviter désynchronisation visuelle.

---

## 10) Exemples d'usage

```js
// Ouvrir / fermer main menu
window.eveGoeyMenuApi.openMainMenu({ animate: true });
window.eveGoeyMenuApi.closeMainMenu({ animate: true });

// Ouvrir explicitement le sous-menu du tool label "3" dans le main menu
window.eveGoeyMenuApi.openSubmenu({ toolboxId: 'main', label: '3' });

// Fermer explicitement ce sous-menu
window.eveGoeyMenuApi.closeSubmenu({ toolboxId: 'main', label: '3' });

// Toggle sous-menu
window.eveGoeyMenuApi.toggleSubmenu({ toolboxId: 'main', label: '3' });

// Etat courant
console.log(window.eveGoeyMenuApi.getMenuState({ toolboxId: 'main' }));
```

---

## 11) Guide rapide de debug

1. **Goey invisible / derrière**
   - Vérifier l'ordre des couches `uiLayer` / `svgLayer`,
   - vérifier les cas host submenu (neutralisation SVG volontaire).

2. **Artefacts arrondis/ombres**
   - Vérifier que le host sous-menu n'accumule pas ombre CSS + SVG.

3. **Sous-menu ne répond pas**
   - Vérifier `state.compact`, `state.dragging`, `state.menuAnim` (garde anti-conflit).

4. **Comportement non déterministe sur clic submenu**
   - Utiliser `openSubmenu`/`closeSubmenu` au lieu de `toggleSubmenu`.

---

## 12) Evolution: modes de bouton (roadmap)

Les bases sont en place pour:

- `momentary` (déjà implémenté),
- `latching` (déjà implémenté pour hosts submenu),
- `alternating 3+ states` (à implémenter proprement via machine d'état dédiée par tool).

Proposition d'implémentation future:

- ajouter `it.buttonMode` et `it.stateIndex`,
- mapper `stateIndex -> style/action`,
- exposer API `setToolState`, `nextToolState`.

