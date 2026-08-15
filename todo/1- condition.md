# CONDITION — Cahier des charges / Prompt d’implémentation

## 0. Objet du document

Ce document définit la conception, l’architecture, l’UI et l’intégration d’un **module transverse de Conditions** dans le framework **Atome / eVe**.

Le but n’est pas de créer un nouveau module métier isolé, mais une **brique fondamentale réutilisable par tous les modules qui ont besoin de filtrer, autoriser, sélectionner, déclencher, partager, rechercher ou adapter un comportement selon un contexte**.

Le résultat attendu doit rester cohérent avec la philosophie d’eVe :

- interface minimale ;
- comportement direct ;
- compréhension immédiate ;
- aucune complexité technique exposée inutilement ;
- réutilisation maximale ;
- composants transverses plutôt que duplication par module ;
- respect strict des interfaces existantes ;
- aucune refonte visuelle arbitraire des modules déjà fonctionnels ;
- intégration discrète du système Conditions dans les interfaces préexistantes.

---

# 1. Mission

Implémenter un **moteur transverse de Conditions** et son **composant UI générique**, utilisables par les modules existants et futurs.

Le système doit permettre de répondre à une question générique :

> Dans le contexte actuel, cette entité doit-elle être trouvée, visible, autorisée, partagée, déclenchée, exécutée ou ignorée ?

Le même système doit pouvoir fonctionner :

- en **entrée**, pour filtrer ce que l’utilisateur reçoit, trouve ou voit ;
- en **sortie**, pour définir ce que l’utilisateur rend visible, partage, déclenche ou autorise ;
- de manière **ponctuelle**, via une évaluation immédiate ;
- de manière **réactive**, en observant une condition jusqu’à ce qu’elle change ;
- comme simple filtre ;
- comme règle de confidentialité ;
- comme règle de partage ;
- comme déclencheur d’action ;
- comme critère de recherche ;
- comme critère de communication ;
- comme condition temporelle ;
- comme condition de localisation ;
- comme condition liée au profil ;
- comme condition d’état d’un objet, d’un projet, d’une session ou du système.

---

# 2. Principe architectural fondamental

## 2.1 Un seul moteur

Ne pas créer un système de conditions différent pour :

- la recherche ;
- les contacts ;
- la communication ;
- le partage ;
- le calendrier ;
- le temps réel ;
- les automatisations ;
- les événements interactifs ;
- les profils ;
- les permissions ;
- les objets.

Créer **un moteur canonique unique**.

Les modules métiers ne doivent pas embarquer leur propre moteur de logique conditionnelle lorsqu’une condition peut être exprimée via cette brique transverse.

Architecture générale :

```text
                 ┌─ Recherche / Finder
                 ├─ Contacts
                 ├─ Communication
                 ├─ Profil / confidentialité
                 ├─ Partage
Conditions ──────┼─ Partage temps réel
                 ├─ Calendrier
                 ├─ Alarmes / automatisations
                 ├─ Événements interactifs
                 ├─ Permissions contextuelles
                 └─ Modules futurs
```

---

# 3. Concepts fondamentaux

Le système doit être structuré autour d’un nombre réduit d’objets génériques.

## 3.1 Condition

Une condition simple décrit :

```text
propriété + opérateur + valeur
```

Exemples :

```text
age >= 18
distance <= 20 km
status == online
tag contains "music"
date >= 2026-08-13
sharing.mode == realtime
```

---

## 3.2 Groupe de conditions / ConditionSet

Les conditions doivent pouvoir être composées.

Support minimum :

```text
AND
OR
NOT
```

Exemple logique :

```text
age >= 18
AND
distance <= 20 km
AND
(
    relation == contact
    OR
    group == musicians
)
```

Le moteur doit accepter des groupes imbriqués.

---

## 3.3 Context

Le contexte représente les données disponibles au moment de l’évaluation.

Exemples :

```text
currentUser
targetUser
currentObject
currentProject
currentSession
currentTime
currentLocation
deviceState
networkState
activeMode
selectedObject
```

La Condition ne doit pas connaître directement le module métier qui l’utilise.

Elle doit être évaluée par rapport à un contexte.

---

## 3.4 ConditionEngine

API minimale conceptuelle :

```text
evaluate(condition, context)
evaluateSet(conditionSet, context)

match(entity, conditionSet, context)

watch(conditionSet, context, callback)
unwatch(...)
```

Le nom final de l’API peut évoluer pour respecter les conventions du framework, mais ces capacités doivent exister.

---

# 4. Conditions en entrée et en sortie

Cette symétrie est fondamentale.

## 4.1 Entrée

Exemple :

> Je cherche des musiciens de moins de 20 km, disponibles maintenant.

Les Conditions filtrent ce que l’utilisateur reçoit.

```text
distance <= 20 km
AND
availability == now
AND
profile.type == musician
```

---

## 4.2 Sortie

Exemple :

> Je partage mon profil uniquement avec mes contacts situés à moins de 20 km.

Les mêmes primitives deviennent une règle de visibilité.

```text
relation == contact
AND
distance <= 20 km
```

Le moteur doit être identique.

Seule l’action associée et le contexte changent.

---

# 5. Familles de conditions

Le moteur doit être extensible. Ne pas coder la liste comme un ensemble fermé.

Prévoir au minimum les familles suivantes.

## 5.1 Temps

- date ;
- heure ;
- intervalle ;
- avant ;
- après ;
- entre deux dates ;
- durée ;
- jour de semaine ;
- récurrence ;
- échéance ;
- début / fin ;
- maintenant ;
- fenêtre temporelle ;
- fréquence ;
- condition liée au calendrier.

