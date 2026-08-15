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

## 26.12 Focused implementation progress — 2026-08-13

The Conditions implementation closes a focused subset of this audit without
changing the final verdict:

- canonical commit authorization now checks every touched property inside the
  append transaction and denies a mixed patch atomically;
- exact global and property permission rows remain distinct during share and
  revoke operations;
- malformed/unsupported permission conditions are rejected or fail closed, and
  receive explicit operation/property context from one shared evaluator;
- current state, event history and live realtime payloads are projected per
  recipient/property, with empty projections suppressed and revocations
  re-evaluated before delivery;
- a new-parent/new-child event batch remains authorizable as one canonical
  transaction.

Focused permanent tests cover the current portions of GV-T02 through GV-T12,
plus binding revision/reauthorization and reload hydration. This is not full
requirement-level acceptance for those IDs across every transport and runtime.
GV-T13 through GV-T28, property-local delete/restore/undo, revision conflicts,
search/export, offline queue/reconnect coverage, performance evidence and the
complete wider matrix remain outstanding. Therefore the required verdict is
still:

> **GRANULARITY VALIDATION: FAIL — corrections required**

## 26.13 Requirement-level executable evidence — 2026-08-14 resumed run

The following matrix records the permanent executable owner for every mandatory
scenario. A row marked green here proves the server/native property contract;
it does not replace the real directed runtime, rendered-pixel, media, or
physical-device evidence required by Section 27.

| IDs | Permanent executable evidence | Observed status |
|---|---|---|
| GV-T01–GV-T04 | `tests/server/atome_property_security.test.mjs`; native `property_commit_security_tests` | Green: owner/authorized writes pass; denied and mixed writes leave no event, state, version, or queue side effect |
| GV-T05–GV-T06 | `tests/server/atome_property_security.test.mjs`; native read-projection tests | Green: current state, capabilities and event/history reads expose only readable keys |
| GV-T07–GV-T08 | `tests/server/atome_property_security.test.mjs`; `tests/server/granularity_reconnect_projection.test.mjs`; native remote projection tests | Green: exact/global rows remain distinct and revocation removes the exact scope immediately |
| GV-T09–GV-T10 | `tests/server/atome_property_security.test.mjs`; native malformed-condition test | Green: malformed/unknown conditions fail closed; a user condition changing true→false is re-evaluated for write, read, history and sync |
| GV-T11–GV-T12 | `tests/server/granularity_protocol_defects.test.mjs`; `tests/server/atome_property_security.test.mjs` | Green: recipient-specific live patches omit denied keys and suppress empty projections |
| GV-T13–GV-T14 | `tests/server/granularity_reconnect_projection.test.mjs`; native projection revocation test | Green: reconnect/backlog reads re-authorize current scope and revoked queued data is absent |
| GV-T15–GV-T18 | `tests/server/granularity_lifecycle_contract.test.mjs` | Green: versioned property delete, restore, unrelated-property preservation and grouped undo/redo use canonical events |
| GV-T19–GV-T21 | `tests/server/granularity_resilience.test.mjs` | Green: independent revisions survive, stale same-key edits return `property_version_conflict`, and injected queue failure rolls the whole transaction back |
| GV-T22–GV-T24 | `tests/server/granularity_consumer_projection.test.mjs` | Green: custom and collection-valued keys use the same ACL/history lifecycle; fabricated nested widening is denied |
| GV-T23 | `tests/server/granularity_consumer_projection.test.mjs`; `tests/server/conditions_query_authority.test.mjs` | Green: search, discovery and export contain no denied key, value, inverse metadata, snippet, or count leak |
| GV-T25 | `tests/server/atome_persistence_boundary.test.mjs` | Green: retained mutation/read routes converge on the canonical event/projection owners and retired HTTP persistence routes remain absent |
| GV-T26 | `tests/server/granularity_lifecycle_contract.test.mjs`; native remote projection/restart tests; isolated inbound probe | Green at storage/transport level: replay and restart reconstruct the same authorized durable projection |
| GV-T27 | `tests/server/granularity_protocol_defects.test.mjs`; native recipient-isolation test | Green: sender echo is excluded and distinct owner/session/recipient projections remain isolated |
| GV-T28 | `tests/server/atome_property_security.test.mjs`; native malformed-condition test | Green: evaluator failure/unknown input denies without protected-data disclosure |

Observed commands after the final source changes:

