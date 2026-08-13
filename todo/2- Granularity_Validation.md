# Granularity Validation

## Prompt / Cahier des charges complet — Audit de granularité basse des Atomes

### 0. Mission

Réaliser une **recherche profonde et systématique dans le framework Atome/eVe** afin de vérifier que la granularité la plus basse attendue est réellement disponible, cohérente et exploitable sur **n’importe quelle propriété d’un Atome**.

L’objectif n’est pas de recréer un nouveau système par défaut. L’hypothèse de départ est que l’architecture actuelle a déjà été pensée pour supporter cette granularité. La mission consiste donc d’abord à **prouver ce qui existe réellement dans le code**, à identifier les éventuelles ruptures de granularité, puis seulement à proposer les corrections minimales nécessaires.

La règle fondamentale à vérifier est :

> **Atome → propriété → opération**, et non uniquement **Atome → opération**.

Autrement dit, toute opération pertinente qui peut aujourd’hui viser un Atome entier doit, lorsque cela a du sens, pouvoir viser une **propriété précise** de cet Atome sans imposer une opération sur l’objet complet.

Exemples de propriétés : `name`, `content`, `position`, `size`, `color`, `opacity`, `owner`, `tags`, `metadata`, `permissions`, propriétés média, propriétés temporelles, propriétés applicatives, propriétés custom ou toute propriété ajoutée dynamiquement au framework.

Exemples d’opérations à vérifier : lecture, recherche, partage, autorisation, modification, synchronisation, historique, annulation, restauration, révocation, suppression logique ou physique, duplication, sérialisation, persistence, transmission réseau et conditions d’accès.

---

# 1. Principe directeur

L’audit doit déterminer si le framework considère réellement la **propriété comme une unité adressable**, et pas simplement comme un champ interne modifié au travers d’une opération globale sur l’Atome.

La présence d’un setter par propriété n’est **pas suffisante** pour conclure que la granularité est correcte.

La validation doit vérifier la chaîne complète :

**identification → lecture → mutation → contrôle d’accès → condition → propagation → synchronisation → persistence → historique → undo/redo → partage/révocation → observation → test**.

Une propriété n’est considérée comme réellement granulaire que si elle reste identifiable et manipulable comme unité distincte tout au long des couches concernées.

---

# 2. Questions principales auxquelles l’audit doit répondre

À la fin de l’analyse, fournir une réponse explicite et démontrée à chacune des questions suivantes.

1. Une propriété d’Atome possède-t-elle un **identifiant, un chemin, une clé ou une représentation canonique** permettant de la cibler indépendamment ?
2. Peut-on lire une propriété sans devoir exposer tout l’Atome lorsque le contexte de sécurité impose une lecture partielle ?
3. Peut-on modifier une propriété sans remplacer ou réécrire inutilement l’ensemble de l’Atome ?
4. Une modification de propriété est-elle représentée comme une opération distincte dans les systèmes d’événements, de patch, de diff, de transaction ou d’historique ?
5. Peut-on partager une propriété sans partager les autres propriétés du même Atome ?
6. Peut-on accorder à un tiers un droit de lecture sur une propriété A et un droit de modification sur une propriété B, tout en interdisant l’accès aux autres propriétés ?
7. Peut-on révoquer ces droits à la même granularité ?
8. Le nouveau module transverse de **conditions** peut-il s’appliquer à cette granularité, en entrée comme en sortie ?
9. Une condition peut-elle viser une propriété particulière, une opération particulière sur cette propriété, ou une combinaison des deux ?
10. Les opérations temps réel respectent-elles la même granularité ?
11. Le réseau transporte-t-il uniquement l’information nécessaire ou renvoie-t-il systématiquement tout l’Atome ?
12. Le système de persistence sauvegarde-t-il correctement les changements partiels ?
13. L’historique permet-il d’identifier quel champ a changé, quand, par qui et dans quel contexte ?
14. Peut-on annuler la modification d’une seule propriété sans annuler des changements indépendants effectués sur le reste de l’Atome ?
15. Peut-on restaurer une propriété depuis une version antérieure sans restaurer l’Atome complet ?
16. Les modifications concurrentes de deux propriétés différentes d’un même Atome peuvent-elles coexister sans conflit artificiel ?
17. Deux utilisateurs peuvent-ils modifier simultanément deux propriétés différentes sans provoquer un écrasement global ?
18. Le système sait-il détecter un conflit qui concerne réellement la **même propriété** ?
19. La granularité fonctionne-t-elle aussi avec les propriétés complexes : objets imbriqués, tableaux, listes, collections, structures média, valeurs temporelles, métadonnées et propriétés custom ?
20. Existe-t-il des endroits du framework où la granularité est perdue parce qu’une couche repasse à un modèle “objet complet” ?
21. Les API publiques et internes exposent-elles une sémantique cohérente pour cette granularité ?
22. Le comportement est-il identique entre local, persistence locale, serveur, temps réel et reconstruction après reload ?
23. La sécurité est-elle réellement appliquée côté autorité/serveur et pas uniquement filtrée dans l’UI ?
24. Les logs, audits et diagnostics permettent-ils de comprendre une opération effectuée sur une propriété précise ?
25. Les performances restent-elles acceptables quand la granularité est utilisée intensivement ?

---

# 3. Périmètre de l’audit

Explorer l’ensemble du framework concerné, y compris lorsque les responsabilités sont dispersées dans plusieurs modules.

## 3.1 Modèle Atome

Vérifier :

- définition d’un Atome ;
- définition et enregistrement des propriétés ;
- propriétés natives ;
- propriétés dynamiques/custom ;
- propriétés calculées/dérivées ;
- valeurs par défaut ;
- validation des valeurs ;
- setters/getters ;
- observers/listeners ;
- sérialisation/désérialisation ;
- clonage/duplication ;
- héritage éventuel ;
- relations entre Atomes ;
- références internes ;
- structures imbriquées.

Déterminer si la propriété est un concept de premier niveau dans l’architecture ou uniquement un détail de stockage.

## 3.2 Mutation

Identifier toutes les voies permettant de modifier une propriété :

- setter direct ;
- API générique ;
- patch ;
- transaction ;
- mutation via UI ;
- mutation via assistant ;
- mutation via automatisation ;
- mutation via script ;
- mutation réseau ;
- import ;
- restauration ;
- duplication ;
- synchronisation distante.

Vérifier que toutes ces voies passent par les mêmes règles fondamentales de validation, permissions, historique et notification.

Rechercher les mutations “sauvages” qui écrivent directement dans une structure interne et contournent le pipeline officiel.

## 3.3 Lecture

Vérifier les accès en lecture :

- API de lecture par propriété ;
- export ;
- recherche ;
- indexation ;
- communication ;
- partage ;
- UI ;
- assistant ;
- sync ;
- API distante.

Une propriété interdite ne doit pas être transmise puis simplement masquée graphiquement.

## 3.4 Partage

Auditer le mécanisme existant de partage.

Vérifier si l’unité de partage peut être :

- un Atome complet ;
- un groupe d’Atomes ;
- une propriété d’Atome ;
- plusieurs propriétés sélectionnées ;
- éventuellement un chemin imbriqué dans une propriété complexe si l’architecture le permet déjà.

Tester notamment :

- partager uniquement `content` ;
- partager `content` et `name` mais pas `owner` ;
- autoriser lecture de `content` mais modification de `color` ;
- révoquer uniquement l’accès à `color` ;
- laisser les autres droits inchangés.

## 3.5 Permissions / ACL / policies

Rechercher les mécanismes :

- owner ;
- groupes ;
- rôles ;
- ACL ;
- policies ;
- capabilities ;
- scopes ;
- règles conditionnelles ;
- tokens ;
- permissions héritées ;
- permissions explicites.

Déterminer la granularité maximale effectivement supportée.

Vérifier l’ordre de résolution lorsque plusieurs règles se superposent :

