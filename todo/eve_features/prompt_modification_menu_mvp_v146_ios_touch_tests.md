# Menu contextuel d'édition Atome — spécification active

Statut : implémentation active.

Cette spécification remplace intégralement l'ancien cahier des charges du footer flottant. Le vocabulaire produit est désormais « menu contextuel d'édition Atome ».

## Résultat attendu

Un double-clic ou double-tap sur un Atome du projet fait entrer cet Atome en édition. L'édition ajoute deux projections Bevy sur le canvas partagé :

- un contour et un footer attachés à l'Atome ;
- un rail contextuel vertical fixe sur le bord de la WebView.

Le rail est à droite en mode droitier et à gauche en mode gaucher. Son bas reste au-dessus de l'icône Atome de la toolbox principale. Il respecte les safe areas, possède un défilement interne et reste visible avec la toolbox principale en plein écran.

Aucun Atome, footer, rail, outil ou état d'édition autoritaire ne doit être créé dans le DOM. Aucun second canvas n'est autorisé.

## État runtime

- Plusieurs Atomes peuvent rester éditables simultanément.
- Chaque Atome éditable conserve son contour et son footer.
- Un seul Atome est actif et alimente le rail contextuel.
- Cet état est éphémère et limité à la session du projet.
- Il ne doit être persisté ni dans l'Atome, ni dans le DOM.
- La fermeture, la suppression ou le reload du projet détruit cet état.
- Un contour discret distingue les Atomes éditables ; l'Atome actif reçoit une accentuation supplémentaire.

## Entrée, activation et sélection

- Un Atome sélectionnable sans édition conserve son interaction normale et n'affiche aucun chrome d'édition.
- Le double-clic/double-tap active l'édition, affiche le contour et le footer, puis ouvre ou remplace le contenu du rail.
- Si l'Atome appartient déjà à une sélection multiple, cette sélection est conservée. Sinon, elle est remplacée par cet Atome.
- Les outils compatibles agissent sur toute la sélection active.
- Un clic dans un Atome déjà éditable l'active pour le rail sans sélectionner son parent, sans le déplacer et sans intercepter les interactions internes compatibles.
- Un clic sur un Atome non éditable conserve la sélection normale sans remplacer le contexte actif.

## Footer d'édition

Le footer est extérieur et aligné sur les limites de l'Atome. Son ordre est strict :

1. grip gauche ;
2. bouton Close ;
3. titre centré en lecture seule ;
4. grip droit.

Le bouton Close quitte uniquement l'édition de cet Atome. Si cet Atome était actif, le rail se masque. Les autres Atomes restent éditables.

Le fond du footer, hors Close et grips, déplace l'Atome et son footer par les intentions canoniques `drag.start`, `drag.move`, `drag.end`.

Les deux grips redimensionnent homothétiquement :

- grip gauche : le bord droit reste fixe ;
- grip droit : le bord gauche reste fixe ;
- largeur et hauteur évoluent avec un rapport constant.

Le geste affiche un aperçu WebGPU fluide et produit une seule mutation canonique persistante au relâchement.

## Plein écran

Un double-clic sur le fond du footer, hors Close et grips, bascule entre plein écran et géométrie précédente.

- La géométrie précédente exacte est mémorisée en runtime.
- La restauration est bornée à la WebView courante si celle-ci a changé.
- L'Atome occupe tout l'espace disponible hors rail, toolbox principale et footer.
- Le rail contextuel, la toolbox principale et le footer restent visibles.
- Les autres contours et footers sont masqués temporairement puis restaurés.

## Rail contextuel

- Le rail est une projection Bevy unique sur le canvas partagé.
- Le changement droitier/gaucher déplace immédiatement le rail sans perdre le contexte.
- Le rail ne contient aucune commande de sortie d'édition : Close appartient exclusivement au footer.
- Les définitions d'outils, palettes, commandes, états latched, sélections et routes MCP existants sont réutilisés.
- Les intentions publiques sont `atome.edit.enter`, `atome.edit.activate`, `atome.edit.exit` et `atome.edit.fullscreen.toggle`.
- Le runtime interne expose `enter`, `activate`, `exit`, `toggleFullscreen` et `readState`.
- L'ancienne exposition globale `window.eveAtomeEditFooterApi` est interdite.

## Slider vertical canonique

Le composant slider commun accepte `orientation: "horizontal" | "vertical"`. Le comportement horizontal existant reste inchangé.

En orientation verticale :

- le format replié a la taille d'un outil normal ;
- le press l'agrandit à trois fois sa hauteur ;
- les outils voisins se redistribuent dans le rail sans recouvrement ;
- la valeur au début du geste est mémorisée ;
- la valeur évolue relativement avec `startY - currentY`, sans saut au contact ;
- monter augmente, descendre diminue ;
- `min`, `max` et `step` sont respectés ;
- `input` est envoyé pendant le geste et `change` au relâchement ;
- `pointerup`, `pointercancel` et la perte de capture replient le composant.

## Propriété architecturale

- `atome_contextual_edit_runtime.js` possède le registre éphémère, les gestes, le plein écran et la projection.
- `atome_contextual_edit_model.js` possède l'arbre visuel Bevy du footer et du rail.
- Le modèle historique de définitions et les invocateurs de commandes restent les sources canoniques des outils.
- `tool_slider_builder.js` reste le propriétaire du slider produit commun.
- `surface_runtime.js` émet les intentions d'entrée et conserve la règle de sélection multiple.
- Le DOM historique du footer et son ancien calcul de placement ne sont plus un chemin produit actif.

## Validation obligatoire

- entrée, activation et sortie avec un ou plusieurs Atomes ;
- conservation de la sélection multiple ;
- interactions internes sans sélection du parent ;
- distinction actif/inactif et présence de tous les footers ;
- Close local ;
- déplacement et resize homothétique par les deux grips ;
- plein écran/restauration après resize et changement de WebView ;
- rail et toolbox principale visibles en plein écran ;
- latéralité, safe areas, scroll et petite WebView ;
- slider vertical souris, tactile, stylet, annulation et perte de capture ;
- palettes, latch, texte, média et Molecule sans régression ;
- absence de footer DOM autoritaire, de second canvas et de rendu historique actif ;
- contrôles syntaxiques et validation réelle Web, Tauri et iOS.