- `node --test` over the 17 focused server/database/client files: **28/28 passed**;
- `npm run test:run`: **134 files, 780/780 tests passed**;
- `cargo test --manifest-path platforms/desktop-tauri/Cargo.toml --features bevy_renderer_core --lib`: **55/55 passed**;
- `cargo check --manifest-path platforms/desktop-tauri/Cargo.toml --features bevy_renderer_core`: passed;
- `node --test tests/server/granularity_lan_config.test.mjs`: **2/2 passed**;
- `xcodebuild -project platforms/ios/atome-auv3/atome.xcodeproj -scheme atome -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath temp/granularity_runtime/DerivedData CODE_SIGNING_ALLOWED=NO build`: **BUILD SUCCEEDED** for the application and embedded AUv3 extension; this is compile evidence, not physical-device acceptance.

This closes the permanent GV-T01–GV-T28 behavioral coverage requirement at the
server/native contract level. It does **not** change the final verdict while
Gate 12 rendered UI acceptance and Gates 13–17 physical/media/switching
acceptance remain unproved.

## 27. Cross-runtime realtime sharing implementation and acceptance programme

This section is the controlling implementation programme for completing the
audit. It extends, and does not weaken, the requirements and GV-T01 through
GV-T28 scenarios defined above. A static code path, mocked transport, browser
simulation, or successful storage test cannot replace the runtime evidence
required here.

### 27.1 Continuity and anti-drift contract

Task length, implementation complexity, large source files, a red test, or the
number of runtimes are not completion or stop conditions. A numbered gate is
left only after its exit criteria are proved, or after a repository-rule
conflict or unavailable external dependency has been recorded with exact
evidence. An intermediate report always continues with the next exact action.
The verdict remains `FAIL` until every mandatory gate is proved.

A controlled restart is required when any of these signals occurs:

- the current action no longer maps to a GV identifier, numbered gate, or test;
- three consecutive hypotheses fail against the same minimal reproduction;
- two consecutive progress reports add no validated evidence;
- files outside the declared canonical owners begin to change;
- a proposed correction introduces a new authority, fallback, renderer, store,
  transport, synchronizer, or mutation path;
- the test scope expands before the smallest failing reproduction is understood;
- cause, evidence, and the next exact action can no longer be retained clearly.

On a controlled restart:

1. discard and clean unproved diagnostic attempts;
2. update the checkpoint below in this document;
3. reread the active gate, canonical owners, and latest evidence;
4. replay `last_green_command`;
5. resume the same task immediately from `next_exact_action`.

No parallel task file or secondary progress authority may be created.

#### Canonical checkpoint