- règle globale ;
- règle Atome ;
- règle propriété ;
- règle utilisateur ;
- règle groupe ;
- règle contextuelle ;
- règle conditionnelle ;
- règle temporaire.

Documenter précisément la priorité réelle.

## 3.6 Module transverse de conditions

Le système de conditions doit pouvoir être utilisé comme une couche transverse commune aux modules concernés.

Vérifier qu’une condition peut intervenir pour :

- autoriser/refuser une lecture ;
- autoriser/refuser une modification ;
- autoriser/refuser un partage ;
- déterminer la visibilité ;
- lancer une action ;
- déclencher une automatisation ;
- filtrer une recherche ;
- filtrer des contacts ;
- limiter une communication ;
- contrôler un partage documentaire ;
- contrôler un partage de bureau ;
- contrôler un partage temps réel ;
- gérer les actions temporelles/calendrier ;
- appliquer des contraintes de localisation ;
- appliquer des contraintes de temporalité ;
- appliquer des contraintes liées au profil ;
- appliquer des contraintes métier ou applicatives.

La condition doit pouvoir être évaluée **pour une propriété précise**, pas uniquement pour l’Atome global.

Exemple :

- `content` lisible par tous ;
- `location` lisible uniquement pendant un événement ;
- `phone` partagé uniquement avec certains contacts ;
- `color` modifiable seulement par l’owner ;
- propriété média partagée uniquement en temps réel ;
- propriété X accessible seulement depuis une localisation donnée.

Vérifier que ces règles peuvent être appliquées sans dupliquer le moteur de conditions dans chaque module.

## 3.7 Temps réel

Examiner les mécanismes existants de partage/synchronisation temps réel.

Vérifier :

- type des messages ;
- taille des payloads ;
- identification de l’Atome ;
- identification de la propriété ;
- type d’opération ;
- ancienne valeur si nécessaire ;
- nouvelle valeur ;
- auteur ;
- timestamp ;
- version/révision ;
- contexte ;
- permissions ;
- conditions ;
- confirmation serveur ;
- rejet ;
- rollback ;
- resynchronisation après déconnexion.

Une modification de `color` ne devrait pas exiger l’envoi d’un snapshot complet de l’Atome sauf justification technique documentée.

## 3.8 Persistence

Auditer :

- IndexedDB / stockage local ;
- Cache API si impliqué ;
- base distante ;
- fichiers ;
- snapshots ;
- journal d’opérations ;
- sérialisation ;
- restauration de session.

Tester qu’une modification partielle :

1. est persistée ;
2. survit à un reload ;
3. n’écrase pas une modification indépendante ;
4. conserve les métadonnées nécessaires ;
5. respecte les droits et conditions.

## 3.9 Historique / versionnement

Déterminer le modèle réel :

- snapshot global ;
- diff ;
- patch ;
- event sourcing ;
- command history ;
- autre.

Vérifier que l’historique peut répondre à :

- quelle propriété a changé ?
- ancienne valeur ?
- nouvelle valeur ?
- auteur ?
- date/heure ?
- origine de l’opération ?
- transaction associée ?
- possibilité de rollback ?

L’historique global par snapshots peut être acceptable techniquement, mais il doit malgré tout permettre de reconstruire une opération de propriété avec une granularité suffisante pour l’undo, la sécurité et le diagnostic.

## 3.10 Undo / Redo / Annulation

C’est un point critique.

Tester au minimum :

### Cas A — modifications indépendantes

1. `color = red`
2. `position = [100, 200]`
3. annuler la modification de `color`

Résultat attendu :

- `color` revient à sa valeur précédente ;
- `position` reste `[100, 200]`.

### Cas B — deux utilisateurs

Utilisateur A modifie `color`.
Utilisateur B modifie `position`.

L’annulation de la modification de A ne doit pas supprimer la modification de B.

### Cas C — même propriété

A modifie `color` de blanc → rouge.
B modifie ensuite `color` rouge → bleu.

Tester la stratégie de version/conflit et documenter le résultat attendu.

### Cas D — transaction multi-propriétés

Une opération métier modifie volontairement plusieurs propriétés comme une unité atomique.

Vérifier qu’il est possible de distinguer :

- une opération unique portant sur plusieurs propriétés ;
- plusieurs opérations indépendantes.

Ne pas casser la notion de transaction sous prétexte de granularité fine.

## 3.11 Suppression / Reset / Nullification

Distinguer :

- supprimer un Atome ;
- supprimer une propriété custom ;
- remettre une propriété à sa valeur par défaut ;
- mettre une valeur à `null` ;
- retirer une valeur facultative ;
- supprimer un élément d’une collection contenue dans une propriété.

Vérifier que ces opérations sont correctement historisées, partagées et synchronisées.

## 3.12 Recherche et indexation

Le framework doit permettre de rechercher selon les propriétés sans compromettre les permissions.

Vérifier :

- indexation par propriété ;
- recherche sur propriété ;
- filtres ;
- conditions ;
- visibilité ;
- absence de fuite via index ou autocomplete ;
- absence de fuite via nombre de résultats ;
- cohérence après modification granulaire.

## 3.13 Communication / contacts / profil

Vérifier que les modules de communication et contacts peuvent exploiter la granularité propriété par propriété.

Exemples :

- partager le nom mais pas le téléphone ;
- partager une photo mais pas la localisation ;
- partager certaines coordonnées avec un groupe déterminé ;
- rendre une propriété visible pendant une période ;
- rendre une propriété visible uniquement à certains contacts.

## 3.14 Calendrier / actions temporelles

Vérifier que les propriétés peuvent être :

- lues ;
- modifiées ;
- exposées ;
- déclenchées ;
- masquées ;
- restaurées ;

selon une condition temporelle.

Une règle temporelle ne doit pas imposer une copie parallèle de l’Atome si le moteur de conditions suffit.

---

# 4. Granularité des structures complexes

Ne pas limiter l’audit aux propriétés scalaires.

Tester plusieurs catégories.

## 4.1 Valeur simple

Exemples :

- nombre ;
- texte ;
- booléen ;
- couleur ;
- enum.

## 4.2 Objet imbriqué

Exemple :

```text
transform.position.x
transform.position.y
transform.rotation
```

Déterminer si la granularité s’arrête à `transform` ou peut descendre à un sous-chemin.

Ne pas imposer une granularité infra-propriété si le framework ne la prévoit pas. En revanche, **documenter clairement la frontière réelle**.

## 4.3 Collections

Exemples :

- tags ;
- participants ;
- markers ;
- automation points ;
- children ;
- médias ;
- permissions.

Tester :

- ajout ;
- retrait ;
- modification d’un élément ;
- réorganisation ;
- concurrent edits.

## 4.4 Média

Tester les propriétés qui référencent :

- audio ;
- vidéo ;
- image ;
- waveform ;
- MIDI ;
- fichiers ;
- ressources distantes.

Distinguer le partage de la **référence/métadonnée** du partage du **contenu binaire réel**.

## 4.5 Propriétés calculées

Vérifier si elles sont :

- partageables ;
- persistées ou recalculées ;
- modifiables ou read-only ;
- historisées ;
- filtrables par permissions.

---

# 5. Modèle conceptuel attendu

Ne pas forcer le code à adopter exactement cette représentation, mais vérifier que l’architecture possède un équivalent conceptuel.

Une opération granulaire devrait pouvoir être représentée par des informations proches de :

```text
atom_id
property_path
operation
value
previous_value      # si nécessaire
actor
origin
permissions_context
conditions_context
timestamp
revision
transaction_id      # facultatif
correlation_id      # facultatif
```

Exemple conceptuel :

```text
atom: abc123
property: color
operation: update
from: #ffffff
to: #ff0000
actor: user42
revision: 183
```

Ce modèle n’est pas une prescription d’implémentation. Il sert de **grille de lecture** pour repérer si certaines couches perdent l’information “quelle propriété est concernée”.

---

# 6. Recherche profonde dans le code