Exemples :

```text
time >= 20:00
date between A and B
weekday in [friday, saturday]
event.start <= now
```

---

## 5.2 Localisation

- position ;
- zone ;
- rayon ;
- distance ;
- proximité ;
- entrée dans une zone ;
- sortie d’une zone ;
- proximité avec un objet ;
- proximité avec une personne ;
- localisation déclarée ou détectée selon les permissions disponibles.

Exemples :

```text
distance(targetUser, currentUser) <= 5 km
location inside "Studio"
```

---

## 5.3 Profil

Selon les données réellement disponibles et autorisées :

- âge ;
- langue ;
- rôle ;
- groupe ;
- attribut public ;
- centres d’intérêt ;
- profession ;
- compétence ;
- type de profil ;
- statut ;
- données explicitement partagées.

Exemple :

```text
age between 18 and 40
AND
profile.instrument == guitar
```

---

## 5.4 Identité / relation

- moi ;
- propriétaire ;
- contact ;
- membre d’un groupe ;
- collaborateur ;
- invité ;
- administrateur ;
- créateur ;
- utilisateur explicitement autorisé ;
- relation personnalisée.

---

## 5.5 Objets

- type ;
- nom ;
- tag ;
- auteur ;
- propriétaire ;
- date de création ;
- date de modification ;
- projet parent ;
- état ;
- contenu ;
- métadonnée ;
- attribut personnalisé ;
- position dans une hiérarchie.

---

## 5.6 État de l’application / du projet

- projet actif ;
- objet sélectionné ;
- mode courant ;
- présence d’une sélection ;
- état d’édition ;
- état de lecture ;
- état d’enregistrement ;
- état d’un module ;
- contexte Performance / Édition / Consommateur ;
- état d’une session.

---

## 5.7 Communication

- contact disponible ;
- utilisateur connecté ;
- utilisateur présent ;
- membre d’une conversation ;
- canal actif ;
- présence ;
- disponibilité ;
- groupe ;
- statut de communication.

---

## 5.8 Partage

- public ;
- privé ;
- destinataire ;
- groupe ;
- droits ;
- durée du partage ;
- lecture ;
- modification ;
- téléchargement si pertinent ;
- partage temporaire ;
- partage permanent ;
- visibilité ;
- mode live / différé.

---

## 5.9 Temps réel

Le moteur Conditions ne doit pas remplacer la brique de partage temps réel existante.

Il doit pouvoir exprimer des règles comme :

```text
sharing.mode == realtime
recipient.online == true
session.active == true
```

Puis déléguer l’exécution au système temps réel existant.

Architecture :

```text
Conditions
    ↓
Politique / décision
    ↓
Module de partage
    ↓
Brique temps réel existante
```

Ne pas dupliquer la logique réseau ou la synchronisation temps réel dans Conditions.

---

## 5.10 État technique

Seulement lorsqu’il existe une utilité fonctionnelle réelle :

- online / offline ;
- réseau disponible ;
- appareil ;
- capacité disponible ;
- état d’un service ;
- état d’une source.

Ne pas exposer des détails techniques inutiles dans l’UI utilisateur.

---

# 6. Condition → Action

Le moteur Conditions doit être strictement séparé du moteur d’actions.

Principe :

```text
CONDITION
    ↓
évaluation
    ↓
résultat
    ↓
ACTION
```

Exemple :

```text
time >= 20:00
AND
location == studio
AND
Paul.connected == true
```

peut déclencher :

```text
ouvrir une session
partager un projet
envoyer une notification
lancer une lecture
afficher un objet
modifier un état
```

Conditions décide **si**.

Le système métier ou le moteur d’action décide **quoi faire**.

Cette séparation est obligatoire afin d’éviter un module Conditions monolithique.

---

# 7. Évaluation réactive

Certaines conditions sont ponctuelles :

```text
age >= 18
```

D’autres évoluent :

```text
time >= 20:00
location inside studio
user.connected
session.active
object.selected
```

Le moteur doit donc permettre deux usages.

## 7.1 Évaluation ponctuelle

```text
evaluate(...)
```

## 7.2 Observation

```text
watch(...)
```

Exemple conceptuel :

```text
false
false
false
true
↓
déclenchement
```

Cette capacité est indispensable pour :

- calendrier ;
- alarmes ;
- automatisations ;
- présence ;
- disponibilité ;
- temps réel ;
- géolocalisation ;
- événements interactifs.

---

# 8. Conditions réutilisables

Une combinaison de Conditions doit pouvoir devenir un objet réutilisable dans eVe.

Exemple :

```text
Nom : Musiciens proches

age >= 18
distance <= 20 km
profile.type == musician
availability == now
```

Cette même condition enregistrée peut ensuite être utilisée dans :

```text
Recherche
Communication
Partage de profil
Invitation
Calendrier
Événement
Automatisation
```

Ne pas dupliquer les règles enregistrées.

Prévoir un système de référence vers une ConditionSet sauvegardée.

---

# 9. Philosophie UI

## 9.1 Règle principale

L’utilisateur ne doit jamais avoir l’impression d’utiliser un éditeur de programmation logique.

Il ne doit pas avoir besoin de comprendre :

```text
AND
OR
NOT
boolean
predicate
expression tree
```

L’UI doit traduire ces concepts en langage naturel.

Exemples :

```text
Toutes ces conditions
Au moins une de ces conditions
Aucune de ces conditions
```

Les opérateurs techniques peuvent exister en interne ou dans un mode avancé.

---

## 9.2 Une condition = une ligne

Représentation préférée :