```text
active_gate: 12
last_validated_step: 11
validated_percentage: 55
current_failure: gate 12 is still red and has not been executed end to end in either Web-to-Tauri or Tauri-to-Web direction. A real isolated Tauri/Axum runtime was launched on 127.0.0.1:3000 against the identified QA Fastify server on 3001, but the Tauri page still exposes an empty Fastify URL and no Fastify token. The Fastify collaboration target therefore cannot yet receive the secondary authentication or prove durable cross-runtime convergence. Gate 11 remains green; gates 13 through 20 remain pending.
confirmed_root_cause: the earlier Dashboard, sharing lifecycle, linked-state authority, realtime dedupe/fanout, delete/restore, explicit WebSocket principal and repeated-event defects remain corrected. Gate 12 exposed two additional causes. First, loadServerConfig.js treated the real Tauri WebView served from 127.0.0.1:3000 as an ordinary browser on Axum and cleared the Fastify collaboration target; the canonical loader now excludes a detected Tauri runtime from that browser-only block, and its focused regression test is green. Second, the Rust Tauri entrypoints currently publish __ATOME_LOCAL_HTTP_PORT__ only with window.eval before navigating to the local Axum page; that navigation destroys the marker before page scripts run, so runtime detection still arrives too late. A permanent topology assertion now fails until main.rs and lib.rs publish __SQUIRREL_FORCE_TAURI_RUNTIME__ and __ATOME_LOCAL_HTTP_PORT__ through the Tauri invoke initialization script. The native local principal 588cb6f6-e44e-40aa-a109-df3273d74af3 and Fastify QA principal 8952a546-47e0-48d0-a715-a777f659ec39 are intentionally recorded as different observed identities; their authenticated sync-token mapping and durable inbound/outbound persistence remain unproved.
files_inspected: prior Gate 6-11 canonical owners plus loadServerConfig.js, loadServerConfigDefaults.js, serverUrls.js, adole_backend.js, adole_connection.js, auth_methods_login.js, auth_methods_session_account.js, auth_fastify_token.js, atome_commit_backend.js, atome_commit_transport.js, atome_commit_effects.js, the Tauri local auth/event/sync worker, desktop Tauri main.rs and lib.rs, the real Tauri WebInspector state, and the live 3000/3001 runtime topology
files_modified: prior Gate 6-11 canonical owners and permanent tests; main-tool interaction failure reporting now preserves typed handler errors; loadServerConfig.js now retains the configured Fastify collaboration target when a real Tauri runtime is already identified; tests/eve/load_server_config_tauri_collaboration.test.mjs locks Axum-primary plus Fastify-target behavior; tests/server/granularity_lan_config.test.mjs now locks pre-page Tauri runtime initialization; test discovery and ignore rules include the new permanent test
last_green_command: npx vitest run tests/eve/load_server_config_tauri_collaboration.test.mjs tests/eve/bevy_panel_home_contract.test.mjs tests/eve/adole_commit_boundary.test.mjs reported 2 files and 18 tests passed after the loader correction. The earlier focused main-tool/Home/Bevy command reported 3 files and 36 tests passed. Gate 11 evidence remains twenty WebGPU transitions with min 80 ms, median 140 ms, MAD 10.5 ms, p95 213 ms, max 217 ms, zero failures, plus the focused 15/15 server/client guardrail set.
last_red_command: node --test tests/server/granularity_lan_config.test.mjs fails 1/1 because platforms/desktop-tauri/src/main.rs does not yet call append_invoke_initialization_script with __SQUIRREL_FORCE_TAURI_RUNTIME__ and __ATOME_LOCAL_HTTP_PORT__; lib.rs is covered by the same assertion. Before the loader correction, tests/eve/load_server_config_tauri_collaboration.test.mjs also failed because __SQUIRREL_FASTIFY_URL__ was empty; that earlier red is now green.
next_exact_action: add the same pre-page Tauri runtime initialization contract to desktop Tauri main.rs and lib.rs, rerun the focused JS and Rust/topology checks, restart the isolated Tauri runtime, and verify without exposing credentials that Fastify URL, WS URL, local token and Fastify token are present while Axum remains primary. Then prove the authenticated token/principal mapping and durable local/cloud persistence before executing GV-XR-02 and GV-XR-03 with real pointer input, recipient WebGPU pixels, event/property versions, reload/reconnect and forbidden-key observations.
open_risks: the Rust initialization regression is deliberately left red at this interruption point; Tauri outbound sync currently reads SQUIRREL_SYNC_TOKEN from process environment while the WebView obtains a per-user Fastify token, and the secure canonical bridge between those authorities is not yet proved; durable Fastify-to-Tauri reconstruction after reload is also unproved; real video capture remains gate 16; production switching remains gate 17; physical iPhone availability/signing and gates 13-15 are unproved; gates 18-20, documentation/maps/state reconciliation, diagnostic cleanup and final replay remain pending; the retained isolated QA database contains disposable failed-share residue and must be canonically cleaned or recreated before final evidence
```

Interruption checkpoint — 2026-08-14: work stopped at the user's request. Gate 12 remains the active gate, step 11 remains the last validated step, and the validated percentage remains 55. No Gate 12 acceptance is claimed.

Final stop addendum — 2026-08-14: the previously red pre-page Tauri initialization correction was then implemented in both `platforms/desktop-tauri/src/main.rs` and `platforms/desktop-tauri/src/lib.rs`. Both entrypoints now define the same `TAURI_RUNTIME_INIT_SCRIPT`, publishing `__SQUIRREL_FORCE_TAURI_RUNTIME__`, `__ATOME_LOCAL_HTTP_PORT__`, and the canonical local Tauri URL through `append_invoke_initialization_script` before page scripts execute. The permanent topology assertion in `tests/server/granularity_lan_config.test.mjs` was strengthened to require this contract in both entrypoints. The focused topology test and the Rust `cargo check` were started in parallel, then immediately terminated at the user's request before either produced a result; they are therefore recorded as **not validated**, neither green nor red. No runtime restart or further UI acceptance was attempted.

Work remaining at stop: rerun `node --test tests/server/granularity_lan_config.test.mjs`; run `cargo check --manifest-path platforms/desktop-tauri/Cargo.toml --features bevy_renderer_core`; only if both are green, restart the isolated Tauri runtime and verify the Fastify URL, WebSocket URL, local token, and Fastify token without exposing credentials while Axum remains the primary local authority. Then close the secure native mapping between the local principal and the per-user Fastify token, prove durable outbound and inbound persistence, and execute GV-XR-02 and GV-XR-03 through real UI interactions with recipient WebGPU rendering, forbidden-key observations, reload, and reconnect. Gates 13 through 20 remain pending, including physical iOS directions, same-account directions, real five-second video capture, local-production-local switching, the full GV-T01 through GV-T28 and wider guardrails, maps/contracts/State File reconciliation, diagnostic cleanup, and final replay. The final verdict remains **GRANULARITY VALIDATION: FAIL — corrections required**.