Effectuer une recherche structurée, pas une inspection superficielle.

## 6.1 Cartographier avant de conclure

Commencer par identifier :

- le cœur du modèle Atome ;
- les registries de propriétés ;
- les helpers de mutation ;
- les handlers d’événements ;
- les systèmes de commandes ;
- les services de partage ;
- les services de permission ;
- les modules de conditions ;
- les transports réseau ;
- la persistence ;
- l’historique ;
- l’undo/redo ;
- les systèmes de sync ;
- les tests existants.

Construire ensuite une carte de dépendances simple.

## 6.2 Rechercher les termes et concepts pertinents

Adapter les recherches au nommage réel du projet.

Chercher notamment les équivalents de :

```text
atom
property
attribute
particle
set
update
patch
change
mutation
command
transaction
history
undo
redo
rollback
share
sharing
permission
acl
policy
capability
condition
filter
visibility
access
sync
realtime
broadcast
message
event
observer
watch
serialize
persist
save
load
revision
version
diff
snapshot
owner
scope
```

Ne pas se contenter du nom des fonctions : suivre les appels jusqu’au stockage et au transport.

## 6.3 Rechercher les anti-patterns

Identifier explicitement :

- remplacement d’objet complet pour un changement local ;
- permissions seulement au niveau Atome ;
- UI qui masque une propriété sans filtrage serveur ;
- historique par snapshot incapable d’un undo local ;
- écrasement “last full object wins” ;
- broadcast de l’Atome entier ;
- sérialisation complète systématique ;
- copie locale non versionnée ;
- bypass des setters ;
- mutations directes de structures internes ;
- double moteur de permission ;
- double moteur de conditions ;
- traitements spéciaux codés en dur pour quelques propriétés ;
- logique différente entre local et distant ;
- logique différente entre UI et API ;
- règles de sécurité uniquement côté client ;
- conflit déclenché sur tout l’Atome au lieu de la propriété ;
- undo global destructif ;
- index de recherche contenant des données interdites.

---

# 7. Scénarios de validation obligatoires

Créer ou exécuter des tests réels correspondant au framework.

Les noms de propriétés ci-dessous peuvent être remplacés par des propriétés natives pertinentes.

## Test 1 — Lecture d’une propriété

Créer un Atome contenant plusieurs propriétés.
Lire uniquement `color`.

Valider qu’il existe une API ou un mécanisme propre pour cibler cette propriété.

## Test 2 — Modification d’une seule propriété

Modifier `color`.

Vérifier :

- aucune autre valeur altérée ;
- événement granulaire ;
- persistence correcte ;
- historique correct ;
- propagation correcte.

## Test 3 — Deux propriétés successives

Modifier `color`, puis `position`.

Vérifier que le framework garde deux opérations distinctes lorsque ce sont réellement deux opérations distinctes.

## Test 4 — Undo local

Annuler `color` sans annuler `position`.

## Test 5 — Redo local

Refaire `color` sans toucher `position`.

## Test 6 — Partage partiel

Utilisateur A possède l’Atome.
Utilisateur B reçoit l’accès à `content` uniquement.

B :

- peut lire `content` ;
- ne peut pas lire les propriétés interdites ;
- ne reçoit pas les données interdites dans le payload ;
- ne peut pas contourner la restriction par API directe.

## Test 7 — Modification partagée

B obtient :

- lecture sur `content` ;
- modification sur `color` ;
- aucun accès sur `owner`.

Vérifier les trois comportements séparément.

## Test 8 — Révocation granulaire

Révoquer la modification de `color` sans révoquer la lecture de `content`.

## Test 9 — Condition temporelle

Autoriser la lecture de `location` uniquement pendant une fenêtre temporelle.

Valider avant / pendant / après.

## Test 10 — Condition de profil / relation

Autoriser une propriété uniquement à un type de contact ou profil déterminé par le moteur existant.

## Test 11 — Temps réel

A modifie `color`.
B reçoit uniquement le changement autorisé.

Inspecter réellement le message envoyé.

## Test 12 — Reconnexion

Déconnecter B, modifier une propriété, reconnecter B.

Vérifier la resynchronisation et le filtrage de droits.

## Test 13 — Reload

Modifier deux propriétés, recharger l’application, vérifier l’état exact.

## Test 14 — Concurrence sur propriétés différentes

A modifie `color`.
B modifie `position` presque simultanément.

Résultat : les deux changements doivent survivre sauf contrainte architecturale explicitement justifiée.

## Test 15 — Concurrence sur la même propriété

A et B modifient `color`.

Documenter la stratégie réelle : ordre serveur, version, CRDT, lock, last-write-wins, rejet, merge ou autre.

## Test 16 — Propriété complexe

Modifier un élément interne d’une collection ou d’un objet imbriqué.

Documenter la frontière de granularité réellement supportée.

## Test 17 — Propriété custom

Ajouter une propriété utilisateur/custom puis vérifier qu’elle bénéficie du même pipeline que les propriétés natives.

C’est essentiel : la granularité ne doit pas dépendre d’une liste codée en dur de propriétés connues.

## Test 18 — Recherche

Interdire à B une propriété indexée.

Vérifier qu’une recherche ne révèle ni la valeur ni indirectement son existence si cela constitue une fuite.

## Test 19 — Export / sérialisation

Exporter un Atome dans un contexte où certaines propriétés sont interdites.

Vérifier le filtrage.

## Test 20 — Suppression ou reset d’une propriété

Effectuer un reset/suppression autorisée d’une propriété et vérifier historique, sync, undo et persistence.

## Test 21 — Transaction multi-propriétés

Effectuer une action métier qui modifie volontairement plusieurs propriétés de façon atomique.

Vérifier que la granularité fine ne détruit pas la cohérence transactionnelle.

## Test 22 — Rejet serveur

Simuler une modification locale optimiste d’une propriété refusée par le serveur ou le moteur d’autorisation.

Vérifier rollback et cohérence UI.

## Test 23 — Changement de permissions pendant une session

B visualise une propriété.
A révoque le droit.

Vérifier :

- future lecture interdite ;
- événements temps réel corrects ;
- cache local traité correctement selon la politique prévue ;
- absence de nouvelles fuites.

## Test 24 — Condition modifiée dynamiquement

Modifier une condition transverse et vérifier que les accès aux propriétés se recalculent correctement.

---

# 8. Vérification de sécurité

Ne jamais conclure qu’une permission fonctionne simplement parce que l’interface ne montre pas la propriété.

Tester les couches d’autorité.

Vérifier :

- accès direct à l’API ;
- messages réseau ;
- cache ;
- historique ;
- recherche ;
- export ;
- logs ;
- notifications ;
- erreurs ;
- payloads de sync.

Une propriété interdite ne doit pas être exposée dans une réponse puis supprimée par l’UI.

Vérifier également les attaques logiques :

- modifier `property_path` dans une requête ;
- réutiliser un token autorisé sur une autre propriété ;
- changer l’`atom_id` ;
- rejouer une ancienne opération ;
- modifier une revision ;
- tenter un patch multi-propriétés contenant une propriété interdite ;
- contourner une condition locale ;
- forcer un message temps réel fabriqué manuellement.

Le système doit définir clairement la politique lorsqu’une opération multi-propriétés contient un mélange de propriétés autorisées et interdites : rejet global, filtrage partiel ou autre. Le comportement doit être intentionnel et testé.

---

# 9. Cohérence avec le concept Atome

La granularité doit rester cohérente avec la philosophie du framework.

Ne pas ajouter une seconde représentation parallèle si l’Atome et ses propriétés fournissent déjà les primitives nécessaires.

Favoriser :

- une primitive commune ;
- des chemins de propriétés cohérents ;
- un pipeline unique de mutation ;
- un moteur unique de permissions ;
- un moteur transverse de conditions ;
- un historique commun ;
- des transports génériques ;
- des APIs composables.

Éviter :

