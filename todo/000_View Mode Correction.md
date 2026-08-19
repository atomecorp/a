# View Mode Correction

## Objectif

Mettre à niveau les modes **List**, **Matrix**, la navigation dans les **molecules**, ainsi que le comportement de **Play**, afin d’obtenir une logique unique, récursive et cohérente dans **atome**.

Ce document ne couvre pas le menu principal inférieur déjà spécifié ailleurs.

Le nom du projet et du framework s’écrit toujours `atome`, tout en minuscules, avec un `e` final.

## 1. Principe général

Les modes **List** et **Matrix** partagent exactement la même logique fonctionnelle. La seule différence est la représentation visuelle :

- **List** : éléments sous forme de lignes.
- **Matrix** : éléments sous forme de cartes/items.

La logique de navigation, sélection, contexte, lecture, création et import reste identique.

Le système fonctionne récursivement, type poupées russes :

- projet
- molecule
- molecule interne
- atome
- contenu

Chaque niveau peut contenir d’autres éléments et devenir le contexte courant.

## 2. Mode List

### 2.1 Alignement

La liste est ancrée en bas. Elle commence visuellement par le bas de la zone disponible et se construit vers le haut. Elle ne doit pas être alignée en haut par défaut.

### 2.2 Bande basse

Sous la liste se trouve une bande dédiée au niveau courant. Elle contient au minimum :

- le nom du niveau courant
- une icône de retour au niveau précédent

Le niveau courant peut être un projet, une molecule, un atome devenu conteneur ou tout autre conteneur navigable.

### 2.3 Clic simple sur la bande basse

Un clic simple sur la bande basse active le **contexte du conteneur courant**.

La barre contextuelle latérale affiche alors les outils et paramètres associés au niveau courant lui-même, et non à l’item précédemment sélectionné.

### 2.4 Double-clic sur le nom

Un double-clic sur le nom affiché dans la bande basse permet de renommer directement le niveau courant.

Ne pas afficher de bouton ou label texte `Renommer`.

Selon le niveau :

- niveau projet → renomme le projet
- molecule → renomme la molecule
- atome conteneur → renomme cet atome

## 3. Sélection d’un item

### 3.1 Clic simple

Un clic simple sur une ligne en mode List sélectionne cet item.

La barre contextuelle latérale bascule immédiatement sur le contexte de cet item.

Exemples :

- atome vidéo → outils vidéo
- atome audio → outils audio
- molecule → outils de la molecule
- autre type → outils correspondants

Le contexte latéral suit toujours la sélection active.

## 4. Navigation dans une molecule

### 4.1 Double-clic sur une molecule

Un double-clic sur une molecule permet d’entrer à l’intérieur.

Le système doit :

1. mémoriser le niveau parent
2. afficher les enfants de la molecule
3. conserver le mode de vue courant
4. mettre à jour la bande basse avec le nom de la molecule courante

Si l’utilisateur était en List, il reste en List. S’il était en Matrix, il reste en Matrix.

## 5. Double-clic sur un atome non conteneur

Un double-clic sur un atome contenant déjà un média ou une donnée ne doit jamais faire disparaître son contenu.

Exemples :

- vidéo
- photo
- audio
- texte
- objet
- donnée

Comportement attendu :

1. transformer/envelopper cet atome dans une nouvelle structure de type molecule
2. conserver son contenu original
3. placer le contenu original comme premier élément/piste interne
4. entrer automatiquement dans cette nouvelle molecule

Le double-clic signifie donc conceptuellement : **entrer**.

Si l’élément n’est pas encore un conteneur, il devient un conteneur sans perte de contenu.

## 6. Navigation arrière

La bande basse doit comporter une icône permettant de remonter exactement d’un niveau.

Exemples :

- molecule interne → molecule parente
- molecule → projet
- sous-structure → structure englobante

Cette navigation respecte strictement la hiérarchie et fonctionne comme une pile.

Exemple :

```text
Project
  -> Molecule A
      -> Molecule B
          -> Molecule C
```

Depuis `Molecule C`, un retour donne `Molecule B`, puis `Molecule A`, puis `Project`.

Au niveau racine du projet, le bouton retour peut être désactivé ou masqué.

## 7. Mode Matrix

Le mode Matrix reproduit exactement la logique du mode List. La seule différence est la représentation visuelle.

### 7.1 Clic simple sur une carte

Sélectionne la carte et affiche son contexte dans la barre latérale.

### 7.2 Double-clic sur une molecule

Entre dans la molecule et affiche ses enfants en Matrix.

### 7.3 Double-clic sur un atome non conteneur

Même règle qu’en List :

- créer/envelopper en molecule
- conserver le contenu original
- placer le contenu original comme premier élément interne
- entrer immédiatement dans la nouvelle molecule

