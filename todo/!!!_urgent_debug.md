# URGENT DEBUG --- atome/eVe

## Mission

Intervenir sur le framework **atome/eVe** pour traiter les régressions,
corrections et fonctions urgentes ci-dessous **sans casser les
comportements déjà implémentés**.

Avant toute modification : - inspecter l'implémentation existante ; -
réutiliser les moteurs, outils, commandes et composants déjà présents
; - éviter toute duplication de logique ; - ne pas réinventer un système
déjà disponible ; - préserver les trois modes de visualisation :
**Naturel, Liste, Matrice** ; - privilégier une UI mobile minimale,
cohérente et utilisable au pouce ; - ne pas ajouter de boutons, panneaux
ou options non demandés.

------------------------------------------------------------------------

## 1. Réorganiser les lignes du mode Liste

Modifier le design des lignes pour améliorer l'accès mobile.

### Mode droitier

Ordre visuel :

**\[Nom\] --- \[Waveform / preview média\] --- \[Mute\] --- \[Chevron
hiérarchie\]**

-   Nom à gauche.
-   Waveform ou preview média au centre et occupant l'espace disponible.
-   Mute à droite.
-   Chevron hiérarchique complètement à droite.
-   Le chevron conserve son rôle actuel : ouvrir/replier la hiérarchie.
-   Ne pas modifier la logique hiérarchique existante.

### Mode gaucher

Inverser réellement l'organisation :

**\[Chevron hiérarchie\] --- \[Mute\] --- \[Waveform / preview média\]
--- \[Nom\]**

La logique droitier/gaucher doit rester cohérente dans les éléments
latéraux pertinents d'eVe.

### Critère d'acceptation

Changer de mode droitier à gaucher doit inverser proprement les zones
interactives sans modifier le contenu, la hiérarchie ni le comportement
de lecture.

------------------------------------------------------------------------

## 2. Corriger le fullscreen du visualiseur

Il existe actuellement une confusion entre : - mettre toute la **view**
en fullscreen ; - mettre le **visualiseur / preview** en fullscreen.

Le comportement demandé est :

-   en lecture/performance, le fullscreen doit concerner le
    **visualiseur** ;
-   la vue d'édition complète ne doit pas être utilisée comme substitut
    ;
-   ce comportement doit fonctionner au minimum en **Liste** et
    **Matrice** ;
-   clarifier le code et la nomenclature pour empêcher cette confusion à
    l'avenir.

### Critère d'acceptation

Lancer la lecture en fullscreen affiche réellement le contenu du
visualiseur en plein écran, sans transformer toute l'interface d'édition
en fullscreen.

------------------------------------------------------------------------

## 3. Rendre le visualiseur éditable

En mode édition, le visualiseur doit permettre de manipuler directement
les objets/couches affichés.

À permettre : - sélectionner une couche/un objet ; - déplacer l'objet
; - utiliser les transformations déjà supportées par eVe ; - conserver
la logique existante des outils ; - connecter ces manipulations au
moteur existant d'enregistrement/relecture des actions lorsque celui-ci
est utilisé.

Ne pas créer un deuxième moteur d'animation ou d'automation.

### Critère d'acceptation

Un objet visible dans le visualiseur peut être sélectionné et déplacé
directement, et les actions peuvent être capturées/rejouées par le
système d'actions existant.

------------------------------------------------------------------------

## 4. Corriger la régression du mode Naturel

Bug actuel :

-   certains groupes/objets créés apparaissent comme un simple **point
    blanc** ;
-   le groupe n'est pas correctement manipulable/déplaçable.

Identifier la cause réelle et corriger la régression sans modifier le
modèle d'édition existant.

### Rappel du comportement d'édition Naturel à préserver

-   double-clic sur un atome : entrée en édition ;
-   apparition du contour d'édition ;
-   apparition du footer/bande basse existant permettant notamment
    resize/agrandissement et sortie via la croix ;
-   la croix reste le mécanisme actuel de sortie d'édition ;
-   la barre contextuelle droite correspond à l'atome actif ;
-   si plusieurs atomes sont en édition, un simple clic sur l'un d'eux
    change l'atome actif et réalimente la barre contextuelle.

------------------------------------------------------------------------

## 5. MIDI Binding --- priorité urgente

Implémenter un système de MIDI Binding **dynamique, modulaire et basé
sur les outils/commandes existants**.

Le MIDI Binding ne doit pas réinventer les actions d'eVe.

### Principe

Un binding contient :

1.  une **entrée MIDI** ;
2.  une ou plusieurs **actions existantes**.

Une entrée MIDI doit pouvoir définir : - périphérique/port MIDI ; - type
de message : Program Change, Control Change, Note, etc. ; - canal ; -
numéro ; - valeur ou plage lorsque pertinente.

### Création d'une entrée

Deux méthodes dans la même interface, sans créer deux "modes" séparés :

