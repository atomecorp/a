# Cahier des charges — Calendrier, alarmes et actions programmées

## Projet
**atome / eVe**

## Objectif général

Faire évoluer le calendrier d’**atome** pour qu’il ne soit pas limité aux rendez-vous et rappels, mais qu’il devienne un **moteur unifié d’événements temporels et d’actions programmées**.

Un même événement doit pouvoir représenter :

- un rendez-vous ;
- une alarme ;
- un rappel ;
- une action simple ;
- le lancement d’un outil ;
- l’ouverture d’un projet, fichier, image ou média ;
- le lancement d’une application ;
- l’exécution d’un script ;
- le déclenchement d’une capture ;
- l’activation d’une caméra ou d’un microphone ;
- le démarrage d’un enregistrement ;
- un time-lapse ;
- le lancement d’un template ;
- le lancement d’un scénario complet enregistré dans **eVe** ;
- une action déclenchée de manière unique ou récurrente.

Le système doit être utilisable de deux façons strictement équivalentes :

1. directement depuis l’interface du calendrier ;
2. via **eVe / MCP**, par langage naturel ou commande structurée.

Les deux voies doivent utiliser **exactement le même moteur de planification**, la même représentation des événements et les mêmes permissions.

---

# 1. Principe d’architecture

Ne pas créer un système séparé pour les alarmes, un autre pour les rendez-vous et un autre pour les automatisations.

Créer un objet générique de type :

`ScheduledEvent`

Un événement temporel contient au minimum :

- `id`
- `title`
- `description`
- `date`
- `time`
- `timezone`
- `duration`
- `recurrence`
- `event_type`
- `action_type`
- `target`
- `parameters`
- `notification`
- `sound`
- `permissions`
- `execution_policy`
- `status`
- `tags`
- `created_by`
- `created_at`
- `last_execution`
- `next_execution`
- `execution_history`

L’interface peut présenter des catégories différentes, mais le moteur interne doit rester commun.

---

# 2. Types d’événements à prendre en charge

## 2.1 Rendez-vous

Exemple :

> Coiffeur mardi à 15 h.

Options :

- sans alarme ;
- avec alarme ;
- plusieurs rappels ;
- récurrence éventuelle ;
- note ;
- contact associé ;
- localisation éventuelle ;
- tags.

## 2.2 Alarme simple

Exemple :

> Fais sonner une alarme à 08:59.

Options :

- sonnerie ;
- vibration si disponible ;
- répétition ;
- snooze ;
- arrêt ;
- suppression ;
- activation/désactivation sans suppression.

## 2.3 Action programmée

Exemple :

> À 9 h, ouvre le projet X.

Le calendrier doit déclencher l’action et conserver une trace de son exécution.

## 2.4 Application

Exemple :

> À 18 h, lance l’application X.

Le comportement doit tenir compte :

- de l’état d’**atome** ;
- du système d’exploitation ;
- de l’état verrouillé/déverrouillé ;
- des permissions ;
- des limitations du Web, de Tauri, d’iOS et de macOS.

## 2.5 Ouverture de contenu

Pouvoir programmer l’ouverture de :

- projet ;
- image ;
- vidéo ;
- audio ;
- document ;
- URL ;
- atome ;
- vue ;
- scène ;
- template.

## 2.6 Capture / caméra / microphone

Exemples :

> À 14 h, active la caméra et enregistre pendant 30 secondes.

> Toutes les heures, prends une photo.

> De 8 h à 18 h, prends une image toutes les 10 minutes pour créer un time-lapse.

Paramètres possibles :

- caméra ;
- microphone ;
- appareil cible ;
- durée ;
- fréquence ;
- résolution ;
- source ;
- emplacement de sauvegarde ;
- nommage ;
- arrêt automatique.

Les permissions doivent être demandées de façon explicite et conforme aux limitations de la plateforme.

## 2.7 Script

Pouvoir programmer l’exécution d’un script autorisé.

Paramètres :

- script ;
- arguments ;
- environnement ;
- timeout ;
- droits ;
- comportement en cas d’erreur ;
- journal d’exécution.

Aucun script arbitraire ne doit contourner les limites de sécurité ou de permission d’**atome**.

## 2.8 Scénario eVe

Un scénario enregistré dans **eVe** doit être sélectionnable comme cible d’un événement temporel.

