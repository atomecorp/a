# Atome/eVe — Add-ons de la toolbox principale

## Objet

Ce document décrit les ajouts et ajustements à apporter à la **toolbox principale fixe**, située en bas de l’interface. Il précise aussi sa frontière avec la **zone temporelle ancrée en bas des pistes au niveau multipiste**, sans intégrer cette zone à la toolbox.

La toolbox principale existe déjà. Le but n’est pas de la redessiner ni de changer son fonctionnement général, mais d’intégrer proprement les nouveaux besoins définis pour la Songlist et les futurs contextes Atome/eVe.

---

## Règles de design obligatoires

- La toolbox principale est **toujours présente**.
- Elle est **invariable**.
- Son ordre est **verrouillé**.
- Tous les outils sont des **carrés strictement de même taille**.
- L’interface peut être inversée pour utilisateur droitier/gaucher.
- Cette inversion existe déjà dans Atome/eVe et ne doit pas être réinventée.
- Aucun outil supplémentaire ne doit être ajouté sans validation explicite.
- L’interface doit rester extrêmement minimaliste.
- Aucun élément décoratif, système ou convention UI ne doit être ajouté automatiquement.
- La zone temporelle basse du multipiste n’est pas une barre d’outils.
- Tous les outils restent carrés ; la ruler, les graduations, le playhead et les repères sont des éléments temporels, pas des outils.
- La zone temporelle utilise exactement deux bandes fonctionnelles, chacune d’une hauteur égale à la moitié d’un outil carré, sans ajout décoratif.

---

## Les 9 outils fixes

Ordre décrit depuis le coin inférieur droit vers la gauche :

1. **Atom**
   - Outil principal.
   - Icône Atom si disponible.
   - Sinon utiliser un cercle simple.

2. **Accueil / User**
   - Session.
   - Préférences.
   - Réglages liés à l’utilisateur.

3. **Finder**
   - Recherche.
   - Navigation/recherche dans les contenus.

4. **Record**
   - Enregistrement de médias.
   - Son comportement dépend du niveau actuellement focalisé.
   - Le vrai média enregistré est toujours créé au niveau **Piste**.
   - Si Record est déclenché depuis un niveau supérieur, les niveaux intermédiaires nécessaires sont créés automatiquement.

5. **Temps**
   - Opérations temporelles.
   - Calendrier.
   - Fonctions liées au temps et à la temporalité.
   - Cet outil ne remplace pas la zone temporelle basse du multipiste ; cette zone n’est ni une variante de Temps, ni un nouvel outil fixe.

6. **Communication**
   - Communication.
   - Partage.
   - Échange d’éléments.

7. **Mode d’utilisation**
   - 3 modes :
     - Performance
     - Édition
     - Consommateur / End User

8. **Mode Vue**
   - 3 vues :
     - Liste
     - Matrice
     - Naturel / Libre

9. **Création**
   - Nouvel outil à intégrer.
   - Son rôle est de créer un nouvel élément dans le **niveau actuellement focalisé**.

---

# Zone temporelle basse du niveau multipiste — hors toolbox

## Périmètre

Cette zone apparaît uniquement lorsque le niveau **Pistes / Mixage** est réellement déplié ou focalisé. Elle est ancrée en bas des pistes et appartient à la vue multipiste : ce n’est ni un footer global, ni une barre d’outils, ni un dixième outil de la toolbox principale.

Elle disparaît lorsque l’utilisateur revient au niveau Songlist ou Structure.

## Gabarit

La zone comporte exactement deux bandes fonctionnelles, chacune d’une hauteur égale à la moitié d’un outil carré :

1. **Rail de repères**, au-dessus : playhead, Markers/zones nommées et repères typés **Start**, **End**, **Loop In**, **Loop Out**, **Punch In** et **Punch Out**.
2. **Ruler temporelle / Time ruler**, au-dessous : graduations et libellés de temps adaptés au contexte et au niveau de zoom.

Le playhead fournit la référence visuelle de la position courante et traverse les deux bandes. Start/End, Loop In/Out et Punch In/Out utilisent un même langage visuel minimal de repères typés ; ils ne deviennent pas des boutons.

Les Markers restent des zones temporelles globales, nommées et dimensionnées. Ils ne deviennent ni des Pistes ni des outils. Seuls les repères existants ou actifs sont affichés.

Aucune troisième bande, légende permanente, commande rectangulaire, bordure décorative ou mini-toolbar n’est ajoutée.

