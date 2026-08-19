# UI — Spécifications application

## Objectif

Implémenter dans **atome** le nouveau comportement du menu principal inférieur, en conservant une interface strictement cohérente entre desktop, tablette et mobile.

Le principe fondamental est le suivant :

- **même structure**
- **même ordre**
- **mêmes gestes**
- **mêmes comportements**
- **aucune version “desktop” ou “mobile” fonctionnellement différente**
- lorsque l’espace manque, on utilise le **défilement**, la **compression contrôlée** ou la **troncature**, mais on ne change jamais la logique d’utilisation.

Le nom du projet s’écrit toujours **atome**, en minuscules.

---

# 1. Principes ergonomiques globaux

## 1.1 Menu principal

Le menu principal est :

- toujours situé **en bas de l’écran**
- fixe
- toujours accessible
- placé du côté de la main dominante :
  - droitier → interface orientée à droite
  - gaucher → interface orientée à gauche
- inversé horizontalement lorsque le mode gaucher est activé

Le mode gaucher inverse :

- l’ordre des icônes
- les panneaux
- les menus contextuels
- les éléments d’interface latéraux

Exception :

- les timelines restent toujours orientées temporellement de **gauche vers la droite**
- aucune inversion ne doit modifier la logique du temps

---

# 2. Philosophie générale de l’interface

Le canevas principal doit rester propre.

Ne jamais polluer les objets du canevas avec :

- badges
- labels techniques
- états contextuels
- contrôles permanents inutiles

Toutes les informations contextuelles concernant l’objet actuellement sélectionné doivent apparaître dans la barre contextuelle latérale.

Cette barre contextuelle concerne exclusivement :

- l’objet sélectionné
- l’objet en cours d’édition

Elle ne doit jamais afficher artificiellement le projet courant lorsque l’utilisateur travaille sur un sous-objet.

---

# 3. Structure actuelle du menu principal

Le menu inférieur comporte actuellement neuf outils.

## 3.1 Outil `atome`

Outil principal de l’application.

Il doit rester fixe et toujours visible.

Nouveau comportement :

### Tap / clic simple

Ouvre immédiatement l’**assistant IA vocal**.

L’assistant doit être accessible depuis n’importe quel contexte :

- canevas
- projet
- liste
- matrice
- dashboard
- édition d’un objet
- mode performance
- etc.

Le clic simple sur `atome` ne doit plus servir à afficher directement le dashboard.

### Appui long / clic long

Ouvre le **dashboard**.

### Glissement vers le haut

Un drag/swipe vertical vers le haut depuis l’outil `atome` ouvre également le **dashboard**.

Les deux gestes doivent fonctionner sur toutes les plateformes :

- appui long → dashboard
- glissement vers le haut → dashboard

Le comportement ne doit pas changer entre souris, tactile, trackpad ou stylet.

Le dashboard est une couche globale qui se place au-dessus du projet courant.

Il contient notamment :

- calendrier
- projets
- contacts
- store
- objectifs
- progression
- monitoring
- contrôles globaux

Le dashboard ne doit pas recevoir un nouvel item supplémentaire pour l’assistant IA.

---

## 3.2 Home

Fonctions liées à :

- session utilisateur
- fermeture de session
- préférences
- identité
- paramètres personnels
- configuration générale

---

## 3.3 MultiFinder

Outil de recherche globale.

Permet de retrouver rapidement :

- objets
- projets
- contenus
- ressources
- éléments internes à atome

---

## 3.4 Record

Outil dédié à tout ce qui concerne :

- enregistrement
- capture
- audio
- vidéo
- autres formes de recording

---

## 3.5 Time

Outil temporel.

Peut notamment donner accès à :

- calendrier
- temporalité
- planning
- autres fonctions liées au temps

La présence du calendrier ici ET dans le dashboard est volontaire.

Cette redondance est assumée.

---

## 3.6 Communication

Outil permettant notamment :

- sélectionner des personnes
- communiquer
- appeler
- partager des objets
- envoyer du contenu
- gérer des interactions directes

---

## 3.7 Mode d’utilisation

Permet de choisir le mode global de fonctionnement.

Exemples :

- Performance
- Edit
- Consumer

### Performance

Utilisation orientée scène / exécution / lecture.

### Edit

Modification et construction du projet.

### Consumer

Consommation du contenu sans logique d’édition principale.

---

## 3.8 Vue

Permet de choisir la représentation des objets.

Exemples :

- Natural
- List
- Matrix

Le changement de vue ne doit jamais modifier la logique fonctionnelle profonde du projet.

Il modifie uniquement la représentation.

---

## 3.9 Création

Outil de génération/création.

Peut permettre de créer :

- code
- images
- vidéo
- audio
- texte
- générateurs
- autres objets ou médias