Exemple :

> Tous les lundis à 8 h, exécute le scénario « Préparation studio ».

Un scénario peut lui-même contenir plusieurs étapes :

1. ouvrir un projet ;
2. configurer des outils ;
3. activer une caméra ;
4. lancer un enregistrement ;
5. attendre ;
6. exporter ;
7. notifier l’utilisateur.

Le calendrier déclenche le scénario ; **eVe** orchestre son déroulement.

## 2.9 Template

Un template doit pouvoir être programmé comme n’importe quelle autre cible.

Exemple :

> Tous les matins à 7 h, crée une nouvelle instance du template « Journal ».

---

# 3. Récurrence

Le moteur doit prendre en charge au minimum :

- aucune récurrence ;
- toutes les X minutes ;
- toutes les X heures ;
- quotidien ;
- jours ouvrés ;
- hebdomadaire ;
- certains jours de la semaine ;
- mensuel ;
- annuel ;
- intervalle personnalisé ;
- nombre limité d’occurrences ;
- date de fin ;
- période active.

Exemples :

- tous les lundis à 09:00 ;
- lundi, mercredi et vendredi à 18:30 ;
- chaque jour pendant 30 jours ;
- toutes les 10 minutes de 08:00 à 18:00 ;
- le premier lundi de chaque mois.

Tester également :

- changement d’heure été/hiver ;
- changement de fuseau horaire ;
- appareil éteint au moment du déclenchement ;
- **atome** fermé ;
- action manquée ;
- plusieurs événements à la même seconde.

---

# 4. Précision temporelle

Le test doit mesurer la différence entre :

- heure programmée ;
- heure réelle de déclenchement ;
- heure réelle de début d’exécution.

Objectif de référence lorsque la plateforme le permet :

- déclenchement à la seconde près.

Ne pas masquer les limites des OS ou navigateurs.

Le test doit produire un rapport indiquant la précision réellement obtenue sur :

- Web ;
- macOS/Tauri ;
- iOS/Tauri/WKWebView ;
- application active ;
- arrière-plan ;
- écran verrouillé ;
- sortie de veille.

---

# 5. Recherche centrale des outils, templates et scénarios

## Décision UX

**Ne pas extraire les outils depuis les toolboxes existantes.**

Cette mécanique créerait des conflits inutiles avec :

- les sliders ;
- les gestes de drag ;
- le menu fixe inférieur ;
- les menus contextuels ;
- les actions déjà attachées au clic long.

La source unique d’ajout est une **recherche centrale**.

Cette recherche doit pouvoir retourner :

- outils ;
- applications ;
- projets ;
- fichiers ;
- médias ;
- templates ;
- scénarios eVe ;
- scripts autorisés ;
- actions système disponibles ;
- commandes enregistrées.

---

# 6. Système d’extraction depuis la recherche

La recherche affiche les résultats sous forme de liste ou de grille.

Lorsqu’un résultat est glissé hors de la liste :

1. le résultat se transforme visuellement en **tuile carrée / symbole d’outil** ;
2. cette tuile représente une **référence**, jamais l’objet original ;
3. la tuile peut être déposée dans une cible compatible.

Cibles possibles :

- calendrier ;
- menu contextuel ;
- zone de composition de scénario ;
- autre emplacement compatible à définir ultérieurement.

Le système doit utiliser le même geste quelle que soit la nature de l’objet recherché.

Exemples :

- rechercher « caméra » → glisser « Caméra » dans le calendrier ;
- rechercher « Projet A » → glisser le projet à 09:00 ;
- rechercher « Time-lapse » → glisser le template/scénario à 08:00 ;
- rechercher « Export vidéo » → glisser l’action dans un scénario ;
- rechercher un outil → le déposer dans le menu contextuel pour personnaliser ce menu.

---

# 7. Filtrage de la recherche

La recherche doit pouvoir être filtrée par modules/catégories.

Exemples de filtres :

- Tout ;
- Outils ;
- Applications ;
- Projets ;
- Documents ;
- Médias ;
- Templates ;
- Scénarios ;
- Scripts ;
- Actions système.

Prévoir une architecture extensible : l’ajout d’un nouveau type de ressource ne doit pas nécessiter de refaire le calendrier.

---

# 8. Dépôt dans le calendrier