## Temps et précision

- Une seule unité principale est affichée à la fois afin de ne pas surcharger la ruler.
- En contexte audio, toutes les positions peuvent être définies avec une précision allant jusqu’au sample ; l’affichage s’adapte au zoom et n’étiquette pas chaque sample en permanence.
- En contexte vidéo, la ruler prend en charge le timecode SMPTE selon le framerate du projet.
- Le framerate est une donnée temporelle du projet, pas un contrôle permanent ajouté au rail.
- Le changement d’unité d’affichage ne modifie jamais les positions temporelles canoniques.
- Les libellés de timecode restent assez espacés pour situer la position sans encombrer la zone.

## Interactions contextuelles

Les repères peuvent être placés et ajustés directement sur leur rail. Leur création, leur type et leurs paramètres détaillés restent contextuels.

**Crop**, **Split** et **Grab** restent des outils contextuels de l’objet ou de la sélection. Ils n’occupent aucun emplacement permanent dans la zone temporelle ni dans la toolbox principale.

L’outil contextuel **Loop** configure le comportement de boucle à partir de Loop In et Loop Out ; il n’est pas dupliqué dans le rail.

---

# Outil Création

## Règle générale

Le menu Création doit rester extrêmement simple.

Il contient exactement **5 entrées principales** :

1. **Texte**
2. **Dessin**
3. **Code**
4. **Page**
5. **Générateur**

Toute complexité supplémentaire apparaît ensuite dans le contexte de l’objet créé.

---

## 1. Texte

Action primitive :

- créer un objet texte ;
- permettre immédiatement la saisie.

Ne pas proposer dans ce premier menu :
- titre ;
- note ;
- texte formaté ;
- styles ;
- variantes.

Le formatage se fait ensuite dans le contexte de l’objet texte.

---

## 2. Dessin

Action primitive :

- créer/tracer visuellement.

Le premier niveau ne doit pas imposer à l’utilisateur une distinction technique raster/vectoriel.

Peuvent être disponibles ensuite dans le contexte ou le sous-outil Dessin :
- pinceau ;
- crayon ;
- gomme ;
- brosses ;
- rectangle ;
- ellipse ;
- ligne ;
- courbe ;
- autres primitives de dessin.

Le but reste : **Dessin = je trace quelque chose**.

---

## 3. Code

Action primitive :

- créer du code.

Les choix suivants viennent ensuite dans le contexte :
- langage ;
- type de script ;
- options d’exécution ;
- déclenchement ;
- comportement temporel.

Ne pas surcharger le menu principal avec « snippet », « script », « module », etc.

---

## 4. Page

Action primitive :

- créer une surface/page.

Les mises en page, gabarits, cartes, dispositions et autres structures apparaissent ensuite comme options de cette page.

Ne pas exposer au premier niveau :
- grille ;
- colonnes ;
- cartes ;
- panneaux ;
- mise en page libre ;
- etc.

---

## 5. Générateur

Catégorie destinée aux contenus créés par génération plutôt que par saisie/tracé direct.

Exemples futurs :
- son ;
- instrument virtuel ;
- image ;
- texture ;
- vidéo ;
- animation ;
- procédural ;
- autres générateurs spécialisés.

Le but est d’éviter de créer un 10e outil permanent dans la toolbox.

---

# Règle de destination des créations

Tout nouvel élément est créé dans le **niveau qui possède actuellement le focus**.

Exemples :

- focus Songlist → création au niveau Songlist ;
- focus Song → création dans cette Song ;
- focus Couplet → création dans ce Couplet ;
- focus Piste → création dans cette Piste ou son contexte, selon le type créé.

Cette règle est commune à :
- Texte ;
- Dessin ;
- Code ;
- Page ;
- Générateur ;
- Record.

---

# Contraintes à préserver

- Ne pas ajouter d’autre outil permanent dans la toolbox principale.
- Ne pas transformer Générateur en outil principal séparé.
- Ne pas créer de catégorie « Groupe » dans Création.
- Le groupe est une opération appliquée à des objets existants, pas un objet primaire à créer.
- Garder la toolbox principale lisible en mobilité.
- Toutes les actions interactives importantes doivent rester accessibles près du bas de l’écran.
- La zone temporelle basse ne modifie ni le nombre, ni l’ordre, ni la géométrie carrée des neuf outils fixes.
- La proximité du bas de l’écran ne transforme pas les repères temporels ni Crop/Split/Grab en outils permanents.