---

# 4. Nouvel outil : projet courant

Ajouter un **dixième outil** dans le menu principal.

Cet outil représente le **projet courant**.

Il doit être fixe et toujours visible, comme l’outil `atome`.

Le menu devient donc conceptuellement :

`[atome] [outils scrollables…] [projet courant]`

En mode gaucher, l’ordre global est inversé selon les règles générales de miroir.

---

# 5. Affichage du projet courant

L’outil projet doit afficher le nom du projet courant.

Contraintes :

- occuper idéalement la largeur d’un seul outil
- rester compact
- ne pas prendre la place de deux boutons sauf nécessité extrême
- nom tronqué si nécessaire
- éventuellement utiliser une représentation compacte
- rester identifiable immédiatement

Exemple :

`Nebula…`

ou une autre forme compacte cohérente avec l’UI.

Le projet courant doit toujours rester visible.

Il ne doit pas disparaître lorsque les outils centraux défilent.

---

# 6. Défilement du menu inférieur

Le menu comporte trois zones logiques :

## Zone fixe 1

`atome`

Toujours visible.

## Zone centrale

Outils fonctionnels.

Cette zone peut défiler horizontalement si l’espace disponible est insuffisant.

## Zone fixe 2

Projet courant.

Toujours visible.

Le scroll ne doit affecter que la zone centrale.

Le nom du projet ne doit jamais partir avec le scroll.

Il constitue un repère permanent.

---

# 7. Comportement de l’outil Projet

## Clic / tap simple

Retourne immédiatement au **canevas du projet courant**.

Si un dashboard ou une couche globale est ouverte :

- elle est fermée
- le projet courant redevient visible

Si l’utilisateur est déjà sur le canevas du projet courant :

- aucune action fonctionnelle supplémentaire
- éventuellement un très léger feedback visuel
- ne pas ouvrir une autre interface
- ne pas cycler entre plusieurs états

Le bouton Projet ne doit jamais servir à ouvrir le dashboard.

Cela évite toute ambiguïté.

### Principe sémantique

`Projet = retour au travail / retour au canevas`

---

## Clic long / appui long sur Projet

Ouvre les actions liées au projet courant.

Exemples :

- renommer
- changer de projet
- dupliquer
- exporter
- fermer
- autres actions projet

Cette liste pourra évoluer.

---

# 8. Séparation sémantique entre `atome` et Projet

Cette séparation doit être stricte.

## `atome`

Représente :

- intelligence
- assistant
- supervision globale
- accès au dashboard

Résumé :

- clic → assistant IA
- clic long → dashboard
- drag vers le haut → dashboard

## Projet

Représente :

- travail courant
- canevas actif
- contexte de production

Résumé :

- clic → retour au canevas
- clic long → actions projet

Ne jamais introduire un comportement dans lequel :

- Projet ouvre le dashboard
- Projet cycle entre dashboard et canevas
- `atome` change de rôle selon l’écran affiché

Les boutons doivent conserver la même signification partout.

---

# 9. Cohérence multi-plateforme

Règle absolue :

**ne pas créer une UX différente selon la plateforme.**

Éviter :

- version mobile différente
- comportement desktop différent
- menu simplifié sur téléphone
- actions déplacées ailleurs selon la taille d’écran
- changement d’ordre des outils
- fonctionnalités cachées uniquement sur une plateforme

À la place :

- même menu
- mêmes outils
- mêmes gestes
- même ordre
- même hiérarchie
- scroll lorsque l’espace manque

Exemple :

Sur un iPhone, si seuls 5 ou 6 outils peuvent être visibles :

- `atome` reste fixe
- Projet reste fixe
- les outils intermédiaires sont scrollables

L’utilisateur retrouve donc exactement la même logique sur grand écran.

---

# 10. Responsive design

Le responsive design doit être **spatial**, pas fonctionnel.

Il peut modifier :

- largeur disponible
- espacement
- troncature
- nombre d’éléments visibles simultanément
- quantité de scroll

Il ne doit pas modifier :

- ordre logique
- emplacement conceptuel
- comportement
- rôle
- gestes
- hiérarchie
- sémantique

---

# 11. Labels et contexte

Les objets du canevas restent visuellement propres.

Ne pas afficher de badge contextuel directement sur les objets.

Les états liés à un objet doivent être affichés dans la barre contextuelle droite/gauche.

Concernant les panneaux :

- leur nom peut rester dans leur footer lorsque cette zone sert déjà de poignée, de fermeture ou de redimensionnement
- ne pas ajouter artificiellement un header si cela crée une bande vide ou redondante

Le projet courant constitue une exception importante :

- son identité est globale
- elle n’appartient pas à la barre contextuelle
- elle est donc représentée dans le menu principal via l’outil Projet