- logique spéciale “sharing_property” indépendante ;
- logique spéciale “undo_property” indépendante ;
- logique spéciale par module ;
- listes de propriétés codées en dur ;
- duplication entre recherche, communication, partage et calendrier.

---

# 10. Performance

La granularité fine ne doit pas introduire une explosion incontrôlée du coût système.

Mesurer ou au minimum inspecter :

- nombre d’événements ;
- nombre de messages réseau ;
- taille moyenne des payloads ;
- coût d’indexation ;
- coût de l’historique ;
- coût des conditions ;
- coût des permissions ;
- coût d’observation ;
- fréquence de persistence ;
- batching éventuel ;
- transactions ;
- coalescing/debounce si pertinent.

Tester un scénario de nombreuses modifications rapides d’une même propriété, par exemple position pendant un drag.

Vérifier que le framework peut regrouper les opérations lorsque nécessaire **sans perdre la sémantique granulaire**.

Exemple : un drag peut produire de nombreux changements intermédiaires mais une seule étape Undo métier.

---

# 11. Compatibilité avec l’UI

Même si la mission porte principalement sur le framework, vérifier que la granularité peut être exploitée simplement par l’UI eVe.

L’UI ne doit pas avoir à connaître la complexité interne du stockage.

Elle devrait pouvoir exprimer conceptuellement :

```text
share(atom, property, target, permission, conditions)
update(atom, property, value)
undo(operation)
revoke(atom, property, target)
```

ou un équivalent cohérent avec les APIs existantes.

Ne pas imposer de nouvelle UI dans cette tâche sauf si une lacune architecturale rend la granularité impossible à exposer proprement.

---

# 12. Méthode d’audit exigée

Suivre cet ordre.

## Phase 1 — Inventaire

Lister les fichiers/modules/classes/fonctions responsables de chaque brique.

## Phase 2 — Traçage

Choisir une propriété simple et suivre une modification de bout en bout :

UI/API → modèle → validation → permissions → conditions → événement → persistence → réseau → historique → observers.

## Phase 3 — Contre-exemples

Chercher activement où la granularité est perdue.

Ne pas chercher uniquement à confirmer que l’architecture est correcte.

## Phase 4 — Tests

Exécuter ou créer les tests nécessaires.

## Phase 5 — Classification

Pour chaque domaine, utiliser l’un des statuts :

- **CONFORME** : implémentation complète et démontrée ;
- **PARTIELLEMENT CONFORME** : concept présent mais une ou plusieurs couches cassent la granularité ;
- **NON CONFORME** : granularité absente ou insuffisante ;
- **NON APPLICABLE** : justification obligatoire ;
- **NON VÉRIFIABLE** : information ou environnement manquant, avec explication précise.

## Phase 6 — Corrections minimales

Seulement après l’audit, proposer les corrections nécessaires.

Priorité absolue : **réutiliser les primitives existantes**.

## Phase 7 — Re-test

Toute correction doit être suivie des tests de non-régression correspondants.

---

# 13. Preuves obligatoires

Aucune conclusion “ça semble fonctionner”.

Chaque affirmation importante doit être accompagnée d’une preuve parmi :

- chemin de fichier ;
- fonction/méthode ;
- extrait de code court ;
- test existant ;
- test ajouté ;
- résultat d’exécution ;
- payload réseau observé ;
- état de base avant/après ;
- log pertinent ;
- diagramme de flux basé sur le code réel.

Pour les conclusions négatives, montrer l’endroit où la granularité est perdue.

Exemple :

```text
UI update(color)
  → set_property(atom_id, "color", value)
  → emits property_changed(atom_id, "color")
  → history stores property path
  → realtime sends patch {atom_id, path:"color", value}
  → persistence updates revision
```

ou, en cas de problème :

```text
set_property(atom_id, "color", value)
  → serialize_entire_atom()
  → broadcast_entire_atom()
  → remote replaces local object
```

Ce deuxième cas doit être signalé comme risque potentiel de perte de granularité/concurrence, même si le résultat visuel semble correct.

---

# 14. Matrice finale de conformité

Produire un tableau final au minimum avec ces colonnes :

| Domaine | Granularité propriété | Preuve | Risque | Statut | Correction requise |
|---|---|---|---|---|---|
| Modèle | | | | | |
| Lecture | | | | | |
| Mutation | | | | | |
| Validation | | | | | |
| Permissions | | | | | |
| Conditions | | | | | |
| Partage | | | | | |
| Révocation | | | | | |
| Temps réel | | | | | |
| Persistence | | | | | |
| Historique | | | | | |
| Undo | | | | | |
| Redo | | | | | |
| Concurrence | | | | | |
| Recherche | | | | | |
| Export | | | | | |
| Collections | | | | | |
| Propriétés custom | | | | | |
| Sécurité | | | | | |
| Performance | | | | | |
| UI/API | | | | | |

---

# 15. Critères d’acceptation globaux

La tâche est considérée comme validée uniquement si les points suivants sont démontrés.

## Obligatoire

- Une propriété est adressable indépendamment de l’Atome.
- Une mutation de propriété passe par un pipeline identifiable et cohérent.
- Les permissions peuvent être appliquées à une propriété.
- Le partage peut cibler une propriété.
- La révocation peut cibler la même propriété sans casser les autres droits.
- Les conditions transverses peuvent agir à ce niveau de granularité.
- Les opérations temps réel préservent l’information de propriété.
- La persistence conserve correctement les changements partiels.
- L’historique permet d’identifier une modification de propriété.
- Undo/Redo peut restaurer une propriété sans écraser des changements indépendants.
- Les modifications concurrentes de propriétés différentes ne produisent pas d’écrasement global injustifié.
- Les propriétés custom utilisent le même mécanisme général.
- La sécurité est appliquée dans la couche autoritaire et pas uniquement dans l’UI.
- Les tests automatisés couvrent les scénarios critiques.

## Fortement recommandé

- Les messages réseau utilisent des patchs ou opérations fines lorsque pertinent.
- Les traitements peuvent être batchés pour les changements haute fréquence.
- Les transactions multi-propriétés restent possibles.
- Les structures imbriquées possèdent une frontière de granularité clairement définie.
- L’audit fournit une cartographie claire des couches concernées.

---

# 16. Définitions importantes

## Granularité basse

Capacité du framework à identifier, contrôler et manipuler une unité plus fine que l’Atome complet, au minimum **une propriété individuelle**.

## Propriété

Toute donnée, attribut, relation, métadonnée ou valeur fonctionnelle rattachée à un Atome et reconnue par le framework.

## Opération granulaire

Opération dont la cible contient explicitement ou implicitement une propriété déterminée et dont les effets restent limités à cette cible sauf dépendance volontaire.

## Partage granulaire

Possibilité d’accorder un accès à une propriété sans accorder automatiquement le même accès à toutes les autres propriétés de l’Atome.

## Undo granulaire

Possibilité de renverser une opération précise sans supprimer les modifications indépendantes intervenues avant ou après sur d’autres propriétés.

---

# 17. Points de vigilance spécifiques

## 17.1 Ne pas confondre API granulaire et stockage granulaire

Il est acceptable qu’un backend sauvegarde parfois un document complet pour des raisons techniques, **si et seulement si** :

- la sémantique de propriété est préservée ;
- les conflits sont correctement gérés ;
- l’historique reste fin ;
- les droits restent fins ;
- aucun changement indépendant n’est écrasé.

Le stockage physique n’a donc pas obligatoirement besoin d’être propriété-par-propriété.

## 17.2 Ne pas confondre snapshot et absence de granularité

Un snapshot complet peut coexister avec des opérations granulaires.

Vérifier la sémantique réelle avant de conclure.

## 17.3 Ne pas sur-engineerer

Si le système est déjà conforme, ne pas introduire :

- CRDT inutile ;
- event sourcing complet inutile ;
- nouveau permission engine ;
- nouvelle couche de patch ;
- nouveau protocole réseau.