Lorsqu’un objet est déposé dans une cellule temporelle :

1. créer immédiatement un brouillon d’événement ;
2. préremplir l’heure depuis la position de dépôt ;
3. préremplir l’action et la cible ;
4. ouvrir l’édition contextuelle minimale ;
5. proposer les paramètres utiles à ce type d’action ;
6. permettre la validation immédiate.

Exemple :

Caméra déposée sur 14:00 :

- Heure : 14:00
- Action : caméra
- Commande : enregistrer
- Durée : à définir
- Récurrence : aucune
- Notification : optionnelle

Éviter les boîtes de dialogue lourdes.

---

# 9. Création sans drag & drop

Le drag & drop n’est pas obligatoire.

Le calendrier doit également permettre :

`Ajouter → Rechercher une action`

Puis :

1. recherche ;
2. sélection ;
3. configuration ;
4. programmation.

Cette voie est indispensable sur les interfaces tactiles ou dans les contextes où le drag est peu pratique.

---

# 10. Tags visuels dans le calendrier

Chaque événement doit afficher des tags/icônes permettant de comprendre rapidement sa nature.

Exemples :

- alarme ;
- rendez-vous ;
- caméra ;
- audio ;
- script ;
- application ;
- scénario ;
- projet ;
- récurrent ;
- notification ;
- automatique ;
- action nécessitant une permission.

Les tags doivent être informatifs sans surcharger l’interface.

Prévoir une logique de priorité si un événement possède plusieurs attributs.

---

# 11. Création via eVe / MCP

Les commandes en langage naturel doivent produire les mêmes objets que l’interface.

Exemples de tests :

> Mets une alarme demain à 8 h 59.

> Tous les lundis à 9 h, ouvre le projet Studio.

> À 18 h, lance l’application X.

> Prends une photo toutes les 10 minutes entre 8 h et 18 h demain.

> Lance le scénario Préparation Studio vendredi à 17 h.

> Ajoute un rendez-vous coiffeur mardi à 15 h avec un rappel 30 minutes avant.

> Supprime l’alarme de demain matin.

> Désactive l’action récurrente du lundi sans la supprimer.

Après chaque commande, vérifier que l’événement apparaît correctement dans le calendrier.

---

# 12. Modification et suppression

Toute action programmée doit pouvoir être :

- consultée ;
- modifiée ;
- déplacée ;
- dupliquée ;
- activée ;
- désactivée ;
- supprimée.

Pour un événement récurrent, proposer :

- cette occurrence ;
- cette occurrence et les suivantes ;
- toute la série.

---

# 13. Permissions et sécurité

Avant de permettre une action automatisée sensible, vérifier les autorisations nécessaires.

Exemples :

- caméra ;
- microphone ;
- fichiers ;
- ouverture d’application ;
- notifications ;
- exécution de scripts ;
- accès réseau ;
- automatisation système.

Une programmation ne doit jamais donner à l’action davantage de droits que ceux dont dispose déjà l’utilisateur ou **atome**.

Si une action ne peut pas être exécutée :

- ne pas échouer silencieusement ;
- journaliser la cause ;
- afficher un état clair ;
- proposer une correction si elle est possible.

---

# 14. États d’un événement

Prévoir au minimum :

- brouillon ;
- programmé ;
- actif ;
- en attente ;
- en cours ;
- exécuté ;
- manqué ;
- échoué ;
- désactivé ;
- annulé.

---

# 15. Historique d’exécution

Pour chaque action automatisée, enregistrer :

- heure prévue ;
- heure de déclenchement ;
- heure d’exécution ;
- résultat ;
- durée ;
- erreur éventuelle ;
- plateforme ;
- état de l’application ;
- éventuel retard.

Ce journal est indispensable pour les tests de précision et de fiabilité.

---

# 16. Batterie de tests fonctionnels

Créer une suite de tests couvrant au minimum :

### Test A — Alarme simple
- créer une alarme à +1 minute ;
- vérifier déclenchement ;
- arrêter ;
- supprimer.

### Test B — Alarme à la seconde
- programmer une alarme à une seconde précise ;
- mesurer l’écart réel.

### Test C — Rendez-vous
- créer un rendez-vous ;
- ajouter un rappel ;
- modifier ;
- supprimer.