```text
Âge                 18 – 40
Distance            < 20 km
Disponibilité       Maintenant
Relation             Contacts
```

Chaque ligne est compacte.

Respecter le système visuel d’eVe :

- look épuré ;
- densité maîtrisée ;
- alignements propres ;
- aucune décoration gratuite ;
- aucune accumulation de boutons ;
- cohérence avec les lignes de listes déjà utilisées ;
- interaction directe.

---

# 10. Intégration dans l’interface existante

C’est un point critique.

Le système Conditions ne doit pas provoquer une refonte des modules préexistants.

## 10.1 Ajouter une entrée compacte en bas du module courant

Dans chaque module compatible, ajouter sous l’interface métier existante une entrée légère :

```text
Conditions                         >
```

Si des conditions sont actives :

```text
Conditions                         3 >
```

ou si un résumé est utile :

```text
Conditions      < 20 km · disponible >
```

Cette ligne doit rester visuellement secondaire.

---

## 10.2 Ouverture

Quand l’utilisateur ouvre Conditions, le composant se déploie dans le même contexte.

Exemple :

```text
┌───────────────────────────────┐
│ Interface actuelle            │
│                               │
│                               │
├───────────────────────────────┤
│ Conditions                    │
│ Distance       < 20 km        │
│ Disponible     Maintenant     │
│ + Ajouter                     │
└───────────────────────────────┘
```

Quand il est fermé :

```text
┌───────────────────────────────┐
│ Interface actuelle            │
│                               │
├───────────────────────────────┤
│ Conditions                 >  │
└───────────────────────────────┘
```

---

# 11. Contexte UI

Le même composant générique doit être utilisé partout.

Ne pas créer :

```text
SearchConditions
ContactConditions
CommunicationConditions
CalendarConditions
SharingConditions
```

Créer un composant générique conceptuellement équivalent à :

```text
ConditionsPanel(context, target)
```

Exemples :

```text
ConditionsPanel({
    context: "search",
    target: currentSearch
})
```

```text
ConditionsPanel({
    context: "communication",
    target: currentConversation
})
```

```text
ConditionsPanel({
    context: "sharing",
    target: currentObject
})
```

Le contexte détermine :

- les types de conditions proposés en priorité ;
- les valeurs possibles ;
- les données disponibles ;
- les actions éventuelles ;
- le résumé affiché.

Le sélecteur reste cependant agnostique et plat : il affiche uniquement le nom
de chaque propriété accessible. Il n'affiche ni rubrique, ni catégorie, ni
préfixe de source ou de contexte. Le contexte peut influer sur l'ordre et les
opérateurs compatibles, jamais altérer le nom visible de la propriété.

Le moteur reste identique.

---

# 12. Intégration module par module

## 12.1 Recherche / Finder

Interface existante conservée.

Ajouter :

```text
Conditions >
```

Conditions prioritaires possibles :

- type ;
- auteur ;
- date ;
- tag ;
- nom ;
- contenu ;
- localisation ;
- propriétaire ;
- état ;
- projet ;
- profil ;
- relation ;
- métadonnées.

Exemple :

```text
Type          Audio
Date          Cette semaine
Tag           Live
```

Les résultats doivent se mettre à jour directement si la recherche actuelle le permet.

Éviter un bouton « Appliquer » si le calcul peut être instantané.

---

## 12.2 Contacts

Ajouter Conditions sous l’interface existante.

Exemples :

- relation ;
- groupe ;
- disponibilité ;
- âge ;
- localisation ;
- langue ;
- intérêt ;
- statut ;
- présence.

Exemple :

```text
Groupe          Musiciens
Distance        < 20 km
Disponible      Maintenant
```

---

## 12.3 Communication

Ajouter Conditions sous les contrôles existants.

Exemples :

- destinataires ;
- présence ;
- disponibilité ;
- relation ;
- groupe ;
- localisation ;
- temps ;
- canal ;
- état de la session.

Le système doit pouvoir permettre :

> communiquer uniquement avec les personnes satisfaisant certaines conditions.

---

## 12.4 Partage

Ajouter Conditions sous l’UI de partage existante.

Exemples :

```text
Avec qui
Quand
Où
Durée
Droits
Mode live / différé
```

Exemple :

```text
Relation        Contacts
Durée           2 heures
Synchronisation Directe
```

Le moteur Conditions décide de l’éligibilité.

Le moteur de partage effectue le partage.

---

## 12.5 Profil / confidentialité

Permettre des règles de sortie.

Exemples :

> partager ma photo uniquement avec mes contacts.

> partager mon âge seulement avec tel groupe.

> rendre une donnée visible uniquement pendant un événement.

Le système doit être suffisamment fin pour rattacher une ConditionSet :

- à un profil complet ;
- à une donnée ;
- à un groupe de données ;
- à une action de partage.

---

## 12.6 Calendrier

Ajouter Conditions aux événements / alarmes / déclenchements.

Exemples :

```text
Quand            20:00
Si présent        Studio
Si connecté       Oui
```

Le calendrier fournit la dimension temporelle.

Conditions permet les contraintes supplémentaires.

---

## 12.7 Alarmes / automatisations

Permettre :

```text
quand condition devient vraie
→ déclencher action
```

Le système doit éviter le polling inutile lorsque le framework dispose déjà d’événements ou d’observables.

---

## 12.8 Événements interactifs

Utilisable dans un logiciel ou projet interactif.

Exemples :

```text
si objet sélectionné
si lecture arrivée à X
si utilisateur entre dans une zone
si mode devient Performance
si session devient active
```

---

## 12.9 Partage temps réel

Réutiliser la brique temps réel existante.