-   **Learn** : écouter le message MIDI reçu ;
-   **Manuel** : saisir les informations sans avoir le périphérique sous
    la main.

### Actions

Deux méthodes :

-   **Capturer** : écouter la prochaine vraie action/commande produite
    par un outil existant ;
-   **Rechercher** : utiliser le module de recherche existant d'Atom
    pour retrouver une commande/un outil.

Le module Search doit être utilisable comme composant transverse à
l'intérieur du MIDI Binding. Si l'architecture actuelle ne permet pas
d'imbriquer proprement ce module, rendre les modules transverses
composables plutôt que dupliquer Search.

### Multi-actions

Un binding peut contenir plusieurs actions.

Exemple :

**PC 7 → Fullscreen + Play + autre commande**

Prévoir : - `+ Ajouter une action` - ordre des actions ; -
suppression/modification d'une action ; - aucune limite artificielle
basse au nombre d'actions.

### Paramètres continus / sliders

Pour un slider ou paramètre continu :

-   le mouvement utilisé pendant l'assignation sert à **identifier le
    paramètre** ;
-   ne pas enregistrer automatiquement toutes les micro-variations ;
-   un CC peut être mappé continuellement au paramètre ;
-   prévoir plage min/max et éventuellement inversion ;
-   l'automation temporelle reste un système distinct.

### Automation : séparation stricte

Ne pas confondre MIDI Binding et Automation.

-   MIDI Binding = routage d'une entrée MIDI vers une commande, un
    paramètre ou le déclenchement d'une action existante.
-   Automation/Action Recorder = enregistrement d'une évolution
    temporelle.
-   Une automation existante pourra être déclenchée par MIDI comme
    n'importe quelle autre action, mais son enregistrement n'appartient
    pas au composant MIDI Binding.

### UI MIDI Binding

UI mobile extrêmement minimale.

Chaque binding est une fiche indépendante.

Structure conceptuelle :

``` text
MIDI BINDING

Binding 1

ENTRÉE MIDI
[ Learn ] [ Manuel ]

Périphérique : …
Message      : …
Numéro       : …
Valeur       : …
Canal        : …

ACTIONS

Action 1
[ Capturer ] [ Rechercher ]
→ …

[ + Ajouter une action ]

[ + Nouveau binding ]
```

Un binding peut être replié pour économiser l'espace mobile.

En état replié : - une seule ligne de résumé ; - éventuellement un
pictogramme discret du périphérique ; - chevron cohérent avec la
convention globale d'eVe ; - pas d'icônes décoratives inutiles.

### Gestion globale

Le bouton **Gérer les bindings** doit être clairement séparé de la
création courante.

Il ouvre une vue secondaire permettant : - voir tous les bindings ; -
modifier/remapper ; - désactiver temporairement sans supprimer ; -
supprimer ; - réaffecter ; - repérer les conflits.

Cette vue peut être tabulaire si nécessaire, mais elle ne doit jamais
devenir l'interface principale du MIDI Binding.

------------------------------------------------------------------------

## 6. Respecter les différences Naturel / Liste / Matrice

Ne pas appliquer une seule logique d'édition aux trois modes.

### Naturel

-   édition explicite par double-clic ;
-   barre contextuelle liée à l'atome actif en édition ;
-   MIDI Binding accessible depuis le contexte d'édition existant.

### Liste

-   la barre contextuelle est présente car la liste est considérée comme
    étant en contexte d'édition ;
-   une partie reste commune à la liste et aux items, notamment les
    fonctions de lecture/média ;
-   sélectionner une ligne par simple clic réalimente uniquement la
    partie contextuelle dépendant de l'item ;
-   MIDI Binding doit utiliser la cible actuellement pertinente sans
    casser ce comportement.

### Matrice

Même principe général que Liste : - contexte disponible directement ; -
sélection d'un item/cellule réalimente la partie contextuelle.

------------------------------------------------------------------------

## 7. Line Splitter / Prompteur

Ajouter au texte un outil de type **Line Splitter**.

### Principe

Un texte reste un atome normal tant qu'il n'est pas splitté.

Lors du split par lignes : - exposer/créer une structure interne
permettant de cibler individuellement les lignes ; - la structure
devient lisible séquentiellement ; - attribuer environ **1 seconde par
ligne par défaut** ; - permettre ensuite d'affiner les durées via le
système d'enregistrement d'actions.

### Lecture hiérarchique

Cas à supporter :

-   musique + vidéo + texte peuvent jouer simultanément en mode
    multipiste ;
-   à l'intérieur du texte splitté, les lignes doivent être lues
    **séquentiellement**.

Le moteur doit donc supporter un mode de lecture au niveau du nœud : -
parent : parallèle/multipiste ; - enfant texte splitté : séquentiel.

Ne pas transformer systématiquement tous les textes en molécules
lourdes.

### Prompteur

Base fonctionnelle : - ligne courante identifiable ; - idéalement ligne
précédente et suivante visibles ; - lignes cliquables pour permettre
l'enregistrement du déroulé.