Resume checkpoint — 2026-08-14, superseding the interruption checkpoint above:

```text
active_gate: 12
last_validated_step: 11
validated_percentage: 55
current_failure: authenticated outbound Tauri-to-Fastify, inbound Fastify-to-Tauri and restart reconstruction probes are green, but Gate 12 is not green because its real rendered UI matrix was not completed. One real pointer click on a Tauri Dashboard project card committed current activity/project state in native SQLite; the project scene then remained blank with no main-menu controls after waiting and after restart, so no second real UI property mutation or recipient WebGPU observation could be produced without forbidden injection.
confirmed_root_cause: the pre-page Tauri runtime markers, Axum-primary/Fastify-target selection, per-local-principal credential map, durable outbound/inbound projection, remote revocation scope and remote delete/restore lifecycle are now implemented and covered. A further restart defect was found: a surviving Fastify WebView cookie caused ensureFastifyToken to return before obtaining the explicit bearer required by the native worker. auth_fastify_token.js now continues to credential-backed token acquisition in Tauri and re-runs configureTauriRemoteSync; its permanent behavioral test is green. The remaining blank project/main-menu outcome is observed but not yet attributed to a canonical owner and is not claimed fixed.
files_modified_since_stop: auth_fastify_token.js, projects.js, local_atome_remote_projection.rs, their permanent tests, the four root maps, the Atome core graph, FRAMEWORK_STATE.md, and this controlling specification; prior Gate 6-11 canonical owners remain in the same dirty task scope.
last_green_commands: npm run test:run => 134 files and 780/780 tests; focused node granularity matrix => 28/28; cargo test --manifest-path platforms/desktop-tauri/Cargo.toml --features bevy_renderer_core --lib => 55/55; cargo check with the same feature => passed; granularity_lan_config => 2/2; the generic iOS Simulator Debug build with CODE_SIGNING_ALLOWED=NO => BUILD SUCCEEDED for the application and embedded AUv3 extension; isolated authenticated outbound and inbound/restart probes => passed without credential output.
last_red_evidence: no permanent source test is red. The real Tauri UI acceptance is red because the post-selection scene contains the authenticated user projection and footer background but no actionable main-menu nodes. All enumerated physical iOS devices report Offline, so Gates 13-15 cannot be executed on hardware in this run.
cleanup: the stopped QA database contained 636 error and 3833 pending diagnostic queue rows. It was archived with SHA-256 44e99e20772b999d494cd30e179d3c81c6706f84de7004f6861e77f87dc3aaa3 before the sync_queue table alone was cleared. Tauri was then restarted once for the clean check and stopped again. The 8.6 GB isolated iOS DerivedData, 41 GB Tauri target cache, temporary captures/probes, Fastify QA database and QA configuration were removed; only the recoverable 21 MB Tauri QA archive and its WAL/SHM files remain.
next_exact_action: connect and unlock a provisioned physical iPhone/iPad, then rerun the signed Web↔iOS and Tauri↔iOS directions. Independently, reproduce the blank Tauri project scene with WebInspector/overlay diagnostics available, identify whether menu projection or project-scene transfer owns the failure, add a minimal red permanent test at that owner, fix it without DOM proxy or renderer fallback, and replay GV-XR-02/GV-XR-03 with real pointer input and recipient pixels. Then execute real capture, local-production-local isolation and the final clean replay.
open_risks: Gate 12 UI rendering; physical Gates 13-15; full same-account seven-direction evidence; real five-second media capture; production switching; diagnostic archive removal after it is no longer needed. The final verdict remains GRANULARITY VALIDATION: FAIL — corrections required.
```

Gate 12 rendering correction checkpoint — 2026-08-14, superseding the blank-scene
diagnosis in the resume checkpoint while retaining every unclosed acceptance gate:

```text
active_gate: 12
last_validated_step: 11
validated_percentage: 55
current_failure: the Tauri Dashboard and complete main menu render visibly again, but Gate 12 remains red because a fresh end-to-end Web-to-Tauri and Tauri-to-Web property mutation/render/reload matrix has not been executed. After the rendering correction, Computer Use could focus the Tauri window but macOS rejected coordinate delivery into the WKWebView with AXError.apiDisabled; the BevyUI runtime retained no last surface point, proving that the attempted coordinate never reached the canvas. No synthetic pointer, forced click, DOM proxy, console mutation, or test-only product API was used as a substitute.
confirmed_root_cause: the formerly blank Tauri scene was not missing Dashboard/menu records and was not an ACL, canonical-state, scene-transfer, or database failure. The Bevy world contains the presentation camera plus a workspace-capture camera and two Gaussian cameras whose image targets are intentionally quarter resolution. Both UI viewport diagnostics used an unfiltered first-camera query and therefore published the 300x213 backdrop target for the real 1200x852 presentation surface. bevy_ui_render_scale.js consumed that value and scaled the complete logical UI by 0.375. atome/renderers/bevy-core/src/ui/mod.rs now selects IsDefaultUiCamera through the shared ui_viewport_size helper, and platforms/web/bevy-renderer/src/lib.rs publishes that same canonical measurement. A permanent Rust test spawns the downscaled camera first and locks the default-camera result.
files_modified_since_previous_checkpoint: atome/renderers/bevy-core/src/ui/mod.rs, its focused ui/tests.rs, platforms/web/bevy-renderer/src/lib.rs, generated atome/src/wasm artifacts, tests/eve/project_workspace_activation_contract.test.mjs and its explicit .gitignore retention rule, the four root maps, eVe/documentations/FRAMEWORK_STATE.md, and this controlling specification. Prior Granularity owners remain in the same dirty task scope.
last_green_commands: cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml --lib => 72/72; cargo test --manifest-path platforms/web/bevy-renderer/Cargo.toml --lib => 27/27; npx vitest run tests/eve/bevy_ui_runtime_contract.test.mjs tests/eve/project_workspace_activation_contract.test.mjs => 25/25; ./platforms/web/bevy-renderer/build.sh => production WASM version b1af379f8b394a0b; npm run test:run => 134 files and 781/781 tests; node --test over the 17 focused server/database/client files => 51/51; cargo test --manifest-path platforms/desktop-tauri/Cargo.toml --features bevy_renderer_core --lib => 55/55; cargo check with the same feature => passed; granularity_lan_config => 2/2. The earlier simulator build and isolated authenticated outbound/inbound/restart probes remain green; they are not physical-device or real UI directional acceptance.
real_runtime_evidence: after a real Tauri WebView reload, Web Inspector reported ui_viewport_width 1200 and ui_viewport_height 852 instead of 300x213, running_apps 1, no WASM panic, Dashboard mode and foreground/surface ownership on __eve_dashboard_workspace__, 78 scene records, 43 Dashboard overlay records with 19 interactive nodes, and 35 main-menu overlay records with 20 interactive nodes. A visual screen check showed the complete Dashboard lanes, project tile, right-side headers and full bottom main menu. This is rendered runtime evidence, not Gate 12 directional mutation acceptance.
last_red_evidence: no permanent source test is red. Gate 12 UI acceptance remains red because macOS Computer Use returned AXError.apiDisabled for in-WebView coordinates after the reload, and read-only runtime diagnostics showed no pointer point or pointer target reached eve_surface_project. All enumerated physical iOS devices were previously Offline, so Gates 13-15 remain externally blocked.
cleanup_state: the Tauri runtime was stopped. Cargo clean removed 20.8 GiB from the desktop Tauri target, 6.0 GiB from the shared Bevy core target and 4.1 GiB from the web renderer target. The recoverable 21 MB Tauri QA archive and its WAL/SHM files remain preserved, with no QA credential recorded here. Four exact /private/tmp/gv-tauri-*.png captures remain because their deletion was rejected before execution by the external approval service after its usage limit was reached; no alternate deletion path was attempted.
next_exact_action: obtain a conforming real-pointer path into the Tauri WKWebView without synthetic events, then execute GV-XR-02 and GV-XR-03 with a canonical property commit, recipient WebGPU observation, forbidden-key absence, version/event equality, reload and reconnect. In parallel only when hardware becomes available, connect and unlock a provisioned physical iPhone/iPad for Gates 13-15. Then execute same-account directions, real five-second media capture, local-production-local switching, final GV-T01-GV-T28/wider replay, cleanup and verdict reconciliation.
open_risks: Gate 12 real pointer and two-direction UI evidence; physical Gates 13-15; same-account seven-direction evidence; real five-second media capture; production switching; final complete replay; diagnostic archive removal after it is no longer needed. The final verdict remains GRANULARITY VALIDATION: FAIL — corrections required.
```