Conditions ne gère pas :

- transport ;
- streaming ;
- synchronisation ;
- protocole réseau ;
- session média.

Conditions peut déterminer :

```text
si partage temps réel autorisé
avec qui
quand
dans quel contexte
pendant combien de temps
```

---

# 13. Simplicité de l’UI

## 13.1 Pas de gros éditeur

Éviter par défaut :

- node graph ;
- blocs de programmation ;
- arbre logique complexe ;
- modal plein écran ;
- panneau technique ;
- formulaire massif.

---

## 13.2 Questions simples

L’UI peut s’organiser autour de questions :

```text
Qui ?
Quoi ?
Quand ?
Où ?
Dans quel contexte ?
```

Mais ne montrer que les catégories pertinentes.

Exemple partage :

```text
Qui ?
Quand ?
Où ?
Temps réel ?
```

Exemple calendrier :

```text
Quand ?
Répétition ?
Seulement si… ?
```

---

## 13.3 Progressivité

Niveau simple :

```text
Conditions >
```

Niveau ouvert :

```text
Distance        < 20 km
Disponible      Maintenant
+ Ajouter
```

Niveau avancé seulement si nécessaire :

```text
Toutes ces conditions
    Distance < 20 km
    Age 18–40

Au moins une
    Groupe Musiciens
    Groupe Artistes
```

La complexité doit apparaître uniquement lorsqu’elle est nécessaire.

---

# 14. Ajout d’une condition

Interaction recommandée :

```text
+ Ajouter
```

Puis proposer les familles pertinentes au contexte.

Exemple Contacts :

```text
Relation
Groupe
Âge
Localisation
Disponibilité
Profil
Autre…
```

Puis :

```text
Distance
```

Puis :

```text
< 20 km
```

Objectif : parcours rapide, peu d’étapes, choix évidents.

---

# 15. Modification

Un clic / tap sur une ligne doit permettre de modifier directement :

- propriété ;
- opérateur ;
- valeur.

Éviter d’ouvrir une interface lourde si une modification inline ou contextuelle suffit.

---

# 16. Suppression

Ne pas ajouter systématiquement une icône « × » sur chaque ligne si cela surcharge l’UI.

Utiliser en priorité les interactions déjà cohérentes avec eVe :

- sélection + outil contextuel ;
- swipe si prévu par la plateforme ;
- menu contextuel ;
- action de suppression dans la barre contextuelle.

Respecter le système existant plutôt que créer un nouveau langage d’interaction.

---

# 17. Ordre des conditions

L’ordre des conditions n’a pas nécessairement d’impact logique dans un groupe AND/OR, mais il peut avoir un impact visuel.

Si la réorganisation est utile :

- permettre drag / clic long selon les interactions déjà utilisées par eVe ;
- ne pas imposer cette capacité si elle n’apporte rien.

---

# 18. Résumé compact

Quand le panneau Conditions est fermé, afficher seulement l’information nécessaire.

Exemples :

```text
Conditions 3 >
```

ou :

```text
Musiciens proches >
```

ou :

```text
<20 km · disponible >
```

Le résumé doit être court.

Ne jamais afficher une expression logique technique brute.

---

# 19. Conditions sauvegardées

Permettre d’enregistrer un ensemble.

Exemple :

```text
Musiciens proches
```

Puis le réutiliser.

UI possible :

```text
Conditions
────────────────
Musiciens proches
Contacts proches
Équipe Atome
+ Nouvelle condition
```

Une ConditionSet sauvegardée doit être éditable sans dupliquer les données.

Décider explicitement lors de l’implémentation entre :

- référence vivante vers la ConditionSet ;
- copie locale volontaire.

Le comportement doit être clair et prévisible.

---

# 20. Données et confidentialité

Les Conditions peuvent manipuler des données sensibles ou privées.

Règles :

- ne jamais supposer qu’une propriété de profil est accessible ;
- vérifier les permissions avant évaluation ;
- une donnée non accessible doit être traitée de façon explicite ;
- ne pas contourner les règles de confidentialité existantes ;
- ne pas transférer une donnée privée uniquement parce qu’une condition en a besoin ;
- distinguer « donnée disponible localement » et « donnée autorisée à être exposée ».

Prévoir un comportement défini pour :

```text
true
false
unknown
```

Le moteur peut avantageusement utiliser une logique à trois états dans certains contextes plutôt que considérer silencieusement `unknown == false`.

Décider ce comportement par domaine.

---

# 21. Cas de données inconnues

Exemple :

```text
age >= 18
```

mais l’âge n’est pas partagé.

Le moteur ne doit pas inventer une réponse.

Prévoir :

```text
TRUE
FALSE
UNKNOWN
```

Puis une politique :

- exclure ;
- demander ;
- ignorer la condition ;
- considérer comme non éligible ;
- comportement défini par le module appelant.

Ne pas laisser ce point implicite.

---

# 22. Modèle de données proposé

Structure conceptuelle possible :

```text
Condition {
    id
    source
    field
    operator
    value
    valueType
    options
}
```

Exemple :

```json
{
  "source": "profile",
  "field": "age",
  "operator": ">=",
  "value": 18,
  "valueType": "number"
}
```

Groupe :

```text
ConditionSet {
    id
    name
    operator
    children[]
}
```

Exemple :

```json
{
  "name": "Musiciens proches",
  "operator": "AND",
  "children": [
    {
      "source": "profile",
      "field": "age",
      "operator": ">=",
      "value": 18
    },
    {
      "source": "location",
      "field": "distance",
      "operator": "<=",
      "value": 20,
      "unit": "km"
    }
  ]
}
```