### Test D — Récurrence hebdomadaire
- créer une action tous les lundis ;
- vérifier la série ;
- modifier une occurrence ;
- modifier toute la série.

### Test E — Ouverture de projet
- programmer l’ouverture d’un projet ;
- vérifier la bonne cible.

### Test F — Ouverture de contenu
- programmer l’ouverture d’une image, d’un document et d’un média.

### Test G — Application
- programmer le lancement d’une application compatible ;
- vérifier les limites par plateforme.

### Test H — Caméra
- programmer une capture photo ;
- vérifier permission, déclenchement et fichier généré.

### Test I — Enregistrement
- programmer un enregistrement vidéo ou audio de durée déterminée.

### Test J — Time-lapse
- créer une séquence récurrente courte ;
- vérifier plusieurs captures successives.

### Test K — Script
- programmer un script de test sans danger ;
- vérifier paramètres, résultat et logs.

### Test L — Scénario eVe
- programmer un scénario multi-étapes ;
- vérifier ordre et exécution complète.

### Test M — Création par langage naturel
- créer les mêmes événements via eVe/MCP ;
- comparer les objets générés avec ceux créés par l’interface.

### Test N — Suppression par langage naturel
- supprimer une alarme via eVe ;
- vérifier disparition dans le calendrier.

### Test O — Concurrence
- programmer plusieurs actions à la même seconde ;
- vérifier la politique d’exécution.

### Test P — Arrière-plan
- tester application ouverte, arrière-plan, verrouillage et sortie de veille.

### Test Q — Récupération après interruption
- fermer **atome** avant l’heure prévue ;
- relancer ;
- vérifier le comportement des actions manquées.

---

# 17. Tests de la recherche et de l’extraction

Tester :

1. recherche d’un outil ;
2. recherche d’un projet ;
3. recherche d’un template ;
4. recherche d’un scénario eVe ;
5. filtres ;
6. drag depuis les résultats ;
7. transformation en tuile carrée ;
8. dépôt dans le calendrier ;
9. dépôt dans le menu contextuel ;
10. annulation du drag ;
11. cible incompatible ;
12. tactile ;
13. souris ;
14. stylet si disponible.

Le drag ne doit jamais supprimer la ressource originale.

---

# 18. Critères UX

Le système doit respecter les principes d’**atome** :

- interface zen ;
- minimum de contrôles permanents ;
- pas de palettes flottantes inutiles ;
- mobile-first ;
- manipulation directe ;
- cohérence tactile/souris ;
- recherche centrale ;
- mêmes concepts dans l’interface et dans eVe.

Éviter toute nouvelle gestuelle cachée si une interaction explicite et universelle est possible.

---

# 19. Compatibilité avec Mystic et menus contextuels

**Mystic** reste un menu contextuel, pas la source universelle d’extraction.

Le menu fixe du bas reste fixe et n’a pas vocation à être modifié par extraction directe.

La recherche centrale est la source de référence pour récupérer un outil et le déposer ailleurs.

Une ressource issue de la recherche peut notamment être déposée dans le menu contextuel si l’utilisateur souhaite personnaliser ce menu.

Ne pas réintroduire Flower/Flowers : l’ancien système est déprécié.

---

# 20. Travail demandé à Codex

## Phase 1 — Audit

Avant toute modification :

1. analyser l’implémentation actuelle du calendrier ;
2. analyser le système de récurrence existant ;
3. identifier le stockage actuel des événements ;
4. identifier le système d’alarme/notification existant ;
5. identifier les mécanismes eVe/MCP concernés ;
6. identifier le registre actuel des outils ;
7. identifier les mécanismes de recherche disponibles ;
8. identifier les limitations Web/Tauri/iOS/macOS ;
9. lister les fichiers concernés ;
10. proposer les modifications minimales nécessaires.

Ne pas modifier le code avant d’avoir produit ce diagnostic.

## Phase 2 — Modèle unifié

Concevoir le modèle générique d’événement temporel et montrer comment les événements existants seront migrés ou adaptés.

Le modèle doit être extensible et ne pas être couplé à une action particulière.

## Phase 3 — Moteur d’exécution

Créer ou adapter un moteur capable de :

- planifier ;
- déclencher ;
- répéter ;
- annuler ;
- journaliser ;
- récupérer après interruption ;
- déléguer une action à l’outil ou au scénario correspondant.

