PROMPT DE RECONSTRUCTION DU DESIGN

Créer une interface web canvas 2D hautement structurée avec les caractéristiques suivantes :

1. Architecture générale
Interface full screen responsive
Mode landscape forcé (non auto-rotatif)
Layout fixe : entêtes toujours à gauche, contenu à droite
Canvas rendering (pas DOM classique pour les cellules)
Rendu optimisé type dashboard temps réel
2. Structure des lignes (lanes)

Créer 7 lignes indépendantes :

News
Calendrier
Projet
Contact
Store
Moniteur
Objectifs

Chaque ligne possède :

une entête verticale à gauche
une bande colorée pleine largeur visible (100% viewport width)
une couleur unique par ligne dérivée de l’entête
une zone de contenu scrollable horizontalement indépendante (overflow isolé)
3. Comportement des bandes
la couleur de l’entête se propage sur toute la ligne (lane background)
les bandes occupent toujours 100% largeur écran, indépendamment du contenu
les séparateurs horizontaux (si présents) occupent aussi 100% largeur
4. Cartes / cellules
éléments rectangulaires
pas d’arrondis
padding interne uniforme (CELL_INSET = 8px)
espacement horizontal = espacement vertical (strict égalité)
légère ombre :
rgba(0,0,0,0.25)
blur ~10px
offset y ~2px
contenu réduit pour laisser apparaître la couleur de la lane autour
5. Scroll system
scroll fluide (inertiel / smooth)
snapping obligatoire :
arrêt toujours aligné sur le début d’un élément
aucun élément ne doit être coupé à l’arrêt
overflow indépendant par ligne
animation de transition douce vers le snap final
6. Header behavior
entêtes fixes à gauche (ou droite en mode inversé)
ombre directionnelle vers le contenu :
droite en mode normal
gauche en mode gaucher
entêtes ne doivent jamais être recouverts par le contenu scrollable
7. Mode focus (clic sur entête)

Lors du clic sur une entête :

toutes les autres entêtes deviennent plus sombres (animation fade)
toutes les lignes affichent le contenu de l’entête sélectionnée
toutes les bandes adoptent la couleur de la sélection
toggle clic :
1er clic = activation focus
2e clic = retour état normal (chaque ligne indépendante)
8. Toolbar inférieure

Ajouter une barre fixe en bas :

hauteur ~34.5px (moitié de 69px)
fond gris sombre full width

Contenu :

icônes carrées (sans arrondi)
label sous chaque icône
tools :
atome
home
find
sched
comm
view
help

Alignement :

dépend du mode :
droitier → toolbar à droite
gaucher → toolbar à gauche
9. Home panel

Au clic sur Home :

ouverture d’un panneau latéral

Options :

A. Mode main
droitier
gaucher

Effets :

gaucher :
entêtes passent à droite
contenu inversé
ombre directionnelle inversée
toolbar déplacée à gauche
droitier :
configuration originale restaurée
B. visibilité des lignes

Checkboxes :

news
calendrier
projet
contact
store
moniteur
objectifs

Chaque checkbox :

affiche / masque la ligne correspondante en temps réel
10. Contraintes strictes
aucun séparateur vertical entre cellules
aucun coin arrondi
design strictement rectiligne
performance canvas optimisée
aucune découpe visuelle d’éléments (jamais d’élément tronqué)
toutes les transitions doivent être animées mais rapides