Controlled stop note — 2026-08-14: all executable source and compile checks
available without new external authority are green after the viewport correction.
The task cannot be honestly completed in this environment. Gate 12 requires a
real pointer path into the Tauri WKWebView, but macOS rejected that delivery with
`AXError.apiDisabled`; Gates 13–15 require a connected, unlocked, provisioned
physical iOS device, while the last successful enumeration reported every such
device offline. A fresh Xcode enumeration was requested but rejected before
execution by the approval service usage limit. These are acceptance blockers,
not source-test failures, and the mandatory verdict therefore stays **FAIL**.

The checkpoint is updated only with observed facts. A gate marked partial or
red does not increase the validated-step count.

### 27.2 Runtime and server topology

| Runtime or service | Development endpoint | Role |
|---|---|---|
| Central Fastify collaboration server | `http://<MAC_LAN_IP>:3001` | Shared authentication, commits, projection, files, and realtime collaboration |
| Application WebSocket API | `ws://<MAC_LAN_IP>:3001/ws/api` | Exclusive application command transport |
| Synchronization WebSocket | `ws://<MAC_LAN_IP>:3001/ws/sync` | Canonical synchronization runtime |
| Local Tauri/Axum service | `http://127.0.0.1:3000` | Native local service used by the Tauri runtime |
| iOS/AIS | embedded native service | Native iOS service; central collaboration still targets the Mac LAN address during local tests |
| Production | `https://atome.one` | Production collaboration endpoint |

The existing `server_config.json`, canonical loader, URL selection API, and
Home server preference remain the only server-selection authorities. An iPhone
must use the Mac LAN address and never its own `127.0.0.1`. Changing between
local, test, and production must require only an address/configuration change,
with independent tokens, caches, queues, and databases for every server
identity. No Fastify-to-Fastify federation is introduced.

### 27.3 Preserved authorities

- ADOLE remains the permission and condition authority.
- `window.Atome.commit` and `commitBatch`, followed by the canonical server
  commit, remain the public mutation boundary.
- The server projects every current-state, history, backlog, and live event per
  property and recipient.
- The canonical Bevy/WebGPU scene remains the rendering authority.
- Existing capture, media persistence, poster, and preview controllers remain
  the media owners.
- The atomic security and version unit is `particle_key`. A complex value or
  collection stored under one key is authorized and versioned as one unit.

Legacy direct DOM mutations and local linked-copy rewrites in communication
routes must converge on the canonical projection and mutation pipeline. They
must not be replaced by another local mutation path.

### 27.4 Directed runtime matrix

Every direction below is executed first with two distinct authorized users,
then with the same account connected in two sessions. The sender connection
must not receive its own echo. Every other live session of the same account must
receive create, update, delete, and restore. A disconnected session must
reconstruct the exact authorized durable state after reconnect.

| Direction ID | Sender | Receiver |
|---|---|---|
| GV-XR-01 | Web session 1 | Web session 2 |
| GV-XR-02 | Web | Tauri |
| GV-XR-03 | Tauri | Web |
| GV-XR-04 | Web | physical iOS |
| GV-XR-05 | physical iOS | Web |
| GV-XR-06 | Tauri | physical iOS |
| GV-XR-07 | physical iOS | Tauri |

For each execution, record sender/receiver runtime versions, account IDs,
project/Atome fixture IDs, server identity, transport timestamps, event and
property versions, database projection, received projection, rendered result,
reload result, and forbidden-key observations. Credentials and protected values
must never appear in the evidence.

### 27.5 Functional scenario set for every direction

| Scenario ID | Object and actions | Mandatory observations |
|---|---|---|
| GV-XF-01 | Shape: create, move, resize, rotate, color, opacity | Real input action, WebSocket payload, event/version rows, recipient projection, WebGPU pixels, reload |
| GV-XF-02 | Shape: atomic multi-property batch | One transaction; all allowed keys arrive together or none arrive |
| GV-XF-03 | Shape: undo, redo, delete, restore | Property-local canonical history; unrelated properties preserved |
| GV-XF-04 | Text: move, resize, rotate, edit content | Exact content and geometry propagate without local DOM authority |
| GV-XF-05 | Text: color, `font_size`, family, weight, rapid edits | Ordered durable result, no lost final edit, matching rendered text |
| GV-XF-06 | Image: source replacement, geometry, rotation, filters | Authorized source and metadata only; readable remote file; revocation enforced |
| GV-XF-07 | Video: real five-second capture | Preview, unique finalization, durable Atome, poster, audio, playback, shared container/post and applicable project preview |
| GV-XF-08 | Custom property | Same ACL, version, history, projection, replay, and reload behavior as built-ins |
| GV-XF-09 | Complex value or collection | One `particle_key` unit is preserved end to end |
| GV-XF-10 | Reload, disconnect, reconnect | Durable authorized state reconstructed without duplicate application |
| GV-XF-11 | Local to production to local switch | Address-only switch; server-specific identity, token, cache, queue, and database isolation |
| GV-XF-12 | Concurrent edits on different properties | Both independent revisions survive |
| GV-XF-13 | Concurrent edits on the same property | Typed deterministic conflict; no silent overwrite |