Documenter et tester l’existant suffit.

## 17.4 Ne pas casser les opérations atomiques métier

Une opération utilisateur peut légitimement modifier plusieurs propriétés comme un tout.

La granularité basse doit permettre cette composition, pas l’interdire.

## 17.5 Distinguer permission et condition

Une permission répond à “qui peut faire quoi”.
Une condition ajoute “dans quelles circonstances”.

Les deux doivent pouvoir se composer sans duplication.

---

# 18. Tests de non-régression à conserver

Créer une suite permanente couvrant au minimum :

1. property read ;
2. property update ;
3. property undo ;
4. property redo ;
5. independent property concurrent updates ;
6. same-property conflict ;
7. property-level read permission ;
8. property-level write permission ;
9. property-level share ;
10. property-level revoke ;
11. condition allowed ;
12. condition denied ;
13. realtime propagation ;
14. offline/reconnect ;
15. persistence/reload ;
16. custom property ;
17. collection property ;
18. forbidden API bypass ;
19. export filtering ;
20. transaction involving multiple properties.

Les tests doivent utiliser autant que possible les APIs publiques du framework, afin d’éviter de valider uniquement des helpers internes non représentatifs de l’utilisation réelle.

---

# 19. Livrables attendus

Produire à la fin de la mission :

## A. Rapport d’audit

Contenant :

- architecture observée ;
- parcours d’une modification ;
- parcours d’un partage ;
- parcours d’un undo ;
- fonctionnement des conditions ;
- zones conformes ;
- zones partielles ;
- zones non conformes ;
- risques ;
- décisions proposées.

## B. Matrice de conformité

Tableau complet défini plus haut.

## C. Liste des preuves

Pour chaque conclusion importante : fichier, méthode, test ou résultat.

## D. Tests

Tests existants identifiés + tests ajoutés.

## E. Correctifs minimaux

Uniquement si nécessaires.

Pour chaque correctif :

- problème ;
- cause racine ;
- changement proposé ;
- fichiers impactés ;
- compatibilité ;
- risque ;
- test correspondant.

## F. Verdict final

Fournir une conclusion courte et non ambiguë :

```text
GRANULARITY VALIDATION: PASS
```

ou

```text
GRANULARITY VALIDATION: PARTIAL
```

ou

```text
GRANULARITY VALIDATION: FAIL
```

Puis expliquer les raisons en quelques points.

---

# 20. Format du verdict détaillé

Utiliser cette structure :

```markdown
# Granularity Validation Report

## Verdict
PASS / PARTIAL / FAIL

## Résumé
...

## Architecture observée
...

## Chemin d’une mutation de propriété
...

## Chemin d’un partage de propriété
...

## Permissions
...

## Conditions
...

## Realtime
...

## Persistence
...

## Historique / Undo / Redo
...

## Concurrence
...

## Sécurité
...

## Performance
...

## Propriétés custom et structures complexes
...

## Tests exécutés
...

## Matrice de conformité
...

## Problèmes trouvés
...

## Corrections réalisées ou proposées
...

## Risques restants
...

## Conclusion
...
```

---

# 21. Priorité des problèmes

Classer chaque problème :

### P0 — Critique

- fuite de données ;
- permission contournable ;
- perte de données ;
- undo détruisant des changements d’un autre utilisateur ;
- écrasement massif lors de concurrence.

### P1 — Haute

- partage propriété impossible ;
- conditions impossibles au niveau propriété ;
- historique insuffisant ;
- sync incohérente ;
- properties custom hors pipeline.

### P2 — Moyenne

- API incohérente ;
- payload inutilement complet ;
- duplication de logique ;
- tests manquants ;
- performance perfectible.

### P3 — Faible

- nomenclature ;
- documentation ;
- ergonomie développeur ;
- dette technique sans impact fonctionnel immédiat.

---

# 22. Contraintes de réalisation

- Ne pas réécrire le framework sans preuve qu’une réécriture est nécessaire.
- Ne pas ajouter une dépendance ou une abstraction majeure pour résoudre un problème local.
- Respecter l’architecture et les conventions déjà en place.
- Réutiliser les systèmes existants de propriété, événement, condition, permission, partage, historique et temps réel.
- Ne pas considérer une simple inspection visuelle comme une validation.
- Ne pas masquer un défaut en ajoutant une exception spécifique à une propriété.
- Ne pas limiter la validation aux propriétés actuellement visibles dans l’UI.
- Tester au moins une propriété custom ou dynamique.
- Tester les opérations localement et dans le chemin distant lorsque le framework possède ces deux modes.
- Préserver la compatibilité avec les fonctionnalités existantes.

---

# 23. Question architecturale finale

À la fin, répondre explicitement à cette question :

> **Dans Atome/eVe, une propriété est-elle réellement une unité de données adressable, sécurisable, partageable, modifiable, synchronisable, historisable et annulable indépendamment, ou certaines couches retombent-elles encore sur une logique d’Atome complet ?**

La réponse doit être fondée sur le code et les tests, pas sur l’intention architecturale.

---

# 24. Résultat attendu idéal

Le résultat idéal de cet audit serait de confirmer que le framework possède déjà une architecture générique dans laquelle :

```text
Atome
  └── Property
       ├── value
       ├── permissions
       ├── conditions
       ├── observers
       ├── history
       ├── sync
       └── operations
```

ou un équivalent fonctionnel, sans nécessairement employer cette représentation interne.

Dans ce cas, la tâche consiste principalement à :

1. documenter le mécanisme réel ;
2. combler les tests manquants ;
3. corriger les rares couches qui perdraient le `property_path` ;
4. vérifier l’intégration avec le module transverse de conditions ;
5. déclarer la granularité validée.

Si au contraire certaines couches travaillent encore uniquement au niveau de l’Atome complet, proposer **la correction la plus locale et la plus générique possible**, afin que la propriété devienne une cible de premier ordre sans dupliquer les systèmes existants.

---

# 25. Instruction finale à l’agent chargé de la tâche

**Ne pars pas du principe que le système est correct simplement parce qu’il a été conçu pour l’être. Ne pars pas non plus du principe qu’il faut le refaire.**

Commence par cartographier et prouver.

Cherche activement les ruptures de granularité entre les différentes couches.

Teste les cas difficiles : permissions partielles, partage partiel, révocation, conditions, undo local, concurrence, propriétés custom, collections, temps réel, reload et sécurité.

Si tout est déjà conforme, la meilleure sortie est un audit démontrant clairement que **rien de majeur n’est à changer**.

Si un défaut existe, corrige uniquement ce qui est nécessaire pour garantir partout la règle :

> **Atome → propriété → opération**

avec conservation de la possibilité de regrouper plusieurs propriétés dans une transaction lorsque l’opération métier le justifie.

---

# 26. Verified baseline and mandatory correction specification

This section converts the audit performed on **2026-08-13** into an executable correction specification. It is authoritative for the implementation work that follows. Earlier sections define the intended behavior; this section records the behavior actually observed, the confirmed gaps, the required correction order, and the evidence needed to declare completion.

## 26.1 Current verdict

> **GRANULARITY VALIDATION: FAIL**

The persistence, mutation, and history foundations already carry property-level data. The end-to-end security contract does not yet preserve that granularity across authorization, sharing, reads, realtime delivery, synchronization, deletion, restoration, and undo.

The failure is not theoretical. Focused executable probes demonstrated both:

- an unauthorized property write accepted through the canonical event commit route;
- disclosure of an unauthorized property in a realtime event sent to a principal with access to only one other property.

Therefore, the current implementation must not be described as property-secure until every blocking gate in this section is satisfied.

## 26.2 What is already integrated and must be preserved