Ce schéma est indicatif.

Avant implémentation, l’adapter aux primitives déjà présentes dans Atome/eVe afin d’éviter les doublons.

---

# 23. Registre de propriétés

Prévoir idéalement un registre extensible.

Exemple conceptuel :

```text
ConditionRegistry.register({
    source: "profile",
    field: "age",
    type: "number",
    operators: [">", ">=", "<", "<=", "=", "between"],
    label: "Âge"
})
```

Un module peut exposer de nouvelles propriétés conditionnables sans modifier le cœur du moteur.

---

# 24. Registre d’opérateurs

Opérateurs génériques possibles :

## Valeurs

```text
=
!=
>
>=
<
<=
between
```

## Texte

```text
contains
notContains
startsWith
endsWith
matches
```

## Ensembles

```text
in
notIn
containsAny
containsAll
```

## Existence

```text
exists
notExists
```

## Géographique

```text
inside
outside
distanceLessThan
distanceGreaterThan
```

## Temps

```text
before
after
between
during
```

Le moteur doit limiter les opérateurs proposés selon le type de donnée.

---

# 25. Registre UI

Le moteur logique ne doit pas contenir les détails UI.

Prévoir une couche permettant de savoir comment éditer une valeur :

```text
number → slider / champ numérique selon contexte
date → sélecteur temporel
boolean → switch / choix
enum → liste
contact → picker contact
location → localisation / zone
duration → durée
```

La représentation doit rester cohérente avec les composants eVe existants.

---

# 26. Intégration avec le design système eVe

Respecter les règles déjà établies.

En particulier :

- barre principale du bas inchangée ;
- ne pas ajouter un nouvel outil permanent dans la barre du bas uniquement pour Conditions ;
- utiliser l’interface contextuelle du module courant ;
- barre droite contextuelle si une action liée aux Conditions nécessite un outil ;
- conserver des outils carrés cohérents avec le reste du framework lorsque des outils sont nécessaires ;
- ne pas casser l’ordre existant de la toolbox principale ;
- ne pas créer de navigation parallèle ;
- éviter les panneaux plein écran ;
- privilégier un déploiement léger directement dans le contexte courant ;
- ne pas multiplier les boutons.

---

# 27. Principe de placement

Le point d’entrée Conditions doit être situé **sous le contenu fonctionnel du module courant**, comme une couche transverse additionnelle.

Exemple :

```text
[ contenu du module ]

Conditions >
```

Ce pattern doit pouvoir être réutilisé dans les modules compatibles.

Il ne signifie pas que Conditions possède sa propre page principale.

---

# 28. API d’intégration souhaitée

Créer un contrat d’intégration minimal.

Exemple conceptuel :

```text
module.registerConditionContext({
    id: "communication",
    target: currentConversation,
    sources: [...],
    preferredConditions: [...]
})
```

Ou équivalent dans l’architecture actuelle.

Objectif :

- ajouter Conditions à un nouveau module avec peu de code ;
- ne pas modifier le moteur ;
- ne pas copier un panneau spécifique ;
- déclarer simplement ce que le module expose.

---

# 29. Performance

Le moteur peut devenir transversal et très sollicité.

Il doit donc être conçu pour éviter :

- réévaluation globale inutile ;
- polling permanent ;
- calculs géographiques répétés ;
- écouteurs non libérés ;
- duplication des observateurs ;
- rendu UI inutile ;
- recalcul de toutes les Conditions lorsqu’une seule donnée change.

Favoriser :

- dépendances explicites ;
- événements ciblés ;
- cache raisonnable ;
- invalidation ;
- observation par propriété ;
- désabonnement automatique ;
- batching si nécessaire.

---

# 30. Mode réactif

Une ConditionSet observée doit connaître ses dépendances.

Exemple :

```text
time
location
targetUser.status
```

Si seule `targetUser.status` change, ne pas recalculer des informations coûteuses inutiles.

Prévoir une stratégie d’abonnement aux sources.

---

# 31. Sérialisation

Les Conditions doivent pouvoir être :

- sauvegardées ;
- copiées ;
- transmises ;
- attachées à un objet ;
- attachées à un événement ;
- attachées à une règle de partage ;
- réutilisées.

Utiliser un format stable et versionnable.

Prévoir :

```text
schemaVersion
```

afin de permettre des migrations futures.

---

# 32. Compatibilité réseau

Si une ConditionSet doit être transmise entre clients :

- ne transmettre que ce qui est nécessaire ;
- vérifier que les propriétés référencées existent des deux côtés ;
- ne pas envoyer automatiquement les valeurs privées servant à l’évaluation ;
- distinguer la règle de ses données d’évaluation.

Exemple :

```text
Règle : age >= 18
```

ne signifie pas que l’âge doit être envoyé à tous les participants.

---

# 33. Sécurité

Le moteur Conditions ne doit jamais devenir une sécurité purement côté UI.

Si une Condition protège réellement :

- un accès ;
- une donnée ;
- une permission ;
- une ressource serveur ;

la condition critique doit être vérifiée dans la couche d’autorité pertinente.

L’UI peut anticiper l’état, mais ne doit pas être la seule barrière de sécurité.

---

# 34. Compatibilité avec les permissions

Les Conditions doivent pouvoir coexister avec :

- permissions d’objet ;
- rôle ;
- propriétaire ;
- droits serveur ;
- authentification ;
- groupes ;
- ACL éventuelles.

Ne pas remplacer une politique de sécurité existante par une simple condition locale.

---

# 35. État vide

Si aucune condition n’est définie :

```text
Conditions >
```

L’absence de condition doit avoir un comportement explicite.