---

# 12. Règle droitier / gaucher

L’interface doit être miroir.

En mode droitier :

- outils principaux accessibles côté droit
- menus contextuels du côté adapté
- ordre normal défini par atome

En mode gaucher :

- inversion horizontale complète
- ordre des icônes inversé
- panneaux latéraux inversés
- menus contextuels inversés
- zones fixes inversées

Ne jamais inverser :

- timelines
- axe temporel
- progression temporelle gauche → droite

---

# 13. Contraintes d’implémentation

Créer une architecture où chaque outil du menu possède au minimum :

- `id`
- `icon`
- `label`
- `action`
- `long_press_action`
- `drag_action`
- `fixed`
- `priority`
- `handedness_behavior`
- `visibility`
- `context`

Exemple conceptuel :

```js
{
  id: "atome",
  fixed: true,
  action: "open_assistant",
  long_press_action: "open_dashboard",
  drag_action: {
    direction: "up",
    action: "open_dashboard"
  }
}
```

Projet :

```js
{
  id: "current_project",
  fixed: true,
  action: "show_current_project_canvas",
  long_press_action: "open_current_project_actions",
  dynamic_label: true
}
```

---

# 14. Gestion gestuelle

## Clic simple

Doit rester prioritaire et immédiat.

## Appui long

Doit :

- être suffisamment long pour éviter les déclenchements accidentels
- fournir un feedback visuel avant activation
- fonctionner à la souris et au tactile

## Drag vers le haut

Pour `atome` :

- détecter une intention verticale claire
- ne pas déclencher sur quelques pixels accidentels
- éviter tout conflit avec le scroll horizontal du menu

Le moteur gestuel doit distinguer :

- déplacement horizontal → scroll des outils
- déplacement vertical vers le haut depuis `atome` → dashboard
- clic/tap → assistant

---

# 15. Cas limites à gérer

## Projet sans nom

Afficher un nom par défaut explicite.

Exemple :

`untitled`

ou équivalent défini par atome.

## Nom très long

Tronquer.

Ne jamais agrandir le bouton jusqu’à casser la barre.

## Aucun projet ouvert

Le bouton Projet peut :

- indiquer l’état vide
- permettre éventuellement d’accéder à la sélection/création de projet

Le comportement exact pourra être défini séparément.

## Dashboard déjà ouvert

Un clic sur Projet :

- ferme le dashboard
- montre le projet courant

Un appui long ou drag sur `atome` :

- conserve ou réaffiche le dashboard

## Assistant déjà ouvert

Un clic sur `atome` peut :

- donner le focus à l’assistant
- ou appliquer la logique standard de l’overlay IA

Ne pas faire varier le rôle du bouton.

---

# 16. Critères d’acceptation

L’implémentation est valide si :

1. `atome` est toujours visible.
2. Projet est toujours visible.
3. Les outils centraux peuvent défiler.
4. Le projet courant ne défile jamais hors écran.
5. Le clic simple sur `atome` ouvre l’assistant IA.
6. L’appui long sur `atome` ouvre le dashboard.
7. Le glissement vers le haut depuis `atome` ouvre le dashboard.
8. Les trois comportements sont identiques sur mobile, tablette et desktop.
9. Le clic Projet ramène toujours au canevas.
10. Le clic Projet ne cycle jamais entre plusieurs interfaces.
11. Le clic long Projet ouvre les actions du projet.
12. Le dashboard ne reçoit pas de nouvel item assistant.
13. La barre contextuelle reste liée exclusivement à la sélection courante.
14. Aucun badge contextuel n’est ajouté aux objets du canevas.
15. Le mode gaucher inverse horizontalement l’interface.
16. Les timelines restent toujours gauche → droite.
17. L’ordre et la signification des outils restent identiques sur toutes les plateformes.
18. Le responsive n’altère jamais la logique fonctionnelle.

---

# 17. Résumé fonctionnel ultra-court

```text
atome
  clic        -> assistant IA
  clic long   -> dashboard
  drag haut   -> dashboard

Projet
  clic        -> retour au canevas courant
  clic long   -> actions projet

Menu
  atome fixe
  outils centraux scrollables
  projet fixe

Responsive
  même UX partout
  seul l’espace visible change

Gaucher
  inversion horizontale complète
  timelines non inversées
```

---

# 18. Intention UX finale

Le menu doit donner trois niveaux de lecture immédiats :

- **atome** = intelligence / supervision
- **outils centraux** = action
- **projet** = espace de travail courant

Cette structure doit rester stable, mémorisable et prévisible.

L’objectif est qu’un utilisateur qui connaît atome sur téléphone retrouve exactement la même logique sur tablette ou desktop, sans réapprentissage.
