# Interaction.md

## Objectif

Formaliser l’interface du Dashboard et le nouveau système d’enregistrement des interactions utilisateur dans atome/eVe.

## 1. Dashboard — structure validée

Le Dashboard sert uniquement à donner une vue d’ensemble des grands outils du système.

1. **Calendrier**
   - Agenda, passé, présent et futur.
   - Rendez-vous, rappels, tâches et échéances.
   - L’historique est intégré au calendrier : ce qui a réellement été fait apparaît dans le passé.
   - Filtrage possible par projet, date, contact ou type d’activité.

2. **Projets**
   - Projet et objectif sont conceptuellement une seule entité.
   - Un projet contient ce que l’utilisateur construit ou cherche à accomplir.
   - La progression n’est pas portée par cette rubrique : elle est observée dans le Moniteur.

3. **Contacts**
   - Personnes, groupes et relations.
   - Portraits ou vignettes carrées lorsque l’image est utile.

4. **Store**
   - Ressources, outils, modules, contenus et services.

5. **Moniteur**
   - Vue transversale de tout ce qui évolue ou se mesure.
   - Peut suivre aussi bien la progression d’un album, d’un film ou d’un projet logiciel que le sport, le sommeil, la santé, les habitudes ou toute autre métrique pertinente.
   - Le Moniteur observe les données existantes : il ne crée pas une seconde source de vérité.

6. **Actualités**
   - Rubrique éventuelle, à conserver uniquement si elle apporte une information globale réellement utile.

## 2. Principe général d’affichage

Les modes **Liste**, **Matrice** et **Naturel** sont des représentations différentes des mêmes objets et des mêmes données. Un changement de mode ne doit jamais modifier la logique profonde du projet.

## 3. Ajout de l’outil Record

Dans le menu latéral, lorsque **Play** est disponible, ajouter aussi un outil **Record**, au minimum en modes :

- Liste ;
- Matrice ;
- Naturel.

Le rôle de Record n’est pas seulement d’enregistrer un média. Il doit enregistrer **les actions de l’utilisateur et leur temporalité**.

## 4. Enregistrement en mode Liste / Matrice

Lorsque l’utilisateur active Record :

1. un temps de référence `T0` est créé ;
2. chaque action utilisateur significative est enregistrée ;
3. chaque action reçoit son temps relatif depuis `T0` ;
4. les actions enregistrées deviennent des événements sur une timeline.

### Exemple

Contenu : chanson 1, chanson 2, chanson 3, vidéo, texte.

Performance utilisateur :

- `T+2 s` : déclenche chanson 1 ;
- `T+4 s` : déclenche chanson 2 ;
- `T+6 s` : déclenche chanson 3 ;
- `T+8 s` : déclenche la vidéo ;
- la vidéo reste active 5 secondes ;
- `T+13 s` : affiche un texte ;
- le texte reste visible 2 secondes.

Le système doit créer automatiquement une timeline correspondant à cette chorégraphie.

La temporalité vient du **geste de l’utilisateur**, pas uniquement de la durée intrinsèque des contenus.

## 5. Timeline générée

La timeline produite par Record doit être entièrement éditable après l’enregistrement. L’utilisateur doit pouvoir notamment :

- déplacer un événement dans le temps ;
- modifier son instant de déclenchement ;
- raccourcir ou rallonger sa durée ;
- prolonger la présence d’un texte ;
- modifier les intervalles entre événements ;
- supprimer, ajouter ou réorganiser des événements ;
- rejouer le résultat.

L’enregistrement initial est donc une **capture de performance**, pas un résultat figé.

## 6. Mode Naturel

En mode Naturel, Record doit également enregistrer les interactions spatiales et visuelles, par exemple :

- déplacement d’un objet ;
- repositionnement de plusieurs objets ;
- apparition ou disparition d’un élément ;
- modification progressive d’une mise en page ;
- construction d’un visuel ;
- transformation de l’organisation spatiale d’un projet.

Ces gestes sont enregistrés avec leur timing et transformés eux aussi en événements de timeline rejouables et éditables.

## 7. Modèle conceptuel

```text
Utilisateur
    ↓
Record
    ↓
Capture des actions + timing relatif
    ↓
Séquence d’événements
    ↓
Timeline
    ↓
Édition / ajustement
    ↓
Replay
```

Record capture donc :

- **quoi** a été fait ;
- **quand** cela a été fait ;
- éventuellement **combien de temps** l’état résultant doit rester actif ;
- et, lorsque nécessaire, les paramètres de l’action.

## 8. Nature des événements enregistrables

Le système doit pouvoir évoluer vers plusieurs types d’événements :

- lecture / arrêt d’un média ;
- sélection ou activation d’un élément ;
- affichage / masquage d’un texte ou objet ;
- déplacement ;
- redimensionnement ;
- changement de propriété ;
- modification de mise en page ;
- autres interactions pertinentes.

L’architecture ne doit donc pas être limitée à un simple séquenceur audio/vidéo.

## 9. Règles essentielles

- Ne pas dupliquer les données existantes.
- Utiliser l’historisation déjà présente dans atome/eVe lorsque cela est pertinent.
- Séparer le concept métier de sa représentation visuelle.
- Record capture des interactions utilisateur, pas uniquement des fichiers médias.
- Le timing enregistré est relatif au début de la session Record.
- La timeline générée reste modifiable.
- Le même principe fonctionne en Liste, Matrice et Naturel.
- Une lecture ultérieure doit pouvoir reproduire la performance enregistrée.
- La UI ne doit pas contenir la logique métier fondamentale : les actions doivent passer par les APIs prévues par atome.

## 10. Cas d’usage principal

L’utilisateur veut créer rapidement une séquence sans programmer manuellement une timeline.

1. Il prépare ses objets.
2. Il appuie sur Record.
3. Il interagit naturellement avec eux au rythme souhaité.
4. Il arrête Record.
5. Il obtient une timeline correspondant à sa performance.
6. Il ajuste ensuite cette timeline avec précision.

Le système transforme ainsi une **interaction intuitive en structure temporelle éditable**.

## 11. Critères d’acceptation

Le développement est considéré comme correct si :

- Record apparaît aux endroits définis ;
- le début de l’enregistrement crée un temps zéro fiable ;
- chaque interaction prise en charge est enregistrée avec son temps relatif ;
- l’ordre et les intervalles entre actions sont conservés ;
- une timeline est générée à partir de l’enregistrement ;
- cette timeline peut être rejouée et éditée ;
- un texte peut être rallongé ou raccourci après capture ;
- les actions spatiales du mode Naturel peuvent être enregistrées puis rejouées ;
- le comportement reste cohérent entre Liste, Matrice et Naturel ;
- aucune seconde couche d’historique ou de données métier n’est créée inutilement.