| Capability | Current implementation evidence | Current status |
|---|---|---|
| Property persistence | `database/schema.sql` stores logical properties in `particles`, with version metadata | `CONFORME` at storage level |
| Property version history | `particles_versions` records previous/new values, actor, and time | `CONFORME` at storage level |
| Property mutation primitives | `database/adole.js` exposes `setParticle`, `getParticle`, and `restoreParticleVersion` | `PARTIEL` because some operations bypass the canonical event path |
| Event payload granularity | Events carry `payload.props`, `tx_id`, and `gesture_id` | `CONFORME` as a data representation |
| Current-state projection | `applyEventToStateCurrent` applies partial property merges | `CONFORME` for ordinary partial updates |
| Atomic multi-property commits | `commitBatch` uses a database transaction | `CONFORME` as a transaction primitive |
| Durable synchronization queue | `database/adole_sync.js` persists event payloads for synchronization | `CONFORME` as a queue primitive |
| Property-aware ACL schema | Permission rows include `particle_key` | `CONFORME` at schema level |
| Property-aware ACL lookup | `database/adole_permissions.js` can evaluate a permission for a specific property and orders specific rules before global rules | `PARTIEL` because not every ingress and egress uses it |
| Conditional ACL basis | A condition evaluator exists in `database/adole_permissions.js` | `NON CONFORME` because unsupported nodes currently fail open and use is not transverse |
| Custom properties | Arbitrary property keys can pass through the data model | `PARTIEL` pending security and lifecycle parity |
| Transaction/gesture history grouping | `database/adole_history_transactions.js` groups history by transaction and gesture | `CONFORME` as a grouping primitive |
| Public canonical commit boundary | `window.Atome.commit` and `window.Atome.commitBatch` exist in `eVe/core/atome_commit.js` | `PARTIEL` because server authorization is incomplete |
| Property-scoped sharing input | The unified sharing API accepts `particle_key` | `NON CONFORME` end to end because persistence may widen it to a global row |

These foundations must be extended or routed correctly. They must not be replaced by a second state engine, a parallel permission engine, a DOM-owned authority, a fallback renderer, or a competing mutation path.

## 26.3 Confirmed defects to correct

### GV-P0-001 — Canonical commit accepts unauthorized property writes

**Observed path**

- `server/wsAtomeOperations.js` forwards `events:commit` to `commitAtomeEvent`.
- `server/atomeRoutes.orm.js` authenticates the actor in `commitAtomeEvent`, then calls `db.appendEvent()` without proving ownership or write permission for every touched property key.

**Executable evidence**

A reader granted read access to `content`, with no write access to `color`, successfully committed `color = "black"`. The persisted result was:

```text
unauthorizedCommitOk: true
resultingColor: black
```

**Required correction**

1. Extract the complete normalized set of touched property keys before persistence.
2. Resolve ownership and property write authorization for every key on the server.
3. Reject the entire event or batch atomically if any key is unauthorized.
4. Perform authorization and append within a transaction boundary that prevents time-of-check/time-of-use permission races.
5. Apply the same rule to built-in, custom, clear/reset, delete, restore, undo, redo, import, and synchronized mutations.
6. Never trust a client-provided authorization result.

**Exit criterion**

No unauthorized key is written, no event or partial projection is persisted, and no sync item is queued when any key in the request is denied.

### GV-P0-002 — Realtime delivery leaks unauthorized properties

**Observed path**

- `server/wsSyncSecurity.js` determines eligibility using an Atome-level readable permission row.
- `redactAtomeEvent` returns the full Atome/event payload after that coarse decision.
- `server/atomeRealtime.js` broadcasts whole patches to recipients selected at Atome level.

**Executable evidence**

A principal with read access only to `content` received both `content` and an unauthorized `secret` property:

```text
content: allowed
secret: leaked
```

**Required correction**

1. Compute readable property keys per recipient on the server.
2. Project event payloads, full snapshots, catch-up responses, reconnect payloads, and acknowledgements through the same canonical read policy.
3. Remove denied keys completely; do not replace them with `null`, placeholders, metadata, or existence hints.
4. Suppress an event entirely when its authorized projection is empty.
5. Apply conditions and revocation state at delivery time.

**Exit criterion**

Each recipient receives only the authorized projection, including during live broadcast, backlog replay, reconnect, and permission revocation.

### GV-P0-003 — Property-targeted sharing can widen an existing global ACL row

**Observed path**

`server/sharingPermissionService.js` searches for an existing permission with:

```sql
particle_key IS NULL OR particle_key = ?
```

It can then update the global row without changing `particle_key`. A request targeting `color` was observed to persist `particle_key = NULL` with write permission enabled.

**Required correction**

1. Treat `(atome_id, principal_id, particle_key)` as the exact permission identity.
2. Treat `particle_key = NULL` only as an explicit Atome-wide rule.
3. Never reuse or mutate a global row to satisfy a property-scoped grant.
4. Define deterministic precedence for exact property, explicit global, deny, condition, and ownership rules in the canonical permission owner.
5. Make grant, update, revoke, list, and audit operations preserve the exact scope.

**Exit criterion**

A grant or revoke for one property cannot expand, shrink, or mutate any other property or global permission row.

### GV-P0-004 — Unsupported permission conditions fail open

**Observed path**

`evaluateConditionNode()` in `database/adole_permissions.js` returns success for an unknown condition node. A permission containing `conditions: { unsupported_rule: true }` granted access.

**Required correction**

1. Unknown, malformed, unavailable, or errored conditions must deny access.
2. Use one canonical condition evaluation contract across read, write, share, sync, search, export, history, and observation.
3. Validate condition schemas when grants are created and re-evaluate dynamic conditions when access is exercised.
4. Return stable machine-readable denial reasons without revealing protected values.

**Exit criterion**

Every unsupported or invalid condition is rejected at creation or evaluates to deny at use; no domain can bypass the condition decision.

### GV-P1-005 — Authenticated legacy routes bypass property authorization

**Observed paths**

- `GET /api/events` in `server/atomeEventRoutes.js` authenticates the request but does not filter events by readable property.
- `GET /api/state_current/:id` authenticates the request but returns state without property projection.
- WebSocket handlers in `server/server.js` for `set-particle`, `get-particle`, and `delete-particle` do not consistently enforce per-key permission checks.

**Required correction**

1. Inventory every active ingress and egress that can mutate or reveal Atome data.
2. Retire obsolete application HTTP paths when the canonical architecture requires WebSocket-only application communication.
3. Route retained handlers to the existing canonical authorization, mutation, and projection owners.
4. Do not add a new REST mutation surface, a compatibility bypass, or test-only product API.
5. Move focused ownership out of oversized legacy entry files when necessary; do not grow `server/server.js` with another local policy implementation.

**Exit criterion**

No active route can read, write, delete, restore, observe, search, export, or synchronize a property without the same canonical property decision.

### GV-P1-006 — Delete and restore bypass canonical event semantics

**Observed paths**

- `deleteParticle()` performs a direct delete.
- `restoreParticleVersion()` calls `setParticle()` directly.

These paths do not guarantee the same event log, history, synchronization, authorization, and undo semantics as canonical commits.

**Required correction**

Represent delete, clear, and restore as explicit canonical property operations. Persist their event, version, state projection, audit identity, and sync effect atomically. A deleted value must remain reconstructable according to retention policy without remaining readable to unauthorized principals.

**Exit criterion**

Delete, clear, and restore have full authorization, event, history, replay, sync, and undo/redo parity with set.

### GV-P1-007 — Undo can overwrite unrelated concurrent property changes

**Observed path**

`eVe/core/atome_timeline_commit.js` rebuilds a snapshot-style payload. `buildPayloadWithClears()` clears current keys missing from the restored snapshot, so an independent later change can be overwritten.

**Required correction**

1. Build undo/redo from the exact inverse property operations associated with the target transaction or gesture.
2. Preserve unrelated properties and later authorized changes.
3. Re-authorize the inverse operation at execution time.
4. Detect revision conflicts and return an explicit conflict instead of silently replacing newer state.
5. Keep multi-property business transactions atomic without turning them into whole-Atome snapshots.

**Exit criterion**