### 7.4 Bande basse en Matrix

Même comportement qu’en List :

- nom du niveau courant
- clic simple → contexte du conteneur
- double-clic sur le nom → renommage implicite
- icône retour → remonter d’un niveau

## 8. Play contextuel

Le bouton Play appartient à la barre contextuelle latérale.

### 8.1 Clic simple sur Play

Un clic simple lance la lecture du contexte actif.

Le contexte actif peut être :

- un item sélectionné
- une molecule
- la liste courante
- la matrice courante
- un projet
- un autre conteneur

Le moteur joue ce qui est actuellement défini comme contexte.

### 8.2 Clic long sur Play

Un clic long sur Play ouvre les options de lecture du contexte courant.

Prévoir au minimum les modes suivants :

#### Sequential

Lecture séquentielle des éléments.

```text
A -> B -> C -> D
```

#### Sync / Together / Layer

Lecture simultanée des éléments concernés.

Exemples possibles :

- voix
- basse
- batterie
- vidéo
- lumière

Le nom final du mode pourra être décidé ultérieurement, mais la logique de lecture simultanée doit être prévue.

#### Random

Lecture aléatoire/non séquentielle.

Le détail précis de l’algorithme pourra évoluer plus tard.

## 9. Règles de lecture récursives

Chaque conteneur peut posséder sa propre règle de lecture.

Exemple :

```text
Project
  Sequential

  Molecule A
    Sequential

    Section 1
      Layer

    Section 2
      Random
```

La règle s’applique au contenu direct du conteneur concerné.

Le système doit permettre :

- règle par défaut
- héritage
- override local

Un niveau inférieur peut surcharger la règle du niveau supérieur.

## 10. Lecture du contenu affiché

En mode List ou Matrix, lorsque le contexte du conteneur est actif, Play concerne le contenu du niveau actuellement affiché.

Exemple :

```text
Project > Song > Chorus
```

La vue affiche les enfants de `Chorus`.

Un clic sur la bande basse active `Chorus`.

Un clic sur Play joue alors les éléments de `Chorus` selon sa règle de lecture.

## 11. Cohérence List / Matrix

La logique suivante doit être strictement identique :

```text
clic item
-> sélectionner

double-clic molecule
-> entrer

double-clic atome non conteneur
-> créer/envelopper en molecule
-> conserver le contenu
-> entrer

clic bande basse
-> sélectionner le contexte du conteneur courant

double-clic nom bande basse
-> renommer le niveau courant

retour
-> remonter d’un niveau

Play
-> jouer le contexte courant

Play long
-> afficher les règles de lecture
```

## 12. Record et Import — bug à corriger

Bug actuel : lorsqu’un élément est créé via **Record** ou **Import**, il peut être ajouté au projet mais ne pas apparaître immédiatement dans la vue List ou Matrix active.

Ce comportement doit être corrigé.

### 12.1 Record en List

Lorsqu’un Record crée un nouvel élément au niveau courant :

- ajouter l’élément au conteneur courant
- afficher immédiatement une nouvelle ligne
- aucun refresh manuel ne doit être nécessaire

### 12.2 Import en List

Même comportement :

- import au niveau courant
- ajout immédiat
- nouvelle ligne immédiatement visible

### 12.3 Record en Matrix

Lorsqu’un Record crée un nouvel élément :

- ajout au conteneur courant
- création immédiate d’une nouvelle carte/item
- affichage immédiat dans la matrice

### 12.4 Import en Matrix

Même comportement :

- ajout au conteneur courant
- nouvelle carte immédiatement visible

## 13. Niveau d’insertion

Record et Import doivent toujours respecter le niveau courant.

Exemple :

```text
Project
  > Song
    > Chorus
```

Si l’utilisateur réalise un Record dans `Chorus`, le nouvel élément doit être ajouté à `Chorus`, et non à la racine du projet.

Même règle pour Import.

## 14. Mise à jour temps réel de la vue

La vue doit être réactive à toute mutation du contenu courant.

Les opérations suivantes doivent provoquer une mise à jour immédiate :

- Record
- Import
- création
- suppression
- déplacement
- conversion atome → molecule
- ajout d’une piste interne
- changement de nom
- retour navigation
- entrée dans une molecule

List et Matrix doivent observer le conteneur courant et ne pas fonctionner comme de simples snapshots nécessitant un refresh manuel.

## 15. État de navigation

Le système doit maintenir explicitement au minimum :

```text
current_container
parent_container
view_mode
selected_item
playback_rule
navigation_stack
```

Exemple conceptuel :

```js
{
  view_mode: "list",
  current_container: "chorus_01",
  selected_item: null,
  navigation_stack: [
    "project_01",
    "song_01",
    "chorus_01"
  ]
}
```

Le passage List ↔ Matrix ne doit pas modifier :