------------------------------------------------------------------------

## 8. Barre contextuelle Liste/Matrice

Structurer la barre contextuelle sans multiplier les interfaces.

Préserver deux catégories logiques :

-   partie commune/fixe : lecture, stop, modes de lecture et commandes
    pertinentes au contexte média ;
-   partie variable : outils propres à l'objet/item sélectionné.

Exemple : - texte → Line Splitter/Prompt et outils texte existants ; -
autre type → outils existants correspondant réellement à ce type.

Ne pas créer une nouvelle liste artificielle d'actions : utiliser les
outils déjà présents.

------------------------------------------------------------------------


## 8A. Ordre déterministe de la barre contextuelle

Le fichier ne doit pas se contenter de distinguer les outils communs des outils contextuels : **leur ordre doit être stable et prévisible**.

Problème actuel :
- l'ordre des outils peut sembler anarchique selon l'objet ou le contexte ;
- un même outil peut changer de position lorsque la barre est réalimentée ;
- cela crée une perte de repères, particulièrement sur mobile.

À faire :
- définir une priorité/position canonique pour chaque outil contextuel récurrent ;
- lorsqu'un même outil est présent dans plusieurs contextes, conserver sa position relative ;
- ne pas trier les outils selon l'ordre accidentel de création, de découverte ou de chargement ;
- les outils absents peuvent disparaître, mais les outils restants doivent conserver un ordre déterministe ;
- réserver les zones les plus accessibles au pouce aux commandes les plus fréquentes ;
- **Play/Stop et les commandes de lecture permanentes doivent rester aussi bas que raisonnablement possible dans la barre**, conformément à l'ergonomie mobile actuelle ;
- le classement complet des outils pourra être défini séparément, mais le moteur/UI doit supporter une priorité stable explicite plutôt qu'un ordre implicite.

Cette règle doit être cohérente entre Naturel, Liste et Matrice chaque fois que le même outil contextuel est exposé.

### Critère d'acceptation

En sélectionnant successivement plusieurs objets différents puis en revenant au premier, les outils communs réapparaissent aux mêmes positions relatives ; Play/Stop ne saute pas arbitrairement dans la barre.


## 9. Bugs connus à vérifier/corriger

Traiter également les problèmes déjà identifiés :

-   chemins récurrents incorrects ou fragiles ;
-   lecture vidéo : disparition/perte de l'audio selon codec/conteneur ;
-   enregistrement dans les mauvais dossiers ;
-   MIDI Binding existant instable ou incomplet.

Pour chacun : 1. reproduire ; 2. identifier la cause ; 3. corriger ; 4.
ajouter un test de non-régression lorsque pertinent.

------------------------------------------------------------------------

## Contraintes générales

-   Ne pas réécrire les systèmes fonctionnels.
-   Ne pas ajouter de dépendance ou architecture lourde sans nécessité.
-   Ne pas créer de deuxième système de commandes, lecture, automation
    ou recherche.
-   Utiliser les composants existants comme briques transverses.
-   Mobile first.
-   Interface minimale.
-   Aucun "dashboard Boeing".
-   Ne pas ajouter de labels ou icônes sans fonction claire.
-   Les actions fréquentes doivent rester accessibles au pouce.
-   Préserver la cohérence droitier/gaucher.
-   Toute nouvelle abstraction doit réduire la duplication, pas
    l'augmenter.

------------------------------------------------------------------------

## Ordre de travail recommandé

1.  Auditer rapidement l'implémentation actuelle et localiser les
    composants concernés.
2.  Corriger les régressions bloquantes du mode Naturel.
3.  Corriger le fullscreen du visualiseur.
4.  Rendre le visualiseur manipulable en édition.
5.  Réorganiser les lignes Liste + mode gaucher.
6.  Stabiliser/implémenter le MIDI Binding sur les commandes existantes.
7.  Ajouter la gestion globale des bindings.
8.  Implémenter Line Splitter + lecture séquentielle interne.
9.  Vérifier les comportements Liste/Matrice/Naturel.
10. Traiter chemins, codecs vidéo/audio et dossiers d'enregistrement.
11. Effectuer les tests de régression UI, lecture, partage/collaboration
    et MIDI.

------------------------------------------------------------------------

## Définition de terminé

La tâche n'est terminée que si : - les trois modes Naturel/Liste/Matrice
restent fonctionnels ; - les comportements existants non concernés ne
régressent pas ; - le visualiseur fullscreen et son édition fonctionnent
; - la ligne Liste respecte droitier/gaucher ; - le MIDI Binding permet
Learn + manuel, Capture + Search, multi-actions, CC continu et gestion
globale ; - l'automation reste découplée du MIDI Binding ; - Line
Splitter fonctionne avec lecture séquentielle interne ; - les bugs
connus concernés sont reproduits puis corrigés ; - les tests de
non-régression essentiels passent.