Undoing a change to property A never changes property B unless B belonged to the same explicitly grouped transaction.

### GV-P1-008 — Reads, history, synchronization, search, and export are not proven property-safe

**Observed gaps**

- Event/history filtering is primarily Atome-level.
- `syncAtomeViaWebSocket()` can emit a fully formatted current Atome.
- Search/index result projection has no demonstrated property ACL enforcement.
- Export has no demonstrated partially shared projection.
- Reconnection, revocation, and offline replay have no complete property-isolation proof.

**Required correction**

All outbound data domains must call the same read-policy and projection contract. This includes current state, individual particles, event history, audit views, observers, search hits and snippets, exports, snapshots, sync queues, replay, reconnect, and error metadata.

**Exit criterion**

The mandatory scenario matrix in section 26.8 passes for every outbound domain.

### GV-P2-009 — Nested and collection granularity boundaries are undefined

The current model treats complex JSON values as one logical property. That may be valid, but the boundary must be explicit and consistent.

**Required correction**

Document whether a nested path or collection element is independently addressable. Until a canonical finer contract exists, authorize and version the entire logical property value; never imply sub-property isolation that is not enforced. Do not introduce ad hoc dotted-path semantics in one subsystem.

**Exit criterion**

The same documented boundary is used by mutation, ACL, history, sync, search, export, and UI APIs.

## 26.4 Target end-to-end invariants

The corrected system must enforce the following invariants:

1. **Canonical identity:** a logical target is identified by Atome, property key, and operation; permission scope additionally includes principal and conditions.
2. **Server authority:** authentication, authorization, condition evaluation, version checks, and outbound projection are server decisions.
3. **Per-key decisions:** every touched or returned key receives an explicit decision. An Atome-level decision alone is insufficient for a partially shared Atome.
4. **Atomic denial:** a multi-property event containing one denied key produces no partial mutation.
5. **Fail closed:** missing context, unknown operations, malformed conditions, unknown condition nodes, evaluator errors, and policy lookup errors deny access.
6. **Exact share scope:** a property grant never mutates or aliases a global grant.
7. **No existence leaks:** denied properties are absent from payloads and cannot be inferred from keys, counts, diffs, history, errors, search snippets, or timing metadata intended for clients.
8. **Canonical mutation:** set, clear, delete, restore, undo, redo, import, replay, and synchronized writes pass through one mutation contract.
9. **Canonical projection:** current state, history, realtime, sync, search, and export pass through one read-policy/projection contract.
10. **Property-local history:** undo and redo change only the properties recorded in the selected transaction or gesture.
11. **Conflict visibility:** stale revisions are rejected or resolved by one documented deterministic strategy; they are never silently overwritten.
12. **Custom-property parity:** custom keys have the same authorization, history, sync, and lifecycle guarantees as built-in keys.
13. **Minimal DOM:** no permission, state, or history authority is stored in DOM projections.
14. **WebGPU-first compatibility:** correction work must not create a second renderer, DOM proxy, or fallback UI path.

## 26.5 Canonical correction flow

Every mutation path must converge on this logical sequence:

```text
authenticate
  -> normalize operation and touched property keys
  -> resolve ownership, exact ACL, and conditions for every key
  -> validate expected revisions
  -> atomically append canonical event and property versions
  -> update current-state projection
  -> enqueue synchronization record
  -> publish a separately authorized projection to each recipient
```

Every read path must converge on this logical sequence:

```text
authenticate
  -> resolve requested Atome/property scope
  -> evaluate ownership, exact ACL, conditions, and revocation
  -> fetch canonical data
  -> project only readable property keys
  -> return nothing when the projection is empty
```

The implementation should extend the current canonical owners, especially `database/adole_permissions.js`, the event commit boundary, and the synchronization security boundary. It must not duplicate their logic in each route.

## 26.6 Ordered implementation plan and blocking gates

The lots below are sequential. A later lot may be prepared in parallel only when it does not depend on an unresolved security contract. Each gate requires executable evidence before the next dependent lot is accepted.

### Gate 0 — Freeze the confirmed failures as regression tests

**Required work**

- Add permanent red tests reproducing GV-P0-001 through GV-P0-004.
- Add route-inventory assertions for every active read/write/sync entry point.
- Preserve the successful baseline tests listed in section 26.9.
- Prefer focused suites by responsibility instead of one oversized granularity test file.

**Gate 0 exit**

The four P0 regressions fail for the demonstrated reasons before production logic is changed.

### Lot 1 — Secure canonical writes and exact sharing identity

**Scope**

- Enforce write permission for every normalized key in `events:commit` and `commitBatch`.
- Make mixed-authority batches atomic.
- Correct exact ACL row selection and mutation in sharing.
- Cover grants, changes, revocations, ownership, and custom keys.
- Remove or route direct write handlers that bypass the canonical event commit.

**Gate 1 exit**

GV-P0-001 and GV-P0-003 tests pass; authorized commits still pass; no persistence, projection, or queue side effect occurs after denial.

### Lot 2 — Centralize property read decisions and projections

**Scope**

- Define one reusable server-side property projection contract in the existing authorization architecture.
- Apply it to particle reads, current state, event/history reads, observers, audit responses, and retained legacy routes.
- Ensure empty projections do not disclose Atome/property existence beyond explicitly authorized metadata.

**Gate 2 exit**

A principal with permission for property A cannot retrieve property B through any direct or aggregate read path.

### Lot 3 — Secure realtime, sync, replay, and reconnect

**Scope**

- Select and project data per recipient and property.
- Filter live events, snapshots, catch-up windows, queued events, reconnect state, and acknowledgements.
- Re-evaluate dynamic conditions and revocations before delivery.
- Prevent offline queues created before revocation from leaking data after revocation.

**Gate 3 exit**

GV-P0-002 passes across initial sync, live delivery, reconnect, replay, and post-revocation delivery.

### Lot 4 — Make conditions fail closed and transverse

**Scope**

- Validate supported condition schemas.
- Deny unknown and malformed nodes.
- Apply the same evaluator and context contract to every authorization domain.
- Test time, actor, role, ownership, operation, property, and relevant runtime conditions without adding domain-local evaluators.

**Gate 4 exit**

GV-P0-004 passes, and every domain produces the same decision for the same principal, Atome, property, operation, and condition context.

### Lot 5 — Canonicalize delete, clear, restore, undo, and redo

**Scope**

- Replace direct lifecycle mutations with semantic canonical events.
- Record exact before/after values and revisions for affected keys.
- Generate property-local inverse operations.
- Re-authorize and version-check undo/redo at execution time.
- Preserve transaction and gesture grouping.

**Gate 5 exit**

Lifecycle operations survive restart and replay, synchronize correctly, and cannot change unrelated properties.

### Lot 6 — Add revision conflict, rollback, and offline guarantees

**Scope**

- Define the expected-revision contract per property.
- Define deterministic handling for independent-property edits versus same-property conflicts.
- Guarantee rollback of events, particles, current state, versions, and queue records on failure.
- Test reconnect ordering, duplicate delivery, idempotency, and revoked queued changes.

**Gate 6 exit**

Concurrent edits to different properties both survive; stale edits to the same property produce the documented result; injected failures leave no partial state.

### Lot 7 — Complete search, export, custom-property, and collection coverage

**Scope**

- Filter indexes, hits, snippets, sort/facet metadata, and exports by readable property.
- Apply full lifecycle/security parity to custom properties.
- Document and test the chosen complex-value/collection boundary.
- Ensure serialization never reintroduces denied keys.

**Gate 7 exit**

Search and export cannot reveal unauthorized values or property existence, and custom/complex values obey the documented boundary everywhere.

### Lot 8 — Validate performance without weakening security

**Scope**

- Measure authorization and projection cost for one property, large Atomes, large batches, many recipients, reconnect, and long history.
- Cache only decisions whose invalidation is correct for grants, revocations, ownership, and dynamic conditions.
- Preserve atomicity and fail-closed behavior under load.