Par défaut recommandé :

```text
aucune restriction supplémentaire
```

mais vérifier module par module.

---

# 36. Erreurs

Prévoir des états visibles mais sobres :

```text
Condition indisponible
Donnée non accessible
Source absente
Valeur invalide
Condition obsolète
```

Ne pas afficher de stack ou détails techniques dans l’UI utilisateur.

---

# 37. Compatibilité future avec langage naturel / assistant

Le moteur Conditions doit être structuré pour permettre plus tard à l’assistant de transformer une phrase en ConditionSet.

Exemple :

> Trouve-moi des guitaristes de moins de 20 km disponibles ce soir.

→

```text
profile.instrument == guitar
AND
distance <= 20 km
AND
availability == tonight
```

Mais ne pas rendre l’assistant indispensable au fonctionnement.

Le système manuel doit être entièrement utilisable sans IA.

---

# 38. Recherche textuelle et Conditions

Ne pas opposer :

```text
recherche texte
```

et :

```text
Conditions
```

Ils doivent pouvoir fonctionner ensemble.

Exemple :

```text
"guitariste"
+
Distance < 20 km
+
Disponible maintenant
```

---

# 39. Conditions implicites et explicites

Certaines règles sont définies explicitement par l’utilisateur.

D’autres peuvent provenir du contexte.

Exemple :

```text
currentProject
currentUser
activeMode
```

Le moteur doit distinguer :

- condition sauvegardée ;
- contrainte contextuelle temporaire ;
- permission système ;
- filtre UI.

Ne pas tout sérialiser comme si l’utilisateur l’avait créé.

---

# 40. Portée

Une ConditionSet doit pouvoir avoir une portée définie.

Exemples :

```text
local au module
liée à un objet
liée à un projet
liée au profil
globale utilisateur
partagée
temporaire
```

---

# 41. Héritage éventuel

Si le framework utilise une hiérarchie d’objets, prévoir la possibilité future d’héritage ou de combinaison.

Exemple :

```text
Projet
└─ condition générale
   └─ Objet
      └─ condition supplémentaire
```

Ne pas implémenter un système d’héritage complexe sans besoin réel, mais éviter une architecture qui l’interdirait.

---

# 42. Expérience utilisateur attendue

L’utilisateur doit pouvoir effectuer des opérations comme :

## Cas 1 — Recherche

```text
Je cherche quelqu’un
→ Conditions
→ Distance < 20 km
→ Disponible maintenant
→ résultats mis à jour
```

## Cas 2 — Partage

```text
Je partage mon profil
→ Conditions
→ Contacts
→ Pendant 24 h
→ partage
```

## Cas 3 — Calendrier

```text
Créer événement
→ Conditions
→ 20:00
→ seulement si je suis au Studio
→ action
```

## Cas 4 — Temps réel

```text
Partager objet
→ Conditions
→ personnes du groupe
→ lorsqu’elles sont connectées
→ synchronisation live via le module temps réel existant
```

---

# 43. Règles d’ergonomie

- interaction directe ;
- résultat immédiat lorsque possible ;
- pas de confirmation inutile ;
- pas de bouton « appliquer » si le changement peut être live ;
- peu de texte ;
- labels compréhensibles ;
- pas de jargon logique ;
- pas d’arbre complexe par défaut ;
- pas de navigation supplémentaire ;
- contexte conservé ;
- panneau repliable ;
- résumé compact ;
- édition locale.

---

# 44. Accessibilité

Le composant doit conserver :

- cibles tactiles correctes ;
- contraste suffisant ;
- labels textuels disponibles ;
- structure exploitable par les systèmes d’accessibilité ;
- focus clavier lorsque pertinent ;
- pas d’information portée uniquement par la couleur.

---

# 45. Responsive

Le composant Conditions doit fonctionner :

- desktop ;
- tablette ;
- mobile ;
- Web ;
- Tauri ;
- iOS.

Éviter une UI dépendante d’un très grand écran.

---

# 46. Tests fonctionnels minimum

## Moteur

Tester :

```text
condition simple vraie
condition simple fausse
AND
OR
NOT
groupes imbriqués
unknown
propriété absente
type invalide
condition sauvegardée
condition réutilisée
```

## Réactivité

Tester :

```text
changement heure
changement localisation
connexion utilisateur
déconnexion utilisateur
changement sélection
changement état objet
désabonnement
```

## UI

Tester :

```text
ouvrir Conditions
fermer Conditions
ajouter
modifier
supprimer
résumé
sauvegarder
réutiliser
état vide
erreur
```

---

# 47. Tests d’intégration minimum

Tester Conditions dans :

1. Recherche / Finder ;
2. Contacts ;
3. Communication ;
4. Partage ;
5. Calendrier ;
6. partage temps réel via la brique existante.

Pour chaque module vérifier :

- pas de régression UI ;
- pas de duplication du moteur ;
- contexte correct ;
- filtres corrects ;
- repli correct ;
- données correctes ;
- permissions respectées.

---

# 48. Tests de non-régression

Le travail ne doit pas casser :

- interfaces existantes ;
- recherche actuelle ;
- communication actuelle ;
- contacts ;
- partage ;
- navigation ;
- toolbox principale ;
- barre contextuelle ;
- temps réel ;
- calendrier ;
- permissions.

---

# 49. Audit préalable obligatoire

Avant de coder le moteur complet, auditer le framework existant.

Rechercher les briques déjà présentes pouvant correspondre à :