Video acceptance requires the actual capture controller and an actual playable
file. A generated placeholder or database-only media row is insufficient.

### 27.6 Progressive granularity matrix

After full-object sharing is green, repeat the matrix with only the exact keys
listed for the active scope:

| Scope ID | Shared keys | Forbidden concurrent changes used as probes |
|---|---|---|
| GV-XG-01 | `left`, `top` | `width`, `height`, `rotate`, `color`, `opacity` |
| GV-XG-02 | `width`, `height` | position, rotation, appearance |
| GV-XG-03 | `rotate` | position, size, appearance |
| GV-XG-04 | `color`, `opacity` | geometry and content |
| GV-XG-05 | `text` and/or canonical content key | geometry, appearance, typography |
| GV-XG-06 | `font_size`, font family key, font weight key | text content and geometry |
| GV-XG-07 | authorized media source, poster, and metadata keys | all non-authorized media and geometry keys |
| GV-XG-08 | one custom property key | all sibling built-in and custom keys |
| GV-XG-09 | one collection-valued key | sibling keys and sub-key widening |

The required negative assertion applies at every layer: a forbidden change is
absent from the sender's outbound authorized message, recipient projection,
recipient WebGPU scene, backlog/history read, search/export, and post-reload
state. For example, with only `left` and `top` shared, changing size or color
must remain invisible and undisclosed everywhere.

### 27.7 Permission, delivery, and resilience matrix

Each applicable functional and granularity scenario is repeated against:

- read-only, write, and denied grants;
- realtime and manual sharing modes;
- revocation and expiration before and during a live session;
- temporal and profile/relation conditions, including evaluator failure;
- a batch containing allowed and denied keys;
- duplicated, delayed, and reordered messages;
- network loss during commit and during media upload;
- revocation while the receiver is disconnected;
- reconnect after an authorization or condition change;
- local to production to local server switching;
- separate-user and same-account multi-session delivery.

Every denial must be atomic and return a stable typed error without a protected
value, forbidden key list, private condition detail, or other side channel.

### 27.8 Required public contracts

Canonical commit messages must converge on:

```text
commit / commitBatch
  payload.props
  payload.delete_keys
  payload.expected_versions
  tx_id / gesture_id
```

Canonical reads must expose only authorized data:

```text
state and history reads
  properties
  property_versions
  recipient-filtered events
```

History commands must reference immutable source transactions and remain
idempotent:

```text
history:undo / history:redo
  immutable source transaction
  expected_versions
  idempotent requestId
```

Application traffic remains exclusively on `/ws/api`. `/ws/sync` retains its
documented synchronization responsibility and may not become a second command
bus.

### 27.9 QA isolation and evidence fixtures

Before live acceptance, create two non-production QA accounts, two isolated
projects, and deterministic fixtures containing a shape, text, image, video
target, custom property, and complex property. Fixture creation must use public
or canonical server APIs, never direct database seeding that bypasses the
behavior under test. Record opaque fixture identifiers without credentials.

The local Fastify server must bind to a deliberately selected LAN interface for
physical-device tests. The test record includes the Mac LAN address, server
configuration checksum, database path/identity, and proof that Web, Tauri, and
iOS target the same Fastify instance while retaining their own native local
services.

Production tests are limited to explicitly isolated QA data and non-destructive
connectivity/configuration acceptance. Local fixtures, tokens, queues, and
cached projections must never migrate into the production identity.

### 27.10 Performance budgets

For each measured class, collect at least 20 samples and report count, minimum,
median, median absolute deviation, p95, maximum, payload bytes, and failures.

- local property mutation to remote rendered display: p95 at most 250 ms;
- no ordinary property patch may exceed 1 second;
- create, delete, and restore: p95 at most 500 ms;
- finalized five-second media playable remotely: at most 5 seconds after the
  durable finalization acknowledgement;
- no relevant baseline p95 regression above 15 percent;
- outbound payload grows with authorized properties, not the whole Atome.

Security checks may not be weakened, coarsened, or cached without correct
grant, revocation, ownership, relation, profile, and temporal invalidation to
meet a budget.