**Gate 8 exit**

Documented measurements meet the project performance budget, with no coarse ACL shortcut or whole-Atome leak introduced for speed.

### Lot 9 — Align public APIs and UI consumers

**Scope**

- Keep `window.Atome.commit` and `commitBatch` as canonical public mutation boundaries.
- Return stable authorization, conflict, and validation results that UI consumers can handle without inspecting protected state.
- Ensure property-scoped share controls accurately reflect persisted scope.
- Do not add DOM state authority, DOM proxies, forced interaction paths, or test-only product metadata.

**Gate 9 exit**

Visible clients handle allowed, denied, revoked, conflict, and partial-share outcomes through canonical APIs, with targeted runtime/UI evidence where applicable.

### Lot 10 — Final acceptance and documentation convergence

**Scope**

- Run the complete scenario matrix and relevant existing suites.
- Update ownership/API/rendering/state maps affected by the implementation.
- Update the repository State File only with current, verified facts.
- Remove obsolete bypasses and temporary diagnostics.
- Re-run focused tests after cleanup, then the wider relevant suite.

**Gate 10 exit**

Every mandatory scenario is green, no P0/P1 gap remains, evidence is linked at requirement level, and the final verdict in this document can be changed to `GRANULARITY VALIDATION: PASS`.

## 26.7 Expected code ownership

The following list identifies the current owners to inspect or extend. It is not permission to create parallel implementations.

| Responsibility | Current owner or boundary |
|---|---|
| Permission storage and decisions | `database/adole_permissions.js`, permission tables in `database/schema.sql` |
| Event append and state projection | `database/adole.js` |
| Transaction/gesture history | `database/adole_history_transactions.js` |
| Durable sync queue | `database/adole_sync.js` |
| Canonical server event commit | `server/atomeRoutes.orm.js`, invoked by `server/wsAtomeOperations.js` |
| Sharing persistence behavior | `server/sharingPermissionService.js` |
| Realtime security projection | `server/wsSyncSecurity.js` |
| Realtime recipient delivery | `server/atomeRealtime.js` |
| Synchronization runtime | `server/atomeSyncRuntime.js` |
| Event/current-state HTTP exposure | `server/atomeEventRoutes.js` |
| Legacy WebSocket particle handlers | `server/server.js` |
| Public eVe commit API | `eVe/core/atome_commit.js` |
| Undo/redo client orchestration | `eVe/core/atome_timeline_commit.js` |
| Unified sharing API | `atome/src/squirrel/apis/unified/adole_api/sharing.js` |

Before adding a helper or module, search these owners and the repository maps for an existing canonical mechanism. If a focused extraction is necessary, migrate consumers to it and remove the superseded local logic in the same change.

## 26.8 Mandatory acceptance scenario matrix

Each scenario requires an executable test and a recorded result. Static inspection alone is insufficient for behavioral acceptance.

| ID | Scenario | Required result |
|---|---|---|
| GV-T01 | Owner writes one built-in property | Only that property changes; event, version, state, and queue agree |
| GV-T02 | Authorized principal writes one granted property | Commit succeeds without affecting another property |
| GV-T03 | Principal writes a denied property | Atomic denial; no database, history, projection, or queue side effect |
| GV-T04 | Mixed batch contains allowed and denied keys | Entire batch is denied |
| GV-T05 | Property-only read of current state | Only granted keys are returned |
| GV-T06 | Property-only event/history read | Only granted keys and safe metadata are returned |
| GV-T07 | Property grant beside an existing global grant | Exact rows remain distinct; no scope widening |
| GV-T08 | Revoke one property | Other grants remain unchanged; revoked key disappears immediately |
| GV-T09 | Unsupported or malformed condition | Grant creation rejects it or use denies it |
| GV-T10 | Dynamic condition changes from true to false | Subsequent read, write, sync, and replay deny access |
| GV-T11 | Live event contains readable and denied keys | Recipient receives only readable keys |
| GV-T12 | Live event projection is empty | Recipient receives no data-bearing event |
| GV-T13 | Reconnect after partial sharing | Snapshot and backlog contain only readable keys |
| GV-T14 | Reconnect after revocation | Previously queued denied data is not delivered |
| GV-T15 | Delete one property | Canonical delete event is authorized, versioned, replayable, and synced |
| GV-T16 | Restore one property version | Only that property is restored through canonical commit semantics |
| GV-T17 | Undo property A after a later edit to property B | A is reverted; B is preserved |
| GV-T18 | Undo grouped multi-property transaction | Exactly the grouped keys are reverted atomically |
| GV-T19 | Concurrent edits to different properties | Both changes survive according to independent revisions |
| GV-T20 | Concurrent stale edits to the same property | Documented conflict result; no silent overwrite |
| GV-T21 | Injected failure during commit | Event, particles, state, versions, and queue roll back together |
| GV-T22 | Custom property lifecycle | Same ACL, history, sync, delete, restore, and undo behavior as built-ins |
| GV-T23 | Search and export of partially shared Atome | No denied value, key, snippet, count, or serialized field leaks |
| GV-T24 | Complex/collection property | Behavior matches the documented granularity boundary in every layer |
| GV-T25 | Unauthorized direct/legacy route access | Every retained route denies or projects through the canonical policy |
| GV-T26 | Restart and replay | Reconstructed authorized state matches pre-restart authorized state |
| GV-T27 | Many recipients with different grants | Each recipient receives its own correct projection |
| GV-T28 | Permission lookup/evaluator failure | Operation fails closed with no protected-data disclosure |

## 26.9 Existing executable baseline

The following focused suites were run during the audit:

```text
node --test \
  tests/database/adole.particle_history_invariants.test.mjs \
  tests/database/adole.event_projection_invariants.test.mjs \
  tests/database/adole_history_transactions.test.mjs \
  tests/database/adole_restart_safe_interactions.test.mjs \
  tests/eve/adole_commit_boundary.test.mjs
```

Observed result on 2026-08-13:

```text
tests: 15
pass: 15
fail: 0
```

These tests prove important storage/event/state coherence, property version history, restart reconstruction, history grouping, and public commit boundaries. They do **not** prove the security, partial-sharing, realtime, conflict, search, export, revocation, or rollback scenarios required by this specification.

## 26.10 Evidence required for every correction

Each implementation lot must leave a concise evidence record containing:

1. the defect and acceptance IDs addressed;
2. the canonical owner changed and why it owns the behavior;
3. the executable command used;
4. the observed pass/fail counts;
5. any runtime, authenticated-browser, physical-device, or live-server acceptance still pending;
6. confirmation that temporary probes and bypasses were removed;
7. confirmation that affected maps and the State File were updated when factual ownership or behavior changed.

A mocked probe, simulator result, static search, or unit test must not be presented as stronger evidence than it is. Security acceptance requires server-side behavioral tests; visible interaction acceptance requires the relevant real UI/runtime procedure.

## 26.11 Definition of done

This task is complete only when all of the following are true:

- GV-P0-001 through GV-P0-004 and GV-P1-005 through GV-P1-008 are corrected at their canonical owners.
- GV-T01 through GV-T28 pass with permanent executable coverage.
- Every active mutation, read, history, observer, sharing, search, export, realtime, replay, and sync path preserves property scope.
- Permission conditions fail closed and produce the same decision across domains.
- Delete, clear, restore, undo, and redo use canonical event semantics.
- Revision conflict and rollback behavior is documented and proven.
- Custom and complex values follow one explicit granularity boundary.
- No alternate state, mutation, permission, communication, DOM, or rendering authority was introduced.
- Relevant existing tests remain green.
- Obsolete bypasses and temporary diagnostics are removed.
- Required maps and current-state documentation reflect the final implementation.
- Requirement-level evidence supports changing the verdict to:

> **GRANULARITY VALIDATION: PASS**

Until all conditions above are met, the honest status remains:

> **GRANULARITY VALIDATION: FAIL — corrections required**