- filtres ;
- query ;
- search predicates ;
- permissions ;
- règles ;
- watchers ;
- events ;
- observers ;
- calendrier ;
- timer ;
- geolocation ;
- partage ;
- présence ;
- temps réel ;
- groupes ;
- profils ;
- tags ;
- metadata ;
- object states.

But :

> ne pas réécrire ce qui existe déjà.

Identifier :

```text
ce qui existe
ce qui est réutilisable
ce qui doit être généralisé
ce qui doit être déplacé
ce qui doit être remplacé
ce qui doit être supprimé car dupliqué
```

---

# 50. Stratégie d’implémentation

## Étape 1 — Audit

Cartographier les systèmes existants.

## Étape 2 — Contrat

Définir :

```text
Condition
ConditionSet
Context
ConditionEngine
Registry
```

## Étape 3 — Prototype moteur

Implémenter :

```text
evaluate
groups
operators
unknown
```

## Étape 4 — Réactivité

Implémenter `watch` uniquement sur les sources réellement nécessaires.

## Étape 5 — UI générique

Créer le composant :

```text
ConditionsPanel
```

ou équivalent selon conventions existantes.

## Étape 6 — Recherche

Première intégration recommandée car elle permet de valider immédiatement le filtrage.

## Étape 7 — Contacts / Communication

Valider les conditions sur les utilisateurs.

## Étape 8 — Partage

Valider les règles de sortie.

## Étape 9 — Calendrier

Valider les conditions temporelles et réactives.

## Étape 10 — Temps réel

Brancher les conditions au système de partage temps réel existant sans le réécrire.

## Étape 11 — Tests globaux

## Étape 12 — Nettoyage

Supprimer les duplications apparues pendant la migration.

---

# 51. Critères de réussite

La tâche est considérée comme réussie si :

- il existe un seul moteur transverse ;
- plusieurs modules utilisent exactement la même brique ;
- l’UI ne ressemble pas à un outil de programmation ;
- Conditions est accessible en bas des interfaces compatibles ;
- les interfaces existantes ne sont pas redessinées ;
- les conditions peuvent filtrer en entrée ;
- les conditions peuvent limiter en sortie ;
- les conditions peuvent être sauvegardées ;
- les conditions peuvent être réutilisées ;
- le moteur sait évaluer des groupes ;
- le moteur peut observer des conditions dynamiques ;
- le temps réel reste géré par la brique temps réel existante ;
- les permissions sont respectées ;
- le système est extensible ;
- aucun module métier ne réimplémente un moteur parallèle.

---

# 52. Contraintes de conception

Ne pas :

- créer un nouvel écran principal Conditions sans nécessité ;
- ajouter un nouvel outil permanent dans la barre du bas ;
- casser le design existant ;
- créer une UI de node editor ;
- exposer AND/OR/NOT au grand public par défaut ;
- dupliquer le moteur dans chaque module ;
- réécrire le module temps réel ;
- utiliser Conditions comme unique couche de sécurité serveur ;
- introduire une architecture lourde si les primitives existantes suffisent ;
- ajouter des dépendances externes sans justification forte ;
- compliquer les modules existants.

---

# 53. Points à challenger pendant l’implémentation

Ne pas suivre mécaniquement ce document si le framework contient déjà une solution meilleure.

Challenger :

- emplacement exact de la ligne Conditions ;
- nécessité ou non d’un panneau déployé ;
- possibilité d’utiliser un panneau contextuel déjà existant ;
- format de sérialisation ;
- logique `unknown` ;
- méthode d’observation ;
- héritage ;
- conditions sauvegardées ;
- interaction avec les permissions ;
- performance ;
- règles de résumé ;
- comportement sur mobile.

Toute amélioration doit cependant respecter le concept :

> moteur transverse unique + UI minimale + intégration contextuelle + aucune duplication.

---

# 54. Livrables attendus

Le travail doit produire :

1. audit des briques existantes ;
2. architecture finale du moteur ;
3. modèle de données ;
4. registre des propriétés et opérateurs ;
5. moteur d’évaluation ;
6. moteur d’observation ;
7. composant UI générique ;
8. intégration Recherche ;
9. intégration Contacts ;
10. intégration Communication ;
11. intégration Partage ;
12. intégration Calendrier ;
13. intégration avec le temps réel existant ;
14. tests ;
15. documentation développeur ;
16. exemples ;
17. vérification de non-régression.

---

# 55. Prompt d’exécution

Tu travailles sur le framework Atome/eVe.

Ta mission est d’analyser le code existant puis d’implémenter un **module transverse de Conditions** conforme à l’intégralité de ce cahier des charges.

Commence impérativement par auditer le framework afin d’identifier les systèmes déjà présents pour les filtres, recherches, événements, permissions, profils, contacts, communication, partage, calendrier, présence et temps réel.

Ne réimplémente pas une fonction existante si elle peut être généralisée proprement.

Le module Conditions doit être un moteur unique utilisé par tous les modules compatibles.

Il doit prendre en charge :

- conditions simples ;
- groupes ;
- AND / OR / NOT ;
- contextes ;
- valeurs inconnues ;
- évaluation immédiate ;
- observation réactive ;
- sauvegarde ;
- réutilisation ;
- conditions en entrée ;
- conditions en sortie ;
- temporalité ;
- localisation ;
- profil ;
- identité ;
- relation ;
- objets ;
- état système ;
- communication ;
- partage ;
- temps réel comme critère ;
- déclenchement d’actions via un système séparé.

Crée un composant UI unique et générique permettant d’intégrer Conditions dans les modules existants.

Ne refonds pas ces modules.

Ajoute simplement un point d’accès compact `Conditions` sous leur contenu fonctionnel lorsqu’ils sont compatibles.