- le conteneur courant
- la navigation
- la règle de lecture
- la sélection, si l’objet existe toujours

## 16. Modèle conceptuel suggéré

Exemple de conteneur :

```js
{
  id: "molecule_01",
  type: "molecule",
  name: "Chorus",
  children: [],
  playback: {
    mode: "sequential",
    inherited: true,
    override: false
  }
}
```

Exemple d’atome simple :

```js
{
  id: "video_01",
  type: "atome",
  media_type: "video",
  name: "Intro",
  content: {}
}
```

Après conversion en molecule :

```js
{
  id: "molecule_video_01",
  type: "molecule",
  name: "Intro",
  children: [
    {
      id: "video_01",
      type: "atome",
      media_type: "video",
      name: "Intro",
      content: {}
    }
  ]
}
```

La structure exacte peut varier selon l’architecture existante d’atome.

Principe impératif : **aucune perte de contenu lors de la transformation d’un atome en molecule.**

## 17. Cas limites

### Molecule vide

Entrer dans une molecule vide doit afficher une List ou Matrix vide, tout en conservant :

- la bande basse
- le nom de la molecule
- le bouton retour
- le contexte Play

### Projet vide

Même comportement.

### Changement de vue

Si l’utilisateur passe de List à Matrix à l’intérieur d’une molecule :

- rester dans la même molecule
- conserver le niveau courant
- conserver la hiérarchie
- afficher les mêmes enfants sous forme de cartes

Et inversement.

### Élément supprimé pendant qu’il est sélectionné

La sélection doit être nettoyée proprement.

Le contexte doit revenir au conteneur courant ou à un état neutre cohérent.

## 18. Critères d’acceptation

L’implémentation est valide si :

1. List et Matrix partagent exactement la même logique.
2. La List est ancrée en bas et se construit vers le haut.
3. La bande basse affiche le nom du niveau courant.
4. La bande basse possède un contrôle pour remonter d’un niveau.
5. Un clic sur la bande basse sélectionne le contexte du conteneur courant.
6. Un double-clic sur son nom renomme implicitement le niveau courant.
7. Un clic sur un item sélectionne cet item.
8. La barre contextuelle latérale suit toujours le contexte sélectionné.
9. Un double-clic sur une molecule permet d’entrer dedans.
10. Le mode List ou Matrix est conservé après navigation.
11. Un double-clic sur un atome non conteneur crée/enveloppe une molecule.
12. Le contenu original de l’atome est conservé comme premier élément interne.
13. Aucun contenu n’est perdu pendant cette conversion.
14. La navigation fonctionne récursivement sur plusieurs niveaux.
15. Le bouton retour remonte exactement d’un niveau.
16. Play joue le contexte actif.
17. Le clic long sur Play affiche les options de lecture.
18. Les modes Sequential, Sync/Layer et Random sont prévus.
19. Les règles de lecture peuvent être définies par conteneur.
20. Une règle locale peut surcharger une règle héritée.
21. Record ajoute immédiatement le nouvel élément au niveau courant.
22. Import ajoute immédiatement le nouvel élément au niveau courant.
23. En List, Record/Import créent immédiatement une nouvelle ligne visible.
24. En Matrix, Record/Import créent immédiatement une nouvelle carte visible.
25. Aucun refresh manuel n’est requis.
26. Record/Import ne doivent pas ajouter systématiquement les nouveaux éléments à la racine du projet.
27. Le passage List ↔ Matrix conserve le niveau courant.
28. Toutes ces règles fonctionnent de façon récursive dans les molecules.

## 19. Résumé fonctionnel

```text
LIST
- ancrée en bas
- lignes vers le haut
- bande basse = niveau courant
- clic bande = contexte conteneur
- double-clic nom = rename implicite
- clic item = sélection
- double-clic molecule = entrer
- double-clic atome = convertir/envelopper en molecule + conserver contenu + entrer
- retour = parent

MATRIX
- même logique
- cartes au lieu de lignes

PLAY
- clic = lire contexte courant
- clic long = options
- Sequential
- Sync / Layer / Together
- Random
- règles par conteneur
- override local possible

RECORD / IMPORT
- insertion au niveau courant
- mise à jour immédiate de la vue
- nouvelle ligne en List
- nouvelle carte en Matrix
```

## 20. Intention finale

Le système doit donner l’impression qu’il n’existe qu’un seul moteur de navigation et de lecture.

**List** et **Matrix** ne sont que deux représentations du même état.

Une molecule est simplement un niveau navigable supplémentaire.

Un atome peut devenir une molecule sans perdre son contenu.

Play agit toujours sur le contexte courant.

Record et Import alimentent immédiatement le niveau dans lequel l’utilisateur travaille.

La totalité doit rester simple à comprendre malgré une architecture récursive et flexible.
