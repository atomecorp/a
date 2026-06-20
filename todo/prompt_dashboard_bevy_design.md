Créer une interface dashboard en Bevy/Rust, sans toolbox inférieure et sans données de mockup.

Objectif :
Reproduire le design d’un tableau de rubriques interactives en lignes horizontales, avec entêtes latérales, lanes colorées, cellules scrollables, mode focus, expansion de cellule et zone d’ajout.

Contraintes générales :
- Framework : Bevy en Rust.
- Rendu 2D.
- Pas de DOM, pas de HTML.
- Ne pas créer la toolbox inférieure : elle existe déjà ailleurs.
- Ne pas intégrer de données de mockup.
- Prévoir une architecture data-driven : les rubriques, couleurs, labels, icônes et items doivent venir d’un modèle externe.
- Le design doit fonctionner avec un nombre variable de rubriques et d’items.
- Le layout doit être recalculé dynamiquement selon la taille de la fenêtre/canvas.

Structure :
- Afficher une liste verticale de rubriques.
- Chaque rubrique correspond à une ligne horizontale.
- Chaque ligne possède :
  - une entête latérale ;
  - une bande de fond colorée pleine largeur ;
  - une zone de cellules scrollables horizontalement.
- Les entêtes peuvent être à droite ou à gauche selon le mode utilisateur :
  - mode droitier : entêtes à droite ;
  - mode gaucher : entêtes à gauche.
- Les cellules doivent toujours éviter la zone des entêtes.
- Les entêtes doivent toujours rester visibles au-dessus du contenu scrollable.

Entêtes :
- Chaque entête est un rectangle sans coins arrondis.
- Largeur normale : 100 % de la largeur standard d’une cellule.
- Au clic sur une entête :
  - elle devient active ;
  - elle s’élargit à 150 % ;
  - les autres entêtes deviennent grisées, moins contrastées, avec une animation ;
  - le mode focus s’active.
- Un second clic sur l’entête active :
  - désactive le mode focus ;
  - remet l’entête à 100 % ;
  - restaure les autres entêtes.
- Si une autre entête est cliquée :
  - l’ancienne revient à 100 % ;
  - la nouvelle passe à 150 % ;
  - le focus bascule vers la nouvelle rubrique.
- L’ombre des entêtes doit être directionnelle vers les cellules :
  - entêtes à droite : ombre vers la gauche ;
  - entêtes à gauche : ombre vers la droite.
- Quand une entête est active et élargie, supprimer temporairement son ombre.
- Restaurer l’ombre quand l’entête redevient normale.

Mode focus :
- En état normal, chaque ligne affiche les items de sa propre rubrique.
- En mode focus, toutes les lignes affichent les items de la rubrique sélectionnée.
- En mode focus :
  - toutes les bandes de fond prennent la couleur de la rubrique sélectionnée ;
  - l’entête sélectionnée reste active ;
  - les autres entêtes deviennent grisées et moins contrastées ;
  - les cellules conservent leur scroll indépendant par ligne.

Zone “+” :
- En mode focus, l’entête active élargie à 150 % contient une zone “+”.
- Ne pas afficher le texte “nouveau”.
- Afficher uniquement le symbole “+”.
- La zone du “+” correspond aux 50 % supplémentaires de l’entête active.
- Cette zone doit devenir une bande verticale pleine hauteur sur toute la hauteur disponible du tableau.
- Cette bande verticale doit être vierge :
  - uniquement remplie avec la couleur de la rubrique active ;
  - aucun item ne doit apparaître dessus ;
  - aucune cellule ne doit empiéter dessus.
- Les cellules doivent éviter cette zone, comme elles évitent la zone des entêtes.
- Cliquer sur le “+” doit déclencher la création d’un nouvel item dans la rubrique active.
- Le nouvel item doit apparaître d’abord en plein écran dans la zone disponible du tableau, sans recouvrir les entêtes.
- Ensuite, au clic sur l’entête, le nouvel item doit se réduire en animation et prendre sa place dans la grille/cellules de la rubrique correspondante.

Cellules :
- Les cellules sont des cartes rectangulaires sans coins arrondis.
- Elles affichent le contenu fourni par le modèle externe.
- Elles doivent laisser apparaître la couleur de la bande derrière elles.
- Espacement uniforme :
  - marge haute = marge basse = marge gauche = marge droite ;
  - espacement horizontal entre cellules = espacement vertical interne.
- Les cellules ont une ombre légère.
- Les cellules peuvent avoir une largeur simple ou double selon leur metadata/layout.
- Aucune cellule ne doit être coupée à l’arrêt du scroll.

Scroll :
- Chaque ligne possède son propre overflow horizontal indépendant.
- Le scroll doit être smooth/inertiel.
- À l’arrêt, le scroll doit toujours snapper sur le début exact d’un item.
- Le snap doit respecter les cellules simples et doubles.
- Aucun item ne doit rester coupé après le snap.
- Pendant le scroll, les cellules doivent passer derrière les entêtes et ne jamais les recouvrir.
- Prévoir un clipping strict de la zone scrollable.

Expansion cellule :
- Cliquer sur une cellule non-entête l’agrandit.
- L’agrandissement dure 0,3 seconde.
- L’animation doit partir de la position réelle de la cellule.
- Le contenu de la cellule doit s’agrandir avec la cellule, sans flash ni remplacement brutal.
- La cellule agrandie occupe tout l’espace disponible du tableau.
- Elle ne doit jamais recouvrir les entêtes ni la zone “+”.
- Les autres cellules sont recouvertes/masquées pendant l’expansion.
- Cliquer sur l’entête ferme la cellule agrandie.
- La fermeture doit utiliser l’animation inverse en 0,3 seconde.
- À la fin de la fermeture, recalculer/redessiner la grille afin que la cellule retrouve sa vraie position et qu’aucun vide ne reste affiché.

États à prévoir :
- Normal.
- FocusRubrique.
- CelluleAgrandie.
- CreationItemPleinEcran.
- RetourCreationVersGrille.
- ModeGaucher.
- ModeDroitier.
- RubriquesMasquées.

Architecture conseillée :
- Séparer clairement :
  - modèle de données ;
  - état UI ;
  - calcul de layout ;
  - rendu ;
  - input/picking ;
  - animations.
- Le layout doit produire des rectangles :
  - header_rect ;
  - plus_rect ;
  - lane_rect ;
  - scroll_clip_rect ;
  - visible_item_rects ;
  - expanded_cell_rect.
- Le picking doit distinguer :
  - clic entête ;
  - clic zone “+” ;
  - clic cellule ;
  - drag/scroll ;
  - clic pendant animation.
- Ne pas déclencher un clic cellule si l’utilisateur a réellement draggué pour scroller.

Résultat attendu :
Une interface Bevy propre, modulaire et data-driven, reproduisant fidèlement le design validé :
- entêtes latérales animées ;
- lanes colorées ;
- focus par rubrique ;
- zone “+” intégrée ;
- scroll smooth avec snap ;
- cellules expansibles ;
- clipping strict ;
- mode droitier/gaucher ;
- aucune toolbox inférieure ;
- aucune donnée de mockup intégrée.