Le même composant doit s’adapter au contexte et proposer seulement les types de conditions pertinents.

L’interface doit rester conforme à eVe :

- minimale ;
- directe ;
- contextuelle ;
- repliable ;
- compacte ;
- sans jargon ;
- sans node graph ;
- sans écran lourd ;
- sans nouvel outil permanent dans la toolbox principale ;
- sans bouton de validation inutile ;
- sans duplication d’interface.

Le résultat doit fonctionner avec le système de partage temps réel déjà présent sans réimplémenter cette brique.

Traite les permissions et la confidentialité comme des contraintes de sécurité réelles.

Une règle locale ne doit jamais remplacer une vérification d’autorité lorsqu’une ressource protégée est concernée.

Rends l’architecture extensible afin que de nouveaux modules puissent exposer leurs propres propriétés conditionnables sans modification du cœur.

Avant toute modification importante, vérifie les conventions actuelles du framework et utilise-les.

Après implémentation :

- teste le moteur ;
- teste l’UI ;
- teste chaque intégration ;
- vérifie la performance ;
- vérifie les watchers ;
- vérifie la libération des ressources ;
- vérifie les permissions ;
- vérifie la non-régression ;
- supprime les duplications éventuelles.

Fournis enfin un rapport indiquant :

```text
- éléments existants réutilisés
- fichiers créés
- fichiers modifiés
- architecture retenue
- API publique
- modules intégrés
- tests réalisés
- problèmes rencontrés
- choix techniques
- limitations restantes
- améliorations futures éventuelles
```

Le but final est que **Conditions devienne une primitive transverse du framework eVe**, au même titre que les autres briques fondamentales, tout en restant presque invisible pour l’utilisateur tant qu’il n’en a pas besoin.

---

# 56. État d’implémentation vérifié — 2026-08-14

Implémenté dans les propriétaires canoniques :

- contrat versionné `schemaVersion: 1`, groupes `and/or/not` et états
  `true/false/unknown` ;
- découverte automatique des schémas, particules réellement présentes,
  propriétés personnalisées, chemins relationnels autorisés jusqu’à trois
  relations, critères calculés et fournisseurs live ;
- registre extensible de propriétés, opérateurs et sources, sans catalogue
  fermé par module ;
- critères calculés persistés en AST sûr, sans JavaScript utilisateur ;
- évaluation ponctuelle et requêtes réactives à dépendances ciblées ;
- listes `condition_list` figées et dynamiques, une liste dynamique conservant
  la référence vivante vers la dernière révision de sa ConditionSet ;
- ensembles sauvegardés et bindings persistés comme Atomes canoniques, avec
  révisions et réautorisation obligatoire pour les domaines de sécurité ;
- même évaluateur pour les conditions ACL ADOLE, avec rejet/deny des schémas
  invalides ;
- autorisation atomique de chaque propriété écrite et projection par
  destinataire/propriété des états, historiques et événements temps réel ;
- autorité de requête serveur avec filtrage ACL avant évaluation et projection,
  sans retour des propriétés privées utilisées pour décider ;
- API globale, WebSocket et MCP Conditions sous les capacités/politiques
  existantes ;
- composant BevyUI générique, compact et repliable, consommé par Finder,
  Contacts, Communication/Share et Calendar/alarmes, avec recherche de
  propriétés, saisie directe des conditions, groupes, compteur live et trois
  actions finales, sans action « Créer un critère » ni éditeur secondaire ;
- sélecteur de propriétés agnostique et plat : seul le nom de propriété est
  visible ; Conditions est un bloc autonome dans Communication et ne dépend pas
  de l'ouverture de l'accordéon Avancé ;
- ouverture créant immédiatement la première ligne éditable ; la propriété se
  saisit directement et l'autocomplétion est alimentée par la découverte
  autorisée locale et distante, sans catalogue fermé `Name/Email/Distance`,
  rubrique ni boîte « Créer un critère » ;
- `+ Ajouter` reste visible sur la ligne du groupe et toute nouvelle condition
  choisit immédiatement un opérateur compatible avec sa propriété découverte ;
- fournisseurs temps, présence, session, localisation et santé ; échéances
  temporelles exactes sans polling, expiration vers `UNKNOWN`, libération des
  abonnements et connecteur HealthKit compilé pour simulateur iOS ;
- documentation développeur dans `atome/documentations/conditions.md` et tests
  permanents dans `tests/`.

# 57. §12.5 livré — 2026-08-15

Profile/Info expose désormais une règle conditionnelle, **appliquée par le serveur**.
Le blocage précédent était réel — `permissions.principal_id` est `NOT NULL` avec clé
étrangère, donc aucune ligne ne peut viser « tout lecteur ». Il est levé par une table
dédiée `property_privacy_rules`, consultée dans `canRead` après la permission.

Invariant de sécurité : la règle **restreint uniquement**. Elle ne peut pas accorder,
son absence ne change rien, une règle corrompue refuse, le propriétaire n'est jamais
masqué de ses propres données, et seul lui peut écrire ou énumérer ses règles.
Couvert par `temp/conditions_privacy_rule_probe.mjs` (9 sections).

Limites restantes, non présentées comme acceptées :
- l’acceptation navigateur visible authentifié desktop/mobile reste à réaliser ;
- HealthKit reste à valider sur appareil physique avec permission et vraie
  mesure ; la compilation simulateur ne constitue pas cette preuve ;
- la validation de granularité est **livrée** :
  `todo/audits/granularity_validation_report.md`, verdict `GRANULARITY VALIDATION: PASS`,
  matrice complète et preuves fichier+ligne, sans correctif nécessaire.