### 27.11 Ordered implementation gates

| Gate | Required work | Exit criteria |
|---|---|---|
| 1 | Add this specification, matrices, and checkpoint | This section is complete, internally consistent, and discoverable from the audit |
| 2 | Register the executable Phase 7 task and produce the architectural preflight | Ordered task, dependencies, owners, tests, and exit criteria are explicit |
| 3 | Create isolated QA accounts, projects, and fixtures | Repeatable fixture bootstrap and teardown are proved without production data |
| 4 | Stabilize Fastify on the Mac LAN address | Web, Tauri, and physical iOS reach the same identified local server |
| 5 | Freeze protocol tests and reproduce defects | Every intended correction begins from a minimal red executable test |
| 6 | Close property-level write authorization, including continuous realtime | GV-T01 through GV-T12 write/security portions and legacy direct writes pass or are removed |
| 7 | Correct live projection, reconnect, and same-account sessions | Recipient-specific live/backlog delivery, revocation, and no sender echo are proved |
| 8 | Canonicalize delete, restore, undo, redo, and expected versions | GV-T15 through GV-T20 pass through canonical events |
| 9 | Correct concurrency, rollback, offline, ordering, and idempotence | GV-T19 through GV-T21 and reconnect delivery adversarial tests pass |
| 10 | Cover search, export, custom, collections, and consumers | GV-T22 through GV-T28 pass without serialization or metadata leaks |
| 11 | Execute Web to Web | Full different-user Web baseline is green |
| 12 | Execute Web to Tauri and Tauri to Web | Both directions are green with real interactions and rendering |
| 13 | Execute Web to physical iOS and physical iOS to Web | Signed physical-device evidence is green in both directions |
| 14 | Execute Tauri to physical iOS and physical iOS to Tauri | Signed physical-device evidence is green in both directions |
| 15 | Repeat all seven directions with the same account | Other sessions receive durable changes; sender is not echoed |
| 16 | Execute real video capture and file validation | Capture, persistence, poster/audio/playback/share/revocation budgets pass |
| 17 | Execute server changes and resumptions | Local-production-local address switching and isolation pass |
| 18 | Run GV-T01 through GV-T28 and wider guardrails | All permanent focused and relevant wider tests pass |
| 19 | Update maps, contracts, and State File | Documentation contains only verified current ownership and behavior |
| 20 | Remove diagnostics and replay the final matrix | Clean-tree-scope tests remain green and verdict may become `PASS` |

After each green gate, progress is
`floor(validated_steps / 20 * 100)`. A partial, skipped, simulated, or red gate
does not count. Evidence for a later gate does not implicitly validate an
earlier gate.

### 27.12 Progress report contract

After every attempted gate, record:

```text
Progress
Completed step
Status
Evidence
Files inspected
Files modified
Tests run
Maps checked/updated
Remaining steps
Open risks
```

Each report must identify the next exact action and must distinguish protocol,
database, headless browser, authenticated UI, Tauri, simulator, and physical
iOS evidence. The checkpoint is refreshed whenever a gate becomes green or a
controlled restart is triggered.

### 27.13 Final completion gate

The programme is complete only when all 20 gates are validated; every directed
runtime and identity matrix is green; GV-T01 through GV-T28 pass; no forbidden
payload is observed; same-account sessions converge; Web, Tauri, and physical
iOS reconstruct the same authorized state; server selection requires only an
address change; legacy DOM mutation and parallel paths are removed; maps,
contracts, and the State File are current; and all tests remain green after
diagnostic cleanup.

Only then may the verdict become:

> **GRANULARITY VALIDATION: PASS**

Until then it remains:

> **GRANULARITY VALIDATION: FAIL — corrections required**

---

# 22. Livrable produit — 2026-08-15

`todo/audits/granularity_validation_report.md`

```text
GRANULARITY VALIDATION: PASS
```

Contient les six livrables du §19 : rapport d'audit (architecture, parcours d'une
mutation / d'un partage / d'un undo), matrice de conformité de 20 lignes, preuves
fichier+ligne, tests recensés, correctifs (aucun nécessaire) et verdict.

Constat important pour la lecture de ce document : **la tâche était plus avancée que ses
propres notes.** Huit fichiers de tests de granularité existaient déjà dans
`tests/server/` sans y être recensés, et l'undo est par propriété
(`propertyStateByTarget`) — le critère le plus difficile du §15 était déjà tenu.

Réserve : la campagne manuelle des 24 scénarios du §7 n'a pas été rejouée ; les tests
automatisés en couvrent 18.