## Phase 4 — Recherche centrale

Créer ou adapter une recherche unifiée capable de retourner toutes les ressources planifiables et déplaçables.

## Phase 5 — Drag & drop

Implémenter le drag depuis la recherche avec transformation en tuile/référence et dépôt vers une cible compatible.

Ne pas modifier les gestes internes des toolboxes existantes.

## Phase 6 — Calendrier

Adapter l’interface pour :

- recevoir une ressource par drag ;
- rechercher une action directement ;
- afficher les tags ;
- configurer récurrence et paramètres ;
- afficher les états ;
- modifier/supprimer les événements.

## Phase 7 — eVe/MCP

Créer les commandes nécessaires afin que toute opération disponible dans l’interface soit également possible par eVe/MCP.

## Phase 8 — Tests

Implémenter la batterie de tests décrite dans ce document.

Produire un rapport de résultats par plateforme.

---

# 21. Règles de réalisation

- Ne pas créer de logique parallèle inutile.
- Ne pas dupliquer les mécanismes calendrier / eVe / MCP.
- Ne pas lier le moteur à Mystic.
- Ne pas modifier les gestes des toolboxes pour permettre l’extraction.
- Utiliser la recherche comme point d’entrée universel.
- Toute ressource glissée doit être une référence ou une instance, jamais un déplacement destructif de l’original.
- Préserver la modularité du framework.
- Respecter les garde-fous et le périmètre des fichiers définis dans la documentation du projet.
- Avant chaque modification, lire les fichiers d’instructions du projet, notamment `Agent.md`, `Work Method.md` et les documents de cadrage applicables.
- Signaler clairement tout comportement impossible à garantir sur une plateforme avant de proposer un contournement.
- Ne pas simuler une précision à la seconde si le système d’exploitation ne peut pas la garantir.

---

# 22. Critères de validation finale

La tâche est validée uniquement si :

1. les rendez-vous classiques continuent à fonctionner ;
2. les alarmes simples fonctionnent ;
3. les récurrences fonctionnent ;
4. les actions programmées fonctionnent ;
5. les scénarios eVe peuvent être programmés ;
6. les templates peuvent être programmés ;
7. la recherche retourne les ressources prévues ;
8. une ressource peut être glissée depuis la recherche vers le calendrier ;
9. les tags identifient correctement les événements ;
10. l’interface et eVe/MCP produisent la même représentation interne ;
11. suppression, modification et désactivation fonctionnent ;
12. l’historique d’exécution est consultable ;
13. les limites par plateforme sont documentées ;
14. la précision réelle de déclenchement est mesurée ;
15. aucune régression des toolboxes, Mystic ou menus contextuels n’est introduite.

---

# Prompt d’exécution synthétique pour Codex

> Analyse puis implémente dans **atome / eVe** un système unifié d’événements temporels permettant au calendrier de gérer rendez-vous, alarmes, rappels, actions, outils, applications, projets, médias, scripts, templates et scénarios eVe. N’introduis pas de moteurs séparés : l’interface, eVe et MCP doivent utiliser exactement le même modèle `ScheduledEvent` et le même moteur de planification/exécution. Conserve les récurrences existantes lorsqu’elles sont correctes et étends-les si nécessaire. Ajoute une recherche centrale de ressources ; cette recherche devient l’unique source d’extraction d’outils/templates/scénarios. Lorsqu’un résultat est glissé hors de la recherche, transforme-le en tuile/référence déposable dans le calendrier ou une cible compatible. Ne modifie pas les gestes des toolboxes existantes et ne crée pas de système d’extraction depuis celles-ci. Dans le calendrier, permettre également `Ajouter → Rechercher une action` sans drag & drop. Ajouter tags visuels, états, permissions, historique d’exécution, modification/suppression/désactivation et gestion des séries récurrentes. Tester la précision temporelle, y compris à la seconde lorsque la plateforme le permet, ainsi que Web, macOS/Tauri, iOS/Tauri/WKWebView, arrière-plan, verrouillage et sortie de veille. Implémente la batterie de tests définie dans ce document et fournis un rapport de résultats et de limitations par plateforme. Commence impérativement par un audit des fichiers et de l’architecture existante, liste les fichiers concernés et propose le plan de modification avant tout changement de code.
